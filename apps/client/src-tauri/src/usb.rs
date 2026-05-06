use std::collections::HashSet;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::process::Command;
use std::ptr;
use std::thread;

use winapi::shared::guiddef::GUID;
use winapi::shared::minwindef::{DWORD, LPARAM, LRESULT, WPARAM};
use winapi::shared::windef::HWND;
use winapi::um::dbt::{
    DBT_DEVICEARRIVAL, DBT_DEVTYP_DEVICEINTERFACE, DEV_BROADCAST_DEVICEINTERFACE_W,
    DEV_BROADCAST_HDR,
};
use winapi::um::winuser::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
    RegisterDeviceNotificationW, TranslateMessage, CS_HREDRAW, CS_VREDRAW, MSG, WNDCLASSW,
    WS_OVERLAPPEDWINDOW,
};

fn wide_null(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn try_disable_pnp_device(instance_path: &str) {
    // The Windows device path looks like
    // \\?\USB#VID_xxxx&PID_yyyy#serial#{guid}
    // PowerShell expects the InstanceId form with `\` separators, e.g.
    // USB\VID_xxxx&PID_yyyy\serial. We rewrite the path before invoking.
    let trimmed = instance_path.trim_start_matches("\\\\?\\").replace('#', "\\");
    let cleaned = match trimmed.rfind('\\') {
        Some(idx) if trimmed[idx..].starts_with("\\{") => trimmed[..idx].to_string(),
        _ => trimmed,
    };

    println!("[GG USB] Disable-PnpDevice -InstanceId '{}'", cleaned);
    let result = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Disable-PnpDevice -InstanceId '{}' -Confirm:$false -ErrorAction Stop",
                cleaned.replace('\'', "''")
            ),
        ])
        .status();
    match result {
        Ok(status) if status.success() => println!("[GG USB] Disable-PnpDevice succeeded"),
        Ok(status) => eprintln!("[GG USB] Disable-PnpDevice exit: {}", status),
        Err(err) => eprintln!("[GG USB] Disable-PnpDevice spawn failed: {}", err),
    }
}

// Example allowlist entries are prefixes of device instance IDs (VID/PID, etc).
fn build_usb_whitelist() -> HashSet<String> {
    let mut set = HashSet::new();
    // TODO: later load from config / server
    set.insert("USB\\VID_046D&PID_C52B".to_string()); // Example: Logitech dongle
    set
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    match msg {
        winapi::um::winuser::WM_DEVICECHANGE => {
            if w_param == DBT_DEVICEARRIVAL {
                let hdr = l_param as *const DEV_BROADCAST_HDR;
                if !hdr.is_null() && (*hdr).dbch_devicetype == DBT_DEVTYP_DEVICEINTERFACE {
                    let di = l_param as *const DEV_BROADCAST_DEVICEINTERFACE_W;
                    let name_ptr = (*di).dbcc_name.as_ptr();

                    if !name_ptr.is_null() {
                        let len = (0..)
                            .take_while(|&i| *name_ptr.add(i) != 0)
                            .count();
                        let slice = std::slice::from_raw_parts(name_ptr, len);
                        let os = OsString::from_wide(slice);
                        let path = os.to_string_lossy().to_string();

                        println!("[GG USB] New USB device: {}", path);

                        let whitelist = build_usb_whitelist();
                        let allowed = whitelist.iter().any(|prefix| path.starts_with(prefix));

                        if !allowed {
                            println!("[GG USB] Device is NOT in whitelist, attempting Disable-PnpDevice");
                            try_disable_pnp_device(&path);
                        } else {
                            println!("[GG USB] Device allowed by whitelist");
                        }
                    }
                }
            }
        }
        _ => {}
    }

    DefWindowProcW(hwnd, msg, w_param, l_param)
}

pub fn start_usb_monitor() {
    thread::spawn(|| unsafe {
        let class_name = wide_null("GG_USB_MONITOR");

        let wnd = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: ptr::null_mut(),
            hIcon: ptr::null_mut(),
            hCursor: ptr::null_mut(),
            hbrBackground: ptr::null_mut(),
            lpszMenuName: ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };

        if RegisterClassW(&wnd) == 0 {
            eprintln!("[GG USB] Failed to register window class");
            return;
        }

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            0,
            0,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
        );

        if hwnd.is_null() {
            eprintln!("[GG USB] Failed to create window");
            return;
        }

        // Register for USB device interface notifications
        let mut if_guid: GUID = std::mem::zeroed();
        // GUID_DEVINTERFACE_USB_DEVICE
        if_guid.Data1 = 0xA5DCBF10;
        if_guid.Data2 = 0x6530;
        if_guid.Data3 = 0x11D2;
        if_guid.Data4 = [0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED];

        let mut filter = DEV_BROADCAST_DEVICEINTERFACE_W {
            dbcc_size: std::mem::size_of::<DEV_BROADCAST_DEVICEINTERFACE_W>() as DWORD,
            dbcc_devicetype: DBT_DEVTYP_DEVICEINTERFACE,
            dbcc_reserved: 0,
            dbcc_classguid: if_guid,
            dbcc_name: [0; 1],
        };

        let handle = RegisterDeviceNotificationW(
            hwnd as _,
            &mut filter as *mut _ as *mut _,
            0,
        );

        if handle.is_null() {
            eprintln!("[GG USB] Failed to register device notification");
        } else {
            println!("[GG USB] USB monitor started");
        }

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, hwnd, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

