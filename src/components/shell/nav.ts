import {
  LayoutDashboard, KanbanSquare, Building2, MessagesSquare, PhoneCall, CheckSquare, CalendarDays, Package, FileText, Landmark,
  Factory, BarChart3, Megaphone, Workflow, Plug, Settings, Bot, Sparkles,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; entity?: string };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Работа",
    items: [
      { href: "/", label: "Рабочий стол", icon: LayoutDashboard },
      { href: "/deals", label: "Сделки", icon: KanbanSquare, entity: "deals" },
      { href: "/companies", label: "Клиенты", icon: Building2, entity: "companies" },
      { href: "/inbox", label: "Переписки", icon: MessagesSquare, entity: "conversations" },
      { href: "/calls", label: "Звонки", icon: PhoneCall, entity: "calls" },
      { href: "/tasks", label: "Задачи", icon: CheckSquare, entity: "tasks" },
      { href: "/calendar", label: "Календарь", icon: CalendarDays, entity: "bookings" },
    ],
  },
  {
    title: "Деньги и документы",
    items: [
      { href: "/products", label: "Товары", icon: Package, entity: "products" },
      { href: "/documents", label: "Документы", icon: FileText, entity: "documents" },
      { href: "/finance", label: "Финансы", icon: Landmark, entity: "payments" },
      { href: "/production", label: "Производство", icon: Factory, entity: "production" },
    ],
  },
  {
    title: "Рост",
    items: [
      { href: "/analytics", label: "Аналитика", icon: BarChart3, entity: "analytics" },
      { href: "/campaigns", label: "Рассылки", icon: Megaphone, entity: "campaigns" },
      { href: "/ai", label: "ИИ-помощник", icon: Sparkles },
    ],
  },
  {
    title: "Система",
    items: [
      { href: "/automations", label: "Автоматизации", icon: Workflow, entity: "automations" },
      { href: "/integrations", label: "Интеграции", icon: Plug, entity: "integrations" },
      { href: "/telegram", label: "Telegram-бот", icon: Bot, entity: "settings" },
      { href: "/settings", label: "Настройки", icon: Settings, entity: "settings" },
    ],
  },
];
