use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub text: String,
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default)]
    pub created_at: u64,
}

fn default_category() -> String {
    "general".to_string()
}

pub struct MemoryStore {
    pub items: Mutex<Vec<MemoryItem>>,
    pub storage_path: PathBuf,
}

impl Default for MemoryStore {
    fn default() -> Self {
        let base = std::env::var("APPDATA")
            .or_else(|_| std::env::var("HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir());
        let dir = base.join(".zeusdesigns");
        let _ = fs::create_dir_all(&dir);
        let storage_path = dir.join("memory.json");
        let items = if let Ok(raw) = fs::read_to_string(&storage_path) {
            serde_json::from_str::<Vec<MemoryItem>>(&raw).unwrap_or_default()
        } else {
            vec![
                MemoryItem {
                    id: "mem-m3-expressive".to_string(),
                    text: "Prefer Material 3 Expressive tokens, spring physics, and dynamic color containers by default.".to_string(),
                    category: "design_system".to_string(),
                    created_at: now_ts(),
                },
            ]
        };
        Self {
            items: Mutex::new(items),
            storage_path,
        }
    }
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl MemoryStore {
    pub fn persist(&self, list: &[MemoryItem]) {
        if let Ok(json_str) = serde_json::to_string_pretty(list) {
            let _ = fs::write(&self.storage_path, json_str);
        }
    }

    pub fn list(&self) -> Vec<MemoryItem> {
        self.items.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn add(&self, text: String, category: Option<String>) -> Vec<MemoryItem> {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let trimmed = text.trim().to_string();
        if !trimmed.is_empty() && !guard.iter().any(|m| m.text == trimmed) {
            let id = format!("mem-{}-{}", now_ts(), guard.len() + 1);
            guard.push(MemoryItem {
                id,
                text: trimmed,
                category: category.unwrap_or_else(default_category),
                created_at: now_ts(),
            });
            self.persist(&guard);
        }
        guard.clone()
    }

    pub fn remove(&self, id: &str) -> Vec<MemoryItem> {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.retain(|m| m.id != id);
        self.persist(&guard);
        guard.clone()
    }
}

#[tauri::command(async)]
pub fn memory_list(store: tauri::State<'_, MemoryStore>) -> Result<Vec<MemoryItem>, String> {
    Ok(store.list())
}

#[tauri::command(async)]
pub fn memory_add(
    text: String,
    category: Option<String>,
    store: tauri::State<'_, MemoryStore>,
) -> Result<Vec<MemoryItem>, String> {
    Ok(store.add(text, category))
}

#[tauri::command(async)]
pub fn memory_delete(id: String, store: tauri::State<'_, MemoryStore>) -> Result<Vec<MemoryItem>, String> {
    Ok(store.remove(&id))
}
