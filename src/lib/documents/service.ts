import fs from "node:fs";
import path from "node:path";
import { desc, eq, and, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DocumentType, Channel } from "@/db/schema";
import { newId } from "@/lib/utils";
import { nextNumber, docNumber } from "@/lib/counters";
import { getSetting, appUrl } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { renderInvoice, renderContract, renderUpd, renderAct, renderKp, renderClientReport, type Party, type Line, totals, money, dateRu } from "./pdf";
import { fmtMoney, fmtDate } from "@/lib/format";

function storageDir() {
  const local = path.join(process.cwd(), "storage", "documents");
  try { fs.mkdirSync(local, { recursive: true }); fs.accessSync(local, fs.constants.W_OK); return local; } catch { const tmp = path.join(process.env.TMPDIR ?? "/tmp", "oborot-documents"); fs.mkdirSync(tmp, { recursive: true }); return tmp; }
}
const STORAGE = storageDir();

const TITLES: Record<DocumentType, string> = { invoice: "Счёт", contract: "Договор", upd: "УПД", act: "Акт", kp: "Коммерческое предложение", report: "Отчёт для клиента" };
const PREFIX: Record<DocumentType, string> = { invoice: "СЧ", contract: "Д", upd: "УПД", act: "АКТ", kp: "КП", report: "ОТЧ" };

export async function sellerParty(): Promise<Party> {
  const c = await getSetting("company");
  return { name: c.name, inn: c.inn, kpp: c.kpp, address: c.address, bankName: c.bankName, bik: c.bik, account: c.account, corrAccount: c.corrAccount, director: c.director, directorPosition: c.directorPosition, phone: c.phone, email: c.email };
}
export function buyerParty(c: typeof schema.companies.$inferSelect | null | undefined): Party {
  return { name: c?.name ?? "Покупатель", inn: c?.inn ?? "", kpp: c?.kpp ?? undefined, address: c?.legalAddress ?? c?.address ?? "", bankName: c?.bankName ?? undefined, bik: c?.bik ?? undefined, account: c?.account ?? undefined, corrAccount: c?.corrAccount ?? undefined, director: c?.director ?? undefined, directorPosition: c?.directorPosition ?? undefined };
}

export async function dealLines(dealId: string): Promise<Line[]> {
  const items = await db.query.dealItems.findMany({ where: eq(schema.dealItems.dealId, dealId) });
  if (items.length) return items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price, discount: i.discount, vatRate: i.vatRate }));
  const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, dealId) });
  return [{ name: deal?.title ?? "Товары и услуги по сделке", unit: "усл", qty: 1, price: deal?.amount ?? 0, vatRate: 20 }];
}

/** 6, 7, 8, 22 — генерация документа по сделке в один клик */
export async function createDocument(p: { type: DocumentType; dealId?: string | null; companyId?: string | null; userId?: string | null; lines?: Line[]; title?: string }) {
  const deal = p.dealId ? await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) }) : null;
  const companyId = p.companyId ?? deal?.companyId ?? null;
  const company = companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }) : null;
  const lines = p.lines ?? (p.dealId ? await dealLines(p.dealId) : []);
  const n = await nextNumber(p.type);
  const number = docNumber(PREFIX[p.type], n);
  const seller = await sellerParty();
  const buyer = buyerParty(company);
  const date = new Date().toISOString();
  const t = totals(lines);
  const manager = deal?.managerId ? await db.query.users.findFirst({ where: eq(schema.users.id, deal.managerId) }) : null;
  const contract = p.type === "upd" && p.dealId ? await db.query.documents.findFirst({ where: and(eq(schema.documents.dealId, p.dealId), eq(schema.documents.type, "contract")), orderBy: desc(schema.documents.createdAt) }) : null;
  let bytes: Buffer;
  switch (p.type) {
    case "invoice": bytes = await renderInvoice({ number, date, seller, buyer, lines, dueDays: 5 }); break;
    case "contract": bytes = await renderContract({ number, date, seller, buyer, lines, subject: deal?.title ?? "товары и услуги" }); break;
    case "upd": bytes = await renderUpd({ number, date, seller, buyer, lines, contractNumber: contract?.number }); break;
    case "act": bytes = await renderAct({ number, date, seller, buyer, lines }); break;
    case "kp": bytes = await renderKp({ number, date, seller, buyer, lines, manager: manager?.name ?? "Отдел продаж", managerPhone: manager?.phone ?? seller.phone }); break;
    default: throw new Error("Для отчёта используйте createClientReport");
  }
  const id = newId("doc");
  const filePath = path.join(STORAGE, `${id}.pdf`);
  try { fs.writeFileSync(filePath, bytes); } catch { /* файл не критичен: PDF перерисуется из payload */ }
  const title = p.title ?? `${TITLES[p.type]} ${number}`;
  await db.insert(schema.documents).values({ id, type: p.type, number, title, dealId: p.dealId ?? null, companyId, amount: t.sum, status: "draft", filePath, payload: { seller, buyer, lines, totals: t, date }, createdBy: p.userId ?? null });
  await logActivity({ type: "document", title: `${TITLES[p.type]} ${number} сформирован`, body: `${lines.length} поз., ${fmtMoney(t.sum)}`, dealId: p.dealId, companyId, userId: p.userId, meta: { documentId: id } });
  if (p.type === "invoice") await emit("invoice.created", { dealId: p.dealId, companyId, documentId: id, amount: t.sum, userId: p.userId, contactId: deal?.contactId });
  if (p.type === "upd") await emit("upd.created", { dealId: p.dealId, companyId, documentId: id, amount: t.sum, userId: p.userId, contactId: deal?.contactId });
  return { id, number, title, amount: t.sum, filePath };
}

