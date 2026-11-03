"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/page";
import { saveProfile } from "@/app/(app)/settings/actions";

export function ProfileForm({ user }: { user: { name: string; email: string; phone: string | null; color: string; roleName: string; teamLabel: string; telegramLinked: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password && password !== confirm) { toast.error("Пароли не совпадают"); return; }
    start(async () => {
      const r = await saveProfile({ name, phone, password: password || null });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(password ? "Профиль и пароль обновлены" : "Профиль обновлён");
      setPassword(""); setConfirm("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Профиль">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={user.name} color={user.color} size={48} />
          <div>
            <div className="text-[15px] font-semibold">{user.name}</div>
            <div className="text-[13px] text-muted">{user.email}</div>
            <div className="mt-1 flex gap-1.5"><Badge tone="ink">{user.roleName}</Badge><Badge>{user.teamLabel}</Badge>{user.telegramLinked && <Badge tone="good">Telegram привязан</Badge>}</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя и фамилия"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123-45-67" /></Field>
        </div>
      </Section>
      <Section title="Смена пароля" description="Оставьте поля пустыми, если пароль менять не нужно">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Новый пароль"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} /></Field>
          <Field label="Повторите пароль"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
      </Section>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>Сохранить</Button>
      </div>
    </form>
  );
}
