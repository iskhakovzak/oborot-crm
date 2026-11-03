import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq, and, notInArray, isNotNull } from "drizzle-orm";
import { Factory } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields } from "@/lib/permissions";
import { fmtDate, fmtNum, fmtPct, plural } from "@/lib/format";
import { PageHeader, Stat, EmptyState } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LinkTabs } from "@/components/documents/link-tabs";
import { ProductionBoard } from "@/components/production/board";
import { NewOrderDialog } from "@/components/production/new-order-dialog";
import { OrderDialogButton } from "@/components/production/order-dialog";
import { ORDER_STATUS, type ProdOrder, type ProdStage, type ProdUser } from "@/components/production/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Производство" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "production", "view")) redirect("/");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const canEdit = can(user.actor, "production", "edit");
  const canCreate = can(user.actor, "production", "create");
  const showAmount = !hiddenFields(user.actor, "deals").includes("amount");

  const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "production") });
  const stages: ProdStage[] = pipeline ? (await db.query.stages.findMany({ where: eq(schema.stages.pipelineId, pipeline.id), orderBy: asc(schema.stages.order) })).map((s) => ({ id: s.id, name: s.name, order: s.order, color: s.color, kind: s.kind })) : [];
  const rows = await db
    .select({ o: schema.productionOrders, companyName: schema.companies.name, dealNumber: schema.deals.number, dealAmount: schema.deals.amount, assigneeName: schema.users.name, assigneeColor: schema.users.color })
    .from(schema.productionOrders)
    .leftJoin(schema.companies, eq(schema.productionOrders.companyId, schema.companies.id))
    .leftJoin(schema.deals, eq(schema.productionOrders.dealId, schema.deals.id))
    .leftJoin(schema.users, eq(schema.productionOrders.assigneeId, schema.users.id))
    .orderBy(asc(schema.productionOrders.plannedAt), desc(schema.productionOrders.createdAt));
  const orders: ProdOrder[] = rows.map(({ o, companyName, dealNumber, dealAmount, assigneeName, assigneeColor }) => ({
    id: o.id, number: o.number, title: o.title, stageId: o.stageId ?? stages[0]?.id ?? null, status: o.status, companyId: o.companyId, companyName, dealId: o.dealId, dealNumber, dealAmount: showAmount ? dealAmount : null,
    assigneeId: o.assigneeId, assigneeName, assigneeColor, qty: o.qty, defects: o.defects, plannedAt: o.plannedAt, startedAt: o.startedAt, finishedAt: o.finishedAt, notes: o.notes, createdAt: o.createdAt,
  }));
  const usersAll = await db.query.users.findMany({ where: eq(schema.users.isActive, true), orderBy: asc(schema.users.name) });
  const users: ProdUser[] = [...usersAll.filter((u) => u.teamId === "production"), ...usersAll.filter((u) => u.teamId !== "production")].map((u) => ({ id: u.id, name: u.name, color: u.color, teamId: u.teamId }));

  // статистика
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const active = orders.filter((o) => o.status !== "cancelled");
  const queued = active.filter((o) => o.status === "queued").length;
  const inProgress = active.filter((o) => o.status === "in_progress").length;
  const doneMonth = active.filter((o) => o.status === "done" && (o.finishedAt ?? "") >= monthAgo).length;
  const durations = active.filter((o) => o.startedAt && o.finishedAt).map((o) => (new Date(o.finishedAt!).getTime() - new Date(o.startedAt!).getTime()) / 86400_000);
  const avgDays = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
  const totalQty = active.reduce((s, o) => s + o.qty, 0);
  const totalDefects = active.reduce((s, o) => s + o.defects, 0);
  const defectRate = totalQty ? (totalDefects / totalQty) * 100 : 0;

  // сделки для «Новый заказ»: выигранные продажи без заказа
  const withOrder = orders.map((o) => o.dealId).filter((x): x is string => !!x);
  const dealOptions = canCreate
    ? (await db.select({ id: schema.deals.id, number: schema.deals.number, title: schema.deals.title, company: schema.companies.name })
        .from(schema.deals).innerJoin(schema.pipelines, eq(schema.deals.pipelineId, schema.pipelines.id)).leftJoin(schema.companies, eq(schema.deals.companyId, schema.companies.id))
        .where(and(eq(schema.pipelines.kind, "sales"), eq(schema.deals.status, "won"), isNotNull(schema.deals.companyId), ...(withOrder.length ? [notInArray(schema.deals.id, withOrder)] : []))).orderBy(desc(schema.deals.number)).limit(100))
    : [];
  const companyOptions = canCreate ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)) : [];

  return (
    <>
      <PageHeader eyebrow="Деньги и документы"
        title="Производство"
        description="Заказы по этапам, сроки, исполнители и брак."
        actions={canCreate ? <NewOrderDialog deals={dealOptions} companies={companyOptions} users={users} /> : undefined}
      />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="В очереди" value={queued} />
        <Stat label="В работе" value={inProgress} tone="info" />
        <Stat label="Готово за 30 дней" value={doneMonth} tone="good" />
        <Stat label="Среднее время выполнения" value={avgDays == null ? "—" : `${fmtNum(Math.round(avgDays * 10) / 10)} дн.`} sub={durations.length ? `по ${plural(durations.length, "заказу", "заказам", "заказам")}` : "нет завершённых"} />
        <Stat label="Процент брака" value={fmtPct(defectRate, 1)} tone={defectRate > 2 ? "accent" : defectRate > 0 ? "warn" : "good"} sub={`${totalDefects} из ${fmtNum(totalQty)} шт`} />
      </div>
      <div className="mb-4">
        <LinkTabs active={view} items={[{ key: "board", label: "Канбан", href: "/production" }, { key: "list", label: "Список", href: "/production?view=list" }]} />
      </div>
      {!stages.length ? (
        <EmptyState icon={<Factory />} title="Воронка производства не настроена" description="Добавьте воронку с типом «производство» и этапами в настройках." />
      ) : view === "board" ? (
        <ProductionBoard stages={stages} orders={orders.filter((o) => o.status !== "cancelled")} users={users} canEdit={canEdit} showAmount={showAmount} />
      ) : orders.length === 0 ? (
        <EmptyState icon={<Factory />} title="Заказов пока нет" description="Создайте заказ из выигранной сделки или вручную." />
      ) : (
        <Table>
          <thead><tr><th>№</th><th>Заказ</th><th>Клиент</th><th>Сделка</th><th>Исполнитель</th><th>План</th><th>Старт</th><th>Финиш</th><th className="text-right">Кол-во</th><th className="text-right">Брак</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status];
              const overdue = o.plannedAt && o.status !== "done" && o.status !== "cancelled" && o.plannedAt < new Date().toISOString();
              return (
                <tr key={o.id}>
                  <td className="tnum text-muted">{o.number}</td>
                  <td className="max-w-[220px] truncate font-medium" title={o.title}>{o.title}</td>
                  <td className="max-w-[180px] truncate">{o.companyId ? <Link href={`/companies/${o.companyId}`} className="hover:underline">{o.companyName}</Link> : <span className="text-muted">—</span>}</td>
                  <td>{o.dealId ? <Link href={`/deals/${o.dealId}`} className="hover:underline">№{o.dealNumber}</Link> : <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap">{o.assigneeName ? <span className="inline-flex items-center gap-1.5"><Avatar name={o.assigneeName} color={o.assigneeColor ?? undefined} size={20} />{o.assigneeName}</span> : <span className="text-muted">—</span>}</td>
                  <td className={`whitespace-nowrap ${overdue ? "text-accent" : "text-ink-2"}`}>{fmtDate(o.plannedAt, { day: "numeric", month: "short" })}</td>
                  <td className="whitespace-nowrap text-ink-2">{fmtDate(o.startedAt, { day: "numeric", month: "short" })}</td>
                  <td className="whitespace-nowrap text-ink-2">{fmtDate(o.finishedAt, { day: "numeric", month: "short" })}</td>
                  <td className="text-right tnum">{fmtNum(o.qty)}</td>
                  <td className={`text-right tnum ${o.defects ? "text-accent font-medium" : "text-muted"}`}>{o.defects}</td>
                  <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                  <td className="text-right whitespace-nowrap"><OrderDialogButton order={o} users={users} canEdit={canEdit} showAmount={showAmount} /></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
