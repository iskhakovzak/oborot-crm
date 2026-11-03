/** Часовой пояс компании: все даты показываем по Ташкенту */
export const TZ = "Asia/Tashkent";
/** Код и подпись валюты: узбекский сум (UZS) */
export const CURRENCY = "UZS";
export const CURRENCY_LABEL = "сум";
/** Смещение Ташкента: UTC+5, без перехода на летнее время */
export const TZ_OFFSET_MIN = 300;
const shifted = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
/** Момент времени «h:m:s по Ташкенту» в тот же ташкентский календарный день, что и base */
export function tzDate(base: Date, h = 0, m = 0, s = 0): Date {
  const l = shifted(base);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), h, m, s) - TZ_OFFSET_MIN * 60_000);
}
/** Начало ташкентского дня */
export const startOfDayTz = (d: Date) => tzDate(d, 0, 0, 0);
/** День недели по Ташкенту (0 — воскресенье) */
export const tzDay = (d: Date) => shifted(d).getUTCDay();
/** Календарная дата по Ташкенту, YYYY-MM-DD */
export const tzDateStr = (d: Date) => shifted(d).toISOString().slice(0, 10);

// Сум форматируем вручную: Intl для UZS даёт «UZS 1 250 000,00», а в интерфейсе нужно «1 250 000 сум»
const int = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

/** «1 250 000 сум» — без тийинов, разделитель разрядов — пробел */
export const fmtMoney = (v: number | null | undefined) => `${int.format(v ?? 0)} ${CURRENCY_LABEL}`;
/** «1 250 000,00 сум» — с тийинами, для документов и бухгалтерии */
export const fmtMoneyFull = (v: number | null | undefined) => `${two.format(v ?? 0)} ${CURRENCY_LABEL}`;
export const fmtNum = (v: number | null | undefined) => num.format(v ?? 0);
export const fmtCompact = (v: number | null | undefined) => compact.format(v ?? 0);
/** «1,3 млн сум» — компактно, для графиков и плиток */
export const fmtMoneyCompact = (v: number | null | undefined) => `${compact.format(v ?? 0)} ${CURRENCY_LABEL}`;
/** Порог, с которого в узких местах показываем компактную сумму */
export const COMPACT_FROM = 1_000_000;
/**
 * Для узких мест (плитки, карточки канбана, бейджи, узкие колонки, строки рабочего стола):
 * от 1 млн — «17,3 млн сум», меньше — полная «850 000 сум». Полную сумму кладите в title.
 */
export const fmtMoneyShort = (v: number | null | undefined) => (Math.abs(v ?? 0) >= COMPACT_FROM ? fmtMoneyCompact(v) : fmtMoney(v));
export const fmtPct = (v: number | null | undefined, digits = 0) => `${(v ?? 0).toFixed(digits)}%`;

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, ...opts }).format(new Date(iso));
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDateLong(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
export function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });
  if (Math.abs(diff) < 60) return rtf.format(-Math.round(diff), "second");
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return fmtDate(iso);
}
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
/** Узбекский номер: +998 90 123-45-67 (12 цифр, код 998). Для остальных — общий вид +X XXX XXX-XX-XX или как есть. */
export function phoneFmt(p: string | null | undefined) {
  if (!p) return "—";
  let d = p.replace(/\D/g, "");
  if (d.length === 9) d = "998" + d; // ввели без кода страны: 901234567
  if (d.length === 12 && d.startsWith("998")) return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8, 10)}-${d.slice(10)}`;
  if (d.length === 11) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return p;
}
