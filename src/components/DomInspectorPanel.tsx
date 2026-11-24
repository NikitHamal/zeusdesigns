// OpenDesign Direct DOM Element & Token Inspector Panel
// Ported and adapted from `nexu-io/open-design/apps/web/src/edit-mode/{bridge,source-patches,types}.ts`.
// Supports:
// - Stable DOM path (`path-0-2-1`) and tag/class inspection
// - Select Parent (`↑`) & Remove Element (`remove-element`)
// - 1-click Strip Decorative Line (`::before` / `::after` / sibling divider bar removal)
// - Live Text, Color, Background, Font Size, Padding, Border Radius, and Outer HTML editing
// - Undo / Redo patch history (`ManualEditHistoryEntry`)
// - Direct Agent Element Refinement (`Apply with Agent` with exact outerHTML + parent context)

import { useState } from "react";
import { useStore } from "../store";
import { sendMessage } from "../lib/engine";
import { Icon } from "./Icon";

export interface SelectedDomTarget {
  index: number;
  domPath: string;
  tag: string;
  className: string;
  text: string;
  color: string;
  bg: string;
  fontSize: string;
  padding: string;
  radius: string;
  outerHtml: string;
  parentOuterHtml: string;
  hasParent: boolean;
}

export interface DomInspectorPanelProps {
  artifactName: string;
  artifactSource?: string;
  selectedEl: SelectedDomTarget | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
  onPatchElement: (patch: Partial<SelectedDomTarget>) => void;
  onAction: (action: "select-parent" | "remove-element" | "strip-decorative-line" | "set-outer-html", value?: string) => void;
}

