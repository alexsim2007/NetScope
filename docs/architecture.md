# Architecture

NetScope ships one Tauri 2 desktop process with an embedded React UI. No production HTTP server, Python sidecar, or cloud service is needed. Vite is used only to develop/build assets.

## Native modules

- `src-tauri/src/adapters/mod.rs`: the small, read-only `RouterAdapter` boundary (`info`, `poll`). A poll returns one consistent set of observations. Splitting separate discovery/Wi-Fi/statistics getters would produce duplicate requests for this firmware; capabilities and the normalized model expose the same information without guessed endpoints.
- `adapters/dlink/auth.rs`: standard and `anweb-authenticate` challenge extraction; `digest_auth` computes MD5/SHA-family responses, qop, cnonce, and nonce count.
- `adapters/dlink/client.rs`: private address validation, pooled HTTP client, in-memory cookies, canonical signed URI, eight-second request timeout, three-second connect timeout, three-request Digest maximum, and a 4 MiB response limit.
- `adapters/dlink/parser.rs`: area 187/64 parsing, MAC normalization, deduplication, optional numeric/string fields, exact native byte counters, address merging, and conservative neighbor status.
- `services/registry.rs`: preference-preserving identity merge, first/last observation tracking, absence timeout, state events, and checked counter deltas. Negative/reset counters, missing counters, reassociation, band changes, nonpositive time, and long gaps invalidate the rate baseline.
- `services/mod.rs`: one serialized session/poller, cancellation, pause/resume, capped exponential backoff, authentication halt, atomic persistence before event publication, and native notifications.
- `database/mod.rs`: SQLx SQLite pool, migrations, observation transactions, registry, addresses, settings, events, metrics, rollups, cleanup, and bounded history queries.
- `commands.rs`: typed IPC; errors expose only stable codes and safe user-facing messages. Tests exercise real command serialization through Tauri's mock runtime.
- `lib.rs`: app lifecycle, single-instance behavior, system tray, window state, log rotation, a safe native initialization-error dialog, and graceful shutdown.

## Data ownership

The native snapshot is authoritative. React loads it and receives `netscope://snapshot` events. After subscribing and on window focus/visibility restoration it refreshes the native snapshot and history, so paused or hidden webviews recover events missed in the tray without polling the router. TanStack Query handles typed history/settings requests and invalidation; Zustand owns UI state only. Browser preferences contain sidebar width and appearance (light/dark/system); theme changes also update native window appearance and background. Credentials are never part of a snapshot, query result, device, log, or database record.

A single runtime mutex covers session replacement, collection, edits, pause, and disconnect. It prevents overlapping router polls and lost edits during collection. UI snapshot reads do not wait on HTTP. A candidate connection is authenticated and parsed before replacing a working session. A failed attempt cannot switch to Demo Mode.

Each successful poll uses the same timestamp for reconciliation, metrics, and its connected-device sample. Data and events commit together, then the frontend receives the snapshot. SQLite failures show a storage error and invalidate current availability rather than claiming a saved sample. Failed router polls preserve history and set availability to unknown; they do not create offline events for every client.

## Scheduling and lifecycle

Default collection is a single combined 187/64 request every five seconds. Polls are sequential, with no accumulating interval backlog. Failures back off to at most 300 seconds; bad credentials, malformed Digest, and HTTP 403 halt retries until setup is corrected. Other network/HTTP/JSON errors retry automatically. Pausing freezes observation history and shows unknown current availability. Resuming wakes the native loop.

After sleep or a long gap, the next poll invalidates the old counter baseline and restores availability from new evidence. Network changes are handled by subsequent requests and retry rather than OS-specific SSID watchers. Do not claim immediate network-interface change detection. Closing hides the window when enabled. Full quit cancels the loop, immediately cancels an in-flight request, drops the adapter and session secrets, and closes both pools.

## History

Raw metrics and network counts are retained for up to 24 hours, then compacted in complete five-minute buckets, checked every ten minutes. Retention is 1–30 days. Each metric table is additionally capped at 500,000 rows and events at 50,000. Charts return approximately 480 buckets. Aggregated link rates/RSSI are averages and network counts can be fractional at longer ranges.

The device registry and manual preferences are retained independently of measurement retention. SQLite reuses freed pages; the database file does not immediately shrink after deletions. This is not a fixed byte quota. Rollups and cap enforcement run on successful collection, so paused/disconnected databases are cleaned when collection resumes.

## UI modules

`app/App.tsx` owns the desktop shell and routes; the main navigation exposes Overview, Devices, Network Map and Activity. Activity combines traffic and events; router details are reachable from Settings and the overview connection summary. The overview shows five devices with favorites prioritized. Address, MAC, radio and traffic detail belongs in the selected device drawer. Appearance uses semantic color variables across lists, charts, maps, dialogs and native window backgrounds. `NetworkGraph` maps observations into logical edges, retains both measured node dimensions and dragged positions while replacing observation data, and supports pan/zoom/fit/reset. Unknown physical links are dashed. `DeviceDetails` edits local metadata and reads per-device metrics/events. `MetricChart` preserves nulls and labels unverified TX/RX directions, raw RSSI, and radio link rate explicitly.

Availability reconciliation retains the last known state separately from an outage's unknown state, preventing duplicate offline/online events after recovery. Missing neighbor data retains the previously reported addresses and their original observation timestamp. History requests carry the active mode/router context, so a delayed live request cannot appear in a demo view. Outage, pause and device-offline events produce null buckets for all metrics.

Connection errors carry only static stage/cause enums (contact, authentication, response; timeout, permission, no route, refusal, closed connection or protocol). Logs never include the underlying reqwest exception. A separate reachability command performs one unauthenticated GET to the same fixed endpoint and returns only the HTTP status and whether a supported Digest challenge is present. It does not sign in, store a profile or collect devices.
