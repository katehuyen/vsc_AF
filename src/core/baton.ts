/**
 * S-66 / S-67 — THE BATON: one session hands its work to a fresh one.
 *
 * A run that reaches its quota or context wall does not write a note for a
 * person to carry; it leaves the words it would say to its successor, and
 * Agent Farm opens the successor once the run has ended. This file is the
 * DECISION half of that and nothing else: the record's shape, the state
 * machine, where the successor's setup comes from, the sentence that tells the
 * passing agent what will happen, and which records the store keeps.
 *
 * ‼️ PURE — no file, no clock, no account list is read here. The launch
 * manifest, the store's contents, the time and the ids arrive as arguments, so
 * every rule is testable without a window (the same rule `accountPolicy.ts`
 * states at its top). `batonStore.ts` holds the file.
 */
import { LaunchManifest, LaunchSurface } from './launchManifest';

export type BatonState = 'armed' | 'waiting-end' | 'parked' | 'started' | 'stopped' | 'refused';

/** What the passing agent may ask for; `inherit` = the surface its own run used. */
export type BatonSurfaceWant = 'inherit' | 'console' | 'terminal' | 'headless';
export const BATON_SURFACE_WANTS: readonly BatonSurfaceWant[] = ['inherit', 'console', 'terminal', 'headless'];

/** The account rule a successor is placed on when the agent names none. */
export const BATON_DEFAULT_ACCOUNT = '@emptiest';
/** Records kept on disk: every live baton, then the newest finished ones. */
export const BATON_STORE_CAP = 200;

/** The run that passed the baton — read off its launch manifest, never guessed. */
export interface BatonFrom {
    sessionId: string;
    agentId: string;
    engine: string;
    cwd: string;
    projectId?: string;
    launchId: string;
}

/** The setup the successor starts with — the predecessor's own, as it was sealed. */
export interface BatonInherit {
    model?: string;
    effort?: string;
    permissionMode?: string;
    providerId?: string;
    tier?: string;
    superpowers?: boolean;
    surface: LaunchSurface;
    /** the slot the predecessor ran on — context for the plan, never reused blindly */
    account?: string;
}

export interface BatonWant {
    surface: BatonSurfaceWant;
    account: string;
}

export interface Baton {
    id: string;
    chainId: string;
    /** 1 for the first handover of a chain */
    hop: number;
    prompt: string;
    from: BatonFrom;
    inherit: BatonInherit;
    want: BatonWant;
    state: BatonState;
    wakeAt?: number;
    taskId?: string;
    toSessionId?: string;
    /** the sentence of the latest state change */
    why: string;
    createdAt: number;
    updatedAt: number;
}

/** Terminal states: nothing moves out of them. */
export const BATON_DONE: readonly BatonState[] = ['started', 'stopped', 'refused'];

const MOVES: Record<BatonState, readonly BatonState[]> = {
    // recorded but not yet accepted — the host crashing mid-pass leaves one
    armed: ['waiting-end', 'stopped', 'refused'],
    'waiting-end': ['parked', 'started', 'stopped', 'refused'],
    // a park can be moved to a later wake (an account filled up again)
    parked: ['parked', 'started', 'stopped', 'refused'],
    started: [], stopped: [], refused: []
};

export function canMove(from: BatonState, to: BatonState): boolean {
    return (MOVES[from] ?? []).includes(to);
}

export function isLive(b: Pick<Baton, 'state'> | undefined): boolean {
    return !!b && !BATON_DONE.includes(b.state);
}

/**
 * Move a baton. A move the machine does not allow is REFUSED with a sentence,
 * never applied — a started baton put back to waiting would open a second
 * successor for one run.
 */
export function moveBaton(
    b: Baton, to: BatonState, why: string, now: number,
    patch: Partial<Pick<Baton, 'wakeAt' | 'taskId' | 'toSessionId'>> = {}
): { ok: true; baton: Baton } | { ok: false; why: string } {
    if (!canMove(b.state, to)) {
        return { ok: false, why: `a baton that is ${b.state} cannot become ${to}.` };
    }
    const next: Baton = { ...b, ...patch, state: to, why: String(why || '').trim() || to, updatedAt: now };
    if (to !== 'parked') { delete next.wakeAt; }
    return { ok: true, baton: next };
}

