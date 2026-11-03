"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, PhoneIncoming, Bot, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { testReply, testCall } from "./actions";

const SAMPLES = ["Здравствуйте! Сколько стоит кондиционер в офис 25 м² с установкой?", "Когда сможете доставить в Самарканд?", "Мне нужен менеджер, хочу обсудить скидку на 10 кондиционеров", "У вас есть гарантия?"];

export function AiSandbox({ assistantName, live }: { assistantName: string; live: boolean }) {
  const [text, setText] = useState(SAMPLES[0]);
  const [reply, setReply] = useState<{ reply: string; handoff: boolean; sandbox: boolean } | null>(null);
  const [phone, setPhone] = useState("+998 90 123-45-67");
  const [call, setCall] = useState<{ transcript: string; summary: string; nextStep: string; createLead: boolean; sandbox: boolean } | null>(null);
  const [busyReply, startReply] = useTransition();
  const [busyCall, startCall] = useTransition();

  const runReply = () =>
    startReply(async () => {
      const r = await testReply(text);
      if (!r.ok) { toast.error(r.error); return; }
      setReply(r);
    });
  const runCall = () =>
    startCall(async () => {
      const r = await testCall(phone);
      if (!r.ok) { toast.error(r.error); return; }
      setCall(r);
    });

  return (
    <div className="space-y-5">
      <Section title="Проверить ответ в чате" description={`Напишите, как клиент — ${assistantName} ответит, ничего не отправляя${live ? "" : " (демо-шаблоны)"}`}>
        <div className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[72px]" />
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => <button key={s} type="button" onClick={() => setText(s)} className={cn("rounded-full border px-2.5 py-1 text-[12px] hover:bg-surface-2", text === s ? "border-ink" : "border-line text-ink-2")}>{s.length > 44 ? s.slice(0, 42) + "…" : s}</button>)}
          </div>
          <div className="flex justify-end"><Button onClick={runReply} disabled={busyReply || !text.trim()}>{busyReply ? <Loader2 className="animate-spin" /> : <Sparkles />} Проверить ответ</Button></div>
          {reply && (
            <div className="space-y-2 rounded-[10px] border border-line p-3">
              <div className="flex justify-end"><div className="max-w-[85%] rounded-[14px] rounded-br-[5px] bg-ink px-3.5 py-2 text-[13.5px] leading-relaxed text-canvas"><div className="mb-0.5 flex items-center gap-1 text-[11px] text-canvas/60"><UserRound className="size-3" /> Клиент</div>{text}</div></div>
              <div className="flex justify-start"><div className="max-w-[85%] rounded-[14px] rounded-bl-[5px] border border-line bg-surface-2 px-3.5 py-2 text-[13.5px] leading-relaxed"><div className="mb-0.5 flex items-center gap-1 text-[11px] text-violet"><Bot className="size-3" /> {assistantName}</div>{reply.reply}</div></div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px] text-muted">
                {reply.handoff ? <Badge tone="warn">Передаст менеджеру</Badge> : <Badge tone="good">Ответит сам</Badge>}
                {reply.sandbox && <span>демо-режим без ключа API</span>}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Проверить приём звонка" description="Смоделировать входящий звонок: диалог по сценарию, резюме и следующий шаг. В журнал звонков не попадает">
        <div className="space-y-3">
          <Field label="Номер звонящего"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
          <div className="flex justify-end"><Button onClick={runCall} disabled={busyCall}>{busyCall ? <Loader2 className="animate-spin" /> : <PhoneIncoming />} Проверить приём звонка</Button></div>
          {call && (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-violet/30 bg-violet-soft/50 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-violet"><Bot className="size-4" /> Резюме</div>
                <p className="text-[13.5px] leading-relaxed">{call.summary}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">Следующий шаг: {call.nextStep}</p>
                <div className="mt-2 flex gap-2">{call.createLead ? <Badge tone="good">Создаст заявку и задачу менеджеру</Badge> : <Badge tone="neutral">Без заявки</Badge>}{call.sandbox && <Badge tone="warn">демо</Badge>}</div>
              </div>
              <div className="space-y-1.5 rounded-[10px] border border-line p-3">
                {call.transcript.split("\n").filter(Boolean).map((line, i) => {
                  const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
                  const isAi = /^ИИ/i.test(m?.[1] ?? "") || (m?.[1] ?? "").includes(assistantName);
                  return (
                    <div key={i} className={cn("flex", isAi ? "justify-start" : "justify-end")}>
                      <div className={cn("max-w-[85%] rounded-[14px] px-3 py-1.5 text-[13px] leading-relaxed", isAi ? "rounded-bl-[5px] bg-violet-soft" : "rounded-br-[5px] border border-line bg-surface")}>
                        {m && <span className={cn("mr-1 text-[11px] font-medium", isAi ? "text-violet" : "text-muted")}>{m[1]}:</span>}{m ? m[2] : line}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
