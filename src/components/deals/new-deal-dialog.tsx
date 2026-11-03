"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { createDeal } from "@/app/(app)/deals/actions";
import { SOURCES, type Option, type PipelineInfo } from "./types";

export function NewDealDialog({ pipelines, companies, users, defaultPipelineId, defaultCompanyId, openByParam, label = "Новая сделка", size = "md" }: { pipelines: PipelineInfo[]; companies: Option[]; users: Option[]; defaultPipelineId: string; defaultCompanyId?: string | null; openByParam?: boolean; label?: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(!!openByParam);
  const [pending, start] = useTransition();
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  useEffect(() => {
    if (openByParam) setOpen(true);
  }, [openByParam]);

  function close() {
    setOpen(false);
    if (sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }
  }

  function submit(fd: FormData) {
    start(async () => {
      const r = await createDeal({
        title: String(fd.get("title") ?? ""),
        companyId: companyId && companyId !== "__new" ? companyId : null,
        newCompanyName: companyId === "__new" ? String(fd.get("newCompanyName") ?? "") : null,
        amount: Number(fd.get("amount") ?? 0),
        pipelineId: String(fd.get("pipelineId") ?? pipelineId),
        stageId: String(fd.get("stageId") ?? "") || null,
        managerId: String(fd.get("managerId") ?? "") || null,
        source: String(fd.get("source") ?? "") || null,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Сделка №${r.number} создана`);
      setOpen(false);
      router.push(`/deals/${r.id}`);
    });
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title="Новая сделка" description="Менеджер назначается автоматически по правилам распределения, если не выбран вручную">
          <form action={submit} className="space-y-4">
            <Field label="Название">
              <Input name="title" required autoFocus placeholder="Например: Кондиционеры в офис, 3 шт" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Клиент">
                <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="">Без клиента</option>
                  <option value="__new">+ Новый клиент…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              {companyId === "__new" ? (
                <Field label="Название новой компании">
                  <Input name="newCompanyName" required placeholder="ООО «Ромашка»" />
                </Field>
              ) : (
                <Field label="Сумма, ₽">
                  <Input name="amount" type="number" min={0} step="0.01" placeholder="0" className="tnum" />
                </Field>
              )}
            </div>
            {companyId === "__new" && (
              <Field label="Сумма, ₽">
                <Input name="amount" type="number" min={0} step="0.01" placeholder="0" className="tnum" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Воронка">
                <Select name="pipelineId" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Этап">
                <Select name="stageId" key={pipeline?.id} defaultValue={pipeline?.stages[0]?.id}>
                  {pipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Менеджер">
                <Select name="managerId" defaultValue="">
                  <option value="">Автоматически</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Источник">
                <Select name="source" defaultValue="">
                  <option value="">Как у клиента</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={close}>Отмена</Button>
              <Button type="submit" disabled={pending}>{pending ? "Создаём…" : "Создать сделку"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
