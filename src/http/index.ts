/**
 * Pet Hub local HTTP API (default :3004).
 *
 * Runs on the LAN so the owner app / staff dashboard can reach devices even with
 * no internet. Built on Node's http module — no extra dependency on the box.
 *
 *   GET  /health                         liveness (also the Docker healthcheck)
 *   GET  /status                         gateway + mqtt + queue summary
 *   GET  /devices                        known devices
 *   GET  /events?deviceId=&limit=        recent events (unsynced first if no deviceId)
 *   GET  /schedules?deviceId=            local schedules
 *   POST /schedules                      {deviceId,deviceType,time,amount,enabled,daysOfWeek}
 *   PUT  /schedules/:id                  update
 *   DEL  /schedules/:id                  remove
 *   POST /commands                       {deviceId,deviceType,command,params}  → queued + delivered
 *   GET  /commands                       recent queued commands + their acks
 */
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import * as Sentry from '@sentry/node';
import { config } from '../config/index.js';
import { storage } from '../storage/index.js';
import { mqttGateway } from '../mqtt/index.js';
import { scheduleRunner } from '../schedules/index.js';
import { parseHhMm } from '../schedules/schedule-core.js';

function send(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
  });
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${config.httpPort}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  if (path === '/health') {
    // Liveness only — the process is up.
    return send(res, 200, { status: 'ok', service: 'edge-gateway', gatewayId: config.gatewayId, kennelId: config.kennelId, uptime: process.uptime() });
  }

  if (path === '/ready') {
    // Readiness — safe to route traffic. 503 until MQTT is connected / while draining.
    const mqtt = mqttGateway.isConnected();
    const ok = mqtt && !shuttingDown;
    return send(res, ok ? 200 : 503, { status: ok ? 'ready' : 'not-ready', mqtt, shuttingDown });
  }

  if (path === '/status' && method === 'GET') {
    const devices = storage.getDevices();
    return send(res, 200, {
      gatewayId: config.gatewayId,
      kennelId: config.kennelId,
      mqttConnected: mqttGateway.isConnected(),
      devices: { total: devices.length, online: devices.filter((d) => d.online).length },
      unsyncedEvents: storage.getUnsyncedEvents(config.offlineQueueLimit).length,
      pendingCommands: storage.getPendingLocalCommands().length,
      lastSync: storage.getGatewayStatus().lastSync,
    });
  }

  if (path === '/devices' && method === 'GET') {
    return send(res, 200, { devices: storage.getDevices() });
  }

  if (path === '/events' && method === 'GET') {
    const deviceId = url.searchParams.get('deviceId');
    const limit = Number(url.searchParams.get('limit') || 50);
    const events = deviceId ? storage.getEvents(deviceId, limit) : storage.getUnsyncedEvents(limit);
    return send(res, 200, { events });
  }

  if (path === '/schedules') {
    if (method === 'GET') {
      return send(res, 200, { schedules: storage.listSchedules(url.searchParams.get('deviceId') || undefined) });
    }
    if (method === 'POST') {
      const b = await readJson(req);
      if (!b || !b.deviceId || !b.deviceType || parseHhMm(String(b.time)) == null) {
        return send(res, 400, { error: 'deviceId, deviceType and time (HH:MM) required' });
      }
      const s = storage.upsertSchedule({
        deviceId: b.deviceId, deviceType: b.deviceType, time: b.time,
        amount: Number(b.amount ?? 0), enabled: b.enabled ?? true,
        daysOfWeek: Array.isArray(b.daysOfWeek) ? b.daysOfWeek : undefined,
      });
      return send(res, 201, { schedule: s });
    }
  }

  const schedMatch = /^\/schedules\/([^/]+)$/.exec(path);
  if (schedMatch) {
    const id = schedMatch[1];
    if (method === 'PUT') {
      const b = await readJson(req);
      const existing = storage.listSchedules().find((s) => s.id === id);
      if (!existing) return send(res, 404, { error: 'not found' });
      const s = storage.upsertSchedule({ ...existing, ...b, id });
      return send(res, 200, { schedule: s });
    }
    if (method === 'DELETE') {
      return send(res, storage.deleteSchedule(id) ? 200 : 404, { ok: true });
    }
  }

  if (path === '/commands') {
    if (method === 'GET') return send(res, 200, { commands: storage.recentLocalCommands() });
    if (method === 'POST') {
      const b = await readJson(req);
      if (!b || !b.deviceId || !b.deviceType || !b.command) {
        return send(res, 400, { error: 'deviceId, deviceType, command required' });
      }
      const { id } = storage.enqueueLocalCommand({
        deviceId: b.deviceId, deviceType: b.deviceType, command: b.command,
        params: b.params ?? {}, source: b.source ?? 'lan',
      });
      scheduleRunner.drainQueue(); // deliver immediately if the broker is up
      return send(res, 202, { queued: id });
    }
  }

  send(res, 404, { error: 'not found' });
}

let httpServer: Server | undefined;
let shuttingDown = false;

export function startHttpServer(): void {
  httpServer = createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error('[HTTP] handler error', err);
      Sentry.captureException(err, { tags: { path: req.url, method: req.method } });
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    });
  });
  httpServer.listen(config.httpPort, () => {
    console.log(`[HTTP] Pet Hub API on http://0.0.0.0:${config.httpPort}`);
  });
}

/** Mark not-ready and stop accepting new connections; resolves once in-flight drains. */
export function stopHttpServer(): Promise<void> {
  shuttingDown = true;
  return new Promise((resolve) => {
    if (!httpServer) return resolve();
    httpServer.close(() => resolve());
  });
}
