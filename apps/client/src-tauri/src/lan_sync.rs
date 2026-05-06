use std::env;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use sysinfo::{Disks, System};
use tokio::sync::mpsc;
use tokio::time::interval;
use tokio_tungstenite::{connect_async, tungstenite::Message};

fn get_computer_id() -> String {
    env::var("GG_COMPUTER_ID").unwrap_or_else(|_| "pc-1".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ServerCommand {
    #[serde(rename = "lock")]
    Lock { #[serde(rename = "commandId")] command_id: String },
    #[serde(rename = "reboot")]
    Reboot { #[serde(rename = "commandId")] command_id: String },
}

struct AckMessage {
    command_id: String,
    status: &'static str,
    error: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
struct HwMetrics {
    cpu_usage: Option<f64>,
    ram_usage: Option<f64>,
    disk_usage: Option<f64>,
}

fn collect_metrics(sys: &mut System) -> HwMetrics {
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_usage = {
        let cpus = sys.cpus();
        if cpus.is_empty() {
            None
        } else {
            let sum: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
            Some((sum / cpus.len() as f32) as f64)
        }
    };

    let total_mem = sys.total_memory();
    let ram_usage = if total_mem == 0 {
        None
    } else {
        Some((sys.used_memory() as f64 / total_mem as f64) * 100.0)
    };

    let disks = Disks::new_with_refreshed_list();
    let disk_usage = {
        let mut total: u64 = 0;
        let mut free: u64 = 0;
        for d in disks.list() {
            total += d.total_space();
            free += d.available_space();
        }
        if total == 0 {
            None
        } else {
            let used = total.saturating_sub(free);
            Some((used as f64 / total as f64) * 100.0)
        }
    };

    HwMetrics {
        cpu_usage,
        ram_usage,
        disk_usage,
    }
}

pub fn start_client_sync() {
    thread::spawn(|| {
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(err) => {
                eprintln!("[GG LAN] Failed to create runtime: {}", err);
                return;
            }
        };

        runtime.block_on(async move {
            loop {
                let ws_url = env::var("GG_SERVER_WS_URL")
                    .unwrap_or_else(|_| "ws://127.0.0.1:3000/client".to_string());
                let computer_id = get_computer_id();

                println!("[GG LAN] Connecting to {}", ws_url);
                match connect_async(ws_url.as_str()).await {
                    Ok((socket, _)) => {
                        println!("[GG LAN] Connected as {}", computer_id);
                        let (mut writer, mut reader) = socket.split();

                        let register = json!({
                            "type": "register",
                            "computerId": computer_id,
                        });
                        let _ = writer.send(Message::Text(register.to_string())).await;

                        let mut sys = System::new_all();
                        sys.refresh_all();

                        let mut hb_tick = interval(Duration::from_secs(5));
                        let mut snap_tick = interval(Duration::from_secs(15));

                        let (ack_tx, mut ack_rx) = mpsc::unbounded_channel::<AckMessage>();
                        let ack_tx = Arc::new(Mutex::new(ack_tx));

                        loop {
                            tokio::select! {
                                _ = hb_tick.tick() => {
                                    let hb = json!({
                                        "type": "heartbeat",
                                        "computerId": computer_id,
                                        "localTimestamp": format!("{:?}", std::time::SystemTime::now()),
                                        "remainingMinutes": 0
                                    });
                                    let sent = writer.send(Message::Text(hb.to_string())).await;
                                    if sent.is_err() { break; }
                                    println!("[GG LAN] Heartbeat sent");
                                }
                                _ = snap_tick.tick() => {
                                    let metrics = collect_metrics(&mut sys);
                                    let mut snap = serde_json::Map::new();
                                    snap.insert("type".to_string(), json!("snapshot"));
                                    snap.insert("computerId".to_string(), json!(computer_id));
                                    if let Some(v) = metrics.cpu_usage {
                                        snap.insert("cpuUsage".to_string(), json!(v));
                                    }
                                    if let Some(v) = metrics.ram_usage {
                                        snap.insert("ramUsage".to_string(), json!(v));
                                    }
                                    if let Some(v) = metrics.disk_usage {
                                        snap.insert("diskUsage".to_string(), json!(v));
                                    }
                                    // sysinfo provides limited CPU/GPU temperature support on
                                    // Windows; left as null and may be filled by a future
                                    // vendor-specific sensor integration.
                                    let payload = serde_json::Value::Object(snap);
                                    let sent = writer.send(Message::Text(payload.to_string())).await;
                                    if sent.is_err() { break; }
                                    println!("[GG LAN] Snapshot sent {}", payload);
                                }
                                Some(ack) = ack_rx.recv() => {
                                    let payload = match ack.error {
                                        Some(err) => json!({
                                            "type": "ack",
                                            "computerId": computer_id,
                                            "commandId": ack.command_id,
                                            "status": ack.status,
                                            "error": err,
                                        }),
                                        None => json!({
                                            "type": "ack",
                                            "computerId": computer_id,
                                            "commandId": ack.command_id,
                                            "status": ack.status,
                                        }),
                                    };
                                    let sent = writer.send(Message::Text(payload.to_string())).await;
                                    if sent.is_err() { break; }
                                    println!("[GG LAN] ACK sent for {}", ack.command_id);
                                }
                                msg = reader.next() => {
                                    match msg {
                                        Some(Ok(m)) => {
                                            if let Ok(text) = m.to_text() {
                                                println!("[GG LAN] Command received: {}", text);
                                                handle_command(text, ack_tx.clone());
                                            }
                                        }
                                        Some(Err(err)) => {
                                            eprintln!("[GG LAN] Socket read error: {}", err);
                                            break;
                                        }
                                        None => break,
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        eprintln!("[GG LAN] Connect failed: {}", err);
                    }
                }

                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        });
    });
}

fn handle_command(text: &str, ack_tx: Arc<Mutex<mpsc::UnboundedSender<AckMessage>>>) {
    let parsed: Result<ServerCommand, _> = serde_json::from_str(text);
    match parsed {
        Ok(ServerCommand::Lock { command_id }) => {
            println!("[GG LAN] LOCK command accepted (id={})", command_id);
            let result = unsafe { winapi::um::winuser::LockWorkStation() };
            let ack = if result == 0 {
                eprintln!("[GG LAN] LockWorkStation failed");
                AckMessage {
                    command_id,
                    status: "failed",
                    error: Some("LockWorkStation returned 0".to_string()),
                }
            } else {
                println!("[GG LAN] Workstation locked");
                AckMessage {
                    command_id,
                    status: "success",
                    error: None,
                }
            };
            send_ack(ack_tx, ack);
        }
        Ok(ServerCommand::Reboot { command_id }) => {
            println!("[GG LAN] REBOOT command accepted (id={})", command_id);
            let status = Command::new("shutdown")
                .args(["/r", "/t", "0", "/f"])
                .status();
            let ack = match status {
                Ok(s) if s.success() => AckMessage {
                    command_id,
                    status: "success",
                    error: None,
                },
                Ok(s) => AckMessage {
                    command_id,
                    status: "failed",
                    error: Some(format!("shutdown exit: {}", s)),
                },
                Err(err) => AckMessage {
                    command_id,
                    status: "failed",
                    error: Some(format!("shutdown spawn failed: {}", err)),
                },
            };
            send_ack(ack_tx, ack);
        }
        Err(err) => {
            eprintln!("[GG LAN] Failed to parse command JSON: {}", err);
        }
    }
}

fn send_ack(ack_tx: Arc<Mutex<mpsc::UnboundedSender<AckMessage>>>, ack: AckMessage) {
    if let Ok(tx) = ack_tx.lock() {
        if let Err(err) = tx.send(ack) {
            eprintln!("[GG LAN] Failed to enqueue ack: {}", err);
        }
    }
}
