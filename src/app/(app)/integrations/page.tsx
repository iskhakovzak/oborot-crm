import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDateTime, relTime } from "@/lib/format";
import { CATALOG, resolve } from "@/lib/integrations/registry";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Tiles, Tile } from "@/components/dashboard/widgets";
import { LinkTabs } from "@/components/tasks/link-tabs";
import { IntegrationCatalog } from "@/components/integrations/catalog";
import { KIND_TITLES, type ProviderCard } from "@/components/integrations/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Интеграции" };

const STATUS: Record<"ok" | "error" | "sandbox", { label: string; tone: Tone }> = { ok: { label: "ок", tone: "good" }, error: { label: "ошибка", tone: "accent" }, sandbox: { label: "демо", tone: "warn" } };
const PROVIDER_NAME = new Map(CATALOG.map((c) => [c.provider, c.name]));

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.actor, "integrations", "view")) {
    return (
      <>
        <PageHeader title="Интеграции" />
        <EmptyState title="Нет доступа" description="Раздел доступен администратору и бухгалтеру. Попросите открыть «Интеграции» для вашей роли." />
      </>
    );
  }
  const tab = sp.tab === "log" ? "log" : "catalog";
  const rows = await db.select().from(schema.integrations);
  const cards: ProviderCard[] = await Promise.all(
    CATALOG.map(async (c) => {
      const row = rows.find((r) => r.kind === c.kind && r.provider === c.provider);
      const r = await resolve(c.kind, c.provider);
      const cfg = row?.config ?? {};
      return {
        kind: c.kind,
        provider: c.provider,
        name: c.name,
        description: c.description,
        fields: c.fields,
        isEnabled: row?.isEnabled ?? false,
        live: (row?.isEnabled ?? false) && r.live,
        config: Object.fromEntries(c.fields.filter((f) => !f.secret).map((f) => [f.key, cfg[f.key] ?? ""])),
        filled: c.fields.filter((f) => !!(cfg[f.key] ?? r.config[f.key])).map((f) => f.key),
        lastSyncLabel: row?.lastSyncAt ? relTime(row.lastSyncAt) : null,
        lastError: row?.lastError ?? null,
      };
    }),
  );
  const connected = cards.filter((c) => c.isEnabled && c.live).length;
  const demo = cards.filter((c) => c.isEnabled && !c.live).length;
  const off = cards.length - connected - demo;
  const events = tab === "log" ? await db.select().from(schema.integrationEvents).orderBy(desc(schema.integrationEvents.createdAt)).limit(200) : [];
  const canEdit = can(user.actor, "integrations", "edit");

  return (
    <>
      <PageHeader title="Интеграции" description="Мессенджеры, телефония, банк, ЭДО, финучёт, аналитика и ИИ подключаются ключами. Без ключей всё работает в демо-режиме — действия логируются, ничего не уходит наружу." />
      <Tiles cols={4}>
        <Tile label="Подключено" value={connected} tone={connected ? "good" : undefined} sub="ключи заданы, обмен реальный" />
        <Tile label="В демо-режиме" value={demo} tone="warn" sub="включено без ключей" />
        <Tile label="Выключено" value={off} sub="не участвуют в автоматизациях" />
        <Tile label="Провайдеров в каталоге" value={cards.length} sub={`${Object.keys(KIND_TITLES).length - 1} направлений`} />
      </Tiles>
      <LinkTabs className="mb-4" active={tab} items={[{ key: "catalog", label: "Каталог", href: "/integrations" }, { key: "log", label: "Журнал", href: "/integrations?tab=log" }]} />

      {tab === "catalog" ? (
        <IntegrationCatalog cards={cards} canEdit={canEdit} />
      ) : (
        <Section title="Журнал обмена" description="Последние 200 событий: отправки, приём, проверки. Payload раскрывается по клику." className="[&>div:last-child]:p-0">
          {events.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">Событий пока нет. Нажмите «Проверить» у любой интеграции.</p>
          ) : (
            <Table className="rounded-none border-0">
              <thead>
                <tr>
                  <th className="w-[150px]">Время</th>
                  <th className="w-[200px]">Провайдер</th>
                  <th className="w-[90px]">Направление</th>
                  <th className="w-[180px]">Тип</th>
                  <th className="w-[90px]">Статус</th>
                  <th>Данные</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="text-muted tnum" title={e.createdAt}>{fmtDateTime(e.createdAt)}</td>
                    <td>{PROVIDER_NAME.get(e.provider) ?? e.provider}</td>
                    <td><Badge tone={e.direction === "in" ? "violet" : "neutral"}>{e.direction === "in" ? "входящее" : "исходящее"}</Badge></td>
                    <td className="font-mono text-xs">{e.kind}</td>
                    <td><Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge></td>
                    <td>
                      {e.payload ? (
                        <details className="group">
                          <summary className="cursor-pointer select-none text-xs text-muted hover:text-ink">{summarize(e.payload)}</summary>
                          <pre className="mt-2 max-h-64 overflow-auto rounded-[8px] bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(e.payload, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}
    </>
  );
}

function summarize(p: Record<string, unknown>) {
  const s = Object.entries(p)
    .filter(([, v]) => v != null && typeof v !== "object")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(" · ");
  return s || `${Object.keys(p).length} полей`;
}
