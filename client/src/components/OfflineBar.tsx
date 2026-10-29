import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { CloudUpload, WifiOff } from 'lucide-react';
import { syncOutbox } from '../lib/api';
import { useOnline, useOutbox } from '../lib/offline';
import { Button, useToast } from './ui';

/** Sends queued offline writes when possible and shows what's waiting. Mounted once, inside the signed-in layout. */
export function OfflineBar() {
  const online = useOnline();
  const pending = useOutbox();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const sync = async (manual = false) => {
    setBusy(true);
    try {
      const { sent, failed } = await syncOutbox();
      if (sent) {
        await qc.invalidateQueries();
        toast(`Synced ${sent} offline ${sent === 1 ? 'change' : 'changes'}`);
      }
      for (const f of failed) toast(`Couldn’t save “${f.label}”: ${f.message}`, 'error');
      if (manual && !sent && !failed.length) toast('Still can’t reach the server. It’ll keep trying.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Try on mount, whenever the browser says it's back online, and every 30 s while anything is waiting
  // (navigator.onLine isn't reliable on every phone, so don't only wait for the event).
  const count = pending.length;
  useEffect(() => {
    if (!count || !online) return;
    void sync();
    const t = setInterval(() => void sync(), 30_000);
    return () => clearInterval(t);
  }, [count > 0, online]);

  const show = !online || count > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          role="status"
        >
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
            {online ? <CloudUpload className="size-4 shrink-0" aria-hidden /> : <WifiOff className="size-4 shrink-0" aria-hidden />}
            <p className="flex-1">
              {!online && 'You’re offline. '}
              {count
                ? `${count} ${count === 1 ? 'entry is' : 'entries are'} saved on this device and will sync when you’re back online.`
                : 'You can keep logging workouts, food, cardio and weigh-ins.'}
            </p>
            {online && count > 0 && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => void sync(true)}>
                Sync now
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
