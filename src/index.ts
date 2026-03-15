/**
 * Pet IoT Edge Gateway
 * Main entry point
 */

import { config } from './config/index.js';
import { mqttGateway } from './mqtt/index.js';
import { syncService } from './sync/index.js';
import { storage } from './storage/index.js';

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         🐾 Pet IoT Edge Gateway v1.0.0 🐾             ║
╠═══════════════════════════════════════════════════════════╣
║  Gateway ID: ${config.gatewayId.padEnd(39)}║
║  Kennel ID: ${config.kennelId.padEnd(39)}║
║  MQTT:      ${`${config.mqttHost}:${config.mqttPort}`.padEnd(39)}║
║  API:       ${config.apiUrl.padEnd(39)}║
║  SQLite:    ${config.sqlitePath.padEnd(39)}║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Connect to local MQTT broker
    await mqttGateway.connect();
    console.log('[Gateway] MQTT connected');

    // Register gateway with backend
    await syncService.registerGateway();

    // Start sync service
    syncService.start();
    console.log('[Gateway] Sync service started');

    // Listen for device events
    mqttGateway.on('deviceEvent', (event) => {
      console.log(`[Gateway] Device event: ${event.deviceId} - ${event.eventType}`);
    });

    mqttGateway.on('heartbeat', (data) => {
      console.log(`[Gateway] Heartbeat from: ${data.deviceId}`);
    });

    console.log('[Gateway] =========================================');
    console.log('[Gateway] Gateway is running!');
    console.log('[Gateway] =========================================');

  } catch (error) {
    console.error('[Gateway] Failed to start:', error);
    process.exit(1);
  }
}

function shutdown() {
  console.log('\n[Gateway] Shutting down...');
  
  syncService.stop();
  mqttGateway.disconnect();
  storage.close();
  
  console.log('[Gateway] Goodbye!');
  process.exit(0);
}

main();
