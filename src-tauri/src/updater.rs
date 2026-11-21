// In-app updater: checks the latest GitHub Release, downloads the NSIS installer with
// progress events, then launches it and exits so the installer can replace the app.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const REPO: &str = "NikitHamal/zeusdesigns";

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("ZeusDesigns/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())
}

fn parse_ver(v: &str) -> Vec<u64> {
    v.trim()
        .trim_start_matches('v')
        .split('.')
        .map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

#[tauri::command(async)]
pub fn update_check() -> Result<Value, String> {
    let res = client()?
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub returned {}", res.status()));
    }
    let rel: Value = res.json().map_err(|e| e.to_string())?;
    let tag = rel["tag_name"].as_str().unwrap_or("").to_string();
    let current = env!("CARGO_PKG_VERSION");
    let installer = rel["assets"].as_array().and_then(|list| {
        list.iter().find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.to_lowercase().ends_with("setup.exe"))
                .unwrap_or(false)
        })
    });
    let available = installer.is_some() && parse_ver(&tag) > parse_ver(current);
    Ok(json!({
        "current": current,
        "latest": tag.trim_start_matches('v'),
        "available": available,
        "pageUrl": rel["html_url"],
        "publishedAt": rel["published_at"],
        "installerUrl": installer.map(|a| a["browser_download_url"].clone()).unwrap_or(Value::Null),
        "installerName": installer.map(|a| a["name"].clone()).unwrap_or(Value::Null),
        "size": installer.map(|a| a["size"].clone()).unwrap_or(Value::Null),
    }))
}

#[tauri::command(async)]
pub fn update_install(app: AppHandle, url: String, name: String) -> Result<(), String> {
    let prefix = format!("https://github.com/{REPO}/releases/download/");
    if !url.starts_with(&prefix) {
        return Err("Untrusted update URL".into());
    }
    let mut res = client()?.get(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed: {}", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    let file_name = if safe.is_empty() { "ZeusDesigns-setup.exe".to_string() } else { safe };
    let path = std::env::temp_dir().join(file_name);
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 65536];
    let (mut done, mut last) = (0u64, 0u64);
    loop {
        let n = res.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if done - last >= 262_144 {
            last = done;
            let _ = app.emit("zeus://update/progress", json!({ "done": done, "total": total }));
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let _ = app.emit("zeus://update/progress", json!({ "done": done, "total": total }));
    std::process::Command::new(&path)
        .args(["/P", "/R", "/UPDATE"])
        .spawn()
        .map_err(|e| format!("Could not start installer: {e}"))?;
    std::thread::sleep(Duration::from_millis(400));
    app.exit(0);
    Ok(())
}
