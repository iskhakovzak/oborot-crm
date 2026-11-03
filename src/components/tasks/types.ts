export type TaskSource = "manual" | "automation" | "telegram" | "ai";
export type TaskPriority = "low" | "normal" | "high";

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: "open" | "done" | "cancelled";
  source: TaskSource;
  dueAt: string | null;
  dueLabel: string;
  dueExact: string;
  overdue: boolean;
  completedAt: string | null;
  completedLabel: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  dealId: string | null;
  dealTitle: string | null;
  companyId: string | null;
  companyName: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type TaskGroup = { key: string; title: string; tasks: TaskRowData[] };

export type Option = { id: string; name: string; color?: string };

export const SOURCE_LABELS: Record<TaskSource, string> = { manual: "вручную", automation: "автоматически", telegram: "из Telegram", ai: "ИИ" };
export const PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Низкий", normal: "Обычный", high: "Высокий" };

/** Значение для input[type=datetime-local] в локальном времени браузера */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
