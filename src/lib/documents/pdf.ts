import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const INK = rgb(0.086, 0.094, 0.114);
const MUTED = rgb(0.54, 0.57, 0.63);
const LINE = rgb(0.89, 0.9, 0.92);
const ACCENT = rgb(0.78, 0.06, 0.18);

/** Реквизиты стороны (Узбекистан): ИНН 9 цифр, ОКЭД, регистрационный номер, банк с МФО и р/с */
export type Party = { name: string; inn: string; oked?: string; regNumber?: string; address: string; bankName?: string; mfo?: string; account?: string; director?: string; directorPosition?: string; phone?: string; email?: string };
/** Ставка НДС по умолчанию (Узбекистан) */
export const DEFAULT_VAT = 12;
export type Line = { name: string; unit: string; qty: number; price: number; discount?: number; vatRate?: number };

export class Pdf {
  doc!: PDFDocument; page!: PDFPage; regular!: PDFFont; bold!: PDFFont; y = 0;
  readonly W = 595.28; readonly H = 841.89; readonly M = 48;
  static async create() {
    const p = new Pdf();
    p.doc = await PDFDocument.create();
    p.doc.registerFontkit(fontkit);
    p.regular = await p.doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Inter-Regular.otf")), { subset: true });
    p.bold = await p.doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Inter-SemiBold.otf")), { subset: true });
    p.newPage();
    return p;
  }
  newPage() { this.page = this.doc.addPage([this.W, this.H]); this.y = this.H - this.M; }
  ensure(h: number) { if (this.y - h < this.M + 30) this.newPage(); }
  text(s: string, o: { x?: number; size?: number; bold?: boolean; color?: RGB; maxWidth?: number; align?: "left" | "right" | "center"; lineHeight?: number } = {}) {
    const size = o.size ?? 10, font = o.bold ? this.bold : this.regular, lh = o.lineHeight ?? size * 1.4;
    const maxWidth = o.maxWidth ?? this.W - 2 * this.M - ((o.x ?? this.M) - this.M);
    const lines = this.wrap(s, font, size, maxWidth);
    for (const ln of lines) {
      this.ensure(lh);
      const w = font.widthOfTextAtSize(ln, size);
      let x = o.x ?? this.M;
      if (o.align === "right") x = (o.x ?? this.W - this.M) - w;
      if (o.align === "center") x = (o.x ?? this.W / 2) - w / 2;
      this.page.drawText(ln, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= lh;
    }
    return lines.length * lh;
  }
  /** текст в фиксированной позиции, не двигает курсор */
  at(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" } = {}) {
    const size = o.size ?? 10, font = o.bold ? this.bold : this.regular;
    const w = font.widthOfTextAtSize(s, size);
    this.page.drawText(s, { x: o.align === "right" ? x - w : x, y: y - size, size, font, color: o.color ?? INK });
  }
  wrap(s: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const out: string[] = [];
    for (const para of String(s ?? "").split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = "";
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) <= maxWidth || !cur) cur = t; else { out.push(cur); cur = w; }
      }
      out.push(cur);
    }
    return out;
  }
  gap(h = 8) { this.y -= h; }
  rule(color = LINE, thickness = 0.6) { this.ensure(6); this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness, color }); this.y -= 6; }
  heading(title: string, sub?: string) {
    this.text(title, { size: 18, bold: true });
    if (sub) this.text(sub, { size: 10, color: MUTED });
    this.gap(6);
  }
  kv(rows: [string, string][], o: { labelW?: number; size?: number } = {}) {
    const lw = o.labelW ?? 150, size = o.size ?? 9.5;
    for (const [k, v] of rows) {
      if (!v) continue;
      const lines = this.wrap(v, this.regular, size, this.W - 2 * this.M - lw);
      this.ensure(lines.length * size * 1.4);
      this.at(k, this.M, this.y, { size, color: MUTED });
      for (const ln of lines) { this.at(ln, this.M + lw, this.y, { size }); this.y -= size * 1.4; }
    }
  }
  /** Таблица с переносом страниц */
  table(cols: { title: string; w: number; align?: "left" | "right" }[], rows: string[][], o: { size?: number; zebra?: boolean } = {}) {
    const size = o.size ?? 9;
    const drawHead = () => {
      this.ensure(22);
      let x = this.M;
      this.page.drawRectangle({ x: this.M, y: this.y - 18, width: this.W - 2 * this.M, height: 18, color: rgb(0.965, 0.97, 0.976) });
      for (const c of cols) { this.at(c.title, c.align === "right" ? x + c.w - 6 : x + 6, this.y - 4, { size: 8.5, color: MUTED, align: c.align }); x += c.w; }
      this.y -= 18;
    };
    drawHead();
    rows.forEach((r, ri) => {
      const cellLines = r.map((cell, i) => this.wrap(cell, this.regular, size, cols[i].w - 12));
      const h = Math.max(...cellLines.map((l) => l.length)) * size * 1.35 + 8;
      if (this.y - h < this.M + 30) { this.newPage(); drawHead(); }
      if (o.zebra && ri % 2) this.page.drawRectangle({ x: this.M, y: this.y - h, width: this.W - 2 * this.M, height: h, color: rgb(0.985, 0.987, 0.99) });
      let x = this.M;
      cellLines.forEach((lines, i) => {
        let yy = this.y - 4;
        for (const ln of lines) { this.at(ln, cols[i].align === "right" ? x + cols[i].w - 6 : x + 6, yy, { size, align: cols[i].align }); yy -= size * 1.35; }
        x += cols[i].w;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.5, color: LINE });
    });
  }
  stamp(text: string) {
    const size = 12, w = this.bold.widthOfTextAtSize(text, size) + 16;
    const x = this.W - this.M - w, y = this.y - 4;
    this.page.drawRectangle({ x, y: y - 20, width: w, height: 22, borderColor: ACCENT, borderWidth: 1.2, rotate: { type: "degrees" as never, angle: -4 } as never });
    this.page.drawText(text, { x: x + 8, y: y - 15, size, font: this.bold, color: ACCENT, rotate: { type: "degrees" as never, angle: -4 } as never });
  }
  footer(s: string) {
    for (const pg of this.doc.getPages()) {
      const w = this.regular.widthOfTextAtSize(s, 8);
      pg.drawText(s, { x: this.W / 2 - w / 2, y: 24, size: 8, font: this.regular, color: MUTED });
    }
  }
  async bytes() { return Buffer.from(await this.doc.save()); }
}

