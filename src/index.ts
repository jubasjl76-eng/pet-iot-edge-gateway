/**
 * Pet IoT Edge Gateway
 * Main entry point
 */

import { config } from './config/index.js';
import { mqttGateway } from './mqtt/index.js';
import { syncService } from './sync/index.js';
import { storage } from './storage/index.js';
import { startHttpServer } from './http/index.js';
import { scheduleRunner } from './schedules/index.js';
import { cloudBridge } from './bridge/index.js';

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

  // Local HTTP API (LAN clients reach devices even with no internet)
  startHttpServer();

  try {
    // Connect to local MQTT broker
    await mqttGateway.connect();
    console.log('[Gateway] MQTT connected');

    // Local schedule runner — feeding/watering runs on the LAN clock
    scheduleRunner.start();

    // Optional cloud MQTT bridge
    cloudBridge.start();

    // Legacy HTTP sync to /api/iot/* — off unless HTTP_SYNC_ENABLED=true
    // (the cloud now consumes MQTT directly).
    if (config.httpSyncEnabled) {
      await syncService.registerGateway();
      syncService.start();
      console.log('[Gateway] HTTP sync service started (legacy)');
    } else {
      console.log('[Gateway] HTTP sync disabled — cloud consumes MQTT (set HTTP_SYNC_ENABLED=true to re-enable)');
    }

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

  scheduleRunner.stop();
  cloudBridge.stop();
  syncService.stop();
  mqttGateway.disconnect();
  storage.close();

  console.log('[Gateway] Goodbye!');
  process.exit(0);
}

main();
