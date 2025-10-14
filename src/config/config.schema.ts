import { z } from "zod";

export const eventKeyEnum = z.enum([
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
]);

export type EventKey = z.infer<typeof eventKeyEnum>;

const eventConfigSchema = z.object({
  enabled: z.boolean(),
  playlistUris: z.array(z.string().min(1)).min(1),
  trackUris: z.array(z.string()).optional(),
  stingerUri: z.string().optional(),
  cooldownMs: z.number().int().nonnegative(),
  debounceMs: z.number().int().nonnegative(),
  interruptPolicy: z.enum(["never", "duck", "crossfade", "immediate"]),
  multikillWindowMs: z.number().int().positive().optional(),
  minEnergy: z.number().min(0).max(1).optional(),
  maxEnergy: z.number().min(0).max(1).optional(),
  minValence: z.number().min(0).max(1).optional(),
  maxValence: z.number().min(0).max(1).optional()
});

export type EventConfig = z.infer<typeof eventConfigSchema>;

const profileConfigSchema = z.object({
  name: z.string(),
  energyBias: z.number().min(-1).max(1),
  valenceBias: z.number().min(-1).max(1),
  volumeScale: z.number().min(0).max(1),
  overrides: z
    .record(eventKeyEnum, eventConfigSchema.partial())
    .optional()
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;

const ruleNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["filter", "debounce", "cooldown", "map", "action"]),
  params: z.record(z.unknown())
});

const ruleGraphSchema = z.object({
  nodes: z.array(ruleNodeSchema).min(1),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      condition: z.string().optional()
    })
  )
});

export type RuleNode = z.infer<typeof ruleNodeSchema>;
export type RuleGraph = z.infer<typeof ruleGraphSchema>;

export const appConfigSchemaV1 = z.object({
  version: z.literal("1.0"),
  spotify: z.object({
    playbackMode: z.enum(["web_sdk", "remote_device"]),
    preferredDeviceId: z.string().nullable().optional(),
    scopes: z.array(z.string()).default([]),
    crossfadeMs: z.number().int().nonnegative().default(0),
    duckingDb: z.number().max(0).default(-12),
    allowAutoplay: z.boolean().default(false)
  }),
  profiles: z.record(profileConfigSchema),
  activeProfile: z.string(),
  events: z.record(eventKeyEnum, eventConfigSchema),
  rules: ruleGraphSchema,
  privacy: z.object({
    analyticsOptIn: z.boolean().default(false),
    logPII: z.literal(false)
  }),
  compliance: z.object({
    riotStrictMode: z.boolean().default(true),
    overlayEnabled: z.boolean().default(false)
  }),
  ui: z.object({
    locale: z.string().default("en-US"),
    notifications: z.object({
      enableToasts: z.boolean().default(true)
    })
  }),
  developer: z.object({
    loggingLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
    mockMode: z.boolean().default(false)
  })
});

export type AppConfigV1 = z.infer<typeof appConfigSchemaV1>;

export const configFileSchema = appConfigSchemaV1;
export type AppConfig = AppConfigV1;
