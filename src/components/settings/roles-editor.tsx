"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Copy, Trash2, Lock, ShieldCheck } from "lucide-react";
import type { EntityPermission, PermissionMap, PermScope } from "@/db/schema";
import { ENTITIES, SCOPE_LABEL } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteRole, saveRole } from "@/app/(app)/settings/actions";

export type RoleRow = { id: string; name: string; slug: string; description: string | null; permissions: PermissionMap; isSystem: boolean; usersCount: number };

const SCOPES: PermScope[] = ["all", "team", "own", "none"];
const FIELD_LABELS: Record<string, string> = {
  name: "Название", inn: "ИНН", phone: "Телефон", email: "Email", balance: "Баланс", managerId: "Менеджер", bankName: "Банк", account: "Счёт", notes: "Заметки", telegram: "Telegram", whatsapp: "WhatsApp",
  title: "Название", amount: "Сумма", stageId: "Этап", source: "Источник", lostReason: "Причина отказа", nextStep: "Следующий шаг", price: "Цена", cost: "Себестоимость", stock: "Остаток", sku: "Артикул",
  number: "Номер", status: "Статус", edoStatus: "Статус ЭДО", method: "Способ", purpose: "Назначение", assigneeId: "Исполнитель", dueAt: "Срок", priority: "Приоритет", aiEnabled: "ИИ-ответы",
  recordingUrl: "Запись", transcript: "Расшифровка", clientPhone: "Телефон клиента", clientEmail: "Email клиента", defects: "Брак", body: "Текст", segment: "Сегмент",
  marketing: "Маркетинг", sales: "Продажи", production: "Производство", finance: "Финансы", actions: "Действия", config: "Ключи", roles: "Роли", users: "Сотрудники", company: "Реквизиты",
};

function none(): EntityPermission {
  return { view: "none", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
}
function summary(p: PermissionMap) {
  const keys = ENTITIES.filter((e) => (p[e.key]?.view ?? "none") !== "none");
  const full = keys.filter((e) => p[e.key]?.view === "all" && p[e.key]?.edit === "all");
  return `${keys.length} из ${ENTITIES.length} разделов · полный доступ к ${full.length}`;
}

export function RolesEditor({ roles, canEdit, canDelete }: { roles: RoleRow[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ role: RoleRow | null; base?: RoleRow } | null>(null);

  function remove(r: RoleRow) {
    if (!confirm(`Удалить роль «${r.name}»?`)) return;
    start(async () => {
      const res = await deleteRole(r.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Роль удалена");
      router.refresh();
    });
  }

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end gap-2">
          <Button onClick={() => setEditing({ role: null, base: roles.find((r) => r.slug === "manager") ?? roles[0] })}><Plus /> Создать роль</Button>
        </div>
      )}
      <div className={cn("grid gap-3 md:grid-cols-2", pending && "opacity-70")}>
        {roles.map((r) => (
          <article key={r.id} className="flex flex-col rounded-[12px] border border-line bg-surface px-5 py-4">
            <div className="flex items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[9px]", r.slug === "admin" ? "bg-ink text-white" : "bg-surface-2 text-ink-2")}>{r.slug === "admin" ? <ShieldCheck className="size-4" /> : <Lock className="size-4" />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold">{r.name}</h3>
                  {r.isSystem && <Badge tone="neutral">системная</Badge>}
                  <span className="text-xs text-muted">{r.usersCount} сотр.</span>
                </div>
                {r.description && <p className="mt-0.5 text-[13px] text-muted">{r.description}</p>}
                <p className="mt-2 text-xs text-ink-2">{summary(r.permissions)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ENTITIES.filter((e) => (r.permissions[e.key]?.view ?? "none") !== "none").map((e) => {
                    const p = r.permissions[e.key];
                    const tone = p.edit === "all" ? "good" : p.edit === "none" ? "neutral" : "info";
                    return <Badge key={e.key} tone={tone}>{e.label}{p.view !== "all" ? ` · ${SCOPE_LABEL[p.view].toLowerCase()}` : ""}</Badge>;
                  })}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
              <Button variant="secondary" size="sm" onClick={() => setEditing({ role: r })}><Pencil /> {canEdit ? "Изменить" : "Посмотреть"}</Button>
              {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing({ role: null, base: r })}><Copy /> Копировать</Button>}
              {canDelete && !r.isSystem && <Button variant="ghost" size="sm" className="ml-auto text-accent" onClick={() => remove(r)}><Trash2 /> Удалить</Button>}
            </div>
          </article>
        ))}
      </div>
      <RoleDialog state={editing} onClose={() => setEditing(null)} canEdit={canEdit} />
    </>
  );
}

