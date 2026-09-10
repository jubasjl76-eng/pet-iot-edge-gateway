import { describe, it, expect } from 'vitest';
import { log, traceMixin } from '../log.js';

describe('log', () => {
  it('exports a usable pino logger with a child()', () => {
    expect(typeof log.info).toBe('function');
    expect(typeof log.child({ mod: 'x' }).info).toBe('function');
  });
  it('traceMixin returns {} with no active span', () => {
    expect(traceMixin()).toEqual({});
  });
});
