"use client";
import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Star, Phone, Mail, Send, MessageCircle } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/page";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { phoneFmt } from "@/lib/format";
import { addContact, updateContact, deleteContact, type ContactInput } from "@/app/(app)/companies/actions";

export type ContactRow = { id: string; name: string; position: string | null; phone: string | null; email: string | null; telegram: string | null; whatsapp: string | null; max: string | null; instagram: string | null; isPrimary: boolean; birthday: string | null };

const EMPTY: ContactInput = { name: "", position: "", phone: "", email: "", telegram: "", whatsapp: "", max: "", instagram: "", isPrimary: false, birthday: "" };

export function CompanyContacts({ companyId, contacts, canCreate, canEdit, canDelete, hidden }: { companyId: string; contacts: ContactRow[]; canCreate: boolean; canEdit: boolean; canDelete: boolean; hidden: string[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: string | null; values: ContactInput } | null>(null);
  const show = (f: string) => !hidden.includes(f);

  function save() {
    if (!editing) return;
    start(async () => {
      const r = editing.id ? await updateContact(editing.id, editing.values) : await addContact(companyId, editing.values);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(editing.id ? "Контакт обновлён" : "Контакт добавлен");
      setEditing(null);
    });
  }
  function remove(c: ContactRow) {
    if (!confirm(`Удалить контакт «${c.name}»?`)) return;
    start(async () => {
      const r = await deleteContact(c.id);
      if ("error" in r) toast.error(r.error);
    });
  }
  const set = (patch: Partial<ContactInput>) => editing && setEditing({ ...editing, values: { ...editing.values, ...patch } });

  return (
    <Section title="Контакты" description={contacts.length ? `${contacts.length} чел.` : undefined} action={canCreate && <Button size="sm" variant="secondary" onClick={() => setEditing({ id: null, values: { ...EMPTY, isPrimary: contacts.length === 0 } })}><Plus /> Контакт</Button>}>
      {!contacts.length ? (
        <p className="text-[13px] text-muted">Контактных лиц пока нет. Добавьте, чтобы звонить и писать клиенту в один клик.</p>
      ) : (
        <ul className="divide-y divide-line -my-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2.5">
              <Avatar name={c.name} size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.isPrimary && <Badge tone="ink" className="px-1.5 py-0 text-[11px]"><Star className="size-3" /> основной</Badge>}
                  {c.position && <span className="text-[12.5px] text-muted">{c.position}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
                  {show("phone") && c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 tnum hover:underline"><Phone className="size-3.5 text-muted" />{phoneFmt(c.phone)}</a>}
                  {show("email") && c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="size-3.5 text-muted" />{c.email}</a>}
                  {show("telegram") && c.telegram && <span className="inline-flex items-center gap-1"><Send className="size-3.5 text-muted" />Telegram</span>}
                  {show("whatsapp") && c.whatsapp && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5 text-muted" />WhatsApp</span>}
                  {c.max && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5 text-muted" />MAX</span>}
                  {c.instagram && <span className="inline-flex items-center gap-1"><InstagramIcon className="size-3.5 text-muted" />Instagram</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {canEdit && <button type="button" onClick={() => setEditing({ id: c.id, values: { name: c.name, position: c.position ?? "", phone: c.phone ?? "", email: c.email ?? "", telegram: c.telegram ?? "", whatsapp: c.whatsapp ?? "", max: c.max ?? "", instagram: c.instagram ?? "", isPrimary: c.isPrimary, birthday: c.birthday ?? "" } })} className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-ink" aria-label="Изменить"><Pencil className="size-4" /></button>}
                {canDelete && <button type="button" onClick={() => remove(c)} disabled={pending} className="rounded-md p-1.5 text-muted hover:bg-accent-soft hover:text-accent" aria-label="Удалить"><Trash2 className="size-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? "Контакт" : "Новый контакт"}>
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Имя"><Input value={editing.values.name} onChange={(e) => set({ name: e.target.value })} required autoFocus placeholder="Фамилия Имя Отчество" /></Field>
                <Field label="Должность"><Input value={editing.values.position ?? ""} onChange={(e) => set({ position: e.target.value })} placeholder="Директор" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Телефон"><Input value={editing.values.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+998 90 123-45-67" /></Field>
                <Field label="Email"><Input type="email" value={editing.values.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telegram" hint="chat id или @username"><Input value={editing.values.telegram ?? ""} onChange={(e) => set({ telegram: e.target.value })} /></Field>
                <Field label="WhatsApp" hint="номер без +"><Input value={editing.values.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="MAX"><Input value={editing.values.max ?? ""} onChange={(e) => set({ max: e.target.value })} /></Field>
                <Field label="Instagram" hint="@username или ID аккаунта"><Input value={editing.values.instagram ?? ""} onChange={(e) => set({ instagram: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="День рождения"><Input type="date" value={editing.values.birthday ?? ""} onChange={(e) => set({ birthday: e.target.value })} /></Field>
                <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" checked={!!editing.values.isPrimary} onChange={(e) => set({ isPrimary: e.target.checked })} className="size-4 accent-ink" /> Основной контакт</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Отмена</Button>
                <Button type="submit" disabled={pending || !editing.values.name.trim()}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}
