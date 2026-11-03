import { resolve, logEvent } from "./registry";

export type CompanyData = {
  name: string; shortName: string; inn: string; oked: string; regNumber: string; legalAddress: string; director: string; directorPosition: string; status: string; registeredAt?: string; source: "soliq" | "sandbox";
};

/** ИНН Узбекистана — 9 цифр (юрлица начинаются с 2 или 3, физлица/ЯТТ — с 4 или 5). Публичного алгоритма контрольной суммы нет, проверяем формат. */
export function validateInn(inn: string): boolean {
  return /^[2-5]\d{8}$/.test(inn);
}

/** Демонстрационный справочник: несколько известных узбекских компаний. ИНН и реквизиты — иллюстративные. */
const SANDBOX: Record<string, Omit<CompanyData, "source" | "inn">> = {
  "200963213": { name: "АО «Узбектелеком»", shortName: "Узбектелеком", oked: "61100", regNumber: "1001", legalAddress: "100047, г. Ташкент, Яшнабадский район, ул. Амира Темура, 24", director: "Жураев Санжар Хакимович", directorPosition: "Председатель правления", status: "Действует" },
  "207168108": { name: "АО «УзАвто Моторс»", shortName: "УзАвто Моторс", oked: "29100", regNumber: "2045", legalAddress: "150100, Андижанская обл., г. Асака, ул. Хумо, 81", director: "Нигматов Бобур Аскарович", directorPosition: "Генеральный директор", status: "Действует" },
  "302893856": { name: "ООО «Uzum Market»", shortName: "Uzum Market", oked: "47910", regNumber: "7841", legalAddress: "100052, г. Ташкент, Мирзо-Улугбекский район, ул. Мустакиллик, 59А", director: "Турсунов Жасур Алишерович", directorPosition: "Директор", status: "Действует" },
  "301234567": { name: "ООО «Tashkent City Mall»", shortName: "Tashkent City Mall", oked: "68200", regNumber: "9103", legalAddress: "100027, г. Ташкент, Шайхантахурский район, ул. Ислама Каримова, 1", director: "Каримов Шерзод Бахтиёрович", directorPosition: "Директор", status: "Действует" },
  "305123456": { name: "ООО «Oborot Climate»", shortName: "Oborot", oked: "43220", regNumber: "1234567", legalAddress: "100015, г. Ташкент, Мирабадский район, ул. Шахрисабз, 16", director: "Каримов Алишер Бахтиёрович", directorPosition: "Директор", status: "Действует" },
  "304561234": { name: "ООО «Toshkent Qurilish»", shortName: "Toshkent Qurilish", oked: "41200", regNumber: "5567", legalAddress: "100100, г. Ташкент, Чиланзарский район, ул. Бунёдкор, 12", director: "Алиев Бобур Рустамович", directorPosition: "Директор", status: "Действует" },
  "203345678": { name: "ООО «Samarqand Non»", shortName: "Samarqand Non", oked: "10710", regNumber: "3312", legalAddress: "140100, г. Самарканд, ул. Регистан, 8", director: "Рашидова Нигора Абдуллаевна", directorPosition: "Директор", status: "Действует" },
};

const WORDS1 = ["Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Navoiy", "Xorazm", "Qashqadaryo", "Surxon", "Sirdaryo"];
const WORDS2 = ["Qurilish", "Savdo", "Logistics", "Agro", "Energo", "Textile", "Invest", "Servis", "Trade", "Group"];
const CITIES = ["г. Ташкент, Яккасарайский район, ул. Бабура, 45", "г. Ташкент, Юнусабадский район, ул. Амира Темура, 108", "г. Самарканд, ул. Гагарина, 22", "г. Бухара, ул. Бахауддина Накшбанди, 14", "г. Фергана, ул. Мустакиллик, 31", "г. Наманган, ул. Навои, 9", "г. Андижан, ул. Бабура, 17"];
const NAMES = ["Каримов Алишер Бахтиёрович", "Рашидова Дилноза Фарходовна", "Юсупов Жасур Шухратович", "Турсунова Нигора Абдуллаевна", "Алиев Бобур Рустамович", "Мирзаева Малика Улугбековна", "Назаров Шерзод Камолович", "Исмоилова Гулнора Тахировна"];
const POSTCODES = ["100015", "100052", "100100", "140100", "200100", "150100", "160100"];

