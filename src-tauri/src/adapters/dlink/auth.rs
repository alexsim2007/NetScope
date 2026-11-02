use crate::error::{Error, Result};
use digest_auth::{AuthContext, WwwAuthenticateHeader};
use reqwest::header::HeaderMap;

pub fn challenge(headers: &HeaderMap) -> Result<WwwAuthenticateHeader> {
    let value = headers
        .get("anweb-authenticate")
        .or_else(|| headers.get("www-authenticate"))
        .and_then(|h| h.to_str().ok())
        .ok_or(Error::Digest)?;
    let prompt = digest_auth::parse(value).map_err(|_| Error::Digest)?;
    if prompt.nonce.is_empty() {
        return Err(Error::Digest);
    }
    Ok(prompt)
}
pub fn authorize(
    prompt: &mut WwwAuthenticateHeader,
    username: &str,
    password: &str,
    uri: &str,
) -> Result<String> {
    prompt
        .respond(&AuthContext::new(username, password, uri))
        .map(|h| h.to_string())
        .map_err(|_| Error::Digest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rfc_2617_digest_vector_and_nonce_count() {
        let mut h = HeaderMap::new();
        h.insert("anweb-authenticate", r#"Digest realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41""#.parse().unwrap());
        let mut p = challenge(&h).unwrap();
        let mut c = AuthContext::new("Mufasa", "Circle Of Life", "/dir/index.html");
        c.set_custom_cnonce("0a4f113b");
        let a = p.respond(&c).unwrap().to_string();
        assert!(a.contains("6629fae49393a05397450978507c4ef1"));
        assert!(a.contains("nc=00000001"));
        assert!(p.respond(&c).unwrap().to_string().contains("nc=00000002"));
    }
    #[test]
    fn rejects_basic_or_missing_challenge() {
        assert!(challenge(&HeaderMap::new()).is_err());
        let mut h = HeaderMap::new();
        h.insert("www-authenticate", "Basic realm=router".parse().unwrap());
        assert!(challenge(&h).is_err());
    }
    #[test]
    fn supports_standard_header_and_legacy_no_qop() {
        let mut h = HeaderMap::new();
        h.insert(
            "www-authenticate",
            r#"Digest realm="router", nonce="abc""#.parse().unwrap(),
        );
        let mut p = challenge(&h).unwrap();
        assert!(authorize(
            &mut p,
            "admin",
            "secret",
            "/devinfo?area=187%7C64&need_auth=1&mandatory=1"
        )
        .unwrap()
        .starts_with("Digest "));
    }
}
