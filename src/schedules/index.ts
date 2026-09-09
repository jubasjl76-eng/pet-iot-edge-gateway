/**
 * Local schedule runner + LAN command queue drainer.
 *
 * This is the Pet Hub's reason to exist: feeding/watering keeps running on the
 * local clock whether or not the cloud (or even the pet owner's phone) is
 * reachable. Schedules are stored in SQLite and pushed to the cloud opportunistically.
 */
import { config } from '../config/index.js';
import { storage } from '../storage/index.js';
import { mqttGateway } from '../mqtt/index.js';
import { dueSchedules, minutesUntilNext, scheduleCommand } from './schedule-core.js';

class ScheduleRunner {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (config.scheduleTickInterval <= 0) {
      console.log('[Schedules] runner disabled (SCHEDULE_TICK_INTERVAL=0)');
      return;
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), config.scheduleTickInterval);
    console.log(`[Schedules] runner started (every ${config.scheduleTickInterval}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass: fire due schedules, then flush any queued LAN commands. */
  tick(now: Date = new Date()): void {
    try {
      const all = storage.listSchedules();
      const due = dueSchedules(all, now);
      for (const s of due) {
        const { command, params } = scheduleCommand(s);
        const ok = mqttGateway.sendDeviceCommand(s.deviceType, s.deviceId, command, params, 'schedule');
        if (ok) {
          storage.markScheduleFired(s.id, now.getTime());
          console.log(`[Schedules] fired ${s.id} → ${s.deviceId} ${command}(${JSON.stringify(params)})`);
        }
      }
      const next = minutesUntilNext(all, now);
      if (due.length === 0 && next != null && next <= 1) {
        // a schedule is imminent; nothing to do, just visibility
      }
    } catch (err) {
      console.error('[Schedules] tick error', err);
    }
    this.drainQueue();
  }

  /** Deliver LAN-queued commands (from the local HTTP API) to devices via MQTT. */
  drainQueue(): void {
    if (!mqttGateway.isConnected()) return;
    for (const cmd of storage.getPendingLocalCommands()) {
      const commandId = mqttGateway.publishCommandWithId(
        cmd.deviceType, cmd.deviceId, cmd.command, cmd.params
      );
      if (commandId) {
        storage.markLocalCommandDelivered(cmd.id, commandId);
        console.log(`[Schedules] delivered queued command ${cmd.id} (${cmd.command}) → ${cmd.deviceId}`);
      }
    }
  }
}

export const scheduleRunner = new ScheduleRunner();
