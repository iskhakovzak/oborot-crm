import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, ne, and, inArray } from "drizzle-orm";
import { Landmark, QrCode, Wallet, ArrowLeftRight } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolve } from "@/lib/integrations/registry";
import { fmtMoney, fmtDate, fmtDateTime, relTime, plural } from "@/lib/format";
import { PageHeader, Stat, EmptyState, Section } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { LinkTabs } from "@/components/documents/link-tabs";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHOD_TONE } from "@/components/documents/labels";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { LoadStatementButton, LinkTransactionDialog } from "@/components/finance/bank-panel";
import { CreatePaymentLinkDialog, PaymentLinkActions } from "@/components/finance/sbp-panel";
import { SyncFinanceButton } from "@/components/finance/sync-button";
import type { FinanceOptions } from "@/components/finance/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Финансы" };

const TABS = [
  { key: "payments", label: "Оплаты" }, { key: "bank", label: "Банк" }, { key: "sbp", label: "Ссылки на оплату" }, { key: "finance", label: "Финучёт" }, { key: "balances", label: "Балансы" },
];
const LINK_STATUS: Record<string, { label: string; tone: "good" | "info" | "neutral" | "accent" }> = { active: { label: "Активна", tone: "info" }, paid: { label: "Оплачена", tone: "good" }, expired: { label: "Истекла", tone: "neutral" }, cancelled: { label: "Отменена", tone: "accent" } };

