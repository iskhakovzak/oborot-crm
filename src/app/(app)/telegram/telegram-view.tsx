"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Link2, Save, Copy, Terminal, Unlink, Bot, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { Section } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Badge, type Tone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Table } from "@/components/ui/table";
import { runConsoleCommand, saveTelegramSettings, setWebhook, unlinkUser } from "./actions";

type LogItem = { id: string; text: string; intent: string | null; result: string | null; status: "ok" | "error" | "unknown"; createdAt: string; userName: string | null; userColor: string | null; chatId: string };
type Linked = { id: string; name: string; color: string; email: string; chatId: string };
const STATUS: Record<LogItem["status"], { label: string; tone: Tone }> = { ok: { label: "Выполнено", tone: "good" }, error: { label: "Ошибка", tone: "accent" }, unknown: { label: "Не понял", tone: "warn" } };
const INTENT: Record<string, string> = { create_deal: "Сделка", create_task: "Задача", create_company: "Клиент", move_deal: "Этап", send_invoice: "Счёт", stats: "Статистика", my_tasks: "Мои задачи", find: "Поиск", note: "Заметка", unknown: "—" };

export function TelegramView({ live, hasToken, webhookUrl, settings, linked, log, currentUser, canEdit, examples }: {
  live: boolean; examples: string[]; hasToken: boolean; webhookUrl: string; settings: { webhookSecret: string; enabled: boolean }; linked: Linked[]; log: LogItem[]; currentUser: { name: string; email: string; chatId: string | null }; canEdit: boolean;
}) {
  const router = useRouter();
  const [cmd, setCmd] = useState(examples[5] ?? "");
  const [out, setOut] = useState<{ text: string; status: string; intent: string; sandbox: boolean } | null>(null);
  const [secret, setSecret] = useState(settings.webhookSecret);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [busy, startTransition] = useTransition();
  const [running, startRun] = useTransition();

  const run = () =>
    startRun(async () => {
      const r = await runConsoleCommand(cmd);
      if (!r.ok) { toast.error(r.error); return; }
      setOut(r);
      router.refresh();
    });
  const save = () =>
    startTransition(async () => {
      const r = await saveTelegramSettings({ webhookSecret: secret, enabled });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Настройки бота сохранены");
    });
  const hook = () =>
    startTransition(async () => {
      const r = await setWebhook();
      if (!r.ok) { toast.error(r.error); return; }
      if (r.sandbox) toast.message("Демо-режим", { description: "Вставьте токен бота в Интеграциях — тогда вебхук будет установлен в Telegram по-настоящему." });
      else toast.success("Вебхук установлен", { description: r.url });
    });
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Скопировано"));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <Section title="Подключение" description={live ? "Бот подключён, команды из Telegram выполняются в CRM" : "Без токена бот работает в демо-режиме — команды проверяются в консоли справа"}>
          <ol className="space-y-3 text-[13.5px]">
            {[
              <>Откройте в Telegram <b>@BotFather</b>, отправьте <code className="rounded bg-surface-2 px-1">/newbot</code> и получите токен вида <span className="tnum">123456:ABC…</span></>,
              <>Вставьте токен в <a href="/integrations" className="text-info hover:underline">Интеграциях</a> → «Telegram-бот для сотрудников» (или в переменную <code className="rounded bg-surface-2 px-1">TELEGRAM_BOT_TOKEN</code>)</>,
              <>Нажмите «Установить вебхук» — Telegram начнёт присылать сообщения на адрес ниже</>,
              <>Каждый сотрудник пишет боту <code className="rounded bg-surface-2 px-1">/start {currentUser.email}</code> — чат привяжется к его аккаунту</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", (i === 1 && hasToken) || (i === 3 && currentUser.chatId) ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2")}>{(i === 1 && hasToken) || (i === 3 && currentUser.chatId) ? <Check className="size-3.5" /> : i + 1}</span>
                <span className="leading-6">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 space-y-3">
            <Field label="Адрес вебхука">
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="tnum" />
                <Button variant="secondary" size="icon" onClick={() => copy(webhookUrl)} aria-label="Скопировать"><Copy /></Button>
                {canEdit && <Button onClick={hook} disabled={busy}><Link2 /> Установить вебхук</Button>}
              </div>
            </Field>
            {canEdit && (
              <>
                <Field label="Секрет вебхука" hint="Telegram присылает его в заголовке X-Telegram-Bot-Api-Secret-Token — чужие запросы отбрасываются">
                  <div className="flex gap-2">
                    <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="любая строка до 256 символов" className="tnum" />
                    <Button variant="secondary" onClick={() => setSecret(crypto.randomUUID().replace(/-/g, ""))}>Сгенерировать</Button>
                  </div>
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[13.5px]"><Switch checked={enabled} onCheckedChange={setEnabled} /> Бот принимает команды</label>
                  <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Сохранить</Button>
                </div>
              </>
            )}
          </div>
        </Section>

        <Section title="Привязанные сотрудники" description="Команды выполняются с правами роли сотрудника">
          {linked.length === 0 ? (
            <p className="text-[13px] text-muted">Пока никто не привязан. Напишите боту <code className="rounded bg-surface-2 px-1">/start {currentUser.email}</code>.</p>
          ) : (
            <ul className="divide-y divide-line">
              {linked.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <Avatar name={u.name} color={u.color} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{u.name}</div>
                    <div className="truncate text-[12px] text-muted">{u.email} · chat {u.chatId}</div>
                  </div>
                  {canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => startTransition(async () => { const r = await unlinkUser(u.id); if (!r.ok) { toast.error(r.error); return; } router.refresh(); })}><Unlink /> Отвязать</Button>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="space-y-5">
        <Section title={<span className="inline-flex items-center gap-2"><Terminal className="size-4 text-muted" /> Консоль команд</span>} description={`Команда выполнится от вашего имени (${currentUser.name}) так же, как из Telegram`}>
          <div className="space-y-3">
            <Textarea value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }} className="min-h-[64px]" placeholder="создай сделку …" />
            <div className="flex flex-wrap gap-1.5">
              {examples.map((ex) => <button key={ex} type="button" onClick={() => setCmd(ex)} className={cn("rounded-full border px-2.5 py-1 text-[12px] hover:bg-surface-2", cmd === ex ? "border-ink" : "border-line text-ink-2")}>{ex.length > 40 ? ex.slice(0, 38) + "…" : ex}</button>)}
            </div>
            <div className="flex justify-end"><Button onClick={run} disabled={running || !cmd.trim()}>{running ? <Loader2 className="animate-spin" /> : <Play />} Выполнить</Button></div>
            {out && (
              <div className="rounded-[10px] border border-line bg-surface-2/70 p-3">
                <div className="mb-1.5 flex items-center gap-2 text-[12px] text-muted">
                  <Bot className="size-4 text-info" />
                  <Badge tone={STATUS[out.status as LogItem["status"]]?.tone ?? "neutral"}>{STATUS[out.status as LogItem["status"]]?.label ?? out.status}</Badge>
                  <span>{INTENT[out.intent] ?? out.intent}</span>
                  {out.sandbox && <span>· разбор команды: встроенные правила (без ключа ИИ)</span>}
                </div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{out.text}</p>
              </div>
            )}
          </div>
        </Section>

        <Section title="Журнал команд" description="Последние 30 команд из Telegram и консоли">
          {log.length === 0 ? (
            <p className="text-[13px] text-muted">Команд ещё не было.</p>
          ) : (
            <Table className="border-0 rounded-none">
              <thead><tr><th>Команда</th><th>Результат</th><th>Статус</th><th>Когда</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-[220px] align-top">
                      <div className="flex items-start gap-2">
                        {l.userName && <Avatar name={l.userName} color={l.userColor ?? undefined} size={22} className="mt-0.5" />}
                        <div className="min-w-0">
                          <div className="text-[13px] leading-5">{l.text}</div>
                          <div className="text-[11.5px] text-muted">{l.userName ?? l.chatId} · {INTENT[l.intent ?? ""] ?? l.intent}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[260px] align-top text-[12.5px] leading-5 text-ink-2"><div className="line-clamp-3 whitespace-pre-line">{l.result}</div></td>
                    <td className="align-top"><Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge></td>
                    <td className="whitespace-nowrap align-top text-[12.5px] text-muted tnum">{fmtDateTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      </div>
    </div>
  );
}
