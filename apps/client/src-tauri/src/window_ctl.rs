use tauri::{Manager, PhysicalPosition, PhysicalSize};

const OVERLAY_W: f64 = 280.0;
const OVERLAY_H: f64 = 120.0;
const MARGIN: f64 = 20.0;

fn position_overlay_bottom_right(app: &tauri::AppHandle) -> Result<(), String> {
  let login = app.get_window("login").ok_or("missing login window")?;
  let overlay = app.get_window("overlay").ok_or("missing overlay window")?;

  let monitor = login
    .current_monitor()
    .map_err(|e| e.to_string())?
    .ok_or("no monitor for login window")?;

  let size = monitor.size();
  let pos = monitor.position();
  let scale = monitor.scale_factor();

  let w = (OVERLAY_W * scale).round() as u32;
  let h = (OVERLAY_H * scale).round() as u32;
  let m = (MARGIN * scale).round() as i32;

  let x = pos.x + size.width as i32 - w as i32 - m;
  let y = pos.y + size.height as i32 - h as i32 - m;

  overlay
    .set_size(PhysicalSize::new(w, h))
    .map_err(|e| e.to_string())?;
  overlay
    .set_position(PhysicalPosition::new(x, y))
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn get_computer_id() -> String {
  std::env::var("GG_COMPUTER_ID").unwrap_or_else(|_| "pc-1".to_string())
}

#[tauri::command]
pub fn present_overlay(app: tauri::AppHandle) -> Result<(), String> {
  position_overlay_bottom_right(&app)?;
  let overlay = app.get_window("overlay").ok_or("missing overlay window")?;
  let login = app.get_window("login").ok_or("missing login window")?;
  overlay.show().map_err(|e| e.to_string())?;
  login.hide().map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn present_login(app: tauri::AppHandle) -> Result<(), String> {
  let overlay = app.get_window("overlay").ok_or("missing overlay window")?;
  let login = app.get_window("login").ok_or("missing login window")?;
  overlay.hide().map_err(|e| e.to_string())?;
  login.show().map_err(|e| e.to_string())?;
  login.set_fullscreen(true).map_err(|e| e.to_string())?;
  Ok(())
}
