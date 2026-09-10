/**
 * Prometheus metrics (hardening Phase 16).
 *
 * The gateway's HTTP API is Node's raw `http` (no Express), so the request
 * histogram is recorded from the server handler in http/index.ts. Everything
 * else is here: default process metrics, MQTT reachability, and the offline
 * queue depth. Served at GET /metrics — open unless METRICS_TOKEN is set.
 */
import { collectDefaultMetrics, Registry, Histogram, Gauge } from 'prom-client';
import { mqttGateway } from './mqtt/index.js';
import { storage } from './storage/index.js';
import { config } from './config/index.js';
import { VERSION } from './version.js';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'pet-iot-edge-gateway', version: VERSION });
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

new Gauge({
  name: 'dependency_up',
  help: 'Dependency reachability (1 = up)',
  labelNames: ['dep'],
  registers: [registry],
  collect() {
    this.set({ dep: 'mqtt' }, mqttGateway.isConnected() ? 1 : 0);
  },
});

new Gauge({
  name: 'offline_queue_depth',
  help: 'Locally-queued work waiting to reach the cloud',
  labelNames: ['kind'],
  registers: [registry],
  collect() {
    this.set({ kind: 'events' }, storage.getUnsyncedEvents(config.offlineQueueLimit).length);
    this.set({ kind: 'commands' }, storage.getPendingLocalCommands().length);
  },
});

/** True when the request may proceed to the metrics body. */
export function metricsAuthorized(authHeader: string | undefined): boolean {
  const token = process.env.METRICS_TOKEN;
  return !token || authHeader === `Bearer ${token}`;
}
