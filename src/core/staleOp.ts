/**
 * S-101 — THE DOOR OF THE STUCK-ITEMS CLEANUP: `farm.cleanup`. The same
 * `cleanStale` body as the status-bar chip's review and the notification's
 * "Clean now" (staleCleanup.ts).
 */
import { BridgeRegistry, optBool, optStr } from './bridge';
import { StaleDeps, StaleItem, cleanStale, fmtAge, staleLines, staleNow } from './staleScan';

const view = (x: StaleItem) => ({ kind: x.kind, id: x.id, title: x.title, age: fmtAge(x.ageMs), why: x.why, ...(x.cardId ? { cardId: x.cardId } : {}) });

export function registerStaleOp(bridge: BridgeRegistry, d: StaleDeps, onChange?: () => void): void {
    bridge.register([{
        op: 'farm.cleanup',
        describe: 'S-101 — WHAT IS STUCK, AND CLEANING IT: records a restart does NOT clear, because they are kept on disk so no work is lost — task rows queued and never started, rows still "running" with nothing working, relay batons still waiting, idle Console cards. Anything waiting 24 hours or more is counted (a shorter wait is somebody\'s pause). Without apply it only answers the list (kind, id, title, age, why) and the lines the status-bar chip shows; apply=true cleans them — all, or only ids= — the same body as the chip\'s review and the daily notification\'s Clean now. Nothing is deleted: rows are cancelled, batons stopped, cards closed (resumable). args: apply? (default false), ids? (array or comma-separated; default every stuck item), by? (who, recorded on stopped batons)',
        handler: (args) => {
            const items = staleNow(d);
            if (!optBool(args, 'apply', false)) { return { count: items.length, lines: staleLines(items), items: items.map(view) }; }
            const raw = args.ids;
            const ids = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw.trim() ? raw.split(',').map(s => s.trim()) : undefined;
            const r = cleanStale(d, ids, optStr(args, 'by') || 'an agent (bridge)');
            onChange?.();
            return { cleaned: r.cleaned.map(view), failed: r.failed.map(f => ({ ...view(f.item), error: f.why })), left: staleNow(d).length };
        }
    }]);
}
