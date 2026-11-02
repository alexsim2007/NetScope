# Building and releasing

Build installers on the corresponding operating system. The repository root is a Cargo workspace, so outputs go to `target/`, not `src-tauri/target/`.

## macOS Apple Silicon

```sh
npm ci
npm run check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
npm run tauri build -- --target aarch64-apple-darwin --bundles app,dmg
```

Artifacts are under `target/aarch64-apple-darwin/release/bundle/` when an explicit target is used, or `target/release/bundle/` otherwise. The `.app` embeds production assets and runs with no Vite server. The `.dmg` is the install container.

Official distribution should use an Apple Developer ID Application certificate, hardened runtime, and notarization. Configure the [documented Tauri signing/notarization variables](https://v2.tauri.app/distribute/sign/macos/), including `APPLE_SIGNING_IDENTITY` and the appropriate Apple authentication secrets in the release environment. Use an app-specific password or API-key method documented by Tauri. Keep certificates/passwords out of source and workflow text. Verify with `codesign --verify --deep --strict` and `xcrun stapler validate` on the signed package.

The validated local build uses an existing Apple Development identity supplied to `APPLE_SIGNING_IDENTITY` for that build only. Builds without a configured identity use ad-hoc signing. Apple recommends an Apple-issued identity for reliable Local Network permission tracking; see [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). A missing/unstable identity can cause a native host-unreachable error even when a command-line probe succeeds and the app toggle appears enabled. This is **not a Developer ID signature or notarization**. Downloaded unsigned/unnotarized packages can be blocked by Gatekeeper. Do not disable system protections or claim trust that has not been established. Follow Apple's normal review/open process only after independently verifying a build you trust.

## Windows x64

Use Windows 10/11 with stable MSVC Rust, Visual Studio C++ tools, and WebView2:

```powershell
npm ci
npm run check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis
```

The installer is under `target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Tauri's NSIS packaging includes a WebView2 bootstrap option. Test installation on a clean Windows machine and scaling, tray, notification, and uninstallation behavior.

For signed distribution, follow [Tauri's Windows signing configuration](https://v2.tauri.app/distribute/sign/windows/) using a trusted code-signing certificate or a configured signing command/service, with an appropriate timestamp authority. Certificates are not supplied in this repository. Unsigned builds may trigger SmartScreen. macOS cross-compilation is not a substitute for the Windows workflow.

## GitHub Actions

`ci.yml` runs frontend and native quality checks on macOS ARM64 and Windows x64, then builds host-native installers and uploads artifacts. `release.yml` runs on a `v*` tag or manual dispatch, checks that manifests and lockfiles match the tag, repeats checks, and prepares versionless filenames and SHA-256 sidecars. Only after both platforms succeed does a separate job use GitHub CLI to create an **unsigned draft prerelease**, or update an existing draft. Published releases are never overwritten. Only the draft job receives `GITHUB_TOKEN` with contents write permission; signing secrets are intentionally absent. Nothing has been pushed or published by this local implementation session.

See the [step-by-step Russian release guide](github-release-ru.md) for the first repository push, version/tag commands, artifact verification, and publication.

Before making a release public: inspect the artifacts, complete hardware/OS acceptance, review the validation document, confirm no live data is staged, add signing if available, and publish the reviewed draft yourself.
