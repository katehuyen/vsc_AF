import * as path from 'path';
import {
    MIN_FETCH_INTERVAL_MS, EDGE_READ_FLOOR_MS,
    RATE_LIMIT_BACKOFF_START_MS, RATE_LIMIT_BACKOFF_MAX_MS,
    OauthCredentials, PlanBar, PlanUsageSnapshot, PlanUsageState,
    buildBars, fetchUsage, readOauthCredentials, usageUserAgent
} from './planusage';
import { adapterFor, EngineAccountSlot } from './engineAccounts';
import { ensureAccessToken, EXPIRY_SKEW_MS, RefreshOutcome } from './oauthRefresh';

/**
 * X-170 — HOW MUCH ROOM IS LEFT, PER ACCOUNT.
 *
 * `planusage.ts` was already parametric where it mattered — `credentialsPath(home)`
 * and `readOauthCredentials(file)` both take the file — so reading a second
 * account's figures needs no new endpoint, no new headers and no new parser.
 * What it needs is a RULE ABOUT HOW OFTEN, and that rule is the whole item.
 *
 * ‼️ THREE ACCOUNTS MUST NOT MEAN THREE TIMES THE REQUESTS. The obvious build —
 * one PlanUsageService per slot — quietly multiplies every ceiling in that file
 * by the number of accounts: the 5-second floor becomes 5 seconds EACH, the
 * 3-minute backoff protects one token while the other two keep knocking, and
 * the beat that was tuned to be polite becomes N times as loud. The endpoint
 * does not see three accounts, it sees this machine. Asking how much quota is
 * left would become the thing that burns the quota, which is the precedent
 * `readOnEdge` in planusage.ts already exists to record.
 *
 * So the budget is held HERE, once, and the slots take turns inside it:
 *
 *   - one shared floor — at most one request per interval, whatever N is;
 *   - one shared backoff — a 429 stops the fleet, not one slot, because the
 *     limit being reported is about this caller;
 *   - round robin by staleness — the slot whose figures are oldest goes next,
 *     so N slots are each refreshed once every N intervals rather than N times
 *     in one.
 *
 * ‼️ AND THERE IS DELIBERATELY NO `refreshAll()`. A method that reads every
 * slot at once is the multiplication this module exists to prevent, and it
 * would be called by the first surface that wanted a full table quickly.
 *
 * ‼️ NOT EVERY ENGINE HAS A NUMBER, and the honest answer to that is a sentence,
 * not a blank bar. `engineAccounts`' adapter says whether a slot has a readable
 * allowance at all; a slot that has none is reported as `no-source` with the
 * reason its adapter gives, and is never fetched — so a Codex slot costs zero
 * requests instead of one wasted 404 per turn.
 */

/** The `five_hour` row is the one that governs a session's life. */
export const FIVE_HOUR = 'five_hour';

/** How much room one slot has, in the terms every surface above prints. */
export interface SlotUsage {
    slotId: string;
    engine: string;
    /** `no-source` = this engine publishes no readable allowance; see `note` */
    state: PlanUsageState | 'no-source';
    /** 0–100 for the five-hour window; -1 when it is not known */
    percent: number;
    /** epoch ms of the five-hour reset; 0 when unknown */
    resetsAt: number;
    /** the tier the credentials state ('pro', 'max', …) */
    plan: string;
    /** when these figures were read; 0 = never */
    fetchedAt: number;
    /** one honest line for anything other than a live figure */
    note?: string;
}

/** The five-hour row out of a snapshot, or nothing. */
export function fiveHourBar(snap: PlanUsageSnapshot | undefined): PlanBar | undefined {
    return snap?.bars.find(b => b.id === FIVE_HOUR);
}

