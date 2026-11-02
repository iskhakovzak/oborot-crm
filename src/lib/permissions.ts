import type { EntityPermission, PermissionMap, PermScope } from "@/db/schema";

export const ENTITIES = [
  { key: "companies", label: "Клиенты", fields: ["name", "inn", "phone", "email", "balance", "managerId", "bankName", "account", "notes"] },
  { key: "contacts", label: "Контакты", fields: ["name", "phone", "email", "telegram", "whatsapp"] },
  { key: "deals", label: "Сделки", fields: ["title", "amount", "stageId", "managerId", "source", "lostReason", "nextStep"] },
  { key: "products", label: "Товары", fields: ["name", "price", "cost", "stock", "sku"] },
  { key: "documents", label: "Документы", fields: ["number", "amount", "status", "edoStatus"] },
  { key: "payments", label: "Платежи", fields: ["amount", "method", "purpose"] },
  { key: "tasks", label: "Задачи", fields: ["title", "assigneeId", "dueAt", "priority"] },
  { key: "conversations", label: "Переписки", fields: ["assigneeId", "aiEnabled"] },
  { key: "calls", label: "Звонки", fields: ["recordingUrl", "transcript"] },
  { key: "bookings", label: "Календарь", fields: ["clientPhone", "clientEmail"] },
  { key: "production", label: "Производство", fields: ["assigneeId", "defects"] },
  { key: "campaigns", label: "Рассылки", fields: ["body", "segment"] },
  { key: "analytics", label: "Аналитика", fields: ["marketing", "sales", "production", "finance"] },
  { key: "automations", label: "Автоматизации", fields: ["actions"] },
  { key: "integrations", label: "Интеграции", fields: ["config"] },
  { key: "settings", label: "Настройки и роли", fields: ["roles", "users", "company"] },
] as const;

export type EntityKey = (typeof ENTITIES)[number]["key"];

export const SCOPE_LABEL: Record<PermScope, string> = { all: "Все", team: "Команда", own: "Свои", none: "Нет" };

export function fullAccess(): EntityPermission {
  return { view: "all", create: true, edit: "all", delete: "all", hiddenFields: [], readonlyFields: [] };
}
export function noAccess(): EntityPermission {
  return { view: "none", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
}

export function adminPermissions(): PermissionMap {
  return Object.fromEntries(ENTITIES.map((e) => [e.key, fullAccess()]));
}

export function managerPermissions(): PermissionMap {
  const p = adminPermissions();
  p.companies = { view: "all", create: true, edit: "own", delete: "none", hiddenFields: ["bankName", "account"], readonlyFields: ["balance"] };
  p.deals = { view: "team", create: true, edit: "own", delete: "none", hiddenFields: [], readonlyFields: [] };
  p.products = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: ["cost"], readonlyFields: [] };
  p.payments = { view: "own", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
  p.analytics = { view: "own", create: false, edit: "none", delete: "none", hiddenFields: ["finance", "marketing"], readonlyFields: [] };
  p.automations = noAccess();
  p.integrations = noAccess();
  p.settings = noAccess();
  p.campaigns = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
  p.production = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
  return p;
}

export function productionPermissions(): PermissionMap {
  const p = Object.fromEntries(ENTITIES.map((e) => [e.key, noAccess()])) as PermissionMap;
  p.production = fullAccess();
  p.deals = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: ["amount", "source"], readonlyFields: [] };
  p.companies = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: ["balance", "bankName", "account", "inn"], readonlyFields: [] };
  p.tasks = { view: "own", create: true, edit: "own", delete: "own", hiddenFields: [], readonlyFields: [] };
  p.bookings = { view: "own", create: true, edit: "own", delete: "own", hiddenFields: [], readonlyFields: [] };
  p.analytics = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: ["finance", "marketing", "sales"], readonlyFields: [] };
  return p;
}

export function accountantPermissions(): PermissionMap {
  const p = Object.fromEntries(ENTITIES.map((e) => [e.key, noAccess()])) as PermissionMap;
  p.companies = { view: "all", create: false, edit: "all", delete: "none", hiddenFields: [], readonlyFields: ["managerId"] };
  p.documents = fullAccess();
  p.payments = fullAccess();
  p.deals = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
  p.analytics = { view: "all", create: false, edit: "none", delete: "none", hiddenFields: ["marketing", "production"], readonlyFields: [] };
  p.integrations = { view: "all", create: false, edit: "all", delete: "none", hiddenFields: [], readonlyFields: [] };
  return p;
}

export type Actor = { id: string; teamId: string | null; permissions: PermissionMap; isAdmin: boolean };

export function can(actor: Actor, entity: EntityKey, action: "view" | "create" | "edit" | "delete"): boolean {
  if (actor.isAdmin) return true;
  const p = actor.permissions[entity];
  if (!p) return false;
  if (action === "create") return !!p.create;
  return p[action] !== "none";
}

export function scopeOf(actor: Actor, entity: EntityKey, action: "view" | "edit" | "delete"): PermScope {
  if (actor.isAdmin) return "all";
  return actor.permissions[entity]?.[action] ?? "none";
}

/** Проверка доступа к конкретной записи по владельцу/команде */
export function canRecord(actor: Actor, entity: EntityKey, action: "view" | "edit" | "delete", rec: { ownerId?: string | null; ownerTeamId?: string | null }): boolean {
  const s = scopeOf(actor, entity, action);
  if (s === "all") return true;
  if (s === "none") return false;
  if (s === "own") return rec.ownerId === actor.id;
  if (s === "team") return rec.ownerId === actor.id || (!!actor.teamId && rec.ownerTeamId === actor.teamId);
  return false;
}

export function hiddenFields(actor: Actor, entity: EntityKey): string[] {
  if (actor.isAdmin) return [];
  return actor.permissions[entity]?.hiddenFields ?? [];
}
export function readonlyFields(actor: Actor, entity: EntityKey): string[] {
  if (actor.isAdmin) return [];
  return actor.permissions[entity]?.readonlyFields ?? [];
}

/** Убирает скрытые поля из объекта перед отдачей на клиент */
export function maskFields<T extends Record<string, unknown>>(actor: Actor, entity: EntityKey, rec: T): T {
  const hidden = hiddenFields(actor, entity);
  if (!hidden.length) return rec;
  const out = { ...rec };
  for (const f of hidden) if (f in out) (out as Record<string, unknown>)[f] = null;
  return out;
}
