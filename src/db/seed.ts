/* eslint-disable no-console */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, schema } from "./index";
import { adminPermissions, managerPermissions, productionPermissions, accountantPermissions } from "@/lib/permissions";
import { CATALOG } from "@/lib/integrations/registry";
import type { AutomationAction, AutomationEvent, AutomationCondition } from "./schema";

let seedState = 42;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const id = (p: string) => `${p}_${Math.floor(rnd() * 1e12).toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;
const daysAgo = (d: number, h = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(Math.floor(h), Math.floor((h % 1) * 60) + Math.floor(rnd() * 20), 0, 0); if (t.getTime() > Date.now()) t.setDate(t.getDate() - 1); return t.toISOString(); };
const inFuture = (d: number, h = 11) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t.toISOString(); };

/** валидный ИНН юрлица с контрольной суммой */
function makeInn(seed: number) {
  const base = String(7700000000 + (seed * 7919) % 99999999).slice(0, 9).split("").map(Number);
  const c = ([2, 4, 10, 3, 5, 9, 4, 6, 8].reduce((s, k, i) => s + k * base[i], 0) % 11) % 10;
  return base.join("") + c;
}

export async function seedDatabase() {
  seedState = 42;
  console.log("Очистка…");
  const tables = ["audit_log", "telegram_commands", "automation_runs", "automations", "integration_events", "integrations", "campaign_deliveries", "campaigns", "marketing_costs", "analytics_exports", "production_orders", "bookings", "booking_types", "calls", "messages", "conversations", "activities", "tasks", "finance_sync_log", "bank_transactions", "payments", "payment_links", "documents", "deal_items", "deals", "stages", "pipelines", "products", "contacts", "companies", "sessions", "users", "roles", "settings", "counters"];
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`));

  // ── роли и пользователи
  const roleAdmin = id("role"), roleManager = id("role"), roleProd = id("role"), roleAcc = id("role");
  await db.insert(schema.roles).values([
    { id: roleAdmin, name: "Администратор", slug: "admin", description: "Полный доступ ко всем данным и настройкам", permissions: adminPermissions(), isSystem: true },
    { id: roleManager, name: "Менеджер по продажам", slug: "manager", description: "Свои сделки и клиенты, без финансов и настроек", permissions: managerPermissions(), isSystem: true },
    { id: roleProd, name: "Производство", slug: "production", description: "Заказы производства, без сумм и контактов клиентов", permissions: productionPermissions(), isSystem: true },
    { id: roleAcc, name: "Бухгалтер", slug: "accountant", description: "Документы, оплаты, ЭДО и банк", permissions: accountantPermissions(), isSystem: true },
  ]);
  const pw = await bcrypt.hash("demo123", 10);
  const admin = id("usr"), ivan = id("usr"), maria = id("usr"), oleg = id("usr"), anna = id("usr"), denis = id("usr");
  await db.insert(schema.users).values([
    { id: admin, name: "Станислав Костин", email: "admin@oborot.ru", phone: "+7 916 100-00-01", passwordHash: await bcrypt.hash("admin123", 10), roleId: roleAdmin, color: "#16181d", teamId: "sales", acceptsLeads: false, skills: ["крупные сделки"] },
    { id: ivan, name: "Иван Соколов", email: "ivan@oborot.ru", phone: "+7 916 100-00-02", passwordHash: pw, roleId: roleManager, color: "#2456d6", teamId: "sales", leadWeight: 2, skills: ["кондиционеры", "вентиляция"] },
    { id: maria, name: "Мария Орлова", email: "maria@oborot.ru", phone: "+7 916 100-00-03", passwordHash: pw, roleId: roleManager, color: "#6b3fd6", teamId: "sales", skills: ["тепловые завесы", "сервис"] },
    { id: denis, name: "Денис Волков", email: "denis@oborot.ru", phone: "+7 916 100-00-06", passwordHash: pw, roleId: roleManager, color: "#b96a00", teamId: "sales", skills: ["вентиляция", "проекты"] },
    { id: oleg, name: "Олег Климов", email: "oleg@oborot.ru", phone: "+7 916 100-00-04", passwordHash: pw, roleId: roleProd, color: "#138a5e", teamId: "production", acceptsLeads: false },
    { id: anna, name: "Анна Белова", email: "anna@oborot.ru", phone: "+7 916 100-00-05", passwordHash: pw, roleId: roleAcc, color: "#c8102e", teamId: "finance", acceptsLeads: false },
  ]);
  const managers = [ivan, maria, denis];

  // ── воронки
  const pSales = id("pipe"), pShip = id("pipe"), pService = id("pipe"), pProd = id("pipe");
  await db.insert(schema.pipelines).values([
    { id: pSales, name: "Продажи", kind: "sales", order: 0, handoffPipelineId: pShip },
    { id: pShip, name: "Отгрузка", kind: "shipping", order: 1 },
    { id: pService, name: "Услуги и монтаж", kind: "service", order: 2 },
    { id: pProd, name: "Производство", kind: "production", order: 3 },
  ]);
  const mkStages = (pid: string, list: [string, string, number, "open" | "won" | "lost"][]) => list.map(([name, color, probability, kind], i) => ({ id: id("stg"), pipelineId: pid, name, color, probability, kind, order: i }));
  const sSales = mkStages(pSales, [["Новая заявка", "#8a91a0", 10, "open"], ["Квалификация", "#2456d6", 25, "open"], ["КП отправлено", "#6b3fd6", 40, "open"], ["Переговоры", "#b96a00", 60, "open"], ["Счёт выставлен", "#0e7490", 80, "open"], ["Оплачено", "#138a5e", 100, "won"], ["Отказ", "#c8102e", 0, "lost"]]);
  const sShip = mkStages(pShip, [["Сборка заказа", "#8a91a0", 20, "open"], ["Передано в доставку", "#2456d6", 60, "open"], ["Доставлено", "#0e7490", 90, "open"], ["Закрыто", "#138a5e", 100, "won"]]);
  const sService = mkStages(pService, [["Назначить бригаду", "#8a91a0", 20, "open"], ["Монтаж", "#2456d6", 60, "open"], ["Пусконаладка", "#0e7490", 85, "open"], ["Акт подписан", "#138a5e", 100, "won"]]);
  const sProd = mkStages(pProd, [["Очередь", "#8a91a0", 10, "open"], ["В работе", "#2456d6", 50, "open"], ["Контроль качества", "#b96a00", 85, "open"], ["Готово", "#138a5e", 100, "won"]]);
  await db.insert(schema.stages).values([...sSales, ...sShip, ...sService, ...sProd]);

  // ── клиенты
  const companyDefs = [
    ["ООО «Технострой-Подмосковье»", "5024051347", "Строительство", "Яндекс Директ", "client"],
    ["ООО «Питерский хлеб»", "7801032750", "Пищевое производство", "Рекомендация", "client"],
    ["ООО «Вектор Логистик»", makeInn(3), "Логистика", "Сайт", "client"],
    ["ИП Кузнецова М.А.", "", "Розница", "Instagram", "lead"],
    ["ООО «Альфа Медиа Групп»", makeInn(5), "Медиа", "Яндекс Директ", "client"],
    ["АО «Промэнерго Сервис»", makeInn(6), "Энергетика", "Холодный звонок", "client"],
    ["ООО «Кофейня №1»", makeInn(7), "HoReCa", "Авито", "lead"],
    ["ООО «Агроресурс»", makeInn(8), "Сельское хозяйство", "Сайт", "client"],
    ["ООО «Технопарк Сколково Девелопмент»", makeInn(9), "Девелопмент", "Выставка", "lead"],
    ["ООО «Торг Плюс»", makeInn(10), "Опт", "Telegram-канал", "client"],
    ["ООО «Медцентр Здоровье»", makeInn(11), "Медицина", "Яндекс Директ", "lead"],
    ["ООО «Стройкомплект»", makeInn(12), "Строительство", "Рекомендация", "client"],
    ["ООО «Фитнес Лайн»", makeInn(13), "Спорт", "VK Реклама", "lead"],
    ["ООО «Северный склад»", makeInn(14), "Логистика", "Сайт", "client"],
  ] as const;
  const companies = companyDefs.map(([name, inn, industry, source, status], i) => ({
    id: id("cmp"), name, shortName: name.replace(/^(ООО|АО|ИП)\s*/, "").replace(/[«»]/g, ""), inn: inn || null, kpp: inn && inn.length === 10 ? inn.slice(0, 4) + "01001" : null,
    legalAddress: pick(["г. Москва, ул. Ленинская Слобода, д. 19", "г. Санкт-Петербург, Невский пр-т, д. 100", "Московская обл., г. Красногорск, ул. Ленина, д. 6", "г. Казань, ул. Баумана, д. 44", "г. Екатеринбург, ул. Малышева, д. 51"]),
    director: pick(["Зайцев Пётр Михайлович", "Смирнова Елена Викторовна", "Морозов Антон Владимирович", "Кузнецова Мария Алексеевна", "Иванов Сергей Петрович"]), directorPosition: "Генеральный директор",
    bankName: pick(["ПАО Сбербанк", "АО «ТБанк»", "АО «Альфа-Банк»", "ООО «Банк Точка»"]), bik: pick(["044525225", "044525974", "044525593", "044525104"]), account: `4070281${String(100000000000 + Math.floor(rnd() * 899999999999))}`, corrAccount: "30101810400000000225",
    email: `info@${["technostroy", "piterhleb", "vectorlog", "kuznetsova", "alfamedia", "promenergo", "coffee1", "agroresurs", "skolkovodev", "torgplus", "medzdorovie", "stroykomplekt", "fitline", "northstock"][i]}.ru`,
    phone: `+7 (495) ${100 + i * 7}-${10 + i}-${20 + i * 3}`, industry, status: status as "lead" | "client", source, utm: source === "Яндекс Директ" ? { source: "yandex", medium: "cpc", campaign: "klimat_msk" } : source === "VK Реклама" ? { source: "vk", medium: "cpc", campaign: "fitness" } : null,
    managerId: managers[i % 3], balance: 0, tags: [industry.toLowerCase(), ...(i % 4 === 0 ? ["vip"] : [])], createdAt: daysAgo(90 - i * 5), updatedAt: daysAgo(2),
  }));
  await db.insert(schema.companies).values(companies);
  const firstNames = ["Алексей", "Марина", "Дмитрий", "Ольга", "Сергей", "Наталья", "Павел", "Екатерина", "Андрей", "Юлия", "Максим", "Светлана", "Игорь", "Анастасия"];
  const lastNames = ["Петров", "Иванова", "Сидоров", "Козлова", "Новиков", "Фёдорова", "Лебедев", "Семёнова", "Егоров", "Павлова", "Волков", "Романова", "Макаров", "Белова"];
  const contacts = companies.map((c, i) => ({ id: id("cnt"), companyId: c.id, name: `${lastNames[i]} ${firstNames[i]} ${["Викторович", "Сергеевна", "Олегович", "Андреевна"][i % 4]}`, position: pick(["Директор", "Руководитель АХО", "Закупки", "Главный инженер", "Администратор"]), phone: `+7 9${16 + (i % 4)}${String(1000000 + i * 73571).slice(0, 7)}`, email: `${["a.petrov", "m.ivanova", "d.sidorov", "o.kozlova", "s.novikov", "n.fedorova", "p.lebedev", "e.semenova", "a.egorov", "y.pavlova", "m.volkov", "s.romanova", "i.makarov", "a.belova"][i]}@${c.email.split("@")[1]}`, telegram: i % 3 !== 2 ? `${100000000 + i * 1234567}` : null, whatsapp: i % 2 ? `79${16 + (i % 4)}${String(1000000 + i * 73571).slice(0, 7)}` : null, max: i % 5 === 0 ? `max_${i}` : null, isPrimary: true }));
  await db.insert(schema.contacts).values(contacts);

  // ── товары
  const products = [
    ["BSAG-09", "4601234567890", "Кондиционер настенный Ballu BSAG-09HN8", "Кондиционеры", "Ballu", 28990, 19800, 24, 8.5],
    ["BSAG-12", "4601234567906", "Кондиционер настенный Ballu BSAG-12HN8", "Кондиционеры", "Ballu", 34990, 24100, 18, 9.1],
    ["FTXB25", "4601234567913", "Сплит-система Daikin FTXB25C", "Кондиционеры", "Daikin", 62900, 44500, 7, 9.5],
    ["MSZ-LN", "4601234567920", "Сплит-система Mitsubishi Electric MSZ-LN25VG", "Кондиционеры", "Mitsubishi Electric", 118000, 84000, 4, 12],
    ["KEV-6", "4602345678901", "Тепловая завеса Тепломаш КЭВ-6П1261E", "Тепловые завесы", "Тепломаш", 24500, 16900, 11, 14],
    ["KEV-9", "4602345678918", "Тепловая завеса Тепломаш КЭВ-9П2011E", "Тепловые завесы", "Тепломаш", 36900, 25600, 6, 19],
    ["K200", "4603456789012", "Вентилятор канальный Systemair K 200 M", "Вентиляция", "Systemair", 18900, 12400, 15, 4.2],
    ["BRZ-1000", "4604567890123", "Приточная установка Breezart 1000 Lux", "Вентиляция", "Breezart", 189000, 131000, 2, 48],
    ["TUBE-14", "4605678901234", "Медная труба 1/4″ × 15 м", "Расходные материалы", "Majdanpek", 4200, 2900, 60, 2.1],
    ["TUBE-38", "4605678901241", "Медная труба 3/8″ × 15 м", "Расходные материалы", "Majdanpek", 6100, 4300, 44, 3],
    ["MNT-35", "4606789012345", "Монтаж сплит-системы до 3,5 кВт", "Услуги", "Оборот", 9500, 4000, 0, 0],
    ["MNT-VENT", "4606789012352", "Монтаж приточной установки", "Услуги", "Оборот", 45000, 22000, 0, 0],
    ["SRV-TO", "4606789012369", "Сервисное обслуживание (ТО), 1 выезд", "Услуги", "Оборот", 4500, 1800, 0, 0],
    ["PRJ-VENT", "4606789012376", "Проект вентиляции, до 500 м²", "Услуги", "Оборот", 65000, 30000, 0, 0],
  ].map(([sku, barcode, name, category, brand, price, cost, stock, w]) => ({ id: id("prd"), sku: String(sku), barcode: String(barcode), name: String(name), category: String(category), brand: String(brand), unit: category === "Услуги" ? "усл" : category === "Расходные материалы" ? "бухта" : "шт", price: Number(price), cost: Number(cost), stock: Number(stock), weightKg: Number(w) || null, vatRate: 20, description: `${name}. Поставка 2–7 дней, гарантия 3 года.`, attributes: { "Гарантия": "3 года" } }));
  await db.insert(schema.products).values(products);

  // ── сделки
  let dealNo = 1000;
  const sources = ["Яндекс Директ", "Сайт", "Рекомендация", "Instagram", "Авито", "Telegram-канал", "VK Реклама", "Холодный звонок", "Выставка"];
  const dealTitles = ["Кондиционеры в офис", "Вентиляция склада", "Тепловые завесы на входную группу", "Сплит-системы в переговорные", "Приточная установка для цеха", "ТО климатического оборудования", "Проект и монтаж вентиляции", "Кондиционирование серверной", "Завесы для торгового зала", "Кондиционеры в кафе"];
  const deals: (typeof schema.deals.$inferInsert)[] = [];
  const items: (typeof schema.dealItems.$inferInsert)[] = [];
  const addDeal = (opts: { companyIdx: number; stage: typeof sSales[number]; pipelineId: string; title?: string; days: number; status?: "open" | "won" | "lost"; prods?: [number, number][]; managerId?: string; parent?: string | null; lost?: string }) => {
    const c = companies[opts.companyIdx];
    const prods = opts.prods ?? [[Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 4)], [10, 1 + Math.floor(rnd() * 3)]];
    const amount = prods.reduce((s, [pi, q]) => s + products[pi].price * q, 0);
    const d: typeof schema.deals.$inferInsert = { id: id("deal"), number: ++dealNo, title: opts.title ?? pick(dealTitles), companyId: c.id, contactId: contacts[opts.companyIdx].id, pipelineId: opts.pipelineId, stageId: opts.stage.id, amount, managerId: opts.managerId ?? c.managerId, status: opts.status ?? opts.stage.kind, lostReason: opts.lost ?? null, source: c.source ?? pick(sources), utm: c.utm ?? null, ymClientId: String(1600000000 + Math.floor(rnd() * 99999999)) + "." + String(100000 + Math.floor(rnd() * 899999)), nextStep: pick(["Позвонить и уточнить сроки", "Отправить КП", "Согласовать договор", "Дождаться оплаты", "Назначить замер", null]), expectedCloseAt: inFuture(3 + Math.floor(rnd() * 20)), closedAt: opts.status === "won" || opts.stage.kind !== "open" ? daysAgo(Math.max(0, opts.days - 5)) : null, parentDealId: opts.parent ?? null, stageEnteredAt: daysAgo(Math.floor(opts.days / 2)), createdAt: daysAgo(opts.days), updatedAt: daysAgo(Math.max(0, Math.floor(opts.days / 3))) };
    deals.push(d);
    for (const [pi, q] of prods) items.push({ id: id("itm"), dealId: d.id!, productId: products[pi].id, name: products[pi].name, unit: products[pi].unit, qty: q, price: products[pi].price, discount: 0, vatRate: 20 });
    return d;
  };
  // открытые продажи — распределение по этапам
  const openPlan: [number, number][] = [[0, 1], [1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [6, 0], [7, 4], [8, 0], [9, 2], [10, 1], [11, 4], [12, 0], [13, 3]];
  for (const [ci, si] of openPlan) addDeal({ companyIdx: ci, stage: sSales[si], pipelineId: pSales, days: 1 + Math.floor(rnd() * 25) });
  // выигранные за 90 дней (для аналитики)
  const wonDeals: (typeof schema.deals.$inferInsert)[] = [];
  for (let i = 0; i < 22; i++) wonDeals.push(addDeal({ companyIdx: i % companies.length, stage: sSales[5], pipelineId: pSales, days: 5 + Math.floor(rnd() * 85), status: "won" }));
  for (let i = 0; i < 7; i++) addDeal({ companyIdx: (i * 3) % companies.length, stage: sSales[6], pipelineId: pSales, days: 10 + Math.floor(rnd() * 80), status: "lost", lost: pick(["Дорого", "Выбрали конкурента", "Отложили проект", "Нет ответа"]) });
  // отгрузка и услуги — дочерние от выигранных
  const shipDeals = [0, 1, 2, 3].map((i) => addDeal({ companyIdx: i, stage: sShip[i], pipelineId: pShip, title: wonDeals[i].title, days: 3 + i * 2, parent: wonDeals[i].id, prods: [[i, 2]] }));
  const serviceDeals = [4, 5, 6].map((i) => addDeal({ companyIdx: i, stage: sService[i - 4], pipelineId: pService, title: `Монтаж: ${wonDeals[i].title}`, days: 2 + i, parent: wonDeals[i].id, prods: [[10, 2]] }));
  void shipDeals; void serviceDeals;
  await db.insert(schema.deals).values(deals);
  await db.insert(schema.dealItems).values(items);

  // ── документы и оплаты
  const docs: (typeof schema.documents.$inferInsert)[] = [];
  const pays: (typeof schema.payments.$inferInsert)[] = [];
  let inv = 100, ctr = 40, upd = 70, kp = 200;
  const openSales = deals.filter((d) => d.pipelineId === pSales && d.status === "open");
  const seller = { name: "ООО «Оборот»", inn: "7707083893", kpp: "770701001", address: "123112, г. Москва, Пресненская наб., д. 12" };
  const y = new Date().getFullYear();
  const mkDoc = (d: typeof schema.deals.$inferInsert, type: "invoice" | "contract" | "upd" | "kp", status: "draft" | "sent" | "signed" | "paid", edo: "none" | "sent" | "delivered" | "signed", days: number) => {
    const number = type === "invoice" ? `СЧ-${y}-${String(++inv).padStart(4, "0")}` : type === "contract" ? `Д-${y}-${String(++ctr).padStart(4, "0")}` : type === "upd" ? `УПД-${y}-${String(++upd).padStart(4, "0")}` : `КП-${y}-${String(++kp).padStart(4, "0")}`;
    const c = companies.find((x) => x.id === d.companyId)!;
    const lines = items.filter((i) => i.dealId === d.id).map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price, discount: 0, vatRate: 20 }));
    const doc: typeof schema.documents.$inferInsert = { id: id("doc"), type, number, title: `${{ invoice: "Счёт", contract: "Договор", upd: "УПД", kp: "Коммерческое предложение" }[type]} ${number}`, dealId: d.id, companyId: d.companyId, amount: d.amount!, status, edoProvider: edo !== "none" ? "diadoc" : null, edoId: edo !== "none" ? `demo-${number}` : null, edoStatus: edo, sentAt: status !== "draft" ? daysAgo(days - 1) : null, payload: { seller, buyer: { name: c.name, inn: c.inn ?? "", kpp: c.kpp ?? undefined, address: c.legalAddress ?? "", director: c.director ?? "" }, lines, date: daysAgo(days) }, createdBy: d.managerId, createdAt: daysAgo(days) };
    docs.push(doc);
    return doc;
  };
  for (const d of wonDeals) {
    const days = Math.max(1, Math.round((Date.now() - new Date(d.createdAt!).getTime()) / 86400_000) - 2);
    mkDoc(d, "kp", "sent", "none", days + 1);
    mkDoc(d, "contract", "signed", "signed", days);
    const invoice = mkDoc(d, "invoice", "paid", "none", days - 1);
    mkDoc(d, "upd", "signed", rnd() > 0.3 ? "signed" : "delivered", Math.max(0, days - 4));
    pays.push({ id: id("pmt"), companyId: d.companyId, dealId: d.id, documentId: invoice.id, amount: d.amount!, direction: "in", method: rnd() > 0.4 ? "bank" : "sbp", purpose: `Оплата по счёту ${invoice.number}`, externalId: `bank-${invoice.number}`, syncedToFinance: rnd() > 0.3, paidAt: daysAgo(Math.max(0, days - 2)) });
  }
  for (const d of openSales) {
    const st = sSales.find((s) => s.id === d.stageId)!;
    if (st.order >= 2) mkDoc(d, "kp", "sent", "none", 3);
    if (st.order >= 3) mkDoc(d, "contract", "sent", "sent", 2);
    if (st.order >= 4) mkDoc(d, "invoice", "sent", "none", 1);
  }
  await db.insert(schema.documents).values(docs);
  await db.insert(schema.payments).values(pays);
  // балансы: оплаты минус отгруженные УПД (условно всё отгружено) → 0; у двух клиентов предоплата
  for (const c of companies) {
    const paid = pays.filter((p) => p.companyId === c.id).reduce((s, p) => s + p.amount, 0);
    const shipped = docs.filter((d) => d.companyId === c.id && d.type === "upd").reduce((s, d) => s + (d.amount ?? 0), 0);
    await db.update(schema.companies).set({ balance: Math.round((paid - shipped) * 100) / 100 }).where(sql`id = ${c.id}`);
  }
  await db.insert(schema.bankTransactions).values(pays.slice(0, 10).map((p) => ({ id: id("btx"), provider: "tochka", externalId: `stmt-${p.externalId}`, date: p.paidAt!, amount: p.amount, direction: "in" as const, counterpartyName: companies.find((c) => c.id === p.companyId)!.name, counterpartyInn: companies.find((c) => c.id === p.companyId)!.inn ?? "", purpose: p.purpose!, matchedCompanyId: p.companyId, matchedPaymentId: p.id, matchedDocumentId: p.documentId })));
  await db.insert(schema.paymentLinks).values(openSales.filter((d) => sSales.find((s) => s.id === d.stageId)!.order === 4).map((d) => ({ id: id("pay"), dealId: d.id, companyId: d.companyId, amount: d.amount!, purpose: `Оплата по сделке №${d.number}`, provider: "sandbox", url: `http://localhost:3000/pay/demo-${d.number}`, qrPayload: `https://qr.nspk.ru/DEMO${d.number}?type=02&sum=${Math.round(d.amount! * 100)}&cur=RUB`, status: "active" as const, expiresAt: inFuture(3) })));

  // ── задачи и активности
  const tasks: (typeof schema.tasks.$inferInsert)[] = [];
  openSales.forEach((d, i) => {
    tasks.push({ id: id("task"), title: d.nextStep ?? "Связаться с клиентом", assigneeId: d.managerId, creatorId: admin, dealId: d.id, companyId: d.companyId, dueAt: i % 3 === 0 ? daysAgo(1, 15) : inFuture(i % 4, 12), priority: i % 3 === 0 ? "high" : "normal", source: i % 2 ? "automation" : "manual", createdAt: daysAgo(2) });
  });
  tasks.push({ id: id("task"), title: "Подготовить отчёт по марже за октябрь", assigneeId: admin, creatorId: admin, dueAt: inFuture(1, 18), priority: "normal", source: "manual" });
  tasks.push({ id: id("task"), title: "Проверить разноску выписки за неделю", assigneeId: anna, creatorId: admin, dueAt: inFuture(0, 17), priority: "high", source: "automation" });
  tasks.push({ id: id("task"), title: "Запустить в работу заказ №3 (Питерский хлеб)", assigneeId: oleg, creatorId: admin, dueAt: inFuture(0, 14), priority: "high", source: "automation" });
  await db.insert(schema.tasks).values(tasks);
  const acts: (typeof schema.activities.$inferInsert)[] = [];
  for (const d of deals) {
    acts.push({ id: id("act"), type: "system", title: `Сделка создана из источника «${d.source}»`, dealId: d.id, companyId: d.companyId, userId: d.managerId, createdAt: d.createdAt });
    if (d.status === "won") acts.push({ id: id("act"), type: "payment", title: `Поступила оплата ${d.amount!.toLocaleString("ru-RU")} ₽`, body: "Разнесено автоматически по выписке", dealId: d.id, companyId: d.companyId, createdAt: d.closedAt! });
    if (rnd() > 0.5) acts.push({ id: id("act"), type: "call", title: "Исходящий звонок, 4 мин", body: "Обсудили сроки поставки и монтаж", dealId: d.id, companyId: d.companyId, userId: d.managerId, meta: { durationSec: 240 }, createdAt: daysAgo(Math.floor(rnd() * 10)) });
    if (rnd() > 0.6) acts.push({ id: id("act"), type: "note", title: "Заметка", body: pick(["Клиент просит монтаж в выходные", "Нужен счёт с НДС, оплата через 5 дней", "Сравнивают с предложением конкурента, ждём ответ до пятницы", "Решение принимает директор, встреча в четверг"]), dealId: d.id, companyId: d.companyId, userId: d.managerId, createdAt: daysAgo(Math.floor(rnd() * 8)) });
  }
  await db.insert(schema.activities).values(acts);

  // ── переписки
  const convs: (typeof schema.conversations.$inferInsert)[] = [];
  const msgs: (typeof schema.messages.$inferInsert)[] = [];
  const dialogs: [string, string][][] = [
    [["in", "Добрый день! Нужны кондиционеры в офис 120 м², 4 кабинета. Что посоветуете?"], ["out", "Здравствуйте! Для кабинетов по 25–30 м² подойдут Ballu BSAG-12 — 4 шт. с монтажом выйдет около 178 000 ₽. Могу прислать КП?"], ["in", "Да, присылайте. И сроки монтажа интересуют"], ["out", "КП отправила, монтаж — в течение 3 дней после оплаты. Счёт выставить сразу?"]],
    [["in", "Здравствуйте, по счёту СЧ-2025-0104 оплатили сегодня, проверьте пожалуйста"], ["out", "Добрый день! Вижу оплату, спасибо. Заказ передан на сборку, доставка в четверг до 14:00."]],
    [["in", "А можно по СБП оплатить? Так быстрее"], ["out", "Конечно. Ссылка на оплату по СБП: оплатить можно с телефона за минуту."], ["in", "Оплатил 👍"]],
    [["in", "Когда приедет бригада на монтаж?"], ["out", "Бригада Олега приедет завтра в 10:00, монтаж займёт около 4 часов. Доступ к фасаду нужен?"], ["in", "Да, предупрежу охрану"]],
    [["in", "Сколько стоит тепловая завеса на вход 2 метра?"]],
    [["in", "Здравствуйте! Хотим ТО на 6 кондиционеров, когда можете?"]],
  ];
  companies.slice(0, 6).forEach((c, i) => {
    const ch = (["telegram", "whatsapp", "telegram", "max", "whatsapp", "email"] as const)[i];
    const cnt = contacts[i];
    const conv: typeof schema.conversations.$inferInsert = { id: id("conv"), channel: ch, peerName: cnt.name, peerAddress: ch === "telegram" ? cnt.telegram ?? `${200000000 + i}` : ch === "whatsapp" ? cnt.whatsapp ?? "79160000000" : ch === "email" ? cnt.email ?? "" : cnt.max ?? "max_x", companyId: c.id, contactId: cnt.id, dealId: deals.find((d) => d.companyId === c.id)?.id ?? null, assigneeId: c.managerId, status: "open", aiEnabled: i >= 4, unread: dialogs[i].at(-1)?.[0] === "in" ? 1 : 0, lastMessageAt: daysAgo(0, 9 + i), createdAt: daysAgo(3) };
    convs.push(conv);
    dialogs[i].forEach(([dir, text], j) => msgs.push({ id: id("msg"), conversationId: conv.id!, direction: dir as "in" | "out", text, authorUserId: dir === "out" ? c.managerId : null, isAi: false, status: "delivered", createdAt: daysAgo(0, 8 + i + j * 0.2) }));
  });
  await db.insert(schema.conversations).values(convs);
  await db.insert(schema.messages).values(msgs);

  // ── звонки
  const calls: (typeof schema.calls.$inferInsert)[] = [];
  companies.slice(0, 8).forEach((c, i) => {
    const ai = i === 1 || i === 6;
    calls.push({ id: id("call"), direction: i % 2 ? "out" : "in", phone: contacts[i].phone!, contactId: contacts[i].id, companyId: c.id, dealId: deals.find((d) => d.companyId === c.id)?.id ?? null, userId: ai ? null : c.managerId, provider: "mango", status: ai ? "ai_handled" : i === 4 ? "missed" : "completed", durationSec: ai ? 95 : i === 4 ? 0 : 120 + i * 37, recordingUrl: null, aiHandled: ai, transcript: ai ? `ИИ: Здравствуйте! Компания Оборот, меня зовут Мария. Чем могу помочь?\n${contacts[i].name.split(" ")[1]}: Добрый день, нужен кондиционер в переговорную, 20 метров.\nИИ: Подойдёт Ballu BSAG-09 с монтажом — 38 490 ₽, монтаж через 3 дня. Как к вам обращаться и куда прислать расчёт?\n${contacts[i].name.split(" ")[1]}: В Telegram, пожалуйста.\nИИ: Отправим в течение часа. Спасибо за звонок!` : null, aiSummary: ai ? "Запрос: кондиционер в переговорную 20 м², расчёт в Telegram в течение часа." : null, startedAt: daysAgo(i % 3, 10 + i) });
  });
  await db.insert(schema.calls).values(calls);

  // ── календарь
  const btConsult = id("bkt"), btMeasure = id("bkt");
  await db.insert(schema.bookingTypes).values([
    { id: btConsult, slug: "consult", name: "Консультация по подбору оборудования", description: "30 минут онлайн: разберём помещение, подберём модели и посчитаем смету.", userId: ivan, durationMin: 30, bufferMin: 10, workDays: [1, 2, 3, 4, 5], workStart: "10:00", workEnd: "18:00", horizonDays: 14, location: "Онлайн (ссылка в подтверждении)" },
    { id: btMeasure, slug: "zamer", name: "Выезд инженера на замер", description: "Инженер приедет, измерит помещение и трассы, подготовит точное КП.", userId: maria, durationMin: 60, bufferMin: 30, workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "17:00", horizonDays: 21, location: "По адресу клиента" },
  ]);
  const bks: (typeof schema.bookings.$inferInsert)[] = [];
  [[0, 1, 11], [2, 1, 14], [5, 2, 12], [3, 3, 10], [8, 0, 16]].forEach(([ci, dd, hh], i) => {
    const s = new Date(); s.setDate(s.getDate() + dd); s.setHours(hh, 0, 0, 0);
    const e = new Date(s.getTime() + (i % 2 ? 60 : 30) * 60_000);
    bks.push({ id: id("bkg"), bookingTypeId: i % 2 ? btMeasure : btConsult, userId: i % 2 ? maria : ivan, title: i % 2 ? `Замер: ${companies[ci].shortName}` : `Консультация: ${companies[ci].shortName}`, startsAt: s.toISOString(), endsAt: e.toISOString(), clientName: contacts[ci].name, clientPhone: contacts[ci].phone, clientEmail: contacts[ci].email, companyId: companies[ci].id, dealId: deals.find((d) => d.companyId === companies[ci].id)?.id ?? null, source: i < 3 ? "public" : "manual", status: "confirmed" });
  });
  bks.push({ id: id("bkg"), userId: admin, title: "Планёрка отдела продаж", startsAt: inFuture(0, 9), endsAt: inFuture(0, 9.5), source: "manual", status: "confirmed" });
  await db.insert(schema.bookings).values(bks);

  // ── производство
  await db.insert(schema.productionOrders).values([0, 1, 2, 3, 4, 5].map((i) => ({ id: id("prd"), number: 1 + i, dealId: wonDeals[i + 6].id, companyId: wonDeals[i + 6].companyId, title: `${wonDeals[i + 6].title} — заказ №${i + 1}`, stageId: sProd[Math.min(3, i % 4)].id, assigneeId: oleg, qty: 1 + (i % 3), plannedAt: inFuture(2 + i * 2), startedAt: i % 4 >= 1 ? daysAgo(3 + i) : null, finishedAt: i % 4 === 3 ? daysAgo(1) : null, status: (["queued", "in_progress", "in_progress", "done"] as const)[i % 4], defects: i === 2 ? 1 : 0, notes: "Воздуховоды оцинкованные, фланцы 20 мм", createdAt: daysAgo(6 + i) })));

  // ── рассылки и маркетинг
  const camp1 = id("cmp");
  await db.insert(schema.campaigns).values([
    { id: camp1, name: "Осеннее ТО со скидкой 20%", channel: "telegram", body: "{{contact.firstName}}, здравствуйте! До 30 ноября сервисное обслуживание кондиционеров со скидкой 20%. Записаться: {{link.booking}}", segment: { status: ["client"] }, status: "sent", sentAt: daysAgo(6), stats: { total: 9, sent: 9, delivered: 9, opened: 7, clicked: 3, failed: 0 }, createdBy: admin, createdAt: daysAgo(7) },
    { id: id("cmp"), name: "Тепловые завесы к зиме", channel: "email", subject: "Успейте поставить завесы до холодов", body: "Здравствуйте, {{contact.firstName}}!\n\nТепловые завесы Тепломаш в наличии, монтаж за 1 день. Для клиентов — бесплатный выезд на замер.", segment: { tags: ["строительство", "розница", "horeca"] }, status: "draft", stats: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 }, createdBy: maria, createdAt: daysAgo(1) },
  ]);
  await db.insert(schema.campaignDeliveries).values(companies.filter((c) => c.status === "client").map((c, i) => ({ id: id("cdl"), campaignId: camp1, contactId: contacts[companies.indexOf(c)].id, companyId: c.id, address: contacts[companies.indexOf(c)].telegram ?? "tg", status: (i < 3 ? "clicked" : i < 7 ? "opened" : "delivered") as "clicked" | "opened" | "delivered", sentAt: daysAgo(6), openedAt: i < 7 ? daysAgo(6, 12) : null, clickedAt: i < 3 ? daysAgo(6, 13) : null })));
  const months = [0, 1, 2, 3, 4, 5].map((k) => { const d = new Date(); d.setMonth(d.getMonth() - k); return d.toISOString().slice(0, 7); });
  await db.insert(schema.marketingCosts).values(months.flatMap((m, k) => [
    { id: id("mc"), source: "Яндекс Директ", month: m, amount: 85000 + k * 4000, clicks: 2100 + k * 90, impressions: 94000, leads: 23 - k },
    { id: id("mc"), source: "VK Реклама", month: m, amount: 32000, clicks: 1400, impressions: 120000, leads: 8 },
    { id: id("mc"), source: "Авито", month: m, amount: 12000, clicks: 600, impressions: 30000, leads: 6 },
    { id: id("mc"), source: "Telegram-канал", month: m, amount: 20000, clicks: 400, impressions: 15000, leads: 5 },
  ]));
  await db.insert(schema.analyticsExports).values(wonDeals.slice(0, 8).map((d) => ({ id: id("ymx"), provider: "yandex_metrika", dealId: d.id, goal: "crm_sale", clientId: d.ymClientId, revenue: d.amount, status: "sandbox" as const, response: "Демо-режим: конверсия поставлена в очередь", createdAt: d.closedAt! })));

  // ── интеграции (весь каталог, Telegram-бот и ИИ включены в демо-режиме)
  await db.insert(schema.integrations).values(CATALOG.map((c) => ({ id: id("int"), kind: c.kind, provider: c.provider, name: c.name, config: {}, isEnabled: ["telegram_bot", "ai", "yandex_metrika", "dadata", "barcode", "diadoc", "tochka", "smsru", "onec", "mango", "telegram", "whatsapp", "smtp"].includes(c.provider) || c.kind === "telegram_bot", status: "sandbox" as const, lastSyncAt: c.kind === "finance" || c.kind === "bank" ? daysAgo(0, 8) : null })));
  await db.insert(schema.integrationEvents).values([
    { id: id("iev"), provider: "tochka", direction: "in", kind: "bank.statement", payload: { count: 4 }, status: "sandbox", createdAt: daysAgo(0, 8) },
    { id: id("iev"), provider: "yandex_metrika", direction: "out", kind: "analytics.conversion", payload: { goal: "crm_sale" }, status: "sandbox", createdAt: daysAgo(1) },
    { id: id("iev"), provider: "telegram", direction: "in", kind: "message.receive", payload: { from: "Петров Алексей" }, status: "ok", createdAt: daysAgo(0, 9) },
    { id: id("iev"), provider: "diadoc", direction: "out", kind: "edo.send", payload: { number: "УПД-2025-0071" }, status: "sandbox", createdAt: daysAgo(2) },
  ]);

  // ── автоматизации под 30 возможностей
  const A = (name: string, event: AutomationEvent, actions: AutomationAction[], conditions: AutomationCondition[] = [], description?: string, runs = 0) => ({ id: id("auto"), name, event, actions, conditions, description: description ?? null, isActive: true, runsCount: runs, lastRunAt: runs ? daysAgo(Math.floor(rnd() * 3)) : null, createdAt: daysAgo(30) });
  await db.insert(schema.automations).values([
    A("Новая заявка → приветствие в мессенджер и задача менеджеру", "lead.created", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, здравствуйте! Это {{company.name}}. Получили вашу заявку «{{deal.title}}», менеджер {{deal.manager}} свяжется в течение 15 минут." }, { type: "create_task", title: "Связаться с новым клиентом: {{client.name}}", assignee: "manager", dueInHours: 1 }, { type: "metrika_goal", goal: "lead" }], [], "Пункты 16, 19, 27", 41),
    A("Счёт выставлен → отправить клиенту со ссылкой на оплату по СБП", "invoice.created", [{ type: "send_invoice", channel: "preferred" }, { type: "send_payment_link", channel: "preferred" }, { type: "create_task", title: "Проверить оплату по счёту {{invoice.number}}", assignee: "manager", dueInHours: 72 }], [], "Пункты 10, 21", 37),
    A("Оплата поступила → поблагодарить, передать в отгрузку, синхронизировать с 1С, конверсия в Метрику", "payment.received", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, оплата {{payment.amount}} получена, спасибо! Заказ передан на сборку, пришлём трек-номер." }, { type: "handoff", pipelineKind: "shipping" }, { type: "sync_finance" }, { type: "metrika_goal", goal: "sale" }, { type: "move_stage", stageName: "Оплачено" }], [], "Пункты 12, 26, 27", 22),
    A("УПД сформирован → отправить в ЭДО", "upd.created", [{ type: "send_to_edo" }, { type: "notify_user", who: "manager", text: "УПД {{invoice.number}} по сделке «{{deal.title}}» отправлен в ЭДО" }], [], "Пункт 9", 22),
    A("Сделка > 150 000 ₽ без движения → SMS-напоминание и автозвонок", "deal.stage_changed", [{ type: "send_sms", template: "{{company.name}}: КП по «{{deal.title}}» действует до конца недели. Вопросы — {{company.phone}}" }, { type: "call_client", script: "Уточнить, получено ли КП, и предложить созвон с менеджером" }], [{ field: "deal.amount", op: "gt", value: 150000 }, { field: "toStage", op: "eq", value: "КП отправлено" }], "Пункты 17, 18", 9),
    A("Клиент записался в календарь → подтверждение и задача", "booking.created", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, вы записаны: {{booking.title}}, {{booking.date}} в {{booking.time}}. Если планы изменятся — напишите нам." }, { type: "create_task", title: "Подготовиться к встрече: {{booking.title}}", assignee: "manager", dueInHours: 24 }], [], "Пункт 30", 5),
    A("Входящее сообщение вне рабочего времени → ответ ИИ", "message.received", [{ type: "ai_reply" }], [], "Пункт 23", 14),
    A("Пропущенный звонок → перезвонить в течение 15 минут", "call.missed", [{ type: "create_task", title: "Перезвонить клиенту (пропущенный звонок)", assignee: "manager", dueInHours: 1 }, { type: "send_message", channel: "preferred", template: "Не смогли ответить на ваш звонок — перезвоним в ближайшие 15 минут. Или напишите здесь, что вас интересует." }], [], "Пункты 2, 19", 3),
    A("Сделка выиграна → выставить УПД и акт", "deal.won", [{ type: "notify_user", who: "manager", text: "Сделка «{{deal.title}}» закрыта на {{deal.amount}} — сформируйте УПД в карточке" }], [], "Пункт 8", 22),
    A("Отказ → письмо с опросом причины", "deal.lost", [{ type: "send_email", subject: "Жаль, что не сложилось", template: "{{contact.firstName}}, спасибо за время. Подскажите, что повлияло на решение? Ответ займёт минуту и поможет нам стать лучше." }], [], "Пункт 3", 7),
  ]);

  // ── настройки, счётчики, команды бота
  await db.insert(schema.settings).values([
    { key: "distribution", value: { mode: "round_robin", managerIds: managers, sourceRules: [{ source: "Выставка", managerId: denis }], skillRules: [{ tag: "вентиляция", managerIds: [ivan, denis] }], lastIndex: 0, notifyManager: true } },
    { key: "telegram", value: { enabled: true, webhookSecret: "", allowedUserIds: [], ownerChatId: "" } },
  ]);
  await db.insert(schema.counters).values([{ key: "deal", value: dealNo }, { key: "invoice", value: inv }, { key: "contract", value: ctr }, { key: "upd", value: upd }, { key: "kp", value: kp }, { key: "act", value: 12 }, { key: "production", value: 6 }, { key: "report", value: 3 }]);
  await db.insert(schema.telegramCommands).values([
    { id: id("tgc"), chatId: "demo", userId: ivan, text: "создай сделку Кондиционеры в офис для Кофейня №1 на 120 000", intent: "create_deal", result: "Сделка №1031 создана, этап «Новая заявка»", status: "ok", createdAt: daysAgo(1, 9) },
    { id: id("tgc"), chatId: "demo", userId: admin, text: "продажи за неделю", intent: "stats", result: "Выиграно 4 сделки на 612 300 ₽, в работе 14", status: "ok", createdAt: daysAgo(0, 8) },
    { id: id("tgc"), chatId: "demo", userId: maria, text: "поставь задачу на Дениса позвонить в Агроресурс завтра", intent: "create_task", result: "Задача «позвонить в Агроресурс» назначена Денису Волкову", status: "ok", createdAt: daysAgo(0, 10) },
  ]);
  await db.update(schema.users).set({ telegramChatId: "demo" }).where(sql`id = ${admin}`);
  console.log(`Готово: ${companies.length} клиентов, ${deals.length} сделок, ${docs.length} документов, ${pays.length} оплат`);
}

