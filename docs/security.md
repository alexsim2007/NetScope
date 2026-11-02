# Security and privacy

## Connection boundary

The native backend accepts explicitly entered RFC1918 IPv4 literal router addresses, with optional HTTP/HTTPS and a port. It rejects public/loopback addresses, DNS hostnames, user information, non-root paths, queries, fragments, and non-HTTP schemes. Device records can contain IPv6 addresses. IPv6 router endpoints are a current limitation.

Only a fixed GET path and the two researched categories can be requested. Reqwest redirects and environment proxies are disabled. HTTPS validation is left enabled; invalid certificates produce a safe connection failure. There are no router mutation commands and no generic URL-fetch or shell command exposed to the frontend. No LAN scanning occurs.

Digest authentication avoids sending a reusable plaintext password in the HTTP request, but **does not encrypt statistics or protect the complete HTTP channel**. This router firmware should be used on a trusted LAN. TLS is supported if a selected device offers a valid HTTPS endpoint; do not disable verification to accommodate an untrusted certificate.

## Credential lifetime

Setup sends the password once over the internal Tauri IPC channel. The frontend clears the password field after the attempt and never places it in Zustand, TanStack Query results, localStorage, environment files, or SQLite. Rust owns the session secret in a `Zeroizing<String>` and drops it on session replacement, disconnect, or shutdown. The password is not returned through IPC. HTTP sessions/cookies live only in memory. Zeroization of the owned secret does not guarantee erasure of every transient HTTP/library/JavaScript allocation or protection from a compromised operating system.

This release deliberately uses **session-only** secrets rather than implementing persistent keychain storage. Users re-enter credentials after a restart. macOS Keychain/Windows Credential Manager persistence is a separate future task, not a claimed feature.

## Desktop permissions

The production CSP permits local assets and Tauri IPC. No remote scripts, fonts, frames, analytics, HTTP frontend access, filesystem frontend access, or shell access are configured. Only the `main` window can listen/unlisten to events, set its native theme/background, and request/check notification permission. Custom app commands accept typed validated inputs. Native HTTP remains behind the fixed adapter boundary. Notification permission is requested only when the user enables it in Settings. Native-only dialogs handle initialization failures without exposing raw exceptions or granting frontend file permissions.

Logs use static messages and retry counters. They do not include HTTP errors with URLs, response bodies, headers, device identities, usernames, passwords, cookies, or Digest material. Seven daily files are retained. Native notifications may contain device names when enabled; users can turn them off or limit device events to favorites. Demo notifications are always suppressed.

## Local data

The live database contains home-network observations and is **not encrypted**. It relies on OS account/file access protections. Live and demo databases are separate, including rollups and events. User preferences and historical device records persist across restarts. Databases, WAL files, logs, env secrets, certificates, and build output are gitignored.

Do not upload a live database, packet capture, crash dump, HTTP headers, or an unredacted screenshot to an issue. Use Demo Mode and the synthetic locally administered MAC fixtures. Review staged files before publication.

## Reporting

No maintainer security address has been configured yet. For an eventual public repository, enable GitHub private vulnerability reporting before release. Never place credentials or raw network data into a public issue.

The password-free reachability check uses the same validated private IPv4 endpoint and disables redirects/proxies. It returns HTTP status and a Digest-support boolean only. Connection diagnostics log static stage/cause enums, never raw exception chains or HTTP headers.