/**
 * ‼️ X-212 — WHICH FILE HOLDS A SLOT'S SIGN-IN, and the empty string where the
 * engine keeps none this machine can read.
 *
 * One implementation, because two readers of the same account are exactly how
 * the status bar comes to show a plan the session is not spending: the account
 * cards read it here, and so does the plan-usage indicator once an account is
 * standing. `undefined` — no slot — is the main sign-in and answers with '',
 * which is the caller's cue to fall back to `credentialsPath()`.
 */
export function slotCredentialsFile(slot: { dir: string; engine: string } | undefined): string {
    if (!slot || !slot.dir) { return ''; }
    const source = adapterFor(slot.engine).quotaSource();
    return source.kind === 'oauth-credentials' ? path.join(slot.dir, source.file) : '';
}

/** A slot that has never been read yet, stated rather than left missing. */
export function unreadUsage(slot: { id: string; engine: string }): SlotUsage {
    const source = adapterFor(slot.engine).quotaSource();
    if (source.kind === 'none') {
        return {
            slotId: slot.id, engine: slot.engine, state: 'no-source',
            percent: -1, resetsAt: 0, plan: '', fetchedAt: 0, note: source.reason
        };
    }
    return {
        slotId: slot.id, engine: slot.engine, state: 'error',
        percent: -1, resetsAt: 0, plan: '', fetchedAt: 0,
        note: 'Not read yet — the next turn of the shared usage budget will pick this one up.'
    };
}

/** A snapshot, narrowed to what a slot row shows. */
export function usageFrom(slot: { id: string; engine: string }, snap: PlanUsageSnapshot): SlotUsage {
    const bar = fiveHourBar(snap);
    return {
        slotId: slot.id, engine: slot.engine,
        state: snap.state,
        percent: snap.state === 'ok' && bar ? bar.percent : -1,
        resetsAt: bar?.resetsAt ?? 0,
        plan: snap.plan,
        fetchedAt: snap.fetchedAt,
        note: snap.note
    };
}

/**
 * ‼️ CAN A SESSION BE STARTED ON THIS ACCOUNT RIGHT NOW.
 *
 * A slot with no readable figure is USABLE, not blocked — Codex states a plan it
 * simply does not publish, and refusing to start a session because a number is
 * missing would turn "we cannot see it" into "you cannot use it". Only a
 * measured wall (the five-hour window at or above the ceiling) and a rejected
 * login stop it.
 */
export function slotIsUsable(u: SlotUsage, ceiling = 100): boolean {
    if (u.state === 'expired' || u.state === 'no-auth') { return false; }
    if (u.state === 'ok' && u.percent >= 0) { return u.percent < ceiling; }
    return true;
}

/**
 * The account with the most room right now — the one an unattended runner
 * should start its next session on.
 *
 * ‼️ A MEASURED ACCOUNT BEATS AN UNMEASURED ONE, always. Both are usable, but
 * picking a slot whose figure nobody has read yet over one that is provably at
 * 4% is choosing a guess over a fact — and the guess is the one that ends the
 * session ten minutes in.
 */
export function mostRoom(list: SlotUsage[], ceiling = 100): SlotUsage | undefined {
    const usable = list.filter(u => slotIsUsable(u, ceiling));
    const measured = usable.filter(u => u.state === 'ok' && u.percent >= 0);
    if (measured.length) {
        return measured.reduce((best, u) => (u.percent < best.percent ? u : best));
    }
    return usable[0];
}

/**
 * When the first exhausted account comes back — the moment an idle runner
 * should wake up, and the reason it can sleep spending nothing until then.
 * Zero when nothing is waiting on a reset.
 */
export function nextResetAt(list: SlotUsage[], ceiling = 100, now = Date.now()): number {
    const waiting = list
        .filter(u => u.state === 'ok' && u.percent >= ceiling && u.resetsAt > now)
        .map(u => u.resetsAt);
    return waiting.length ? Math.min(...waiting) : 0;
}

