import { describe, it, expect } from 'vitest';
import { registry } from '../metrics.js';

describe('metrics registry', () => {
  it('exposes default + dependency + queue-depth metrics', async () => {
    const text = await registry.metrics();
    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('dependency_up');
    expect(text).toContain('offline_queue_depth');
    expect(text).toContain('http_request_duration_seconds'); // registered even before any request
    expect(text).toContain('service="pet-iot-edge-gateway"');
  });
});
