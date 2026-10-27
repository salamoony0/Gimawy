import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { CircleCheck, Info, LoaderCircle, TrendingDown, TrendingUp, X } from 'lucide-react';

// ---------- Button ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

/** Button styling, also used for router links that should look like buttons. */
export function buttonClass(variant: ButtonProps['variant'] = 'primary', size: ButtonProps['size'] = 'md', className?: string) {
  return clsx(
    'inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,transform,opacity,border-color] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    size === 'sm' && 'min-h-9 px-3 text-sm',
    size === 'md' && 'min-h-11 px-4 text-[15px]',
    size === 'lg' && 'min-h-13 px-6 text-base',
    variant === 'primary' && 'bg-brand text-on-brand hover:bg-brand-strong',
    variant === 'secondary' && 'border border-line-strong bg-surface-2 text-fg hover:border-brand/50 hover:bg-surface-3',
    variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
    variant === 'danger' && 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
    className,
  );
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg active:scale-95 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------- Form ----------

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 text-[16px] text-fg placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-brand focus:outline-none focus-visible:outline-none';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(inputClass, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(inputClass, 'cursor-pointer appearance-none pr-8', className)}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('flex rounded-xl border border-line bg-surface p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-150',
              active ? 'text-on-brand' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${label}`}
                className="absolute inset-0 rounded-lg bg-brand"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sheet (bottom sheet on mobile, dialog on desktop) ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl shadow-black/60 outline-none sm:max-w-lg sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
              <h2 id={titleId} className="font-display text-2xl font-semibold tracking-wide">
                {title}
              </h2>
              <IconButton label="Close" onClick={onClose} className="-mr-2">
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="border-t border-line px-5 py-4 pb-safe">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- Feedback ----------

type Toast = { id: number; message: string; tone: 'success' | 'info' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -16, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0, transition: { duration: 0.15 } }}
              className={clsx(
                'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl shadow-black/50 backdrop-blur-md',
                t.tone === 'error' ? 'border-danger/40 bg-[#1c0f0f]/95 text-danger' : 'border-brand/30 bg-surface-2/95 text-fg',
              )}
            >
              {t.tone === 'error' ? (
                <Info className="size-4 shrink-0" aria-hidden />
              ) : (
                <CircleCheck className="size-4 shrink-0 text-brand" aria-hidden />
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-surface-2', className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('size-5 animate-spin text-brand', className)} aria-label="Loading" />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">{icon}</div>
      <div>
        <p className="font-display text-xl font-semibold tracking-wide">{title}</p>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

// ---------- Data display ----------

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx('card p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="font-display text-xl font-semibold tracking-wide">{title}</h2>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  delta,
  deltaSuffix = '',
  deltaGoodWhen = 'up',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number | null;
  deltaSuffix?: string;
  deltaGoodWhen?: 'up' | 'down';
  icon?: ReactNode;
  className?: string;
}) {
  const good = delta != null && (deltaGoodWhen === 'up' ? delta >= 0 : delta <= 0);
  return (
    <div className={clsx('card flex flex-col gap-1 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {icon && <span className="text-brand">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num font-display text-[2rem] font-semibold leading-none">{value}</span>
        {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </div>
      {delta != null && (
        <span className={clsx('num flex items-center gap-1 text-xs font-semibold', good ? 'text-brand' : 'text-danger')}>
          {delta >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          {delta > 0 ? '+' : ''}
          {delta}
          {deltaSuffix}
        </span>
      )}
    </div>
  );
}

export function Bar({ value, className, color = 'var(--color-brand)', label }: { value: number; className?: string; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx('h-2 overflow-hidden rounded-full bg-surface-3', className)}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function Badge({ children, tone = 'brand', className }: { children: ReactNode; tone?: 'brand' | 'muted' | 'pr' | 'cardio'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        tone === 'brand' && 'bg-brand/15 text-brand',
        tone === 'muted' && 'bg-surface-3 text-muted',
        tone === 'pr' && 'bg-pr/15 text-pr',
        tone === 'cardio' && 'bg-cardio/15 text-cardio',
        className,
      )}
    >
      {children}
    </span>
  );
}
