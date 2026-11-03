export type StageInfo = { id: string; name: string; color: string; kind: "open" | "won" | "lost"; order: number; probability: number };

export type PipelineInfo = { id: string; name: string; kind: "sales" | "shipping" | "service" | "production"; stages: StageInfo[] };

export type KanbanDeal = {
  id: string;
  number: number;
  title: string;
  companyId: string | null;
  companyName: string | null;
  amount: number | null;
  managerName: string | null;
  managerColor: string | null;
  stageId: string;
  daysOnStage: number;
  source: string | null;
  status: "open" | "won" | "lost";
  updatedAt: string;
  canEdit: boolean;
};

export type Option = { id: string; name: string };

export const SOURCES = ["Сайт", "Яндекс Директ", "Google Ads", "OLX", "Telegram-канал", "Instagram", "Рекомендация", "Холодный звонок", "Выставка", "Входящий звонок", "Другое"];

export function daysSince(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000));
}