export interface AccountUsageOptions {
    /** the slots to keep figures for; read fresh each time, so capture/forget lands */
    slots(): EngineAccountSlot[];
    /** how long one slot's figures stay fresh */
    ttlMs(): number;
    /** closest two AUTOMATIC reads may be — the user's own active interval */
    edgeFloorMs?(): number;
    cliVersion?(): string | undefined;
    /** overridable for tests */
    readCreds?(file: string): OauthCredentials | undefined;
    fetchImpl?(token: string, userAgent: string): Promise<{ status: number; body: string }>;
    /** X-204 — turn an aged-out access token back into a live one. Overridable for tests. */
    refreshImpl?(credentialsFile: string): Promise<RefreshOutcome>;
    /**
     * ‼️ X-204 — IS SOMETHING RUNNING AS THIS ACCOUNT RIGHT NOW.
     *
     * MEASURED: an OAuth refresh rotates the grant and REVOKES the access token
     * that was in force. So refreshing a slot to read a percentage would pull
     * the token out from under a session that is mid-turn on it — a figure
     * nobody asked for, bought with somebody's running work. A busy slot is
     * therefore left alone, and it loses nothing by that: the engine using it
     * refreshes the grant itself, which is why its figure is the freshest on
     * the page in the first place.
     */
    busy?(slotId: string): boolean;
    now?(): number;
}

/**
 * One request budget, shared by every account on the machine.
 *
 * The shape mirrors `PlanUsageService` on purpose — same three reasons, same
 * floors, same backoff — because two rate-limit policies in one codebase is how
 * one of them ends up wrong.
 */
export class AccountUsageService {
    private byId = new Map<string, SlotUsage>();
    private lastFetchAt = 0;
    private backoffMs = 0;
    private backoffUntil = 0;
    private inflight: Promise<SlotUsage[]> | undefined;

    constructor(private opts: AccountUsageOptions) { }

    private now(): number { return (this.opts.now ?? Date.now)(); }

    /** Everything known right now — never touches the network. */
    current(): SlotUsage[] {
        return this.opts.slots().map(s => this.byId.get(s.id) ?? unreadUsage(s));
    }

    /** When the shared backoff lets the next automatic read through; 0 = none. */
    rateLimitedUntil(): number { return this.backoffUntil; }

    /**
     * Which slot the next request would spend itself on, or undefined when
     * nothing is due. Exposed because a surface that says "refreshing
     * <account>" is telling the truth about a queue the user cannot otherwise
     * see (Principle 1).
     */
    dueNext(reason: 'beat' | 'edge' | 'user' = 'beat'): EngineAccountSlot | undefined {
        return this.pick(this.opts.slots(), reason, this.now());
    }

    /** A person asked. Skips the TTL and the backoff — one slot, still. */
    refresh(): Promise<SlotUsage[]> { return this.read('user'); }

    /**
     * ‼️ X-206 — A PERSON ASKED FOR **THIS** ONE.
     *
     * The round robin decides who is stalest; a reader looking at one card has
     * already decided, and answering them with somebody else's figure is the
     * control quietly doing something other than what it says. So the slot is
     * NAMED — and nothing else changes: still one request, still the shared
     * floor, still nothing while one is in flight. This is not `refreshAll` by
     * another door: it reads exactly the one it was given, and the queue that
     * calls it in turn (`accountQueue`) is what makes "all of them" a line
     * rather than a burst.
     */
    refreshSlot(slotId: string): Promise<SlotUsage[]> {
        const now = this.now();
        const slot = this.opts.slots().find(s => s.id === slotId);
        if (!slot || adapterFor(slot.engine).quotaSource().kind === 'none') {
            return Promise.resolve(this.current());
        }
        if (now - this.lastFetchAt < MIN_FETCH_INTERVAL_MS) { return Promise.resolve(this.current()); }
        if (this.inflight) { return this.inflight; }
        this.inflight = this.load(slot, now).finally(() => { this.inflight = undefined; });
        return this.inflight;
    }

