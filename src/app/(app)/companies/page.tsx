import Link from "next/link";
import { asc, desc, eq, max } from "drizzle-orm";
import { Building2, Search } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canRecord, hiddenFields } from "@/lib/permissions";
import { fmtMoney, relTime, phoneFmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { COMPANY_STATUS } from "@/components/companies/status";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { NewCompanyDialog } from "@/components/companies/new-company-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Клиенты" };


type SP = { status?: string; manager?: string; q?: string; new?: string };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.actor, "companies", "view")) return <EmptyState title="Нет доступа к клиентам" />;
  const hidden = hiddenFields(user.actor, "companies");
  const q = (sp.q ?? "").trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  const [rows, users, lastAct] = await Promise.all([
    db.select({ c: schema.companies, managerName: schema.users.name, managerColor: schema.users.color, managerTeamId: schema.users.teamId }).from(schema.companies).leftJoin(schema.users, eq(schema.companies.managerId, schema.users.id)).orderBy(desc(schema.companies.updatedAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name)),
    db.select({ companyId: schema.activities.companyId, last: max(schema.activities.createdAt) }).from(schema.activities).groupBy(schema.activities.companyId),
  ]);
  const lastMap = new Map(lastAct.map((r) => [r.companyId, r.last]));
  const list = rows
    .filter((r) => canRecord(user.actor, "companies", "view", { ownerId: r.c.managerId, ownerTeamId: r.managerTeamId }))
    .filter((r) => (!sp.status || r.c.status === sp.status) && (!sp.manager || r.c.managerId === sp.manager))
    .filter((r) => !q || r.c.name.toLowerCase().includes(q) || (r.c.shortName ?? "").toLowerCase().includes(q) || (qDigits && ((r.c.inn ?? "").includes(qDigits) || (r.c.phone ?? "").replace(/\D/g, "").includes(qDigits))) || (r.c.email ?? "").toLowerCase().includes(q));
  const counts = { all: rows.length, lead: rows.filter((r) => r.c.status === "lead").length, client: rows.filter((r) => r.c.status === "client").length, partner: rows.filter((r) => r.c.status === "partner").length };
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, manager: sp.manager, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/companies${p.size ? `?${p}` : ""}`;
  };
  const hasFilters = !!(sp.status || sp.manager || q);

  return (
    <>
      <PageHeader eyebrow="Работа"
        title="Клиенты"
        description={`${counts.all} компаний · ${counts.client} клиентов · ${counts.lead} лидов`}
        actions={can(user.actor, "companies", "create") && <NewCompanyDialog users={users} hidden={hidden} openByParam={sp.new === "1"} />}
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-canvas p-1">
          {[["", "Все", counts.all], ["lead", "Лиды", counts.lead], ["client", "Клиенты", counts.client], ["partner", "Партнёры", counts.partner]].map(([v, l, n]) => (
            <Link key={String(v)} href={href({ status: String(v) || undefined })} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", (sp.status ?? "") === v ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink")}>
              {l} <span className="text-[11px] text-muted tnum">{n}</span>
            </Link>
          ))}
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {!hidden.includes("managerId") && (
          <Select name="manager" defaultValue={sp.manager ?? ""} className="w-48">
            <option value="">Все менеджеры</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Название, ИНН, телефон" className="flex h-9 w-full rounded-[8px] border border-line-strong bg-surface pl-9 pr-3 text-sm placeholder:text-muted focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20" />
        </div>
        <Button type="submit" variant="secondary">Найти</Button>
        {hasFilters && <Button variant="ghost" asChild><Link href="/companies">Сбросить</Link></Button>}
      </form>

      {!list.length ? (
        <EmptyState
          title={hasFilters ? "Ничего не найдено" : "Клиентов пока нет"}
          description={hasFilters ? "Измените запрос или снимите фильтры." : "Добавьте первого клиента — по ИНН реквизиты заполнятся автоматически."}
          icon={<Building2 />}
          action={hasFilters ? <Button variant="secondary" asChild><Link href="/companies">Сбросить фильтры</Link></Button> : can(user.actor, "companies", "create") ? <Button asChild><Link href="/companies?new=1">Новый клиент</Link></Button> : undefined}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Компания</th>
              {!hidden.includes("inn") && <th>ИНН</th>}
              <th>Статус</th>
              {!hidden.includes("phone") && <th>Телефон</th>}
              {!hidden.includes("managerId") && <th>Менеджер</th>}
              {!hidden.includes("balance") && <th className="text-right">Баланс</th>}
              <th>Источник</th>
              <th className="text-right">Активность</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ c, managerName, managerColor }) => {
              const [sl, st] = COMPANY_STATUS[c.status] ?? ["—", "neutral"];
              return (
                <tr key={c.id}>
                  <td className="max-w-[300px]">
                    <div className="truncate"><Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></div>
                    {c.industry && <div className="truncate text-xs text-muted">{c.industry}</div>}
                  </td>
                  {!hidden.includes("inn") && <td className="tnum text-ink-2">{c.inn ?? <span className="text-muted">—</span>}</td>}
                  <td><Badge tone={st} dot>{sl}</Badge></td>
                  {!hidden.includes("phone") && <td className="tnum whitespace-nowrap text-ink-2">{phoneFmt(c.phone)}</td>}
                  {!hidden.includes("managerId") && (
                    <td>{managerName ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={managerName} color={managerColor ?? undefined} size={22} />{managerName}</span> : <span className="text-muted">—</span>}</td>
                  )}
                  {!hidden.includes("balance") && <td className={cn("text-right tnum font-medium whitespace-nowrap", c.balance < 0 ? "text-accent" : c.balance > 0 ? "text-good" : "text-muted")}>{fmtMoney(c.balance)}</td>}
                  <td>{c.source ? <Badge>{c.source}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="text-right text-muted whitespace-nowrap">{relTime(lastMap.get(c.id) ?? c.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
