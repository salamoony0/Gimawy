import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { ChartLine, Dumbbell, House, Scale, Settings, Timer, Utensils } from 'lucide-react';
import { useActiveWorkout } from '../lib/activeWorkout';
import { useMe } from '../lib/format';
import { setOutboxOwner } from '../lib/offline';
import { OfflineBar } from './OfflineBar';
import { AutoAdjustTargets } from './AdaptiveTargets';

const NAV = [
  { to: '/', label: 'Today', icon: House, end: true },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/food', label: 'Food', icon: Utensils },
  { to: '/body', label: 'Body', icon: Scale },
  { to: '/progress', label: 'Progress', icon: ChartLine },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('flex items-center gap-2', className)}>
      <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
      <span className="font-display text-2xl font-bold uppercase tracking-wider">
        Gym<span className="text-brand">awy</span>
      </span>
    </span>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="num">
      {h ? `${h}:` : ''}
      {String(m).padStart(h ? 2 : 1, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

export function Layout() {
  const { data: me } = useMe();
  const active = useActiveWorkout();
  const { pathname } = useLocation();
  const onLogger = pathname === '/train/log';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Offline entries and cached API responses are tied to the signed-in account.
  useEffect(() => {
    setOutboxOwner(me?.id ?? null);
  }, [me?.id]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface/60 px-4 py-6 lg:flex">
        <Link to="/" className="px-2">
          <Logo />
        </Link>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold transition-colors duration-150',
                  isActive ? 'bg-brand/12 text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          {active && !onLogger && (
            <Link to="/train/log" className="glow flex items-center gap-3 rounded-2xl border border-brand/40 p-3">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
              </span>
              <span className="flex-1 truncate text-sm font-semibold">{active.name}</span>
              <span className="text-sm text-brand">
                {active.editingId ? null : <Elapsed since={active.startedAt} />}
              </span>
            </Link>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:bg-surface-2',
                isActive && 'border-brand/40',
              )
            }
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-brand/15 font-display text-lg font-bold text-brand">
              {me?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{me?.name}</span>
              <span className="block truncate text-xs text-muted">Settings</span>
            </span>
            <Settings className="size-4 text-muted" aria-hidden />
          </NavLink>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-bg/80 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Link to="/" aria-label="Gymawy home">
          <Logo />
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-full"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-brand/15 font-display text-lg font-bold text-brand">
            {me?.name?.[0]?.toUpperCase() ?? '?'}
          </span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
        <OfflineBar />
        {me?.autoAdjustTargets && <AutoAdjustTargets me={me} />}
        <Outlet />
      </main>

      {/* Mobile: active workout pill + bottom nav */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <AnimatePresence>
          {active && !onLogger && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="px-3 pb-2">
              <Link
                to="/train/log"
                className="glow flex min-h-12 items-center gap-3 rounded-2xl border border-brand/40 px-4 shadow-lg shadow-black/60"
              >
                <Timer className="size-4 text-brand" aria-hidden />
                <span className="flex-1 truncate text-sm font-semibold">{active.editingId ? `Editing ${active.name}` : `${active.name} in progress`}</span>
                <span className="text-sm font-semibold text-brand">
                  {active.editingId ? null : <Elapsed since={active.startedAt} />}
                </span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
        <nav aria-label="Main" className="border-t border-line bg-bg/90 backdrop-blur-xl pb-safe">
          <ul className="mx-auto flex max-w-md">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      'relative flex min-h-15 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-150',
                      isActive ? 'text-brand' : 'text-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute top-0 h-0.5 w-8 rounded-full bg-brand"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon className="size-[22px]" aria-hidden strokeWidth={isActive ? 2.4 : 2} />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-1">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