export function DomInspectorPanel({
  artifactName,
  artifactSource,
  selectedEl,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
  onPatchElement,
  onAction,
}: DomInspectorPanelProps) {
  const [agentNote, setAgentNote] = useState("");
  const [showOuterHtml, setShowOuterHtml] = useState(false);
  const [outerHtmlDraft, setOuterHtmlDraft] = useState<string | null>(null);
  const busy = useStore((s) => s.busy);
  const notify = useStore((s) => s.notify);

  const targetFile = artifactSource || (/\.\w+$/.test(artifactName) ? artifactName : `${artifactName}.html`);

  const runAgentRefinement = (directSend: boolean) => {
    if (!selectedEl || !agentNote.trim()) return;
    const selectorDesc = selectedEl.className
      ? `<${selectedEl.tag} class="${selectedEl.className}">`
      : `<${selectedEl.tag}>`;
    const snippet = selectedEl.outerHtml.slice(0, 320);
    const parentSnippet = selectedEl.parentOuterHtml ? `\nParent HTML context:\n\`\`\`html\n${selectedEl.parentOuterHtml.slice(0, 420)}\n\`\`\`` : "";
    const prompt = `In "${targetFile}", update the ${selectorDesc} element (${selectedEl.domPath}, text: "${selectedEl.text.slice(0, 80)}"): ${agentNote.trim()}\n\nTarget element HTML:\n\`\`\`html\n${snippet}\n\`\`\`${parentSnippet}\nApply the change directly to "${targetFile}" using edit_file or write_file (including any ::before/::after CSS pseudo-elements or sibling decorative elements if relevant).`;

    if (directSend && !busy) {
      setAgentNote("");
      void sendMessage({ text: prompt });
      notify(`Refining ${selectorDesc} in ${targetFile}…`);
    } else {
      window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: prompt }));
      setAgentNote("");
      notify("Queued element refinement in chat composer");
    }
  };

  return (
    <div className="flex w-76 shrink-0 flex-col border-l border-outline-variant/60 bg-surface-low p-3 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
          <Icon name="ads_click" size={14} className="text-primary" />
          <span>Direct DOM Inspector</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo DOM edit"
            className="state grid size-6 place-items-center rounded-md text-on-surface-variant disabled:opacity-35"
          >
            <Icon name="undo" size={13} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo DOM edit"
            className="state grid size-6 place-items-center rounded-md text-on-surface-variant disabled:opacity-35"
          >
            <Icon name="redo" size={13} />
          </button>
          <button
            onClick={onClose}
            className="state rounded-md px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant"
          >
            ESC
          </button>
        </div>
      </div>

      {!selectedEl ? (
        <div className="mt-6 space-y-2 text-center text-xs text-on-surface-variant">
          <div>
            Click any element inside the live preview to inspect and edit its text, styles, outer HTML, or decorative pseudo-elements.
          </div>
          <div className="font-mono text-[10.5px] text-on-surface-variant/70">
            Changes sync automatically to {targetFile}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-xs">
          {/* Element Identity & Quick DOM Actions */}
          <div className="space-y-1.5 rounded-xl border border-outline-variant/50 bg-surface-container p-2">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="truncate font-bold text-primary">
                &lt;{selectedEl.tag}
                {selectedEl.className ? `.${selectedEl.className.trim().split(/\s+/).join(".")}` : ""}&gt;
              </span>
              <span className="shrink-0 text-[10px] text-on-surface-variant">
                {selectedEl.domPath || `node #${selectedEl.index}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <button
                onClick={() => {
                  setOuterHtmlDraft(null);
                  onAction("select-parent");
                }}
                disabled={!selectedEl.hasParent}
                title="Select parent container element"
                className="state inline-flex h-6 items-center gap-1 rounded-md border border-outline-variant/60 bg-surface px-2 text-[10.5px] font-medium text-on-surface disabled:opacity-40"
              >
                <Icon name="arrow_upward" size={11} />
                <span>Parent</span>
              </button>
              <button
                onClick={() => onAction("strip-decorative-line")}
                title="Remove ::before / ::after decorative lines or sibling divider bars on this element"
                className="state inline-flex h-6 items-center gap-1 rounded-md border border-outline-variant/60 bg-surface px-2 text-[10.5px] font-medium text-on-surface"
              >
                <Icon name="horizontal_rule" size={11} />
                <span>Remove --- Line</span>
              </button>
              <button
                onClick={() => onAction("remove-element")}
                title="Delete this element from the DOM"
                className="state inline-flex h-6 items-center gap-1 rounded-md border border-outline-variant/60 bg-surface px-2 text-[10.5px] font-medium text-error"
              >
                <Icon name="delete" size={11} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Text Content */}
          <div>
            <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">Text Content</label>
            <textarea
              rows={2}
              value={selectedEl.text}
              onChange={(e) => onPatchElement({ text: e.target.value })}
              className="w-full rounded-lg border border-outline-variant/60 bg-surface p-2 text-xs text-on-surface outline-none focus:border-primary"
            />
          </div>

          {/* Computed / Inline Style Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">Text Color</label>
              <input
                value={selectedEl.color}
                onChange={(e) => onPatchElement({ color: e.target.value })}
                className="h-8 w-full rounded-lg border border-outline-variant/60 bg-surface px-2 font-mono text-[11px] text-on-surface outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">Background</label>
              <input
                value={selectedEl.bg}
                onChange={(e) => onPatchElement({ bg: e.target.value })}
                className="h-8 w-full rounded-lg border border-outline-variant/60 bg-surface px-2 font-mono text-[11px] text-on-surface outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">Font Size</label>
              <input
                value={selectedEl.fontSize}
                onChange={(e) => onPatchElement({ fontSize: e.target.value })}
                className="h-8 w-full rounded-lg border border-outline-variant/60 bg-surface px-2 font-mono text-[11px] text-on-surface outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">Padding</label>
              <input
                value={selectedEl.padding}
                onChange={(e) => onPatchElement({ padding: e.target.value })}
                className="h-8 w-full rounded-lg border border-outline-variant/60 bg-surface px-2 font-mono text-[11px] text-on-surface outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Direct Outer HTML Editor (OpenDesign set-outer-html) */}
          <div className="border-t border-outline-variant/45 pt-2">
            <button
              onClick={() => {
                setShowOuterHtml(!showOuterHtml);
                setOuterHtmlDraft(null);
              }}
              className="flex w-full items-center justify-between font-mono text-[10.5px] text-on-surface-variant hover:text-on-surface"
            >
              <span>Element Outer HTML</span>
              <Icon name={showOuterHtml ? "expand_less" : "expand_more"} size={14} />
            </button>
            {showOuterHtml && (
              <div className="mt-1.5 space-y-1.5">
                <textarea
                  rows={4}
                  value={outerHtmlDraft ?? selectedEl.outerHtml}
                  onChange={(e) => setOuterHtmlDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-lg border border-outline-variant/60 bg-surface-lowest p-2 font-mono text-[11px] leading-relaxed text-on-surface outline-none focus:border-primary"
                />
                {outerHtmlDraft !== null && outerHtmlDraft !== selectedEl.outerHtml && (
                  <button
                    onClick={() => {
                      onAction("set-outer-html", outerHtmlDraft);
                      setOuterHtmlDraft(null);
                    }}
                    className="state inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-secondary-container px-2.5 text-[11px] font-semibold text-on-secondary-container"
                  >
                    <Icon name="check" size={13} />
                    <span>Apply Outer HTML</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Ask Agent to Refine Element */}
          <div className="border-t border-outline-variant/50 pt-3">
            <label className="mb-1 block font-mono text-[10.5px] text-on-surface-variant">
              Ask Agent to Refine Element
            </label>
            <input
              value={agentNote}
              onChange={(e) => setAgentNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && agentNote.trim()) {
                  e.preventDefault();
                  runAgentRefinement(true);
                }
              }}
              placeholder="e.g. Remove that --- line or convert into 3 columns"
              className="h-8 w-full rounded-lg border border-outline-variant/60 bg-surface px-2 text-xs text-on-surface outline-none focus:border-primary"
            />
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => runAgentRefinement(true)}
                disabled={!agentNote.trim()}
                className="state inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-40"
              >
                <Icon name="auto_awesome" size={14} />
                <span>Apply with Agent</span>
              </button>
              <button
                onClick={() => runAgentRefinement(false)}
                disabled={!agentNote.trim()}
                title="Queue prompt in chat composer without sending immediately"
                className="state inline-flex h-8 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface px-2.5 text-xs font-medium text-on-surface disabled:opacity-40"
              >
                <Icon name="edit" size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
