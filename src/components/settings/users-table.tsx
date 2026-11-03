"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, UserX, UserCheck, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table } from "@/components/ui/table";
import { phoneFmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveUser, setUserActive, type UserInput } from "@/app/(app)/settings/actions";
import { TEAMS, teamLabel } from "./teams";

export type UserRow = {
  id: string; name: string; email: string; phone: string | null; roleId: string; roleName: string; teamId: string | null; isActive: boolean; acceptsLeads: boolean; leadWeight: number; skills: string[]; telegramLinked: boolean; workStart: string; workEnd: string; workDays: number[]; color: string;
};
export type RoleOption = { id: string; name: string; slug: string };

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const COLORS = ["#2456D6", "#6b3fd6", "#b96a00", "#138a5e", "#c8102e", "#16181d", "#0e7490", "#be185d"];

export function UsersTable({ users, roles, currentUserId, canEdit }: { users: UserRow[]; roles: RoleOption[]; currentUserId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  function toggleActive(u: UserRow) {
    start(async () => {
      const r = await setUserActive(u.id, !u.isActive);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(u.isActive ? `${u.name}: доступ закрыт` : `${u.name}: доступ восстановлен`);
      router.refresh();
    });
  }

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setCreating(true)}><Plus /> Добавить сотрудника</Button>
        </div>
      )}
      <Table className={cn(pending && "opacity-70")}>
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Роль</th>
            <th>Команда</th>
            <th>Заявки</th>
            <th>Навыки</th>
            <th>График</th>
            <th className="text-center">Telegram</th>
            <th>Статус</th>
            {canEdit && <th className="w-[90px]" />}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={cn(!u.isActive && "text-muted")}>
              <td>
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.name} color={u.color} size={28} />
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{u.name}{u.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted">(вы)</span>}</div>
                    <div className="text-xs text-muted">{u.email}{u.phone ? ` · ${phoneFmt(u.phone)}` : ""}</div>
                  </div>
                </div>
              </td>
              <td><Badge tone={u.roleId === roles.find((r) => r.slug === "admin")?.id ? "ink" : "neutral"}>{u.roleName}</Badge></td>
              <td>{teamLabel(u.teamId)}</td>
              <td>{u.acceptsLeads ? <span className="text-good">принимает · вес {u.leadWeight}</span> : <span className="text-muted">нет</span>}</td>
              <td className="max-w-[220px]">
                <div className="flex flex-wrap gap-1">{u.skills.length ? u.skills.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-muted">—</span>}</div>
              </td>
              <td className="whitespace-nowrap text-xs text-muted tnum">{u.workStart}–{u.workEnd} · {u.workDays.map((d) => DAYS[d]).join(" ")}</td>
              <td className="text-center">{u.telegramLinked ? <Check className="mx-auto size-4 text-good" /> : <span className="text-muted">—</span>}</td>
              <td>{u.isActive ? <Badge tone="good" dot>активен</Badge> : <Badge tone="neutral" dot>отключён</Badge>}</td>
              {canEdit && (
                <td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="iconSm" aria-label="Редактировать" onClick={() => setEditing(u)}><Pencil /></Button>
                    {u.id !== currentUserId && (
                      <Button variant="ghost" size="iconSm" aria-label={u.isActive ? "Деактивировать" : "Активировать"} onClick={() => toggleActive(u)}>{u.isActive ? <UserX /> : <UserCheck />}</Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      <UserDialog open={creating} onOpenChange={setCreating} user={null} roles={roles} />
      <UserDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} user={editing} roles={roles} />
    </>
  );
}

function UserDialog({ open, onOpenChange, user, roles }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserRow | null; roles: RoleOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<UserInput>(empty(roles));
  const [customTeam, setCustomTeam] = useState(false);
  useEffect(() => {
    if (!open) return;
    const next = user ? { id: user.id, name: user.name, email: user.email, phone: user.phone ?? "", password: "", roleId: user.roleId, teamId: user.teamId ?? "", acceptsLeads: user.acceptsLeads, leadWeight: user.leadWeight, skills: user.skills, workStart: user.workStart, workEnd: user.workEnd, workDays: user.workDays, color: user.color } : empty(roles);
    setV(next);
    setCustomTeam(!!next.teamId && !TEAMS.some((t) => t.id === next.teamId));
  }, [open, user, roles]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveUser(v);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(user ? "Сотрудник обновлён" : "Сотрудник добавлен");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={user ? "Редактировать сотрудника" : "Новый сотрудник"} description="Роль определяет, что сотрудник видит и может менять; команда — область «Команда» в правах">
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Имя и фамилия"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required autoFocus /></Field>
          <Field label="Email (логин)"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required /></Field>
          <Field label="Телефон"><Input value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="+998 90 123-45-67" /></Field>
          <Field label={user ? "Новый пароль" : "Пароль"} hint={user ? "Оставьте пустым, чтобы не менять" : "Не короче 6 символов"}>
            <Input type="password" autoComplete="new-password" value={v.password ?? ""} onChange={(e) => setV({ ...v, password: e.target.value })} required={!user} minLength={6} />
          </Field>
          <Field label="Роль">
            <Select value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Команда">
            <div className="flex gap-2">
              <Select value={customTeam ? "custom" : v.teamId ?? ""} onChange={(e) => { if (e.target.value === "custom") { setCustomTeam(true); setV({ ...v, teamId: "" }); } else { setCustomTeam(false); setV({ ...v, teamId: e.target.value }); } }} className={customTeam ? "w-40" : ""}>
                <option value="">— без команды —</option>
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
                <option value="custom">Своя…</option>
              </Select>
              {customTeam && <Input value={v.teamId ?? ""} onChange={(e) => setV({ ...v, teamId: e.target.value })} placeholder="код команды" />}
            </div>
          </Field>
          <div className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2 sm:col-span-2">
            <div>
              <div className="text-[13px]">Принимает заявки</div>
              <div className="text-xs text-muted">Участвует в автораспределении новых лидов</div>
            </div>
            <div className="flex items-center gap-3">
              {v.acceptsLeads && (
                <label className="flex items-center gap-2 text-xs text-muted">Вес <Input type="number" min={1} max={10} value={v.leadWeight} onChange={(e) => setV({ ...v, leadWeight: Number(e.target.value) })} className="h-8 w-16" /></label>
              )}
              <Switch checked={v.acceptsLeads} onCheckedChange={(acceptsLeads) => setV({ ...v, acceptsLeads })} />
            </div>
          </div>
          <Field label="Навыки" hint="Через запятую: по ним распределяются заявки в режиме «по навыкам»" className="sm:col-span-2">
            <Input value={v.skills.join(", ")} onChange={(e) => setV({ ...v, skills: e.target.value.split(",").map((s) => s.trim()) })} placeholder="кондиционеры, вентиляция" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало дня"><Input type="time" value={v.workStart} onChange={(e) => setV({ ...v, workStart: e.target.value })} /></Field>
            <Field label="Конец дня"><Input type="time" value={v.workEnd} onChange={(e) => setV({ ...v, workEnd: e.target.value })} /></Field>
          </div>
          <Field label="Рабочие дни">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = v.workDays.includes(d);
                return (
                  <button key={d} type="button" onClick={() => setV({ ...v, workDays: on ? v.workDays.filter((x) => x !== d) : [...v.workDays, d].sort() })} className={cn("h-9 flex-1 rounded-[7px] border text-[13px]", on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-surface-2")}>
                    {DAYS[d]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Цвет в календаре" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setV({ ...v, color: c })} className={cn("size-7 rounded-full border-2", v.color.toLowerCase() === c.toLowerCase() ? "border-ink" : "border-transparent")} style={{ background: c }} />
              ))}
              <Input value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="w-28 font-mono" />
            </div>
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{user ? "Сохранить" : "Добавить"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function empty(roles: RoleOption[]): UserInput {
  return { name: "", email: "", phone: "", password: "", roleId: roles.find((r) => r.slug === "manager")?.id ?? roles[0]?.id ?? "", teamId: "sales", acceptsLeads: true, leadWeight: 1, skills: [], workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5], color: COLORS[0] };
}
