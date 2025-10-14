import "dotenv/config";
import http from "http";
import https from "https";
import { randomBytes, createHash } from "crypto";
import { URL } from "url";
import path from "path";
import { promises as fs } from "fs";
import { exec } from "child_process";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import selfsigned from "selfsigned";
import { ConfigService } from "../src/config/config.service";

const DEFAULT_LOCAL_PORT = 42813;
const DEFAULT_CALLBACK_PATH = "/auth/callback";

const configuredRedirect = process.env.SPOTIFY_REDIRECT_URI;
const fallbackRedirect = `http://127.0.0.1:${DEFAULT_LOCAL_PORT}${DEFAULT_CALLBACK_PATH}`;
const remoteRedirectUrl = new URL(configuredRedirect ?? fallbackRedirect);

const localScheme = process.env.SPOTIFY_LOCAL_REDIRECT_SCHEME ?? "http";
const localHost = process.env.SPOTIFY_LOCAL_REDIRECT_HOST ?? "127.0.0.1";
const localPort = Number(process.env.SPOTIFY_LOCAL_REDIRECT_PORT ?? DEFAULT_LOCAL_PORT);
const localPath = process.env.SPOTIFY_LOCAL_REDIRECT_PATH ?? (remoteRedirectUrl.pathname || DEFAULT_CALLBACK_PATH);
const localCallbackUrl = `${localScheme}://${localHost}:${localPort}${localPath}`;

const effectiveRedirectUrl = new URL(remoteRedirectUrl.toString());
if (!configuredRedirect && isLoopbackHost(effectiveRedirectUrl.hostname)) {
  effectiveRedirectUrl.protocol = `${localScheme}:`;
  effectiveRedirectUrl.hostname = localHost;
  effectiveRedirectUrl.port = String(localPort);
  effectiveRedirectUrl.pathname = localPath;
}
const redirectUriForSpotify = effectiveRedirectUrl.toString();

const isRemoteRedirect = !isLoopbackHost(effectiveRedirectUrl.hostname) || effectiveRedirectUrl.protocol === "https:";
const useManualMode = (process.env.SPOTIFY_AUTH_FLOW ?? "server").toLowerCase() === "manual";

const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
if (!clientId) {
  console.error("Missing SPOTIFY_CLIENT_ID. Set it in your environment or .env file before running auth.");
  process.exit(1);
}

const configService = new ConfigService();
const config = await configService.load();
const scopes = config.spotify.scopes.length
  ? config.spotify.scopes
  : [
      "user-read-email",
      "user-read-private",
      "user-read-playback-state",
      "user-modify-playback-state"
    ];

const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);
const statePayload = {
  nonce: base64Url(randomBytes(16)),
  localCallbackUrl
};
const state = encodeState(statePayload);

const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
authorizeUrl.search = new URLSearchParams({
  client_id: clientId,
  response_type: "code",
  redirect_uri: redirectUriForSpotify,
  code_challenge_method: "S256",
  code_challenge: codeChallenge,
  scope: scopes.join(" "),
  state
}).toString();

printStartupInstructions(authorizeUrl.toString());
attemptOpen(authorizeUrl.toString());
if (isRemoteRedirect) {
  printRelayGuidance(statePayload.localCallbackUrl, redirectUriForSpotify);
}

