use super::{auth, parser};
use crate::{
    adapters::RouterAdapter,
    error::{Error, NetworkCause, NetworkStage, Result},
    models::{now, Device, RouterInfo},
};
use digest_auth::WwwAuthenticateHeader;
use reqwest::{header::AUTHORIZATION, redirect::Policy, Client, StatusCode, Url};
use std::{error::Error as _, io::ErrorKind, net::Ipv4Addr, time::Duration};
use zeroize::Zeroizing;

const URI: &str = "/devinfo?area=187%7C64&need_auth=1&mandatory=1";
const MAX_BODY: usize = 4 * 1024 * 1024;

fn connection_error(error: reqwest::Error, stage: NetworkStage) -> Error {
    let mut cause = if error.is_timeout() {
        NetworkCause::Timeout
    } else {
        NetworkCause::Other
    };
    if !error.is_timeout() {
        let mut source = error.source();
        while let Some(source_error) = source {
            if let Some(io) = source_error.downcast_ref::<std::io::Error>() {
                cause = match io.kind() {
                    ErrorKind::PermissionDenied => NetworkCause::Permission,
                    ErrorKind::ConnectionRefused => NetworkCause::Refused,
                    ErrorKind::NetworkUnreachable | ErrorKind::HostUnreachable => {
                        NetworkCause::Unreachable
                    }
                    ErrorKind::ConnectionReset
                    | ErrorKind::ConnectionAborted
                    | ErrorKind::BrokenPipe
                    | ErrorKind::UnexpectedEof => NetworkCause::Closed,
                    _ => NetworkCause::Other,
                };
                break;
            }
            source = source_error.source();
        }
        if cause == NetworkCause::Other && error.is_request() && !error.is_connect() {
            cause = NetworkCause::Protocol;
        }
    }
    // Only closed enums are logged; reqwest errors can contain URLs and must never be logged.
    tracing::warn!(?stage, ?cause, "Router connection failed");
    Error::Connection { stage, cause }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionCheck {
    pub http_status: u16,
    pub digest_available: bool,
}

pub fn validate_address(address: &str) -> Result<Url> {
    let value = if address.contains("://") {
        address.to_string()
    } else {
        format!("http://{address}")
    };
    let url = Url::parse(&value).map_err(|_| Error::Address)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(Error::Address);
    }
    let ip: Ipv4Addr = url
        .host_str()
        .ok_or(Error::Address)?
        .parse()
        .map_err(|_| Error::Address)?;
    if !ip.is_private() {
        return Err(Error::Address);
    }
    Ok(url)
}