    /** The timer asked. */
    beat(): Promise<SlotUsage[]> { return this.read('beat'); }

    /** A turn just ended, so the figures have just moved. */
    readOnEdge(): Promise<SlotUsage[]> { return this.read('edge'); }

    private pick(
        slots: EngineAccountSlot[], reason: 'beat' | 'edge' | 'user', now: number
    ): EngineAccountSlot | undefined {
        // Only slots that actually have a figure to read; the rest cost nothing
        // and are reported from their adapter's own sentence.
        const readable = slots.filter(s => adapterFor(s.engine).quotaSource().kind !== 'none');
        if (!readable.length) { return undefined; }
        const ttl = Math.max(0, this.opts.ttlMs());
        const due = readable.filter(s => {
            const u = this.byId.get(s.id);
            if (!u || !u.fetchedAt) { return true; }
            // ‼️ The TTL is per SLOT while the floor is per MACHINE. That pair is
            // what makes the round robin work: five slots on a 60 s TTL do not
            // ask five times a minute, they take one turn each in order.
            return reason !== 'beat' || now - u.fetchedAt >= ttl;
        });
        if (!due.length) { return undefined; }
        // Oldest figures first; never read = oldest of all.
        return due.reduce((oldest, s) => {
            const a = this.byId.get(s.id)?.fetchedAt ?? 0;
            const b = this.byId.get(oldest.id)?.fetchedAt ?? 0;
            return a < b ? s : oldest;
        });
    }

    private read(reason: 'beat' | 'edge' | 'user'): Promise<SlotUsage[]> {
        const now = this.now();
        const slots = this.opts.slots();
        const floor = reason === 'edge'
            ? Math.max(MIN_FETCH_INTERVAL_MS, this.opts.edgeFloorMs?.() ?? EDGE_READ_FLOOR_MS)
            : MIN_FETCH_INTERVAL_MS;
        // ‼️ ONE SHARED FLOOR AND ONE SHARED BACKOFF — the whole point. Both are
        // checked before a slot is even chosen, so adding an account cannot buy
        // anybody another request.
        if (reason !== 'user' && now < this.backoffUntil) { return Promise.resolve(this.current()); }
        if (now - this.lastFetchAt < floor) { return Promise.resolve(this.current()); }
        const target = this.pick(slots, reason, now);
        if (!target) { return Promise.resolve(this.current()); }
        if (this.inflight) { return this.inflight; }
        this.inflight = this.load(target, now).finally(() => { this.inflight = undefined; });
        return this.inflight;
    }

