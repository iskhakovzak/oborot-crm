/* eslint-disable no-console */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, schema } from "./index";
import { adminPermissions, managerPermissions, productionPermissions, accountantPermissions } from "@/lib/permissions";
import { CATALOG } from "@/lib/integrations/registry";
import { fmtMoney, tzDate } from "@/lib/format";
import type { AutomationAction, AutomationEvent, AutomationCondition } from "./schema";

let seedState = 42;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const id = (p: string) => `${p}_${Math.floor(rnd() * 1e12).toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;
// время задаём по Ташкенту (UTC+5), чтобы в интерфейсе встречи и сообщения были в рабочие часы
const daysAgo = (d: number, h = 10) => { let t = tzDate(new Date(Date.now() - d * 86400_000), Math.floor(h), Math.floor((h % 1) * 60) + Math.floor(rnd() * 20)); if (t.getTime() > Date.now()) t = new Date(t.getTime() - 86400_000); return t.toISOString(); };
const inFuture = (d: number, h = 11) => tzDate(new Date(Date.now() + d * 86400_000), Math.floor(h), Math.round((h % 1) * 60)).toISOString();

/** ИНН юрлица Узбекистана: 9 цифр, начинается с 2 или 3 (контрольной суммы в открытом доступе нет) */
function makeInn(seed: number) {
  return String(300000000 + ((seed * 7919) % 9999999) * 7 + 123).slice(0, 9).padEnd(9, "0");
}
/** расчётный счёт: 20 цифр, балансовый счёт 20208 (расчётные счета юрлиц в сумах) */
const makeAccount = () => `20208000${String(100000000000 + Math.floor(rnd() * 899999999999))}`;
/** Ставка НДС в Узбекистане */
const VAT = 12;

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
  const admin = id("usr");
  await db.insert(schema.users).values([
    { id: admin, name: "Закир Исхаков", email: "ishakovzakir0@gmail.com", telegramUsername: "ws_zr", phone: "+998 90 100-00-01", passwordHash: await bcrypt.hash("admin123", 10), roleId: roleAdmin, color: "#18181b", teamId: "sales", acceptsLeads: true, skills: ["кондиционеры", "вентиляция", "проекты"] },
  ]);
  const jasur = admin, nigora = admin, bobur = admin, sherzod = admin, dilnoza = admin;
  const managers = [admin];

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

  // ── клиенты: Ташкент и регионы
  const companyDefs: [string, string, string, string, string, string, string, string][] = [
    // название, ИНН, ОКЭД, отрасль, источник, статус, адрес, домен
    ["ООО «Toshkent Qurilish»", "304561234", "41200", "Строительство", "Яндекс Директ", "client", "100100, г. Ташкент, Чиланзарский район, ул. Бунёдкор, 12", "tqurilish"],
    ["ООО «Samarqand Non»", "203345678", "10710", "Пищевое производство", "Рекомендация", "client", "140100, г. Самарканд, ул. Регистан, 8", "samarqandnon"],
    ["ООО «Buxoro Logistics»", makeInn(3), "49410", "Логистика", "Сайт", "client", "200100, г. Бухара, ул. Бахауддина Накшбанди, 14", "buxlog"],
    ["ЯТТ Рахимова Д.А.", "", "47190", "Розница", "Instagram", "lead", "100047, г. Ташкент, Яшнабадский район, ул. Паркент, 55", "rahimova"],
    ["ООО «Andijon Agro»", makeInn(5), "01110", "Сельское хозяйство", "Google Ads", "client", "170100, г. Андижан, ул. Бабура, 17", "andijonagro"],
    ["АО «Navoiy Energo»", makeInn(6), "35110", "Энергетика", "Холодный звонок", "client", "210100, г. Навои, ул. Галаба, 3", "navoiyenergo"],
    ["ООО «Chayxona №1»", makeInn(7), "56100", "HoReCa", "OLX", "lead", "100015, г. Ташкент, Мирабадский район, ул. Ойбека, 24", "chayxona1"],
    ["ООО «Fergana Textile»", makeInn(8), "13200", "Текстиль", "Сайт", "client", "150100, г. Фергана, ул. Мустакиллик, 31", "ferganatextile"],
    ["ООО «Tashkent City Mall»", "301234567", "68200", "Девелопмент", "Выставка", "lead", "100027, г. Ташкент, Шайхантахурский район, ул. Ислама Каримова, 1", "tcmall"],
    ["ООО «Savdo Plus»", makeInn(10), "46900", "Опт", "Telegram", "client", "100052, г. Ташкент, Мирзо-Улугбекский район, ул. Мустакиллик, 59А", "savdoplus"],
    ["ООО «Shifo Med Markaz»", makeInn(11), "86100", "Медицина", "Яндекс Директ", "lead", "100070, г. Ташкент, Яккасарайский район, ул. Бабура, 45", "shifomed"],
    ["ООО «Qurilish Komplekt»", makeInn(12), "46730", "Строительство", "Рекомендация", "client", "100170, г. Ташкент, Сергелийский район, ул. Янги Сергели, 7", "qkomplekt"],
    ["ООО «Fitness Line Tashkent»", makeInn(13), "93130", "Спорт", "Instagram", "lead", "100084, г. Ташкент, Юнусабадский район, ул. Амира Темура, 108", "fitline"],
    ["ООО «Sirdaryo Sklad»", makeInn(14), "52100", "Логистика", "Сайт", "client", "120100, г. Гулистан, ул. Навои, 9", "sirdaryosklad"],
  ];
  const banks: [string, string][] = [["АКБ «Капиталбанк»", "00974"], ["АКБ «Hamkorbank»", "00083"], ["АКБ «Ipoteka Bank»", "00937"], ["АО «Uzum Bank»", "01174"], ["АО «TBC Bank»", "01158"], ["Узнацбанк", "00451"]];
  const directors = ["Каримов Шерзод Бахтиёрович", "Рашидова Нигора Абдуллаевна", "Юсупов Жасур Шухратович", "Турсунова Малика Улугбековна", "Алиев Бобур Рустамович", "Мирзаева Гулнора Тахировна", "Назаров Алишер Камолович"];
  const companies = companyDefs.map(([name, inn, oked, industry, source, status, legalAddress, domain], i) => {
    const bank = banks[i % banks.length];
    return {
      id: id("cmp"), name, shortName: name.replace(/^(ООО|АО|ЯТТ)\s*/, "").replace(/[«»]/g, ""), inn: inn || null, oked, regNumber: inn ? String(1000 + ((i * 7331) % 90000)) : null,
      legalAddress, director: name.startsWith("ЯТТ") ? "Рахимова Дилафруз Акмаловна" : directors[i % directors.length], directorPosition: name.startsWith("ЯТТ") ? "Индивидуальный предприниматель" : "Директор",
      bankName: bank[0], mfo: bank[1], account: makeAccount(),
      email: `info@${domain}.uz`, phone: `+998 71 ${200 + i * 7}-${10 + i}-${20 + i * 3}`, industry, status: status as "lead" | "client", source,
      utm: source === "Яндекс Директ" ? { source: "yandex", medium: "cpc", campaign: "klimat_tashkent" } : source === "Google Ads" ? { source: "google", medium: "cpc", campaign: "konditsionery_uz" } : source === "Instagram" ? { source: "instagram", medium: "social", campaign: "summer_cool" } : null,
      managerId: managers[i % 3], balance: 0, tags: [industry.toLowerCase(), ...(i % 4 === 0 ? ["vip"] : [])], createdAt: daysAgo(90 - i * 5), updatedAt: daysAgo(2),
    };
  });
  await db.insert(schema.companies).values(companies);
  const firstNames = ["Алишер", "Дилноза", "Жасур", "Нигора", "Бобур", "Малика", "Шерзод", "Гулнора", "Сардор", "Зарина", "Улугбек", "Камила", "Фаррух", "Мадина"];
  const lastNames = ["Каримов", "Рашидова", "Юсупов", "Турсунова", "Алиев", "Мирзаева", "Назаров", "Исмоилова", "Хасанов", "Абдуллаева", "Тошматов", "Саидова", "Умаров", "Эргашева"];
  const patronymics = ["Бахтиёрович", "Фарходовна", "Шухратович", "Абдуллаевна"];
  const emailLocal = ["a.karimov", "d.rashidova", "j.yusupov", "n.tursunova", "b.aliev", "m.mirzaeva", "s.nazarov", "g.ismoilova", "s.hasanov", "z.abdullaeva", "u.toshmatov", "k.saidova", "f.umarov", "m.ergasheva"];
  const mobileCodes = ["90", "91", "93", "94", "97", "99"];
  const contacts = companies.map((c, i) => {
    const code = mobileCodes[i % mobileCodes.length];
    const local = String(1000000 + i * 73571).slice(0, 7);
    return { id: id("cnt"), companyId: c.id, name: `${lastNames[i]} ${firstNames[i]} ${patronymics[i % 4]}`, position: pick(["Директор", "Руководитель АХО", "Закупки", "Главный инженер", "Администратор"]), phone: `+998 ${code} ${local.slice(0, 3)}-${local.slice(3, 5)}-${local.slice(5)}`, email: `${emailLocal[i]}@${c.email.split("@")[1]}`, telegram: i % 4 !== 3 ? `${100000000 + i * 1234567}` : null, whatsapp: i % 2 ? `998${code}${local}` : null, instagram: i % 3 === 0 ? `${c.email.split("@")[1].split(".")[0]}_uz` : null, max: null, isPrimary: true };
  });
  await db.insert(schema.contacts).values(contacts);

  // ── товары (цены в сумах)
  const products = [
    ["BSAG-09", "4601234567890", "Кондиционер настенный Ballu BSAG-09HN8", "Кондиционеры", "Ballu", 4_350_000, 2_970_000, 24, 8.5],
    ["BSAG-12", "4601234567906", "Кондиционер настенный Ballu BSAG-12HN8", "Кондиционеры", "Ballu", 5_250_000, 3_615_000, 18, 9.1],
    ["ART-12", "4780000123456", "Кондиционер настенный Artel ART-12 Inverter", "Кондиционеры", "Artel", 4_900_000, 3_400_000, 12, 9],
    ["FTXB25", "4601234567913", "Сплит-система Daikin FTXB25C", "Кондиционеры", "Daikin", 9_450_000, 6_675_000, 7, 9.5],
    ["MSZ-LN", "4601234567920", "Сплит-система Mitsubishi Electric MSZ-LN25VG", "Кондиционеры", "Mitsubishi Electric", 17_700_000, 12_600_000, 4, 12],
    ["BHC-6", "4602345678901", "Тепловая завеса Ballu BHC-L06S03-S", "Тепловые завесы", "Ballu", 3_700_000, 2_535_000, 11, 14],
    ["BHC-9", "4602345678918", "Тепловая завеса Ballu BHC-L09S05-S", "Тепловые завесы", "Ballu", 5_550_000, 3_840_000, 6, 19],
    ["K200", "4603456789012", "Вентилятор канальный Systemair K 200 M", "Вентиляция", "Systemair", 2_850_000, 1_860_000, 15, 4.2],
    ["BRZ-1000", "4604567890123", "Приточная установка Breezart 1000 Lux", "Вентиляция", "Breezart", 28_350_000, 19_650_000, 2, 48],
    ["TUBE-14", "4605678901234", "Медная труба 1/4″ × 15 м", "Расходные материалы", "Halcor", 630_000, 435_000, 60, 2.1],
    ["TUBE-38", "4605678901241", "Медная труба 3/8″ × 15 м", "Расходные материалы", "Halcor", 915_000, 645_000, 44, 3],
    ["MNT-35", "4606789012345", "Монтаж сплит-системы до 3,5 кВт", "Услуги", "WS", 1_400_000, 600_000, 0, 0],
    ["MNT-VENT", "4606789012352", "Монтаж приточной установки", "Услуги", "WS", 6_750_000, 3_300_000, 0, 0],
    ["SRV-TO", "4606789012369", "Сервисное обслуживание (ТО), 1 выезд", "Услуги", "WS", 675_000, 270_000, 0, 0],
    ["PRJ-VENT", "4606789012376", "Проект вентиляции, до 500 м²", "Услуги", "WS", 9_750_000, 4_500_000, 0, 0],
  ].map(([sku, barcode, name, category, brand, price, cost, stock, w]) => ({ id: id("prd"), sku: String(sku), barcode: String(barcode), name: String(name), category: String(category), brand: String(brand), unit: category === "Услуги" ? "усл" : category === "Расходные материалы" ? "бухта" : "шт", price: Number(price), cost: Number(cost), stock: Number(stock), weightKg: Number(w) || null, vatRate: VAT, description: `${name}. Доставка по Ташкенту 1–2 дня, по регионам 3–5 дней, гарантия 3 года.`, attributes: { "Гарантия": "3 года" } }));
  await db.insert(schema.products).values(products);
  const MNT = 11; // индекс услуги «Монтаж сплит-системы»

  // ── сделки
  let dealNo = 1000;
  const sources = ["Telegram", "Instagram", "Google Ads", "Яндекс Директ", "OLX", "Рекомендация", "Сайт", "Выставка", "Холодный звонок"];
  const dealTitles = ["Кондиционеры в офис", "Вентиляция склада", "Тепловые завесы на входную группу", "Сплит-системы в переговорные", "Приточная установка для цеха", "ТО климатического оборудования", "Проект и монтаж вентиляции", "Кондиционирование серверной", "Завесы для торгового зала", "Кондиционеры в чайхану"];
  const deals: (typeof schema.deals.$inferInsert)[] = [];
  const items: (typeof schema.dealItems.$inferInsert)[] = [];
  const addDeal = (opts: { companyIdx: number; stage: typeof sSales[number]; pipelineId: string; title?: string; days: number; status?: "open" | "won" | "lost"; prods?: [number, number][]; managerId?: string; parent?: string | null; lost?: string }) => {
    const c = companies[opts.companyIdx];
    const prods = opts.prods ?? [[Math.floor(rnd() * 9), 1 + Math.floor(rnd() * 4)], [MNT, 1 + Math.floor(rnd() * 3)]];
    const amount = prods.reduce((s, [pi, q]) => s + products[pi].price * q, 0);
    const d: typeof schema.deals.$inferInsert = { id: id("deal"), number: ++dealNo, title: opts.title ?? pick(dealTitles), companyId: c.id, contactId: contacts[opts.companyIdx].id, pipelineId: opts.pipelineId, stageId: opts.stage.id, amount, managerId: opts.managerId ?? c.managerId, status: opts.status ?? opts.stage.kind, lostReason: opts.lost ?? null, source: c.source ?? pick(sources), utm: c.utm ?? null, ymClientId: String(1600000000 + Math.floor(rnd() * 99999999)) + "." + String(100000 + Math.floor(rnd() * 899999)), nextStep: pick(["Позвонить и уточнить сроки", "Отправить КП", "Согласовать договор", "Дождаться оплаты", "Назначить замер", null]), expectedCloseAt: inFuture(3 + Math.floor(rnd() * 20)), closedAt: opts.status === "won" || opts.stage.kind !== "open" ? daysAgo(Math.max(0, opts.days - 5)) : null, parentDealId: opts.parent ?? null, stageEnteredAt: daysAgo(Math.floor(opts.days / 2)), createdAt: daysAgo(opts.days), updatedAt: daysAgo(Math.max(0, Math.floor(opts.days / 3))) };
    deals.push(d);
    for (const [pi, q] of prods) items.push({ id: id("itm"), dealId: d.id!, productId: products[pi].id, name: products[pi].name, unit: products[pi].unit, qty: q, price: products[pi].price, discount: 0, vatRate: VAT });
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
  const serviceDeals = [4, 5, 6].map((i) => addDeal({ companyIdx: i, stage: sService[i - 4], pipelineId: pService, title: `Монтаж: ${wonDeals[i].title}`, days: 2 + i, parent: wonDeals[i].id, prods: [[MNT, 2]] }));
  void shipDeals; void serviceDeals;
  await db.insert(schema.deals).values(deals);
  await db.insert(schema.dealItems).values(items);

  // ── документы и оплаты
  const docs: (typeof schema.documents.$inferInsert)[] = [];
  const pays: (typeof schema.payments.$inferInsert)[] = [];
  let inv = 100, ctr = 40, upd = 70, kp = 200;
  const openSales = deals.filter((d) => d.pipelineId === pSales && d.status === "open");
  const seller = { name: "ООО «WS Climate»", inn: "305123456", oked: "43220", regNumber: "1234567", address: "100015, г. Ташкент, Мирабадский район, ул. Шахрисабз, 16", bankName: "АКБ «Капиталбанк»", mfo: "00974", account: "20208000900123456001", director: "Каримов Алишер Бахтиёрович", directorPosition: "Директор" };
  const y = new Date().getFullYear();
  const mkDoc = (d: typeof schema.deals.$inferInsert, type: "invoice" | "contract" | "upd" | "kp", status: "draft" | "sent" | "signed" | "paid", edo: "none" | "sent" | "delivered" | "signed", days: number) => {
    const number = type === "invoice" ? `СЧ-${y}-${String(++inv).padStart(4, "0")}` : type === "contract" ? `Д-${y}-${String(++ctr).padStart(4, "0")}` : type === "upd" ? `ЭСФ-${y}-${String(++upd).padStart(4, "0")}` : `КП-${y}-${String(++kp).padStart(4, "0")}`;
    const c = companies.find((x) => x.id === d.companyId)!;
    const lines = items.filter((i) => i.dealId === d.id).map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price, discount: 0, vatRate: VAT }));
    const doc: typeof schema.documents.$inferInsert = { id: id("doc"), type, number, title: `${{ invoice: "Счёт", contract: "Договор", upd: "ЭСФ", kp: "Коммерческое предложение" }[type]} ${number}`, dealId: d.id, companyId: d.companyId, amount: d.amount!, status, edoProvider: edo !== "none" ? "didox" : null, edoId: edo !== "none" ? `demo-${number}` : null, edoStatus: edo, sentAt: status !== "draft" ? daysAgo(days - 1) : null, payload: { seller, buyer: { name: c.name, inn: c.inn ?? "", oked: c.oked ?? undefined, regNumber: c.regNumber ?? undefined, address: c.legalAddress ?? "", bankName: c.bankName, mfo: c.mfo, account: c.account, director: c.director ?? "", directorPosition: c.directorPosition }, lines, date: daysAgo(days) }, createdBy: d.managerId, createdAt: daysAgo(days) };
    docs.push(doc);
    return doc;
  };
  for (const d of wonDeals) {
    const days = Math.max(1, Math.round((Date.now() - new Date(d.createdAt!).getTime()) / 86400_000) - 2);
    mkDoc(d, "kp", "sent", "none", days + 1);
    mkDoc(d, "contract", "signed", "signed", days);
    const invoice = mkDoc(d, "invoice", "paid", "none", days - 1);
    mkDoc(d, "upd", "signed", rnd() > 0.3 ? "signed" : "delivered", Math.max(0, days - 4));
    const viaLink = rnd() > 0.6;
    pays.push({ id: id("pmt"), companyId: d.companyId, dealId: d.id, documentId: invoice.id, amount: d.amount!, direction: "in", method: viaLink ? "sbp" : "bank", purpose: viaLink ? `Оплата через ${rnd() > 0.5 ? "Payme" : "Click"} по счёту ${invoice.number}` : `Оплата по счёту ${invoice.number}`, externalId: `${viaLink ? "payme" : "bank"}-${invoice.number}`, syncedToFinance: rnd() > 0.3, paidAt: daysAgo(Math.max(0, days - 2)) });
  }
  for (const d of openSales) {
    const st = sSales.find((s) => s.id === d.stageId)!;
    if (st.order >= 2) mkDoc(d, "kp", "sent", "none", 3);
    if (st.order >= 3) mkDoc(d, "contract", "sent", "sent", 2);
    if (st.order >= 4) mkDoc(d, "invoice", "sent", "none", 1);
  }
  await db.insert(schema.documents).values(docs);
  await db.insert(schema.payments).values(pays);
  // балансы: оплаты минус отгруженные ЭСФ (условно всё отгружено) → 0; у двух клиентов предоплата
  for (const c of companies) {
    const paid = pays.filter((p) => p.companyId === c.id).reduce((s, p) => s + p.amount, 0);
    const shipped = docs.filter((d) => d.companyId === c.id && d.type === "upd").reduce((s, d) => s + (d.amount ?? 0), 0);
    await db.update(schema.companies).set({ balance: Math.round((paid - shipped) * 100) / 100 }).where(sql`id = ${c.id}`);
  }
  await db.insert(schema.bankTransactions).values(pays.filter((p) => p.method === "bank").slice(0, 10).map((p) => ({ id: id("btx"), provider: "kapitalbank", externalId: `stmt-${p.externalId}`, date: p.paidAt!, amount: p.amount, direction: "in" as const, counterpartyName: companies.find((c) => c.id === p.companyId)!.name, counterpartyInn: companies.find((c) => c.id === p.companyId)!.inn ?? "", purpose: `${p.purpose!}. В т.ч. НДС ${VAT}%`, matchedCompanyId: p.companyId, matchedPaymentId: p.id, matchedDocumentId: p.documentId })));
  await db.insert(schema.paymentLinks).values(openSales.filter((d) => sSales.find((s) => s.id === d.stageId)!.order === 4).map((d) => { const url = `http://localhost:3000/pay/demo-${d.number}`; return { id: id("pay"), dealId: d.id, companyId: d.companyId, amount: d.amount!, purpose: `Оплата по сделке №${d.number}`, provider: "sandbox", url, qrPayload: url, status: "active" as const, expiresAt: inFuture(3) }; }));

  // ── задачи и активности
  const tasks: (typeof schema.tasks.$inferInsert)[] = [];
  openSales.forEach((d, i) => {
    tasks.push({ id: id("task"), title: d.nextStep ?? "Связаться с клиентом", assigneeId: d.managerId, creatorId: admin, dealId: d.id, companyId: d.companyId, dueAt: i % 3 === 0 ? daysAgo(1, 15) : inFuture(i % 4, 12), priority: i % 3 === 0 ? "high" : "normal", source: i % 2 ? "automation" : "manual", createdAt: daysAgo(2) });
  });
  tasks.push({ id: id("task"), title: "Подготовить отчёт по марже за октябрь", assigneeId: admin, creatorId: admin, dueAt: inFuture(1, 18), priority: "normal", source: "manual" });
  tasks.push({ id: id("task"), title: "Проверить разноску выписки Капиталбанка за неделю", assigneeId: dilnoza, creatorId: admin, dueAt: inFuture(0, 17), priority: "high", source: "automation" });
  tasks.push({ id: id("task"), title: "Запустить в работу заказ №3 (Samarqand Non)", assigneeId: sherzod, creatorId: admin, dueAt: inFuture(0, 14), priority: "high", source: "automation" });
  await db.insert(schema.tasks).values(tasks);
  const acts: (typeof schema.activities.$inferInsert)[] = [];
  for (const d of deals) {
    acts.push({ id: id("act"), type: "system", title: `Сделка создана из источника «${d.source}»`, dealId: d.id, companyId: d.companyId, userId: d.managerId, createdAt: d.createdAt });
    if (d.status === "won") acts.push({ id: id("act"), type: "payment", title: `Поступила оплата ${fmtMoney(d.amount)}`, body: "Разнесено автоматически по выписке", dealId: d.id, companyId: d.companyId, createdAt: d.closedAt! });
    if (rnd() > 0.5) acts.push({ id: id("act"), type: "call", title: "Исходящий звонок, 4 мин", body: "Обсудили сроки поставки и монтаж", dealId: d.id, companyId: d.companyId, userId: d.managerId, meta: { durationSec: 240 }, createdAt: daysAgo(Math.floor(rnd() * 10)) });
    if (rnd() > 0.6) acts.push({ id: id("act"), type: "note", title: "Заметка", body: pick(["Клиент просит монтаж в выходные", "Нужен счёт с НДС, оплата через 5 дней", "Сравнивают с предложением конкурента, ждём ответ до пятницы", "Решение принимает директор, встреча в четверг", "Просят доставку в Самарканд — 3–5 дней"]), dealId: d.id, companyId: d.companyId, userId: d.managerId, createdAt: daysAgo(Math.floor(rnd() * 8)) });
  }
  await db.insert(schema.activities).values(acts);

  // ── переписки
  const convs: (typeof schema.conversations.$inferInsert)[] = [];
  const msgs: (typeof schema.messages.$inferInsert)[] = [];
  const dialogs: [string, string][][] = [
    [["in", "Добрый день! Нужны кондиционеры в офис 120 м², 4 кабинета. Что посоветуете?"], ["out", "Здравствуйте! Для кабинетов по 25–30 м² подойдут Ballu BSAG-12 — 4 шт. с монтажом выйдет около 26 600 000 сум. Могу прислать КП?"], ["in", "Да, присылайте. И сроки монтажа интересуют"], ["out", "КП отправила, доставка по Ташкенту 1–2 дня, монтаж — в течение 3 дней после оплаты. Счёт выставить сразу?"]],
    [["in", `Здравствуйте, по счёту СЧ-${y}-0104 оплатили сегодня, проверьте пожалуйста`], ["out", "Добрый день! Вижу оплату, спасибо. Заказ передан на сборку, доставка в Самарканд в четверг до 14:00."]],
    [["in", "А можно через Payme оплатить? Так быстрее"], ["out", "Конечно. Отправляю ссылку на оплату — Payme или Click, оплатить можно с телефона за минуту."], ["in", "Оплатил 👍"]],
    [["in", "Когда приедет бригада на монтаж?"], ["out", "Бригада Шерзода приедет завтра в 10:00, монтаж займёт около 4 часов. Доступ к фасаду нужен?"], ["in", "Да, предупрежу охрану"]],
    [["in", "Сколько стоит тепловая завеса на вход 2 метра?"]],
    [["in", "Здравствуйте! Хотим ТО на 6 кондиционеров в Бухаре, когда можете?"]],
  ];
  companies.slice(0, 6).forEach((c, i) => {
    const ch = (["telegram", "whatsapp", "telegram", "instagram", "whatsapp", "email"] as const)[i];
    const cnt = contacts[i];
    const conv: typeof schema.conversations.$inferInsert = { id: id("conv"), channel: ch, peerName: cnt.name, peerAddress: ch === "telegram" ? cnt.telegram ?? `${200000000 + i}` : ch === "whatsapp" ? cnt.whatsapp ?? "998900000000" : ch === "email" ? cnt.email ?? "" : cnt.instagram ?? `ig_${i}`, companyId: c.id, contactId: cnt.id, dealId: deals.find((d) => d.companyId === c.id)?.id ?? null, assigneeId: c.managerId, status: "open", aiEnabled: i >= 4, unread: dialogs[i].at(-1)?.[0] === "in" ? 1 : 0, lastMessageAt: daysAgo(0, 9 + i), createdAt: daysAgo(3) };
    convs.push(conv);
    dialogs[i].forEach(([dir, text], j) => msgs.push({ id: id("msg"), conversationId: conv.id!, direction: dir as "in" | "out", text, authorUserId: dir === "out" ? c.managerId : null, isAi: false, status: "delivered", createdAt: daysAgo(0, 8 + i + j * 0.2) }));
  });
  await db.insert(schema.conversations).values(convs);
  await db.insert(schema.messages).values(msgs);

  // ── звонки
  const calls: (typeof schema.calls.$inferInsert)[] = [];
  companies.slice(0, 8).forEach((c, i) => {
    const ai = i === 1 || i === 6;
    calls.push({ id: id("call"), direction: i % 2 ? "out" : "in", phone: contacts[i].phone!, contactId: contacts[i].id, companyId: c.id, dealId: deals.find((d) => d.companyId === c.id)?.id ?? null, userId: ai ? null : c.managerId, provider: "onlinepbx", status: ai ? "ai_handled" : i === 4 ? "missed" : "completed", durationSec: ai ? 95 : i === 4 ? 0 : 120 + i * 37, recordingUrl: null, aiHandled: ai, transcript: ai ? `ИИ: Здравствуйте! Компания WS, меня зовут Малика. Чем могу помочь?\n${contacts[i].name.split(" ")[1]}: Добрый день, нужен кондиционер в переговорную, 20 метров.\nИИ: Подойдёт Ballu BSAG-09 с монтажом — 5 750 000 сум, доставка по Ташкенту 1–2 дня, монтаж через 3 дня. Как к вам обращаться и куда прислать расчёт?\n${contacts[i].name.split(" ")[1]}: В Telegram, пожалуйста.\nИИ: Отправим в течение часа. Спасибо за звонок!` : null, aiSummary: ai ? "Запрос: кондиционер в переговорную 20 м², расчёт в Telegram в течение часа." : null, startedAt: daysAgo(i % 3, 10 + i) });
  });
  await db.insert(schema.calls).values(calls);

  // ── календарь
  const btConsult = id("bkt"), btMeasure = id("bkt");
  await db.insert(schema.bookingTypes).values([
    { id: btConsult, slug: "consult", name: "Консультация по подбору оборудования", description: "30 минут онлайн: разберём помещение, подберём модели и посчитаем смету.", userId: jasur, durationMin: 30, bufferMin: 10, workDays: [1, 2, 3, 4, 5], workStart: "10:00", workEnd: "18:00", horizonDays: 14, location: "Онлайн (ссылка в подтверждении)" },
    { id: btMeasure, slug: "zamer", name: "Выезд инженера на замер", description: "Инженер приедет по адресу в Ташкенте, измерит помещение и трассы, подготовит точное КП.", userId: nigora, durationMin: 60, bufferMin: 30, workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "17:00", horizonDays: 21, location: "По адресу клиента (Ташкент)" },
  ]);
  const bks: (typeof schema.bookings.$inferInsert)[] = [];
  [[0, 1, 11], [2, 1, 14], [5, 2, 12], [3, 3, 10], [8, 0, 16]].forEach(([ci, dd, hh], i) => {
    const s = tzDate(new Date(Date.now() + dd * 86400_000), hh, 0);
    const e = new Date(s.getTime() + (i % 2 ? 60 : 30) * 60_000);
    bks.push({ id: id("bkg"), bookingTypeId: i % 2 ? btMeasure : btConsult, userId: i % 2 ? nigora : jasur, title: i % 2 ? `Замер: ${companies[ci].shortName}` : `Консультация: ${companies[ci].shortName}`, startsAt: s.toISOString(), endsAt: e.toISOString(), clientName: contacts[ci].name, clientPhone: contacts[ci].phone, clientEmail: contacts[ci].email, companyId: companies[ci].id, dealId: deals.find((d) => d.companyId === companies[ci].id)?.id ?? null, source: i < 3 ? "public" : "manual", status: "confirmed" });
  });
  bks.push({ id: id("bkg"), userId: admin, title: "Планёрка отдела продаж", startsAt: inFuture(0, 9), endsAt: inFuture(0, 9.5), source: "manual", status: "confirmed" });
  await db.insert(schema.bookings).values(bks);

  // ── производство
  await db.insert(schema.productionOrders).values([0, 1, 2, 3, 4, 5].map((i) => ({ id: id("prd"), number: 1 + i, dealId: wonDeals[i + 6].id, companyId: wonDeals[i + 6].companyId, title: `${wonDeals[i + 6].title} — заказ №${i + 1}`, stageId: sProd[Math.min(3, i % 4)].id, assigneeId: sherzod, qty: 1 + (i % 3), plannedAt: inFuture(2 + i * 2), startedAt: i % 4 >= 1 ? daysAgo(3 + i) : null, finishedAt: i % 4 === 3 ? daysAgo(1) : null, status: (["queued", "in_progress", "in_progress", "done"] as const)[i % 4], defects: i === 2 ? 1 : 0, notes: "Воздуховоды оцинкованные, фланцы 20 мм. Цех в Сергели.", createdAt: daysAgo(6 + i) })));

  // ── рассылки и маркетинг
  const camp1 = id("cmp");
  await db.insert(schema.campaigns).values([
    { id: camp1, name: "Осеннее ТО со скидкой 20%", channel: "telegram", body: "{{contact.firstName}}, здравствуйте! До 30 ноября сервисное обслуживание кондиционеров со скидкой 20% по Ташкенту. Записаться: {{link.booking}}", segment: { status: ["client"] }, status: "sent", sentAt: daysAgo(6), stats: { total: 9, sent: 9, delivered: 9, opened: 7, clicked: 3, failed: 0 }, createdBy: admin, createdAt: daysAgo(7) },
    { id: id("cmp"), name: "Тепловые завесы к зиме", channel: "email", subject: "Успейте поставить завесы до холодов", body: "Здравствуйте, {{contact.firstName}}!\n\nТепловые завесы Ballu в наличии на складе в Ташкенте, монтаж за 1 день. Для клиентов — бесплатный выезд на замер.", segment: { tags: ["строительство", "розница", "horeca"] }, status: "draft", stats: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 }, createdBy: nigora, createdAt: daysAgo(1) },
    { id: id("cmp"), name: "Инверторные кондиционеры Artel — рассрочка", channel: "instagram", body: "{{contact.firstName}}, кондиционеры Artel с инвертором — в рассрочку через Uzum Nasiya без переплаты. Напишите нам в Direct!", segment: { source: ["Instagram"] }, status: "scheduled", scheduledAt: inFuture(2, 10), stats: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 }, createdBy: jasur, createdAt: daysAgo(0, 9) },
  ]);
  await db.insert(schema.campaignDeliveries).values(companies.filter((c) => c.status === "client").map((c, i) => ({ id: id("cdl"), campaignId: camp1, contactId: contacts[companies.indexOf(c)].id, companyId: c.id, address: contacts[companies.indexOf(c)].telegram ?? "tg", status: (i < 3 ? "clicked" : i < 7 ? "opened" : "delivered") as "clicked" | "opened" | "delivered", sentAt: daysAgo(6), openedAt: i < 7 ? daysAgo(6, 12) : null, clickedAt: i < 3 ? daysAgo(6, 13) : null })));
  const months = [0, 1, 2, 3, 4, 5].map((k) => { const d = new Date(); d.setMonth(d.getMonth() - k); return d.toISOString().slice(0, 7); });
  await db.insert(schema.marketingCosts).values(months.flatMap((m, k) => [
    { id: id("mc"), source: "Google Ads", month: m, amount: 12_750_000 + k * 600_000, clicks: 2100 + k * 90, impressions: 94000, leads: 23 - k },
    { id: id("mc"), source: "Яндекс Директ", month: m, amount: 6_000_000, clicks: 1100, impressions: 52000, leads: 9 },
    { id: id("mc"), source: "Instagram", month: m, amount: 4_800_000, clicks: 1400, impressions: 120000, leads: 8 },
    { id: id("mc"), source: "OLX", month: m, amount: 1_800_000, clicks: 600, impressions: 30000, leads: 6 },
    { id: id("mc"), source: "Telegram", month: m, amount: 3_000_000, clicks: 400, impressions: 15000, leads: 5 },
  ]));
  await db.insert(schema.analyticsExports).values(wonDeals.slice(0, 8).map((d) => ({ id: id("ymx"), provider: "yandex_metrika", dealId: d.id, goal: "crm_sale", clientId: d.ymClientId, revenue: d.amount, status: "sandbox" as const, response: "Демо-режим: конверсия поставлена в очередь", createdAt: d.closedAt! })));

  // ── интеграции (весь каталог, Telegram-бот и ИИ включены в демо-режиме)
  const enabledProviders = ["telegram_bot", "ai", "yandex_metrika", "soliq", "barcode", "didox", "kapitalbank", "eskiz", "onec", "onlinepbx", "telegram", "whatsapp", "instagram", "smtp", "payme"];
  await db.insert(schema.integrations).values(CATALOG.map((c) => ({ id: id("int"), kind: c.kind, provider: c.provider, name: c.name, config: {}, isEnabled: enabledProviders.includes(c.provider) || c.kind === "telegram_bot", status: "sandbox" as const, lastSyncAt: c.kind === "finance" || c.kind === "bank" ? daysAgo(0, 8) : null })));
  await db.insert(schema.integrationEvents).values([
    { id: id("iev"), provider: "kapitalbank", direction: "in", kind: "bank.statement", payload: { count: 4 }, status: "sandbox", createdAt: daysAgo(0, 8) },
    { id: id("iev"), provider: "yandex_metrika", direction: "out", kind: "analytics.conversion", payload: { goal: "crm_sale" }, status: "sandbox", createdAt: daysAgo(1) },
    { id: id("iev"), provider: "telegram", direction: "in", kind: "message.receive", payload: { from: "Каримов Алишер" }, status: "ok", createdAt: daysAgo(0, 9) },
    { id: id("iev"), provider: "payme", direction: "out", kind: "sbp.create", payload: { amount: 5_750_000, orderId: "demo" }, status: "sandbox", createdAt: daysAgo(0, 11) },
    { id: id("iev"), provider: "didox", direction: "out", kind: "edo.send", payload: { number: `ЭСФ-${y}-0071` }, status: "sandbox", createdAt: daysAgo(2) },
  ]);

  // ── автоматизации под 30 возможностей
  const A = (name: string, event: AutomationEvent, actions: AutomationAction[], conditions: AutomationCondition[] = [], description?: string, runs = 0) => ({ id: id("auto"), name, event, actions, conditions, description: description ?? null, isActive: true, runsCount: runs, lastRunAt: runs ? daysAgo(Math.floor(rnd() * 3)) : null, createdAt: daysAgo(30) });
  await db.insert(schema.automations).values([
    A("Новая заявка → приветствие в мессенджер и задача менеджеру", "lead.created", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, здравствуйте! Это {{company.name}}. Получили вашу заявку «{{deal.title}}», менеджер {{deal.manager}} свяжется в течение 15 минут." }, { type: "create_task", title: "Связаться с новым клиентом: {{client.name}}", assignee: "manager", dueInHours: 1 }, { type: "metrika_goal", goal: "lead" }], [], "Пункты 16, 19, 27", 41),
    A("Счёт выставлен → отправить клиенту со ссылкой на оплату Payme/Click", "invoice.created", [{ type: "send_invoice", channel: "preferred" }, { type: "send_payment_link", channel: "preferred" }, { type: "create_task", title: "Проверить оплату по счёту {{invoice.number}}", assignee: "manager", dueInHours: 72 }], [], "Пункты 10, 21", 37),
    A("Оплата поступила → поблагодарить, передать в отгрузку, синхронизировать с 1С, конверсия в аналитику", "payment.received", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, оплата {{payment.amount}} получена, спасибо! Заказ передан на сборку, доставка по Ташкенту 1–2 дня, по регионам 3–5." }, { type: "handoff", pipelineKind: "shipping" }, { type: "sync_finance" }, { type: "metrika_goal", goal: "sale" }, { type: "move_stage", stageName: "Оплачено" }], [], "Пункты 12, 26, 27", 22),
    A("ЭСФ сформирована → отправить в Didox", "upd.created", [{ type: "send_to_edo" }, { type: "notify_user", who: "manager", text: "ЭСФ {{invoice.number}} по сделке «{{deal.title}}» отправлена в Didox" }], [], "Пункт 9", 22),
    A("Сделка > 20 млн сум без движения → SMS-напоминание и автозвонок", "deal.stage_changed", [{ type: "send_sms", template: "{{company.name}}: КП по «{{deal.title}}» действует до конца недели. Вопросы — {{company.phone}}" }, { type: "call_client", script: "Уточнить, получено ли КП, и предложить созвон с менеджером" }], [{ field: "deal.amount", op: "gt", value: 20_000_000 }, { field: "toStage", op: "eq", value: "КП отправлено" }], "Пункты 17, 18", 9),
    A("Клиент записался в календарь → подтверждение и задача", "booking.created", [{ type: "send_message", channel: "preferred", template: "{{contact.firstName}}, вы записаны: {{booking.title}}, {{booking.date}} в {{booking.time}} (время Ташкента). Если планы изменятся — напишите нам." }, { type: "create_task", title: "Подготовиться к встрече: {{booking.title}}", assignee: "manager", dueInHours: 24 }], [], "Пункт 30", 5),
    A("Входящее сообщение вне рабочего времени → ответ ИИ", "message.received", [{ type: "ai_reply" }], [], "Пункт 23", 14),
    A("Пропущенный звонок → перезвонить в течение 15 минут", "call.missed", [{ type: "create_task", title: "Перезвонить клиенту (пропущенный звонок)", assignee: "manager", dueInHours: 1 }, { type: "send_message", channel: "preferred", template: "Не смогли ответить на ваш звонок — перезвоним в ближайшие 15 минут. Или напишите здесь, что вас интересует." }], [], "Пункты 2, 19", 3),
    A("Сделка выиграна → выставить ЭСФ и акт", "deal.won", [{ type: "notify_user", who: "manager", text: "Сделка «{{deal.title}}» закрыта на {{deal.amount}} — сформируйте ЭСФ в карточке" }], [], "Пункт 8", 22),
    A("Отказ → письмо с опросом причины", "deal.lost", [{ type: "send_email", subject: "Жаль, что не сложилось", template: "{{contact.firstName}}, спасибо за время. Подскажите, что повлияло на решение? Ответ займёт минуту и поможет нам стать лучше." }], [], "Пункт 3", 7),
  ]);

  // ── настройки, счётчики, команды бота
  await db.insert(schema.settings).values([
    { key: "distribution", value: { mode: "round_robin", managerIds: managers, sourceRules: [{ source: "Выставка", managerId: bobur }], skillRules: [{ tag: "вентиляция", managerIds: [jasur, bobur] }], lastIndex: 0, notifyManager: true } },
    { key: "telegram", value: { enabled: true, webhookSecret: "", allowedUserIds: [], ownerChatId: "" } },
  ]);
  await db.insert(schema.counters).values([{ key: "deal", value: dealNo }, { key: "invoice", value: inv }, { key: "contract", value: ctr }, { key: "upd", value: upd }, { key: "kp", value: kp }, { key: "act", value: 12 }, { key: "production", value: 6 }, { key: "report", value: 3 }]);
  await db.insert(schema.telegramCommands).values([
    { id: id("tgc"), chatId: "demo", userId: jasur, text: "создай сделку Кондиционеры в офис для Chayxona №1 на 18 млн", intent: "create_deal", result: "Сделка №1031 создана, этап «Новая заявка»", status: "ok", createdAt: daysAgo(1, 9) },
    { id: id("tgc"), chatId: "demo", userId: admin, text: "продажи за неделю", intent: "stats", result: "Выиграно 4 сделки на 91 845 000 сум, в работе 14", status: "ok", createdAt: daysAgo(0, 8) },
    { id: id("tgc"), chatId: "demo", userId: nigora, text: "поставь задачу на Бобура позвонить в Andijon Agro завтра", intent: "create_task", result: "Задача «позвонить в Andijon Agro» назначена Бобуру Алиеву", status: "ok", createdAt: daysAgo(0, 10) },
  ]);
  await db.update(schema.users).set({ telegramChatId: "demo" }).where(sql`id = ${admin}`);
  console.log(`Готово: ${companies.length} клиентов, ${deals.length} сделок, ${docs.length} документов, ${pays.length} оплат`);
}
