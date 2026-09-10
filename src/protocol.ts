/**
 * Smart Pet MQTT scheme — re-exported from the versioned contract package.
 *
 * Was a hand-vendored subset of `smart-pet-mqtt`; now a dependency on
 * `@jubasjl76-eng/mqtt-contract` (hardening Phase 11, ADR-0001). The two
 * gateway-local helpers below (`buildCommand`, `INBOUND_STATE_LEAVES`) are not
 * part of the contract and stay here.
 */
import { commandId } from '@jubasjl76-eng/mqtt-contract';
import { propagation, context } from '@opentelemetry/api';

export {
  DEVICE_TYPES,
  buildTopic,
  parseTopic,
  deliveryFor,
  isLegacyTopic,
} from '@jubasjl76-eng/mqtt-contract';
export type { DeviceType, TopicParts, Qos } from '@jubasjl76-eng/mqtt-contract';

/**
 * Build a command payload with an id so acks can be correlated, and stamp the
 * active W3C Trace Context (traceparent/tracestate) so a gateway-originated
 * command and its device ack stay on one trace (Phase 16). Both no-op when
 * there is no active trace.
 */
export function buildCommand(
  kennelId: string,
  deviceId: string,
  command: string,
  params: Record<string, unknown> = {}
): { command: string; id: string; deviceId: string; kennelId: string; timestamp: number; params: Record<string, unknown> } {
  const payload = {
    command,
    id: commandId(),
    deviceId,
    kennelId,
    timestamp: Date.now(),
    params,
  };
  propagation.inject(context.active(), payload);
  return payload;
}

/** Leaves the gateway treats as "device produced telemetry/state" for the offline queue. */
export const INBOUND_STATE_LEAVES = new Set([
  'status', 'event', 'ack', 'telemetry', 'location', 'presence',
]);
