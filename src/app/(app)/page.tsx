import Link from "next/link";
import { and, asc, count, desc, eq, gt, gte, inArray, lt, or, sql, sum, type SQL } from "drizzle-orm";
import { Plus, CheckSquare, Workflow } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { fmtMoney, fmtTime, relTime, plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Row, Tile, Tiles } from "@/components/dashboard/widgets";
import { TaskRow } from "@/components/tasks/task-list";
import { loadTodayTasks, teamUserIds } from "./tasks/queries";

export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", vk: "VK", max: "MAX", email: "Почта", sms: "SMS", web: "Сайт" };

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "Доброе утро";
  if (h >= 11 && h < 17) return "Добрый день";
  if (h >= 17 && h < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export default async function Dashboard() {
  const user = await requireUser();
  const a = user.actor;
  const now = new Date();
  const nowIso = now.toISOString();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86400_000).toISOString();
  const staleBefore = new Date(now.getTime() - 5 * 86400_000).toISOString();

  const teamIds = await teamUserIds(user);
  const scopeWhere = (entity: "deals" | "conversations" | "bookings", col: typeof schema.deals.managerId | typeof schema.conversations.assigneeId | typeof schema.bookings.userId): SQL | undefined => {
    const s = scopeOf(a, entity, "view");
    if (s === "all") return undefined;
    if (s === "team") return inArray(col, teamIds);
    return eq(col, user.id);
  };
  const seeDeals = can(a, "deals", "view");
  const seeMoney = can(a, "payments", "view") || can(a, "analytics", "view");
  const seeConv = can(a, "conversations", "view");
  const seeBookings = can(a, "bookings", "view");
  const seeAuto = can(a, "automations", "view");
  const seePayments = can(a, "payments", "view");
  const dealsWhere = scopeWhere("deals", schema.deals.managerId);

  const [mine, visible, won, todayTasks, unread, bookingsToday, attention, inbox, runs, payWeek, unpaid, recentPayments] = await Promise.all([
    seeDeals ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "open"), eq(schema.deals.managerId, user.id))).then((r) => r[0]) : null,
    seeDeals ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "open"), dealsWhere)).then((r) => r[0]) : null,
    seeDeals && seeMoney ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "won"), gte(schema.deals.closedAt, monthStart), dealsWhere)).then((r) => r[0]) : null,
    loadTodayTasks(user),
    seeConv ? db.select({ n: count() }).from(schema.conversations).where(and(gt(schema.conversations.unread, 0), eq(schema.conversations.status, "open"), scopeWhere("conversations", schema.conversations.assigneeId))).then((r) => r[0]) : null,
    seeBookings
      ? db
          .select({ b: schema.bookings, userName: schema.users.name, userColor: schema.users.color })
          .from(schema.bookings)
          .leftJoin(schema.users, eq(schema.bookings.userId, schema.users.id))
          .where(and(eq(schema.bookings.status, "confirmed"), gte(schema.bookings.startsAt, dayStart.toISOString()), lt(schema.bookings.startsAt, dayEnd.toISOString()), scopeWhere("bookings", schema.bookings.userId)))
          .orderBy(asc(schema.bookings.startsAt))
      : [],
    seeDeals
      ? db
          .select({ d: schema.deals, companyName: schema.companies.name, stageName: schema.stages.name, stageColor: schema.stages.color, managerName: schema.users.name, managerColor: schema.users.color })
          .from(schema.deals)
          .leftJoin(schema.companies, eq(schema.deals.companyId, schema.companies.id))
          .leftJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
          .leftJoin(schema.users, eq(schema.deals.managerId, schema.users.id))
          .where(and(eq(schema.deals.status, "open"), dealsWhere, or(lt(schema.deals.updatedAt, staleBefore), lt(schema.deals.expectedCloseAt, nowIso))))
          .orderBy(asc(schema.deals.updatedAt))
          .limit(8)
      : [],
    seeConv
      ? db
          .select({ c: schema.conversations, companyName: schema.companies.name, lastText: sql<string | null>`(select text from messages m where m.conversation_id = ${schema.conversations.id} order by m.created_at desc limit 1)` })
          .from(schema.conversations)
          .leftJoin(schema.companies, eq(schema.conversations.companyId, schema.companies.id))
          .where(and(gt(schema.conversations.unread, 0), eq(schema.conversations.status, "open"), scopeWhere("conversations", schema.conversations.assigneeId)))
          .orderBy(desc(schema.conversations.lastMessageAt))
          .limit(6)
      : [],
    seeAuto
      ? db
          .select({ r: schema.automationRuns, name: schema.automations.name })
          .from(schema.automationRuns)
          .innerJoin(schema.automations, eq(schema.automationRuns.automationId, schema.automations.id))
          .orderBy(desc(schema.automationRuns.createdAt))
          .limit(10)
      : [],
    seePayments ? db.select({ n: count(), s: sum(schema.payments.amount) }).from(schema.payments).where(and(eq(schema.payments.direction, "in"), gte(schema.payments.paidAt, weekAgo))).then((r) => r[0]) : null,
    seePayments ? db.select({ n: count(), s: sum(schema.documents.amount) }).from(schema.documents).where(and(eq(schema.documents.type, "invoice"), inArray(schema.documents.status, ["draft", "sent"]))).then((r) => r[0]) : null,
    seePayments
      ? db
          .select({ p: schema.payments, companyName: schema.companies.name })
          .from(schema.payments)
          .leftJoin(schema.companies, eq(schema.payments.companyId, schema.companies.id))
          .where(eq(schema.payments.direction, "in"))
          .orderBy(desc(schema.payments.paidAt))
          .limit(5)
      : [],
  ]);

  const dealsTile = mine && mine.n > 0 ? { label: "Мои сделки в работе", n: mine.n, s: Number(mine.s ?? 0) } : { label: "Сделки в работе", n: visible?.n ?? 0, s: Number(visible?.s ?? 0) };
  const overdueTasks = todayTasks.filter((t) => t.overdue);
  const dueToday = todayTasks.filter((t) => !t.overdue && t.dueAt);
  const noDue = todayTasks.filter((t) => !t.dueAt);
  const recentRuns = runs.filter((r) => r.r.createdAt >= dayAgo);
  const feed = recentRuns.length ? recentRuns : runs.slice(0, 6);

  const firstName = user.name.split(/\s+/)[0];
  const rawDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const dateStr = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const summary: string[] = [];
  if (dueToday.length || overdueTasks.length) summary.push(`${plural(dueToday.length, "задача", "задачи", "задач")} на сегодня${overdueTasks.length ? `, ${plural(overdueTasks.length, "просрочена", "просрочены", "просрочено")}` : ""}`);
  else summary.push("задач на сегодня нет");
  if (unread && unread.n > 0) summary.push(plural(unread.n, "непрочитанная переписка", "непрочитанные переписки", "непрочитанных переписок"));
  if (bookingsToday.length) summary.push(plural(bookingsToday.length, "встреча в календаре", "встречи в календаре", "встреч в календаре"));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted">{dateStr}</div>
          <h1 className="mt-0.5 text-[28px] font-semibold leading-8 tracking-[-0.02em]">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">{summary.join(" · ")}.</p>
        </div>
        <div className="flex items-center gap-2">
          {seeDeals && can(a, "deals", "create") && (
            <Button variant="secondary" asChild><Link href="/deals?new=1"><Plus /> Сделка</Link></Button>
          )}
          {can(a, "tasks", "create") && (
            <Button asChild><Link href="/tasks?new=1"><Plus /> Задача</Link></Button>
          )}
        </div>
      </div>

      <Tiles>
        {seeDeals && <Tile label={dealsTile.label} value={dealsTile.n} sub={fmtMoney(dealsTile.s)} href="/deals" />}
        {won && <Tile label="Выручка за месяц" value={fmtMoney(Number(won.s ?? 0))} sub={won.n ? plural(won.n, "сделка закрыта", "сделки закрыты", "сделок закрыто") : "пока без закрытий"} tone="good" href="/analytics" />}
        <Tile label="Задачи на сегодня" value={dueToday.length} sub={noDue.length ? `${plural(noDue.length, "задача", "задачи", "задач")} без срока` : "по сроку"} href="/tasks" />
        <Tile label="Просрочено" value={overdueTasks.length} tone={overdueTasks.length ? "accent" : undefined} sub={overdueTasks.length ? "требуют внимания" : "всё в срок"} href="/tasks?tab=overdue" />
        {unread && <Tile label="Непрочитанные" value={unread.n} tone={unread.n ? "info" : undefined} sub="переписки с клиентами" href="/inbox" />}
        {seeBookings && <Tile label="Записи на сегодня" value={bookingsToday.length} sub={bookingsToday[0] ? `ближайшая в ${fmtTime(bookingsToday[0].b.startsAt)}` : "встреч нет"} href="/calendar" />}
      </Tiles>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Задачи на сегодня" count={todayTasks.length} href="/tasks" empty="На сегодня задач нет. Новые появятся от коллег, автоматизаций и Telegram-бота.">
            {[...overdueTasks, ...dueToday, ...noDue].slice(0, 10).map((t) => (
              <TaskRow key={t.id} task={t} users={[]} compact />
            ))}
            {todayTasks.length > 10 && (
              <Link href="/tasks" className="block px-4 py-2 text-center text-xs text-muted hover:text-ink">Ещё {todayTasks.length - 10} в списке задач</Link>
            )}
          </Panel>

          {seeDeals && (
            <Panel title="Сделки, требующие внимания" count={attention.length} href="/deals" empty="Все сделки в движении: по каждой была активность за последние 5 дней.">
              {attention.map(({ d, companyName, stageName, stageColor, managerName, managerColor }) => {
                const stale = Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / 86400_000);
                const expired = !!d.expectedCloseAt && new Date(d.expectedCloseAt).getTime() < now.getTime();
                return (
                  <Row key={d.id} href={`/deals/${d.id}`}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: stageColor ?? "#cdd2da" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.title}</div>
                      <div className="truncate text-xs text-muted">{companyName ?? "Без клиента"} · {stageName ?? "—"}</div>
                    </div>
                    {expired ? <Badge tone="accent">срок закрытия прошёл</Badge> : <Badge tone="warn">без активности {stale} дн.</Badge>}
                    <div className="w-[110px] shrink-0 text-right text-sm tnum">{fmtMoney(d.amount)}</div>
                    {managerName && <Avatar name={managerName} color={managerColor ?? undefined} size={24} />}
                  </Row>
                );
              })}
            </Panel>
          )}

          {seePayments && (
            <Panel title="Деньги" href="/finance">
              <div className="grid grid-cols-2 divide-x divide-line">
                <div className="px-4 py-3">
                  <div className="text-xs text-muted">Поступления за 7 дней</div>
                  <div className="mt-0.5 text-[20px] font-semibold tracking-[-0.01em] text-good tnum">{fmtMoney(Number(payWeek?.s ?? 0))}</div>
                  <div className="text-xs text-muted">{plural(payWeek?.n ?? 0, "платёж", "платежа", "платежей")}</div>
                </div>
                <Link href="/documents?type=invoice&status=sent" className="px-4 py-3 transition-colors hover:bg-surface-2">
                  <div className="text-xs text-muted">Неоплаченные счета</div>
                  <div className={`mt-0.5 text-[20px] font-semibold tracking-[-0.01em] tnum ${unpaid?.n ? "text-warn" : ""}`}>{fmtMoney(Number(unpaid?.s ?? 0))}</div>
                  <div className="text-xs text-muted">{plural(unpaid?.n ?? 0, "счёт", "счёта", "счетов")} ждут оплаты</div>
                </Link>
              </div>
              {recentPayments.map(({ p, companyName }) => (
                <Row key={p.id} href={p.dealId ? `/deals/${p.dealId}` : "/finance"}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{companyName ?? "Контрагент"}</div>
                    <div className="truncate text-xs text-muted">{p.purpose ?? "Оплата"}</div>
                  </div>
                  <Badge tone="neutral">{p.method === "sbp" ? "СБП" : p.method === "bank" ? "банк" : p.method === "card" ? "карта" : "наличные"}</Badge>
                  <div className="w-[110px] text-right text-good tnum">+{fmtMoney(p.amount)}</div>
                  <div className="w-[80px] text-right text-xs text-muted">{relTime(p.paidAt)}</div>
                </Row>
              ))}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {seeConv && (
            <Panel title="Входящие" count={inbox.length} href="/inbox" empty="Непрочитанных сообщений нет.">
              {inbox.map(({ c, companyName, lastText }) => (
                <Row key={c.id} href={`/inbox?c=${c.id}`}>
                  <Avatar name={c.peerName} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{c.peerName}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{relTime(c.lastMessageAt)}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{lastText ?? companyName ?? CHANNEL[c.channel]}</div>
                  </div>
                  <span className="grid min-w-5 place-items-center rounded-full bg-info px-1.5 text-[11px] font-semibold text-white tnum">{c.unread}</span>
                </Row>
              ))}
            </Panel>
          )}

          {seeBookings && (
            <Panel title="Календарь на сегодня" count={bookingsToday.length} href="/calendar" empty="Встреч на сегодня нет.">
              {bookingsToday.map(({ b, userName, userColor }) => (
                <Row key={b.id} href="/calendar">
                  <div className="w-[88px] shrink-0 text-xs text-muted tnum">{fmtTime(b.startsAt)}–{fmtTime(b.endsAt)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.title}</div>
                    {(b.clientName || b.clientPhone) && <div className="truncate text-xs text-muted">{[b.clientName, b.clientPhone].filter(Boolean).join(" · ")}</div>}
                  </div>
                  {b.source === "public" && <Badge tone="violet">онлайн-запись</Badge>}
                  {userName && <Avatar name={userName} color={userColor ?? undefined} size={24} />}
                </Row>
              ))}
            </Panel>
          )}

          {seeAuto && (
            <Panel title="Что сделала система за 24 часа" count={feed.length} href="/automations" hrefLabel="Автоматизации" empty="За последние сутки автоматизации не запускались. Они сработают сами: при новой заявке, счёте, оплате или сообщении.">
              {!recentRuns.length && feed.length > 0 && <p className="px-4 py-2 text-xs text-muted">За сутки запусков не было — последние запуски:</p>}
              {feed.map(({ r, name }) => (
                <Row key={r.id} href={`/automations/${r.automationId}`}>
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${r.status === "ok" ? "bg-good-soft text-good" : r.status === "error" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
                    <Workflow className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{name}</div>
                    <div className="truncate text-xs text-muted">{r.log[0] ?? (r.status === "skipped" ? "Условия не выполнены" : "—")}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-muted">{relTime(r.createdAt)}</div>
                </Row>
              ))}
            </Panel>
          )}

          {!seeConv && !seeBookings && !seeAuto && (
            <div className="rounded-[12px] border border-dashed border-line-strong p-5 text-center text-[13px] text-muted">
              <CheckSquare className="mx-auto mb-2 size-6" />
              Ваша роль видит только задачи{seeDeals ? " и сделки" : ""}. Остальные разделы откроет администратор в настройках ролей.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
