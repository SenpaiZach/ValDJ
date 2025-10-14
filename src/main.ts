import { ConfigService } from "./config/config.service";
import { ValorantAdapter } from "./overwolf/valorantAdapter";
import { Orchestrator } from "./orchestrator/orchestrator";

async function bootstrap(): Promise<void> {
  try {
    const configService = new ConfigService();
    const initialConfig = await configService.load();
    const valorantAdapter = new ValorantAdapter({
      mockMode: initialConfig.developer.mockMode
    });

    const orchestrator = new Orchestrator({
      configService,
      valorantAdapter
    });

    await orchestrator.start();
    console.info("Valorant Spotify Companion orchestrator started");
  } catch (error) {
    console.error("Failed to start orchestrator", error);
  }
}

void bootstrap();
