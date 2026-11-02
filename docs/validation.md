# Validation record

Date: 2026-11-01. Development host: macOS, Apple Silicon (`arm64`). Toolchain installed for this project: Rust 1.99.1 stable; Node 24.11.1; npm 11.6.2. Resolved versions are recorded in both dependency lockfiles.

## Automated checks

| Check                                                | Result                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `cargo test --locked`                                | 29 passed; no failed or ignored tests                                     |
| `cargo clippy --locked --all-targets -- -D warnings` | Passed                                                                    |
| `cargo fmt --check`                                  | Passed                                                                    |
| `npm run lint`                                       | Passed with zero warnings                                                 |
| `npm run test`                                       | 18 passed                                                                 |
| `npm run build`                                      | Passed; production assets generated                                       |
| `npm audit --omit=dev`                               | No known production dependency vulnerabilities reported at execution time |
| `npm run tauri build -- --bundles app,dmg`           | macOS ARM64 `.app` and `.dmg` generated                                   |
| Mach-O inspection                                    | ARM64 executable                                                          |
| DMG checksum verification                            | Passed using `hdiutil verify`                                             |

Rust coverage includes the RFC Digest vector and nonce count, nonstandard/standard challenges, legacy no-qop authentication, cookie continuity, wrong credentials, stale nonce recovery, refused redirects, address restrictions, category validation, MAC normalization/deduplication, multiple IPs, neighbor versus Wi-Fi membership, raw RSSI, counter resets and reassociation, device timeouts, outage recovery without mass offline events, preferences, SQLite restoration, complete-bucket compaction, notification filters/repeat suppression, disconnect after a storage failure, and command serialization through Tauri's mock runtime.

Frontend coverage includes overview, device search and filters, selection and local rename/favorite submission, map rendering/selection, metric queries/ranges, settings IPC, native event updates, connection/startup errors, explicit demo setup, failed live authentication with password clearing, and honest empty/null-history states. The DOM environment is jsdom; these are not native end-to-end OS tests.

## Desktop and packaging

The Tauri development binary was launched and native initialization created the app-data databases and a startup log. A production `.app` and `.dmg` were built with embedded assets. No separate backend or frontend server is needed by the installed package.

Frontend visual QA verified the overview in light and black themes, persisted selection after reload, Settings, the traffic chart, and network-map nodes/edges using the development-only synthetic IPC harness. This harness is excluded from production assets. The map check exposed and fixed a controlled-node measurement bug; nodes now retain dimensions and positions across data updates. The screenshots above document this synthetic UI check, not a physical-router connection.

Native UI automation became available on 2026-11-01. It confirmed the user's connection error in the installed app and inspected System Settings: NetScope's Local Network toggle was already enabled. The app and native title bar were visually checked in the black theme. An unauthenticated native check reproduced OS host-unreachable before sign-in; toggling the existing LAN permission and restarting did not resolve it. Rebuilding with an existing Apple Development identity was followed by successful native authentication/discovery of five real devices. The user explicitly confirmed that devices are visible and continue updating. No credentials or real-device screenshots were collected for repository artifacts.
The installed app, bundled app and installer now have a **local Apple Development signature**, verified using `codesign --verify --deep --strict`. The installed and bundled executables match. This is not a Developer ID distribution signature or notarization. The final versionless installer is `artifacts/NetScope-macOS-arm64.dmg`; its SHA-256 is in `artifacts/SHA256SUMS`. No personal signing identity is stored in the repository.

## Remaining release gates

- **Physical D-Link: basic pass; extended acceptance pending.** Native authentication, five-device discovery and live refresh were confirmed. Complete [hardware-test.md](hardware-test.md) for counter directions, RSSI encoding, nonce expiry, sleep/wake and longer monitoring. No broad network scan was performed.
- **Windows: pending.** CI and NSIS packaging are configured, but the workflow has not been run from this local repository and no Windows machine was available for smoke testing.
- **Visual/macOS desktop: partial pass.** Native setup, specific connection diagnostics, black content/title bar and restored live registry were inspected. Both theme palettes, Settings, chart and map were visually checked in the synthetic UI harness. Native light-theme scaling and the full OS workflow remain manual checks.
- **OS notification/tray acceptance and multi-day soak/performance: pending.** Notification selection/cooldown logic is unit-tested; actual OS delivery is not.
- **Distribution signing/notarization and publication: pending.** An existing Apple Development identity was used for the local app and DMG. Developer ID/notarization, repository push and GitHub release publication were not performed.

This is a functioning implementation and build candidate for NetScope, **not a declaration that every hardware and platform acceptance criterion is complete**. See [roadmap.md](roadmap.md) and [releasing.md](releasing.md).

## Recovery and final packages — 2026-11-02

The interrupted session was recovered from its chat history, the supplied transcript, and the existing files. Before editing, both `npm run build` and `cargo check --locked --all-targets` passed. There were no commits in the local Git repository, so all existing source files were preserved in an ignored recovery archive under `artifacts/recovery-2026-11-02-*/source-before-resume.tar.gz`; no source reset or checkout was performed.