    private async load(slot: EngineAccountSlot, now: number): Promise<SlotUsage[]> {
        this.lastFetchAt = now;
        const file = slotCredentialsFile(slot);
        if (!file) { return this.current(); }
        const cred = (this.opts.readCreds ?? readOauthCredentials)(file);
        const put = (u: SlotUsage) => { this.byId.set(slot.id, u); return this.current(); };
        const bad = (state: PlanUsageState, note: string, plan = ''): SlotUsage => ({
            slotId: slot.id, engine: slot.engine, state,
            percent: -1, resetsAt: 0, plan, fetchedAt: now, note
        });
        if (!cred) {
            return put(bad('no-auth',
                'No sign-in is stored in this account\'s directory — capture it again, or sign in once with it selected.'));
        }
        const fetch = this.opts.fetchImpl ?? fetchUsage;
        const refresh = this.opts.refreshImpl ?? ensureAccessToken;
        const ua = usageUserAgent(this.opts.cliVersion?.());
        // ‼️ X-204 — AN AGED-OUT ACCESS TOKEN IS NOT A SIGNED-OUT ACCOUNT, and
        // until this was written it was recorded as one: the 401 below became
        // `expired`, `slotIsUsable` refuses an expired slot, and a healthy
        // account left the fleet while the user was told to open a browser.
        // The grant's short half is refreshed here the way the CLI refreshes it
        // in the same directory; only the long half's death is a person's job.
        const signedOut = (reason: string): SlotUsage => bad('expired',
            `Anthropic rejected this account's stored login — ${reason}. It needs signing in again before it can run.`,
            cred.plan);
        const busy = this.opts.busy?.(slot.id) ?? false;
        const rekey = async (): Promise<RefreshOutcome> => {
            if (!busy) { return refresh(file); }
            // ‼️ A BUSY SLOT IS READ AGAIN, NEVER MINTED FROM. The session on it
            // refreshes the grant itself and writes the file, so the token we
            // need is usually already there — and reading costs nothing and
            // revokes nothing. Exchanging would take that session's token away.
            const fresh = (this.opts.readCreds ?? readOauthCredentials)(file);
            if (fresh && fresh.expiresAt > now + EXPIRY_SKEW_MS) {
                return { kind: 'live', token: fresh.token };
            }
            return {
                kind: 'unavailable',
                reason: 'a session is running as this account and refreshing the grant would revoke the token it is using'
            };
        };
        try {
            let token = cred.token;
            let minted = false;
            // Expired on the clock? Then the request is known to fail, and
            // spending the machine's shared budget on it is pure waste.
            if (!cred.expiresAt || cred.expiresAt <= now + EXPIRY_SKEW_MS) {
                const out = await rekey();
                if (out.kind === 'rejected') { return put(signedOut(out.reason)); }
                if (out.kind === 'live' || out.kind === 'refreshed') {
                    token = out.token;
                    minted = out.kind === 'refreshed';
                }
                // 'unavailable' falls through: the stored token may still work,
                // and a machine that cannot reach one endpoint has said nothing
                // about the account.
            }
            let res = await fetch(token, ua);
            if (res.status === 401 || res.status === 403) {
                if (minted) {
                    // A token minted seconds ago was refused: the grant really
                    // is gone, and this is the one state a person has to fix.
                    // X-178 turns exactly this into a notice.
                    return put(signedOut('a freshly refreshed token was refused'));
                }
                const out = await rekey();
                if (out.kind === 'rejected') { return put(signedOut(out.reason)); }
                if (out.kind === 'unavailable') {
                    // ‼️ NOT `expired`. The slot stays usable, because nothing
                    // here says the account is bad — only that we could not
                    // find out. Claude Code will refresh this grant itself the
                    // next time a session runs in the slot.
                    return put(bad('error',
                        `The stored access token has aged out and ${out.reason} — the figure is unknown, `
                        + 'but the account is fine and refreshes itself the next time it runs.',
                        cred.plan));
                }
                res = await fetch(out.token, ua);
                if (res.status === 401 || res.status === 403) {
                    return put(signedOut('a freshly refreshed token was refused'));
                }
            }
            if (res.status === 429) {
                this.backoffMs = this.backoffMs
                    ? Math.min(RATE_LIMIT_BACKOFF_MAX_MS, this.backoffMs * 2)
                    : RATE_LIMIT_BACKOFF_START_MS;
                this.backoffUntil = now + this.backoffMs;
                const mins = Math.max(1, Math.round(this.backoffMs / 60_000));
                return put(bad('error',
                    `The usage endpoint rate limited this machine — every account backs off, next automatic read in ${mins} min.`,
                    cred.plan));
            }
            if (res.status !== 200) {
                return put(bad('error', `Usage endpoint returned HTTP ${res.status}.`, cred.plan));
            }
            const bars = buildBars(JSON.parse(res.body) as unknown);
            if (!bars.length) {
                return put(bad('error', 'The usage endpoint reported no limits for this account.', cred.plan));
            }
            this.backoffMs = 0;
            this.backoffUntil = 0;
            return put(usageFrom(slot, { state: 'ok', bars, plan: cred.plan, fetchedAt: now }));
        } catch (e) {
            return put(bad('error',
                `Could not reach the usage endpoint: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
                cred.plan));
        }
    }
}
