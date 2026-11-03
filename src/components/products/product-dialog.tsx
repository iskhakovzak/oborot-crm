"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, ScanBarcode, Sparkles, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createProduct, updateProduct, describeProduct, type ProductInput } from "@/app/(app)/products/actions";

export type ProductRow = { id: string; sku: string | null; barcode: string | null; name: string; description: string | null; category: string | null; brand: string | null; unit: string; price: number; cost: number | null; vatRate: number; stock: number; weightKg: number | null; attributes: Record<string, string>; isActive: boolean };

type Form = { name: string; sku: string; barcode: string; description: string; category: string; brand: string; unit: string; price: string; cost: string; vatRate: string; stock: string; weightKg: string; attrs: { k: string; v: string }[]; isActive: boolean };
const EMPTY: Form = { name: "", sku: "", barcode: "", description: "", category: "", brand: "", unit: "шт", price: "", cost: "", vatRate: "12", stock: "0", weightKg: "", attrs: [], isActive: true };

function fromRow(p: ProductRow): Form {
  return { name: p.name, sku: p.sku ?? "", barcode: p.barcode ?? "", description: p.description ?? "", category: p.category ?? "", brand: p.brand ?? "", unit: p.unit, price: String(p.price), cost: p.cost == null ? "" : String(p.cost), vatRate: String(p.vatRate), stock: String(p.stock), weightKg: p.weightKg == null ? "" : String(p.weightKg), attrs: Object.entries(p.attributes ?? {}).map(([k, v]) => ({ k, v })), isActive: p.isActive };
}
function toInput(f: Form, hideCost: boolean): ProductInput {
  return { name: f.name, sku: f.sku, barcode: f.barcode, description: f.description, category: f.category, brand: f.brand, unit: f.unit, price: Number(f.price) || 0, ...(hideCost ? {} : { cost: Number(f.cost) || 0 }), vatRate: Number(f.vatRate), stock: Number(f.stock) || 0, weightKg: f.weightKg === "" ? null : Number(f.weightKg), attributes: Object.fromEntries(f.attrs.map((a) => [a.k, a.v])), isActive: f.isActive };
}

