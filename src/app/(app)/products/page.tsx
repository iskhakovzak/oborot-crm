import Link from "next/link";
import { asc } from "drizzle-orm";
import { Package, Search } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields } from "@/lib/permissions";
import { fmtMoney, fmtNum, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ProductDialog, type ProductRow } from "@/components/products/product-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Товары" };

type SP = { q?: string; category?: string; all?: string; new?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.actor, "products", "view")) return <EmptyState title="Нет доступа к каталогу" />;
  const hidden = hiddenFields(user.actor, "products");
  const hideCost = hidden.includes("cost");
  const canEdit = can(user.actor, "products", "edit");
  const q = (sp.q ?? "").trim().toLowerCase();
  const all = await db.query.products.findMany({ orderBy: [asc(schema.products.category), asc(schema.products.name)] });
  const categories = [...new Set(all.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ru"));
  const list = all
    .filter((p) => sp.all === "1" || p.isActive)
    .filter((p) => !sp.category || p.category === sp.category)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").includes(q) || (p.brand ?? "").toLowerCase().includes(q));
  const rows: ProductRow[] = list.map((p) => ({ id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, description: p.description, category: p.category, brand: p.brand, unit: p.unit, price: p.price, cost: hideCost ? null : p.cost, vatRate: p.vatRate, stock: p.stock, weightKg: p.weightKg, attributes: p.attributes ?? {}, isActive: p.isActive }));
  const stockValue = list.reduce((s, p) => s + p.stock * p.price, 0);
  const hasFilters = !!(q || sp.category || sp.all);

  return (
    <>
      <PageHeader eyebrow="Деньги и документы"
        title="Товары и услуги"
        description={<>{plural(list.length, "позиция", "позиции", "позиций")} · {categories.length} категорий · остатки на <span className="tnum font-medium text-ink">{fmtMoney(stockValue)}</span></>}
        actions={can(user.actor, "products", "create") && <ProductDialog categories={categories} hideCost={hideCost} openByParam={sp.new === "1"} />}
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="category" defaultValue={sp.category ?? ""} className="w-56">
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Название, артикул, штрихкод, бренд" className="flex h-9 w-full rounded-[8px] border border-line-strong bg-surface pl-9 pr-3 text-sm placeholder:text-muted focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20" />
        </div>
        <label className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-ink-2">
          <input type="checkbox" name="all" value="1" defaultChecked={sp.all === "1"} className="size-3.5 accent-ink" /> Показывать скрытые
        </label>
        <Button type="submit" variant="secondary">Найти</Button>
        {hasFilters && <Button variant="ghost" asChild><Link href="/products">Сбросить</Link></Button>}
      </form>

      {!rows.length ? (
        <EmptyState
          title={hasFilters ? "Ничего не найдено" : "Каталог пуст"}
          description={hasFilters ? "Измените запрос или категорию." : "Добавьте первый товар — по штрихкоду карточка заполнится автоматически."}
          icon={<Package />}
          action={hasFilters ? <Button variant="secondary" asChild><Link href="/products">Сбросить фильтры</Link></Button> : can(user.actor, "products", "create") ? <Button asChild><Link href="/products?new=1">Новый товар</Link></Button> : undefined}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Артикул</th>
              <th>Штрихкод</th>
              <th>Наименование</th>
              <th>Категория</th>
              <th>Бренд</th>
              <th className="text-right">Цена</th>
              {!hideCost && <th className="text-right">Себестоимость</th>}
              <th className="text-right">Остаток</th>
              <th className="text-right">НДС</th>
              {canEdit && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={cn(!p.isActive && "opacity-50")}>
                <td className="font-medium tnum whitespace-nowrap">{p.sku ?? <span className="text-muted">—</span>}</td>
                <td className="tnum text-muted">{p.barcode ?? "—"}</td>
                <td>
                  <div className="font-medium">{p.name}</div>
                  {Object.keys(p.attributes).length > 0 && <div className="mt-0.5 truncate text-xs text-muted max-w-[42ch]">{Object.entries(p.attributes).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}
                </td>
                <td>{p.category ? <Badge>{p.category}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="text-ink-2">{p.brand ?? "—"}</td>
                <td className="text-right font-medium tnum whitespace-nowrap">{fmtMoney(p.price)}</td>
                {!hideCost && <td className="text-right tnum whitespace-nowrap text-ink-2">{fmtMoney(p.cost ?? 0)}{p.price > 0 && (p.cost ?? 0) > 0 && <span className="ml-1 text-xs text-muted">({Math.round((1 - (p.cost ?? 0) / p.price) * 100)}%)</span>}</td>}
                <td className={cn("text-right tnum whitespace-nowrap", p.unit !== "усл" && p.stock <= 0 ? "text-accent" : p.stock < 5 && p.unit !== "усл" ? "text-warn" : "")}>{p.unit === "усл" ? <span className="text-muted">услуга</span> : `${fmtNum(p.stock)} ${p.unit}`}</td>
                <td className="text-right tnum text-muted">{p.vatRate ? `${p.vatRate}%` : "без НДС"}</td>
                {canEdit && <td className="text-right"><ProductDialog product={p} categories={categories} hideCost={hideCost} trigger="icon" /></td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
