import type { A2ANote, A2ANotesStore } from './a2aNotes';
import type { A2ATask, A2ATasksStore } from './a2aTasks';
import { argStr, BridgeRegistry, need, optBool, optStr } from './bridge';

/**
 * S-84 — WHAT KEEPS THE A2A BOARD FROM BECOMING A TIP. Notes are passive, so
 * nothing about reading one takes it off the board; without a lifecycle the
 * pile only grows, and a board nobody can see the top of is a board nobody
 * reads. Three rules, and they are here rather than in the store because they
 * are a POLICY — the store applies them, the page explains them, the tests
 * pin them:
 *
 *   1. resolving a note starts a 48-hour clock (`resolvedAt`);
 *   2. an expired note goes — a relay's own cards (`baton`) whether or not
 *      anybody resolved them, everything else once it is also resolved;
 *   3. ‼️ A PINNED NOTE IS NEVER SWEPT. The pin is the user's exemption and it
 *      outranks every rule above it; only a hand (`a2a.notes.delete`) takes a
 *      pinned note off the board.
 *
 * The ttl a finished chain stamps on its cards is `BATON_SWEEP_MS`, so the
 * race stays readable for a day after it ends and then clears itself.
 */

/** How long a resolved note stays before the sweep owes it nothing. */
export const RESOLVED_SWEEP_MS = 48 * 60 * 60 * 1000;

/** How long a finished chain's handover cards stay readable. */
export const BATON_SWEEP_MS = 24 * 60 * 60 * 1000;

/** Is this note the sweep's to drop? A pinned one never is. */
export function sweepable(note: A2ANote, now = Date.now()): boolean {
    if (note.pinned) { return false; }
    if (note.expiresAt && note.expiresAt <= now) {
        return note.resolved || note.category === 'baton';
    }
    if (!note.resolved) { return false; }
    return now - (note.resolvedAt ?? note.ts) >= RESOLVED_SWEEP_MS;
}

/** What "clear the board" means when the user narrows it. */
export interface ClearFilter {
    category?: string;
    topic?: string;
    /** only the notes somebody has closed — the safe half of a clear */
    resolvedOnly?: boolean;
    /** the user saying they meant the pinned ones too */
    includePinned?: boolean;
}

export function clearable(note: A2ANote, filter: ClearFilter = {}): boolean {
    if (note.pinned && !filter.includePinned) { return false; }
    if (filter.category && note.category !== filter.category) { return false; }
    if (filter.topic && note.topic !== filter.topic) { return false; }
    if (filter.resolvedOnly && !note.resolved) { return false; }
    return true;
}

export interface A2AHygieneCtx {
    noteById: (id: string) => A2ANote;
    taskById: (id: string) => A2ATask;
    changed: () => void;
    /** a `string[]` or a comma-separated string — both arrive over the CLI */
    listArg: (args: Record<string, unknown>, key: string) => string[];
}

/**
 * The hand on the board: pin, delete, clear. `sweep` stays with the other
 * note ops — it is the automatic half and takes no decision from anybody.
 */
