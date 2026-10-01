/**
 * ‼️ S-109 — WHAT A SESSION CLOSED WITH, AND THE ONE ANSWER A REOPEN TAKES FROM IT.
 *
 * The rule: a session reopened — itself (any Resume door, a revive, an account
 * move) or its continuation (a baton leg) — opens with the model, effort,
 * permission mode and account it CLOSED with. The baton's account is S-106's.
 *
 * Why it never held: the four answers lived in seven places, each incomplete.
 * The card knew them all and kept them in memory only; the launch manifest
 * was durable but frozen at the launch; the transcript was durable but silent
 * on the account, on Codex/AGY effort, and (as the index reads it) on most
 * permission changes. Every door then wrote its own `a || b || c` over them.
 *
 * This module is the pure half of the repair: the per-session record the card
 * feeds, the reading of a transcript's tail, and `resolveReopen` — the only
 * place the layers are ordered. No VS Code import, no file system.
 */

export type SetupDim = 'model' | 'effort' | 'permissionMode' | 'account';
export const SETUP_DIMS: readonly SetupDim[] = ['model', 'effort', 'permissionMode', 'account'];

/** One observed answer and when it was seen (epoch ms). */
export interface SetupObs { value: string; at: number; from: 'card' | 'transcript' }
export type SetupObsMap = Partial<Record<SetupDim, SetupObs>>;
export type SetupValues = Partial<Record<SetupDim, string>>;

/** The durable record of one session's closing setup. */
export interface ClosingSetup { sessionId: string; engine?: string; dims: SetupObsMap }

/** The four answers a card carries, read off its state. */
export interface CardSetup {
    sessionId?: string;
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    account?: string;
}

const t = (v: unknown): string => String(v ?? '').trim();

/**
 * The record after this card state, or `null` when nothing changed. Only a
 * stated value is an observation: an empty box says "the default" and must
 * not erase what the session actually ran with.
 */
export function observeCard(prev: ClosingSetup | undefined, card: CardSetup, now: number): ClosingSetup | null {
    const sid = t(card.sessionId);
    if (!sid) { return null; }
    const dims: SetupObsMap = { ...(prev?.sessionId === sid ? prev.dims : {}) };
    let changed = !prev || prev.sessionId !== sid;
    for (const d of SETUP_DIMS) {
        const v = t(card[d]);
        if (!v || dims[d]?.value === v) { continue; }
        dims[d] = { value: v, at: now, from: 'card' };
        changed = true;
    }
    const engine = t(card.engine) || prev?.engine;
    if (!changed && engine === prev?.engine) { return null; }
    return { sessionId: sid, ...(engine ? { engine } : {}), dims };
}

interface Line {
    type?: string;
    timestamp?: string;
    permissionMode?: string;
    effort?: string;
    message?: { model?: string };
}

/**
 * The last model, effort and permission mode a Claude transcript states, each
 * with the time of the line that stated it. `text` may be a TAIL of the file:
 * its first line may be cut, which the guarded parse simply skips.
 *
 * The permission mode is read from BOTH places the CLI writes it — the rare
 * `permission-mode` record and the `permissionMode` on every user prompt —
 * because the index's reading of the first alone missed it on most sessions.
 * A record with no timestamp takes the time of the next stamped line after it.
 */
export function transcriptSetup(text: string, fallbackAt = 0): SetupObsMap {
    const out: SetupObsMap = {};
    const lines = text.split('\n');
    let laterAt = fallbackAt;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (out.model && out.effort && out.permissionMode) { break; }
        const raw = lines[i].trim();
        if (!raw || raw[0] !== '{') { continue; }
        let l: Line;
        try { l = JSON.parse(raw) as Line; } catch { continue; }
        const ts = l.timestamp ? Date.parse(l.timestamp) : NaN;
        const at = Number.isFinite(ts) ? ts : laterAt;
        if (Number.isFinite(ts)) { laterAt = ts; }
        const see = (d: SetupDim, v: unknown) => {
            const s = t(v);
            if (s && !out[d]) { out[d] = { value: s, at, from: 'transcript' }; }
        };
        if (l.type === 'assistant') {
            const m = t(l.message?.model);
            if (m && m !== '<synthetic>') { see('model', m); }
            see('effort', l.effort);
        } else if (l.type === 'permission-mode' || l.type === 'user') {
            see('permissionMode', l.permissionMode);
        }
    }
    return out;
}

