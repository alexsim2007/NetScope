fn main() {
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").ok().as_deref() == Some("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").ok().as_deref() == Some("msvc");
    if windows_msvc {
        // Tauri's resource manifest is linked only into app binaries. Embed the
        // same Common Controls dependency through the linker so lib test
        // harnesses can also resolve comctl32 v6 (TaskDialogIndirect).
        let attributes = tauri_build::Attributes::default()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("failed to build Windows resources");
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    } else {
        tauri_build::build();
    }
}
