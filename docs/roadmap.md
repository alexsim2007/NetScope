# Roadmap and release gates

## Release validation gates

- Run physical DIR-815S S1 acceptance; validate nonce expiry, actual payload schema, counter directions, and RSSI encoding.
- Execute the Windows CI build and installer smoke test. The macOS build is not evidence for Windows behavior.
- Verify native notifications with OS permission and router events on both platforms.
- Review idle/tray CPU and memory, multi-day history compaction, network changes, sleep/wake, disk-full behavior, and accessibility on target machines.
- Obtain signing identities for a signed/notarized macOS release and a signed Windows release, or label distribution explicitly unsigned.

## Richer read-only integration

Research additional API categories, DHCP leases, WAN and system information, and extra adapters only using authorized devices and reproducible synthetic fixtures. Add keychain-backed optional credential persistence, locale support, durable map layouts, explicit interface-change hooks, and more detailed diagnostics without exporting network data by default.

## Router control

Requires independent API research, capability gating, explicit confirmations, safe rollback where feasible, and hardware tests. Potential Wi-Fi configuration, DHCP reservations, guest networks, QoS, restart, and backups. No writes belong in this build.

## Advanced monitoring

Exports with redaction, richer availability reports, multiple simultaneous routers, plugin architecture, and long-term aggregates. Preserve local-first operation and clear unknown values.

## Stable release

Stable schemas and adapter contracts, demonstrated multi-vendor support, signed releases when identities are available, performance budgets, and completed cross-platform acceptance.
