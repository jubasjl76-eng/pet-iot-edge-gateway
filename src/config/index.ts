/**
 * Typed config contract (hardening Phase 12, A8).
 *
 * ONE zod schema over process.env via @jubasjl76-eng/shared; a missing/invalid
 * var prints every problem and exits. The `config` object keeps its camelCase
 * domain shape + resolved fields so nothing else in the gateway had to change.
 */
import { loadConfig, z, envInt, envPort, envBool } from '@jubasjl76-eng/shared';

const schema = z.object({
  // public / build-time
  GATEWAY_ID: z.string().optional(),
  KENNEL_ID: z.string().default('kennel-01'),
  HTTP_PORT: envPort().default(3004),

  // runtime non-secret
  MQTT_HOST: z.string().default('localhost'),
  MQTT_PORT: envPort().default(1883),
  MQTT_USERNAME: z.string().optional(),
  LOCAL_BACKEND_URL: z.string().url().optional(),
  CLOUD_BACKEND_URL: z.string().url().optional(),
  SQLITE_PATH: z.string().default('./data/gateway.db'),
  SYNC_INTERVAL: envInt().default(30_000),
  OFFLINE_QUEUE_LIMIT: envInt().default(1_000),
  HEARTBEAT_INTERVAL: envInt().default(60_000),
  SCHEDULE_TICK_INTERVAL: envInt().default(30_000),
  CLOUD_MQTT_URL: z.string().optional(),
  CLOUD_MQTT_USERNAME: z.string().optional(),
  HTTP_SYNC_ENABLED: envBool().default(false),

  // error tracking (Phase 15) — read raw in src/instrument.ts; in the schema so
  // boot still validates them. A DSN is not a secret.
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  // observability (Phase 16) — /metrics is open unless this bearer token is set.
  METRICS_TOKEN: z.string().optional(),

  // secret (AWS Secrets Manager at runtime; SOPS+age for git-committed non-prod)
  MQTT_PASSWORD: z.string().optional(),
  CLOUD_MQTT_PASSWORD: z.string().optional(),
  API_KEY: z.string().default('smart-pet-api-key-2026'),
});

const env = loadConfig(schema, { name: 'edge-gateway' });

function resolveBackendUrl(): string {
  return env.LOCAL_BACKEND_URL || env.CLOUD_BACKEND_URL || 'http://localhost:3000';
}

export interface Config {
  gatewayId: string;
  kennelId: string;
  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;
  localBackendUrl?: string;
  cloudBackendUrl?: string;
  apiUrl: string;
  apiKey: string;
  sqlitePath: string;
  syncInterval: number;
  offlineQueueLimit: number;
  heartbeatInterval: number;
  httpPort: number;
  scheduleTickInterval: number;
  cloudMqttUrl?: string;
  cloudMqttUsername?: string;
  cloudMqttPassword?: string;
  httpSyncEnabled: boolean;
}

export const config: Config = {
  gatewayId: env.GATEWAY_ID || `gateway-${Math.random().toString(36).slice(2, 8)}`,
  kennelId: env.KENNEL_ID,
  mqttHost: env.MQTT_HOST,
  mqttPort: env.MQTT_PORT,
  mqttUsername: env.MQTT_USERNAME,
  mqttPassword: env.MQTT_PASSWORD,
  localBackendUrl: env.LOCAL_BACKEND_URL,
  cloudBackendUrl: env.CLOUD_BACKEND_URL,
  apiUrl: resolveBackendUrl(),
  apiKey: env.API_KEY,
  sqlitePath: env.SQLITE_PATH,
  syncInterval: env.SYNC_INTERVAL,
  offlineQueueLimit: env.OFFLINE_QUEUE_LIMIT,
  heartbeatInterval: env.HEARTBEAT_INTERVAL,
  httpPort: env.HTTP_PORT,
  scheduleTickInterval: env.SCHEDULE_TICK_INTERVAL,
  cloudMqttUrl: env.CLOUD_MQTT_URL,
  cloudMqttUsername: env.CLOUD_MQTT_USERNAME,
  cloudMqttPassword: env.CLOUD_MQTT_PASSWORD,
  httpSyncEnabled: env.HTTP_SYNC_ENABLED,
};
