"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, LogOut, Bell, Menu } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";
import Link from "next/link";

export function Topbar({ user, onLogout, openTasks }: { user: { name: string; color: string; roleName: string; email: string }; onLogout: () => Promise<void>; openTasks: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 backdrop-blur px-4 lg:px-6">
      <button className="lg:hidden rounded-md p-1.5 text-ink-2 hover:bg-black/5" aria-label="Меню" onClick={() => router.push("/")}>
        <Menu className="size-5" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-[9px] border border-line bg-surface-2 px-3 text-[13px] text-muted hover:border-line-strong"
      >
        <Search className="size-4" />
        <span>Найти клиента, сделку, документ…</span>
        <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[11px] text-muted">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Создать
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem asChild><Link href="/deals?new=1">Сделку</Link></DropdownItem>
            <DropdownItem asChild><Link href="/companies?new=1">Клиента</Link></DropdownItem>
            <DropdownItem asChild><Link href="/tasks?new=1">Задачу</Link></DropdownItem>
            <DropdownItem asChild><Link href="/documents?new=invoice">Счёт</Link></DropdownItem>
            <DropdownItem asChild><Link href="/campaigns?new=1">Рассылку</Link></DropdownItem>
          </DropdownContent>
        </Dropdown>
        <Link href="/tasks" className="relative rounded-md p-2 text-ink-2 hover:bg-black/5" aria-label="Задачи">
          <Bell className="size-4" />
          {openTasks > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{openTasks}</span>}
        </Link>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="flex items-center gap-2 rounded-full p-0.5 hover:bg-black/5" aria-label="Профиль">
              <Avatar name={user.name} color={user.color} size={30} />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>
              <div className="text-ink font-medium text-[13px]">{user.name}</div>
              <div>{user.roleName} · {user.email}</div>
            </DropdownLabel>
            <DropdownSeparator />
            <DropdownItem asChild><Link href="/settings">Настройки</Link></DropdownItem>
            <DropdownItem danger onSelect={() => onLogout()}>
              <LogOut /> Выйти
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </header>
  );
}