try {
  const authorizationCode = useManualMode
    ? await promptForCallbackUrl(state)
    : await waitForLocalCallback(state);

  const tokenData = await exchangeCodeForTokens(authorizationCode, codeVerifier, redirectUriForSpotify);
  await upsertEnvTokens({
    SPOTIFY_ACCESS_TOKEN: tokenData.access_token,
    SPOTIFY_REFRESH_TOKEN: tokenData.refresh_token ?? ""
  });

  console.info("\nSpotify tokens received. The .env file has been updated with the latest values.\n");
  console.info("Access Token:", tokenData.access_token);
  if (tokenData.refresh_token) {
    console.info("Refresh Token:", tokenData.refresh_token);
  } else {
    console.warn(
      "Spotify did not return a refresh token. Ensure this is the first authorization for this client or include refresh-capable scopes."
    );
  }

  process.exit(0);
} catch (error) {
  console.error("\nSpotify authorization flow failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

function printStartupInstructions(url: string): void {
  console.info("\n1. Opening Spotify authorization page. If it does not open automatically, paste this URL into your browser:\n");
  console.info(url);
  console.info("\n2. Approve the scopes, then return here for token exchange.\n");
}

function printRelayGuidance(localUrl: string, remoteUrl: string): void {
  console.info("Remote HTTPS redirect detected.");
  console.info("The helper still listens locally on:", localUrl);
  console.info(
    "Host a relay page that decodes the \"state\" parameter and redirects the browser to the local URL with the same query string."
  );
  console.info("An example HTML relay is available at public/spotify-relay.html. Upload it to your HTTPS domain (e.g., AWS S3 + CloudFront) and point Spotify's redirect URI to it.");
  console.info(`Registered Spotify redirect URI: ${remoteUrl}`);
}

function generateCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64Url(hash);
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeState(payload: { nonce: string; localCallbackUrl: string }): string {
  return base64Url(Buffer.from(JSON.stringify(payload), "utf-8"));
}

function decodeState(value: string): { nonce: string; localCallbackUrl: string } | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as { nonce: string; localCallbackUrl: string };
    if (!parsed.nonce || !parsed.localCallbackUrl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function waitForLocalCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createLocalServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400).end();
          return;
        }
        const requestUrl = new URL(req.url, localCallbackUrl);
        if (requestUrl.pathname !== localPath) {
          res.writeHead(404).end();
          return;
        }

        const returnedState = requestUrl.searchParams.get("state");
        const code = requestUrl.searchParams.get("code");
        const error = requestUrl.searchParams.get("error");

        if (!returnedState) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing state parameter.\n");
          return;
        }

        if (returnedState !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("State mismatch. Close this tab.\n");
          reject(new Error("State mismatch during Spotify auth callback."));
          server.close();
          return;
        }

        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`Authorization failed: ${error}\n`);
          reject(new Error(`Spotify authorization failed with error: ${error}`));
          server.close();
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing authorization code.\n");
          reject(new Error("Missing authorization code in Spotify callback."));
          server.close();
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Spotify authorization complete.</h2><p>You can close this window.</p></body></html>");

        resolve(code);
        server.close();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        server.close();
      }
    });

    server.listen(localPort, localHost, () => {
      console.info(`Listening for Spotify redirect on ${localCallbackUrl}`);
      if (isRemoteRedirect) {
        console.info("Ensure your hosted relay forwards the browser to this local URL once the Spotify redirect fires.");
      }
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

async function promptForCallbackUrl(expectedState: string): Promise<string> {
  console.info("\nManual mode enabled. Paste the full redirect URL (including ?code=...&state=...) from your hosted callback.");
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("Redirect URL: ")).trim();
    if (!answer) {
      throw new Error("No URL provided.");
    }
    const url = new URL(answer);
    const returnedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (!returnedState) {
      throw new Error("Redirect URL missing state parameter.");
    }
    if (returnedState !== expectedState) {
      throw new Error("State mismatch; ensure you pasted the most recent URL.");
    }
    if (error) {
      throw new Error(`Spotify authorization failed with error: ${error}`);
    }
    if (!code) {
      throw new Error("Authorization code missing from URL.");
    }

    return code;
  } finally {
    await rl.close();
  }
}

async function exchangeCodeForTokens(code: string, verifier: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier
    }).toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token endpoint responded with ${response.status}: ${text}`);
  }

  return (await response.json()) as { access_token: string; refresh_token?: string };
}

async function upsertEnvTokens(updates: Record<string, string>): Promise<void> {
  const envPath = path.resolve(process.cwd(), ".env");
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  const entries = new Map<string, string>();
  for (const line of lines) {
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1);
    entries.set(key, value);
  }

  for (const [key, value] of Object.entries(updates)) {
    entries.set(key, value ?? "");
  }

  const nextContent = Array.from(entries.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
    .concat("\n");

  await fs.writeFile(envPath, nextContent, "utf-8");
}

function attemptOpen(url: string): void {
  const platform = process.platform;
  let command: string | null = null;

  if (platform === "win32") {
    command = `start "" "${url}"`;
  } else if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "linux") {
    command = `xdg-open "${url}"`;
  }

  if (!command) {
    return;
  }

  exec(command, (error) => {
    if (error) {
      console.warn("Unable to automatically open browser:", error.message);
    }
  });
}

function createLocalServer(handler: http.RequestListener): http.Server | https.Server {
  if (localScheme === "https") {
    const attrs = selfsigned.generate(
      [{ name: "commonName", value: localHost }],
      { days: 1, keySize: 2048 }
    );
    return https.createServer({ key: attrs.private, cert: attrs.cert }, handler);
  }

  return http.createServer(handler);
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
