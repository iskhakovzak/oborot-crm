import { resolve, logEvent } from "./registry";

export type CompanyData = {
  name: string; shortName: string; inn: string; kpp: string; ogrn: string; okved: string; legalAddress: string; director: string; directorPosition: string; status: string; registeredAt?: string; source: "dadata" | "sandbox";
};

/** Проверка контрольных сумм ИНН (10 или 12 цифр) */
export function validateInn(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const d = inn.split("").map(Number);
  const check = (coef: number[]) => (coef.reduce((s, c, i) => s + c * d[i], 0) % 11) % 10;
  if (d.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
}

const SANDBOX: Record<string, Omit<CompanyData, "source" | "inn">> = {
  "7707083893": { name: "ПАО «СБЕРБАНК»", shortName: "Сбербанк", kpp: "773601001", ogrn: "1027700132195", okved: "64.19", legalAddress: "117312, г. Москва, ул. Вавилова, д. 19", director: "Греф Герман Оскарович", directorPosition: "Президент, Председатель Правления", status: "Действует" },
  "7736050003": { name: "ПАО «ГАЗПРОМ»", shortName: "Газпром", kpp: "997250001", ogrn: "1027700070518", okved: "46.71", legalAddress: "197229, г. Санкт-Петербург, Лахтинский пр-т, д. 2, к. 3, стр. 1", director: "Миллер Алексей Борисович", directorPosition: "Председатель Правления", status: "Действует" },
  "7704340310": { name: "ООО «ЯНДЕКС.ТАКСИ»", shortName: "Яндекс.Такси", kpp: "770401001", ogrn: "5157746192731", okved: "62.09", legalAddress: "123112, г. Москва, Пресненская наб., д. 10, пом. XV", director: "Худяков Александр Александрович", directorPosition: "Генеральный директор", status: "Действует" },
  "7710140679": { name: "АО «ТБАНК»", shortName: "ТБанк", kpp: "771301001", ogrn: "1027739642281", okved: "64.19", legalAddress: "127287, г. Москва, ул. 2-я Хуторская, д. 38А, стр. 26", director: "Близнюк Станислав Владиславович", directorPosition: "Председатель Правления", status: "Действует" },
  "5024051347": { name: "ООО «ТЕХНОСТРОЙ-ПОДМОСКОВЬЕ»", shortName: "Технострой-Подмосковье", kpp: "502401001", ogrn: "1035004456009", okved: "41.20", legalAddress: "143404, Московская обл., г. Красногорск, ул. Ленина, д. 6", director: "Зайцев Пётр Михайлович", directorPosition: "Генеральный директор", status: "Действует" },
  "7801032750": { name: "ООО «ПИТЕРСКИЙ ХЛЕБ»", shortName: "Питерский хлеб", kpp: "780101001", ogrn: "1027800528034", okved: "10.71", legalAddress: "199106, г. Санкт-Петербург, Большой пр-т В.О., д. 80", director: "Смирнова Елена Викторовна", directorPosition: "Генеральный директор", status: "Действует" },
};

const WORDS1 = ["ВЕКТОР", "АЛЬФА", "СТРОЙ", "ТЕХНО", "ПРОМ", "МЕДИА", "ЛОГИСТИК", "ТОРГ", "ЭНЕРГО", "АГРО"];
const WORDS2 = ["СЕРВИС", "ГРУПП", "СИСТЕМС", "ТРЕЙД", "ИНВЕСТ", "ЛАЙН", "ПЛЮС", "КОМПЛЕКТ", "ПАРТНЁР", "РЕСУРС"];
const CITIES = ["г. Москва, ул. Ленинская Слобода, д. 19", "г. Санкт-Петербург, Невский пр-т, д. 100", "г. Казань, ул. Баумана, д. 44", "г. Екатеринбург, ул. Малышева, д. 51", "г. Новосибирск, Красный пр-т, д. 25"];
const NAMES = ["Иванов Сергей Петрович", "Петрова Ольга Николаевна", "Сидоров Дмитрий Андреевич", "Кузнецова Мария Алексеевна", "Морозов Антон Владимирович"];

function sandboxFor(inn: string): CompanyData {
  const known = SANDBOX[inn];
  if (known) return { ...known, inn, source: "sandbox" };
  const h = inn.split("").reduce((s, c) => s * 31 + Number(c), 7) >>> 0;
  const isIp = inn.length === 12;
  const name = isIp ? `ИП ${NAMES[h % NAMES.length]}` : `ООО «${WORDS1[h % 10]}${WORDS2[(h >> 4) % 10]}»`;
  return { name, shortName: isIp ? name : `${WORDS1[h % 10]}${WORDS2[(h >> 4) % 10]}`, inn, kpp: isIp ? "" : inn.slice(0, 4) + "01001", ogrn: (isIp ? "3" : "1") + String(h).padStart(12, "0").slice(0, 12), okved: ["46.90", "62.01", "41.20", "47.91", "56.10"][h % 5], legalAddress: `${100000 + (h % 90000)}, ${CITIES[(h >> 8) % CITIES.length]}`, director: NAMES[(h >> 3) % NAMES.length], directorPosition: isIp ? "Индивидуальный предприниматель" : "Генеральный директор", status: "Действует", source: "sandbox" };
}

export async function lookupCompanyByInn(innRaw: string): Promise<CompanyData | null> {
  const inn = innRaw.replace(/\D/g, "");
  if (!validateInn(inn)) return null;
  const r = await resolve("company_data");
  if (r.live && r.config.token) {
    try {
      const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", Authorization: `Token ${r.config.token}` }, body: JSON.stringify({ query: inn, count: 1 }) });
      const j = (await res.json()) as { suggestions?: { value: string; data: Record<string, unknown> }[] };
      const s = j.suggestions?.[0];
      if (s) {
        const d = s.data as { name?: { short_with_opf?: string; full_with_opf?: string }; kpp?: string; ogrn?: string; okved?: string; address?: { unrestricted_value?: string }; management?: { name?: string; post?: string }; state?: { status?: string; registration_date?: number } };
        await logEvent({ kind: "company.lookup", provider: "dadata", direction: "out", payload: { inn, found: true }, integrationId: r.integrationId });
        return { name: d.name?.short_with_opf ?? s.value, shortName: (d.name?.short_with_opf ?? s.value).replace(/^(ООО|АО|ПАО|ИП)\s*/, "").replace(/[«»"]/g, ""), inn, kpp: d.kpp ?? "", ogrn: d.ogrn ?? "", okved: d.okved ?? "", legalAddress: d.address?.unrestricted_value ?? "", director: d.management?.name ?? "", directorPosition: d.management?.post ?? "", status: d.state?.status === "ACTIVE" ? "Действует" : (d.state?.status ?? ""), registeredAt: d.state?.registration_date ? new Date(d.state.registration_date).toISOString() : undefined, source: "dadata" };
      }
      await logEvent({ kind: "company.lookup", provider: "dadata", direction: "out", payload: { inn, found: false }, integrationId: r.integrationId });
      return null;
    } catch (e) {
      await logEvent({ kind: "company.lookup", provider: "dadata", direction: "out", payload: { inn, error: String(e) }, status: "error", integrationId: r.integrationId });
    }
  }
  await logEvent({ kind: "company.lookup", provider: "dadata", direction: "out", payload: { inn }, status: "sandbox", integrationId: r.integrationId });
  return sandboxFor(inn);
}

const BANKS: Record<string, { name: string; corr: string }> = {
  "044525225": { name: "ПАО Сбербанк", corr: "30101810400000000225" },
  "044525974": { name: "АО «ТБанк»", corr: "30101810145250000974" },
  "044525593": { name: "АО «Альфа-Банк»", corr: "30101810200000000593" },
  "044525104": { name: "ООО «Банк Точка»", corr: "30101810745374525104" },
  "044525092": { name: "АО «Модульбанк»", corr: "30101810645250000092" },
  "044525187": { name: "Банк ВТБ (ПАО)", corr: "30101810700000000187" },
  "044525411": { name: "Филиал «Центральный» Банка ВТБ", corr: "30101810145250000411" },
};
export async function lookupBankByBik(bik: string) {
  const b = BANKS[bik.replace(/\D/g, "")];
  return b ? { bankName: b.name, corrAccount: b.corr, bik } : null;
}
