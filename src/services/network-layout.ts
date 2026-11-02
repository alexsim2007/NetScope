const nodeSize = { width: 156, height: 120 };

// Stable, relaxed radial layout. Only the router has connections; nearby clients
// repel each other to leave room for their labels, without implying extra links.
export function networkLayout(deviceIds: string[], compact: boolean) {
  const ids = [...deviceIds].sort();
  const radius = compact ? 138 : 184;
  const points = ids.map((id, index) => {
    const seed = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    const angle =
      -Math.PI / 2 +
      (index * Math.PI * 2) / Math.max(ids.length, 1) +
      ((seed % 100) / 100 - 0.5) * 0.3;
    const distance = radius + (index % 3) * 19 + Math.max(0, ids.length - 8) * 7;
    return { id, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  });
  const center = { x: 0, y: 0 };
  // Resolve label rectangles as well as dots, including the central router label.
  for (let step = 0; step < 100; step++) {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const length = Math.hypot(point.x, point.y) || 1;
      const spring = (length - (radius + (i % 3) * 19)) * 0.012;
      point.x -= (point.x / length) * spring;
      point.y -= (point.y / length) * spring;
      for (const other of [center, ...points.slice(0, i)]) {
        const dx = point.x - other.x;
        const dy = point.y - other.y;
        const overlapX = nodeSize.width + 18 - Math.abs(dx);
        const overlapY = nodeSize.height + 16 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const fixed = other === center;
        if (overlapX < overlapY) {
          const shift = Math.sign(dx || 1) * (overlapX / (fixed ? 1 : 2) + 0.1);
          point.x += shift;
          if (!fixed) other.x -= shift;
        } else {
          const shift = Math.sign(dy || 1) * (overlapY / (fixed ? 1 : 2) + 0.1);
          point.y += shift;
          if (!fixed) other.y -= shift;
        }
      }
    }
  }
  return {
    ...nodeSize,
    router: { x: -nodeSize.width / 2, y: -60 },
    devices: points.map(({ id, x, y }) => ({
      id,
      position: { x: x - nodeSize.width / 2, y: y - 60 },
    })),
  };
}
