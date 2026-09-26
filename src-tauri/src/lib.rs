use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct EngineSidecar(Mutex<Option<CommandChild>>);

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
    })
    .expect("error while running ThinkFast Studio");
}
