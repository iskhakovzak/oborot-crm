"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields, readonlyFields } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { describeProduct as aiDescribe } from "@/lib/integrations/ai";
import { logActivity } from "@/lib/activity";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type ProductInput = {
  name: string; sku?: string | null; barcode?: string | null; description?: string | null; category?: string | null; brand?: string | null; unit?: string;
  price?: number; cost?: number; vatRate?: number; stock?: number; weightKg?: number | null; imageUrl?: string | null; attributes?: Record<string, string>; isActive?: boolean;
};

function clean(input: ProductInput, hidden: string[], readonly: string[]) {
  const s = (v: string | null | undefined) => (v ?? "").trim() || null;
  const set: Partial<typeof schema.products.$inferInsert> = {
    name: input.name.trim(), sku: s(input.sku), barcode: s(input.barcode), description: s(input.description), category: s(input.category), brand: s(input.brand), unit: (input.unit ?? "шт").trim() || "шт",
    price: Math.max(0, Number(input.price) || 0), cost: Math.max(0, Number(input.cost) || 0), vatRate: [0, 10, 20].includes(Number(input.vatRate)) ? Number(input.vatRate) : 20, stock: Number(input.stock) || 0,
    weightKg: input.weightKg != null && input.weightKg !== ("" as unknown) ? Number(input.weightKg) || null : null, imageUrl: s(input.imageUrl), isActive: input.isActive ?? true,
    attributes: Object.fromEntries(Object.entries(input.attributes ?? {}).map(([k, v]) => [k.trim(), String(v).trim()]).filter(([k, v]) => k && v)),
  };
  for (const f of [...hidden, ...readonly]) delete (set as Record<string, unknown>)[f];
  return set;
}

export async function createProduct(input: ProductInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "products", "create")) return fail("Нет прав на создание товаров");
  try {
    const set = clean(input, hiddenFields(user.actor, "products"), []);
    if (!set.name) return fail("Укажите название");
    if (set.sku) {
      const dup = await db.query.products.findFirst({ where: eq(schema.products.sku, set.sku) });
      if (dup) return fail(`Артикул ${set.sku} уже занят: ${dup.name}`);
    }
    const id = newId("prd");
    await db.insert(schema.products).values({ ...set, id, name: set.name });
    await logActivity({ type: "system", title: `Товар добавлен в каталог: ${set.name}`, userId: user.id, meta: { productId: id } });
    revalidatePath("/products");
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function updateProduct(id: string, input: ProductInput): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "products", "edit")) return fail("Нет прав на изменение товаров");
  try {
    const existing = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
    if (!existing) return fail("Товар не найден");
    const set = clean(input, hiddenFields(user.actor, "products"), readonlyFields(user.actor, "products"));
    if (!set.name) return fail("Укажите название");
    if (set.sku && set.sku !== existing.sku) {
      const dup = await db.query.products.findFirst({ where: eq(schema.products.sku, set.sku) });
      if (dup && dup.id !== id) return fail(`Артикул ${set.sku} уже занят: ${dup.name}`);
    }
    await db.update(schema.products).set(set).where(eq(schema.products.id, id));
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function toggleProduct(id: string): Promise<{ ok: true; isActive: boolean } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "products", "edit")) return fail("Нет прав на изменение товаров");
  try {
    const p = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
    if (!p) return fail("Товар не найден");
    await db.update(schema.products).set({ isActive: !p.isActive }).where(eq(schema.products.id, id));
    revalidatePath("/products");
    return { ok: true, isActive: !p.isActive };
  } catch (e) {
    return fail(msg(e));
  }
}

/** 5. Описание и характеристики товара с помощью ИИ */
export async function describeProduct(name: string, category?: string | null): Promise<{ ok: true; description: string; attributes: Record<string, string>; sandbox: boolean } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "products", "view")) return fail("Нет доступа к товарам");
  try {
    const n = name.trim();
    if (!n) return fail("Сначала укажите название товара");
    const r = await aiDescribe(n, category?.trim() || undefined);
    return { ok: true, ...r };
  } catch (e) {
    return fail(msg(e));
  }
}
