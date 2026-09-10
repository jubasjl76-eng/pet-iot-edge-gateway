/**
 * MQTT Client for local device communication
 * Handles device connections and message routing
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { storage } from '../storage/index.js';
import { parseTopic, buildTopic, buildCommand, deliveryFor, INBOUND_STATE_LEAVES, type DeviceType } from '../protocol.js';
import { log } from '../log.js';

const mlog = log.child({ mod: 'mqtt' });

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

      mlog.info({ url }, 'connecting');
      
      this.client = mqtt.connect(url, options);

      this.client.on('connect', () => {
        mlog.info('connected');
        this.reconnectAttempts = 0;
        
        // Subscribe to all device topics
        this.subscribeToDevices();
        resolve();
      });

      this.client.on('error', (error) => {
        mlog.error({ err: error }, 'error');
        reject(error);
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        mlog.warn({ attempt: this.reconnectAttempts }, 'reconnecting');
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          mlog.error('max reconnect attempts reached');
          this.client?.end();
        }
      });

      this.client.on('offline', () => {
        mlog.warn('offline');
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
        mlog.error({ err }, 'subscribe failed');
      } else {
        mlog.debug({ topic: baseTopic }, 'subscribed');
      }
    });
  }

  /**
   * Handle incoming MQTT messages on the canonical v2 scheme
   *   kennel/{kennelId}/{deviceType}/{deviceId}/{leaf}
   * leaf ∈ status | event | ack | telemetry | location | presence | <metric> | heartbeat(legacy)
   */
  private handleMessage(topic: string, message: Buffer): void {
    let payload: any;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      mlog.warn({ topic }, 'non-JSON payload');
      return;
    }

    const parts = parseTopic(topic);
    if (!parts) {
      // tolerate the legacy 'heartbeat' leaf during migration
      const legacy = topic.split('/');
      if (legacy.length === 5 && legacy[4] === 'heartbeat') {
        storage.updateDeviceStatus(legacy[3], true);
        this.emit('heartbeat', { deviceId: legacy[3], timestamp: payload?.timestamp });
      }
      return;
    }
    const { deviceType, deviceId, leaf } = parts;

    storage.registerDevice({
      deviceId,
      deviceType,
      name: payload.name || deviceId,
      location: payload.location,
      lastSeen: new Date(),
      online: true,
    });

    if (leaf === 'ack') {
      // close the loop on a LAN-queued command
      if (payload.ackId) {
        storage.resolveLocalCommandByCommandId(payload.ackId, payload.result || 'ok');
      }
      this.emit('commandResponse', { deviceId, ...payload });
      return;
    }

    if (leaf === 'status') {
      storage.updateDeviceStatus(deviceId, (payload.status ?? 'online') !== 'offline');
    }

    // Everything that isn't a command or ack is device-produced state/telemetry
    // → into the offline queue for the cloud.
    if (leaf !== 'command') {
      const event = storage.storeEvent({
        deviceId,
        eventType: leaf === 'event' ? (payload.event || 'event') : leaf,
        value: payload.value ?? payload.metrics ?? payload,
        unit: payload.unit,
        timestamp: new Date(),
      });
      this.emit('deviceEvent', event);
    }
  }

  /** Publish a v2 command with a generated id. Returns the id, or null if not connected. */
  publishCommandWithId(
    deviceType: string,
    deviceId: string,
    command: string,
    params: Record<string, unknown> = {}
  ): string | null {
    if (!this.client || !this.client.connected) return null;
    const body = buildCommand(config.kennelId, deviceId, command, params);
    // deviceType is a free-form string from SQLite; buildTopic validates the
    // segment at runtime and throws on anything malformed.
    const topic = buildTopic(config.kennelId, deviceType as DeviceType, deviceId, 'command');
    const { qos, retain } = deliveryFor('command');
    this.client.publish(topic, JSON.stringify(body), { qos, retain });
    storage.storeCommand({ deviceId, command, params, status: 'sent', createdAt: new Date() });
    return body.id;
  }

  /** Fire-and-track a command (used by the schedule runner). Returns success. */
  sendDeviceCommand(
    deviceType: string,
    deviceId: string,
    command: string,
    params: Record<string, unknown> = {},
    _source = 'gateway'
  ): boolean {
    return this.publishCommandWithId(deviceType, deviceId, command, params) !== null;
  }

  /**
   * Send command to a specific device
   */
  sendCommand(deviceType: string, deviceId: string, command: string, params?: any): void {
    if (!this.client || !this.client.connected) {
      mlog.warn('publish skipped — not connected');
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
        mlog.error({ err }, 'failed to send command');
      } else {
        mlog.debug({ topic }, 'command sent');
        
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
      mlog.info('disconnected');
    }
  }
}

export const mqttGateway = new MQTTGateway();
