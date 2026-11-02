export type PhysicsNode = { id: string; position: { x: number; y: number }; dragging?: boolean };
type Body = { x: number; y: number; vx: number; vy: number; radius: number; phase: number };
const frameMs = 1000 / 60;

// Damped link springs and pairwise repulsion. Client positions have no fixed anchors:
// dragging changes the shape of the graph, and release preserves the throw velocity.
export class GraphPhysics {
  private bodies = new Map<string, Body>();
  private center: { x: number; y: number } | null = null;
  private dragged: {
    id: string;
    x: number;
    y: number;
    time: number;
    vx: number;
    vy: number;
  } | null = null;

  reset() {
    this.bodies.clear();
    this.center = null;
    this.dragged = null;
  }

  startDrag(node: PhysicsNode, time: number) {
    this.dragged = { id: node.id, ...node.position, time, vx: 0, vy: 0 };
  }

  drag(node: PhysicsNode, time: number) {
    const last = this.dragged;
    if (!last || last.id !== node.id) return;
    const frames = Math.max(0.5, Math.min(4, (time - last.time) / frameMs));
    const dx = node.position.x - last.x;
    const dy = node.position.y - last.y;
    this.dragged = {
      id: node.id,
      ...node.position,
      time,
      vx: last.vx * 0.4 + (dx / frames) * 0.6,
      vy: last.vy * 0.4 + (dy / frames) * 0.6,
    };
  }

  stopDrag(node: PhysicsNode, time: number) {
    const last = this.dragged;
    const body = this.bodies.get(node.id);
    if (last?.id === node.id && body) {
      // A pause before releasing must not replay an old fling.
      const freshness = Math.max(0, 1 - (time - last.time) / 120);
      body.vx = Math.max(-18, Math.min(18, last.vx * freshness));
      body.vy = Math.max(-18, Math.min(18, last.vy * freshness));
      body.x = node.position.x;
      body.y = node.position.y;
    }
    if (node.id === 'router') this.center = { ...node.position };
    this.dragged = null;
  }

  step(nodes: PhysicsNode[], elapsedMs: number, timeMs: number) {
    const router = nodes.find((node) => node.id === 'router');
    if (!router) return new Map<string, { x: number; y: number }>();
    if (!this.center) this.center = { ...router.position };
    const ids = new Set(nodes.map((node) => node.id));
    for (const id of this.bodies.keys()) if (!ids.has(id)) this.bodies.delete(id);
    for (const [index, node] of nodes.entries()) {
      const body = this.bodies.get(node.id);
      if (body) {
        body.x = node.position.x;
        body.y = node.position.y;
      } else
        this.bodies.set(node.id, {
          ...node.position,
          vx: 0,
          vy: 0,
          radius: Math.max(
            130,
            Math.hypot(node.position.x - router.position.x, node.position.y - router.position.y),
          ),
          phase: index * 2.4,
        });
    }
    // Fixed substeps keep springs stable across different refresh rates and wakeups.
    const duration = Math.max(1, Math.min(40, elapsedMs)) / frameMs;
    const substeps = Math.ceil(duration * 2);
    const dt = duration / substeps;
    const entries = [...this.bodies.entries()];
    const hub = this.bodies.get('router')!;
    for (let step = 0; step < substeps; step++) {
      const forces = new Map(entries.map(([id]) => [id, { x: 0, y: 0 }]));
      for (const [id, body] of entries) {
        const force = forces.get(id)!;
        if (id === 'router') {
          force.x += (this.center.x - body.x) * 0.003;
          force.y += (this.center.y - body.y) * 0.003;
          continue;
        }
        const dx = body.x - hub.x;
        const dy = body.y - hub.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const spring = (distance - body.radius) * 0.0045;
        force.x -= (dx / distance) * spring;
        force.y -= (dy / distance) * spring;
        forces.get('router')!.x += (dx / distance) * spring;
        forces.get('router')!.y += (dy / distance) * spring;
        // A small tangential force keeps an untouched graph slowly flowing.
        force.x += (-dy / distance) * 0.009 + Math.sin(timeMs / 1800 + body.phase) * 0.006;
        force.y += (dx / distance) * 0.009 + Math.cos(timeMs / 2100 + body.phase) * 0.006;
      }
      for (let i = 0; i < entries.length; i++) {
        const [aId, a] = entries[i];
        for (const [bId, b] of entries.slice(i + 1)) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.max(12, Math.hypot(dx, dy));
          const repel = Math.min(1.4, 900 / (distance * distance));
          let fx = (dx / distance) * repel;
          let fy = (dy / distance) * repel;
          const overlapX = 166 - Math.abs(dx);
          const overlapY = 128 - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) fx += Math.sign(dx || 1) * overlapX * 0.025;
            else fy += Math.sign(dy || 1) * overlapY * 0.025;
          }
          forces.get(aId)!.x += fx;
          forces.get(aId)!.y += fy;
          forces.get(bId)!.x -= fx;
          forces.get(bId)!.y -= fy;
        }
      }
      for (const [id, body] of entries) {
        if (id === this.dragged?.id || nodes.find((node) => node.id === id)?.dragging) continue;
        const mass = id === 'router' ? 3.5 : 1;
        const force = forces.get(id)!;
        const damping = Math.pow(0.975, dt);
        body.vx = Math.max(-20, Math.min(20, (body.vx + (force.x / mass) * dt) * damping));
        body.vy = Math.max(-20, Math.min(20, (body.vy + (force.y / mass) * dt) * damping));
        body.x += body.vx * dt;
        body.y += body.vy * dt;
      }
    }
    return new Map(entries.map(([id, body]) => [id, { x: body.x, y: body.y }]));
  }
}
