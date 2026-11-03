"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save, MessageSquareText, PhoneIncoming, Cpu } from "lucide-react";
import type { AiSettings } from "@/lib/settings";
import { Section } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveAiSettings } from "./actions";

const MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-4-6", "claude-haiku-4-6"];

export function AiSettingsForm({ settings, canEdit }: { settings: AiSettings; canEdit: boolean }) {
  const [s, setS] = useState<AiSettings>(settings);
  const [busy, startTransition] = useTransition();
  const set = <K extends keyof AiSettings>(k: K, v: AiSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const save = () =>
    startTransition(async () => {
      const r = await saveAiSettings(s);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Настройки ИИ сохранены");
    });
  const ro = !canEdit;
  return (
    <div className="space-y-5">
      <Section title="Ассистент" description="Имя и манера общения — одинаковые в чатах и на телефоне">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя ассистента"><Input value={s.assistantName} onChange={(e) => set("assistantName", e.target.value)} disabled={ro} /></Field>
          <Field label="Модель">
            <Select value={MODELS.includes(s.model) ? s.model : "custom"} onChange={(e) => e.target.value !== "custom" && set("model", e.target.value)} disabled={ro}>
              {MODELS.map((m) => <option key={m} value={m}>{m}{m === "claude-opus-5-5" ? " (по умолчанию)" : ""}</option>)}
              {!MODELS.includes(s.model) && <option value="custom">{s.model}</option>}
            </Select>
          </Field>
          <Field label="Тон общения" className="sm:col-span-2"><Input value={s.tone} onChange={(e) => set("tone", e.target.value)} placeholder="дружелюбно и по делу, на «вы»" disabled={ro} /></Field>
          <Field label="База знаний" hint="Что продаёте, сроки, гарантия, условия оплаты — ассистент отвечает только в рамках этого текста" className="sm:col-span-2">
            <Textarea value={s.knowledge} onChange={(e) => set("knowledge", e.target.value)} className="min-h-[120px]" disabled={ro} />
          </Field>
        </div>
      </Section>

      <Section title={<span className="inline-flex items-center gap-2"><MessageSquareText className="size-4 text-muted" /> Переписки</span>} description="Пункт 23: ИИ отвечает в Telegram, WhatsApp, MAX, Instagram и почте">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-[10px] border border-line px-3.5 py-3">
            <span>
              <span className="block text-[13.5px] font-medium">Автоответ в чатах</span>
              <span className="text-[12px] text-muted">Отвечать на входящие во всех переписках. Если выключено — только там, где включён переключатель «ИИ отвечает»</span>
            </span>
            <Switch checked={s.chatAutoReply} onCheckedChange={(v) => set("chatAutoReply", v)} disabled={ro} />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Правило передачи менеджеру"><Textarea value={s.chatHandoffRule} onChange={(e) => set("chatHandoffRule", e.target.value)} className="min-h-[72px]" disabled={ro} /></Field>
            <Field label="Лимит автоответов" hint="на одну переписку, затем — менеджер"><Input type="number" min={1} max={50} value={s.maxAutoReplies} onChange={(e) => set("maxAutoReplies", Number(e.target.value))} disabled={ro} className="tnum" /></Field>
          </div>
        </div>
      </Section>

      <Section title={<span className="inline-flex items-center gap-2"><PhoneIncoming className="size-4 text-muted" /> Входящие звонки</span>} description="Пункт 24: ИИ отвечает на звонок, выясняет потребность и создаёт заявку">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-[10px] border border-line px-3.5 py-3">
            <span>
              <span className="block text-[13.5px] font-medium">Приём звонков ИИ</span>
              <span className="text-[12px] text-muted">Если менеджеры не ответили, звонок принимает {s.assistantName || "ассистент"}: транскрипт и резюме попадут в журнал звонков</span>
            </span>
            <Switch checked={s.callsEnabled} onCheckedChange={(v) => set("callsEnabled", v)} disabled={ro} />
          </label>
          <Field label="Приветствие"><Input value={s.callGreeting} onChange={(e) => set("callGreeting", e.target.value)} disabled={ro} /></Field>
          <Field label="Сценарий звонка"><Textarea value={s.callScript} onChange={(e) => set("callScript", e.target.value)} className="min-h-[90px]" disabled={ro} /></Field>
        </div>
      </Section>

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><Cpu className="size-3.5" /> {s.model}</span>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Сохранить</Button>
        </div>
      )}
    </div>
  );
}
