"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtMoneyCompact, fmtMoneyShort, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Палитра графиков: данные — рампа синий → лёд → фиолетовый → орхидея (--ramp-1..4), good/warn/accent — семантика */
export const CHART = {
  ink: "var(--ramp-1, #6e96f2)",
  info: "var(--ramp-3, #6656e3)",
  soft: "var(--ramp-2, #d9e4fb)",
  violet: "var(--ramp-4, #bd5fe8)",
  good: "var(--good, #2fd36f)",
  warn: "var(--warn, #ffb000)",
  accent: "var(--accent, #ff2d3f)",
  muted: "var(--ink-2, #9c9c9c)",
  line: "var(--line, #242424)",
  text: "var(--ink-2, #9c9c9c)",
};

export type Series = { key: string; label: string; color: string; money?: boolean };
type Row = Record<string, string | number | null>;

function ChartTooltip({ active, payload, label, series }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | string }[]; label?: string | number; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        if (!s) return null;
        const v = Number(p.value ?? 0);
        return (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
            <span className="tnum font-medium text-ink">{s.money ? fmtMoney(v) : fmtNum(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

const axisProps = { tick: { fontSize: 11, fill: CHART.muted }, axisLine: false, tickLine: false } as const;
const legendProps = { iconType: "circle" as const, iconSize: 8, wrapperStyle: { fontSize: 12, color: CHART.text, paddingTop: 8 } };

/** Вертикальные столбцы: категории по оси X, 1–3 серии */
export function BarsChart({ data, xKey, series, height = 240, className }: { data: Row[]; xKey: string; series: Series[]; height?: number; className?: string }) {
  const money = series.some((s) => s.money);
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART.line} />
          <XAxis dataKey={xKey} {...axisProps} interval={data.length > 8 ? "preserveStartEnd" : 0} minTickGap={12} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)} />
          <YAxis {...axisProps} width={money ? 84 : 44} allowDecimals={false} tickFormatter={(v: number) => (money ? fmtMoneyCompact(v) : fmtNum(v))} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip series={series} />} />
          {series.length > 1 && <Legend {...legendProps} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Линия или область по времени */
export function TrendChart({ data, xKey, series, kind = "line", height = 220, className }: { data: Row[]; xKey: string; series: Series[]; kind?: "line" | "area"; height?: number; className?: string }) {
  const money = series.some((s) => s.money);
  const common = { data, margin: { top: 8, right: 12, left: 0, bottom: 0 } };
  const children = (
    <>
      <CartesianGrid vertical={false} stroke={CHART.line} />
      <XAxis dataKey={xKey} {...axisProps} minTickGap={16} />
      <YAxis {...axisProps} width={money ? 84 : 44} allowDecimals={false} tickFormatter={(v: number) => (money ? fmtMoneyCompact(v) : fmtNum(v))} />
      <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTooltip series={series} />} />
      {series.length > 1 && <Legend {...legendProps} />}
    </>
  );
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "area" ? (
          <AreaChart {...common}>
            {children}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.08} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--canvas)" }} />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {children}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--canvas)" }} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Горизонтальные столбцы (HTML): причины отказов, загрузка и т.п. */
export function HBars({ rows, color = CHART.ink, className }: { rows: { label: string; value: number; display?: string; sub?: string; color?: string }[]; color?: string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="py-6 text-center text-[13px] text-muted">Нет данных за период</div>;
  return (
    <div className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 whitespace-nowrap tnum text-ink-2">{r.display ?? fmtNum(r.value)}{r.sub && <span className="ml-1.5 text-muted">{r.sub}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Воронка по этапам: столбец = сколько сделок дошло до этапа, подпись — открытые сейчас и конверсия дальше */
export function Funnel({ stages, won }: { stages: { name: string; color: string; openCount: number; openSum: number; reached: number; conversion: number | null }[]; won: number }) {
  const max = Math.max(1, ...stages.map((s) => s.reached));
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.name} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <div className="flex min-w-0 items-center gap-2 truncate"><span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.name}</div>
          <div className="flex items-center gap-2">
            <div className="h-6 rounded-[4px]" style={{ background: CHART.ink, width: `${Math.max(2, (s.reached / max) * 100)}%` }} title={`Дошли до этапа: ${s.reached}`} />
            <span className="tnum text-ink-2">{s.reached}</span>
          </div>
          <div className="whitespace-nowrap text-right tnum text-muted">
            <span className="text-ink">{s.openCount} откр.</span> · <span title={fmtMoney(s.openSum)}>{fmtMoneyShort(s.openSum)}</span>
            {s.conversion != null && <span className="ml-2 inline-block rounded-full bg-surface-2 px-1.5 text-xs text-ink-2">→ {s.conversion}%{i === stages.length - 1 ? " оплата" : ""}</span>}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
        <div className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-good" />Оплачено</div>
        <div className="flex items-center gap-2">
          <div className="h-6 rounded-[4px] bg-good" style={{ width: `${Math.max(2, (won / max) * 100)}%` }} />
          <span className="tnum text-ink-2">{won}</span>
        </div>
        <div className="text-right text-muted">за период</div>
      </div>
    </div>
  );
}

/** Полоса долей (одно целое, ≤ 6 сегментов) с легендой */
export function Segments({ parts, total }: { parts: { label: string; value: number; color: string }[]; total?: number }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / Math.max(1, sum)) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.label} <span className="tnum text-ink">{p.value}</span></span>
        ))}
      </div>
    </div>
  );
}
