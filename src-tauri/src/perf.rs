// Native low-memory governor & Win32 working-set trimmer for ZeusDesigns + WebView2 child tree.
// Keeps physical RAM working set under ~20-30 MB on Windows without reducing UI or canvas capability.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

extern "C" {
    fn zeus_memory_stats(
        out_working_set_bytes: *mut u64,
        out_private_bytes: *mut u64,
        out_proc_count: *mut u32,
    ) -> i32;
    fn zeus_memory_trim(
        out_before_bytes: *mut u64,
        out_after_bytes: *mut u64,
        out_proc_count: *mut u32,
    ) -> i32;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfStats {
    pub working_set_bytes: u64,
    pub working_set_mb: f64,
    pub private_bytes: u64,
    pub private_mb: f64,
    pub process_count: u32,
    pub auto_trim: bool,
    pub target_mb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimReport {
    pub before_bytes: u64,
    pub before_mb: f64,
    pub after_bytes: u64,
    pub after_mb: f64,
    pub saved_mb: f64,
    pub process_count: u32,
}

pub struct PerfGovernor {
    pub auto_trim: Arc<AtomicBool>,
}

impl Default for PerfGovernor {
    fn default() -> Self {
        let auto_trim = Arc::new(AtomicBool::new(true));
        let flag = auto_trim.clone();
        std::thread::spawn(move || {
            // Initial post-launch trims once WebView2 finishes loading cold startup DLLs
            for delay_ms in [1400_u64, 3800_u64] {
                std::thread::sleep(Duration::from_millis(delay_ms));
                if flag.load(Ordering::Relaxed) {
                    let _ = trim_now();
                }
            }
            // Periodic gentle trim when working set exceeds 24 MB
            loop {
                std::thread::sleep(Duration::from_secs(7));
                if !flag.load(Ordering::Relaxed) {
                    continue;
                }
                let s = current_stats(true);
                if s.working_set_bytes > 24 * 1024 * 1024 {
                    let _ = trim_now();
                }
            }
        });
        Self { auto_trim }
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub fn current_stats(auto_trim: bool) -> PerfStats {
    let mut ws: u64 = 0;
    let mut priv_b: u64 = 0;
    let mut procs: u32 = 1;
    unsafe {
        let _ = zeus_memory_stats(&mut ws, &mut priv_b, &mut procs);
    }
    PerfStats {
        working_set_bytes: ws,
        working_set_mb: round1(ws as f64 / (1024.0 * 1024.0)),
        private_bytes: priv_b,
        private_mb: round1(priv_b as f64 / (1024.0 * 1024.0)),
        process_count: procs,
        auto_trim,
        target_mb: 25,
    }
}

pub fn trim_now() -> TrimReport {
    let mut before: u64 = 0;
    let mut after: u64 = 0;
    let mut procs: u32 = 1;
    unsafe {
        let _ = zeus_memory_trim(&mut before, &mut after, &mut procs);
    }
    let before_mb = round1(before as f64 / (1024.0 * 1024.0));
    let after_mb = round1(after as f64 / (1024.0 * 1024.0));
    let saved_mb = round1((before.saturating_sub(after)) as f64 / (1024.0 * 1024.0));
    TrimReport {
        before_bytes: before,
        before_mb,
        after_bytes: after,
        after_mb,
        saved_mb,
        process_count: procs,
    }
}

#[tauri::command]
pub fn perf_stats(gov: tauri::State<'_, PerfGovernor>) -> PerfStats {
    current_stats(gov.auto_trim.load(Ordering::Relaxed))
}

#[tauri::command]
pub fn perf_trim() -> TrimReport {
    trim_now()
}

#[tauri::command]
pub fn perf_set_auto(gov: tauri::State<'_, PerfGovernor>, enabled: bool) -> PerfStats {
    gov.auto_trim.store(enabled, Ordering::Relaxed);
    if enabled {
        let _ = trim_now();
    }
    current_stats(enabled)
}
