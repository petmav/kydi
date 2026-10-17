"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bold, Code2, Italic, Link2, List, ListOrdered, RemoveFormatting, Underline } from "lucide-react";
import { inputClass } from "@/components/ui/primitives";
import { isSafeUrl, sanitizeHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";

/**
 * Lightweight rich-text editor (no third-party editor): a contentEditable area with a small toolbar, an HTML
 * source view and placeholder insertion. Everything it emits passes the allow-list sanitiser; the server
 * sanitises again on save and on render.
 */
export function RichTextEditor({
  id,
  name,
  label,
  value,
  defaultValue = "",
  onChange,
  placeholders = [],
  rows = 6,
  placeholder,
  describedBy,
  invalid,
}: {
  id?: string;
  name?: string;
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  placeholders?: string[];
  rows?: number;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const autoId = useId();
  const editorId = id ?? `rte-${autoId}`;
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => sanitizeHtml(value ?? defaultValue));
  const [source, setSource] = useState(false);
  const lastEmitted = useRef(html);

  // Controlled usage: adopt external changes (for example "Insert note") without fighting the caret.
  useEffect(() => {
    if (value === undefined || value === lastEmitted.current) return;
    const clean = sanitizeHtml(value);
    lastEmitted.current = clean;
    setHtml(clean);
    if (ref.current && ref.current.innerHTML !== clean) ref.current.innerHTML = clean;
  }, [value]);

  useEffect(() => {
    if (!source && ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
    // Only when switching views; typing updates the DOM directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const emit = (next: string) => {
    const clean = sanitizeHtml(next);
    lastEmitted.current = clean;
    setHtml(clean);
    onChange?.(clean);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit(ref.current?.innerHTML ?? "");
  };

  const insertText = (text: string) => {
    if (source) {
      emit(`${html}${text}`);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    exec("insertText", text);
  };

  const addLink = () => {
    const url = window.prompt("Link address (https://, mailto: or tel:)", "https://");
    if (!url) return;
    if (!isSafeUrl(url)) {
      window.alert("Only http(s), mailto and tel links are allowed.");
      return;
    }
    exec("createLink", url);
  };

  const tools: { label: string; icon: React.ReactNode; run: () => void }[] = [
    { label: "Bold", icon: <Bold className="h-4 w-4" />, run: () => exec("bold") },
    { label: "Italic", icon: <Italic className="h-4 w-4" />, run: () => exec("italic") },
    { label: "Underline", icon: <Underline className="h-4 w-4" />, run: () => exec("underline") },
    { label: "Bulleted list", icon: <List className="h-4 w-4" />, run: () => exec("insertUnorderedList") },
    { label: "Numbered list", icon: <ListOrdered className="h-4 w-4" />, run: () => exec("insertOrderedList") },
    { label: "Link", icon: <Link2 className="h-4 w-4" />, run: addLink },
    { label: "Clear formatting", icon: <RemoveFormatting className="h-4 w-4" />, run: () => exec("removeFormat") },
  ];

  const minHeight = `${Math.max(3, rows) * 1.5}rem`;
  return (
    <div>
      {name ? <input type="hidden" name={name} value={html} /> : null}
      <div className={cn("rounded-md border bg-white shadow-sm", invalid ? "border-red-400" : "border-slate-300")}>
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-line bg-subtle px-1.5 py-1">
          {tools.map((t) => (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              disabled={source}
              onMouseDown={(e) => e.preventDefault()}
              onClick={t.run}
              className="rounded p-1.5 text-slate-600 hover:bg-white hover:text-ink focus-ring disabled:opacity-40"
            >
              {t.icon}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={source}
            onClick={() => setSource((s) => !s)}
            className={cn("ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs focus-ring", source ? "bg-white font-medium text-ink" : "text-slate-600 hover:bg-white")}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> HTML
          </button>
        </div>
        {source ? (
          <textarea
            id={editorId}
            aria-label={`${label} (HTML source)`}
            aria-describedby={describedBy}
            value={html}
            onChange={(e) => {
              setHtml(e.target.value);
              lastEmitted.current = e.target.value;
            }}
            onBlur={(e) => emit(e.target.value)}
            rows={rows}
            className={cn(inputClass, "rounded-none border-0 font-mono text-xs shadow-none focus:ring-0")}
          />
        ) : (
          <div
            id={editorId}
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={placeholder}
            onInput={(e) => emit((e.target as HTMLDivElement).innerHTML)}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData("text/html");
              if (pasted) document.execCommand("insertHTML", false, sanitizeHtml(pasted));
              else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
              emit(ref.current?.innerHTML ?? "");
            }}
            style={{ minHeight }}
            className="rte-content max-h-96 overflow-y-auto px-3 py-2 text-sm text-ink focus:outline-none"
          />
        )}
      </div>
      {placeholders.length ? (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={`Insert placeholder into ${label}`}>
          {placeholders.map((p) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertText(`{${p}}`)}
              className="rounded-md border border-line bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-brand-50 hover:text-brand-800 focus-ring"
            >
              {`{${p}}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
