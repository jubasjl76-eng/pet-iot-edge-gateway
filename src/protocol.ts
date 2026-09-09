/**
 * Canonical Smart Pet MQTT scheme — vendored subset.
 *
 * Source of truth: smart-pet-mqtt/src/topics.ts + payloads.ts. Kept in sync by
 * hand (this is a small, stable contract) so the gateway has no cross-repo dep.
 *
 *   kennel/{kennelId}/{deviceType}/{deviceId}/{leaf}
 */

export const DEVICE_TYPES = [
  'feeder', 'water', 'door', 'sensor', 'gps', 'camera', 'scale', 'hub',
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export type Qos = 0 | 1 | 2;
export interface Delivery { qos: Qos; retain: boolean; }

export function deliveryFor(leaf: string): Delivery {
  if (leaf === 'command') return { qos: 2, retain: false };
  if (leaf === 'status') return { qos: 1, retain: true };
  return { qos: 1, retain: false }; // event, ack, telemetry, location, presence, audio, metrics
}

export interface TopicParts {
  kennelId: string;
  deviceType: DeviceType;
  deviceId: string;
  leaf: string;
}

const SEG = /^[A-Za-z0-9._:-]+$/;

export function buildTopic(kennelId: string, deviceType: string, deviceId: string, leaf: string): string {
  return `kennel/${kennelId}/${deviceType}/${deviceId}/${leaf}`;
}

export function parseTopic(topic: string): TopicParts | null {
  const p = topic.split('/');
  if (p.length !== 5) return null;
  const [root, kennelId, deviceType, deviceId, leaf] = p;
  if (root !== 'kennel') return null;
  if (!(DEVICE_TYPES as readonly string[]).includes(deviceType)) return null;
  if (!SEG.test(kennelId) || !SEG.test(deviceId) || !SEG.test(leaf)) return null;
  return { kennelId, deviceType: deviceType as DeviceType, deviceId, leaf };
}

export function isLegacyTopic(topic: string): boolean {
  return topic.startsWith('dogs/') || topic.startsWith('devices/');
}

/** Build a command payload with an id so acks can be correlated. */
export function buildCommand(
  kennelId: string,
  deviceId: string,
  command: string,
  params: Record<string, unknown> = {}
): { command: string; id: string; deviceId: string; kennelId: string; timestamp: number; params: Record<string, unknown> } {
  return {
    command,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    kennelId,
    timestamp: Date.now(),
    params,
  };
}

/** Leaves the gateway treats as "device produced telemetry/state" for the offline queue. */
export const INBOUND_STATE_LEAVES = new Set([
  'status', 'event', 'ack', 'telemetry', 'location', 'presence',
]);
