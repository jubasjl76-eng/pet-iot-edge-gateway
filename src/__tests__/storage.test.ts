import { describe, it, expect, beforeEach, vi } from 'vitest';

// storage/index.ts constructs a Storage from config.sqlitePath at import time —
// point it at an in-memory DB for the test.
vi.mock('../config/index.js', () => ({
  config: { sqlitePath: ':memory:', kennelId: 'home', offlineQueueLimit: 1000 },
}));

const { storage } = await import('../storage/index.js');

describe('storage: schedules + local command queue', () => {
  it('upserts, lists, deletes schedules', () => {
    const s = storage.upsertSchedule({
      deviceId: 'feeder-01', deviceType: 'feeder', time: '08:00', amount: 40, enabled: true,
    });
    expect(s.id).toBeTruthy();
    expect(storage.listSchedules('feeder-01')).toHaveLength(1);

    const updated = storage.upsertSchedule({ ...s, amount: 55 });
    expect(updated.amount).toBe(55);
    expect(storage.listSchedules()).toHaveLength(1); // upsert, not insert

    storage.markScheduleFired(s.id, 1_700_000_000_000);
    expect(storage.listSchedules()[0].lastFiredAt).toBe(1_700_000_000_000);

    expect(storage.deleteSchedule(s.id)).toBe(true);
    expect(storage.listSchedules()).toHaveLength(0);
  });

  it('enqueues a LAN command, delivers, then resolves on ack', () => {
    const { id } = storage.enqueueLocalCommand({
      deviceId: 'feeder-01', deviceType: 'feeder', command: 'feed', params: { amount: 25 },
    });
    const pending = storage.getPendingLocalCommands();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, command: 'feed', params: { amount: 25 } });

    storage.markLocalCommandDelivered(id, 'cmd-abc');
    expect(storage.getPendingLocalCommands()).toHaveLength(0);

    storage.resolveLocalCommandByCommandId('cmd-abc', 'ok');
    const recent = storage.recentLocalCommands() as any[];
    expect(recent[0].status).toBe('acked');
    expect(recent[0].ackResult).toBe('ok');
  });
});