The latest work already present was Russian localization, the new abstract icon, the map-centered overview and device inspector, empty connection fields when selecting a router model, Telegram feedback and router-support instructions, native autostart, and background/Alcove notification settings. The interrupted final packaging was completed with the current source.

| Check                                                | Recovery result                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                      | Passed: lint, 27 tests, TypeScript and production Vite build                                                                                                          |
| `cargo check --locked --all-targets`                 | Passed before any source edits                                                                                                                                        |
| `cargo test --locked`                                | 29 passed                                                                                                                                                             |
| `cargo fmt --check`                                  | Passed                                                                                                                                                                |
| `cargo clippy --locked --all-targets -- -D warnings` | Passed                                                                                                                                                                |
| Release version gate                                 | Checks tag, manifests and both lockfiles; five new tests cover version updates, dependency preservation, stale locks, invalid tags/versions, and missing lock entries |
| macOS ARM64                                          | Explicit-target `.app` and `.dmg` build completed with local Apple Development signing; app signature and DMG checksum verified; executable is Mach-O arm64           |
| Windows x64                                          | Final NSIS installer cross-built on macOS with cargo-xwin; application payload identified as PE32+ x86-64; unsigned                                                   |
| Release asset preparation                            | Both installers copied through `scripts/prepare-release.mjs`; SHA-256 sidecars generated and verified                                                                 |

Current deliverables are `artifacts/release/NetScope-macOS-arm64.dmg` and `artifacts/release/NetScope-Windows-x64-setup.exe`, with matching `.sha256` files. The internal build version remains `0.0.0`; the release guide uses `0.1.0` as an example for the first tagged release. The older installer in the root of `artifacts/` was preserved. The installed application in `/Applications` was not replaced by this recovery.

Visual QA used the development-only synthetic IPC harness at a 1380×900 viewport. The new overview/map was inspected in both themes, along with background/Alcove settings and the selected-device inspector. README screenshots were refreshed from this harness; all devices and addresses shown are synthetic. This does not validate actual OS notification delivery, autostart, or Alcove presentation.

The Russian release guide was completed, `.idea/` was excluded from staging, and the older English release instructions were corrected to describe the current GitHub CLI workflow. No GitHub remote, commit, tag, push, or publication was created. Native Windows installation/tray/WebView2 testing, native OS background/notification acceptance, extended physical-router tests, and distribution signing/notarization remain the release gates above.

## Obsidian-style graph — 2026-11-02

Replaced the oversized device illustrations/grid with a radial graph: small colored nodes, thin straight links, outward labels, hover/selection focus, and a compact zoom/reset toolbar. Geometry now uses explicit matching node bounds, and the canvas refits when the inspector or connection banner changes available space. Dragged positions and zoom survive polling updates.

Added a throttled spring animation with gentle node drift, nearby-node impulses during dragging, soft hub breathing and entrance/focus transitions. Only measured live traffic animates on highlighted links. Motion updates stop in hidden documents and offscreen; reduced-motion preferences disable the animation. No client-to-client links are fabricated.

`npm run check` passed: lint, 37 tests, TypeScript and production build. New tests cover label separation for 1/2/5/8/16 clients, layout stability, motion throttling/visibility/reduced motion, and closing the inspector after keyboard selection. Synthetic browser QA confirmed actual movement of all eight client positions while the hub stayed fixed, dragging, selection, inspector closure and automatic refitting. The screenshot `assets/network-graph-dark.png` uses synthetic data only. Native installers are rebuilt separately from the prior recovery packages.

Final graph packages: macOS ARM64 app/DMG rebuilt and signature/DMG integrity verified; Windows x64 NSIS rebuilt successfully. Both current installers in `artifacts/release/` have verified SHA-256 sidecars. Earlier installers are preserved under `artifacts/release-before-graph-*/`. The installed app was not replaced.

## Stronger graph physics and neutral device icons — 2026-11-02

Replaced per-client position anchors with link springs, equal-and-opposite hub forces, pairwise repulsion and label collision forces. Release velocity is retained and damped; the heavier hub reacts to pulling a client and transmits motion to its other links. An idle tangential force provides slow continuous movement. Fixed integration substeps and clamped time gaps keep the simulation stable; hidden/offscreen and reduced-motion handling remain in place. Frame cadence is up to 60 fps. Increased fitting padding for the moving graph.

Unknown or unsupported device icons now use a neutral box instead of a question mark. No device type is inferred or changed. The synthetic UI check explicitly changed one demo device to the unknown type and verified a box SVG and absence of a question-mark SVG in its inspector. Drag/release behavior was also checked in the synthetic browser harness.

`npm run check` passed: lint, 40 frontend tests, TypeScript and production build. Three new physics tests cover release momentum and hub coupling, preservation of a new angular arrangement, and stable separation of overlapping labels. Existing source files and earlier installers were preserved before modification.

Final stronger-physics installers were rebuilt for both platforms; macOS signatures/DMG integrity and both SHA-256 sidecars verified. Current files remain in `artifacts/release/`. Prior installers are preserved in `artifacts/release-before-force-*/`. Installed application was not replaced. Synthetic inspector screenshot: `artifacts/ui-qa/graph-physics-and-neutral-icon.png`.
