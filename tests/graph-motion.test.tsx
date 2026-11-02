import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphMotion } from '../src/components/useGraphMotion';

let scheduled: FrameRequestCallback;
beforeEach(() => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    scheduled = callback;
    return 1;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

function mountMotion() {
  let nodes: Node[] = [
    { id: 'router', position: { x: 0, y: 0 }, data: {} },
    { id: 'client', position: { x: 200, y: -100 }, data: {} },
  ];
  const surface = { current: document.createElement('div') };
  const setNodes = vi.fn((next: Node[] | ((old: Node[]) => Node[])) => {
    nodes = typeof next === 'function' ? next(nodes) : next;
  });
  const getNodes = () => nodes;
  const hook = renderHook(() => useGraphMotion(setNodes, getNodes, surface));
  return { ...hook, getNodes, setNodes };
}

describe('graph motion lifecycle', () => {
  it('moves clients with bounded steps and throttles animation frames', () => {
    const { getNodes, setNodes, unmount } = mountMotion();
    act(() => scheduled(10));
    expect(setNodes).not.toHaveBeenCalled();
    act(() => scheduled(40));
    expect(Math.abs(getNodes()[0].position.x)).toBeLessThan(1);
    expect(getNodes()[1].position).not.toEqual({ x: 200, y: -100 });
    expect(Math.abs(getNodes()[1].position.x - 200)).toBeLessThan(6);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('respects reduced-motion without updating node positions', () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
    const { setNodes } = mountMotion();
    act(() => scheduled(40));
    act(() => scheduled(80));
    expect(setNodes).not.toHaveBeenCalled();
  });

  it('stops updating while the document is hidden and resumes on return', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { setNodes } = mountMotion();
    act(() => scheduled(40));
    expect(setNodes).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    act(() => scheduled(80));
    expect(setNodes).toHaveBeenCalledOnce();
  });
});
