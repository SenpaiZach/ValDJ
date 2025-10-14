import { Orchestrator } from '../dist/orchestrator/orchestrator.js';
import { ConfigService } from '../dist/config/config.service.js';
import { ValorantAdapter } from '../dist/overwolf/valorantAdapter.js';

(async function () {
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
  console.info('Valorant Spotify Companion orchestrator started (Overwolf background)');
})();
