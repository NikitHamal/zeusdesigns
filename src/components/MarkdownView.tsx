import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "../utils/cn";
import { useStore } from "../store";

const FILE_PILL = /^(?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx?|jsx?|mjs|cjs|css|scss|html?|json|md|mdx|rs|py|toml|ya?ml|go|java|kt|cpp|hpp|c|h|sh|sql|svg|vue|svelte)(?::(\d+)(?:-\d+)?)?$/;

function openFilePill(raw: string) {
  const path = raw.replace(/:\d+(?:-\d+)?$/, "");
  useStore.getState().patchUI({ leftTab: "files", chatCollapsed: false });
  setTimeout(() => window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: path })), 30);
}

function renderInline(s: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|(?<![a-zA-Z0-9_])_[^_\s][^_]*_(?![a-zA-Z0-9_])|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(
        <strong key={k} className="font-semibold text-on-surface">
          {renderInline(tok.slice(2, -2), `${k}-b`)}
        </strong>
      );
    } else if (tok.startsWith("~~")) {
      out.push(
        <del key={k} className="text-on-surface-variant line-through">
          {renderInline(tok.slice(2, -2), `${k}-d`)}
        </del>
      );
    } else if (tok.startsWith("`")) {
      const codeText = tok.slice(1, -1);
      if (FILE_PILL.test(codeText) && useStore.getState().ui.workspace?.root) {
        out.push(
          <button
            key={k}
            type="button"
            title="Open file"
            onClick={() => openFilePill(codeText)}
            className="rounded-md border border-outline-variant/45 bg-surface-high px-1.5 py-0.5 font-mono text-[12.5px] text-on-surface underline-offset-2 outline-none hover:bg-surface-highest hover:underline"
          >
            {codeText}
          </button>
        );
        last = m.index + tok.length;
        continue;
      }
      out.push(
        <code
          key={k}
          className="rounded-md border border-outline-variant/45 bg-surface-high px-1.5 py-0.5 font-mono text-[12.5px] text-on-surface"
        >
          {codeText}
        </code>
      );
    } else if (tok.startsWith("![")) {
      const im = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(tok);
      if (im) {
        out.push(
          <figure key={k} className="my-2 overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-lowest p-2">
            <img
              src={im[2]}
              alt={im[1]}
              loading="lazy"
              className="max-h-96 w-auto max-w-full rounded-lg object-contain"
            />
            {im[1] && (
              <figcaption className="mt-1.5 text-[12px] text-on-surface-variant">{im[1]}</figcaption>
            )}
          </figure>
        );
      } else {
        out.push(tok);
      }
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm) {
        out.push(
          <a
            key={k}
            href={mm[2]}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {mm[1]}
          </a>
        );
      } else {
        out.push(tok);
      }
    } else {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");
  const isDiff =
    lang === "diff" ||
    lang === "patch" ||
    (code.includes("<<<<<<<") && code.includes("======="));

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-lowest">
      <div className="flex h-8 items-center justify-between border-b border-outline-variant/45 bg-surface-low px-3 font-mono text-[11px] text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-on-surface">
            {lang || "code"}
          </span>
          <span className="text-on-surface-variant/70">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>
        </div>
        <button
          onClick={copy}
          className="state inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-on-surface-variant hover:text-on-surface"
        >
          <Icon name={copied ? "check" : "content_copy"} size={12} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="!m-0 max-h-96 overflow-auto !rounded-none !bg-transparent p-3 font-mono text-[12px] leading-relaxed text-on-surface select-text">
        {isDiff ? (
          <code>
            {lines.map((line, idx) => {
              const isAdd = line.startsWith("+") && !line.startsWith("+++");
              const isDel = line.startsWith("-") && !line.startsWith("---");
              const isMarker =
                line.startsWith("<<<<<<<") ||
                line.startsWith("=======") ||
                line.startsWith(">>>>>>>") ||
                line.startsWith("@@");
              return (
                <div
                  key={idx}
                  className={cn(
                    "px-1.5 -mx-1.5 rounded-sm",
                    isAdd && "bg-tertiary-container/35 text-tertiary",
                    isDel && "bg-error-container/35 text-error",
                    isMarker && "font-semibold text-primary"
                  )}
                >
                  {line || " "}
                </div>
              );
            })}
          </code>
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|") && !t.includes("-")) return false;
  const cells = parseTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function Markdown({ text, compact }: { text: string; compact?: boolean }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const l = lines[i];

    // 1. Fenced code block
    if (/^\s*(`{3,}|~{3,})/.test(l)) {
      const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(l)!;
      const fence = fenceMatch[1];
      const lang = (fenceMatch[2] ?? "").trim().split(/\s+/)[0] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        buf.push(lines[i++]);
      }
      if (i < lines.length) i++;
      nodes.push(<CodeBlock key={k++} lang={lang} code={buf.join("\n")} />);
      continue;
    }

    // 2. Horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      nodes.push(<hr key={k++} className="my-3 border-0 border-t border-outline-variant/50" />);
      i++;
      continue;
    }

    // 3. Headings h1..h4
    if (/^#{1,4}\s/.test(l)) {
      const lvl = Math.min(4, l.match(/^#+/)![0].length);
      const content = l.replace(/^#+\s+/, "");
      const cls =
        lvl === 1
          ? "mt-3.5 mb-1.5 font-display text-[17px] font-semibold text-on-surface"
          : lvl === 2
          ? "mt-3 mb-1.5 font-display text-[15.5px] font-semibold text-on-surface"
          : lvl === 3
          ? "mt-2.5 mb-1 font-display text-[14.5px] font-semibold text-on-surface"
          : "mt-2 mb-1 text-[13.5px] font-semibold uppercase tracking-wide text-on-surface-variant";
      nodes.push(
        <div key={k++} className={cls}>
          {renderInline(content, `h${k}`)}
        </div>
      );
      i++;
      continue;
    }

    // 4. Markdown Table
    if (l.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        rows.push(parseTableRow(lines[i++]));
      }
      nodes.push(
        <div key={k++} className="my-2.5 overflow-x-auto rounded-xl border border-outline-variant/60">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-outline-variant/60 bg-surface-low text-on-surface">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-3 py-2 font-semibold">
                    {renderInline(h, `th-${k}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/35">
              {rows.map((r, ri) => (
                <tr key={ri} className="hover:bg-surface-low/50">
                  {headers.map((_, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-on-surface-variant">
                      {renderInline(r[ci] ?? "", `td-${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 5. Unordered list (including task list items `- [x]` / `- [ ]`)
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: { text: string; checked?: boolean; indent: number }[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const rawLine = lines[i++];
        const leadingSpaces = rawLine.match(/^\s*/)?.[0].length ?? 0;
        const body = rawLine.replace(/^\s*[-*•]\s+/, "");
        const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(body);
        if (taskMatch) {
          items.push({
            text: taskMatch[2],
            checked: taskMatch[1].toLowerCase() === "x",
            indent: Math.floor(leadingSpaces / 2),
          });
        } else {
          items.push({ text: body, indent: Math.floor(leadingSpaces / 2) });
        }
      }
      nodes.push(
        <ul key={k++} className="my-1.5 space-y-1 pl-4 list-disc">
          {items.map((it, j) => (
            <li
              key={j}
              style={it.indent > 0 ? { marginLeft: `${it.indent * 14}px` } : undefined}
              className={cn("leading-relaxed", it.checked !== undefined && "list-none -ml-4 flex items-start gap-2")}
            >
              {it.checked !== undefined && (
                <span
                  className={cn(
                    "mt-1 grid size-3.5 shrink-0 place-items-center rounded border text-[10px]",
                    it.checked
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-surface"
                  )}
                >
                  {it.checked && <Icon name="check" size={10} />}
                </span>
              )}
              <span>{renderInline(it.text, `u${k}-${j}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 6. Ordered list (supports nested sub-bullets, blank lines between items, and explicit start={N})
    if (/^\s*\d+\.\s+/.test(l)) {
      const firstMatch = /^\s*(\d+)\.\s+(.*)$/.exec(l)!;
      const startNum = Math.max(1, parseInt(firstMatch[1], 10) || 1);
      type OlItem = { text: string; subBullets: { text: string; indent: number }[] };
      const items: OlItem[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const olMatch = /^\s*(\d+)\.\s+(.*)$/.exec(cur);
        if (olMatch) {
          const item: OlItem = { text: olMatch[2], subBullets: [] };
          i++;
          // Absorb blank lines + nested/following bullets belonging to this ordered item
          while (i < lines.length) {
            const next = lines[i];
            if (!next.trim()) {
              // Look ahead past blank lines: only continue if next non-empty line is another ordered item or an indented/sub-bullet
              let j = i + 1;
              while (j < lines.length && !lines[j].trim()) j++;
              if (j < lines.length && (/^\s*\d+\.\s+/.test(lines[j]) || /^\s*[-*•]\s+/.test(lines[j]))) {
                i = j;
                continue;
              }
              break;
            }
            if (/^\s*[-*•]\s+/.test(next)) {
              const leadingSpaces = next.match(/^\s*/)?.[0].length ?? 0;
              item.subBullets.push({
                text: next.replace(/^\s*[-*•]\s+/, ""),
                indent: Math.floor(leadingSpaces / 2),
              });
              i++;
              continue;
            }
            break;
          }
          items.push(item);
          continue;
        }
        break;
      }
      nodes.push(
        <ol
          key={k++}
          start={startNum}
          className="my-2 space-y-2 pl-6 list-decimal marker:font-medium marker:text-on-surface-variant"
        >
          {items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              <div>{renderInline(it.text, `o${k}-${j}`)}</div>
              {it.subBullets.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-4 list-disc">
                  {it.subBullets.map((sb, sj) => (
                    <li
                      key={sj}
                      style={sb.indent > 1 ? { marginLeft: `${(sb.indent - 1) * 14}px` } : undefined}
                      className="leading-relaxed"
                    >
                      {renderInline(sb.text, `o${k}-${j}-s${sj}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 7. Blockquote
    if (l.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i++].replace(/^>\s?/, ""));
      }
      nodes.push(
        <blockquote
          key={k++}
          className="my-2 border-l-2 border-primary bg-surface-low/50 py-1.5 pl-3 pr-2 text-on-surface-variant rounded-r-lg"
        >
          {renderInline(buf.join(" "), `q${k}`)}
        </blockquote>
      );
      continue;
    }

    // 8. Empty line
    if (!l.trim()) {
      i++;
      continue;
    }

    // 9. Paragraph (preserving intentional line breaks)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(\s*(`{3,}|~{3,})|#{1,4}\s|\s*[-*•]\s+|\s*\d+\.\s+|>|\s*(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      buf.push(lines[i++]);
    }
    nodes.push(
      <p key={k++} className="my-1.5 leading-relaxed">
        {buf.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {renderInline(line, `p${k}-${li}`)}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className={cn("md select-text text-on-surface", compact ? "text-[12.5px]" : "text-[14.5px]")}>
      {nodes}
    </div>
  );
}