function IntegrationStatus({ r, lastSyncAt }: { r: { name: string; live: boolean }; lastSyncAt: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-medium">{r.name}</span>
      <Badge tone={r.live ? "good" : "warn"} dot>{r.live ? "Подключено" : "Демо-режим"}</Badge>
      <span className="text-muted">Последняя синхронизация: {lastSyncAt ? <span title={fmtDateTime(lastSyncAt)}>{relTime(lastSyncAt)}</span> : "ещё не было"}</span>
      {!r.live && <Link href="/integrations" className="text-info hover:underline">Подключить</Link>}
    </span>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "payments", "view")) redirect("/");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "payments";
  const canCreate = can(user.actor, "payments", "create");
  const canEdit = can(user.actor, "payments", "edit");

  const [payments, companies, bankRow, financeRow, sbpRow, bank, finance, sbp] = await Promise.all([
    db.select({ p: schema.payments, companyName: schema.companies.name, dealNumber: schema.deals.number, docNumber: schema.documents.number })
      .from(schema.payments).leftJoin(schema.companies, eq(schema.payments.companyId, schema.companies.id)).leftJoin(schema.deals, eq(schema.payments.dealId, schema.deals.id)).leftJoin(schema.documents, eq(schema.payments.documentId, schema.documents.id))
      .orderBy(desc(schema.payments.paidAt)),
    db.select({ id: schema.companies.id, name: schema.companies.name, balance: schema.companies.balance, managerName: schema.users.name }).from(schema.companies).leftJoin(schema.users, eq(schema.companies.managerId, schema.users.id)).where(ne(schema.companies.status, "archived")).orderBy(schema.companies.name),
    db.query.integrations.findFirst({ where: eq(schema.integrations.kind, "bank"), orderBy: desc(schema.integrations.lastSyncAt) }),
    db.query.integrations.findFirst({ where: eq(schema.integrations.kind, "finance"), orderBy: desc(schema.integrations.lastSyncAt) }),
    db.query.integrations.findFirst({ where: eq(schema.integrations.kind, "sbp") }),
    resolve("bank"), resolve("finance"), resolve("sbp"),
  ]);
  const sentInvoices = await db.select({ amount: schema.documents.amount }).from(schema.documents).where(and(eq(schema.documents.type, "invoice"), eq(schema.documents.status, "sent")));

  const now = Date.now();
  const monthAgo = new Date(now - 30 * 86400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86400_000).toISOString();
  const incoming = payments.filter((x) => x.p.direction === "in");
  const monthIn = incoming.filter((x) => x.p.paidAt >= monthAgo).reduce((s, x) => s + x.p.amount, 0);
  const weekIn = incoming.filter((x) => x.p.paidAt >= weekAgo).reduce((s, x) => s + x.p.amount, 0);
  const receivable = sentInvoices.reduce((s, d) => s + d.amount, 0);
  const prepaid = companies.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const unsynced = payments.filter((x) => !x.p.syncedToFinance).length;

  const options: FinanceOptions = canCreate
    ? {
        companies: companies.map((c) => ({ id: c.id, name: c.name })),
        deals: (await db.select({ id: schema.deals.id, number: schema.deals.number, title: schema.deals.title, companyId: schema.deals.companyId, amount: schema.deals.amount }).from(schema.deals).where(inArray(schema.deals.status, ["open", "won"])).orderBy(desc(schema.deals.number))),
        invoices: (await db.select({ id: schema.documents.id, number: schema.documents.number, companyId: schema.documents.companyId, dealId: schema.documents.dealId, amount: schema.documents.amount, status: schema.documents.status }).from(schema.documents).where(eq(schema.documents.type, "invoice")).orderBy(desc(schema.documents.createdAt))),
      }
    : { companies: [], deals: [], invoices: [] };

  return (
    <>
      <PageHeader title="Финансы" description="Оплаты, выписка банка, ссылки Payme/Click и синхронизация с финучётом." actions={canCreate ? <PaymentDialog options={options} /> : undefined} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Поступления за 30 дней" value={<Money value={monthIn} compact />} tone="good" sub={plural(incoming.filter((x) => x.p.paidAt >= monthAgo).length, "платёж", "платежа", "платежей")} />
        <Stat label="За 7 дней" value={<Money value={weekIn} compact />} sub={plural(incoming.filter((x) => x.p.paidAt >= weekAgo).length, "платёж", "платежа", "платежей")} />
        <Stat label="Дебиторка" value={<Money value={receivable} compact />} tone={receivable > 0 ? "warn" : undefined} sub={plural(sentInvoices.length, "выставленный счёт", "выставленных счёта", "выставленных счетов")} />
        <Stat label="Предоплаты клиентов" value={<Money value={prepaid} compact />} tone="info" sub={plural(companies.filter((c) => c.balance > 0).length, "клиент", "клиента", "клиентов")} />
      </div>
      <div className="mb-4">
        <LinkTabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/finance?tab=${t.key}` }))} />
      </div>

      {tab === "payments" && (
        payments.length === 0 ? <EmptyState icon={<Wallet />} title="Оплат пока нет" description="Проведите первую оплату или загрузите выписку банка." /> : (
          <Table>
            <thead><tr><th>Дата</th><th>Клиент</th><th>Сделка</th><th>Документ</th><th className="text-right">Сумма</th><th>Способ</th><th>Назначение</th><th className="text-center">В финучёте</th></tr></thead>
            <tbody>
              {payments.map(({ p, companyName, dealNumber, docNumber }) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-muted">{fmtDate(p.paidAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="max-w-[240px] truncate">{p.companyId ? <Link href={`/companies/${p.companyId}`} className="hover:underline">{companyName}</Link> : "—"}</td>
                  <td>{p.dealId ? <Link href={`/deals/${p.dealId}`} className="hover:underline">№{dealNumber}</Link> : <span className="text-muted">—</span>}</td>
                  <td>{p.documentId ? <Link href={`/documents/${p.documentId}`} className="hover:underline">{docNumber}</Link> : <span className="text-muted">—</span>}</td>
                  <td className={`text-right tnum font-medium whitespace-nowrap ${p.direction === "in" ? "text-good" : "text-accent"}`}>{p.direction === "in" ? "+" : "−"}{fmtMoney(p.amount)}</td>
                  <td><Badge tone={PAYMENT_METHOD_TONE[p.method]}>{PAYMENT_METHOD_LABEL[p.method]}</Badge></td>
                  <td className="max-w-[320px] truncate text-ink-2" title={p.purpose ?? ""}>{p.purpose ?? "—"}</td>
                  <td className="text-center">{p.syncedToFinance ? <span className="text-good" title="Передано в финучёт">✓</span> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}

      {tab === "bank" && <BankTab options={options} canCreate={canCreate} status={<IntegrationStatus r={bank} lastSyncAt={bankRow?.lastSyncAt ?? null} />} />}

      {tab === "sbp" && <SbpTab options={options} canCreate={canCreate} canEdit={canEdit} status={<IntegrationStatus r={sbp} lastSyncAt={sbpRow?.lastSyncAt ?? null} />} />}

      {tab === "finance" && <FinanceTab canEdit={canEdit} unsynced={unsynced} status={<IntegrationStatus r={finance} lastSyncAt={financeRow?.lastSyncAt ?? null} />} />}

      {tab === "balances" && (() => {
        const list = companies.filter((c) => Math.abs(c.balance) >= 0.01).sort((a, b) => b.balance - a.balance);
        const debt = list.filter((c) => c.balance < 0).reduce((s, c) => s + c.balance, 0);
        return list.length === 0 ? <EmptyState icon={<ArrowLeftRight />} title="Все балансы нулевые" description="Предоплаты и долги клиентов появятся здесь." /> : (
          <Table>
            <thead><tr><th>Клиент</th><th>Менеджер</th><th>Состояние</th><th className="text-right">Баланс</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-[320px] truncate"><Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                  <td className="whitespace-nowrap text-ink-2">{c.managerName ?? "—"}</td>
                  <td><Badge tone={c.balance > 0 ? "good" : "accent"} dot>{c.balance > 0 ? "Предоплата" : "Долг"}</Badge></td>
                  <td className={`text-right tnum font-medium whitespace-nowrap ${c.balance > 0 ? "text-good" : "text-accent"}`}>{fmtMoney(c.balance)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-medium">
                <td colSpan={2}>Итого</td>
                <td className="text-[13px] text-muted">предоплаты / долг</td>
                <td className="text-right tnum whitespace-nowrap"><span className="text-good">{fmtMoney(prepaid)}</span> <span className="text-muted">/</span> <span className="text-accent">{fmtMoney(debt)}</span></td>
              </tr>
            </tbody>
          </Table>
        );
      })()}
    </>
  );
}

async function BankTab({ options, canCreate, status }: { options: FinanceOptions; canCreate: boolean; status: React.ReactNode }) {
  const rows = await db.select({ t: schema.bankTransactions, companyName: schema.companies.name, docNumber: schema.documents.number })
    .from(schema.bankTransactions).leftJoin(schema.companies, eq(schema.bankTransactions.matchedCompanyId, schema.companies.id)).leftJoin(schema.documents, eq(schema.bankTransactions.matchedDocumentId, schema.documents.id))
    .orderBy(desc(schema.bankTransactions.date)).limit(200);
  const unmatched = rows.filter((r) => !r.t.matchedCompanyId).length;
  return (
    <Section title="Выписка по расчётному счёту" description={status} action={<LoadStatementButton canEdit={canCreate} />} className="[&>div:last-child]:p-0">
      {rows.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Landmark />} title="Выписка ещё не загружалась" description="Загрузите выписку — операции сопоставятся со счетами по номеру, ИНН и сумме." /></div>
      ) : (
        <>
          {unmatched > 0 && <div className="border-b border-line px-5 py-2.5 text-[13px] text-warn">{plural(unmatched, "операция", "операции", "операций")} без разноски — привяжите вручную.</div>}
          <div className="overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead><tr><th>Дата</th><th>Контрагент</th><th>Назначение</th><th className="text-right">Сумма</th><th>Сопоставление</th><th></th></tr></thead>
              <tbody>
                {rows.map(({ t, companyName, docNumber }) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(t.date, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="max-w-[240px]"><div className="truncate">{t.counterpartyName ?? "—"}</div>{t.counterpartyInn && <div className="text-xs text-muted tnum">ИНН {t.counterpartyInn}</div>}</td>
                    <td className="max-w-[360px] truncate text-ink-2" title={t.purpose ?? ""}>{t.purpose ?? "—"}</td>
                    <td className={`text-right tnum font-medium whitespace-nowrap ${t.direction === "in" ? "text-good" : "text-accent"}`}>{t.direction === "in" ? "+" : "−"}{fmtMoney(t.amount)}</td>
                    <td>
                      {t.matchedCompanyId ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          <Link href={`/companies/${t.matchedCompanyId}`} className="hover:underline">{companyName}</Link>
                          {t.matchedDocumentId && <><span className="text-muted">·</span><Link href={`/documents/${t.matchedDocumentId}`} className="hover:underline">{docNumber}</Link></>}
                          {t.matchedPaymentId && <Badge tone="good">платёж создан</Badge>}
                        </div>
                      ) : <Badge tone="warn" dot>не разнесено</Badge>}
                    </td>
                    <td className="text-right">{!t.matchedCompanyId && canCreate && <LinkTransactionDialog tx={{ id: t.id, amount: t.amount, direction: t.direction, counterpartyName: t.counterpartyName, counterpartyInn: t.counterpartyInn, purpose: t.purpose }} options={options} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

async function SbpTab({ options, canCreate, canEdit, status }: { options: FinanceOptions; canCreate: boolean; canEdit: boolean; status: React.ReactNode }) {
  const rows = await db.select({ l: schema.paymentLinks, companyName: schema.companies.name, dealNumber: schema.deals.number })
    .from(schema.paymentLinks).leftJoin(schema.companies, eq(schema.paymentLinks.companyId, schema.companies.id)).leftJoin(schema.deals, eq(schema.paymentLinks.dealId, schema.deals.id))
    .orderBy(desc(schema.paymentLinks.createdAt)).limit(200);
  const now = new Date().toISOString();
  return (
    <Section title="Ссылки на оплату через Payme/Click" description={status} action={canCreate ? <CreatePaymentLinkDialog options={options} /> : undefined} className="[&>div:last-child]:p-0">
      {rows.length === 0 ? (
        <div className="p-5"><EmptyState icon={<QrCode />} title="Ссылок пока нет" description="Создайте ссылку — клиент оплатит по QR или ссылке в Payme либо Click." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base w-full text-sm">
            <thead><tr><th>Дата</th><th>Клиент</th><th>Сделка</th><th>Назначение</th><th className="text-right">Сумма</th><th>Статус</th><th>Срок</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ l, companyName, dealNumber }) => {
                const st = l.status === "active" && l.expiresAt && l.expiresAt < now ? "expired" : l.status;
                return (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(l.createdAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="max-w-[220px] truncate">{l.companyId ? <Link href={`/companies/${l.companyId}`} className="hover:underline">{companyName}</Link> : "—"}</td>
                    <td>{l.dealId ? <Link href={`/deals/${l.dealId}`} className="hover:underline">№{dealNumber}</Link> : <span className="text-muted">—</span>}</td>
                    <td className="max-w-[260px] truncate text-ink-2" title={l.purpose}>{l.purpose}</td>
                    <td className="text-right tnum font-medium whitespace-nowrap">{fmtMoney(l.amount)}</td>
                    <td><Badge tone={LINK_STATUS[st]?.tone ?? "neutral"} dot>{LINK_STATUS[st]?.label ?? st}</Badge></td>
                    <td className="whitespace-nowrap text-muted">{st === "paid" ? `оплачено ${fmtDateTime(l.paidAt)}` : l.expiresAt ? `до ${fmtDateTime(l.expiresAt)}` : "—"}</td>
                    <td><PaymentLinkActions link={{ id: l.id, url: l.url, status: st }} canEdit={canEdit} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

async function FinanceTab({ canEdit, unsynced, status }: { canEdit: boolean; unsynced: number; status: React.ReactNode }) {
  const log = await db.query.financeSyncLog.findMany({ orderBy: desc(schema.financeSyncLog.createdAt), limit: 100 });
  const ENTITY: Record<string, string> = { payment: "Оплата", document: "Документ", company: "Контрагент" };
  return (
    <div className="space-y-5">
      <Section title="Синхронизация с финучётом" description={status} action={<SyncFinanceButton canEdit={canEdit} unsynced={unsynced} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Не синхронизировано оплат" value={unsynced} tone={unsynced ? "warn" : "good"} sub={unsynced ? "будут переданы при следующей синхронизации" : "всё передано"} />
          <Stat label="Записей в журнале" value={log.length} />
          <Stat label="Ошибок" value={log.filter((l) => l.status === "error").length} tone={log.some((l) => l.status === "error") ? "accent" : undefined} />
        </div>
      </Section>
      <Section title="Журнал обмена" className="[&>div:last-child]:p-0">
        {log.length === 0 ? <div className="p-5"><EmptyState title="Журнал пуст" description="Запустите синхронизацию — каждая передача появится здесь." /></div> : (
          <div className="overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead><tr><th>Когда</th><th>Провайдер</th><th>Объект</th><th>Направление</th><th>Статус</th><th>Сообщение</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(l.createdAt)}</td>
                    <td>{l.provider}</td>
                    <td>{ENTITY[l.entity] ?? l.entity} <span className="text-xs text-muted font-mono">{l.entityId.slice(0, 12)}</span></td>
                    <td>{l.direction === "push" ? "CRM → финучёт" : "финучёт → CRM"}</td>
                    <td><Badge tone={l.status === "ok" ? "good" : "accent"} dot>{l.status === "ok" ? "OK" : "Ошибка"}</Badge></td>
                    <td className="max-w-[420px] truncate text-ink-2" title={l.message ?? ""}>{l.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
