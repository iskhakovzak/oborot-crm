"use client";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendExport } from "@/app/(app)/analytics/actions";

export function ResendButton({ exportId }: { exportId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resendExport(exportId);
          if (r.ok) toast.success("Конверсия отправлена", { description: r.message });
          else toast.error("Не удалось отправить", { description: r.message });
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} /> Отправить повторно
    </Button>
  );
}
