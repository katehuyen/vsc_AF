import { BridgeRegistry, need } from './bridge';
import { isTerminal, WorkItem, WorkQueueStore } from './workqueue';

/**
 * N-11 — THE QUEUE'S BULK HAND. The un-deletable rule holds for a list exactly
 * as it does for one item: only a HANDLED item (done · dropped) is deleted, and
 * a live one among the ids is spared and named in `live` — drop it first.
 */
export function removeMany(
    store: WorkQueueStore, ids: string[]
): { deleted: number; live: string[]; missing: string[] } {
    const want = new Set(ids);
    const missing = ids.filter(id => !store.get(id));
    const live = store.items.filter(n => want.has(n.id) && !isTerminal(n)).map(n => n.id);
    const before = store.items.length;
    store.items = store.items.filter(n => !want.has(n.id) || !isTerminal(n));
    const deleted = before - store.items.length;
    if (deleted) { store.save(); }
    return { deleted, live, missing };
}

/** A handled item nobody asked to keep: 📌 pinned and archived ones stay. */
export function clearableItem(n: WorkItem): boolean {
    return isTerminal(n) && !n.pinned && !n.archived;
}

export function clearHandled(store: WorkQueueStore): number {
    const before = store.items.length;
    store.items = store.items.filter(n => !clearableItem(n));
    const deleted = before - store.items.length;
    if (deleted) { store.save(); }
    return deleted;
}

function idList(args: Record<string, unknown>): string[] {
    const v = args.ids;
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    return raw.map(x => String(x).trim()).filter(Boolean);
}

export function registerQueueHygieneOps(bridge: BridgeRegistry, store: WorkQueueStore, changed: () => void): void {
    bridge.register([
        {
            op: 'queue.removeMany',
            describe: 'N-11 — DELETE THE WORK ITEMS NAMED, in one write. The un-deletable rule holds per item: only '
                + 'handled ones (done | dropped) go; a live one is spared and listed in `live` (queue.stamp it '
                + 'status=dropped first), an unknown id in `missing`. args: ids (string[] or comma-separated).',
            handler: (args) => {
                const ids = idList(args);
                need(ids.length > 0, 'ids: name at least one item — queue.list shows the ids.');
                const r = removeMany(store, ids);
                if (r.deleted) { changed(); }
                return { ...r, remaining: store.items.length };
            }
        },
        {
            op: 'queue.clearHandled',
            describe: 'N-11 — DELETE EVERY HANDLED ITEM (done | dropped) in one go. 📌 Pinned and archived items are '
                + 'kept — both are somebody saying "keep this". Live items are never touched. No args.',
            handler: () => {
                const deleted = clearHandled(store);
                if (deleted) { changed(); }
                return { deleted, remaining: store.items.length };
            }
        }
    ]);
}
