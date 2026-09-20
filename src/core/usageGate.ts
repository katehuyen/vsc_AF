// ‼️ X-240 — ONE BUDGET PER TOKEN, NOT ONE PER READER.
//
// Anthropic's usage endpoint limits by OAuth token, and on this machine a token
// IS the credentials file it lives in. Two services read those files and until
// this module existed they shared nothing:
//
//   AccountUsageService  walks every captured sign-in on a round robin
//   PlanUsageService     watches whichever sign-in is STANDING
//
// Both resolve their file through the same `slotCredentialsFile`, so they are
// demonstrably reading one token — and each kept its own `lastFetchAt` and its
// own 429 curve for it. That is why one account of four gets stuck rather than
// all of them: the standing account is the only one with TWO readers, so it
// alone carried two independent floors (two requests may legitimately leave
// milliseconds apart) and two independent penalties (a refusal seen by one
// reader never held the other, so the hold that was meant to end the 429 was
// walked through by the other door and renewed itself).
//
// So the floor and the hold live HERE, keyed by the file, and every reader asks
// before it spends and reports after. Nothing in this module reaches the disk,
// the network or vscode: it is a ledger, and it is the only place either
// service is allowed to keep one.
import * as path from 'path';

/** Why a read was refused — a surface must be able to SAY it (Principle 1). */
export type UsageVerdictWhy = 'ok' | 'held' | 'floor';

export interface UsageVerdict {
    ok: boolean;
    why: UsageVerdictWhy;
    /** When this read would be allowed; 0 when it is allowed now. */
    readyAt: number;
    /** When the 429 hold lifts; 0 when this token is not held. */
    heldUntil: number;
}

interface TokenState {
    /** When a request last LEFT for this token, whichever service sent it. */
    lastAt: number;
    /** No read before this moment — the endpoint refused us. */
    holdUntil: number;
    /** The current curve; doubled per unexplained 429, cleared by a success.
     *  0 while the endpoint is naming its own wait (see rateLimitHold). */
    backoffMs: number;
}

/**
 * The hard floor between two requests for ONE token, whatever the setting says.
 * Below this the endpoint stops treating us as a polite client.
 */
export const MIN_CROSS_SERVICE_MS = 5_000;
/** What the setting defaults to — comfortably clear of the floor. */
export const DEFAULT_CROSS_SERVICE_MS = 10_000;

/** The setting's seconds as a usable interval. 0 or nonsense = the floor. */
export function crossServiceMs(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) { return MIN_CROSS_SERVICE_MS; }
    return Math.max(MIN_CROSS_SERVICE_MS, Math.round(seconds * 1000));
}

/**
 * ‼️ TWO READERS OF ONE FILE ARE ONE READER OF ONE TOKEN, and the file path is
 * how they recognise each other. Resolved so `a/./b` and `a/b` are one key, and
 * lower-cased on Windows because the file system is — a gate that let
 * `C:\Users\…` and `c:\users\…` be two tokens would be no gate at all on the
 * one platform this runs on.
 */