/** Per dimension, the newer observation; a tie goes to the card. */
export function newestOf(a: SetupObsMap = {}, b: SetupObsMap = {}): SetupObsMap {
    const out: SetupObsMap = {};
    for (const d of SETUP_DIMS) {
        const x = a[d], y = b[d];
        const pick = !x ? y : !y ? x
            : x.at !== y.at ? (x.at > y.at ? x : y)
            : (x.from === 'card' ? x : y);
        if (pick) { out[d] = pick; }
    }
    return out;
}

/**
 * For a door that keeps its own lower layers (a task row): only what the
 * session itself closed with — card record or transcript — and, beside it,
 * what it was LAUNCHED with, so the door can tell a copied value from an edit.
 */
export interface ClosingAnswer { model?: string; effort?: string; permissionMode?: string; launch?: SetupValues }

/**
 * Which of a task row's answers its conversation's closing setup replaces: a
 * row that says nothing, or still holds exactly what the conversation was
 * launched with, merely copied it; a row that differs was edited on purpose.
 */
export function closingOverRow(
    row: { model?: string; effort?: string; permissionMode?: string }, back: ClosingAnswer
): ('model' | 'effort' | 'permissionMode')[] {
    return (['model', 'effort', 'permissionMode'] as const).filter(d => {
        const v = t(back[d]), r = t(row[d]);
        return !!v && v !== r && (!r || r === t(back.launch?.[d]));
    });
}

export type ReopenSource = 'explicit' | 'card' | 'transcript' | 'launch' | 'agent' | 'fleet' | 'session';

export interface ReopenLayers {
    /** What the door itself states — an account move's new slot, a deliberate escalation. */
    explicit?: SetupValues;
    /** The card's durable record (`ClosingSetup.dims`). */
    closing?: SetupObsMap;
    /** What the transcript says last, with times — or the index's values with at 0. */
    transcript?: SetupObsMap;
    /** The launch manifest's `requested`. */
    launch?: SetupValues;
    /** The agent's own setting on this engine. */
    agent?: SetupValues;
    /** The fleet default — the caller passes only what applies to this engine. */
    fleet?: SetupValues;
    /** The account the session's transcript lives under. */
    sessionAccount?: string;
}

export interface ReopenSetup extends SetupValues { from: Partial<Record<SetupDim, ReopenSource>> }

/**
 * ‼️ THE ONE ORDER. Per dimension: the door's explicit statement → the newer of
 * the card's record and the transcript → the launch manifest → the agent → the
 * fleet. The account has no transcript, agent or fleet layer: explicit → the
 * card's record → the session's own account. With no card record this is, for
 * every dimension, exactly the order the S-45/S-102 doors wrote by hand.
 */
export function resolveReopen(l: ReopenLayers): ReopenSetup {
    const out: ReopenSetup = { from: {} };
    const observed = newestOf(l.closing, l.transcript);
    for (const d of SETUP_DIMS) {
        const tiers: [ReopenSource, string | undefined][] = d === 'account'
            ? [['explicit', l.explicit?.account], ['card', l.closing?.account?.value], ['session', l.sessionAccount]]
            : [
                ['explicit', l.explicit?.[d]],
                [observed[d]?.from ?? 'card', observed[d]?.value],
                ['launch', l.launch?.[d]],
                ['agent', l.agent?.[d]],
                ['fleet', l.fleet?.[d]]
            ];
        for (const [src, v] of tiers) {
            const s = t(v);
            if (s) { out[d] = s; out.from[d] = src; break; }
        }
    }
    return out;
}
