use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

use sysinfo::System;
use windows_service::define_windows_service;
use windows_service::service::{ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_dispatcher;

const SERVICE_NAME: &str = "gg-watchdog";
const TARGET_EXE: &str = "gg_manager_client.exe";

define_windows_service!(ffi_service_main, service_main);

fn main() -> windows_service::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
}

fn service_main(_arguments: Vec<OsString>) {
    if let Err(e) = run_service() {
        eprintln!("[GG Watchdog] service error: {e}");
    }
}

fn run_service() -> windows_service::Result<()> {
    let status_handle = service_control_handler::register(SERVICE_NAME, move |control_event| match control_event {
        ServiceControl::Stop => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    })?;

    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    loop {
        ensure_client_running();
        thread::sleep(Duration::from_secs(1));
    }
}

fn ensure_client_running() {
    let mut sys = System::new_all();
    sys.refresh_all();

    let running = sys
        .processes()
        .values()
        .any(|p| p.name().eq_ignore_ascii_case(TARGET_EXE));

    if running {
        return;
    }

    let exe = resolve_client_path();
    if let Some(path) = exe {
        let result = Command::new(path).spawn();
        match result {
            Ok(_) => println!("[GG Watchdog] relaunched client"),
            Err(err) => eprintln!("[GG Watchdog] failed to relaunch client: {err}"),
        }
    } else {
        eprintln!("[GG Watchdog] could not resolve client executable path");
    }
}

fn resolve_client_path() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("GG_CLIENT_EXE") {
        let p = PathBuf::from(custom);
        if p.exists() {
            return Some(p);
        }
    }

    let candidates = [
        PathBuf::from(r"C:\Program Files\GG Manager Client\gg_manager_client.exe"),
        PathBuf::from(r"C:\GG\gg_manager_client.exe"),
    ];

    candidates.into_iter().find(|p| p.exists())
}
