use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Не удалось изменить автозапуск. Проверьте разрешения системы.")]
    Autostart,
    #[error("Не удалось показать уведомление. Проверьте разрешение в настройках системы.")]
    Notification,
    #[error("Не удалось открыть Telegram. Напишите разработчику: @allllllIlIl.")]
    ExternalOpen,
    #[error("Запрос отменён.")]
    Cancelled,
    #[error("Активная сеть изменилась. Обновите страницу.")]
    Context,
    #[error("Укажите локальный IPv4-адрес. Можно добавить http://, https:// и порт.")]
    Address,
    #[error("Не удалось войти. Проверьте имя пользователя и пароль маршрутизатора.")]
    Authentication,
    #[error("Маршрутизатор вернул неподдерживаемый запрос Digest-авторизации.")]
    Digest,
    #[error(
        "Не удалось связаться с маршрутизатором. Проверьте адрес, сеть и разрешение доступа к локальной сети."
    )]
    Network,
    #[error("{stage}: {cause}")]
    Connection {
        stage: NetworkStage,
        cause: NetworkCause,
    },
    #[error("Маршрутизатор запретил доступ (HTTP 403). Проверьте права учётной записи.")]
    Forbidden,
    #[error("Маршрутизатор вернул HTTP {0}. Повторите попытку позже.")]
    Http(u16),
    #[error("Ответ маршрутизатора слишком большой или имеет неподдерживаемый формат.")]
    Format,
    #[error("Ошибка локальной базы. Проверьте свободное место и перезапустите NetScope.")]
    Database,
    #[error("Сначала подключите маршрутизатор или откройте демосеть.")]
    NotConnected,
    #[error("Наблюдение на паузе. Возобновите его перед обновлением.")]
    Paused,
    #[error("Проверьте настройки: обновление 5–300 с; таймаут 30–3600 с, не меньше двух интервалов; история 1–30 дней.")]
    Settings,
    #[error("Устройство не найдено в активной сети.")]
    Device,
}

#[derive(Clone, Copy, Debug, thiserror::Error)]
pub enum NetworkStage {
    #[error("Подключение к маршрутизатору")]
    Contact,
    #[error("Авторизация")]
    Authentication,
    #[error("Получение списка устройств")]
    Response,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum NetworkCause {
    #[error("время ожидания истекло. Проверьте адрес и повторите попытку.")]
    Timeout,
    #[error("система или сетевой фильтр заблокировали доступ. Разрешите NetScope доступ к локальной сети и перезапустите приложение.")]
    Permission,
    #[error("в соединении отказано. Проверьте адрес, порт и протокол HTTP/HTTPS.")]
    Refused,
    #[error("нет маршрута до устройства. Проверьте Wi-Fi/Ethernet, VPN и разрешение локальной сети, затем перезапустите NetScope.")]
    Unreachable,
    #[error("маршрутизатор закрыл соединение. Повторите попытку или проверьте его веб-интерфейс.")]
    Closed,
    #[error("получен некорректный HTTP-ответ.")]
    Protocol,
    #[error("не удалось подключиться. Проверьте адрес и доступ к локальной сети.")]
    Other,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}
impl From<Error> for CommandError {
    fn from(e: Error) -> Self {
        let code = match &e {
            Error::Autostart => "autostart",
            Error::Notification => "notification",
            Error::ExternalOpen => "external_open",
            Error::Cancelled => "cancelled",
            Error::Context => "context_changed",
            Error::Address => "address",
            Error::Authentication => "authentication",
            Error::Digest => "digest",
            Error::Network => "network",
            Error::Connection { cause, .. } => match cause {
                NetworkCause::Timeout => "network_timeout",
                NetworkCause::Permission => "network_permission",
                NetworkCause::Refused => "network_refused",
                NetworkCause::Unreachable => "network_unreachable",
                NetworkCause::Closed => "network_closed",
                NetworkCause::Protocol => "network_protocol",
                NetworkCause::Other => "network",
            },
            Error::Forbidden => "forbidden",
            Error::Http(_) => "http",
            Error::Format => "format",
            Error::Database => "database",
            Error::NotConnected => "not_connected",
            Error::Paused => "paused",
            Error::Settings => "settings",
            Error::Device => "device",
        };
        Self {
            code: code.into(),
            message: e.to_string(),
        }
    }
}
impl From<sqlx::Error> for Error {
    fn from(_: sqlx::Error) -> Self {
        Self::Database
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::Format
    }
}
pub type Result<T> = std::result::Result<T, Error>;
