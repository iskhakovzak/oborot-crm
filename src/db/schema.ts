import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const id = () => text("id").primaryKey();
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

// ───────────────────────────── Пользователи и права ─────────────────────────────

export type PermScope = "all" | "team" | "own" | "none";
export type EntityPermission = {
  view: PermScope;
  create: boolean;
  edit: PermScope;
  delete: PermScope;
  hiddenFields: string[];
  readonlyFields: string[];
};
export type PermissionMap = Record<string, EntityPermission>;

export const roles = sqliteTable("roles", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  permissions: json<PermissionMap>("permissions").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  roleId: text("role_id").notNull().references(() => roles.id),
  teamId: text("team_id"),
  color: text("color").notNull().default("#2456D6"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  acceptsLeads: integer("accepts_leads", { mode: "boolean" }).notNull().default(true),
  leadWeight: integer("lead_weight").notNull().default(1),
  skills: json<string[]>("skills").default([]),
  telegramChatId: text("telegram_chat_id"),
  workStart: text("work_start").notNull().default("09:00"),
  workEnd: text("work_end").notNull().default("18:00"),
  workDays: json<number[]>("work_days").default([1, 2, 3, 4, 5]),
  createdAt: text("created_at").notNull().default(now()),
});

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Клиенты ─────────────────────────────

export type Utm = { source?: string; medium?: string; campaign?: string; content?: string; term?: string };

export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    inn: text("inn"),
    kpp: text("kpp"),
    ogrn: text("ogrn"),
    okved: text("okved"),
    legalAddress: text("legal_address"),
    address: text("address"),
    director: text("director"),
    directorPosition: text("director_position"),
    bankName: text("bank_name"),
    bik: text("bik"),
    account: text("account"),
    corrAccount: text("corr_account"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    industry: text("industry"),
    status: text("status").$type<"lead" | "client" | "partner" | "archived">().notNull().default("lead"),
    source: text("source"),
    utm: json<Utm>("utm"),
    managerId: text("manager_id").references(() => users.id),
    balance: real("balance").notNull().default(0),
    tags: json<string[]>("tags").default([]),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => [index("companies_inn").on(t.inn), index("companies_manager").on(t.managerId)],
);

