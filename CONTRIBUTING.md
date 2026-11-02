# Contributing

Use Node 24 and stable Rust with the Tauri prerequisites. Run `npm ci`, then `npm run tauri dev`.

Keep modules small and strictly typed. Preserve null/missing observations; do not synthesize live data, infer physical topology, convert raw RSSI without evidence, or label radio link rate as internet speed. All router operations in 0.1 must be read-only.

Add meaningful tests for protocol parsing, identity reconciliation, counter discontinuities, persistence, and visible UI behavior. Run `npm run check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `cargo fmt --check` before opening a PR. Use `npx prettier --write` for frontend formatting and `cargo fmt` for Rust.

Use only synthetic data in fixtures and screenshots. Never commit a real database, router response, password, cookie, Digest header, packet capture, or unredacted network screenshot. Discuss schema changes and migrations explicitly. New hardware support needs documented evidence and a hardware acceptance record.
