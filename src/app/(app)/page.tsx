import Link from "next/link";
import { and, asc, count, desc, eq, gt, gte, inArray, lt, or, sql, sum, type SQL } from "drizzle-orm";
import { Plus, CheckSquare, Workflow, TrendingUp } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { fmtTime, relTime, plural, fmtMoneyCompact } from "@/lib/format";
import { Money } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Row, Tile, Tiles } from "@/components/dashboard/widgets";
import { TaskRow } from "@/components/tasks/task-list";
import { loadTodayTasks, teamUserIds } from "./tasks/queries";

export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", max: "MAX", email: "Почта", sms: "SMS", web: "Сайт" };

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
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
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

  const [mine, visible, won, wonPrev, todayTasks, unread, bookingsToday, attention, inbox, runs, payWeek, unpaid, recentPayments] = await Promise.all([
    seeDeals ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "open"), eq(schema.deals.managerId, user.id))).then((r) => r[0]) : null,
    seeDeals ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "open"), dealsWhere)).then((r) => r[0]) : null,
    seeDeals && seeMoney ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "won"), gte(schema.deals.closedAt, monthStart), dealsWhere)).then((r) => r[0]) : null,
    seeDeals && seeMoney ? db.select({ n: count(), s: sum(schema.deals.amount) }).from(schema.deals).where(and(eq(schema.deals.status, "won"), gte(schema.deals.closedAt, prevMonthStart), lt(schema.deals.closedAt, monthStart), dealsWhere)).then((r) => r[0]) : null,
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

  // «Громкая» карточка: выручка месяца против прошлого и 8 тиков условного плана (прошлый месяц × 1,1)
  const wonSum = Number(won?.s ?? 0);
  const prevSum = Number(wonPrev?.s ?? 0);
  const deltaPct = prevSum > 0 ? Math.round(((wonSum - prevSum) / prevSum) * 100) : null;
  const insightTitle = deltaPct === null ? "Первый месяц в системе" : deltaPct === 0 ? "Как в прошлом месяце" : deltaPct > 0 ? `На ${deltaPct}% больше, чем в прошлом месяце` : `На ${Math.abs(deltaPct)}% меньше, чем в прошлом месяце`;
  const planShare = prevSum > 0 ? wonSum / (prevSum * 1.1) : (won?.n ?? 0) / Math.max(1, (won?.n ?? 0) + (visible?.n ?? 0));
  const ticksOn = Math.max(0, Math.min(8, Math.round(planShare * 8)));
  const insightSub = prevSum > 0 ? `План ${fmtMoneyCompact(prevSum * 1.1)} · выполнено ${Math.min(999, Math.round(planShare * 100))}%` : `${plural(won?.n ?? 0, "сделка закрыта", "сделки закрыты", "сделок закрыто")} из ${(won?.n ?? 0) + (visible?.n ?? 0)}`;

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
      <div className="rise mb-5 flex flex-wrap items-end justify-between gap-4" style={{ ["--rise-i" as string]: 0 }}>
        <div>
          <div className="eyebrow">{`// Работа · ${dateStr}`}</div>
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

      <Tiles cols={won ? 5 : 6}>
        {seeDeals && <Tile i={1} label={dealsTile.label} value={dealsTile.n} sub={<Money value={dealsTile.s} compact />} href="/deals" />}
        <Tile i={2} label="Задачи на сегодня" value={dueToday.length} sub={noDue.length ? `${plural(noDue.length, "задача", "задачи", "задач")} без срока` : "по сроку"} href="/tasks" />
        <Tile i={3} label="Просрочено" value={overdueTasks.length} tone={overdueTasks.length ? "accent" : undefined} sub={overdueTasks.length ? "требуют внимания" : "всё в срок"} href="/tasks?tab=overdue" />
        {unread && <Tile i={4} label="Непрочитанные" value={unread.n} tone={unread.n ? "info" : undefined} sub="переписки с клиентами" href="/inbox" />}
        {seeBookings && <Tile i={5} label="Записи на сегодня" value={bookingsToday.length} sub={bookingsToday[0] ? `ближайшая в ${fmtTime(bookingsToday[0].b.startsAt)}` : "встреч нет"} href="/calendar" />}
      </Tiles>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {won && (
            <Link href="/analytics?tab=sales" className="insight block p-5 sm:p-6" style={{ ["--rise-i" as string]: 6 }}>
              <div className="insight-grain" />
              <div className="insight-shard" />
              <div className="relative flex min-w-0 flex-col gap-4">
                <span className="insight-pill"><TrendingUp className="size-3.5" /> Выручка за месяц</span>
                <div className="truncate text-[clamp(28px,3vw,44px)] font-bold leading-none tracking-[-0.04em] tnum" title={fmtMoneyCompact(wonSum)}>{fmtMoneyCompact(wonSum)}</div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{insightTitle}</div>
                  <div className="mt-1 truncate text-[11.5px] text-white/70">{insightSub}</div>
                </div>
                <div className="insight-ticks flex gap-1.5" aria-label={`Выполнение плана: ${ticksOn} из 8`}>
                  {Array.from({ length: 8 }, (_, i) => <span key={i} data-on={i < ticksOn ? "" : undefined} />)}
                </div>
              </div>
            </Link>
          )}
          <Panel i={7} title="Задачи на сегодня" count={todayTasks.length} href="/tasks" empty="На сегодня задач нет.">
            {[...overdueTasks, ...dueToday, ...noDue].slice(0, 10).map((t) => (
              <TaskRow key={t.id} task={t} users={[]} compact />
            ))}
            {todayTasks.length > 10 && (
              <Link href="/tasks" className="block px-4 py-2 text-center text-xs text-muted hover:text-ink">Ещё {todayTasks.length - 10} в списке задач</Link>
            )}
          </Panel>

          {seeDeals && (
            <Panel i={8} title="Сделки, требующие внимания" count={attention.length} href="/deals" empty="По всем сделкам была активность за последние 5 дней.">
              {attention.map(({ d, companyName, stageName, stageColor, managerName, managerColor }) => {
                const stale = Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / 86400_000);
                const expired = !!d.expectedCloseAt && new Date(d.expectedCloseAt).getTime() < now.getTime();
                return (
                  <Row key={d.id} href={`/deals/${d.id}`}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: stageColor ?? "var(--line-strong)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.title}</div>
                      <div className="truncate text-xs text-muted">{companyName ?? "Без клиента"} · {stageName ?? "—"}</div>
                    </div>
                    {expired ? <Badge tone="accent">срок закрытия прошёл</Badge> : <Badge tone="warn">без активности {stale} дн.</Badge>}
                    <div className="w-[104px] shrink-0 text-right text-sm"><Money value={d.amount} compact /></div>
                    {managerName && <Avatar name={managerName} color={managerColor ?? undefined} size={24} />}
                  </Row>
                );
              })}
            </Panel>
          )}

          {seePayments && (
            <Panel i={9} title="Деньги" href="/finance">
              <div className="grid grid-cols-2 divide-x divide-line">
                <div className="min-w-0 px-4 py-3">
                  <div className="text-xs text-muted">Поступления за 7 дней</div>
                  <div className="mt-0.5 truncate text-[20px] font-semibold tracking-[-0.01em] text-good"><Money value={Number(payWeek?.s ?? 0)} /></div>
                  <div className="text-xs text-muted">{plural(payWeek?.n ?? 0, "платёж", "платежа", "платежей")}</div>
                </div>
                <Link href="/documents?type=invoice&status=sent" className="min-w-0 px-4 py-3 transition-colors hover:bg-surface-2">
                  <div className="text-xs text-muted">Неоплаченные счета</div>
                  <div className={`mt-0.5 truncate text-[20px] font-semibold tracking-[-0.01em] ${unpaid?.n ? "text-warn" : ""}`}><Money value={Number(unpaid?.s ?? 0)} /></div>
                  <div className="text-xs text-muted">{plural(unpaid?.n ?? 0, "счёт", "счёта", "счетов")} ждут оплаты</div>
                </Link>
              </div>
              {recentPayments.map(({ p, companyName }) => (
                <Row key={p.id} href={p.dealId ? `/deals/${p.dealId}` : "/finance"}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{companyName ?? "Контрагент"}</div>
                    <div className="truncate text-xs text-muted">{p.purpose ?? "Оплата"}</div>
                  </div>
                  <Badge tone="neutral">{p.method === "sbp" ? "Payme/Click" : p.method === "bank" ? "банк" : p.method === "card" ? "карта" : "наличные"}</Badge>
                  <div className="w-[104px] shrink-0 text-right text-good">+<Money value={p.amount} compact /></div>
                  <div className="w-[80px] text-right text-xs text-muted">{relTime(p.paidAt)}</div>
                </Row>
              ))}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {seeConv && (
            <Panel i={7} title="Входящие" count={inbox.length} href="/inbox" empty="Непрочитанных сообщений нет.">
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
            <Panel i={8} title="Календарь на сегодня" count={bookingsToday.length} href="/calendar" empty="Встреч на сегодня нет.">
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
            <Panel i={9} title="Что сделала система за 24 часа" count={feed.length} href="/automations" hrefLabel="Автоматизации" empty="За последние сутки автоматизации не запускались.">
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
            <div className="rise rounded-[12px] border border-dashed border-line-strong p-5 text-center text-[13px] text-muted" style={{ ["--rise-i" as string]: 7 }}>
              <CheckSquare className="mx-auto mb-2 size-6" />
              Ваша роль видит только задачи{seeDeals ? " и сделки" : ""}. Остальные разделы откроет администратор в настройках ролей.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
