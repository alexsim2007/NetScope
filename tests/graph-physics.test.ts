import { describe, expect, it } from 'vitest';
import { GraphPhysics, type PhysicsNode } from '../src/services/graph-physics';

const fixture = (): PhysicsNode[] => [
  { id: 'router', position: { x: 0, y: 0 } },
  { id: 'a', position: { x: 200, y: 0 } },
  { id: 'b', position: { x: -200, y: 0 } },
  { id: 'c', position: { x: 0, y: 200 } },
];
function advance(physics: GraphPhysics, nodes: PhysicsNode[], count: number) {
  for (let frame = 0; frame < count; frame++) {
    const positions = physics.step(nodes, 1000 / 60, (frame * 1000) / 60);
    nodes = nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
  }
  return nodes;
}

describe('graph spring physics', () => {
  it('preserves release momentum and transmits a pull through the hub', () => {
    const physics = new GraphPhysics();
    let nodes = advance(physics, fixture(), 1);
    physics.startDrag(nodes[1], 0);
    nodes[1] = { ...nodes[1], position: { x: 280, y: -60 } };
    physics.drag(nodes[1], 80);
    physics.stopDrag(nodes[1], 80);
    const releasedX = nodes[1].position.x;
    nodes = advance(physics, nodes, 1);
    expect(nodes[1].position.x).toBeGreaterThan(releasedX + 5);
    nodes = advance(physics, nodes, 30);
    expect(Math.hypot(nodes[0].position.x, nodes[0].position.y)).toBeGreaterThan(3);
    expect(Math.hypot(nodes[2].position.x + 200, nodes[2].position.y)).toBeGreaterThan(1);
  });

  it('rearranges a dragged node instead of restoring its old angle', () => {
    const physics = new GraphPhysics();
    let nodes = advance(physics, fixture(), 1);
    physics.startDrag(nodes[1], 0);
    nodes[1] = { ...nodes[1], position: { x: 0, y: -220 } };
    physics.drag(nodes[1], 80);
    physics.stopDrag(nodes[1], 300);
    nodes = advance(physics, nodes, 240);
    expect(nodes[1].position.y).toBeLessThan(-90);
  });

  it('separates overlapping labels without unstable or unbounded coordinates', () => {
    const physics = new GraphPhysics();
    const nodes = fixture();
    nodes[2].position = { ...nodes[1].position };
    const result = advance(physics, nodes, 600);
    expect(
      Math.hypot(
        result[1].position.x - result[2].position.x,
        result[1].position.y - result[2].position.y,
      ),
    ).toBeGreaterThan(120);
    for (const node of result) {
      expect(Number.isFinite(node.position.x) && Number.isFinite(node.position.y)).toBe(true);
      expect(Math.hypot(node.position.x, node.position.y)).toBeLessThan(1000);
    }
  });
});
