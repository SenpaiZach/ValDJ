import { describe, expect, it, beforeEach } from "vitest";
import { RuleEngine, RuleEngineOptions } from "../src/rules/ruleEngine";
import { NormalizedEvent } from "../src/overwolf/valorantAdapter";

const baseOptions: RuleEngineOptions = {
  activeProfileId: "hype",
  profiles: {
    hype: {
      name: "Hype",
      energyBias: 0,
      valenceBias: 0,
      volumeScale: 1
    }
  },
  events: {
    round_start: {
      enabled: true,
      playlistUris: ["spotify:playlist:round-start"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "duck"
    },
    round_end_win: {
      enabled: true,
      playlistUris: ["spotify:playlist:round-win"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    round_end_loss: {
      enabled: true,
      playlistUris: ["spotify:playlist:round-loss"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    ace: {
      enabled: true,
      playlistUris: ["spotify:playlist:ace"],
      cooldownMs: 2000,
      debounceMs: 0,
      interruptPolicy: "immediate",
      trackUris: ["spotify:track:ace-track"],
      stingerUri: "spotify:track:stinger"
    },
    clutch_1vX: {
      enabled: true,
      playlistUris: ["spotify:playlist:clutch"],
      cooldownMs: 2000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    multikill: {
      enabled: true,
      playlistUris: ["spotify:playlist:multikill"],
      cooldownMs: 2000,
      debounceMs: 0,
      interruptPolicy: "duck",
      multikillWindowMs: 5000
    },
    headshot: {
      enabled: true,
      playlistUris: ["spotify:playlist:headshot"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "duck"
    },
    death: {
      enabled: true,
      playlistUris: ["spotify:playlist:death"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    spike_planted: {
      enabled: true,
      playlistUris: ["spotify:playlist:spike-planted"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "duck"
    },
    spike_defused: {
      enabled: true,
      playlistUris: ["spotify:playlist:spike-defused"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    spike_detonated: {
      enabled: true,
      playlistUris: ["spotify:playlist:spike-detonated"],
      cooldownMs: 1000,
      debounceMs: 0,
      interruptPolicy: "immediate"
    },
    match_victory: {
      enabled: true,
      playlistUris: ["spotify:playlist:match-victory"],
      cooldownMs: 5000,
      debounceMs: 0,
      interruptPolicy: "immediate"
    },
    match_defeat: {
      enabled: true,
      playlistUris: ["spotify:playlist:match-defeat"],
      cooldownMs: 5000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    },
    match_draw: {
      enabled: true,
      playlistUris: ["spotify:playlist:match-draw"],
      cooldownMs: 5000,
      debounceMs: 0,
      interruptPolicy: "crossfade"
    }
  }
};

describe("RuleEngine", () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine(baseOptions);
  });

  it("returns action for first event and enforces cooldown", () => {
    const event: NormalizedEvent = { key: "round_start", timestamp: Date.now() };
    const action = engine.evaluate(event, event.timestamp);
    expect(action?.uri).toBe("spotify:playlist:round-start");

    const suppressed = engine.evaluate({ key: "round_start", timestamp: event.timestamp + 100 }, event.timestamp + 100);
    expect(suppressed).toBeNull();
  });

  it("requires multikill streak before triggering", () => {
    const ts = Date.now();
    const first = engine.evaluate(
      { key: "multikill", payload: { count: 1 }, timestamp: ts },
      ts
    );
    expect(first).toBeNull();

    const second = engine.evaluate(
      { key: "multikill", payload: { count: 2 }, timestamp: ts + 1000 },
      ts + 1000
    );
    expect(second?.uri).toBe("spotify:playlist:multikill");
  });
});
