import { useSnapshot } from '../services/queries';
import { NetworkGraph } from '../components/NetworkGraph';
import { NetworkActions } from '../components/NetworkActions';
import { PageTitle } from '../components/ui';
export default function NetworkMap() {
  const { data } = useSnapshot();
  return (
    <div className="network-map-page">
      <PageTitle title="Карта сети" action={<NetworkActions pause />}>
        Подключения по данным маршрутизатора. Выберите устройство, чтобы открыть его панель.
      </PageTitle>
      <section className="map-workspace">{data && <NetworkGraph snapshot={data} />}</section>
      <div className="map-workspace-footer">
        <span>
          <i className="legend-line" /> Wi-Fi
        </span>
        <span>
          <i className="legend-line dashed" /> Сосед сети · физическое подключение неизвестно
        </span>
        <span className="push-right">Перетаскивайте узлы, чтобы изменить расположение</span>
      </div>
    </div>
  );
}
