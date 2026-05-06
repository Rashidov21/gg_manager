#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod security;
mod usb;
mod watchdog;
mod lan_sync;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      println!("[GG Client] Starting kiosk mode shell");

      // In-process watchdog: recreate window if it gets closed.
      watchdog::start_watchdog(app.handle());

      // Security hooks: block Alt+Tab, Alt+F4, Win key and keep Task Manager closed.
      security::install_keyboard_hooks();
      security::start_task_manager_killer();

      // USB monitoring: log and check against whitelist when new USB devices appear.
      usb::start_usb_monitor();

      // Server sync: register, heartbeat, snapshots, receive lock/reboot commands.
      lan_sync::start_client_sync();

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running GG Manager client");
}

