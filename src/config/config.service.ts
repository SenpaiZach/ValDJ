import { promises as fs } from "fs";
import path from "path";
import { AppConfig, AppConfigV1, appConfigSchemaV1, configFileSchema } from "./config.schema";

const CONFIG_DIR = path.resolve(process.cwd(), "config");
const CONFIG_FILENAME = "app.config.json";

export type ConfigListener = (config: AppConfig) => void;

export class ConfigService {
  private currentConfig: AppConfig | null = null;
  private listeners = new Set<ConfigListener>();

  constructor(private readonly configPath = path.join(CONFIG_DIR, CONFIG_FILENAME)) {}

  async load(): Promise<AppConfig> {
    const raw = await fs.readFile(this.configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = configFileSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Config validation failed: ${result.error.message}`);
    }

    this.currentConfig = this.ensureDefaults(result.data);
    return this.currentConfig;
  }

  get(): AppConfig {
    if (!this.currentConfig) {
      throw new Error("Config has not been loaded yet");
    }
    return this.currentConfig;
  }

  async save(config: AppConfig): Promise<void> {
    const result = configFileSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Config validation failed: ${result.error.message}`);
    }

    await fs.mkdir(path.dirname(this.configPath), { recursive: true });

    await fs.writeFile(
      this.configPath,
      JSON.stringify(result.data, null, 2),
      "utf-8"
    );

    this.currentConfig = result.data;
    this.broadcast();
  }

  onChange(listener: ConfigListener): () => void {
    this.listeners.add(listener);
    if (this.currentConfig) {
      listener(this.currentConfig);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  private broadcast(): void {
    if (!this.currentConfig) {
      return;
    }
    for (const listener of this.listeners) {
      listener(this.currentConfig);
    }
  }

  private ensureDefaults(config: AppConfig): AppConfig {
    if (config.version === "1.0") {
      return appConfigSchemaV1.parse(config) as AppConfigV1;
    }
    throw new Error(`Unsupported config version: ${config.version}`);
  }
}
