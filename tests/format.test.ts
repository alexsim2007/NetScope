import { describe, expect, it } from 'vitest';
import { formatBytes, formatRate, eventMessage, humanize } from '../src/services/format';
describe('unknown metrics', () => {
  it('distinguishes an absent observation from an actual zero', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(0)).toBe('0,0 Кбит/с');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(0)).toBe('0,0 КБ');
  });
});

describe('Russian historical events', () => {
  it('translates historical names without trimming device characters', () => {
    const event = {
      id: 'test',
      routerId: 'demo',
      deviceId: 'device',
      eventType: 'device_offline',
      message: 'My laptop is no longer observed',
      createdAt: 0,
    };
    expect(eventMessage(event)).toBe('My laptop больше не наблюдается');
    expect(humanize('online')).toBe('В сети');
    expect(humanize('device_discovered')).toBe('Новое устройство');
  });
});
