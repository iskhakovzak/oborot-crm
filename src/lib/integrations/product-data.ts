import { resolve, logEvent } from "./registry";

export type ProductData = { name: string; brand: string; category: string; description: string; unit: string; weightKg?: number; price?: number; attributes: Record<string, string>; source: "api" | "sandbox" | "ai" };

const SANDBOX: Record<string, Omit<ProductData, "source">> = {
  "4601234567890": { name: "Кондиционер настенный Ballu BSAG-09HN8", brand: "Ballu", category: "Кондиционеры", description: "Сплит-система 9000 BTU, площадь до 26 м², класс A, R32, тихий режим 22 дБ.", unit: "шт", weightKg: 8.5, price: 28990, attributes: { "Мощность охлаждения": "2,6 кВт", "Площадь": "26 м²", "Хладагент": "R32", "Гарантия": "3 года" } },
  "4602345678901": { name: "Тепловая завеса Тепломаш КЭВ-6П1261E", brand: "Тепломаш", category: "Тепловые завесы", description: "Электрическая завеса 6 кВт для проёмов до 2,2 м, корпус из нержавеющей стали.", unit: "шт", weightKg: 14, price: 24500, attributes: { "Мощность": "6 кВт", "Высота установки": "2,2 м", "Напряжение": "380 В" } },
  "4603456789012": { name: "Вентилятор канальный Systemair K 200 M", brand: "Systemair", category: "Вентиляция", description: "Круглый канальный вентилятор Ø200 мм, 780 м³/ч, низкий уровень шума.", unit: "шт", weightKg: 4.2, price: 18900, attributes: { "Диаметр": "200 мм", "Производительность": "780 м³/ч" } },
  "4604567890123": { name: "Приточная установка Breezart 1000 Lux", brand: "Breezart", category: "Вентиляция", description: "Компактная приточная установка 1000 м³/ч с нагревателем и автоматикой JL204.", unit: "шт", weightKg: 48, price: 189000, attributes: { "Производительность": "1000 м³/ч", "Нагреватель": "электрический 4,8 кВт" } },
  "4605678901234": { name: "Медная труба Majdanpek 1/4″ × 15 м", brand: "Majdanpek", category: "Расходные материалы", description: "Медная труба для фреоновых трасс, бухта 15 м.", unit: "бухта", weightKg: 2.1, price: 4200, attributes: { "Диаметр": "1/4″", "Длина": "15 м" } },
  "4606789012345": { name: "Монтаж сплит-системы до 3,5 кВт", brand: "Оборот", category: "Услуги", description: "Стандартный монтаж: трасса до 3 м, кронштейны, пусконаладка.", unit: "усл", price: 9500, attributes: { "Срок": "1 день", "Гарантия на работы": "2 года" } },
};
const CATS = ["Кондиционеры", "Вентиляция", "Тепловые завесы", "Расходные материалы", "Автоматика"];
const BRANDS = ["Ballu", "Daikin", "Mitsubishi Electric", "Electrolux", "Systemair", "Breezart", "Royal Clima"];

export async function lookupProduct(codeRaw: string): Promise<ProductData | null> {
  const code = codeRaw.trim();
  if (!code) return null;
  const r = await resolve("product_data");
  if (r.live && r.config.apiKey) {
    try {
      const res = await fetch(`https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(code)}&key=${encodeURIComponent(r.config.apiKey)}`);
      const j = (await res.json()) as { products?: { title: string; brand?: string; category?: string; description?: string; weight?: string }[] };
      const p = j.products?.[0];
      await logEvent({ kind: "product.lookup", provider: "barcode", direction: "out", payload: { code, found: !!p }, integrationId: r.integrationId });
      if (p) return { name: p.title, brand: p.brand ?? "", category: p.category?.split(">").pop()?.trim() ?? "", description: p.description ?? "", unit: "шт", weightKg: p.weight ? parseFloat(p.weight) : undefined, attributes: {}, source: "api" };
    } catch (e) {
      await logEvent({ kind: "product.lookup", provider: "barcode", direction: "out", payload: { code, error: String(e) }, status: "error", integrationId: r.integrationId });
    }
  }
  await logEvent({ kind: "product.lookup", provider: "barcode", direction: "out", payload: { code }, status: "sandbox", integrationId: r.integrationId });
  const known = SANDBOX[code];
  if (known) return { ...known, source: "sandbox" };
  if (!/^\d{8,14}$/.test(code)) return null;
  const h = code.split("").reduce((s, c) => s * 31 + Number(c), 11) >>> 0;
  const brand = BRANDS[h % BRANDS.length];
  const cat = CATS[(h >> 3) % CATS.length];
  const model = `${brand.split(" ")[0].toUpperCase().slice(0, 3)}-${(h % 90) + 10}${["A", "H", "E", "S"][h % 4]}`;
  return { name: `${cat === "Услуги" ? "" : cat.slice(0, -1).replace(/[ыи]$/, "")} ${brand} ${model}`.trim(), brand, category: cat, description: `${cat}: модель ${model} от ${brand}. Описание можно дополнить ИИ-помощником.`, unit: "шт", weightKg: Math.round(((h % 400) / 10 + 1) * 10) / 10, price: Math.round(((h % 300) + 20) * 100), attributes: { "Артикул производителя": model }, source: "sandbox" };
}
