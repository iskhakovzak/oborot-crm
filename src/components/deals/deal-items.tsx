"use client";
import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/page";
import { Input, Select, inputClass } from "@/components/ui/input";
import { fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDealItem, updateDealItem, removeDealItem } from "@/app/(app)/deals/actions";

export type DealItemRow = { id: string; productId: string | null; name: string; unit: string; qty: number; price: number; discount: number; vatRate: number };
export type CatalogProduct = { id: string; name: string; sku: string | null; barcode: string | null; price: number; unit: string; vatRate: number; category: string | null };

const lineTotal = (i: { qty: number; price: number; discount: number }) => i.qty * i.price * (1 - i.discount / 100);

export function DealItems({ dealId, items, products, canEdit }: { dealId: string; items: DealItemRow[]; products: CatalogProduct[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"none" | "catalog" | "manual">("none");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [manual, setManual] = useState({ name: "", price: "", unit: "шт", qty: "1" });
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").includes(q)) : products;
    return list.slice(0, 50);
  }, [products, search]);
  const selected = products.find((p) => p.id === productId) ?? filtered[0];
  const total = items.reduce((s, i) => s + lineTotal(i), 0);
  const vat = items.reduce((s, i) => { const t = lineTotal(i); return s + (i.vatRate ? t - t / (1 + i.vatRate / 100) : 0); }, 0);

  function run(fn: () => Promise<{ error: string } | { ok: true; amount: number }>, okText?: string) {
    start(async () => {
      const r = await fn();
      if ("error" in r) { toast.error(r.error); return; }
      if (okText) toast.success(okText);
    });
  }
  function addFromCatalog() {
    if (!selected) { toast.error("Выберите товар"); return; }
    run(() => addDealItem(dealId, { productId: selected.id, name: selected.name, qty: Number(qty) || 1, price: selected.price, unit: selected.unit, vatRate: selected.vatRate }), "Позиция добавлена");
    setMode("none"); setSearch(""); setProductId(""); setQty("1");
  }
  function addManual() {
    if (!manual.name.trim()) { toast.error("Укажите наименование"); return; }
    run(() => addDealItem(dealId, { name: manual.name, qty: Number(manual.qty) || 1, price: Number(manual.price) || 0, unit: manual.unit || "шт" }), "Позиция добавлена");
    setMode("none"); setManual({ name: "", price: "", unit: "шт", qty: "1" });
  }
  const cell = (item: DealItemRow, field: "qty" | "price" | "discount", step = "1") => {
    const v = item[field];
    if (!canEdit) return <span className="tnum">{field === "price" ? fmtMoney(v) : field === "discount" ? `${fmtNum(v)}%` : fmtNum(v)}</span>;
    return (
      <input
        type="number" step={step} min={0} defaultValue={v} key={`${item.id}-${field}-${v}`}
        onBlur={(e) => { const n = Number(e.target.value); if (n !== v) run(() => updateDealItem(item.id, { [field]: n })); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={cn(inputClass, "h-8 w-24 px-2 text-right tnum")}
      />
    );
  };

  return (
    <Section
      title="Позиции"
      description={items.length ? `${items.length} поз. · НДС в т.ч. ${fmtMoney(vat)}` : "Товары и услуги по сделке — из них формируются счёт, договор и ЭСФ"}
      action={canEdit && mode === "none" && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode("manual")}><Plus /> Вручную</Button>
          <Button size="sm" onClick={() => setMode("catalog")}><Package /> Из каталога</Button>
        </div>
      )}
    >
      {mode === "catalog" && (
        <div className="mb-4 rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_90px_auto]">
            <Input autoFocus placeholder="Поиск: название, артикул, штрихкод" value={search} onChange={(e) => { setSearch(e.target.value); setProductId(""); }} />
            <Select value={selected?.id ?? ""} onChange={(e) => setProductId(e.target.value)}>
              {!filtered.length && <option value="">Ничего не найдено</option>}
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>{p.sku ? `${p.sku} · ` : ""}{p.name} — {fmtMoney(p.price)}</option>
              ))}
            </Select>
            <Input type="number" min={0.001} step="1" value={qty} onChange={(e) => setQty(e.target.value)} className="tnum" placeholder="Кол-во" />
            <div className="flex gap-2">
              <Button onClick={addFromCatalog} disabled={pending || !selected}>Добавить</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>Отмена</Button>
            </div>
          </div>
        </div>
      )}
      {mode === "manual" && (
        <div className="mb-4 rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="grid gap-2 md:grid-cols-[1.6fr_80px_90px_120px_auto]">
            <Input autoFocus placeholder="Наименование" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <Input placeholder="Ед." value={manual.unit} onChange={(e) => setManual({ ...manual, unit: e.target.value })} />
            <Input type="number" min={0.001} placeholder="Кол-во" value={manual.qty} onChange={(e) => setManual({ ...manual, qty: e.target.value })} className="tnum" />
            <Input type="number" min={0} step="0.01" placeholder="Цена, сум" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} className="tnum" />
            <div className="flex gap-2">
              <Button onClick={addManual} disabled={pending}>Добавить</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>Отмена</Button>
            </div>
          </div>
        </div>
      )}
      {!items.length ? (
        <div className="rounded-[10px] border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
          Позиций пока нет. {canEdit ? "Добавьте товар из каталога или введите вручную — сумма сделки пересчитается автоматически." : "Документы будут сформированы на сумму сделки."}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 -mb-5">
          <table className="table-base w-full text-sm">
            <thead>
              <tr>
                <th className="pl-5">Наименование</th>
                <th>Ед.</th>
                <th className="text-right">Кол-во</th>
                <th className="text-right">Цена</th>
                <th className="text-right">Скидка</th>
                <th className="text-right">НДС</th>
                <th className="text-right">Сумма</th>
                {canEdit && <th className="w-10 pr-5" />}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="pl-5 font-medium">{i.name}</td>
                  <td className="text-muted">{i.unit}</td>
                  <td className="text-right">{cell(i, "qty")}</td>
                  <td className="text-right">{cell(i, "price", "0.01")}</td>
                  <td className="text-right">{cell(i, "discount", "0.5")}</td>
                  <td className="text-right text-muted tnum">{i.vatRate}%</td>
                  <td className="text-right font-medium tnum">{fmtMoney(lineTotal(i))}</td>
                  {canEdit && (
                    <td className="pr-5 text-right">
                      <button type="button" onClick={() => run(() => removeDealItem(i.id))} className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-accent" aria-label="Удалить позицию" disabled={pending}><Trash2 className="size-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="pl-5 text-right text-muted">Итого с НДС</td>
                <td className="text-right text-[15px] font-semibold tnum">{fmtMoney(total)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}