pub struct DLinkAdapter {
    client: Client,
    base: Url,
    username: String,
    password: Zeroizing<String>,
    prompt: Option<WwwAuthenticateHeader>,
}
impl DLinkAdapter {
    pub async fn check_connection(address: &str) -> Result<ConnectionCheck> {
        let adapter = Self::with_url(
            validate_address(address)?,
            String::new(),
            Zeroizing::new(String::new()),
        )?;
        adapter.probe().await
    }
    async fn probe(&self) -> Result<ConnectionCheck> {
        let url = self.base.join(URI).map_err(|_| Error::Address)?;
        let response = self
            .client
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|error| connection_error(error, NetworkStage::Contact))?;
        Ok(ConnectionCheck {
            http_status: response.status().as_u16(),
            digest_available: auth::challenge(response.headers()).is_ok(),
        })
    }
    pub fn new(address: &str, username: String, password: String) -> Result<Self> {
        let password = Zeroizing::new(password);
        let base = validate_address(address)?;
        if username.trim().is_empty() || username.len() > 128 || password.len() > 1024 {
            return Err(Error::Authentication);
        }
        Self::with_url(base, username, password)
    }
    fn with_url(base: Url, username: String, password: Zeroizing<String>) -> Result<Self> {
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .cookie_store(true)
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(8))
            .user_agent("NetScope")
            .build()
            .map_err(|_| Error::Network)?;
        Ok(Self {
            client,
            base,
            username,
            password,
            prompt: None,
        })
    }
    async fn fetch(&mut self) -> Result<serde_json::Value> {
        let url = self.base.join(URI).map_err(|_| Error::Address)?;
        for attempt in 0..3 {
            let mut request = self
                .client
                .get(url.clone())
                .header("Accept", "application/json");
            if let Some(prompt) = &mut self.prompt {
                let value = auth::authorize(prompt, &self.username, &self.password, URI)?;
                request = request.header(AUTHORIZATION, value);
            }
            let stage = if self.prompt.is_some() {
                NetworkStage::Authentication
            } else {
                NetworkStage::Contact
            };
            let mut response = request
                .send()
                .await
                .map_err(|error| connection_error(error, stage))?;
            match response.status() {
                StatusCode::UNAUTHORIZED => {
                    let challenge = auth::challenge(response.headers())?;
                    if attempt == 2 || (attempt > 0 && !challenge.stale) {
                        self.prompt = None;
                        return Err(Error::Authentication);
                    }
                    self.prompt = Some(challenge);
                    continue;
                }
                StatusCode::FORBIDDEN => return Err(Error::Forbidden),
                StatusCode::OK => (),
                status => return Err(Error::Http(status.as_u16())),
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_BODY as u64)
            {
                return Err(Error::Format);
            }
            let mut body = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| connection_error(error, NetworkStage::Response))?
            {
                if body.len() + chunk.len() > MAX_BODY {
                    return Err(Error::Format);
                }
                body.extend_from_slice(&chunk);
            }
            return serde_json::from_slice(&body).map_err(|_| Error::Format);
        }
        Err(Error::Authentication)
    }
}
#[async_trait::async_trait]
impl RouterAdapter for DLinkAdapter {
    fn info(&self) -> RouterInfo {
        RouterInfo {
            id: format!("dlink:{}", self.base.origin().ascii_serialization()),
            name: "D-Link DIR-815S".into(),
            address: self.base.origin().ascii_serialization(),
            adapter: "dlink-dir815s-s1".into(),
            manufacturer: "D-Link".into(),
            model: "DIR-815S".into(),
            hardware_revision: "S1 (выбранный профиль)".into(),
            firmware: None,
            capabilities: [
                "device_discovery",
                "wifi_clients",
                "network_neighbors",
                "traffic_counters",
            ]
            .map(String::from)
            .to_vec(),
        }
    }
    async fn poll(&mut self) -> Result<Vec<Device>> {
        let value = self.fetch().await?;
        parser::parse(&value, &self.info().id, now())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    async fn server(responses: Vec<String>) -> (Url, tokio::task::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let task = tokio::spawn(async move {
            let mut requests = vec![];
            for response in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut data = vec![];
                loop {
                    let mut buf = [0; 2048];
                    let n = stream.read(&mut buf).await.unwrap();
                    if n == 0 {
                        break;
                    }
                    data.extend_from_slice(&buf[..n]);
                    if data.windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                requests.push(String::from_utf8(data).unwrap());
                stream.write_all(response.as_bytes()).await.unwrap();
            }
            requests
        });
        (url, task)
    }
    fn response(status: u16, headers: &str, body: &str) -> String {
        format!("HTTP/1.1 {status} Test\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n{body}", body.len())
    }
    const CHALLENGE: &str = "anweb-authenticate: Digest realm=\"router\", nonce=\"abc\", qop=\"auth\"\r\nSet-Cookie: session=mock; Path=/\r\n";
    #[tokio::test]
    async fn reachability_check_reports_challenge_without_sending_credentials() {
        let (url, task) = server(vec![response(401, CHALLENGE, "")]).await;
        let adapter =
            DLinkAdapter::with_url(url, "admin".into(), Zeroizing::new("not-sent".into())).unwrap();
        let check = adapter.probe().await.unwrap();
        assert_eq!(check.http_status, 401);
        assert!(check.digest_available);
        let requests = task.await.unwrap();
        assert_eq!(requests.len(), 1);
        assert!(!requests[0].to_lowercase().contains("authorization:"));
        assert!(!requests[0].contains("not-sent"));
    }
    #[tokio::test]
    async fn refused_connection_has_a_specific_safe_error() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        drop(listener);
        let adapter =
            DLinkAdapter::with_url(url, String::new(), Zeroizing::new(String::new())).unwrap();
        assert!(matches!(
            adapter.probe().await,
            Err(Error::Connection {
                stage: NetworkStage::Contact,
                cause: NetworkCause::Refused
            })
        ));
    }
    #[tokio::test]
    async fn custom_digest_and_cookie_round_trip() {
        let body = include_str!("../../../../tests/fixtures/devinfo.json");
        let (url, task) = server(vec![response(401, CHALLENGE, ""), response(200, "", body)]).await;
        let mut a =
            DLinkAdapter::with_url(url, "admin".into(), Zeroizing::new("test".into())).unwrap();
        assert_eq!(a.poll().await.unwrap().len(), 2);
        let requests = task.await.unwrap();
        assert!(!requests[0].to_lowercase().contains("authorization:"));
        assert!(requests[1].to_lowercase().contains("authorization: digest"));
        assert!(requests[1].contains("cookie: session=mock"));
        assert!(requests[1].contains(URI));
    }
    #[tokio::test]
    async fn wrong_password_stops_after_one_authenticated_attempt() {
        let (url, task) = server(vec![
            response(401, CHALLENGE, ""),
            response(401, CHALLENGE, ""),
        ])
        .await;
        let mut a =
            DLinkAdapter::with_url(url, "admin".into(), Zeroizing::new("wrong".into())).unwrap();
        assert!(matches!(a.poll().await, Err(Error::Authentication)));
        assert_eq!(task.await.unwrap().len(), 2);
    }
    #[tokio::test]
    async fn stale_nonce_is_replaced_and_retried_once() {
        let (url, task) = server(vec![response(401, CHALLENGE, ""), response(401, "anweb-authenticate: Digest realm=\"router\", nonce=\"fresh\", qop=\"auth\", stale=true\r\n", ""), response(200, "", r#"{"result":{"187":[],"64":[]}}"#)]).await;
        let mut a =
            DLinkAdapter::with_url(url, "admin".into(), Zeroizing::new("test".into())).unwrap();
        assert!(a.poll().await.unwrap().is_empty());
        assert!(task.await.unwrap()[2].contains("nonce=\"fresh\""));
    }
    #[tokio::test]
    async fn redirects_are_never_followed() {
        let (url, task) =
            server(vec![response(302, "Location: http://127.0.0.1:1/\r\n", "")]).await;
        let mut a =
            DLinkAdapter::with_url(url, "admin".into(), Zeroizing::new("test".into())).unwrap();
        assert!(matches!(a.poll().await, Err(Error::Http(302))));
        task.await.unwrap();
    }
    #[test]
    fn rejects_external_hosts_credentials_and_paths() {
        for a in [
            "https://example.com",
            "8.8.8.8",
            "127.0.0.1",
            "http://u:p@192.168.0.1",
            "http://192.168.0.1/devinfo",
            "http://192.168.0.1/?x=1",
            "file:///tmp/a",
        ] {
            assert!(validate_address(a).is_err(), "{a}");
        }
        assert!(validate_address("192.168.0.1").is_ok());
        assert!(validate_address("https://10.0.0.1:8443").is_ok());
    }
}