let seq = 0;
function newId(prefix: string, now: number, rnd: () => number): string {
    seq = (seq + 1) % 46656;
    const t = Math.max(0, Math.floor(now)).toString(36);
    const r = Math.floor(rnd() * 46656).toString(36).padStart(3, '0');
    return `${prefix}_${t}${seq.toString(36).padStart(3, '0')}${r}`;
}
export const newBatonId = (now: number, rnd: () => number = Math.random) => newId('btn', now, rnd);
export const newChainId = (now: number, rnd: () => number = Math.random) => newId('chn', now, rnd);

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * ‼️ THE SUCCESSOR'S SETUP IS THE PREDECESSOR'S LAUNCH MANIFEST — sealed before
 * its process started — and nothing else. Not the agent's last-used setup
 * ("how this agent usually runs" is a different question from "how THIS run
 * ran": mixing them opens a chain that ran headless all night in a console the
 * next morning), and not the nearest manifest by time or folder. No launch id,
 * or no manifest for it, is a refusal that says so.
 */
export function inheritFrom(
    sessionId: string, launchId: string | undefined, manifest: LaunchManifest | undefined
): { ok: true; from: BatonFrom; inherit: BatonInherit } | { ok: false; why: string } {
    const sid = s(sessionId);
    if (!sid) { return { ok: false, why: 'no session named — a baton belongs to the run that passes it.' }; }
    const lid = s(launchId);
    if (!lid) {
        return {
            ok: false,
            why: `session ${sid.slice(0, 8)} carries no launch id, so its setup is unknown — `
                + 'a baton will not guess the successor\'s engine, model or folder.'
        };
    }
    if (!manifest || manifest.launchId !== lid) {
        return {
            ok: false,
            why: `no launch manifest was sealed for ${lid} (session ${sid.slice(0, 8)}) — `
                + 'without it the successor\'s setup would be a guess.'
        };
    }
    const req = manifest.requested ?? {};
    return {
        ok: true,
        from: {
            sessionId: sid, agentId: manifest.agentId, engine: manifest.engine, cwd: manifest.cwd,
            ...(manifest.projectId ? { projectId: manifest.projectId } : {}), launchId: lid
        },
        inherit: {
            ...(req.model ? { model: req.model } : {}),
            ...(req.effort ? { effort: req.effort } : {}),
            ...(req.permissionMode ? { permissionMode: req.permissionMode } : {}),
            ...(req.tier ? { tier: req.tier } : {}),
            ...(manifest.identity?.providerId ? { providerId: manifest.identity.providerId } : {}),
            ...(manifest.superpowers !== undefined ? { superpowers: manifest.superpowers } : {}),
            ...(manifest.account ? { account: manifest.account } : {}),
            surface: manifest.surface
        }
    };
}

/** The surface the successor opens on — `inherit` resolved against the manifest. */
export function successorSurface(b: Pick<Baton, 'want' | 'inherit'>): LaunchSurface {
    return b.want.surface === 'inherit' ? b.inherit.surface : b.want.surface;
}

export interface PassInput {
    prompt: unknown;
    sessionId: string;
    launchId?: string;
    manifest?: LaunchManifest;
    surface?: unknown;
    account?: unknown;
    /** everything the store holds now */
    prior: readonly Baton[];
    now: number;
    rnd?: () => number;
}

export type PassResult =
    | { ok: true; baton: Baton; superseded: Baton[] }
    | { ok: false; why: string };

/**
 * ‼️ THE WHOLE `baton.pass` DECISION. It starts nothing: it returns the record
 * to keep (state `waiting-end` — the successor waits for this run to END, so
 * two agents are never in one folder at once) and the earlier live batons of
 * the same session it replaces (a second pass wins; both stay on record).
 *
 * A chain is continued when the passing session was itself STARTED by a baton;
 * otherwise this is hop 1 of a new chain.
 */
