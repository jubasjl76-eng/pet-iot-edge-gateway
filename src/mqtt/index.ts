/**
 * MQTT Client for local device communication
 * Handles device connections and message routing
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { storage } from '../storage/index.js';

export interface DeviceMessage {
  deviceId: string;
  eventType: string;
  value: any;
  unit?: string;
  timestamp: number;
}

export interface CommandMessage {
  deviceId: string;
  command: string;
  params?: Record<string, any>;
  commandId?: string;
}

export class MQTTGateway extends EventEmitter {
  private client: MqttClient | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;

  constructor() {
    super();
  }

  /**
   * Connect to local MQTT broker
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `mqtt://${config.mqttHost}:${config.mqttPort}`;
      
      const options: IClientOptions = {
        clientId: `edge-gateway-${config.gatewayId}`,
        clean: false,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
      };

      if (config.mqttUsername && config.mqttPassword) {
        options.username = config.mqttUsername;
        options.password = config.mqttPassword;
      }

      console.log(`[MQTT] Connecting to ${url}...`);
      
      this.client = mqtt.connect(url, options);

      this.client.on('connect', () => {
        console.log('[MQTT] Connected successfully');
        this.reconnectAttempts = 0;
        
        // Subscribe to all device topics
        this.subscribeToDevices();
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('[MQTT] Connection error:', error.message);
        reject(error);
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        console.log(`[MQTT] Reconnecting... (attempt ${this.reconnectAttempts})`);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[MQTT] Max reconnect attempts reached');
          this.client?.end();
        }
      });

      this.client.on('offline', () => {
        console.log('[MQTT] Client offline');
        storage.updateGatewayStatus(false);
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });
    });
  }

  /**
   * Subscribe to all device topics in this kennel
   */
  private subscribeToDevices(): void {
    if (!this.client) return;

    const baseTopic = `kennel/${config.kennelId}/#`;
    
    this.client.subscribe(baseTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] Subscribe error:', err);
      } else {
        console.log(`[MQTT] Subscribed to ${baseTopic}`);
      }
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMessage(topic: string, message: Buffer): void {
    try {
      const payload = JSON.parse(message.toString());
      const topicParts = topic.split('/');
      
      // Topic format: kennel/{kennelId}/{deviceType}/{deviceId}/{type}
      const [, , deviceType, deviceId, type] = topicParts;
      
      console.log(`[MQTT] Message on ${topic}:`, payload);
      
      // Store device info
      storage.registerDevice({
        deviceId,
        deviceType,
        name: payload.name || deviceId,
        location: payload.location,
        lastSeen: new Date(),
        online: true,
      });

      // Emit based on message type
      if (type === 'status' || type === 'event') {
        const event = storage.storeEvent({
          deviceId,
          eventType: payload.eventType || payload.type || 'unknown',
          value: payload.value || payload,
          unit: payload.unit,
          timestamp: new Date(),
        });
        this.emit('deviceEvent', event);
      } else if (type === 'heartbeat') {
        storage.updateDeviceStatus(deviceId, true);
        this.emit('heartbeat', { deviceId, timestamp: payload.timestamp });
      } else if (type === 'response') {
        this.emit('commandResponse', { deviceId, ...payload });
      }
      
    } catch (error) {
      console.error('[MQTT] Failed to parse message:', error);
    }
  }

  /**
   * Send command to a specific device
   */
  sendCommand(deviceType: string, deviceId: string, command: string, params?: any): void {
    if (!this.client || !this.client.connected) {
      console.error('[MQTT] Client not connected');
      return;
    }

    const topic = `kennel/${config.kennelId}/${deviceType}/${deviceId}/command`;
    const payload: CommandMessage = {
      deviceId,
      command,
      params,
      commandId: `cmd_${Date.now()}`,
    };

    this.client.publish(topic, JSON.stringify(payload), { qos: 2 }, (err) => {
      if (err) {
        console.error('[MQTT] Failed to send command:', err);
      } else {
        console.log(`[MQTT] Command sent to ${topic}:`, payload);
        
        // Store command for tracking
        storage.storeCommand({
          deviceId,
          command,
          params,
          status: 'sent',
          createdAt: new Date(),
        });
      }
    });
  }

  /**
   * Request device to restart
   */
  restartDevice(deviceType: string, deviceId: string): void {
    this.sendCommand(deviceType, deviceId, 'restart');
  }

  /**
   * Request device status
   */
  requestStatus(deviceType: string, deviceId: string): void {
    this.sendCommand(deviceType, deviceId, 'status');
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  /**
   * Disconnect from MQTT broker
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      console.log('[MQTT] Disconnected');
    }
  }
}

export const mqttGateway = new MQTTGateway();