export const contacts = sqliteTable("contacts", {
  id: id(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  telegram: text("telegram"),
  whatsapp: text("whatsapp"),
  vk: text("vk"),
  max: text("max"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  birthday: text("birthday"),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Воронки и сделки ─────────────────────────────

export const pipelines = sqliteTable("pipelines", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").$type<"sales" | "shipping" | "service" | "production">().notNull(),
  order: integer("order").notNull().default(0),
  handoffPipelineId: text("handoff_pipeline_id"),
});

export const stages = sqliteTable("stages", {
  id: id(),
  pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#2456D6"),
  probability: integer("probability").notNull().default(50),
  kind: text("kind").$type<"open" | "won" | "lost">().notNull().default("open"),
});

export const deals = sqliteTable(
  "deals",
  {
    id: id(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    companyId: text("company_id").references(() => companies.id),
    contactId: text("contact_id").references(() => contacts.id),
    pipelineId: text("pipeline_id").notNull().references(() => pipelines.id),
    stageId: text("stage_id").notNull().references(() => stages.id),
    amount: real("amount").notNull().default(0),
    managerId: text("manager_id").references(() => users.id),
    status: text("status").$type<"open" | "won" | "lost">().notNull().default("open"),
    lostReason: text("lost_reason"),
    source: text("source"),
    utm: json<Utm>("utm"),
    ymClientId: text("ym_client_id"),
    nextStep: text("next_step"),
    expectedCloseAt: text("expected_close_at"),
    closedAt: text("closed_at"),
    parentDealId: text("parent_deal_id"),
    stageEnteredAt: text("stage_entered_at").notNull().default(now()),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => [index("deals_stage").on(t.stageId), index("deals_company").on(t.companyId), index("deals_manager").on(t.managerId)],
);

export const products = sqliteTable("products", {
  id: id(),
  sku: text("sku"),
  barcode: text("barcode"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  brand: text("brand"),
  unit: text("unit").notNull().default("шт"),
  price: real("price").notNull().default(0),
  cost: real("cost").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(20),
  stock: real("stock").notNull().default(0),
  weightKg: real("weight_kg"),
  imageUrl: text("image_url"),
  attributes: json<Record<string, string>>("attributes").default({}),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now()),
});

export const dealItems = sqliteTable("deal_items", {
  id: id(),
  dealId: text("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("шт"),
  qty: real("qty").notNull().default(1),
  price: real("price").notNull().default(0),
  discount: real("discount").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(20),
});

// ───────────────────────────── Документы и деньги ─────────────────────────────

export type DocumentType = "invoice" | "contract" | "upd" | "act" | "kp" | "report";

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    type: text("type").$type<DocumentType>().notNull(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    dealId: text("deal_id").references(() => deals.id),
    companyId: text("company_id").references(() => companies.id),
    amount: real("amount").notNull().default(0),
    status: text("status").$type<"draft" | "sent" | "signed" | "paid" | "cancelled">().notNull().default("draft"),
    filePath: text("file_path"),
    payload: json<Record<string, unknown>>("payload"),
    edoProvider: text("edo_provider"),
    edoId: text("edo_id"),
    edoStatus: text("edo_status").$type<"none" | "queued" | "sent" | "delivered" | "signed" | "rejected">().notNull().default("none"),
    sentAt: text("sent_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("documents_deal").on(t.dealId), index("documents_company").on(t.companyId)],
);

export const paymentLinks = sqliteTable("payment_links", {
  id: id(),
  dealId: text("deal_id").references(() => deals.id),
  documentId: text("document_id").references(() => documents.id),
  companyId: text("company_id").references(() => companies.id),
  amount: real("amount").notNull(),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull().default("sbp"),
  url: text("url").notNull(),
  qrPayload: text("qr_payload").notNull(),
  status: text("status").$type<"active" | "paid" | "expired" | "cancelled">().notNull().default("active"),
  externalId: text("external_id"),
  expiresAt: text("expires_at"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(now()),
});

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    companyId: text("company_id").references(() => companies.id),
    dealId: text("deal_id").references(() => deals.id),
    documentId: text("document_id").references(() => documents.id),
    paymentLinkId: text("payment_link_id").references(() => paymentLinks.id),
    amount: real("amount").notNull(),
    direction: text("direction").$type<"in" | "out">().notNull().default("in"),
    method: text("method").$type<"sbp" | "bank" | "cash" | "card">().notNull().default("bank"),
    purpose: text("purpose"),
    externalId: text("external_id"),
    syncedToFinance: integer("synced_to_finance", { mode: "boolean" }).notNull().default(false),
    paidAt: text("paid_at").notNull().default(now()),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("payments_company").on(t.companyId), index("payments_deal").on(t.dealId)],
);

export const bankTransactions = sqliteTable("bank_transactions", {
  id: id(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  date: text("date").notNull(),
  amount: real("amount").notNull(),
  direction: text("direction").$type<"in" | "out">().notNull(),
  counterpartyName: text("counterparty_name"),
  counterpartyInn: text("counterparty_inn"),
  purpose: text("purpose"),
  matchedCompanyId: text("matched_company_id").references(() => companies.id),
  matchedPaymentId: text("matched_payment_id").references(() => payments.id),
  matchedDocumentId: text("matched_document_id").references(() => documents.id),
  createdAt: text("created_at").notNull().default(now()),
});

export const financeSyncLog = sqliteTable("finance_sync_log", {
  id: id(),
  provider: text("provider").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  direction: text("direction").$type<"push" | "pull">().notNull(),
  status: text("status").$type<"ok" | "error">().notNull(),
  message: text("message"),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Задачи и активности ─────────────────────────────

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: text("assignee_id").references(() => users.id),
    creatorId: text("creator_id").references(() => users.id),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    dueAt: text("due_at"),
    priority: text("priority").$type<"low" | "normal" | "high">().notNull().default("normal"),
    status: text("status").$type<"open" | "done" | "cancelled">().notNull().default("open"),
    source: text("source").$type<"manual" | "automation" | "telegram" | "ai">().notNull().default("manual"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("tasks_assignee").on(t.assigneeId), index("tasks_deal").on(t.dealId)],
);

export type ActivityType = "note" | "call" | "email" | "message" | "stage" | "document" | "payment" | "system" | "task" | "ai";

export const activities = sqliteTable(
  "activities",
  {
    id: id(),
    type: text("type").$type<ActivityType>().notNull(),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id),
    title: text("title").notNull(),
    body: text("body"),
    meta: json<Record<string, unknown>>("meta"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("activities_deal").on(t.dealId), index("activities_company").on(t.companyId)],
);

// ───────────────────────────── Омниканальные переписки ─────────────────────────────

export type Channel = "telegram" | "whatsapp" | "vk" | "max" | "email" | "sms" | "web";

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    channel: text("channel").$type<Channel>().notNull(),
    externalId: text("external_id"),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    assigneeId: text("assignee_id").references(() => users.id),
    peerName: text("peer_name").notNull(),
    peerAddress: text("peer_address").notNull(),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(false),
    unread: integer("unread").notNull().default(0),
    lastMessageAt: text("last_message_at").notNull().default(now()),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("conversations_last").on(t.lastMessageAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    text: text("text").notNull(),
    attachments: json<{ name: string; url: string }[]>("attachments").default([]),
    authorUserId: text("author_user_id").references(() => users.id),
    isAi: integer("is_ai", { mode: "boolean" }).notNull().default(false),
    isAutomation: integer("is_automation", { mode: "boolean" }).notNull().default(false),
    externalId: text("external_id"),
    status: text("status").$type<"queued" | "sent" | "delivered" | "read" | "failed">().notNull().default("sent"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("messages_conversation").on(t.conversationId)],
);

export const calls = sqliteTable(
  "calls",
  {
    id: id(),
    direction: text("direction").$type<"in" | "out">().notNull(),
    phone: text("phone").notNull(),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id),
    provider: text("provider").notNull().default("sandbox"),
    externalId: text("external_id"),
    status: text("status").$type<"queued" | "ringing" | "answered" | "missed" | "busy" | "completed" | "ai_handled">().notNull().default("queued"),
    durationSec: integer("duration_sec").notNull().default(0),
    recordingUrl: text("recording_url"),
    transcript: text("transcript"),
    aiSummary: text("ai_summary"),
    aiHandled: integer("ai_handled", { mode: "boolean" }).notNull().default(false),
    startedAt: text("started_at").notNull().default(now()),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("calls_company").on(t.companyId)],
);

// ───────────────────────────── Календарь и онлайн-запись ─────────────────────────────

export const bookingTypes = sqliteTable("booking_types", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id").notNull().references(() => users.id),
  durationMin: integer("duration_min").notNull().default(30),
  bufferMin: integer("buffer_min").notNull().default(10),
  workDays: json<number[]>("work_days").notNull().default([1, 2, 3, 4, 5]),
  workStart: text("work_start").notNull().default("10:00"),
  workEnd: text("work_end").notNull().default("18:00"),
  horizonDays: integer("horizon_days").notNull().default(14),
  location: text("location").notNull().default("Онлайн, ссылка придёт в подтверждении"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now()),
});

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    bookingTypeId: text("booking_type_id").references(() => bookingTypes.id, { onDelete: "set null" }),
    userId: text("user_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    clientName: text("client_name"),
    clientPhone: text("client_phone"),
    clientEmail: text("client_email"),
    comment: text("comment"),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    source: text("source").$type<"public" | "manual">().notNull().default("manual"),
    status: text("status").$type<"confirmed" | "cancelled" | "done">().notNull().default("confirmed"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("bookings_user_time").on(t.userId, t.startsAt)],
);

// ───────────────────────────── Автоматизации ─────────────────────────────

export type AutomationEvent =
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "lead.created"
  | "invoice.created"
  | "upd.created"
  | "payment.received"
  | "booking.created"
  | "message.received"
  | "call.missed"
  | "task.overdue";

export type AutomationAction =
  | { type: "send_message"; channel: Channel | "preferred"; template: string }
  | { type: "send_sms"; template: string }
  | { type: "send_email"; subject: string; template: string }
  | { type: "call_client"; script?: string }
  | { type: "create_task"; title: string; assignee: "manager" | "creator" | string; dueInHours: number }
  | { type: "send_invoice"; channel: Channel | "preferred" }
  | { type: "send_payment_link"; channel: Channel | "preferred" }
  | { type: "send_to_edo" }
  | { type: "handoff"; pipelineKind: "shipping" | "service" | "production" }
  | { type: "notify_user"; who: "manager" | "owner"; text: string }
  | { type: "metrika_goal"; goal: string }
  | { type: "ai_reply" }
  | { type: "sync_finance" }
  | { type: "move_stage"; stageName: string };

export type AutomationCondition = { field: string; op: "eq" | "neq" | "gt" | "lt" | "contains" | "in"; value: string | number | string[] };

export const automations = sqliteTable("automations", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  event: text("event").$type<AutomationEvent>().notNull(),
  conditions: json<AutomationCondition[]>("conditions").notNull().default([]),
  actions: json<AutomationAction[]>("actions").notNull().default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  runsCount: integer("runs_count").notNull().default(0),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull().default(now()),
});

export const automationRuns = sqliteTable("automation_runs", {
  id: id(),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  entityId: text("entity_id"),
  status: text("status").$type<"ok" | "error" | "skipped">().notNull(),
  log: json<string[]>("log").notNull().default([]),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Интеграции ─────────────────────────────

export type IntegrationKind =
  | "messenger"
  | "telephony"
  | "email"
  | "sms"
  | "bank"
  | "sbp"
  | "edo"
  | "finance"
  | "analytics"
  | "ai"
  | "company_data"
  | "product_data"
  | "telegram_bot";

export const integrations = sqliteTable("integrations", {
  id: id(),
  kind: text("kind").$type<IntegrationKind>().notNull(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  config: json<Record<string, string>>("config").notNull().default({}),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
  status: text("status").$type<"sandbox" | "connected" | "error">().notNull().default("sandbox"),
  lastSyncAt: text("last_sync_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(now()),
});

export const integrationEvents = sqliteTable("integration_events", {
  id: id(),
  integrationId: text("integration_id").references(() => integrations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  direction: text("direction").$type<"in" | "out">().notNull(),
  kind: text("kind").notNull(),
  payload: json<Record<string, unknown>>("payload"),
  status: text("status").$type<"ok" | "error" | "sandbox">().notNull().default("ok"),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Рассылки и маркетинг ─────────────────────────────

export const campaigns = sqliteTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  channel: text("channel").$type<"email" | "telegram" | "whatsapp" | "max" | "vk" | "sms">().notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  segment: json<{ status?: string[]; tags?: string[]; managerIds?: string[]; source?: string[] }>("segment").notNull().default({}),
  status: text("status").$type<"draft" | "scheduled" | "sending" | "sent">().notNull().default("draft"),
  scheduledAt: text("scheduled_at"),
  sentAt: text("sent_at"),
  stats: json<{ total: number; sent: number; delivered: number; opened: number; clicked: number; failed: number }>("stats").notNull().default({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(now()),
});

export const campaignDeliveries = sqliteTable("campaign_deliveries", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  address: text("address").notNull(),
  status: text("status").$type<"queued" | "sent" | "delivered" | "opened" | "clicked" | "failed">().notNull().default("queued"),
  error: text("error"),
  sentAt: text("sent_at"),
  openedAt: text("opened_at"),
  clickedAt: text("clicked_at"),
});

export const marketingCosts = sqliteTable("marketing_costs", {
  id: id(),
  source: text("source").notNull(),
  month: text("month").notNull(),
  amount: real("amount").notNull(),
  leads: integer("leads"),
  clicks: integer("clicks"),
  impressions: integer("impressions"),
});

export const analyticsExports = sqliteTable("analytics_exports", {
  id: id(),
  provider: text("provider").notNull().default("yandex_metrika"),
  dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  clientId: text("client_id"),
  revenue: real("revenue"),
  status: text("status").$type<"queued" | "sent" | "sandbox" | "error">().notNull().default("queued"),
  response: text("response"),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Производство ─────────────────────────────

export const productionOrders = sqliteTable("production_orders", {
  id: id(),
  number: integer("number").notNull(),
  dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  stageId: text("stage_id").references(() => stages.id),
  assigneeId: text("assignee_id").references(() => users.id),
  qty: real("qty").notNull().default(1),
  plannedAt: text("planned_at"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  status: text("status").$type<"queued" | "in_progress" | "done" | "cancelled">().notNull().default("queued"),
  defects: integer("defects").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
});

// ───────────────────────────── Настройки, бот, аудит ─────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const telegramCommands = sqliteTable("telegram_commands", {
  id: id(),
  chatId: text("chat_id").notNull(),
  userId: text("user_id").references(() => users.id),
  text: text("text").notNull(),
  intent: text("intent"),
  result: text("result"),
  status: text("status").$type<"ok" | "error" | "unknown">().notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    userId: text("user_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").$type<"create" | "update" | "delete" | "view">().notNull(),
    diff: json<Record<string, unknown>>("diff"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [index("audit_entity").on(t.entity, t.entityId)],
);

export const counters = sqliteTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});
