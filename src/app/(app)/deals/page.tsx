import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { KanbanSquare, List, Search } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields, scopeOf, canRecord } from "@/lib/permissions";
import { fmtMoney, fmtDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kanban } from "@/components/deals/kanban";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { daysSince, type KanbanDeal, type PipelineInfo } from "@/components/deals/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Сделки" };

type SP = { pipeline?: string; view?: string; mine?: string; q?: string; new?: string };

export default async function DealsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.actor, "deals", "view")) {
    return <EmptyState title="Нет доступа к сделкам" description="Обратитесь к администратору, чтобы получить права на раздел." />;
  }
  const pipelinesRaw = await db.query.pipelines.findMany({ orderBy: asc(schema.pipelines.order) });
  const stagesRaw = await db.query.stages.findMany({ orderBy: asc(schema.stages.order) });
  const pipelines: PipelineInfo[] = pipelinesRaw.map((p) => ({ id: p.id, name: p.name, kind: p.kind, stages: stagesRaw.filter((s) => s.pipelineId === p.id) }));
  const current = pipelines.find((p) => p.id === sp.pipeline || p.kind === sp.pipeline) ?? pipelines.find((p) => p.kind === "sales") ?? pipelines[0];
  if (!current) return <EmptyState title="Воронки не настроены" description="Запустите сид или создайте воронку в настройках." />;

  const view = sp.view === "list" ? "list" : "kanban";
  const mine = sp.mine === "1";
  const q = (sp.q ?? "").trim().toLowerCase();
  const hidden = hiddenFields(user.actor, "deals");
  const scope = scopeOf(user.actor, "deals", "view");

  const rows = await db
    .select({ deal: schema.deals, companyName: schema.companies.name, managerName: schema.users.name, managerColor: schema.users.color, managerTeamId: schema.users.teamId })
    .from(schema.deals)
    .leftJoin(schema.companies, eq(schema.deals.companyId, schema.companies.id))
    .leftJoin(schema.users, eq(schema.deals.managerId, schema.users.id))
    .where(eq(schema.deals.pipelineId, current.id))
    .orderBy(desc(schema.deals.updatedAt));

  const visible = rows.filter((r) => {
    if (scope === "all") return true;
    if (scope === "own") return r.deal.managerId === user.id;
    if (scope === "team") return r.deal.managerId === user.id || (!!user.teamId && r.managerTeamId === user.teamId);
    return false;
  });
  const filtered = visible.filter((r) => {
    if (mine && r.deal.managerId !== user.id) return false;
    if (!q) return true;
    return r.deal.title.toLowerCase().includes(q) || (r.companyName ?? "").toLowerCase().includes(q) || String(r.deal.number).includes(q);
  });
  const deals: KanbanDeal[] = filtered.map((r) => ({
    id: r.deal.id,
    number: r.deal.number,
    title: r.deal.title,
    companyId: r.deal.companyId,
    companyName: r.companyName,
    amount: hidden.includes("amount") ? null : r.deal.amount,
    managerName: r.managerName,
    managerColor: r.managerColor,
    stageId: r.deal.stageId,
    daysOnStage: daysSince(r.deal.stageEnteredAt),
    source: hidden.includes("source") ? null : r.deal.source,
    status: r.deal.status,
    updatedAt: r.deal.updatedAt,
    canEdit: can(user.actor, "deals", "edit") && canRecord(user.actor, "deals", "edit", { ownerId: r.deal.managerId, ownerTeamId: r.managerTeamId }),
  }));
  const open = filtered.filter((r) => r.deal.status === "open");
  const openSum = open.reduce((s, r) => s + r.deal.amount, 0);
  const won = filtered.filter((r) => r.deal.status === "won");

  const companies = can(user.actor, "companies", "view") ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)) : [];
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name));
  const stageById = new Map(current.stages.map((s) => [s.id, s]));

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { pipeline: current.id, view, mine: mine ? "1" : undefined, q: sp.q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/deals?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Сделки"
        description={
          <>
            {plural(open.length, "открытая сделка", "открытые сделки", "открытых сделок")}
            {!hidden.includes("amount") && <> на <span className="tnum font-medium text-ink">{fmtMoney(openSum)}</span></>}
            {won.length > 0 && <> · выиграно {won.length}</>}
          </>
        }
        actions={can(user.actor, "deals", "create") && <NewDealDialog pipelines={pipelines} companies={companies} users={users} defaultPipelineId={current.id} openByParam={sp.new === "1"} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
          {pipelines.map((p) => (
            <Link key={p.id} href={href({ pipeline: p.id })} className={cn("inline-flex h-7 items-center rounded-[7px] px-3 text-[13px] font-medium transition-colors", p.id === current.id ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
              {p.name}
            </Link>
          ))}
        </div>
        <div className="inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
          <Link href={href({ view: "kanban" })} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium", view === "kanban" ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")} aria-label="Канбан">
            <KanbanSquare className="size-4" /> Канбан
          </Link>
          <Link href={href({ view: "list" })} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium", view === "list" ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")} aria-label="Список">
            <List className="size-4" /> Список
          </Link>
        </div>
        <div className="inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
          <Link href={href({ mine: undefined })} className={cn("inline-flex h-7 items-center rounded-[7px] px-3 text-[13px] font-medium", !mine ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>Все</Link>
          <Link href={href({ mine: "1" })} className={cn("inline-flex h-7 items-center rounded-[7px] px-3 text-[13px] font-medium", mine ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>Мои</Link>
        </div>
        <form method="get" className="relative ml-auto w-full max-w-xs">
          <input type="hidden" name="pipeline" value={current.id} />
          <input type="hidden" name="view" value={view} />
          {mine && <input type="hidden" name="mine" value="1" />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Название, клиент, номер" className="flex h-9 w-full rounded-[8px] border border-line-strong bg-surface pl-9 pr-3 text-sm placeholder:text-muted focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20" />
        </form>
      </div>

      {!deals.length ? (
        <EmptyState
          title={q || mine ? "Ничего не найдено" : "В этой воронке пока нет сделок"}
          description={q || mine ? "Измените запрос или снимите фильтр «Мои»." : "Создайте первую сделку — менеджер назначится по правилам распределения."}
          icon={<KanbanSquare />}
          action={q || mine ? <Button variant="secondary" asChild><Link href={href({ q: undefined, mine: undefined })}>Сбросить фильтры</Link></Button> : can(user.actor, "deals", "create") ? <Button asChild><Link href={href({ new: "1" })}>Новая сделка</Link></Button> : undefined}
        />
      ) : view === "kanban" ? (
        <Kanban stages={current.stages} deals={deals} hideAmount={hidden.includes("amount")} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className="w-16">№</th>
              <th>Сделка</th>
              <th>Клиент</th>
              <th>Этап</th>
              {!hidden.includes("amount") && <th className="text-right">Сумма</th>}
              <th>Менеджер</th>
              {!hidden.includes("source") && <th>Источник</th>}
              <th className="text-right">На этапе</th>
              <th className="text-right">Обновлена</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const st = stageById.get(d.stageId);
              return (
                <tr key={d.id}>
                  <td className="tnum text-muted">{d.number}</td>
                  <td className="max-w-[320px] truncate">
                    <Link href={`/deals/${d.id}`} className="font-medium hover:underline" title={d.title}>{d.title}</Link>
                  </td>
                  <td className="max-w-[220px] truncate">{d.companyId ? <Link href={`/companies/${d.companyId}`} className="text-ink-2 hover:underline">{d.companyName}</Link> : <span className="text-muted">—</span>}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="size-2 rounded-full" style={{ background: st?.color }} />
                      {st?.name}
                    </span>
                  </td>
                  {!hidden.includes("amount") && <td className="text-right tnum font-medium whitespace-nowrap">{fmtMoney(d.amount)}</td>}
                  <td>
                    {d.managerName ? (
                      <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={d.managerName} color={d.managerColor ?? undefined} size={22} />{d.managerName}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {!hidden.includes("source") && <td>{d.source ? <Badge className="max-w-[140px] truncate">{d.source}</Badge> : <span className="text-muted">—</span>}</td>}
                  <td className={cn("text-right tnum", d.daysOnStage > 7 && d.status === "open" ? "text-warn" : "text-muted")}>{plural(d.daysOnStage, "день", "дня", "дней")}</td>
                  <td className="text-right text-muted tnum">{fmtDate(d.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