export function tokenKey(file: string): string {
    const f = (file || '').trim();
    if (!f) { return ''; }
    const abs = path.resolve(f);
    return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

export class UsageGate {
    private byToken = new Map<string, TokenState>();

    private state(key: string): TokenState {
        let s = this.byToken.get(key);
        if (!s) { s = { lastAt: 0, holdUntil: 0, backoffMs: 0 }; this.byToken.set(key, s); }
        return s;
    }

    /** When a request last left for this token — by ANY service. 0 = never. */
    lastAt(file: string): number {
        const key = tokenKey(file);
        return key ? (this.byToken.get(key)?.lastAt ?? 0) : 0;
    }

    /** When this token's hold lifts; 0 when it is not held right now. */
    heldUntil(file: string, now: number): number {
        const key = tokenKey(file);
        if (!key) { return 0; }
        const until = this.byToken.get(key)?.holdUntil ?? 0;
        return until > now ? until : 0;
    }

    /** The curve this token is on, for the next unexplained refusal. */
    backoffMs(file: string): number {
        const key = tokenKey(file);
        return key ? (this.byToken.get(key)?.backoffMs ?? 0) : 0;
    }

    /**
     * A request is LEAVING for this token. Recorded before the reply, never
     * after: a request that is answered in four seconds must still have cost
     * the floor, or two services each waiting for the other's answer both go.
     */
    spent(file: string, now: number): void {
        const key = tokenKey(file);
        if (!key) { return; }
        this.state(key).lastAt = now;
    }

    /**
     * The endpoint refused this token. `ms` is the wait, `said` whether the
     * endpoint named it — a hold it named does not feed the curve, so the next
     * unexplained 429 starts afresh (S-63's rule, kept in one place now).
     */
    held(file: string, ms: number, said: boolean, now: number): void {
        const key = tokenKey(file);
        if (!key) { return; }
        const s = this.state(key);
        s.holdUntil = now + ms;
        s.backoffMs = said ? 0 : ms;
    }

    /** It answered: whatever this token was serving is over. */
    cleared(file: string): void {
        const key = tokenKey(file);
        if (!key) { return; }
        const s = this.state(key);
        s.holdUntil = 0;
        s.backoffMs = 0;
    }

    /**
     * May a read for this token go out now?
     *
     * `skipHold` is the ONE privilege a person has — someone pressing ⟳ has
     * decided to spend a request, and a control that silently refuses for a
     * quarter of an hour is a control that has taught them it does not work.
     * The floor is never skipped, by anybody: it is what keeps a mashed button
     * from becoming a storm.
     */
    check(file: string, now: number, floorMs: number, skipHold = false): UsageVerdict {
        const key = tokenKey(file);
        // A token we cannot name is a token we cannot account for. Refusing it
        // would block the readers that legitimately have no file (an engine
        // whose figure is on this disk), so it passes and is not recorded.
        if (!key) { return { ok: true, why: 'ok', readyAt: 0, heldUntil: 0 }; }
        const s = this.byToken.get(key);
        const heldUntil = s && s.holdUntil > now ? s.holdUntil : 0;
        if (heldUntil && !skipHold) {
            return { ok: false, why: 'held', readyAt: heldUntil, heldUntil };
        }
        const floor = Math.max(MIN_CROSS_SERVICE_MS, floorMs);
        const ready = (s?.lastAt ?? 0) + floor;
        if (s?.lastAt && now < ready) {
            return { ok: false, why: 'floor', readyAt: ready, heldUntil };
        }
        return { ok: true, why: 'ok', readyAt: 0, heldUntil };
    }

    /**
     * How many of these tokens are held right now, `except` one. Two at once is
     * what a limit about the MACHINE looks like rather than about an account,
     * and that is the only thing allowed to stop the whole fleet (X-278).
     */
    heldCount(files: string[], now: number, except = ''): number {
        const skip = tokenKey(except);
        const seen = new Set<string>();
        for (const f of files) {
            const key = tokenKey(f);
            if (!key || key === skip || seen.has(key)) { continue; }
            seen.add(key);
        }
        let n = 0;
        for (const key of seen) {
            if ((this.byToken.get(key)?.holdUntil ?? 0) > now) { n++; }
        }
        return n;
    }

    /** Every token currently held, for a surface that lists them. */
    heldTokens(now: number): { key: string; until: number }[] {
        const out: { key: string; until: number }[] = [];
        for (const [key, s] of this.byToken) {
            if (s.holdUntil > now) { out.push({ key, until: s.holdUntil }); }
        }
        return out;
    }

    /** Tests and a sign-out: this token's ledger is no longer about anything. */
    forget(file: string): void {
        const key = tokenKey(file);
        if (key) { this.byToken.delete(key); }
    }
}
