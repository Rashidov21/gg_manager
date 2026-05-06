use std::thread;
use std::time::Duration;

use tauri::Manager;

/// Simple in-process watchdog that recreates the main window if it gets closed.
/// This is a first step towards a full Windows Service watchdog.
pub fn start_watchdog(app: tauri::AppHandle) {
    // Spawn a detached thread that periodically checks if the window exists.
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(1000));

        if app.get_window("main").is_none() {
            // Try to recreate the main window in ~1 second.
            // Logs will be visible in Tauri devtools / console.
            println!("[GG Watchdog] main window missing, recreating...");

            let _ = tauri::WindowBuilder::new(
                &app,
                "main",
                tauri::WindowUrl::App("index.html".into()),
            )
            .fullscreen(true)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build();
        }
    });
}

