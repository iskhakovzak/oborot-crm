"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duplicateCampaign, sendCampaignAction, deleteCampaign } from "@/app/(app)/campaigns/actions";

export function CampaignActions({ id, status, canEdit, canDelete }: { id: string; status: string; canEdit: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      {status === "draft" && canDelete && (
        <Button variant="ghost" disabled={pending} onClick={() => { if (!confirm("Удалить черновик рассылки?")) return; start(async () => { const r = await deleteCampaign(id); if (!r.ok) { toast.error(r.error); return; } toast.success("Черновик удалён"); router.push("/campaigns"); }); }}>
          <Trash2 /> Удалить
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await duplicateCampaign(id); if (!r.ok) { toast.error(r.error); return; } toast.success("Создана копия рассылки"); router.push(`/campaigns/${r.id}`); })}>
        <Copy /> Дублировать
      </Button>
      {status === "draft" && canEdit && (
        <Button disabled={pending} onClick={() => start(async () => { const r = await sendCampaignAction(id); if (!r.ok) { toast.error(r.message); return; } toast.success(r.message); router.refresh(); })}>
          <Send /> Отправить сейчас
        </Button>
      )}
    </div>
  );
}
