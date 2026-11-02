import { useQuery } from '@tanstack/react-query';
import { api } from './ipc';
export const useSnapshot = () =>
  useQuery({
    queryKey: ['snapshot'],
    queryFn: api.snapshot,
    staleTime: Infinity,
    retry: 1,
  });
export function useMetrics(seconds: number, deviceId: string | null = null) {
  const { data: snapshot } = useSnapshot();
  const context = snapshot?.router ? { mode: snapshot.mode, routerId: snapshot.router.id } : null;
  return useQuery({
    queryKey: ['metrics', snapshot?.mode, snapshot?.router?.id, seconds, deviceId],
    queryFn: () => (context ? api.metrics(seconds, deviceId, context) : Promise.resolve([])),
    enabled: !!snapshot?.router,
    staleTime: 4000,
  });
}
export function useEvents(deviceId: string | null = null) {
  const { data: snapshot } = useSnapshot();
  const context = snapshot?.router ? { mode: snapshot.mode, routerId: snapshot.router.id } : null;
  return useQuery({
    queryKey: ['events', snapshot?.mode, snapshot?.router?.id, deviceId],
    queryFn: () => (context ? api.events(deviceId, context) : Promise.resolve([])),
    enabled: !!snapshot?.router,
    staleTime: 4000,
  });
}
