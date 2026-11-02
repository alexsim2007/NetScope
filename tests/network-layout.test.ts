import { describe, expect, it } from 'vitest';
import { networkLayout } from '../src/services/network-layout';

describe('network graph layout', () => {
  it.each([1, 2, 5, 8, 16])(
    'leaves space for every label and the router with %i clients',
    (count) => {
      const ids = Array.from({ length: count }, (_, i) => `synthetic-device-${i}`);
      for (const compact of [false, true]) {
        const layout = networkLayout(ids, compact);
        const positions = [layout.router, ...layout.devices.map((node) => node.position)];
        for (let i = 0; i < positions.length; i++) {
          const a = positions[i];
          expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
          for (const b of positions.slice(i + 1)) {
            const separated =
              Math.abs(a.x - b.x) >= layout.width || Math.abs(a.y - b.y) >= layout.height;
            expect(separated, `Overlapping labels in ${compact ? 'compact' : 'full'} graph`).toBe(
              true,
            );
          }
        }
      }
    },
  );

  it('keeps the layout stable when polling returns the same devices in a different order', () => {
    expect(networkLayout(['phone', 'laptop', 'tv'], false)).toEqual(
      networkLayout(['tv', 'phone', 'laptop'], false),
    );
  });
});
