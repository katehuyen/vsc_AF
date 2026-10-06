/**
 * U-201 — "Sound: Read Last Answer": WHICH CONVERSATION IT READS.
 *
 * Pressed on a row (a Console card, a Timeline lane, a Turns row) it reads that
 * row's conversation. From the palette or a shortcut it reads the page in front:
 * the Console's selected card, then an open transcript — the tab the user is in
 * first, then one merely on screen — and only with none of those does it ask
 * which live session. The reading itself is `alerts.readNow` with a session and
 * nothing else (readerOps.readNow), so the command and the op are one body.
 */

/** A page that can name a conversation: the Console's selected card, or a transcript tab. */
export interface Facing {
    from: 'console' | 'transcript';
    /** what readNow resolves: a session id, or the transcript's path */
    ref: string;
    active: boolean;
    visible: boolean;
}

export type ReadLastFrom = 'row' | Facing['from'] | 'picked';

/** The session a context-menu row hands the command: `{ sessionId }`, `{ session: { sessionId } }` or the id itself. */
export function rowRef(arg: unknown): string {
    if (typeof arg === 'string') { return arg.trim(); }
    if (!arg || typeof arg !== 'object') { return ''; }
    const o = arg as { sessionId?: unknown; session?: { sessionId?: unknown } };
    return String(o.sessionId ?? o.session?.sessionId ?? '').trim();
}

/** The row first; then the tab the user is in (Console before transcript); then one on screen; else nothing. */
export function readLastRef(row: string, facing: readonly Facing[]): { from: ReadLastFrom; ref: string } | undefined {
    if (row) { return { from: 'row', ref: row }; }
    const named = facing.filter(f => f.ref);
    const hit = named.find(f => f.active) ?? named.find(f => f.visible);
    return hit ? { from: hit.from, ref: hit.ref } : undefined;
}

export interface ReadLastDeps {
    facing(): Facing[];
    /** The live sessions the picker offers, newest first as the watcher keeps them. */
    live(): { sessionId: string; label: string }[];
    /** Ask which of them; undefined = the picker was closed. */
    choose(items: { sessionId: string; label: string }[]): Promise<string | undefined>;
    /** readNow with the session alone: its newest answer. Throws a refusal by name. */
    read(ref: string): Promise<{ label?: string; chars?: number }>;
    /** A short line on the status bar. */
    say(text: string): void;
}

/** The command's body. Answers what it read, or null when nothing was chosen or the reading was refused. */
export async function readLastAnswer(deps: ReadLastDeps, arg?: unknown): Promise<{ from: ReadLastFrom; ref: string } | null> {
    let at = readLastRef(rowRef(arg), deps.facing());
    if (!at) {
        const items = deps.live();
        if (!items.length) { deps.say('Agent Farm: no conversation is open in front of you and no session is live — nothing to read'); return null; }
        const picked = String((await deps.choose(items)) ?? '').trim();
        if (!picked) { return null; }
        at = { from: 'picked', ref: picked };
    }
    try {
        const r = await deps.read(at.ref);
        deps.say(`Agent Farm: reading the last answer${r.label ? ` of ${r.label}` : ''}`);
        return at;
    } catch (e) {
        deps.say(`Agent Farm: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