/** 21 — отправка документа клиенту: письмо с вложением или ссылка в мессенджер */
export async function sendDocument(documentId: string, channel: Channel | "preferred" = "preferred", userId?: string | null) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) return { ok: false, sandbox: true, channel: null as Channel | null, error: "Документ не найден" };
  const deal = doc.dealId ? await db.query.deals.findFirst({ where: eq(schema.deals.id, doc.dealId) }) : null;
  const link = appUrl(`/api/documents/${doc.id}/pdf`);
  const { sendMessage, preferredChannel } = await import("@/lib/integrations/messaging");
  const pref = channel === "preferred" ? await preferredChannel(deal?.contactId, doc.companyId) : null;
  const ch: Channel | null = channel === "preferred" ? pref?.channel ?? null : channel;
  if (ch === "email") {
    const { sendEmail } = await import("@/lib/integrations/email");
    const company = doc.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) }) : null;
    const to = pref?.address ?? company?.email;
    if (!to) return { ok: false, sandbox: true, channel: ch, error: "Нет email клиента" };
    const r = await sendEmail({ to, subject: `${doc.title} от ${(await getSetting("company")).shortName}`, text: `Здравствуйте!\n\nНаправляем ${doc.title.toLowerCase()} на сумму ${fmtMoney(doc.amount)}.\nДокумент во вложении и по ссылке: ${link}\n\nС уважением, ${(await getSetting("company")).shortName}`, attachments: doc.filePath && fs.existsSync(path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath)) ? [{ filename: `${doc.number}.pdf`, path: path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath) }] : [] });
    await db.update(schema.documents).set({ status: doc.status === "draft" ? "sent" : doc.status, sentAt: new Date().toISOString() }).where(eq(schema.documents.id, doc.id));
    await logActivity({ type: "document", title: `${doc.title} отправлен на ${to}`, dealId: doc.dealId, companyId: doc.companyId, userId, meta: { documentId: doc.id } });
    return { ok: r.ok, sandbox: r.sandbox, channel: ch, error: r.error };
  }
  const r = await sendMessage({ channel: ch ?? "preferred", text: `${doc.title} на сумму ${fmtMoney(doc.amount)}: ${link}`, companyId: doc.companyId, contactId: deal?.contactId, dealId: doc.dealId, userId, isAutomation: !userId, attachments: [{ name: `${doc.number}.pdf`, url: link }] });
  if (r.ok) {
    await db.update(schema.documents).set({ status: doc.status === "draft" ? "sent" : doc.status, sentAt: new Date().toISOString() }).where(eq(schema.documents.id, doc.id));
    await logActivity({ type: "document", title: `${doc.title} отправлен (${r.channel})`, dealId: doc.dealId, companyId: doc.companyId, userId, meta: { documentId: doc.id } });
  }
  return { ok: r.ok, sandbox: r.sandbox, channel: r.channel, error: r.error };
}

