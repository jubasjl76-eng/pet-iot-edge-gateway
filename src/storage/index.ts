/**
 * SQLite Local Storage
 * Stores device events locally when offline
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

export interface DeviceEvent {
  id: string;
  deviceId: string;
  eventType: string;
  value: any;
  unit?: string;
  timestamp: Date;
  synced: boolean;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  command: string;
  params?: any;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
}

export interface Device {
  id: string;
  deviceId: string;
  deviceType: string;
  name: string;
  location?: string;
  lastSeen: Date;
  online: boolean;
}

class Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const path = dbPath.replace(/\/[^/]+$/, '');
    require('fs').mkdirSync(path, { recursive: true });
    
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Devices table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        deviceId TEXT UNIQUE NOT NULL,
        deviceType TEXT NOT NULL,
        name TEXT,
        location TEXT,
        lastSeen TEXT,
        online INTEGER DEFAULT 0
      )
    `);

    // Events table (offline queue)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        deviceId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        value TEXT,
        unit TEXT,
        timestamp TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      )
    `);

    // Commands table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        deviceId TEXT NOT NULL,
        command TEXT NOT NULL,
        params TEXT,
        status TEXT DEFAULT 'pending',
        createdAt TEXT NOT NULL
      )
    `);

    // Gateway status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gateway_status (
        id TEXT PRIMARY KEY,
        lastSync TEXT,
        online INTEGER DEFAULT 1
      )
    `);

    console.log('[Storage] SQLite initialized');
  }

  // ============== DEVICES ==============

  registerDevice(device: Omit<Device, 'id'>): Device {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO devices (id, deviceId, deviceType, name, location, lastSeen, online)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = uuidv4();
    stmt.run(id, device.deviceId, device.deviceType, device.name, device.location, device.lastSeen.toISOString(), device.online ? 1 : 0);
    
    return { ...device, id };
  }

  getDevices(): Device[] {
    const stmt = this.db.prepare('SELECT * FROM devices');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      online: row.online === 1,
      lastSeen: new Date(row.lastSeen),
    }));
  }

  getDevice(deviceId: string): Device | undefined {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE deviceId = ?');
    const row = stmt.get(deviceId) as any;
    if (!row) return undefined;
    return {
      ...row,
      online: row.online === 1,
      lastSeen: new Date(row.lastSeen),
    };
  }

  updateDeviceStatus(deviceId: string, online: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE devices SET online = ?, lastSeen = ? WHERE deviceId = ?
    `);
    stmt.run(online ? 1 : 0, new Date().toISOString(), deviceId);
  }

  // ============== EVENTS ==============

  storeEvent(event: Omit<DeviceEvent, 'id' | 'synced'>): DeviceEvent {
    const stmt = this.db.prepare(`
      INSERT INTO events (id, deviceId, eventType, value, unit, timestamp, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = uuidv4();
    stmt.run(
      id,
      event.deviceId,
      event.eventType,
      JSON.stringify(event.value),
      event.unit,
      event.timestamp.toISOString(),
      0
    );
    
    return { ...event, id, synced: false };
  }

  getUnsyncedEvents(limit: number = 100): DeviceEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      ...row,
      value: JSON.parse(row.value),
      timestamp: new Date(row.timestamp),
      synced: false,
    }));
  }

  markEventsSynced(ids: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE events SET synced = 1 WHERE id = ?
    `);
    
    const transaction = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    });
    
    transaction(ids);
  }

  getEvents(deviceId: string, limit: number = 50): DeviceEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events WHERE deviceId = ? ORDER BY timestamp DESC LIMIT ?
    `);
    const rows = stmt.all(deviceId, limit) as any[];
    return rows.map(row => ({
      ...row,
      value: JSON.parse(row.value),
      timestamp: new Date(row.timestamp),
      synced: row.synced === 1,
    }));
  }

  // ============== COMMANDS ==============

  storeCommand(command: Omit<DeviceCommand, 'id'>): DeviceCommand {
    const stmt = this.db.prepare(`
      INSERT INTO commands (id, deviceId, command, params, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const id = uuidv4();
    stmt.run(id, command.deviceId, command.command, JSON.stringify(command.params || {}), command.status, command.createdAt.toISOString());
    
    return { ...command, id };
  }

  getPendingCommands(): DeviceCommand[] {
    const stmt = this.db.prepare(`
      SELECT * FROM commands WHERE status = 'pending' ORDER BY createdAt ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      params: JSON.parse(row.params),
      createdAt: new Date(row.createdAt),
    }));
  }

  updateCommandStatus(id: string, status: string): void {
    const stmt = this.db.prepare('UPDATE commands SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  // ============== GATEWAY STATUS ==============

  getGatewayStatus(): { lastSync: Date | null; online: boolean } {
    const stmt = this.db.prepare('SELECT * FROM gateway_status WHERE id = ?');
    const row = stmt.get('main') as any;
    
    if (!row) {
      return { lastSync: null, online: true };
    }
    
    return {
      lastSync: row.lastSync ? new Date(row.lastSync) : null,
      online: row.online === 1,
    };
  }

  updateGatewayStatus(online: boolean): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO gateway_status (id, online, lastSync)
      VALUES (?, ?, ?)
    `);
    stmt.run('main', online ? 1 : 0, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}

export const storage = new Storage(config.sqlitePath);