function RoleDialog({ state, onClose, canEdit }: { state: { role: RoleRow | null; base?: RoleRow } | null; onClose: () => void; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<PermissionMap>({});
  const role = state?.role ?? null;
  const isAdmin = role?.slug === "admin";
  const locked = !canEdit || isAdmin;

  useEffect(() => {
    if (!state) return;
    const src = state.role ?? state.base;
    setName(state.role ? state.role.name : src ? `${src.name} (копия)` : "");
    setDescription(state.role?.description ?? src?.description ?? "");
    setPerms(Object.fromEntries(ENTITIES.map((e) => [e.key, { ...(src?.permissions[e.key] ?? none()) }])));
  }, [state]);

  const patch = (key: string, p: Partial<EntityPermission>) => setPerms((x) => ({ ...x, [key]: { ...(x[key] ?? none()), ...p } }));
  const toggleField = (key: string, list: "hiddenFields" | "readonlyFields", f: string) =>
    setPerms((x) => {
      const cur = x[key] ?? none();
      const arr = cur[list].includes(f) ? cur[list].filter((v) => v !== f) : [...cur[list], f];
      return { ...x, [key]: { ...cur, [list]: arr } };
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveRole({ id: role?.id ?? null, name, description, permissions: perms });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(role ? "Роль сохранена" : "Роль создана");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide className="max-w-6xl" title={role ? `Роль: ${role.name}` : "Новая роль"} description={isAdmin ? "Администратор всегда имеет полный доступ — матрицу урезать нельзя" : "Для каждого раздела: область просмотра, создание, редактирование, удаление, скрытые поля и поля только для чтения"}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEdit} /></Field>
            <Field label="Описание"><Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} /></Field>
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="table-base w-full text-[13px] [&_td]:py-1.5 [&_th]:py-1.5">
              <thead>
                <tr>
                  <th>Раздел</th>
                  <th>Просмотр</th>
                  <th className="text-center">Создание</th>
                  <th>Редактирование</th>
                  <th>Удаление</th>
                  <th>Скрытые поля</th>
                  <th>Только чтение</th>
                </tr>
              </thead>
              <tbody>
                {ENTITIES.map((e) => {
                  const p = perms[e.key] ?? none();
                  const off = p.view === "none";
                  return (
                    <tr key={e.key} className={cn(off && "text-muted")}>
                      <td className="font-medium text-ink">{e.label}</td>
                      <td><ScopeSelect value={p.view} onChange={(view) => patch(e.key, { view, ...(view === "none" ? { create: false, edit: "none", delete: "none" } : {}) })} disabled={locked} /></td>
                      <td className="text-center"><input type="checkbox" checked={p.create} disabled={locked || off} onChange={(ev) => patch(e.key, { create: ev.target.checked })} className="size-4 accent-ink" /></td>
                      <td><ScopeSelect value={p.edit} onChange={(edit) => patch(e.key, { edit })} disabled={locked || off} /></td>
                      <td><ScopeSelect value={p.delete} onChange={(d) => patch(e.key, { delete: d })} disabled={locked || off} /></td>
                      <td><Chips fields={e.fields} selected={p.hiddenFields} onToggle={(f) => toggleField(e.key, "hiddenFields", f)} disabled={locked || off} tone="accent" /></td>
                      <td><Chips fields={e.fields} selected={p.readonlyFields} onToggle={(f) => toggleField(e.key, "readonlyFields", f)} disabled={locked || off} tone="warn" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">«Команда» — записи сотрудников с той же командой. Скрытые поля не отдаются на экран, поля только для чтения нельзя менять из карточки.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{canEdit ? "Отмена" : "Закрыть"}</Button>
            {canEdit && <Button type="submit" disabled={pending}>{role ? "Сохранить роль" : "Создать роль"}</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScopeSelect({ value, onChange, disabled }: { value: PermScope; onChange: (v: PermScope) => void; disabled?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as PermScope)} disabled={disabled} className="h-8 w-[110px] text-[13px]">
      {SCOPES.map((s) => (
        <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
      ))}
    </Select>
  );
}

function Chips({ fields, selected, onToggle, disabled, tone }: { fields: readonly string[]; selected: string[]; onToggle: (f: string) => void; disabled?: boolean; tone: "accent" | "warn" }) {
  return (
    <div className="flex max-w-[250px] flex-wrap gap-x-1 gap-y-0.5">
      {fields.map((f) => {
        const on = selected.includes(f);
        return (
          <button
            key={f}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(f)}
            className={cn(
              "whitespace-nowrap rounded-full border px-1.5 py-0 text-[11px] leading-4 transition-colors disabled:cursor-default disabled:opacity-60",
              on ? (tone === "accent" ? "border-transparent bg-accent-soft text-accent" : "border-transparent bg-warn-soft text-warn") : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {FIELD_LABELS[f] ?? f}
          </button>
        );
      })}
    </div>
  );
}
