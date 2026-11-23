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
    pub project: Option<String>,
    #[serde(default)]
    pub created_at: u64,
}

fn default_category() -> String {
    "preferences".to_string()
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
            vec![MemoryItem {
                id: "mem-m3-expressive".to_string(),
                text: "Prefer Material 3 Expressive tokens, spring physics, and dynamic color containers by default."
                    .to_string(),
                category: "preferences".to_string(),
                project: None,
                created_at: now_ts(),
            }]
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

    pub fn search(&self, query: &str, category: Option<&str>, project: Option<&str>) -> Vec<MemoryItem> {
        let all = self.list();
        let q = query.trim().to_ascii_lowercase();
        let cat = category.map(|c| c.trim().to_ascii_lowercase()).unwrap_or_default();
        let proj = project.map(|p| p.trim().to_ascii_lowercase()).unwrap_or_default();
        let terms: Vec<&str> = q.split_whitespace().filter(|w| !w.is_empty()).collect();

        all.into_iter()
            .filter(|m| {
                if !cat.is_empty() && cat != "all" && m.category.to_ascii_lowercase() != cat {
                    return false;
                }
                if !proj.is_empty() {
                    if let Some(mp) = &m.project {
                        if !mp.to_ascii_lowercase().contains(&proj) {
                            return false;
                        }
                    }
                }
                if terms.is_empty() {
                    return true;
                }
                let hay = format!("{} {} {}", m.id, m.category, m.text).to_ascii_lowercase();
                terms.iter().all(|t| hay.contains(t)) || hay.contains(&q)
            })
            .collect()
    }

    pub fn add(&self, text: String, category: Option<String>, project: Option<String>) -> Vec<MemoryItem> {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let trimmed = text.trim().to_string();
        if !trimmed.is_empty() && !guard.iter().any(|m| m.text.eq_ignore_ascii_case(&trimmed)) {
            let id = format!("mem-{}-{}", now_ts(), guard.len() + 1);
            guard.push(MemoryItem {
                id,
                text: trimmed,
                category: category
                    .filter(|c| !c.trim().is_empty())
                    .unwrap_or_else(default_category),
                project: project.filter(|p| !p.trim().is_empty()),
                created_at: now_ts(),
            });
            self.persist(&guard);
        }
        guard.clone()
    }

    pub fn update(&self, id: &str, text: String, category: Option<String>) -> Result<Vec<MemoryItem>, String> {
        let mut guard = self.items.lock().map_err(|_| "memory lock poisoned".to_string())?;
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            return Err("memory_edit: updated text cannot be empty".to_string());
        }
        let target_id = id.trim();
        let found = if let Some(item) = guard.iter_mut().find(|m| m.id == target_id) {
            item.text = trimmed;
            if let Some(c) = category.filter(|c| !c.trim().is_empty()) {
                item.category = c;
            }
            item.created_at = now_ts();
            true
        } else if !target_id.is_empty() {
            let lower = target_id.to_ascii_lowercase();
            if let Some(item) = guard.iter_mut().find(|m| m.text.to_ascii_lowercase().contains(&lower)) {
                item.text = trimmed;
                if let Some(c) = category.filter(|c| !c.trim().is_empty()) {
                    item.category = c;
                }
                item.created_at = now_ts();
                true
            } else {
                false
            }
        } else {
            false
        };
        if !found {
            return Err(format!("Memory item '{}' not found. Call memory_search first to see item IDs.", target_id));
        }
        self.persist(&guard);
        Ok(guard.clone())
    }

    pub fn remove(&self, id: &str) -> Vec<MemoryItem> {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let target = id.trim();
        let before = guard.len();
        guard.retain(|m| m.id != target);
        if guard.len() == before && !target.is_empty() {
            let lower = target.to_ascii_lowercase();
            if let Some(pos) = guard.iter().position(|m| m.text.to_ascii_lowercase().contains(&lower)) {
                guard.remove(pos);
            }
        }
        self.persist(&guard);
        guard.clone()
    }
}

#[tauri::command(async)]
pub fn memory_list(store: tauri::State<'_, MemoryStore>) -> Result<Vec<MemoryItem>, String> {
    Ok(store.list())
}

#[tauri::command(async)]
pub fn memory_search(
    query: Option<String>,
    category: Option<String>,
    project: Option<String>,
    store: tauri::State<'_, MemoryStore>,
) -> Result<Vec<MemoryItem>, String> {
    Ok(store.search(
        query.as_deref().unwrap_or(""),
        category.as_deref(),
        project.as_deref(),
    ))
}

#[tauri::command(async)]
pub fn memory_add(
    text: String,
    category: Option<String>,
    project: Option<String>,
    store: tauri::State<'_, MemoryStore>,
) -> Result<Vec<MemoryItem>, String> {
    Ok(store.add(text, category, project))
}

#[tauri::command(async)]
pub fn memory_update(
    id: String,
    text: String,
    category: Option<String>,
    store: tauri::State<'_, MemoryStore>,
) -> Result<Vec<MemoryItem>, String> {
    store.update(&id, text, category)
}

#[tauri::command(async)]
pub fn memory_delete(id: String, store: tauri::State<'_, MemoryStore>) -> Result<Vec<MemoryItem>, String> {
    Ok(store.remove(&id))
}
