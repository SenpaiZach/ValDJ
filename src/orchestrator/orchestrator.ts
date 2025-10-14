import { ConfigService } from "../config/config.service";
import { AppConfigV1, EventConfig, EventKey } from "../config/config.schema";
import { ValorantAdapter, NormalizedEvent } from "../overwolf/valorantAdapter";
import { PlaybackAction, RuleEngine, RuleEngineOptions } from "../rules/ruleEngine";
import { MockSpotifyClient, SpotifyClient, SpotifyConnectClient, SpotifyWebSdkClient } from "../spotify/spotifyClient";

const env: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export interface OrchestratorOptions {
  configService: ConfigService;
  valorantAdapter: ValorantAdapter;
}

export class Orchestrator {
  private config!: AppConfigV1;
  private ruleEngine!: RuleEngine;
  private spotifyClient!: SpotifyClient;
  private unsubscribeConfig?: () => void;
  private eventListener: (event: NormalizedEvent) => void = () => undefined;

  constructor(private readonly options: OrchestratorOptions) {}

  async start(): Promise<void> {
    await this.loadConfig();
    await this.initSpotify();
    await this.options.valorantAdapter.start();
    this.eventListener = (event) => void this.handleEvent(event);
    this.options.valorantAdapter.on("event", this.eventListener);

    this.unsubscribeConfig = this.options.configService.onChange((config) => this.onConfigChange(config));
  }

  async stop(): Promise<void> {
    this.unsubscribeConfig?.();
    this.options.valorantAdapter.off("event", this.eventListener);
    this.options.valorantAdapter.removeAllListeners();
  }

  private async loadConfig(): Promise<void> {
    const config = await this.options.configService.load();
    if (config.version !== "1.0") {
      throw new Error(`Unsupported config version ${config.version}`);
    }
    this.config = config;
    this.ruleEngine = new RuleEngine(this.ruleOptionsFromConfig(config));
  }

  private async initSpotify(): Promise<void> {
    this.spotifyClient = this.createSpotifyClient();
    await this.spotifyClient.ensureDevice();
    const activeProfile = this.config.profiles[this.config.activeProfile];
    if (activeProfile?.volumeScale !== undefined) {
      await this.spotifyClient.setVolume(activeProfile.volumeScale);
    }
  }

  private createSpotifyClient(): SpotifyClient {
    if (this.config.developer.mockMode) {
      return new MockSpotifyClient();
    }

    const credentials = {
      accessToken: env.SPOTIFY_ACCESS_TOKEN ?? "",
      refreshToken: env.SPOTIFY_REFRESH_TOKEN,
      clientId: env.SPOTIFY_CLIENT_ID ?? ""
    };

    if (!credentials.accessToken) {
      throw new Error("Missing Spotify access token. Authorize before starting orchestrator.");
    }

    const baseOptions = {
      credentials,
      preferredDeviceId: this.config.spotify.preferredDeviceId ?? undefined
    };

    if (this.config.spotify.playbackMode === "remote_device") {
      return new SpotifyConnectClient(baseOptions);
    }
    return new SpotifyWebSdkClient(baseOptions);
  }

  private async handleEvent(event: NormalizedEvent): Promise<void> {
    if (!this.config.events[event.key]?.enabled) {
      return;
    }

    if (this.config.compliance.riotStrictMode && !this.isApprovedEvent(event.key)) {
      return;
    }

    const action = this.ruleEngine.evaluate(event);
    if (!action) {
      return;
    }

    await this.dispatch(action);
  }

  private async dispatch(action: PlaybackAction): Promise<void> {
    if (action.stingerUri) {
      await this.spotifyClient.queueStinger(action.stingerUri);
    }

    await this.spotifyClient.play(action);
  }

  private onConfigChange(config: AppConfigV1): void {
    this.config = config;
    this.ruleEngine.updateOptions(this.ruleOptionsFromConfig(config));
  }

  private ruleOptionsFromConfig(config: AppConfigV1): RuleEngineOptions {
    const events = config.events as Record<EventKey, EventConfig>;
    return {
      activeProfileId: config.activeProfile,
      profiles: config.profiles,
      events
    };
  }

  private isApprovedEvent(event: EventKey): boolean {
    return [
      "round_start",
      "round_end_win",
      "round_end_loss",
      "ace",
      "clutch_1vX",
      "multikill",
      "headshot",
      "death",
      "spike_planted",
      "spike_defused",
      "spike_detonated",
      "match_victory",
      "match_defeat",
      "match_draw"
    ].includes(event);
  }
}