/** 22 — мгновенный отчёт для клиента: заказы, оплаты, документы, баланс + ИИ-резюме */
export async function createClientReport(companyId: string, p: { months?: number; userId?: string | null } = {}) {
  const months = p.months ?? 3;
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) });
  if (!company) throw new Error("Клиент не найден");
  const since = new Date(); since.setMonth(since.getMonth() - months);
  const deals = await db.select({ d: schema.deals, s: schema.stages }).from(schema.deals).leftJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id)).where(and(eq(schema.deals.companyId, companyId), gte(schema.deals.createdAt, since.toISOString()))).orderBy(desc(schema.deals.createdAt));
  const payments = await db.query.payments.findMany({ where: and(eq(schema.payments.companyId, companyId), gte(schema.payments.paidAt, since.toISOString())), orderBy: desc(schema.payments.paidAt) });
  const docs = await db.query.documents.findMany({ where: and(eq(schema.documents.companyId, companyId), gte(schema.documents.createdAt, since.toISOString())), orderBy: desc(schema.documents.createdAt) });
  const won = deals.filter((x) => x.d.status === "won");
  const paid = payments.filter((x) => x.direction === "in").reduce((s, x) => s + x.amount, 0);
  const invoiced = docs.filter((d) => d.type === "invoice").reduce((s, d) => s + d.amount, 0);
  const facts = `Клиент ${company.name}. Период ${months} мес. Заказов: ${deals.length}, выполнено: ${won.length} на ${fmtMoney(won.reduce((s, x) => s + x.d.amount, 0))}. Выставлено счетов на ${fmtMoney(invoiced)}, оплачено ${fmtMoney(paid)}. Баланс: ${fmtMoney(company.balance)}. Документов: ${docs.length}, подписано в ЭДО: ${docs.filter((d) => d.edoStatus === "signed").length}.`;
  const { summarizeForClient } = await import("@/lib/integrations/ai");
  const ai = await summarizeForClient(facts);
  const summary = ai.text || `За последние ${months} мес. мы выполнили ${won.length} ${won.length === 1 ? "заказ" : won.length < 5 ? "заказа" : "заказов"} на ${fmtMoney(won.reduce((s, x) => s + x.d.amount, 0))}. Оплачено ${fmtMoney(paid)} из выставленных ${fmtMoney(invoiced)}; текущий баланс — ${fmtMoney(company.balance)}. Все закрывающие документы доступны в ЭДО.`;
  const n = await nextNumber("report");
  const number = docNumber("ОТЧ", n);
  const period = `${fmtDate(since.toISOString(), { day: "numeric", month: "long", year: "numeric" })} — ${fmtDate(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })}`;
  const bytes = await renderClientReport({
    title: `Отчёт о сотрудничестве № ${number}`, period, seller: await sellerParty(), buyer: buyerParty(company), summary,
    stats: [["Заказов", String(deals.length)], ["Выполнено", String(won.length)], ["Оплачено", money(paid)], ["Баланс", money(company.balance)]],
    deals: deals.map((x) => [String(x.d.number), x.d.title, x.s?.name ?? "", money(x.d.amount)]),
    payments: payments.map((x) => [dateRu(x.paidAt), x.purpose ?? (x.direction === "in" ? "Оплата" : "Возврат"), money(x.direction === "in" ? x.amount : -x.amount)]),
    documents: docs.filter((d) => d.type !== "report").map((d) => [d.title, dateRu(d.createdAt), d.edoStatus === "signed" ? "подписан" : d.status === "paid" ? "оплачен" : d.status === "sent" ? "отправлен" : "черновик", money(d.amount)]),
  });
  const id = newId("doc");
  const filePath = path.join(STORAGE, `${id}.pdf`);
  try { fs.writeFileSync(filePath, bytes); } catch { /* файл не критичен: PDF перерисуется из payload */ }
  await db.insert(schema.documents).values({ id, type: "report", number, title: `Отчёт для клиента ${number}`, companyId, amount: paid, status: "draft", filePath, payload: { summary, period, aiSandbox: ai.sandbox }, createdBy: p.userId ?? null });
  await logActivity({ type: "document", title: `Сформирован отчёт для клиента ${number}`, body: summary, companyId, userId: p.userId, meta: { documentId: id } });
  return { id, number, filePath, summary, aiSandbox: ai.sandbox };
}

export async function documentBytes(documentId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) return null;
  const abs = doc.filePath ? (path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath)) : null;
  if (abs && fs.existsSync(abs)) return { bytes: fs.readFileSync(abs), filename: `${doc.number}.pdf` };
  // файла нет (например, после переустановки) — перерисуем из payload
  const pl = (doc.payload ?? {}) as { seller?: Party; buyer?: Party; lines?: Line[]; date?: string };
  if (!pl.seller || !pl.buyer || !pl.lines) return null;
  const base = { number: doc.number, date: pl.date ?? doc.createdAt, seller: pl.seller, buyer: pl.buyer, lines: pl.lines };
  const bytes = doc.type === "invoice" ? await renderInvoice({ ...base, paid: doc.status === "paid" }) : doc.type === "contract" ? await renderContract({ ...base, subject: doc.title, signed: doc.status === "signed" }) : doc.type === "upd" ? await renderUpd({ ...base, signed: doc.edoStatus === "signed" }) : doc.type === "act" ? await renderAct({ ...base, signed: doc.status === "signed" }) : await renderKp({ ...base, manager: "Отдел продаж" });
  if (abs) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, bytes); }
  return { bytes, filename: `${doc.number}.pdf` };
}
