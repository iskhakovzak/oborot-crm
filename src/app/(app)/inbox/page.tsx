import { and, desc, eq, inArray, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Channel } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { InboxView, type ConvItem, type MsgItem } from "@/components/inbox/inbox-view";
import { CHANNEL_LIST } from "@/components/inbox/channel";
import { MessagesSquare } from "lucide-react";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Переписки" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; channel?: string; f?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "view")) return <EmptyState icon={<MessagesSquare />} title="Нет доступа к перепискам" description="Обратитесь к администратору, чтобы открыть раздел для вашей роли." />;
  const sp = await searchParams;
  const channel = CHANNEL_LIST.includes(sp.channel as Channel) ? (sp.channel as Channel) : null;
  const filter = sp.f === "mine" || sp.f === "unanswered" ? sp.f : "all";
  const scope = scopeOf(user.actor, "conversations", "view");

  const rows = await db
    .select({ c: schema.conversations, company: { id: schema.companies.id, name: schema.companies.name }, assignee: { id: schema.users.id, name: schema.users.name, color: schema.users.color } })
    .from(schema.conversations)
    .leftJoin(schema.companies, eq(schema.conversations.companyId, schema.companies.id))
    .leftJoin(schema.users, eq(schema.conversations.assigneeId, schema.users.id))
    .where(scope === "own" ? eq(schema.conversations.assigneeId, user.id) : undefined)
    .orderBy(desc(schema.conversations.lastMessageAt));

  // последнее сообщение каждой переписки
  const ids = rows.map((r) => r.c.id);
  const lastMsgs = ids.length ? await db.select().from(schema.messages).where(inArray(schema.messages.conversationId, ids)).orderBy(desc(schema.messages.createdAt)) : [];
  const lastBy = new Map<string, (typeof lastMsgs)[number]>();
  for (const m of lastMsgs) if (!lastBy.has(m.conversationId)) lastBy.set(m.conversationId, m);

  const all: ConvItem[] = rows.map((r) => {
    const last = lastBy.get(r.c.id);
    return {
      id: r.c.id, channel: r.c.channel, peerName: r.c.peerName, peerAddress: r.c.peerAddress, status: r.c.status, aiEnabled: r.c.aiEnabled, unread: r.c.unread, lastMessageAt: r.c.lastMessageAt, lastRel: relTime(r.c.lastMessageAt),
      companyId: r.company?.id ?? null, companyName: r.company?.name ?? null, dealId: r.c.dealId, assigneeId: r.assignee?.id ?? null, assigneeName: r.assignee?.name ?? null,
      lastText: last?.text ?? "", lastDirection: last?.direction ?? null, lastIsAi: last?.isAi ?? false,
    };
  });
  const selectedId = sp.c && all.some((c) => c.id === sp.c) ? sp.c : null;
  if (selectedId) {
    // открыли переписку — снимаем непрочитанные
    const cur = all.find((c) => c.id === selectedId)!;
    if (cur.unread > 0) {
      await db.update(schema.conversations).set({ unread: 0 }).where(and(eq(schema.conversations.id, selectedId)));
      cur.unread = 0;
    }
  }
  const list = all.filter((c) => (!channel || c.channel === channel) && (filter === "all" || (filter === "mine" ? c.assigneeId === user.id : c.lastDirection === "in" && c.status === "open")));
  const counts = { all: all.length, mine: all.filter((c) => c.assigneeId === user.id).length, unanswered: all.filter((c) => c.lastDirection === "in" && c.status === "open").length };
  const byChannel = Object.fromEntries(CHANNEL_LIST.map((ch) => [ch, all.filter((c) => c.channel === ch).length])) as Record<Channel, number>;

  let messages: MsgItem[] = [];
  let selected: ConvItem | null = null;
  let dealTitle: string | null = null;
  if (selectedId) {
    selected = all.find((c) => c.id === selectedId)!;
    const ms = await db.select({ m: schema.messages, author: { name: schema.users.name } }).from(schema.messages).leftJoin(schema.users, eq(schema.messages.authorUserId, schema.users.id)).where(eq(schema.messages.conversationId, selectedId)).orderBy(asc(schema.messages.createdAt));
    messages = ms.map(({ m, author }) => ({ id: m.id, direction: m.direction, text: m.text, attachments: m.attachments ?? [], isAi: m.isAi, isAutomation: m.isAutomation, status: m.status, createdAt: m.createdAt, authorName: author?.name ?? null }));
    if (selected.dealId) dealTitle = (await db.query.deals.findFirst({ where: eq(schema.deals.id, selected.dealId) }))?.title ?? null;
  }

  const users = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name));
  const contacts = (await db.select({ id: schema.contacts.id, name: schema.contacts.name, company: schema.companies.name, telegram: schema.contacts.telegram, whatsapp: schema.contacts.whatsapp, instagram: schema.contacts.instagram, max: schema.contacts.max, email: schema.contacts.email, phone: schema.contacts.phone }).from(schema.contacts).leftJoin(schema.companies, eq(schema.contacts.companyId, schema.companies.id)).orderBy(asc(schema.contacts.name))).map((c) => ({
    id: c.id, name: c.name, company: c.company,
    channels: (["telegram", "whatsapp", "instagram", "max", "email", "sms"] as Channel[]).filter((ch) => (ch === "telegram" ? c.telegram : ch === "whatsapp" ? c.whatsapp ?? c.phone : ch === "instagram" ? c.instagram : ch === "max" ? c.max : ch === "email" ? c.email : c.phone)),
  }));

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col">
      <PageHeader eyebrow="Работа" title="Переписки" description="Telegram, WhatsApp, MAX, Instagram, почта и SMS в одном окне." className="mb-4" />
      <InboxView
        conversations={list}
        counts={counts}
        byChannel={byChannel}
        channel={channel}
        filter={filter}
        selected={selected}
        messages={messages}
        dealTitle={dealTitle}
        users={users}
        contacts={contacts}
        currentUserId={user.id}
        canEdit={can(user.actor, "conversations", "edit")}
        canCreateDeal={can(user.actor, "deals", "create")}
      />
    </div>
  );
}
