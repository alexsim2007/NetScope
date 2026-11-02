import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Node } from '@xyflow/react';
import { GraphPhysics } from '../services/graph-physics';

export function useGraphMotion<T extends Node>(
  setNodes: Dispatch<SetStateAction<T[]>>,
  getNodes: () => T[],
  surface: RefObject<HTMLDivElement | null>,
) {
  const physics = useRef(new GraphPhysics());
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let visible = true;
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          });
    if (surface.current) observer?.observe(surface.current);
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (media.matches || !visible || document.hidden) {
        last = 0;
        return;
      }
      if (time - last < 15) return;
      const elapsed = last ? time - last : 1000 / 60;
      last = time;
      const nodes = getNodes();
      if (!nodes.length) return;
      const positions = physics.current.step(nodes, elapsed, time);
      setNodes(
        nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
      );
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [setNodes, getNodes, surface]);

  const dragStart = useCallback(
    (node: T) => physics.current.startDrag(node, performance.now()),
    [],
  );
  const drag = useCallback((node: T) => physics.current.drag(node, performance.now()), []);
  const dragStop = useCallback((node: T) => physics.current.stopDrag(node, performance.now()), []);
  const reset = useCallback(() => physics.current.reset(), []);
  return { dragStart, drag, dragStop, reset };
}
