// Environment Configuration
export interface Config {
  // Gateway
  gatewayId: string;
  kennelId: string;
  
  // MQTT (local)
  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;
  
  // Backend API
  apiUrl: string;
  apiKey: string;
  
  // SQLite
  sqlitePath: string;
  
  // Sync
  syncInterval: number; // milliseconds
  offlineQueueLimit: number;
  
  // Health check
  heartbeatInterval: number;
}

export const config: Config = {
  gatewayId: process.env.GATEWAY_ID || `gateway-${Math.random().toString(16).slice(2, 8)}`,
  kennelId: process.env.KENNEL_ID || 'kennel-01',
  
  mqttHost: process.env.MQTT_HOST || 'localhost',
  mqttPort: parseInt(process.env.MQTT_PORT || '1883'),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  apiKey: process.env.API_KEY || 'smart-pet-api-key-2026',
  
  sqlitePath: process.env.SQLITE_PATH || './data/gateway.db',
  
  syncInterval: parseInt(process.env.SYNC_INTERVAL || '30000'), // 30 seconds
  offlineQueueLimit: parseInt(process.env.OFFLINE_QUEUE_LIMIT || '1000'),
  
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '60000'), // 60 seconds
};