export const money = (v: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " сум";
export const dateRu = (iso: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export function totals(lines: Line[]) {
  let sum = 0, vat = 0;
  for (const l of lines) {
    const s = l.qty * l.price * (1 - (l.discount ?? 0) / 100);
    sum += s;
    const rate = l.vatRate ?? DEFAULT_VAT;
    vat += rate ? s - s / (1 + rate / 100) : 0;
  }
  return { sum, vat, net: sum - vat };
}

export function amountInWords(n: number): string {
  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const onesF = ["", "одна", "две"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const forms = (k: number, f: [string, string, string]) => { const m10 = k % 10, m100 = k % 100; return m10 === 1 && m100 !== 11 ? f[0] : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? f[1] : f[2]; };
  const triad = (k: number, fem: boolean) => { const h = Math.floor(k / 100), t = Math.floor((k % 100) / 10), o = k % 10; let s = hundreds[h]; if (k % 100 < 20) s += (s ? " " : "") + (fem && o && o < 3 ? onesF[o] : ones[k % 100]); else s += (s ? " " : "") + tens[t] + (o ? " " + (fem && o < 3 ? onesF[o] : ones[o]) : ""); return s.trim(); };
  const sum = Math.floor(n), tiyin = Math.round((n - sum) * 100);
  const parts: string[] = [];
  const mlrd = Math.floor(sum / 1_000_000_000), mln = Math.floor((sum % 1_000_000_000) / 1_000_000), th = Math.floor((sum % 1_000_000) / 1000), rest = sum % 1000;
  if (mlrd) parts.push(triad(mlrd, false) + " " + forms(mlrd, ["миллиард", "миллиарда", "миллиардов"]));
  if (mln) parts.push(triad(mln, false) + " " + forms(mln, ["миллион", "миллиона", "миллионов"]));
  if (th) parts.push(triad(th, true) + " " + forms(th, ["тысяча", "тысячи", "тысяч"]));
  if (rest || !parts.length) parts.push(triad(rest, false));
  const s = parts.join(" ").trim() + " " + forms(sum, ["сум", "сума", "сумов"]) + ` ${String(tiyin).padStart(2, "0")} ${forms(tiyin, ["тийин", "тийина", "тийинов"])}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───────────────────────── Шаблоны документов ─────────────────────────

export async function renderInvoice(p: { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; dueDays?: number; paid?: boolean }) {
  const pdf = await Pdf.create();
  const t = totals(p.lines);
  pdf.text(`${p.seller.bankName ?? ""}  МФО ${p.seller.mfo ?? ""}`, { size: 9, color: MUTED });
  pdf.kv([["Банк получателя", p.seller.bankName ?? ""], ["МФО", p.seller.mfo ?? ""], ["Расчётный счёт", p.seller.account ?? ""], ["Получатель", `${p.seller.name}, ИНН ${p.seller.inn}${p.seller.oked ? `, ОКЭД ${p.seller.oked}` : ""}`]], { labelW: 120 });
  pdf.gap(10); pdf.rule(INK, 1.2); pdf.gap(4);
  pdf.heading(`Счёт на оплату № ${p.number} от ${dateRu(p.date)}`, p.dueDays ? `Оплатить до ${dateRu(new Date(new Date(p.date).getTime() + p.dueDays * 86400_000).toISOString())}` : undefined);
  if (p.paid) pdf.stamp("ОПЛАЧЕНО");
  pdf.kv([["Поставщик", `${p.seller.name}, ИНН ${p.seller.inn}${p.seller.oked ? `, ОКЭД ${p.seller.oked}` : ""}, ${p.seller.address}`], ["Покупатель", `${p.buyer.name}, ИНН ${p.buyer.inn}${p.buyer.oked ? `, ОКЭД ${p.buyer.oked}` : ""}, ${p.buyer.address}`]], { labelW: 90 });
  pdf.gap(10);
  pdf.table([{ title: "№", w: 28 }, { title: "Наименование", w: 203 }, { title: "Кол-во", w: 52, align: "right" }, { title: "Ед.", w: 36 }, { title: "Цена", w: 90, align: "right" }, { title: "Сумма", w: 90, align: "right" }],
    p.lines.map((l, i) => [String(i + 1), l.name, String(l.qty), l.unit, money(l.price), money(l.qty * l.price * (1 - (l.discount ?? 0) / 100))]), { zebra: true });
  pdf.gap(8);
  pdf.text(`Итого: ${money(t.sum)}`, { align: "right", bold: true, size: 11 });
  pdf.text(`В том числе НДС ${DEFAULT_VAT}%: ${money(t.vat)}`, { align: "right", size: 9.5, color: MUTED });
  pdf.gap(6);
  pdf.text(`Всего наименований ${p.lines.length}, на сумму ${money(t.sum)}`, { size: 9.5 });
  pdf.text(amountInWords(t.sum), { size: 9.5, bold: true });
  pdf.gap(28);
  pdf.text(`${p.seller.directorPosition ?? "Руководитель"} ______________ ${p.seller.director ?? ""}`, { size: 9.5 });
  pdf.gap(14);
  pdf.text(`Главный бухгалтер ______________`, { size: 9.5 });
  pdf.footer(`${p.seller.name} · ${p.seller.phone ?? ""} · ${p.seller.email ?? ""}`);
  return pdf.bytes();
}

export async function renderContract(p: { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; subject: string; deliveryDays?: number; signed?: boolean }) {
  const pdf = await Pdf.create();
  const t = totals(p.lines);
  pdf.heading(`Договор поставки № ${p.number}`, `г. Ташкент, ${dateRu(p.date)}`);
  if (p.signed) pdf.stamp("ПОДПИСАНО");
  pdf.text(`${p.seller.name}, именуемое в дальнейшем «Поставщик», в лице ${p.seller.directorPosition?.toLowerCase() ?? "руководителя"} ${p.seller.director ?? ""}, действующего на основании Устава, с одной стороны, и ${p.buyer.name}, именуемое в дальнейшем «Покупатель», в лице ${p.buyer.directorPosition?.toLowerCase() ?? "руководителя"} ${p.buyer.director ?? "уполномоченного представителя"}, действующего на основании Устава, с другой стороны, заключили настоящий Договор о нижеследующем.`, { size: 9.5 });
  const sections: [string, string][] = [
    ["1. Предмет договора", `1.1. Поставщик обязуется передать в собственность Покупателя, а Покупатель — принять и оплатить ${p.subject} (далее — Товар) в ассортименте, количестве и по ценам, указанным в Спецификации (Приложение № 1).\n1.2. Общая стоимость Товара составляет ${money(t.sum)}, в том числе НДС ${DEFAULT_VAT}% — ${money(t.vat)}. Все расчёты по Договору производятся в сумах Республики Узбекистан.`],
    ["2. Порядок поставки", `2.1. Срок поставки — ${p.deliveryDays ?? 7} рабочих дней с момента поступления оплаты.\n2.2. Поставка осуществляется силами Поставщика по адресу: ${p.buyer.address}.\n2.3. Право собственности и риски переходят к Покупателю с момента подписания электронной счёт-фактуры (ЭСФ) и товарно-транспортной накладной.`],
    ["3. Порядок расчётов", `3.1. Покупатель оплачивает Товар в размере 100% на основании счёта в течение 5 банковских дней.\n3.2. Оплата производится перечислением на расчётный счёт Поставщика или через платёжные сервисы Payme / Click по ссылке Поставщика.`],
    ["4. Гарантия и ответственность", `4.1. Гарантийный срок на Товар — 36 месяцев с даты поставки.\n4.2. За просрочку поставки Поставщик уплачивает пени 0,1% от стоимости непоставленного Товара за каждый день, но не более 10%.\n4.3. Стороны освобождаются от ответственности при наступлении обстоятельств непреодолимой силы.`],
    ["5. Электронный документооборот", `5.1. Стороны признают юридическую силу документов, подписанных электронной цифровой подписью и переданных через оператора ЭДО (Didox, Faktura.uz).`],
    ["6. Прочие условия", `6.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств.\n6.2. Споры разрешаются в Ташкентском межрайонном экономическом суде.`],
  ];
  for (const [h, body] of sections) { pdf.gap(6); pdf.text(h, { bold: true, size: 10.5 }); pdf.text(body, { size: 9.5 }); }
  pdf.gap(10); pdf.text("Приложение № 1. Спецификация", { bold: true, size: 10.5 }); pdf.gap(4);
  pdf.table([{ title: "№", w: 28 }, { title: "Наименование", w: 233 }, { title: "Кол-во", w: 52, align: "right" }, { title: "Цена", w: 93, align: "right" }, { title: "Сумма", w: 93, align: "right" }], p.lines.map((l, i) => [String(i + 1), l.name, `${l.qty} ${l.unit}`, money(l.price), money(l.qty * l.price * (1 - (l.discount ?? 0) / 100))]), { zebra: true });
  pdf.gap(14); pdf.text("7. Реквизиты и подписи сторон", { bold: true, size: 10.5 }); pdf.gap(4);
  const half = (pdf.W - 2 * pdf.M) / 2 - 10;
  const y0 = pdf.y;
  const party = (x: number, title: string, pt: Party) => {
    pdf.y = y0;
    pdf.text(title, { x, bold: true, size: 9.5, maxWidth: half });
    pdf.text(`${pt.name}\nИНН ${pt.inn}${pt.oked ? ` ОКЭД ${pt.oked}` : ""}${pt.regNumber ? `\nРег. № ${pt.regNumber}` : ""}\n${pt.address}\n${pt.bankName ? `${pt.bankName}, МФО ${pt.mfo ?? ""}\nр/с ${pt.account ?? ""}` : ""}`, { x, size: 8.5, maxWidth: half });
    pdf.gap(18);
    pdf.text(`__________________ ${pt.director ?? ""}`, { x, size: 9, maxWidth: half });
    return pdf.y;
  };
  const yA = party(pdf.M, "Поставщик", p.seller);
  const yB = party(pdf.M + half + 20, "Покупатель", p.buyer);
  pdf.y = Math.min(yA, yB);
  pdf.footer(`Договор № ${p.number} · ${p.seller.name}`);
  return pdf.bytes();
}

export async function renderUpd(p: { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; contractNumber?: string; signed?: boolean }) {
  const pdf = await Pdf.create();
  const t = totals(p.lines);
  pdf.text("Электронная счёт-фактура (ЭСФ) · к договору поставки / акту выполненных работ", { size: 8.5, color: MUTED });
  pdf.heading(`Счёт-фактура № ${p.number} от ${dateRu(p.date)}`, p.contractNumber ? `Основание: договор № ${p.contractNumber}` : undefined);
  if (p.signed) pdf.stamp("ПОДПИСАНО В ЭДО");
  pdf.kv([["Поставщик", `${p.seller.name}, ИНН ${p.seller.inn}${p.seller.oked ? `, ОКЭД ${p.seller.oked}` : ""}, ${p.seller.address}`], ["Банк поставщика", p.seller.bankName ? `${p.seller.bankName}, МФО ${p.seller.mfo ?? ""}, р/с ${p.seller.account ?? ""}` : ""], ["Покупатель", `${p.buyer.name}, ИНН ${p.buyer.inn}${p.buyer.oked ? `, ОКЭД ${p.buyer.oked}` : ""}, ${p.buyer.address}`], ["Банк покупателя", p.buyer.bankName ? `${p.buyer.bankName}, МФО ${p.buyer.mfo ?? ""}, р/с ${p.buyer.account ?? ""}` : ""], ["Валюта", "Узбекский сум, UZS (860)"]], { labelW: 110 });
  pdf.gap(10);
  pdf.table([{ title: "№", w: 24 }, { title: "Наименование товара (работ, услуг)", w: 155 }, { title: "Ед.", w: 34 }, { title: "Кол-во", w: 46, align: "right" }, { title: "Цена без НДС", w: 92, align: "right" }, { title: "Ставка", w: 44, align: "right" }, { title: "Сумма с НДС", w: 104, align: "right" }],
    p.lines.map((l, i) => { const rate = l.vatRate ?? DEFAULT_VAT; const s = l.qty * l.price * (1 - (l.discount ?? 0) / 100); return [String(i + 1), l.name, l.unit, String(l.qty), money(l.price / (1 + rate / 100)), rate ? `${rate}%` : "без НДС", money(s)]; }), { size: 8.5, zebra: true });
  pdf.gap(8);
  pdf.text(`Всего к оплате: ${money(t.sum)}`, { align: "right", bold: true, size: 11 });
  pdf.text(`в том числе НДС ${DEFAULT_VAT}%: ${money(t.vat)} · без НДС: ${money(t.net)}`, { align: "right", size: 9, color: MUTED });
  pdf.gap(6);
  pdf.text(amountInWords(t.sum), { size: 9.5, bold: true });
  pdf.gap(18);
  pdf.text(`Руководитель: ______________ ${p.seller.director ?? ""}`, { size: 9 });
  pdf.gap(10);
  pdf.text(`Главный бухгалтер: ______________`, { size: 9 });
  pdf.gap(10);
  pdf.text(`Товар получил / услуги принял (Покупатель): ______________ ${p.buyer.director ?? ""}`, { size: 9 });
  pdf.gap(10);
  pdf.text(`Дата получения: «____» ____________ ${new Date(p.date).getFullYear()} г.`, { size: 9, color: MUTED });
  pdf.footer(`ЭСФ № ${p.number} · сформирована в WS_CRM`);
  return pdf.bytes();
}

export async function renderAct(p: { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; signed?: boolean }) {
  const pdf = await Pdf.create();
  const t = totals(p.lines);
  pdf.heading(`Акт выполненных работ № ${p.number} от ${dateRu(p.date)}`);
  if (p.signed) pdf.stamp("ПОДПИСАНО");
  pdf.kv([["Исполнитель", `${p.seller.name}, ИНН ${p.seller.inn}`], ["Заказчик", `${p.buyer.name}, ИНН ${p.buyer.inn}`]], { labelW: 90 });
  pdf.gap(8);
  pdf.table([{ title: "№", w: 28 }, { title: "Работы / услуги", w: 243 }, { title: "Кол-во", w: 52, align: "right" }, { title: "Цена", w: 88, align: "right" }, { title: "Сумма", w: 88, align: "right" }], p.lines.map((l, i) => [String(i + 1), l.name, `${l.qty} ${l.unit}`, money(l.price), money(l.qty * l.price)]), { zebra: true });
  pdf.gap(8);
  pdf.text(`Итого: ${money(t.sum)}, в т.ч. НДС ${DEFAULT_VAT}% ${money(t.vat)}`, { align: "right", bold: true });
  pdf.gap(8);
  pdf.text("Вышеперечисленные работы выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам не имеет.", { size: 9.5 });
  pdf.gap(24);
  pdf.text(`Исполнитель ______________ ${p.seller.director ?? ""}          Заказчик ______________ ${p.buyer.director ?? ""}`, { size: 9 });
  pdf.footer(`${p.seller.name}`);
  return pdf.bytes();
}

export async function renderKp(p: { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; manager: string; managerPhone?: string; intro?: string; validDays?: number }) {
  const pdf = await Pdf.create();
  const t = totals(p.lines);
  pdf.text(p.seller.name, { size: 9, color: MUTED });
  pdf.heading(`Коммерческое предложение № ${p.number}`, `${dateRu(p.date)} · для ${p.buyer.name}`);
  pdf.text(p.intro ?? "Подготовили решение под вашу задачу. Цены включают доставку, монтаж и пусконаладку; гарантия — 3 года на оборудование и 2 года на работы.", { size: 10 });
  pdf.gap(10);
  pdf.table([{ title: "№", w: 28 }, { title: "Позиция", w: 233 }, { title: "Кол-во", w: 52, align: "right" }, { title: "Цена", w: 93, align: "right" }, { title: "Сумма", w: 93, align: "right" }], p.lines.map((l, i) => [String(i + 1), l.name, `${l.qty} ${l.unit}`, money(l.price), money(l.qty * l.price * (1 - (l.discount ?? 0) / 100))]), { zebra: true });
  pdf.gap(8);
  pdf.text(`Итого с НДС ${DEFAULT_VAT}%: ${money(t.sum)}`, { align: "right", bold: true, size: 12 });
  pdf.gap(12);
  pdf.text("Условия", { bold: true, size: 10.5 });
  pdf.text(`Срок поставки: по Ташкенту 1–2 дня, по регионам 3–5 дней. Оплата: 100% по счёту или через Payme / Click. Цены в сумах с НДС ${DEFAULT_VAT}%. Предложение действительно ${p.validDays ?? 14} дней.`, { size: 9.5 });
  pdf.gap(14);
  pdf.text(`Ваш менеджер: ${p.manager}${p.managerPhone ? `, ${p.managerPhone}` : ""}`, { size: 10, bold: true });
  pdf.footer(`${p.seller.name} · ${p.seller.phone ?? ""} · ${p.seller.email ?? ""}`);
  return pdf.bytes();
}

export async function renderClientReport(p: { title: string; period: string; seller: Party; buyer: Party; summary: string; stats: [string, string][]; deals: string[][]; payments: string[][]; documents: string[][] }) {
  const pdf = await Pdf.create();
  pdf.text(`${p.seller.name} · отчёт для клиента`, { size: 9, color: MUTED });
  pdf.heading(p.title, `${p.buyer.name} · ${p.period}`);
  if (p.summary) { pdf.text(p.summary, { size: 10 }); pdf.gap(8); }
  const colW = (pdf.W - 2 * pdf.M) / p.stats.length;
  const y0 = pdf.y;
  p.stats.forEach(([k, v], i) => { pdf.at(k, pdf.M + i * colW, y0, { size: 8.5, color: MUTED }); pdf.at(v, pdf.M + i * colW, y0 - 14, { size: 15, bold: true }); });
  pdf.y = y0 - 40; pdf.rule();
  pdf.gap(4); pdf.text("Заказы", { bold: true, size: 10.5 }); pdf.gap(4);
  pdf.table([{ title: "№", w: 50 }, { title: "Заказ", w: 229 }, { title: "Этап", w: 110 }, { title: "Сумма", w: 110, align: "right" }], p.deals, { zebra: true });
  pdf.gap(10); pdf.text("Оплаты", { bold: true, size: 10.5 }); pdf.gap(4);
  pdf.table([{ title: "Дата", w: 110 }, { title: "Назначение", w: 279 }, { title: "Сумма", w: 110, align: "right" }], p.payments, { zebra: true });
  pdf.gap(10); pdf.text("Документы", { bold: true, size: 10.5 }); pdf.gap(4);
  pdf.table([{ title: "Документ", w: 229 }, { title: "Дата", w: 90 }, { title: "Статус", w: 90 }, { title: "Сумма", w: 90, align: "right" }], p.documents, { zebra: true });
  pdf.footer(`${p.seller.name} · ${p.seller.phone ?? ""} · ${p.seller.email ?? ""}`);
  return pdf.bytes();
}
