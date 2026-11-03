export type ProdStage = { id: string; name: string; order: number; color: string; kind: "open" | "won" | "lost" };
export type ProdUser = { id: string; name: string; color: string; teamId: string | null };
export type ProdOrder = {
  id: string; number: number; title: string; stageId: string | null; status: "queued" | "in_progress" | "done" | "cancelled";
  companyId: string | null; companyName: string | null; dealId: string | null; dealNumber: number | null; dealAmount: number | null;
  assigneeId: string | null; assigneeName: string | null; assigneeColor: string | null;
  qty: number; defects: number; plannedAt: string | null; startedAt: string | null; finishedAt: string | null; notes: string | null; createdAt: string;
};
export type DealForOrder = { id: string; number: number; title: string; company: string | null };
export type CompanyOpt = { id: string; name: string };
export const ORDER_STATUS: Record<ProdOrder["status"], { label: string; tone: "neutral" | "info" | "good" | "accent" }> = {
  queued: { label: "В очереди", tone: "neutral" }, in_progress: { label: "В работе", tone: "info" }, done: { label: "Готово", tone: "good" }, cancelled: { label: "Отменён", tone: "accent" },
};