export function passBaton(input: PassInput): PassResult {
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt) {
        return { ok: false, why: 'prompt is empty — the baton IS the words the successor is handed.' };
    }
    const want = s(input.surface) || 'inherit';
    if (!(BATON_SURFACE_WANTS as readonly string[]).includes(want)) {
        return { ok: false, why: `surface "${want}" is not one of ${BATON_SURFACE_WANTS.join(' · ')}.` };
    }
    const src = inheritFrom(input.sessionId, input.launchId, input.manifest);
    if (!src.ok) { return src; }
    const rnd = input.rnd ?? Math.random;
    const parent = input.prior.find(p => p.state === 'started' && p.toSessionId === src.from.sessionId);
    const draft: Baton = {
        id: newBatonId(input.now, rnd),
        chainId: parent?.chainId ?? newChainId(input.now, rnd),
        hop: parent ? parent.hop + 1 : 1,
        prompt,
        from: src.from,
        inherit: src.inherit,
        want: { surface: want as BatonSurfaceWant, account: s(input.account) || BATON_DEFAULT_ACCOUNT },
        state: 'armed',
        why: 'recorded',
        createdAt: input.now,
        updatedAt: input.now
    };
    const accepted = moveBaton(draft, 'waiting-end', 'waiting for this session to end', input.now);
    if (!accepted.ok) { return accepted; }
    const superseded: Baton[] = [];
    for (const p of input.prior) {
        if (p.from.sessionId !== src.from.sessionId || !isLive(p)) { continue; }
        const r = moveBaton(p, 'stopped', `replaced by ${draft.id} — the session passed again`, input.now);
        if (r.ok) { superseded.push(r.baton); }
    }
    return { ok: true, baton: accepted.baton, superseded };
}

const SURFACE_WORDS: Record<LaunchSurface, string> = {
    console: 'a Console card',
    terminal: 'a VS Code terminal',
    'external-terminal': 'an external terminal',
    headless: 'a background (headless) run'
};

/**
 * The sentence `baton.pass` answers with — what WILL happen, said before
 * anything does, so a wrong expectation is visible while the agent can still
 * correct it. `room` is the account policy's answer for this moment, if the
 * caller asked it: a slot with room, or the time the first one resets.
 */
export function batonPlanSentence(
    b: Baton,
    room?: { account?: string; usedPct?: number; resetsAt?: number; refusal?: string },
    fmtTime: (t: number) => string = t => new Date(t).toISOString().slice(11, 16)
): string {
    const where = SURFACE_WORDS[successorSurface(b)] ?? successorSurface(b);
    const chain = b.hop > 1 ? `hop ${b.hop} of chain ${b.chainId}` : `new chain ${b.chainId}`;
    const head = `Baton ${b.id} taken (${chain}). Nothing starts while session ${b.from.sessionId.slice(0, 8)} is alive — `
        + 'finish your last step and end your run now.';
    const acct = b.want.account;
    if (room?.refusal) {
        return `${head} When it ends, ${acct} has no account to place the successor on: ${room.refusal}`;
    }
    if (room?.account) {
        const pct = typeof room.usedPct === 'number' ? `, ${Math.round(room.usedPct)}% of 5h used` : '';
        return `${head} When it ends, a fresh ${b.from.engine} session opens as ${where} on ${acct} `
            + `(${room.account}${pct}) in ${b.from.cwd} and is handed your prompt.`;
    }
    if (room?.resetsAt) {
        return `${head} When it ends every account is full, so the successor is parked until `
            + `${fmtTime(room.resetsAt)} (the first reset) and then opens as ${where} on ${acct}.`;
    }
    return `${head} When it ends, a fresh ${b.from.engine} session opens as ${where} on ${acct} `
        + `in ${b.from.cwd} and is handed your prompt.`;
}

/**
 * What the store keeps: EVERY live baton, however many — dropping one would
 * silently cancel a successor — then the newest finished ones up to the cap.
 */
export function pruneBatons(list: readonly Baton[], cap = BATON_STORE_CAP): Baton[] {
    const byNewest = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const live = byNewest.filter(isLive);
    const done = byNewest.filter(b => !isLive(b));
    return [...live, ...done.slice(0, Math.max(0, cap - live.length))];
}
