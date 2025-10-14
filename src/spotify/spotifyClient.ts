import axios, { AxiosInstance } from "axios";
import { PlaybackAction } from "../rules/ruleEngine";
import { RateLimitError, RateLimitedQueue } from "./rateLimiter";

export interface SpotifyCredentials {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
}

export interface DeviceContext {
  id: string;
  isActive: boolean;
  isRestricted: boolean;
}

export interface SpotifyClient {
  ensureDevice(): Promise<void>;
  play(action: PlaybackAction): Promise<void>;
  queueStinger(uri: string): Promise<void>;
  setVolume(scale: number): Promise<void>;
}

export interface SpotifyClientOptions {
  apiBaseUrl?: string;
  credentials: SpotifyCredentials;
  preferredDeviceId?: string;
}

export abstract class BaseSpotifyClient implements SpotifyClient {
  protected readonly http: AxiosInstance;
  protected readonly queue = new RateLimitedQueue();

  constructor(protected readonly options: SpotifyClientOptions) {
    this.http = axios.create({
      baseURL: options.apiBaseUrl ?? "https://api.spotify.com/v1",
      headers: {
        Authorization: `Bearer ${options.credentials.accessToken}`
      }
    });
  }

  abstract ensureDevice(): Promise<void>;
  abstract play(action: PlaybackAction): Promise<void>;

  async queueStinger(uri: string): Promise<void> {
    await this.enqueue(async () => {
      await this.http.post(
        "/me/player/queue",
        { uri },
        { params: { device_id: this.options.preferredDeviceId } }
      );
    });
  }

  async setVolume(scale: number): Promise<void> {
    const volume = Math.round(Math.min(Math.max(scale * 100, 0), 100));
    await this.enqueue(async () => {
      await this.http.put("/me/player/volume", null, {
        params: {
          volume_percent: volume,
          device_id: this.options.preferredDeviceId
        }
      });
    });
  }

  protected async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.queue.enqueue<T>(async () => {
      try {
        return await task();
      } catch (error: unknown) {
        const axiosLike = error as { response?: { status?: number; headers?: Record<string, unknown> } };
        if (axiosLike.response?.status === 429) {
          const retryAfterHeader = axiosLike.response.headers?.["retry-after"];
          const retryAfter = Number(retryAfterHeader ?? 1) * 1000;
          throw new RateLimitError(retryAfter);
        }
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Unknown Spotify API error");
      }
    });
  }
}

export class SpotifyConnectClient extends BaseSpotifyClient {
  async ensureDevice(): Promise<void> {
    const { data } = (await this.enqueue(() =>
      this.http.get<{ devices: DeviceContext[] }>("/me/player/devices")
    )) as { data: { devices: DeviceContext[] } };
    const devices = data.devices;
    if (!devices.length) {
      throw new Error("No Spotify Connect devices available");
    }

  const preferred = devices.find((device: DeviceContext) => device.id === this.options.preferredDeviceId);
  const target = preferred ?? devices.find((device: DeviceContext) => !device.isRestricted);
    if (!target) {
      throw new Error("No controllable Spotify device found");
    }

    this.options.preferredDeviceId = target.id;

    if (!target.isActive) {
      await this.enqueue(() =>
        this.http.put(
          "/me/player",
          { device_ids: [target.id], play: false }
        )
      );
    }
  }

  async play(action: PlaybackAction): Promise<void> {
    const body = this.resolvePlaybackBody(action);
    await this.enqueue(() =>
      this.http.put("/me/player/play", body, {
        params: { device_id: this.options.preferredDeviceId }
      })
    );
  }

  private resolvePlaybackBody(action: PlaybackAction): Record<string, unknown> {
    if (action.type === "PLAY_TRACK") {
      return { uris: [action.uri] };
    }
    return { context_uri: action.uri };
  }
}

export class SpotifyWebSdkClient extends BaseSpotifyClient {
  private deviceReady = false;

  async ensureDevice(): Promise<void> {
    if (this.deviceReady) {
      return;
    }
    if (typeof window === "undefined") {
      throw new Error("Web Playback SDK requires browser environment");
    }

    await new Promise<void>((resolve, reject) => {
      const player = new window.Spotify.Player({
        name: "Valorant Companion",
        getOAuthToken: (cb) => cb(this.options.credentials.accessToken),
        volume: 0.5
      });

      player.addListener("ready", ({ device_id }) => {
        this.options.preferredDeviceId = device_id;
        this.deviceReady = true;
        resolve();
      });

      player.addListener("not_ready", () => {
        this.deviceReady = false;
      });

      player.addListener("initialization_error", ({ message }) => reject(new Error(message)));
      player.connect();
    });
  }

  async play(action: PlaybackAction): Promise<void> {
    if (!this.deviceReady) {
      await this.ensureDevice();
    }
    const body = action.type === "PLAY_TRACK" ? { uris: [action.uri] } : { context_uri: action.uri };
    await this.enqueue(() =>
      this.http.put("/me/player/play", body, {
        params: { device_id: this.options.preferredDeviceId }
      })
    );
  }
}

export class MockSpotifyClient implements SpotifyClient {
  private history: PlaybackAction[] = [];

  async ensureDevice(): Promise<void> {
    return;
  }

  async play(action: PlaybackAction): Promise<void> {
    this.history.push(action);
    console.info(`[MockSpotify] play ${action.uri}`, action.context);
  }

  async queueStinger(uri: string): Promise<void> {
    console.info(`[MockSpotify] stinger ${uri}`);
  }

  async setVolume(scale: number): Promise<void> {
    console.info(`[MockSpotify] volume ${(scale * 100).toFixed(0)}%`);
  }

  getPlaybackHistory(): PlaybackAction[] {
    return [...this.history];
  }
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => {
        connect(): void;
        addListener(event: string, handler: (details: any) => void): void;
      };
    };
  }
}
