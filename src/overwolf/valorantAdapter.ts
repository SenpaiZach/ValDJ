import { EventKey } from "../config/config.schema";

export type ValorantRawEvent = {
  name: string;
  data: string;
  timestamp: number;
};

export interface NormalizedEvent {
  key: EventKey;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export interface EventHealthSnapshot {
  feature: string;
  status: "healthy" | "degraded" | "unavailable";
  lastUpdated: number;
}

export interface ValorantAdapterOptions {
  mockMode?: boolean;
}

type ListenerMap = {
  event: Set<(event: NormalizedEvent) => void>;
  health: Set<(health: EventHealthSnapshot[]) => void>;
};

export class ValorantAdapter {
  private readonly listeners: ListenerMap = {
    event: new Set(),
    health: new Set()
  };
  private health: EventHealthSnapshot[] = [];
  private started = false;

  constructor(private readonly options: ValorantAdapterOptions = {}) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    if (this.options.mockMode) {
      return;
    }

    if (typeof overwolf !== "undefined") {
      // Request the features we depend on
      try {
  overwolf.games.events.setRequiredFeatures([
          "match_info",
          "kill",
          "death",
          "assists",
          "round_start",
          "round_end",
          "match_state",
          "bomb"
        ], (info: { status: string; supportedFeatures?: string[]; error?: string }) => {
          // Optional: log or update health based on info.status
          // console.info('setRequiredFeatures', info);
        });
      } catch {}

      overwolf.games.events.onNewEvents.addListener((event) => {
        if (!event || !event.events) {
          return;
        }
        for (const rawEvent of event.events as ValorantRawEvent[]) {
          const normalized = this.normalize(rawEvent);
          if (normalized) {
            this.emit("event", normalized);
          }
        }
      });

      overwolf.games.events.onInfoUpdates2.addListener((update) => {
        const derived = this.tryDeriveEvents(update.info || {});
        for (const event of derived) {
          this.emit("event", event);
        }
      });
    }
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
  }

  pushMockEvent(event: NormalizedEvent): void {
    if (!this.options.mockMode) {
      throw new Error("Mock events are only allowed in mock mode");
    }
    this.emit("event", event);
  }

  updateHealth(snapshot: EventHealthSnapshot[]): void {
    this.health = snapshot;
    this.emit("health", snapshot);
  }

  getHealth(): EventHealthSnapshot[] {
    return this.health;
  }

  on(event: "event", listener: (payload: NormalizedEvent) => void): this;
  on(event: "health", listener: (payload: EventHealthSnapshot[]) => void): this;
  on(
    event: "event" | "health",
    listener: ((payload: NormalizedEvent) => void) | ((payload: EventHealthSnapshot[]) => void)
  ): this {
    this.listeners[event].add(listener as never);
    return this;
  }

  off(event: "event", listener: (payload: NormalizedEvent) => void): this;
  off(event: "health", listener: (payload: EventHealthSnapshot[]) => void): this;
  off(
    event: "event" | "health",
    listener: ((payload: NormalizedEvent) => void) | ((payload: EventHealthSnapshot[]) => void)
  ): this {
    this.listeners[event].delete(listener as never);
    return this;
  }

  removeAllListeners(event?: "event" | "health"): this {
    if (event) {
      this.listeners[event].clear();
    } else {
      this.listeners.event.clear();
      this.listeners.health.clear();
    }
    return this;
  }

  private emit(event: "event" | "health", payload: NormalizedEvent | EventHealthSnapshot[]): void {
    for (const listener of this.listeners[event]) {
      listener(payload as never);
    }
  }

  private normalize(raw: ValorantRawEvent): NormalizedEvent | null {
    try {
      switch (raw.name) {
        case "match_start":
        case "round_start":
          return { key: "round_start", timestamp: raw.timestamp };
        case "match_end":
        case "match_outcome": {
          const payload = JSON.parse(raw.data || "{}") as { result?: string };
          if (payload.result === "victory") {
            return { key: "match_victory", timestamp: raw.timestamp };
          }
          if (payload.result === "defeat") {
            return { key: "match_defeat", timestamp: raw.timestamp };
          }
          return { key: "match_draw", timestamp: raw.timestamp };
        }
        case "kill": {
          const payload = JSON.parse(raw.data || "{}") as { headshot?: "1" | "0"; multiKills?: number };
          if (payload.headshot === "1") {
            return { key: "headshot", timestamp: raw.timestamp };
          }
          if (payload.multiKills && payload.multiKills > 1) {
            return {
              key: "multikill",
              payload: { count: payload.multiKills },
              timestamp: raw.timestamp
            };
          }
          return { key: "death", timestamp: raw.timestamp };
        }
        case "death":
          return { key: "death", timestamp: raw.timestamp };
        case "bomb_planted":
          return { key: "spike_planted", timestamp: raw.timestamp };
        case "bomb_defused":
          return { key: "spike_defused", timestamp: raw.timestamp };
        case "bomb_exploded":
          return { key: "spike_detonated", timestamp: raw.timestamp };
        default:
          return null;
      }
    } catch (error) {
      console.warn("Failed to normalize event", raw, error);
      return null;
    }
  }

  private tryDeriveEvents(info: Record<string, unknown>): NormalizedEvent[] {
    const derived: NormalizedEvent[] = [];
    if (info["round_outcome"] === "win") {
      derived.push({ key: "round_end_win", timestamp: Date.now() });
    } else if (info["round_outcome"] === "loss") {
      derived.push({ key: "round_end_loss", timestamp: Date.now() });
    }
    return derived;
  }
}

declare const overwolf: {
  games: {
    events: {
      setRequiredFeatures: (
        features: string[],
        callback: (info: { status: string; supportedFeatures?: string[]; error?: string }) => void
      ) => void;
      onNewEvents: { addListener: (handler: (data: { events: ValorantRawEvent[] }) => void) => void };
      onInfoUpdates2: { addListener: (handler: (data: { info: Record<string, unknown> }) => void) => void };
    };
  };
};
