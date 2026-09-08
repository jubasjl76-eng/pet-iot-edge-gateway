import { describe, it, expect } from 'vitest';
import { buildTopic, parseTopic, deliveryFor, buildCommand, isLegacyTopic } from '../protocol.js';

describe('protocol (vendored v2 subset)', () => {
  it('builds and parses', () => {
    const t = buildTopic('home', 'feeder', 'feeder-01', 'command');
    expect(t).toBe('kennel/home/feeder/feeder-01/command');
    expect(parseTopic(t)).toEqual({ kennelId: 'home', deviceType: 'feeder', deviceId: 'feeder-01', leaf: 'command' });
  });

  it('rejects legacy / malformed', () => {
    expect(parseTopic('dogs/c1/location')).toBeNull();
    expect(parseTopic('kennel/home/feeder/f1')).toBeNull();
    expect(parseTopic('kennel/home/toaster/x/status')).toBeNull();
    expect(isLegacyTopic('dogs/c1/location')).toBe(true);
    expect(isLegacyTopic('kennel/home/gps/c1/location')).toBe(false);
  });

  it('delivery policy', () => {
    expect(deliveryFor('command')).toEqual({ qos: 2, retain: false });
    expect(deliveryFor('status')).toEqual({ qos: 1, retain: true });
    expect(deliveryFor('temperature')).toEqual({ qos: 1, retain: false });
  });

  it('buildCommand adds an id + envelope', () => {
    const c = buildCommand('home', 'feeder-01', 'feed', { amount: 30 });
    expect(c).toMatchObject({ command: 'feed', deviceId: 'feeder-01', kennelId: 'home', params: { amount: 30 } });
    expect(c.id).toMatch(/-/);
    expect(typeof c.timestamp).toBe('number');
  });
});
