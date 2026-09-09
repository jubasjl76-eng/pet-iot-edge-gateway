/**
 * Optional cloud MQTT bridge.
 *
 * When CLOUD_MQTT_URL is set, the hub mirrors traffic between the local broker
 * and a cloud broker for this kennel only:
 *   local  kennel/{kennelId}/#  ── republish ──▶  cloud   (device state/telemetry up)
 *   cloud  kennel/{kennelId}/+/+/command ─────▶  local    (backend commands down)
 *
 * Loop-safe: each side tags its own publishes and ignores echoes.
 */
import mqtt, { MqttClient } from 'mqtt';
import { config } from '../config/index.js';

const TAG = `__via_${config.gatewayId}`;

export class CloudBridge {
  private cloud: MqttClient | null = null;
  private local: MqttClient | null = null;

  start(): void {
    if (!config.cloudMqttUrl) {
      console.log('[Bridge] disabled (no CLOUD_MQTT_URL)');
      return;
    }
    const kennelFilter = `kennel/${config.kennelId}/#`;
    const commandFilter = `kennel/${config.kennelId}/+/+/command`;

    this.local = mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, {
      clientId: `bridge-local-${config.gatewayId}`,
      username: config.mqttUsername, password: config.mqttPassword, reconnectPeriod: 5000,
    });
    this.cloud = mqtt.connect(config.cloudMqttUrl, {
      clientId: `bridge-cloud-${config.gatewayId}`,
      username: config.cloudMqttUsername, password: config.cloudMqttPassword, reconnectPeriod: 5000,
    });

    this.local.on('connect', () => this.local!.subscribe(kennelFilter, { qos: 1 }));
    this.cloud.on('connect', () => this.cloud!.subscribe(commandFilter, { qos: 2 }));

    this.local.on('message', (topic, payload) => this.forward(this.cloud, topic, payload, 1));
    this.cloud.on('message', (topic, payload) => this.forward(this.local, topic, payload, 2));

    this.local.on('error', (e) => console.error('[Bridge] local', e.message));
    this.cloud.on('error', (e) => console.error('[Bridge] cloud', e.message));
    console.log(`[Bridge] mirroring kennel/${config.kennelId} ↔ ${config.cloudMqttUrl}`);
  }

  private forward(to: MqttClient | null, topic: string, payload: Buffer, qos: 0 | 1 | 2): void {
    if (!to || !to.connected) return;
    let body: any;
    try { body = JSON.parse(payload.toString()); } catch { body = null; }
    if (body && body[TAG]) return;                 // our own echo
    if (body && typeof body === 'object') body[TAG] = true;
    to.publish(topic, JSON.stringify(body ?? payload.toString()), { qos, retain: topic.endsWith('/status') });
  }

  stop(): void {
    this.local?.end(true);
    this.cloud?.end(true);
  }
}

export const cloudBridge = new CloudBridge();
