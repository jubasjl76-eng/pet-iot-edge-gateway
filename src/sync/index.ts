/**
 * Sync Service
 * Handles synchronization between edge gateway and backend API
 */

import axios from 'axios';
import { config } from '../config/index.js';
import { storage } from '../storage/index.js';
import { mqttGateway } from '../mqtt/index.js';

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isOnline = true;

  constructor() {
    // Check internet connectivity periodically
    setInterval(() => this.checkConnectivity(), 30000);
  }

  /**
   * Start sync service
   */
  start(): void {
    console.log('[Sync] Starting sync service...');
    
    // Sync events to backend
    this.syncInterval = setInterval(() => {
      this.syncEvents();
      this.processCommands();
    }, config.syncInterval);

    // Send heartbeat to backend
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.heartbeatInterval);

    // Initial sync
    this.syncEvents();
    this.processCommands();
    this.sendHeartbeat();
  }

  /**
   * Check internet connectivity
   */
  private async checkConnectivity(): Promise<boolean> {
    try {
      await axios.get(`${config.apiUrl}/health`, { timeout: 5000 });
      
      if (!this.isOnline) {
        console.log('[Sync] Internet connection restored');
        this.isOnline = true;
        storage.updateGatewayStatus(true);
        // Sync pending data
        await this.syncEvents();
        await this.processCommands();
      }
      
      return true;
    } catch (error) {
      if (this.isOnline) {
        console.log('[Sync] Internet connection lost - working offline');
        this.isOnline = false;
        storage.updateGatewayStatus(false);
      }
      return false;
    }
  }

  /**
   * Sync local events to backend
   */
  async syncEvents(): Promise<void> {
    if (!this.isOnline) {
      console.log('[Sync] Offline - skipping event sync');
      return;
    }

    const events = storage.getUnsyncedEvents(config.offlineQueueLimit);
    
    if (events.length === 0) {
      return;
    }

    console.log(`[Sync] Syncing ${events.length} events to backend...`);

    for (const event of events) {
      try {
        await axios.post(
          `${config.apiUrl}/api/iot/events`,
          {
            deviceId: event.deviceId,
            eventType: event.eventType,
            value: event.value,
            unit: event.unit,
            metadata: {
              gatewayId: config.gatewayId,
              kennelId: config.kennelId,
            },
          },
          {
            headers: {
              'X-API-Key': config.apiKey,
              'Content-Type': 'application/json',
            },
          }
        );

        // Mark as synced
        storage.markEventsSynced([event.id]);
        console.log(`[Sync] Synced event ${event.id}`);
      } catch (error) {
        console.error(`[Sync] Failed to sync event ${event.id}:`, error);
      }
    }
  }

  /**
   * Process pending commands from backend
   */
  async processCommands(): Promise<void> {
    if (!this.isOnline) {
      return;
    }

    try {
      // Get commands from backend for this kennel
      const response = await axios.get(
        `${config.apiUrl}/api/iot/kennels/${config.kennelId}/commands`,
        {
          headers: { 'X-API-Key': config.apiKey },
          params: { status: 'pending' },
        }
      );

      const commands = response.data.commands || [];
      
      for (const cmd of commands) {
        // Find device type
        const device = storage.getDevice(cmd.deviceId);
        
        if (device) {
          // Send to device via MQTT
          mqttGateway.sendCommand(
            device.deviceType,
            cmd.deviceId,
            cmd.command,
            cmd.params
          );
          
          // Update command status
          await axios.put(
            `${config.apiUrl}/api/iot/commands/${cmd.commandId}`,
            { status: 'sent' },
            { headers: { 'X-API-Key': config.apiKey } }
          );
        }
      }
    } catch (error) {
      console.error('[Sync] Failed to fetch commands:', error);
    }
  }

  /**
   * Send heartbeat to backend
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.isOnline) {
      return;
    }

    try {
      const devices = storage.getDevices();
      const onlineDevices = devices.filter(d => d.online);
      
      await axios.post(
        `${config.apiUrl}/api/iot/gateway/heartbeat`,
        {
          gatewayId: config.gatewayId,
          kennelId: config.kennelId,
          onlineDevices: onlineDevices.length,
          totalDevices: devices.length,
          isOnline: this.isOnline,
          lastSync: storage.getGatewayStatus().lastSync,
        },
        {
          headers: {
            'X-API-Key': config.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );
      
      storage.updateGatewayStatus(true);
      console.log(`[Sync] Heartbeat sent - ${onlineDevices.length}/${devices.length} devices online`);
    } catch (error) {
      console.error('[Sync] Failed to send heartbeat:', error);
    }
  }

  /**
   * Register gateway with backend
   */
  async registerGateway(): Promise<void> {
    if (!this.isOnline) {
      console.log('[Sync] Offline - will register when online');
      return;
    }

    try {
      await axios.post(
        `${config.apiUrl}/api/iot/gateways`,
        {
          gatewayId: config.gatewayId,
          kennelId: config.kennelId,
          status: 'online',
        },
        {
          headers: {
            'X-API-Key': config.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );
      
      console.log('[Sync] Gateway registered with backend');
    } catch (error) {
      console.error('[Sync] Failed to register gateway:', error);
    }
  }

  /**
   * Stop sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    console.log('[Sync] Sync service stopped');
  }
}

export const syncService = new SyncService();
