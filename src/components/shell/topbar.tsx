"use client";
import { useEffect, useState } from "react";
import { Search, Plus, LogOut, Bell } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";
import Link from "next/link";

export function Topbar({ user, onLogout, openTasks, allowed }: { user: { name: string; color: string; roleName: string; email: string }; onLogout: () => Promise<void>; openTasks: number; allowed: Record<string, boolean> }) {
  const [open, setOpen] = useState(false);
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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:px-7">
      <MobileNav allowed={allowed} />
      <button
        onClick={() => setOpen(true)}
        className="pressable flex h-8 w-full max-w-sm items-center gap-2 rounded-[6px] border border-line bg-canvas px-2.5 text-[11.5px] text-ink-2 hover:text-ink"
      >
        <Search className="size-4" />
        <span>Найти клиента, сделку, документ…</span>
        <kbd className="ml-auto rounded-[5px] border border-line-strong border-b-2 bg-canvas px-1.5 text-[9.5px] text-ink-2">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="md">
              <Plus /> Создать
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
        <Link href="/tasks" className="pressable relative grid size-8 place-items-center rounded-full border border-line text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Задачи">
          <Bell className="size-4" />
          {openTasks > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[9.5px] font-semibold leading-[14px] text-white">{openTasks}</span>}
        </Link>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="pressable flex items-center gap-2 rounded-full border border-line p-0.5" aria-label="Профиль">
              <Avatar name={user.name} color={user.color} size={26} />
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
