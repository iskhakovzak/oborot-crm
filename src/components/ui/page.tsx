import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-muted max-w-[72ch]">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-[46ch] text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const toneMap = {
  good: { text: "text-good", chip: "bg-good-soft text-good" },
  warn: { text: "text-warn", chip: "bg-warn-soft text-warn" },
  accent: { text: "text-accent", chip: "bg-accent-soft text-accent" },
  info: { text: "text-info", chip: "bg-info-soft text-info" },
  brand: { text: "text-brand-ink", chip: "bg-brand-soft text-brand" },
} as const;

export function Stat({ label, value, sub, tone, icon, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: keyof typeof toneMap; icon?: React.ReactNode; className?: string }) {
  const t = tone ? toneMap[tone] : null;
  return (
    <div className={cn("card relative overflow-hidden px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12.5px] font-medium text-muted">{label}</div>
        {icon && <div className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4", t?.chip ?? "bg-surface-3 text-ink-2")}>{icon}</div>}
      </div>
      <div className={cn("mt-2 text-[26px] font-semibold leading-8 tnum tracking-[-0.02em]", t?.text)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Section({ title, description, action, children, className }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold leading-6">{title}</h2>}
            {description && <p className="text-[13px] text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
