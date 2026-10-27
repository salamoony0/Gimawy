import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import { fmtDay, parseDay } from '../lib/format';

// ---------- Rings ----------

/** Concentric progress rings. Values over 100% wrap with a brighter overlap arc. */
export function Rings({
  rings,
  size = 160,
  stroke = 12,
  gap = 4,
  children,
  label,
}: {
  rings: { value: number; color: string; label: string }[];
  size?: number;
  stroke?: number;
  gap?: number;
  children?: ReactNode;
  label: string;
}) {
  const c = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="-rotate-90">
        {rings.map((ring, i) => {
          const r = c - stroke / 2 - i * (stroke + gap);
          const circ = 2 * Math.PI * r;
          const pct = Math.max(0, ring.value);
          const main = Math.min(pct, 1);
          const over = Math.min(Math.max(pct - 1, 0), 1);
          return (
            <g key={ring.label}>
              <circle cx={c} cy={c} r={r} fill="none" stroke={ring.color} strokeOpacity={0.14} strokeWidth={stroke} />
              <motion.circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circ}
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: circ * (1 - main) }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
              />
              {over > 0 && (
                <motion.circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={0.55}
                  strokeWidth={stroke * 0.4}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  initial={{ strokeDashoffset: circ }}
                  animate={{ strokeDashoffset: circ * (1 - over) }}
                  transition={{ duration: 0.8, delay: 1 }}
                />
              )}
            </g>
          );
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

export function MacroLegend({
  items,
  className,
}: {
  items: { label: string; value: number; target: number; color: string; unit?: string }[];
  className?: string;
}) {
  return (
    <ul className={clsx('flex flex-col gap-3', className)}>
      {items.map((m) => {
        const pct = m.target ? m.value / m.target : 0;
        return (
          <li key={m.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: m.color }} aria-hidden />
                {m.label}
              </span>
              <span className="num text-muted">
                <span className="font-semibold text-fg">{Math.round(m.value)}</span> / {m.target}
                {m.unit ?? 'g'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: m.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pct, 1) * 100}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Activity heatmap ----------

const LEVEL_BG = [
  'bg-surface-3',
  'bg-brand/25',
  'bg-brand/45',
  'bg-brand/70',
  'bg-brand',
];

export function Heatmap({
  days,
}: {
  days: { date: string; strength: number; cardio: number; minutes: number; level: number; future: boolean }[];
}) {
  // Columns are weeks (Mon → Sun top to bottom).
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  // Label a column when its week starts a new month, skipping labels that would collide.
  let lastLabelled = -3;
  const monthLabels = weeks.map((w, i) => {
    const m = parseDay(w[0].date).getMonth();
    const prev = i > 0 ? parseDay(weeks[i - 1][0].date).getMonth() : -1;
    if (m === prev || i - lastLabelled < 3) return '';
    lastLabelled = i;
    return fmtDay(w[0].date, { month: 'short' });
  });
  const active = days.filter((d) => d.level > 0).length;

  return (
    <div>
      <div className="overflow-x-auto scrollbar-none">
        <div className="inline-flex min-w-full flex-col gap-1.5">
          <div className="flex gap-[3px] pl-7 text-[10px] text-subtle" aria-hidden>
            {monthLabels.map((m, i) => (
              <span key={i} className="w-[15px] shrink-0 overflow-visible whitespace-nowrap sm:w-[17px]">
                {m}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-6 flex-col justify-between py-0.5 text-[10px] leading-none text-subtle" aria-hidden>
              <span>M</span>
              <span>T</span>
              <span>S</span>
            </div>
            <div className="flex gap-[3px]" role="img" aria-label={`Activity over the last ${weeks.length} weeks: ${active} active days`}>
              {weeks.map((w, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {w.map((d) => {
                    const parts = [
                      d.strength ? `${d.strength} workout${d.strength > 1 ? 's' : ''}` : '',
                      d.cardio ? `${d.cardio} cardio` : '',
                    ].filter(Boolean);
                    return (
                      <motion.div
                        key={d.date}
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: wi * 0.018, duration: 0.25 }}
                        title={`${fmtDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${parts.join(' + ') || 'Rest'}${d.minutes ? ` · ${d.minutes} min` : ''}`}
                        className={clsx(
                          'relative size-[15px] rounded-[4px] sm:size-[17px]',
                          d.future ? 'border border-dashed border-line bg-transparent' : LEVEL_BG[d.level],
                        )}
                      >
                        {d.cardio > 0 && !d.future && (
                          <span className="absolute right-[2px] top-[2px] size-[5px] rounded-full bg-cardio ring-1 ring-bg" aria-hidden />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          Less
          {LEVEL_BG.map((c) => (
            <span key={c} className={clsx('size-3 rounded-[3px]', c)} aria-hidden />
          ))}
          More
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-cardio" aria-hidden /> Cardio day
        </span>
      </div>
    </div>
  );
}

// ---------- Recharts helpers ----------

export const axisProps = {
  stroke: 'var(--color-subtle)',
  tick: { fill: 'var(--color-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: 'var(--color-line)', strokeDasharray: '3 5', vertical: false } as const;

type TooltipPayload = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  format?: (v: number, key: string) => string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl shadow-black/50 backdrop-blur">
      {label != null && <p className="mb-1 font-semibold text-fg">{labelFormat ? labelFormat(String(label)) : label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="num flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}:{' '}
          <span className="font-semibold text-fg">
            {format && typeof p.value === 'number' ? format(p.value, String(p.dataKey)) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function GradientDefs({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.35} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}
