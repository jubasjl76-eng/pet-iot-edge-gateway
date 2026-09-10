/**
 * Pet IoT Edge Gateway
 * Main entry point
 */

import './instrument.js'; // Sentry — must be the very first import
import * as Sentry from '@sentry/node';
import { config } from './config/index.js';
import { mqttGateway } from './mqtt/index.js';
import { syncService } from './sync/index.js';
import { storage } from './storage/index.js';
import { startHttpServer, stopHttpServer } from './http/index.js';
import { scheduleRunner } from './schedules/index.js';
import { cloudBridge } from './bridge/index.js';
import { log } from './log.js';

async function main() {
  log.info(
    { gatewayId: config.gatewayId, kennelId: config.kennelId, mqtt: `${config.mqttHost}:${config.mqttPort}`, api: config.apiUrl },
    'edge gateway starting',
  );

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Local HTTP API (LAN clients reach devices even with no internet)
  startHttpServer();

  try {
    // Connect to local MQTT broker
    await mqttGateway.connect();
    log.info('MQTT connected');

    // Local schedule runner — feeding/watering runs on the LAN clock
    scheduleRunner.start();

    // Optional cloud MQTT bridge
    cloudBridge.start();

    // Legacy HTTP sync to /api/iot/* — off unless HTTP_SYNC_ENABLED=true
    // (the cloud now consumes MQTT directly).
    if (config.httpSyncEnabled) {
      await syncService.registerGateway();
      syncService.start();
      log.info('legacy HTTP sync started');
    } else {
      log.info('HTTP sync disabled — cloud consumes MQTT');
    }

    // Listen for device events
    mqttGateway.on('deviceEvent', (event) => {
      log.debug({ deviceId: event.deviceId, eventType: event.eventType }, 'device event');
    });

    mqttGateway.on('heartbeat', (data) => {
      log.debug({ deviceId: data.deviceId }, 'heartbeat');
    });

    log.info('gateway running');

  } catch (error) {
    log.error({ err: error }, 'failed to start');
    Sentry.captureException(error);
    await Sentry.flush(2000).catch(() => {});
    process.exit(1);
  }
}

let shuttingDown = false;

async function shutdown(signal?: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal: signal ?? 'shutdown' }, 'draining');

  const guard = setTimeout(() => {
    log.error('drain timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  guard.unref();

  await stopHttpServer(); // stop new LAN requests, finish in-flight
  scheduleRunner.stop();
  cloudBridge.stop();
  syncService.stop();
  mqttGateway.disconnect();
  storage.close();

  clearTimeout(guard);
  log.info('stopped');
  process.exit(0);
}

main();
