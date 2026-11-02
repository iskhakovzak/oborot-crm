import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { resolve, logEvent } from "./registry";

export type StatementRow = { externalId: string; date: string; amount: number; direction: "in" | "out"; counterpartyName: string; counterpartyInn: string; purpose: string };

/** Загрузка выписки: по API банка или демо-генерация платежей под неоплаченные счета */
export async function fetchStatement(): Promise<{ rows: StatementRow[]; sandbox: boolean; provider: string }> {
  const r = await resolve("bank");
  if (r.live && r.provider === "tochka" && r.config.token) {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const res = await fetch(`https://enter.tochka.com/uapi/open-banking/v1.0/accounts/${r.config.accountId}/statements?startDateTime=${since}`, { headers: { Authorization: `Bearer ${r.config.token}` } });
    const j = (await res.json()) as { Data?: { Statement?: { Transaction?: { transactionId: string; documentProcessDate: string; Amount: { amount: string }; creditDebitIndicator: string; counterpartyName?: string; counterpartyInn?: string; paymentPurpose?: string }[] }[] } };
    const rows: StatementRow[] = (j.Data?.Statement?.[0]?.Transaction ?? []).map((t) => ({ externalId: t.transactionId, date: t.documentProcessDate, amount: Number(t.Amount.amount), direction: t.creditDebitIndicator === "Credit" ? "in" : "out", counterpartyName: t.counterpartyName ?? "", counterpartyInn: t.counterpartyInn ?? "", purpose: t.paymentPurpose ?? "" }));
    await logEvent({ kind: "bank.statement", provider: "tochka", direction: "in", payload: { count: rows.length }, integrationId: r.integrationId });
    return { rows, sandbox: false, provider: "tochka" };
  }
  // демо: часть неоплаченных счетов «оплачивается», плюс пара расходов
  const unpaid = await db.select({ d: schema.documents, c: schema.companies }).from(schema.documents).leftJoin(schema.companies, eq(schema.documents.companyId, schema.companies.id)).where(and(eq(schema.documents.type, "invoice"), inArray(schema.documents.status, ["sent", "draft"])));
  const existing = new Set((await db.select({ e: schema.bankTransactions.externalId }).from(schema.bankTransactions)).map((x) => x.e));
  const rows: StatementRow[] = [];
  const today = new Date();
  unpaid.slice(0, 3).forEach(({ d, c }, i) => {
    const ext = `demo-${d.number}`;
    if (existing.has(ext)) return;
    rows.push({ externalId: ext, date: new Date(today.getTime() - i * 3600_000 * 5).toISOString(), amount: d.amount, direction: "in", counterpartyName: c?.name ?? "Контрагент", counterpartyInn: c?.inn ?? "", purpose: `Оплата по счёту ${d.number} от ${d.createdAt.slice(0, 10)}. В т.ч. НДС 20%` });
  });
  const extOut = `demo-rent-${today.toISOString().slice(0, 10)}`;
  if (!existing.has(extOut)) rows.push({ externalId: extOut, date: today.toISOString(), amount: 85000, direction: "out", counterpartyName: "ООО «Пресненская набережная»", counterpartyInn: "7703123456", purpose: "Аренда офиса за текущий месяц. Без НДС" });
  await logEvent({ kind: "bank.statement", provider: r.provider, direction: "in", payload: { count: rows.length }, status: "sandbox", integrationId: r.integrationId });
  return { rows, sandbox: true, provider: r.provider };
}

/** Разноска выписки: сопоставление по номеру счёта в назначении, по ИНН и сумме */
export async function reconcile(rows: StatementRow[], userId?: string | null) {
  let matched = 0, created = 0;
  const result: { id: string; matchedCompanyId: string | null; matchedDocumentId: string | null }[] = [];
  for (const row of rows) {
    const exists = await db.query.bankTransactions.findFirst({ where: eq(schema.bankTransactions.externalId, row.externalId) });
    if (exists) continue;
    let company = row.counterpartyInn ? await db.query.companies.findFirst({ where: eq(schema.companies.inn, row.counterpartyInn) }) : undefined;
    let doc = null as typeof schema.documents.$inferSelect | null;
    const m = row.purpose.match(/(СЧ|СЧЁТ|СЧЕТ)[\s№-]*([A-ZА-Я]*-?\d{4}-\d{3,5})/i) ?? row.purpose.match(/([A-ZА-Я]{1,4}-\d{4}-\d{3,5})/);
    if (m) doc = (await db.query.documents.findFirst({ where: eq(schema.documents.number, m[2] ?? m[1]) })) ?? null;
    if (!doc && company && row.direction === "in") doc = (await db.query.documents.findFirst({ where: and(eq(schema.documents.companyId, company.id), eq(schema.documents.type, "invoice"), eq(schema.documents.amount, row.amount)) })) ?? null;
    if (!company && doc?.companyId) company = await db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) });
    const txId = newId("btx");
    let paymentId: string | null = null;
    if (row.direction === "in" && company) {
      paymentId = newId("pmt");
      await db.insert(schema.payments).values({ id: paymentId, companyId: company.id, dealId: doc?.dealId ?? null, documentId: doc?.id ?? null, amount: row.amount, direction: "in", method: "bank", purpose: row.purpose, externalId: row.externalId, paidAt: row.date });
      await db.update(schema.companies).set({ balance: (company.balance ?? 0) + row.amount }).where(eq(schema.companies.id, company.id));
      if (doc) await db.update(schema.documents).set({ status: "paid" }).where(eq(schema.documents.id, doc.id));
      matched++;
      const { emit } = await import("@/lib/events");
      await emit("payment.received", { paymentId, dealId: doc?.dealId ?? null, companyId: company.id, documentId: doc?.id ?? null, amount: row.amount, userId: userId ?? null });
    }
    await db.insert(schema.bankTransactions).values({ id: txId, provider: "bank", externalId: row.externalId, date: row.date, amount: row.amount, direction: row.direction, counterpartyName: row.counterpartyName, counterpartyInn: row.counterpartyInn, purpose: row.purpose, matchedCompanyId: company?.id ?? null, matchedPaymentId: paymentId, matchedDocumentId: doc?.id ?? null });
    created++;
    result.push({ id: txId, matchedCompanyId: company?.id ?? null, matchedDocumentId: doc?.id ?? null });
  }
  return { created, matched, result };
}
