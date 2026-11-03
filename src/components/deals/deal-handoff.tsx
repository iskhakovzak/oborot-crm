"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, Wrench, Factory, ArrowUpLeft, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/page";
import { Money } from "@/components/ui/money";
import { handoff } from "@/app/(app)/deals/actions";

export type RelatedDeal = { id: string; number: number; title: string; amount: number | null; pipelineName: string; stageName: string; stageColor: string; status: "open" | "won" | "lost"; relation: "parent" | "child" };
export type RelatedOrder = { id: string; number: number; title: string; status: "queued" | "in_progress" | "done" | "cancelled"; stageName: string | null };

const ORDER_STATUS: Record<RelatedOrder["status"], string> = { queued: "В очереди", in_progress: "В работе", done: "Готово", cancelled: "Отменён" };

export function DealHandoff({ dealId, pipelineKind, related, orders, canHandoff }: { dealId: string; pipelineKind: string; related: RelatedDeal[]; orders: RelatedOrder[]; canHandoff: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function go(kind: "shipping" | "service" | "production") {
    start(async () => {
      const r = await handoff(dealId, kind);
      if ("error" in r) { toast.error(r.error); return; }
      if (kind === "production") toast.success(`Заказ №${r.number} поставлен в производство`, { action: { label: "Производство", onClick: () => router.push("/production") } });
      else toast.success(`Сделка №${r.number} создана в воронке «${kind === "shipping" ? "Отгрузка" : "Услуги и монтаж"}»`, { action: { label: "Открыть", onClick: () => router.push(`/deals/${r.id}`) } });
    });
  }
  return (
    <Section
      title="Передать дальше"
      description="Позиции, контакт и история переносятся в следующую воронку без ручного ввода"
      action={canHandoff && pipelineKind !== "production" && (
        <div className="flex flex-wrap gap-1.5">
          {pipelineKind !== "shipping" && <Button size="sm" variant="secondary" onClick={() => go("shipping")} disabled={pending}><Truck /> В отгрузку</Button>}
          {pipelineKind !== "service" && <Button size="sm" variant="secondary" onClick={() => go("service")} disabled={pending}><Wrench /> В услуги</Button>}
          <Button size="sm" variant="secondary" onClick={() => go("production")} disabled={pending}><Factory /> В производство</Button>
        </div>
      )}
    >
      {!related.length && !orders.length ? (
        <p className="text-[13px] text-muted">Связанных сделок и заказов пока нет.</p>
      ) : (
        <ul className="divide-y divide-line -my-2">
          {related.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              {d.relation === "parent" ? <ArrowUpLeft className="size-4 shrink-0 text-muted" /> : <ArrowDownRight className="size-4 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <Link href={`/deals/${d.id}`} className="block truncate font-medium hover:underline">№{d.number} · {d.title}</Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span>{d.relation === "parent" ? "Родительская" : "Дочерняя"} · {d.pipelineName}</span>
                  <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: d.stageColor }} />{d.stageName}</span>
                </div>
              </div>
              {d.amount !== null && <span className="shrink-0 text-[13px] font-medium"><Money value={d.amount} compact /></span>}
            </li>
          ))}
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              <Factory className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <Link href="/production" className="font-medium hover:underline">Заказ №{o.number} · {o.title}</Link>
                <div className="mt-0.5 text-xs text-muted">Производство{o.stageName ? ` · ${o.stageName}` : ""}</div>
              </div>
              <Badge tone={o.status === "done" ? "good" : o.status === "in_progress" ? "info" : "neutral"}>{ORDER_STATUS[o.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
