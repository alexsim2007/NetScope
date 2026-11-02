import { Copy, ExternalLink, MessageCircle, Router, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../services/ipc';
import { FEEDBACK_TEMPLATE, TELEGRAM_HANDLE } from '../services/support';
import { useUI } from '../stores/ui';
import { PageTitle, Panel } from '../components/ui';

export default function Support() {
  const notify = useUI((s) => s.notify);
  return (
    <div className="support-page">
      <PageTitle title="Обратная связь">Ошибки, идеи и поддержка новых маршрутизаторов.</PageTitle>
      <Panel
        title="Написать разработчику"
        subtitle="Сообщения просматриваем вручную. Из предложений выбираем следующие улучшения."
      >
        <div className="support-contact">
          <MessageCircle size={34} />
          <div>
            <strong>Telegram {TELEGRAM_HANDLE}</strong>
            <p>Опишите задачу или проблему. Скриншоты лучше делать в деморежиме.</p>
          </div>
        </div>
        <div className="support-actions">
          <button
            className="button primary"
            onClick={() => void api.openFeedback().catch((e) => notify(errorMessage(e)))}
          >
            Открыть Telegram <ExternalLink size={14} />
          </button>
          <button
            className="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(FEEDBACK_TEMPLATE)
                .then(() => notify('Шаблон скопирован'))
                .catch(() => notify('Буфер обмена недоступен'))
            }
          >
            <Copy size={14} /> Скопировать шаблон
          </button>
        </div>
      </Panel>
      <Panel title="Что нужно для поддержки маршрутизатора" action={<Router size={18} />}>
        <ol className="router-support-steps">
          <li>
            <strong>Модель, ревизия, прошивка</strong>
            <p>
              Точное название с наклейки, аппаратная ревизия и версия прошивки. Достаточно текста
              без серийного номера.
            </p>
          </li>
          <li>
            <strong>Доступный интерфейс чтения</strong>
            <p>
              Документация API или описание запросов списка клиентов из веб-интерфейса. Нужны путь
              запроса, метод, формат ответа и тип авторизации.
            </p>
          </li>
          <li>
            <strong>Обезличенный пример</strong>
            <p>
              Небольшой JSON с вымышленными именами, IP и MAC. Сохраните названия полей, типы,
              пустые значения и единицы измерения. Удалите все секреты.
            </p>
          </li>
          <li>
            <strong>Проверка на устройстве</strong>
            <p>
              После добавления адаптера проверяем подключение, обнаружение клиентов, обновление
              данных и восстановление после разрыва связи.
            </p>
          </li>
        </ol>
        <div className="read-only-note">
          <ShieldCheck size={18} />
          <span>NetScope читает данные. Пароль маршрутизатора разработчику не нужен.</span>
        </div>
      </Panel>
    </div>
  );
}