export function registerA2AHygieneOps(
    bridge: BridgeRegistry,
    deps: { notes: A2ANotesStore; tasks: A2ATasksStore },
    ctx: A2AHygieneCtx
): void {
    const ids = (args: Record<string, unknown>): string[] => {
        const list = ctx.listArg(args, 'ids');
        need(list.length > 0, 'ids: name at least one note — a2a.notes.list shows the board.');
        return list;
    };

    bridge.register([
        {
            op: 'a2a.notes.pin',
            describe: 'S-84 — EXEMPT A NOTE FROM EVERY AUTOMATIC SWEEP. A pinned note stays on the board until a '
                + 'person deletes it by hand, however old or resolved it is. args: id, pinned? (default true; false '
                + 'takes the pin off and the note becomes sweepable again).',
            handler: (args) => {
                const id = argStr(args, 'id');
                ctx.noteById(id);
                const note = deps.notes.pin(id, optBool(args, 'pinned', true));
                ctx.changed();
                return note;
            }
        },
        {
            op: 'a2a.notes.delete',
            describe: 'S-84 — TAKE A NOTE OFF THE BOARD FOR GOOD. Unlike a2a.notes.resolve this is not history, it is '
                + 'deletion, and it is the ONE thing that removes a pinned note. args: id.',
            handler: (args) => {
                const id = argStr(args, 'id');
                ctx.noteById(id);
                const gone = deps.notes.remove([id]);
                if (gone) { ctx.changed(); }
                return { deleted: gone, remaining: deps.notes.notes.length };
            }
        },
        {
            op: 'a2a.notes.deleteMany',
            describe: 'S-84 — DELETE THE NOTES NAMED, in one locked write. An id that is not on the board is counted '
                + 'as missing rather than refusing the whole call. args: ids (string[] or comma-separated).',
            handler: (args) => {
                deps.notes.load();
                const want = ids(args);
                const missing = want.filter(id => !deps.notes.get(id));
                const gone = deps.notes.remove(want);
                if (gone) { ctx.changed(); }
                return { deleted: gone, missing, remaining: deps.notes.notes.length };
            }
        },
        {
            op: 'a2a.notes.clear',
            describe: 'S-84 — CLEAR THE BOARD, or the part of it a filter names. PINNED NOTES ARE SPARED unless '
                + 'includePinned is asked for. args: category? (info | warning | convention | discovery | result | '
                + 'baton), topic? (a chain id clears one race), resolvedOnly? (only what somebody closed), '
                + 'includePinned? (default false).',
            handler: (args) => {
                deps.notes.load();
                const filter: ClearFilter = {
                    category: optStr(args, 'category') || undefined,
                    topic: optStr(args, 'topic') || undefined,
                    resolvedOnly: optBool(args, 'resolvedOnly', false),
                    includePinned: optBool(args, 'includePinned', false)
                };
                const gone = deps.notes.clear(filter);
                if (gone) { ctx.changed(); }
                return { deleted: gone, remaining: deps.notes.notes.length };
            }
        },
        {
            op: 'a2a.tasks.delete',
            describe: 'N-11 — TAKE A TASK OFF THE BOARD FOR GOOD (not a2a.tasks.cancel, which keeps it as history). '
                + 'A task an agent holds under a live lease is REFUSED — cancel it first. args: id.',
            handler: (args) => {
                const id = argStr(args, 'id');
                ctx.taskById(id);
                const r = deps.tasks.remove([id]);
                need(!r.held.length, `${id} is held live by ${deps.tasks.get(id)?.claimedBy?.agent ?? 'an agent'} — a2a.tasks.cancel it first.`);
                if (r.deleted) { ctx.changed(); }
                return { deleted: r.deleted, remaining: deps.tasks.tasks.length };
            }
        },
        {
            op: 'a2a.tasks.deleteMany',
            describe: 'N-11 — DELETE THE TASKS NAMED, in one locked write. A task held under a live lease is spared and '
                + 'listed in `held`; an unknown id is counted as missing. args: ids (string[] or comma-separated).',
            handler: (args) => {
                deps.tasks.load();
                const list = ctx.listArg(args, 'ids');
                need(list.length > 0, 'ids: name at least one task — a2a.tasks.list shows the board.');
                const missing = list.filter(id => !deps.tasks.get(id));
                const r = deps.tasks.remove(list);
                if (r.deleted) { ctx.changed(); }
                return { deleted: r.deleted, held: r.held, missing, remaining: deps.tasks.tasks.length };
            }
        },
        {
            op: 'a2a.tasks.clear',
            describe: 'N-11 — CLEAR THE TASK BOARD. By default only the CLOSED tasks go (done · failed · cancelled); '
                + 'closedOnly:false takes every task nobody holds live. args: closedOnly? (default true).',
            handler: (args) => {
                const gone = deps.tasks.clear({ closedOnly: optBool(args, 'closedOnly', true) });
                if (gone) { ctx.changed(); }
                return { deleted: gone, remaining: deps.tasks.tasks.length };
            }
        }
    ]);
}