function sandboxFor(inn: string): CompanyData {
  const known = SANDBOX[inn];
  if (known) return { ...known, inn, source: "sandbox" };
  const h = inn.split("").reduce((s, c) => s * 31 + Number(c), 7) >>> 0;
  const isIp = inn[0] === "4" || inn[0] === "5"; // ЯТТ — индивидуальный предприниматель
  const person = NAMES[h % NAMES.length];
  const short = person.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ");
  const name = isIp ? `ЯТТ ${short}` : `ООО «${WORDS1[h % 10]} ${WORDS2[(h >> 4) % 10]}»`;
  return {
    name, shortName: isIp ? short : `${WORDS1[h % 10]} ${WORDS2[(h >> 4) % 10]}`, inn, oked: isIp ? "47190" : ["46900", "62010", "41200", "47910", "56100", "49410", "10710"][h % 7], regNumber: String(1000 + (h % 90000)),
    legalAddress: `${POSTCODES[(h >> 2) % POSTCODES.length]}, ${CITIES[(h >> 8) % CITIES.length]}`, director: NAMES[(h >> 3) % NAMES.length], directorPosition: isIp ? "Индивидуальный предприниматель" : "Директор", status: "Действует", source: "sandbox",
  };
}

/** Поиск по ИНН в реестре юрлиц. Публичного API у soliq.uz нет — при наличии ключа партнёрского доступа запрос уходит в API, иначе встроенный справочник + генератор. */
export async function lookupCompanyByInn(innRaw: string): Promise<CompanyData | null> {
  const inn = innRaw.replace(/\D/g, "");
  if (!validateInn(inn)) return null;
  const r = await resolve("company_data");
  if (r.live && r.config.token) {
    try {
      const res = await fetch(`https://api.soliq.uz/api/v1/registry/company?tin=${inn}`, { headers: { accept: "application/json", Authorization: `Bearer ${r.config.token}` } });
      const j = (await res.json().catch(() => ({}))) as { data?: { name?: string; shortName?: string; oked?: string; regNumber?: string; address?: string; director?: string; directorPosition?: string; status?: string; registeredAt?: string } };
      const d = j.data;
      if (res.ok && d?.name) {
        await logEvent({ kind: "company.lookup", provider: "soliq", direction: "out", payload: { inn, found: true }, integrationId: r.integrationId });
        return { name: d.name, shortName: d.shortName ?? d.name.replace(/^(ООО|АО|ЯТТ|ИП|MChJ|AJ)\s*/i, "").replace(/[«»"]/g, ""), inn, oked: d.oked ?? "", regNumber: d.regNumber ?? "", legalAddress: d.address ?? "", director: d.director ?? "", directorPosition: d.directorPosition ?? "Директор", status: d.status ?? "Действует", registeredAt: d.registeredAt, source: "soliq" };
      }
      await logEvent({ kind: "company.lookup", provider: "soliq", direction: "out", payload: { inn, found: false, status: res.status }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
      if (res.ok) return null;
    } catch (e) {
      await logEvent({ kind: "company.lookup", provider: "soliq", direction: "out", payload: { inn, error: String(e) }, status: "error", integrationId: r.integrationId });
    }
  }
  await logEvent({ kind: "company.lookup", provider: "soliq", direction: "out", payload: { inn }, status: "sandbox", integrationId: r.integrationId });
  return sandboxFor(inn);
}

/** Справочник банков по МФО — демонстрационный: коды взяты из открытых источников, сверяйте с реквизитами банка. */
export const BANKS: Record<string, { name: string }> = {
  "00974": { name: "АКБ «Капиталбанк»" },
  "00083": { name: "АКБ «Hamkorbank»" },
  "00937": { name: "АКБ «Ipoteka Bank»" },
  "01174": { name: "АО «Uzum Bank»" },
  "01158": { name: "АО «TBC Bank»" },
  "00451": { name: "АО «Национальный банк ВЭД РУз» (Узнацбанк)" },
  "00873": { name: "АКБ «Асака»" },
  "00444": { name: "АКБ «Ipak Yo'li»" },
  "00394": { name: "АКБ «Агробанк»" },
  "00401": { name: "АКБ «Алокабанк»" },
  "00037": { name: "АКБ «Xalq Banki»" },
  "00491": { name: "ЧАКБ «Трастбанк»" },
};
/** Банк по МФО (5 цифр) */
export async function lookupBankByMfo(mfoRaw: string) {
  const mfo = mfoRaw.replace(/\D/g, "").padStart(5, "0");
  const b = BANKS[mfo];
  return b ? { bankName: b.name, mfo } : null;
}
