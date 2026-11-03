"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function NoteForm({ action, placeholder = "Заметка по сделке…" }: { action: (text: string) => Promise<{ ok: true } | { error: string }>; placeholder?: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    start(async () => {
      const r = await action(text);
      if ("error" in r) { toast.error(r.error); return; }
      setText("");
    });
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mb-4">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="min-h-[60px] text-[13px]" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11.5px] text-muted">⌘/Ctrl + Enter — сохранить</span>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !text.trim()}>Добавить заметку</Button>
      </div>
    </form>
  );
}
