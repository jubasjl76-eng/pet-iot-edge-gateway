/**
 * Structured logging (hardening Phase 16). `log` is a pino instance: JSON on
 * staging/prod, pino-pretty in development. `LOG_LEVEL` overrides the default.
 * Adds `service` + `version` to every line, and `traceId` / `spanId` when an
 * OpenTelemetry span is active.
 *
 * Migration is incremental — boot + the MQTT surface use `log`; other
 * `console.*` calls move over as files are touched.
 */
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';
import { VERSION } from './version.js';

const isDev = process.env.NODE_ENV === 'development';

export function traceMixin(): Record<string, string> {
  const span = trace.getSpanContext(context.active());
  return span?.traceId ? { traceId: span.traceId, spanId: span.spanId } : {};
}

export const log = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: { service: 'pet-iot-edge-gateway', version: VERSION },
  mixin: traceMixin,
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.password', '*.token', '*.apiKey'],
    censor: '[redacted]',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,version' },
        },
      }
    : {}),
});
