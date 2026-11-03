"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncFinanceAction } from "@/app/(app)/finance/actions";

export function SyncFinanceButton({ canEdit, unsynced }: { canEdit: boolean; unsynced: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  return (
    <Button onClick={() => start(async () => { const r = await syncFinanceAction(); if (r.ok) toast.success(r.message); else toast.error(r.error); router.refresh(); })} disabled={pending} variant={unsynced ? "primary" : "secondary"}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Синхронизировать оплаты{unsynced ? ` (${unsynced})` : ""}
    </Button>
  );
}
