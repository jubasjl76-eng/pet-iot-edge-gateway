import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/core';
import { scrub } from '../instrument.js';

describe('Sentry beforeSend scrub', () => {
  it('drops bearer / api-key / cookie headers and parsed cookies', () => {
    const event = {
      request: {
        url: '/commands',
        headers: {
          authorization: 'Bearer secret',
          'x-api-key': 'smart-pet-api-key-2026',
          cookie: 'sid=abc',
          'user-agent': 'x',
        },
        cookies: { sid: 'abc' },
      },
    } as unknown as ErrorEvent;

    const out = scrub(event);
    expect(out.request?.headers).toEqual({ 'user-agent': 'x' });
    expect(out.request?.cookies).toBeUndefined();
  });

  it('is a no-op with no request', () => {
    const event = { message: 'boom' } as ErrorEvent;
    expect(scrub(event)).toBe(event);
  });
});
