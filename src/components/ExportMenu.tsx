import { Code2, Copy, Download, FileImage, FolderUp, Smartphone, Share } from "lucide-react";
import { Dropdown, IconBtn, MenuItem, MenuLabel } from "./ui";
import { useStore } from "../store";
import { download, htmlToPng, writeWorkspaceFile, refreshTree } from "../lib/bridge";
import { sendMessage } from "../lib/engine";
import type { Artboard } from "../types";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";

export function ExportMenu({ a, size = 32 }: { a: Artboard; size?: number }) {
  const ws = useStore((s) => s.ui.workspace);
  const notify = useStore((s) => s.notify);
  const ask = (text: string) => {
    useStore.getState().setSel([a.id]);
    sendMessage({ text, quote: { kind: "artboard", artboardId: a.id, label: a.name }, asVariant: true }).then(() => {});
  };
  return (
    <Dropdown
      width={270}
      trigger={({ toggle }) => <IconBtn label="Export" size={size} onClick={toggle}><Share size={16} /></IconBtn>}
    >
      {(close) => (
        <>
          <MenuLabel>Export design</MenuLabel>
          <MenuItem icon={<Download size={16} />} label="Download HTML" desc={`${slug(a.name)}.html`} onClick={() => { download(`${slug(a.name)}.html`, a.html, "text/html"); close(); }} />
          <MenuItem icon={<FileImage size={16} />} label="Download PNG" desc="2× raster snapshot" onClick={async () => {
            close();
            try { download(`${slug(a.name)}.png`, await htmlToPng(a.html, a.w, a.h)); } catch { notify("PNG export failed for this design"); }
          }} />
          <MenuItem icon={<Copy size={16} />} label="Copy HTML" onClick={() => { navigator.clipboard.writeText(a.html); notify("HTML copied"); close(); }} />
          <MenuLabel>Code</MenuLabel>
          <MenuItem icon={<Code2 size={16} />} label="Convert to React + Tailwind" desc="Ask Zeus to generate components" onClick={() => { close(); ask("Convert this screen into clean, componentized React + TypeScript + Tailwind code. Show the file structure and the main components as code blocks."); }} />
          <MenuItem icon={<Smartphone size={16} />} label="Convert to Jetpack Compose" desc="Material 3 Expressive, Kotlin" onClick={() => { close(); ask("Convert this screen into Jetpack Compose (Material 3 Expressive) Kotlin code with a @Preview. Provide it in code blocks."); }} />
          <MenuLabel>Project</MenuLabel>
          <MenuItem
            icon={<FolderUp size={16} />} label="Save to project folder" desc={ws ? `${ws.name}/zeus-designs/${slug(a.name)}.html` : "Open a folder first"}
            onClick={async () => {
              close();
              if (!ws) { notify("Open a project folder first (top bar)"); return; }
              try {
                const path = `zeus-designs/${slug(a.name)}.html`;
                await writeWorkspaceFile(ws, path, a.html);
                useStore.getState().updateArtboard(a.id, { source: path });
                useStore.getState().patchUI({ workspace: { ...ws, tree: await refreshTree(ws) } });
                notify(`Saved to ${path}`);
              } catch (e) { notify(`Save failed: ${(e as Error).message}`); }
            }}
          />
        </>
      )}
    </Dropdown>
  );
}
