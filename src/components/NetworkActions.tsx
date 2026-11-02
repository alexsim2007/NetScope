import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '../services/ipc';
import { useSnapshot } from '../services/queries';
import { useUI } from '../stores/ui';
export function NetworkActions({ pause = false }: { pause?: boolean }) {
  const { data: s } = useSnapshot();
  const client = useQueryClient();
  const notify = useUI((v) => v.notify);
  const refresh = useMutation({
    mutationFn: api.refresh,
    onSuccess: (result) => client.setQueryData(['snapshot'], result),
    onError: (e) => notify(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: () => api.pause(s?.connection !== 'paused'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['snapshot'] }),
    onError: (e) => notify(errorMessage(e)),
  });
  const active = !!s?.router && !['disconnected', 'authentication_required'].includes(s.connection);
  return (
    <div className="action-group">
      {pause && (
        <button
          className="button"
          disabled={!active || toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {s?.connection === 'paused' ? <Play size={14} /> : <Pause size={14} />}{' '}
          {s?.connection === 'paused' ? 'Продолжить' : 'Пауза'}
        </button>
      )}
      <button
        className="button"
        disabled={!active || s?.connection === 'paused' || refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        <RefreshCw size={14} className={refresh.isPending ? 'spin' : ''} />
        {refresh.isPending ? 'Обновление…' : 'Обновить'}
      </button>
    </div>
  );
}
