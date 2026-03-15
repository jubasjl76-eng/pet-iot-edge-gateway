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
};
