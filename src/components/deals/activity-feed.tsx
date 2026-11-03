import { StickyNote, Phone, Mail, MessageSquare, GitBranch, FileText, CreditCard, Cog, CheckSquare, Sparkles } from "lucide-react";
import type { ActivityType } from "@/db/schema";
import { Avatar } from "@/components/ui/avatar";
import { fmtDateTime, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ActivityRow = { id: string; type: ActivityType; title: string; body: string | null; createdAt: string; userName: string | null; userColor: string | null };

const ICONS: Record<ActivityType, { icon: React.ReactNode; cls: string }> = {
  note: { icon: <StickyNote />, cls: "bg-warn-soft text-warn" },
  call: { icon: <Phone />, cls: "bg-good-soft text-good" },
  email: { icon: <Mail />, cls: "bg-info-soft text-info" },
  message: { icon: <MessageSquare />, cls: "bg-info-soft text-info" },
  stage: { icon: <GitBranch />, cls: "bg-violet-soft text-violet" },
  document: { icon: <FileText />, cls: "bg-surface-2 text-ink-2" },
  payment: { icon: <CreditCard />, cls: "bg-good-soft text-good" },
  system: { icon: <Cog />, cls: "bg-surface-2 text-muted" },
  task: { icon: <CheckSquare />, cls: "bg-info-soft text-info" },
  ai: { icon: <Sparkles />, cls: "bg-violet-soft text-violet" },
};

export function ActivityFeed({ items, emptyText = "Пока ничего не происходило." }: { items: ActivityRow[]; emptyText?: string }) {
  if (!items.length) return <p className="text-[13px] text-muted">{emptyText}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-px before:bg-line">
      {items.map((a) => {
        const ic = ICONS[a.type] ?? ICONS.system;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 border-surface [&_svg]:size-3.5", ic.cls)}>{ic.icon}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-[13px] leading-5">{a.title}</div>
              {a.body && <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-5 text-ink-2">{a.body}</div>}
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                {a.userName && <><Avatar name={a.userName} color={a.userColor ?? undefined} size={14} /><span>{a.userName}</span><span>·</span></>}
                <time dateTime={a.createdAt} title={fmtDateTime(a.createdAt)}>{relTime(a.createdAt)}</time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
