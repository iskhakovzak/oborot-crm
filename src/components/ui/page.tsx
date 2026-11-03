import { cn } from "@/lib/utils";

/** Заголовок страницы: «// РАЗДЕЛ», заголовок 36/700, моно-подпись и действия справа */
export function PageHeader({ title, description, actions, eyebrow, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rise mb-7 flex flex-wrap items-end justify-between gap-5", className)} style={{ ["--rise-i" as string]: 0 }}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2.5 truncate">{`// ${eyebrow}`}</div>}
        <h1 className="text-[32px] font-bold leading-none tracking-[-0.035em] sm:text-[38px]">{title}</h1>
        {description && <p className="mt-3 max-w-[72ch] text-[11.5px] leading-relaxed text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-full border border-line text-ink-2 [&_svg]:size-5">{icon}</div>}
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-[46ch] text-[12px] text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const toneMap = { good: "text-good", warn: "text-warn", accent: "text-accent", info: "text-info", brand: "text-ink" } as const;

/** Плитка показателя: подпись капсом, крупная цифра */
export function Stat({ label, value, sub, tone, icon, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: keyof typeof toneMap; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card rise px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="label">{label}</div>
        {icon && <div className="text-ink-2 [&_svg]:size-4">{icon}</div>}
      </div>
      <div className={cn("bigstat mt-3 truncate", tone ? toneMap[tone] : "")} title={typeof value === "string" ? value : undefined}>{value}</div>
      {sub && <div className="mt-2 text-[11.5px] text-ink-2">{sub}</div>}
    </div>
  );
}

/** Секция-карточка: заголовок 17/600, моно-подпись, действия */
export function Section({ title, description, action, children, className }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card rise", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-1">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.01em]">{title}</h2>}
            {description && <p className="text-[11.5px] text-ink-2">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
