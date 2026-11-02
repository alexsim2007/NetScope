# Router adapters

Implement `RouterAdapter: Send + Sync` with `info() -> RouterInfo` and `async poll() -> Result<Vec<Device>>`. An adapter owns its HTTP/session state. It may only read the explicitly selected router. The monitoring engine owns scheduling, reconciliation, persistence, error recovery, notifications, and cancellation.

## D-Link DIR-815S S1

Only the user-supplied, confirmed request is used:

```http
GET /devinfo?area=187%7C64&need_auth=1&mandatory=1
Accept: application/json
```

On HTTP 401, prefer `anweb-authenticate`, then standard `WWW-Authenticate`. The Digest URI is exactly the request path and encoded query. Cache the prompt and increment nonce count on subsequent authenticated requests. Replace it on a fresh challenge; permit one further stale-nonce exchange within a maximum of three HTTP requests. An ordinary second 401 means authentication failed. Session cookies are maintained by the native client. Redirects are returned as errors.

Response format must include both `result["187"]` and `result["64"]` arrays. Empty arrays are valid. Missing categories, malformed JSON, or an oversized response fail the observation. Unknown extra fields are ignored. Invalid/multicast/zero MAC records are skipped. No broad network discovery, ARP sweep, or port scan is performed.

Area 187 supplies neighbor flags, MAC, hostname, and addresses. `br0` does not imply Ethernet. Reachable/permanent means online evidence; stale/delay/probe remains stale. Area 64 supplies current Wi-Fi membership, MAC, hostname, band, standard, SSID, connection age, link rate, raw RSSI, byte counters, and sleep flag. Wi-Fi membership is tracked separately so a reachable WLAN neighbor absent from area 64 cannot inflate the Wi-Fi client KPI.

Only these capabilities are enabled: `device_discovery`, `wifi_clients`, `network_neighbors`, `traffic_counters`. The selected profile supplies manufacturer/model/revision metadata. Firmware/system/WAN information is not guessed from that profile.

## Identity and metrics

Identity is `router origin + normalized MAC`. Demo uses its own fixed namespace and database. Multiple addresses merge under one MAC. Names are not sufficient to merge randomized identities. A locally administered MAC receives a visible note; users can name/type/icon it manually.

`rate_bps = checked(current_bytes - previous_bytes) * 8000 / elapsed_ms`. Counter resets/wraps are treated as missing rate observations, because the counter width is not confirmed. Directions are named Router TX/RX until the hardware test verifies their meaning. Raw RSSI must not become dBm, signal percentage, or quality classifications without firmware evidence.

## Adding support

1. Research an explicitly authorized device and obtain sanitized representative payloads.
2. Implement a read-only adapter with its own validation/session behavior.
3. Declare only demonstrated capabilities and wire its setup profile.
4. Add parser/protocol tests, offline/reset cases, registry compatibility, and a manual hardware report.
5. Update the support table. Do not expose unsupported controls as functioning buttons.

No other vendor support or router write API is implemented in this build.
