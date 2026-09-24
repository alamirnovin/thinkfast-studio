#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      use tauri_plugin_shell::ShellExt;
      app.shell().sidecar("thinkfast-engine")?.spawn()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running ThinkFast Studio");
}
