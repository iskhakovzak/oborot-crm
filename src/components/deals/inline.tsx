"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** Инлайн-редактирование текстового/числового/датового поля: клик → поле ввода, Enter/blur → сохранение */
export function InlineText({ value, onSave, type = "text", placeholder = "—", className, inputClassName, format, disabled, multiline }: {
  value: string | number | null | undefined;
  onSave: (v: string) => Promise<unknown> | void;
  type?: "text" | "number" | "date";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  format?: (v: string | number | null | undefined) => React.ReactNode;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value == null ? "" : String(value));
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  async function commit() {
    setEditing(false);
    const current = value == null ? "" : String(value);
    if (draft.trim() === current.trim()) return;
    await onSave(draft.trim());
  }
  if (disabled) return <span className={cn("inline-block", className)}>{format ? format(value) : value || <span className="text-muted">{placeholder}</span>}</span>;
  if (editing) {
    const cls = cn("w-full rounded-[6px] border border-info bg-surface px-1.5 py-0.5 text-inherit outline-none ring-2 ring-info/20", inputClassName);
    return multiline ? (
      <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value == null ? "" : String(value)); setEditing(false); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(); }} rows={2} className={cn(cls, "min-h-[56px] resize-y")} />
    ) : (
      <input ref={ref} type={type} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value == null ? "" : String(value)); setEditing(false); } }} className={cls} />
    );
  }
  const empty = value == null || value === "";
  return (
    <button type="button" onClick={() => setEditing(true)} className={cn("group inline-flex max-w-full items-center gap-1.5 rounded-[6px] text-left transition-colors hover:bg-surface-2 -mx-1 px-1", className)} title="Нажмите, чтобы изменить">
      <span className={cn("min-w-0", empty && "text-muted")}>{empty ? placeholder : format ? format(value) : value}</span>
      <Pencil className="size-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
