"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/input";
import { testAutomation, type TestRunResult } from "@/app/(app)/automations/actions";
import type { AutomationRow, Labels, Option } from "./types";

const STATUS: Record<"ok" | "error" | "skipped", { label: string; tone: Tone }> = { ok: { label: "выполнено", tone: "good" }, error: { label: "ошибка", tone: "accent" }, skipped: { label: "пропущено", tone: "neutral" } };

export function TestRunDialog({ rule, onOpenChange, deals, eventLabels }: { rule: AutomationRow | null; onOpenChange: (o: boolean) => void; deals: Option[]; eventLabels: Labels["events"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dealId, setDealId] = useState("");
  const [result, setResult] = useState<Exclude<TestRunResult, { error: string }> | null>(null);
  const ruleId = rule?.id ?? null;
  const firstDealId = deals[0]?.id ?? "";
  useEffect(() => {
    // сбрасываем результат только при открытии для другого правила, а не при обновлении списка после router.refresh()
    if (ruleId) { setResult(null); setDealId(firstDealId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId]);

  function runTest() {
    if (!rule || !dealId) return;
    start(async () => {
      const r = await testAutomation(rule.id, dealId);
      if ("error" in r) { toast.error(r.error); return; }
      setResult(r);
      router.refresh();
    });
  }

  return (
    <Dialog open={!!rule} onOpenChange={onOpenChange}>
      <DialogContent title="Проверить на сделке" description={rule ? `Событие «${eventLabels[rule.event]}» будет запущено для выбранной сделки. Сработают все включённые правила на это событие.` : undefined}>
        <div className="space-y-4">
          <Field label="Сделка" hint="В демо-режиме сообщения и звонки только логируются, задачи и этапы меняются по-настоящему">
            <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          {result && (
            <div className="space-y-2">
              {result.warning && <div className="rounded-[8px] bg-warn-soft px-3 py-2 text-[13px] text-warn">{result.warning}</div>}
              {result.results.length === 0 && !result.warning && <p className="text-[13px] text-muted">Ни одно правило не сработало.</p>}
              {result.results.map((r) => (
                <div key={r.automationId} className={`rounded-[10px] border px-3 py-2.5 ${r.automationId === rule?.id ? "border-ink" : "border-line"}`}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{r.name}</span>
                    <Badge tone={STATUS[r.status].tone} className="ml-auto">{STATUS[r.status].label}</Badge>
                  </div>
                  <ol className="mt-1.5 space-y-0.5 text-xs text-ink-2">
                    {r.log.map((l, i) => (
                      <li key={i} className="flex gap-2"><span className="w-4 shrink-0 text-muted tnum">{i + 1}.</span><span>{l}</span></li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Закрыть</Button>
            <Button onClick={runTest} disabled={pending || !dealId}>{pending ? "Выполняется…" : result ? "Запустить ещё раз" : "Запустить"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
