"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowRight, ArrowUp, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "./conductor.css";

type Action = { label: string; href: string };
type Msg = { id: string; role: "user" | "conductor"; text: string; actions?: Action[]; ok?: boolean; kind?: "action" | "answer" };

const STORAGE_KEY = "ws_conductor_history";
const SUGGESTIONS = ["создай сделку Кондиционеры в офис для Buxoro Logistics на 25 млн", "продажи за неделю", "мои задачи", "найди Buxoro", "что требует внимания?"];

function loadHistory(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Msg[]).slice(-60) : [];
  } catch {
    return [];
  }
}
function saveHistory(msgs: Msg[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-60)));
  } catch {
    /* sessionStorage недоступен — работаем без сохранения */
  }
}

function Emblem({ thinking, small }: { thinking?: boolean; small?: boolean }) {
  return (
    <span className={cn("cnd-emblem", thinking && "thinking", small && "sm")} aria-hidden>
      <span className="halo" />
      <span className="ring" />
      <span className="arc" />
      <span className="core" />
    </span>
  );
}

export function Conductor() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMsgs(loadHistory());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveHistory(msgs);
  }, [msgs, loaded]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  const send = useCallback(
    async (raw: string) => {
      const clean = raw.trim();
      if (!clean || busy) return;
      const history = msgs.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: clean };
      setMsgs((m) => [...m, userMsg]);
      setText("");
      setBusy(true);
      try {
        const res = await fetch("/api/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean, history }) });
        const data = (await res.json().catch(() => null)) as { kind?: "action" | "answer"; text?: string; actions?: Action[]; ok?: boolean; error?: string } | null;
        const reply: Msg = res.ok && data
          ? { id: `c${Date.now()}`, role: "conductor", text: data.text ?? "", actions: data.actions ?? [], ok: data.ok !== false, kind: data.kind }
          : { id: `c${Date.now()}`, role: "conductor", text: res.status === 401 ? "Сессия истекла — войдите заново." : (data?.error ?? data?.text ?? `Ошибка ${res.status}`), ok: false };
        setMsgs((m) => [...m, reply]);
      } catch (e) {
        setMsgs((m) => [...m, { id: `c${Date.now()}`, role: "conductor", text: `Нет связи с сервером: ${e instanceof Error ? e.message : String(e)}`, ok: false }]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [busy, msgs],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" className="cnd-fab pressable" aria-label="Открыть Кондуктор (⌘J)" title="Кондуктор — ⌘J / Ctrl+J" data-testid="conductor-fab">
          <Emblem thinking={busy} />
          <kbd>⌘J</kbd>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cnd-overlay" />
        <DialogPrimitive.Content className="cnd-drawer" data-testid="conductor-panel" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
          <div className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3">
            <div className="mt-0.5"><Emblem thinking={busy} small /></div>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold leading-tight">Кондуктор</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[11.5px] text-muted">Команды и вопросы по вашей CRM</DialogPrimitive.Description>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={() => setMsgs([])} className="rounded-full border border-line p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Очистить историю" title="Очистить историю">
                <Trash2 className="size-3.5" />
              </button>
            )}
            <DialogPrimitive.Close className="rounded-full border border-line p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Закрыть">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div ref={feedRef} className="cnd-feed" data-testid="conductor-feed">
            {msgs.length === 0 && !busy && (
              <div className="flex flex-col gap-3 pt-2">
                <div className="label"><span>Попробуйте</span><span className="label-rule" /></div>
                <div className="cnd-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="cnd-chip pressable" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted">Создаю сделки, задачи и клиентов, перевожу сделки по этапам, выставляю счета и отвечаю на вопросы по данным CRM.</p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={cn("cnd-msg", m.role, m.role === "conductor" && m.ok === false && "err")} data-role={m.role}>
                {m.text}
                {m.actions && m.actions.length > 0 && (
                  <div className="cnd-actions">
                    {m.actions.map((a, i) => (
                      <Link key={`${a.href}-${i}`} href={a.href} className="cnd-link pressable" onClick={() => setOpen(false)}>
                        {a.label} <ArrowRight className="size-3" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="cnd-thinking" data-testid="conductor-thinking">
                <Emblem thinking small /> Кондуктор думает…
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Команда или вопрос…"
              disabled={busy}
              data-testid="conductor-input"
              className="flex h-9 w-full rounded-[6px] border border-line bg-canvas px-3 text-[12.5px] text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-white/10 disabled:opacity-50"
            />
            <button type="submit" disabled={busy || !text.trim()} className="pressable btn-primary inline-flex size-9 shrink-0 items-center justify-center rounded-full border disabled:opacity-45" aria-label="Отправить">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
