import { EventConfig, EventKey, ProfileConfig } from "../config/config.schema";
import { NormalizedEvent } from "../overwolf/valorantAdapter";

export type InterruptPolicy = EventConfig["interruptPolicy"];

export interface PlaybackAction {
  type: "PLAY_PLAYLIST" | "PLAY_TRACK";
  uri: string;
  interruptPolicy: InterruptPolicy;
  stingerUri?: string;
  context: {
    event: EventKey;
    profile: string;
    timestamp: number;
  };
}

export interface RuleEngineOptions {
  activeProfileId: string;
  profiles: Record<string, ProfileConfig>;
  events: Record<EventKey, EventConfig>;
}

export class RuleEngine {
  private cooldowns = new Map<EventKey, number>();
  private debounces = new Map<EventKey, number>();
  private multikillBuckets = new Map<string, { count: number; expiresAt: number }>();

  constructor(private options: RuleEngineOptions) {}

  updateOptions(options: RuleEngineOptions): void {
    this.options = options;
  }

  evaluate(event: NormalizedEvent, now = Date.now()): PlaybackAction | null {
    const eventConfig = this.resolveEventConfig(event.key);
    if (!eventConfig || !eventConfig.enabled) {
      return null;
    }

    if (!this.passDebounce(event.key, eventConfig.debounceMs, now)) {
      return null;
    }

    if (event.key === "multikill" && eventConfig.multikillWindowMs) {
      const streakReady = this.trackMultikill(event, eventConfig.multikillWindowMs, now);
      if (!streakReady) {
        return null;
      }
    }

    if (!this.passCooldown(event.key, eventConfig.cooldownMs, now)) {
      return null;
    }

    const profile = this.options.profiles[this.options.activeProfileId];
    if (!profile) {
      throw new Error(`Active profile '${this.options.activeProfileId}' missing`);
    }

    const uri = eventConfig.trackUris?.[0] ?? eventConfig.playlistUris[0];
    if (!uri) {
      return null;
    }

    return {
      type: eventConfig.trackUris ? "PLAY_TRACK" : "PLAY_PLAYLIST",
      uri,
      interruptPolicy: eventConfig.interruptPolicy,
      stingerUri: eventConfig.stingerUri,
      context: {
        event: event.key,
        profile: profile.name,
        timestamp: now
      }
    };
  }

  private resolveEventConfig(eventKey: EventKey): EventConfig | null {
    const base = this.options.events[eventKey];
    const profile = this.options.profiles[this.options.activeProfileId];
    if (!base || !profile) {
      return null;
    }

    const override = profile.overrides?.[eventKey];
    if (!override) {
      return base;
    }

    return { ...base, ...override };
  }

  private passDebounce(event: EventKey, debounceMs: number, now: number): boolean {
    const last = this.debounces.get(event) ?? 0;
    if (now - last < debounceMs) {
      return false;
    }
    this.debounces.set(event, now);
    return true;
  }

  private passCooldown(event: EventKey, cooldownMs: number, now: number): boolean {
    const last = this.cooldowns.get(event) ?? 0;
    if (now - last < cooldownMs) {
      return false;
    }
    this.cooldowns.set(event, now);
    return true;
  }

  private trackMultikill(event: NormalizedEvent, windowMs: number, now: number): boolean {
    const key = `${event.key}`;
    const bucket = this.multikillBuckets.get(key) ?? { count: 0, expiresAt: 0 };

    if (bucket.expiresAt < now) {
      bucket.count = 0;
    }

    bucket.count += (event.payload?.count as number | undefined) ?? 1;
    bucket.expiresAt = now + windowMs;
    this.multikillBuckets.set(key, bucket);

    return bucket.count >= 2;
  }
}