export function ProductDialog({ product, categories, hideCost, openByParam, trigger }: { product?: ProductRow; categories: string[]; hideCost: boolean; openByParam?: boolean; trigger?: "button" | "icon" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(!!openByParam);
  const [form, setForm] = useState<Form>(product ? fromRow(product) : EMPTY);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"code" | "ai" | null>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  useEffect(() => {
    if (openByParam) setOpen(true);
  }, [openByParam]);

  function close() {
    setOpen(false);
    if (!product) setForm(EMPTY);
    if (sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }
  }
  async function fillByCode() {
    const code = (form.barcode || form.sku).trim();
    if (!code) { toast.error("Введите штрихкод или артикул"); return; }
    setBusy("code");
    try {
      const res = await fetch(`/api/lookup/barcode?code=${encodeURIComponent(code)}`);
      const j = await res.json();
      if (!res.ok) { toast.error(j.error ?? "Товар не найден"); return; }
      set({ name: j.name ?? form.name, brand: j.brand ?? form.brand, category: j.category ?? form.category, description: j.description ?? form.description, unit: j.unit ?? form.unit, weightKg: j.weightKg != null ? String(j.weightKg) : form.weightKg, price: j.price != null ? String(j.price) : form.price, attrs: Object.entries((j.attributes ?? {}) as Record<string, string>).map(([k, v]) => ({ k, v })) });
      toast.success(`${j.name}${j.source === "sandbox" ? " (демо-данные)" : ""}`);
    } catch {
      toast.error("Сервис недоступен");
    } finally {
      setBusy(null);
    }
  }
  function describe() {
    setBusy("ai");
    start(async () => {
      const r = await describeProduct(form.name, form.category);
      setBusy(null);
      if ("error" in r) { toast.error(r.error); return; }
      const merged = new Map(form.attrs.map((a) => [a.k, a.v]));
      for (const [k, v] of Object.entries(r.attributes)) if (!merged.has(k)) merged.set(k, v);
      set({ description: r.description, attrs: [...merged].map(([k, v]) => ({ k, v })) });
      toast.success(r.sandbox ? "Описание сгенерировано (демо-режим, без ключа ИИ)" : "Описание сгенерировано ИИ");
    });
  }
  function submit() {
    start(async () => {
      const r = product ? await updateProduct(product.id, toInput(form, hideCost)) : await createProduct(toInput(form, hideCost));
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(product ? "Товар сохранён" : "Товар добавлен");
      close();
      router.refresh();
    });
  }

  return (
    <>
      {product ? (
        trigger === "icon" ? (
          <button type="button" onClick={() => { setForm(fromRow(product)); setOpen(true); }} className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-ink" aria-label="Изменить"><Pencil className="size-4" /></button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => { setForm(fromRow(product)); setOpen(true); }}><Pencil /> Изменить</Button>
        )
      ) : (
        <Button onClick={() => setOpen(true)}><Plus /> Новый товар</Button>
      )}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title={product ? "Товар" : "Новый товар"} description="Введите штрихкод или артикул и нажмите «Заполнить» — карточка подтянется из справочника" wide>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Field label="Штрихкод"><Input value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} inputMode="numeric" placeholder="4601234567890" className="tnum" autoFocus={!product} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByCode(); } }} /></Field>
              <Field label="Артикул"><Input value={form.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="BSAG-09" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByCode(); } }} /></Field>
              <div className="flex items-end"><Button variant="secondary" onClick={fillByCode} disabled={busy === "code" || (!form.barcode.trim() && !form.sku.trim())}><ScanBarcode /> {busy === "code" ? "Ищем…" : "Заполнить"}</Button></div>
            </div>
            <Field label="Название"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} required placeholder="Кондиционер настенный Ballu BSAG-09HN8" /></Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Категория">
                <Input value={form.category} onChange={(e) => set({ category: e.target.value })} list="product-categories" placeholder="Кондиционеры" />
                <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Бренд"><Input value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Ballu" /></Field>
              <Field label="Единица"><Input value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="шт" /></Field>
            </div>
            <div className={`grid gap-3 ${hideCost ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
              <Field label="Цена, сум"><Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} className="tnum" /></Field>
              {!hideCost && <Field label="Себестоимость, сум"><Input type="number" min={0} step="0.01" value={form.cost} onChange={(e) => set({ cost: e.target.value })} className="tnum" /></Field>}
              <Field label="НДС">
                <Select value={form.vatRate} onChange={(e) => set({ vatRate: e.target.value })}>
                  {!["12", "0"].includes(form.vatRate) && <option value={form.vatRate}>{form.vatRate}%</option>}<option value="12">12%</option><option value="0">Без НДС</option>
                </Select>
              </Field>
              <Field label="Остаток"><Input type="number" step="1" value={form.stock} onChange={(e) => set({ stock: e.target.value })} className="tnum" /></Field>
              <Field label="Вес, кг"><Input type="number" min={0} step="0.01" value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} className="tnum" /></Field>
            </div>
            <Field label="Описание">
              <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Коротко о товаре для КП и сайта" />
            </Field>
            <div className="flex justify-end">
              <Button size="sm" variant="soft" onClick={describe} disabled={busy === "ai" || !form.name.trim()}><Sparkles /> {busy === "ai" ? "Пишем…" : "Описать с помощью ИИ"}</Button>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Характеристики</span>
                <Button size="sm" variant="ghost" onClick={() => set({ attrs: [...form.attrs, { k: "", v: "" }] })}><Plus /> Добавить</Button>
              </div>
              {!form.attrs.length ? (
                <p className="rounded-[8px] border border-dashed border-line-strong px-3 py-3 text-center text-[12.5px] text-muted">Пока пусто — заполните из справочника, с помощью ИИ или вручную.</p>
              ) : (
                <div className="space-y-1.5">
                  {form.attrs.map((a, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
                      <Input value={a.k} onChange={(e) => set({ attrs: form.attrs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} placeholder="Мощность" className="h-8 text-[13px]" />
                      <Input value={a.v} onChange={(e) => set({ attrs: form.attrs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} placeholder="2,6 кВт" className="h-8 text-[13px]" />
                      <button type="button" onClick={() => set({ attrs: form.attrs.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted hover:bg-accent-soft hover:text-accent" aria-label="Удалить"><X className="size-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {product && (
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="size-4 accent-ink" /> Показывать в каталоге</label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={close}>Отмена</Button>
              <Button type="submit" disabled={pending || !form.name.trim()}>{pending && busy !== "ai" ? "Сохраняем…" : product ? "Сохранить" : "Добавить товар"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
