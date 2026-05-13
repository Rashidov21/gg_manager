use std::thread;
use std::time::Duration;

use tauri::Manager;

/// Recreate kiosk windows if the user manages to close them.
pub fn start_watchdog(app: tauri::AppHandle) {
  thread::spawn(move || loop {
    thread::sleep(Duration::from_millis(1000));

    if app.get_window("login").is_none() {
      println!("[GG Watchdog] login window missing, recreating...");
      let _ = tauri::WindowBuilder::new(
        &app,
        "login",
        tauri::WindowUrl::App("index.html".into()),
      )
      .fullscreen(true)
      .resizable(false)
      .decorations(false)
      .always_on_top(true)
      .skip_taskbar(true)
      .build();
    }

    if app.get_window("overlay").is_none() {
      println!("[GG Watchdog] overlay window missing, recreating...");
      let _ = tauri::WindowBuilder::new(
        &app,
        "overlay",
        tauri::WindowUrl::App("index.html".into()),
      )
      .inner_size(280.0, 120.0)
      .resizable(false)
      .decorations(false)
      .always_on_top(true)
      .skip_taskbar(true)
      .visible(false)
      .build();
    }
  });
}
