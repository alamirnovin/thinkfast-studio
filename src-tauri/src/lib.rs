use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct EngineSidecar(Mutex<Option<CommandChild>>);

#[tauri::command]
fn open_studio(app: tauri::AppHandle) -> Result<(), String> {
  let main = app
    .get_webview_window("main")
    .ok_or_else(|| "The ThinkFast Studio window could not be opened.".to_string())?;
  main.show().map_err(|error| error.to_string())?;
  main.set_focus().map_err(|error| error.to_string())?;
  if let Some(setup) = app.get_webview_window("setup") {
    setup.destroy().map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn stop_engine(app: &tauri::AppHandle) {
  let engine = app.state::<EngineSidecar>();
  let child = {
    let mut process = engine.0.lock().expect("engine lock poisoned");
    process.take()
  };
  if let Some(child) = child {
    let _ = child.kill();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![open_studio])
    .setup(|app| {
      let (_events, child) = app.shell().sidecar("thinkfast-engine")?.spawn()?;
      app.manage(EngineSidecar(Mutex::new(Some(child))));
      Ok(())
    })
    .on_window_event(|window, event| {
      if matches!(event, WindowEvent::CloseRequested { .. }) {
        stop_engine(&window.app_handle());
        window.app_handle().exit(0);
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building ThinkFast Studio");

  app
    .run(|app, event| {
      if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        stop_engine(app);
      }
    });
}
