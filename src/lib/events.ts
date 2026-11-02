import type { AutomationEvent } from "@/db/schema";

export type EventPayload = {
  dealId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  documentId?: string | null;
  paymentId?: string | null;
  bookingId?: string | null;
  conversationId?: string | null;
  callId?: string | null;
  taskId?: string | null;
  userId?: string | null;
  amount?: number;
  fromStage?: string | null;
  toStage?: string | null;
  pipelineKind?: string | null;
  source?: string | null;
  text?: string | null;
};

/** Единая точка: любое событие системы → автоматизации. Ошибки автоматизаций не ломают основной сценарий. */
export async function emit(event: AutomationEvent, payload: EventPayload) {
  try {
    const { runAutomations } = await import("./automations/engine");
    return await runAutomations(event, payload);
  } catch (e) {
    console.error("[automations]", event, e);
    return [];
  }
}
