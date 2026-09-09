// Configuration
export interface Config {
  // Gateway
  gatewayId: string;
  kennelId: string;
  
  // MQTT
  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;
  
  // Backend URLs
  localBackendUrl?: string;
  cloudBackendUrl?: string;
  apiUrl: string;  // Resolved URL (local or cloud)
  apiKey: string;
  
  // SQLite
  sqlitePath: string;

  // Sync
  syncInterval: number;
  offlineQueueLimit: number;

  // Heartbeat
  heartbeatInterval: number;

  // Pet Hub: local HTTP API (health, devices, events, schedules, commands)
  httpPort: number;

  // Pet Hub: local schedule runner — the hub fires feed/dispense on the LAN
  // clock regardless of cloud connectivity. 0 disables.
  scheduleTickInterval: number;

  // Optional cloud MQTT bridge: republish local kennel/# to a cloud broker.
  cloudMqttUrl?: string;
  cloudMqttUsername?: string;
  cloudMqttPassword?: string;

  // Legacy HTTP sync to /api/iot/* (kept for back-compat; off by default now
  // that the cloud consumes MQTT directly).
  httpSyncEnabled: boolean;
}

function resolveBackendUrl(): string {
  const localUrl = process.env.LOCAL_BACKEND_URL;
  const cloudUrl = process.env.CLOUD_BACKEND_URL;
  
  // For now, default to local - can add auto-discovery later
  if (localUrl) {
    return localUrl;
  }
  return cloudUrl || 'http://localhost:3000';
}

export const config: Config = {
  gatewayId: process.env.GATEWAY_ID || `gateway-${Math.random().toString(36).slice(2, 8)}`,
  kennelId: process.env.KENNEL_ID || 'kennel-01',
  
  mqttHost: process.env.MQTT_HOST || 'localhost',
  mqttPort: parseInt(process.env.MQTT_PORT || '1883'),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  
  localBackendUrl: process.env.LOCAL_BACKEND_URL,
  cloudBackendUrl: process.env.CLOUD_BACKEND_URL,
  apiUrl: resolveBackendUrl(),
  apiKey: process.env.API_KEY || 'smart-pet-api-key-2026',
  
  sqlitePath: process.env.SQLITE_PATH || './data/gateway.db',
  
  syncInterval: parseInt(process.env.SYNC_INTERVAL || '30000'),
  offlineQueueLimit: parseInt(process.env.OFFLINE_QUEUE_LIMIT || '1000'),

  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '60000'),

  httpPort: parseInt(process.env.HTTP_PORT || '3004'),
  scheduleTickInterval: parseInt(process.env.SCHEDULE_TICK_INTERVAL || '30000'),

  cloudMqttUrl: process.env.CLOUD_MQTT_URL,
  cloudMqttUsername: process.env.CLOUD_MQTT_USERNAME,
  cloudMqttPassword: process.env.CLOUD_MQTT_PASSWORD,

  httpSyncEnabled: process.env.HTTP_SYNC_ENABLED === 'true',
};
