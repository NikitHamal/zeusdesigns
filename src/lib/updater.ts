import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isNative } from "./bridge";

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  pageUrl: string;
  publishedAt?: string;
  installerUrl?: string | null;
  installerName?: string | null;
  size?: number | null;
}

export const REPO = "NikitHamal/zeusdesigns";

export async function appVersion(): Promise<string> {
  if (!isNative) return "dev";
  try { return (await invoke<{ version: string }>("app_info")).version; } catch { return "dev"; }
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  if (isNative) return invoke<UpdateInfo>("update_check");
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
  const rel = await r.json();
  const latest = String(rel.tag_name ?? "").replace(/^v/, "");
  return { current: "dev", latest, available: false, pageUrl: rel.html_url, publishedAt: rel.published_at };
}

export async function installUpdate(info: UpdateInfo, onProgress: (done: number, total: number) => void): Promise<void> {
  if (!isNative || !info.installerUrl) { window.open(info.pageUrl, "_blank"); return; }
  const un = await listen<{ done: number; total: number }>("zeus://update/progress", (e) => onProgress(e.payload.done, e.payload.total));
  try { await invoke("update_install", { url: info.installerUrl, name: info.installerName ?? "ZeusDesigns-setup.exe" }); }
  finally { un(); }
}
