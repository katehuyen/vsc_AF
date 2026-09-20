import * as path from 'path';
import {
    MIN_FETCH_INTERVAL_MS, EDGE_READ_FLOOR_MS,
    OauthCredentials, PlanBar, PlanUsageSnapshot, PlanUsageState, UsageReply,
    buildBars, fetchUsage, holdWords, rateLimitHold, readOauthCredentials, usageUserAgent
} from './planusage';
import { UsageGate, DEFAULT_CROSS_SERVICE_MS } from './usageGate';
import { adapterFor, EngineAccountSlot } from './engineAccounts';
import { MACHINE_ACCOUNT } from './accountStore';
import { EngineId } from './engines';
import { EngineUsage, UsageState } from './engineUsage';
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
 *   - ‼️ X-278 — A BACKOFF PER ACCOUNT, AND A FLEET-WIDE ONE ONLY ONCE THE
 *     MACHINE HAS SAID SO TWICE. This read "one shared backoff — a 429 stops
 *     the fleet, because the limit being reported is about this caller", and
 *     that premise was an ASSUMPTION nobody had measured: the accounts hold
 *     different tokens with different allowances, so one account exhausting its
 *     own query limit blinded the counters of two that were fine. Now the slot
 *     that was refused backs off alone, and the fleet backs off only when a
 *     SECOND, different slot is refused while the first is still held — which
 *     is what a limit about the machine looks like. The policy is therefore
 *     correct under either reading and costs exactly one extra request to find
 *     out which one is true; and the politeness the old note was protecting
 *     never lived in the backoff anyway — it lives in the shared floor above,
 *     which no number of accounts can buy a way past.
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

/**
 * ‼️ X-215 round 2 — ONE WINDOW A SLOT IS WALLED BY, NAMED, AND THE LIST OF
 * THEM RATHER THAN A PAIR OF HAND-NAMED FIELDS.
 *
 * X-326 put `fivePercent` / `weekPercent` (+ their resets) on `SlotUsage` and
 * the pickers drew both, which was right for Claude and only for Claude: those
 * four names hard-code that an account has exactly two windows and that they
 * are five hours and a week. Codex publishes its OWN pair (`codex_primary` /
 * `codex_secondary`, named by their own minutes), and every one of its windows
 * past the first was dropped on the floor by `usageFromEngine` — so a reading
 * that HAD the second figure could not carry it, and the card had nowhere to
 * put it even if it had.
 *
 * So a reading carries its windows as a LIST, each naming itself. Anything
 * drawing them iterates; nothing above has to know how many an engine has or
 * what they are called. `percent` / `resetsAt` stay beside it as the BINDING
 * window (the fullest — X-309), because that is what a rotation decides on and
 * a list is not a decision.
 */
export interface UsageBar {
    /** the reading's own id — `five_hour`, `seven_day`, `codex_primary`… */
    id: string;
    /** the product's one name for this window ('five-hour window', 'Current
     *  week (all models)') — see `toBar`, which is the only place it is decided */
    window: string;
    /** …the same name in the shortest unambiguous form ('5h', 'wk') */
    short: string;
    /** 0–100 */
    percent: number;
    /** epoch ms of the turnover; 0 when the reading did not say */
    resetsAt: number;
}

/**
 * ‼️ X-215 round 2 — THE SHORT NAME, DECIDED ON THE HOST, for the same reason
 * `windowNameOf` is (audit B-04.3): a picker row, a card heading and a chip all
 * need the two-character form, and three pages deriving it from the long name
 * is three pages that can disagree about one window.
 *
 * The space of long names is exactly two producers' output — `BAR_SPECS`
 * (src/core/planusage.ts) and `windowTitle` (src/core/engineUsage.ts) — so this
 * is a translation of what exists, not a guess at what might arrive. A name it
 * cannot shorten keeps the long one, which is ugly and true.
 */
export function shortWindowOf(window: string): string {
    const n = String(window || '').toLowerCase();
    if (!n) { return ''; }
    if (n.includes('week')) { return 'wk'; }
    // The product's own name for Claude's session window spells the five out.
    if (n.includes('five-hour') || n.includes('session')) { return '5h'; }
    const hours = n.match(/(\d+)\s*h\b/);
    if (hours) { return hours[1] + 'h'; }
    const mins = n.match(/(\d+)\s*m\b/);
    if (mins) { return mins[1] + 'm'; }
    const days = n.match(/(\d+)\s*day/);
    if (days) { return days[1] + 'd'; }
    if (n.includes('day')) { return '1d'; }
    return window;
}

/**
 * A reading's row, as the list above carries it.
 *
 * ‼️ THE NAME GOES THROUGH `windowNameOf`, NOT STRAIGHT OFF THE READING — audit
 * B-04.3 again, and it nearly came back in here. A `PlanBar`'s title is worded
 * as Claude Code's own /usage prints it ('Current session'), while the rest of
 * this product has one name for that window and it is 'five-hour window'. A
 * card carrying the reading's spelling in its bars and the product's in every
 * sentence around them would have said two things about one window — which is
 * the exact shape of the defect that audit closed, with neither name wrong.
 * So the five-hour row is named by the host, and every other row keeps the name
 * whoever measured it gave, which is what lets Codex's week be Codex's week.
 */
function toBar(b: PlanBar, engine: string): UsageBar {
    const window = windowNameOf(b.id === FIVE_HOUR ? '' : b.title, engine);
    return { id: b.id, window, short: shortWindowOf(window), percent: b.percent, resetsAt: b.resetsAt };
}

/**
 * ‼️ X-215 round 2 — WHICH OF A READING'S WINDOWS BINDS, for an engine that
 * names its own. The twin of `bindingBar` below and the same lesson X-309
 * measured on Claude: a slot that reports the FIRST window while a second one
 * is full is an account the pool keeps opening on and every round dies. Codex
 * hit exactly this — `eu.bars[0]` is its five-hour window and its week was
 * never looked at. A tie is the first bar, which is the engine's primary.
 */
export function fullestBar(bars: UsageBar[]): UsageBar | undefined {
    let best: UsageBar | undefined;
    for (const b of bars) {
        if (!best || b.percent > best.percent) { best = b; }
    }
    return best;
}

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
    /**
     * ‼️ X-215 round 2 — EVERY WINDOW THIS READING CARRIES, each naming itself.
     * Empty where nothing has been read. `percent` above is the fullest of
     * these; this is the list the card draws, one bar per entry.
     */
    bars?: UsageBar[];
    /** the tier the credentials state ('pro', 'max', …) */
    plan: string;
    /** when these figures were read; 0 = never */
    fetchedAt: number;
    /**
     * ‼️ X-215 — WHICH WINDOW THE PERCENTAGE IS OF. Absent = the five-hour one,
     * which is what every Claude row means and what every surface drew before a
     * second engine had a figure at all. Codex's own window is the WEEK, and a
     * card that printed 72% under the words "five-hour window" would be a lie
     * with a real number in it.
     */
    window?: string;
    /** one honest line for anything other than a live figure */
    note?: string;
}

/**
 * ‼️ X-215 / audit B-04.3 — WHAT THIS PERCENTAGE'S WINDOW IS CALLED, DECIDED ONCE.
 *
 * The Engines card got this right and five other places did not, because each
 * of them had typed the words out: the account chip's panel, the picker's
 * MIRROR (`media/afAccount.js`), the campaign strip, the leader picker and the
 * “Resume as…” quick pick all said “five-hour window” unconditionally. Measured
 * on the Codex card: it read “Current week 72%” while its own hover panel said
 * “72% of the five-hour window used” — the same figure under two window names,
 * one of them a lie with a real number in it.
 *
 * So the reading names its own window (`SlotUsage.window`) and this is the only
 * thing that fills the silence: an engine that named nothing is on the five-hour
 * window, which is what every row written before a second engine had a figure
 * meant — EXCEPT a disk-backed reading nobody has taken yet, where the length of
 * the window is IN the reading, so “five-hour” would be the one claim that is
 * certainly wrong. The host names it before it leaves; no page derives it.
 */
export function windowNameOf(named: string | undefined, engine: string): string {
    const stated = (named || '').trim();
    if (stated) { return stated; }
    return adapterFor(engine).quotaSource().kind === 'session-tail'
        ? 'usage window' : 'five-hour window';
}

/** …the same name INSIDE A SENTENCE. A reading names its window as a heading
 *  (“Current week”), and a heading dropped mid-sentence reads as a proper noun.
 *  The page-side twin is `AFAccount.windowPhrase` — two runtimes, one rule. */
export function windowPhraseOf(named: string | undefined, engine: string): string {
    const n = windowNameOf(named, engine);
    return n.charAt(0).toLowerCase() + n.slice(1);
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

/**
 * ‼️ X-215 — WHERE THIS SLOT'S OWN TRANSCRIPTS ARE, for an engine that records
 * its allowance instead of publishing one. The exact mirror of
 * `slotCredentialsFile`, and for the same reason: one place decides what a
 * slot's figure is read FROM, so the card, the service and the queue cannot
 * each answer it differently. '' where the engine has no such source.
 */
export function slotSessionDir(slot: { dir: string; engine: string } | undefined): string {
    if (!slot || !slot.dir) { return ''; }
    const source = adapterFor(slot.engine).quotaSource();
    return source.kind === 'session-tail' ? path.join(slot.dir, source.dir) : '';
}

/**
 * ‼️ X-215 — THE ENGINE'S OWN READING, NARROWED TO WHAT A SLOT ROW SHOWS.
 *
 * `usageFrom` below does this for Anthropic's snapshot and takes the FIVE-HOUR
 * bar, because that is the window a Claude plan is walled by. An engine that
 * publishes its own bars names its own window — Codex's is the week — so the
 * PRIMARY bar is the figure and the card is told what it is called. A card that
 * drew a weekly percentage under the words "five-hour window" would be a lie
 * with a real number in it, which is worse than the blank it replaces.
 */
export function usageFromEngine(slot: { id: string; engine: string }, eu: EngineUsage): SlotUsage {
    // ‼️ X-215 round 2 — ALL of them, not `bars[0]`. An engine that publishes a
    // second window had it dropped here, so the card could not have drawn it.
    const bars = eu.state === 'ok' ? eu.bars.map(b => toBar(b, slot.engine)) : [];
    const bar = fullestBar(bars);
    const read = eu.state === 'ok' && !!bar;
    return {
        slotId: slot.id, engine: slot.engine,
        state: read ? 'ok' : 'error',
        percent: read ? bar.percent : -1,
        resetsAt: read ? bar.resetsAt : 0,
        bars,
        plan: eu.plan ?? '',
        fetchedAt: eu.fetchedAt ?? 0,
        ...(read && bar.window ? { window: bar.window } : {}),
        ...(eu.note ? { note: eu.note } : {})
    };
}

/**
 * ‼️ X-243 — THE INVERSE OF `usageFromEngine`, for the surfaces that have to
 * draw a NAMED sign-in where they normally draw an engine.
 *
 * The status bar and the Dashboard card both speak `EngineUsage`; a slot's
 * reading is a `SlotUsage`. Shaping one into the other at the call site would
 * be a second answer about one set of figures — exactly the drift
 * `usageFromEngine` exists to stop from the other side — so the conversion is
 * here, once, and `not-published` survives it: an engine with no readable
 * allowance must not arrive as a failed read.
 */
export function engineUsageFromSlot(
    u: SlotUsage | undefined, engine: EngineId, label: string, note = ''
): EngineUsage {
    const bars: PlanBar[] = (u && u.state === 'ok' ? u.bars ?? [] : [])
        .map(b => ({ id: b.id, title: b.window, percent: b.percent, resetsAt: b.resetsAt }));
    const state: UsageState = !u ? 'unknown'
        : u.state === 'no-source' ? 'not-published'
            : bars.length ? 'ok' : 'unknown';
    return {
        id: engine, label, state, bars,
        plan: u?.plan ?? '', fetchedAt: u?.fetchedAt ?? 0, note: u?.note || note
    };
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
        // ‼️ X-215 — AND THE SENTENCE SAYS WHICH SILENCE THIS IS. A slot whose
        // figure is a file on this disk is not waiting for a request budget, and
        // telling the reader it is would send them to look at a queue it is not
        // in — the same kind of wrong sentence that kept these cards blank.
        note: source.kind === 'session-tail'
            ? 'Not read yet — this account\'s own transcripts hold the figure, so reading it costs '
                + 'no request and no place in any line. It fills in as soon as something looks.'
            : 'Not read yet — the next turn of the shared usage budget will pick this one up.'
    };
}

/** The all-models week — the OTHER window a Claude plan is walled by. */
export const SEVEN_DAY = 'seven_day';

/**
 * ‼️ X-309 — THE WINDOW THAT BINDS, not always the five-hour one.
 *
 * Measured on the first fire drill (campaign `sc-mu3psbkz`, 2026-09-16): a
 * slot read `0% of its five-hour window · ok` while the account was at 100% of
 * its WEEK — every round the pool opened on it died on "You've hit your weekly
 * limit", the pool went on calling it the emptiest account, and the campaign
 * stopped on the failure brake blaming permissions. The weekly bar was in the
 * snapshot the whole time; this function dropped it.
 *
 * So the figure a slot carries is whichever of the two windows is FULLER, and
 * `window` names it when it is not the five-hour one — the card already knows
 * how to say "of its current week" (X-215 taught it for Codex). A tie is the
 * five-hour window, the ordinary case. The per-model weekly bars are not
 * folded in: whether they bind depends on the launch's model, which a slot
 * figure does not know.
 */
export function bindingBar(snap: PlanUsageSnapshot | undefined): PlanBar | undefined {
    const five = fiveHourBar(snap);
    const week = snap?.bars.find(b => b.id === SEVEN_DAY);
    if (!five) { return week; }
    if (!week) { return five; }
    return week.percent > five.percent ? week : five;
}

/** A snapshot, narrowed to what a slot row shows. */
export function usageFrom(slot: { id: string; engine: string }, snap: PlanUsageSnapshot): SlotUsage {
    const bar = bindingBar(snap);
    const five = fiveHourBar(snap);
    /**
     * ‼️ THE WEEK A CARD DRAWS AND THE WEEK THAT BINDS ARE NOT THE SAME ROW,
     * deliberately. `bindingBar` folds in only the all-models week, because
     * whether a per-model one walls a run depends on the launch's model and a
     * slot figure does not know it (X-309). But a reader looking at the card
     * still wants to SEE the weekly figure their plan actually publishes, so
     * the drawn list falls back to the per-model row when there is no other.
     */
    const week = snap?.bars.find(b => b.id === SEVEN_DAY)
        ?? snap?.bars.find(b => b.id === 'seven_day_opus')
        ?? snap?.bars.find(b => b.id === 'seven_day_sonnet');
    const bars = snap.state === 'ok'
        ? [five, week].filter((b): b is PlanBar => !!b).map(b => toBar(b, slot.engine))
        : [];
    return {
        slotId: slot.id, engine: slot.engine,
        state: snap.state,
        percent: snap.state === 'ok' && bar ? bar.percent : -1,
        resetsAt: bar?.resetsAt ?? 0,
        bars,
        plan: snap.plan,
        fetchedAt: snap.fetchedAt,
        ...(snap.state === 'ok' && bar && bar.id !== FIVE_HOUR && bar.title ? { window: bar.title } : {}),
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
    return roomOrder(list, ceiling)[0];
}

/**
 * ‼️ X-258 — THE WHOLE LINE, NOT ONLY ITS HEAD, so a page can DRAW the rotation
 * instead of recomputing it.
 *
 * The card has to be able to say who is next, and the only honest way to say it
 * is to ask the thing that will really decide. So the ordering lives here and
 * `mostRoom` is now its FIRST ELEMENT rather than a second implementation of
 * the same rule — the one arrangement in which the sentence on the page and the
 * account the runner picks cannot come apart.
 *
 * The order is the rule `mostRoom` has always followed, written out:
 *   · an account at or past the ceiling, or otherwise unusable, is not in the
 *     line at all — it is not "last", it is out, and a card that drew it as
 *     last would be offering a turn the rotation will never give it;
 *   · a MEASURED account beats an unmeasured one, always, and the emptiest
 *     measured one leads. Picking a slot nobody has read over one provably at
 *     4% is choosing a guess over a fact;
 *   · among equals the user's own list order stands (the sort is stable), which
 *     is the same rule the tiers follow.
 */
export function roomOrder(list: SlotUsage[], ceiling = 100): SlotUsage[] {
    const usable = list.filter(u => slotIsUsable(u, ceiling));
    const read = (u: SlotUsage): boolean => u.state === 'ok' && u.percent >= 0;
    return [...usable.filter(read)].sort((a, b) => a.percent - b.percent)
        .concat(usable.filter(u => !read(u)));
}

/** How a campaign walks the accounts the user allowed it (X-207). */
export interface PickAccountOptions {
    /** the five-hour percentage at or above which an account is a wall */
    ceiling?: number;
    /** 'tiered' keeps to one engine at a time; anything else is the free pool */
    rotation?: string;
    /** the campaign's own engine, which is the first tier when it has accounts here */
    engine?: string;
}

/**
 * ‼️ X-207 — WHOSE TURN IT IS, given a pool the user picked and a strategy.
 *
 * `mostRoom` answers "who has the most room". That is the whole answer for a
 * pool of one engine, and it stays the answer for the FREE pool — this does not
 * reimplement it, it calls it, because a second copy of "a measured account
 * beats an unread one" would drift from the first.
 *
 * The second strategy exists because the free pool has a cost the user named:
 * with two engines in one pool it will happily spend a Codex account while a
 * Claude account sits at 40%, and "keep to my main engine until it is actually
 * walled" is a different intent, not a tuning of the same one.
 *
 * ‼️ TIERED IS A PROMISE NOT TO WANDER. It picks WITHIN the first tier that has
 * a usable account and only moves on when that whole tier is walled — at which
 * point moving is the entire value of the item, because the alternative is
 * sleeping until a reset while a signed-in account sits idle.
 *
 * ‼️ THE ORDER OF THE LIST IS THE ORDER OF THE TIERS. The user picks accounts in
 * an order; that order is the priority. A separate priority field would be a
 * second answer to one question, and the two would disagree the first time
 * somebody reordered the list without touching it.
 */
export function pickAccount(list: SlotUsage[], opts: PickAccountOptions = {}): SlotUsage | undefined {
    return accountOrder(list, opts)[0];
}

/**
 * ‼️ X-258 — THE ROTATION AS A LINE, and `pickAccount` is its head.
 *
 * The card asks "who is next" and there must be exactly ONE answer to that in
 * the product: a second ranking written for the page would separate what the
 * page says from what the campaign does, which is the defect the item was
 * opened for. So the strategy is resolved here and the pick is `[0]`.
 *
 * Every rule above still holds and is simply expressed over the whole line:
 * the free pool is one `roomOrder`; tiered is each tier's `roomOrder`, in tier
 * order, laid end to end — so "who is next" and "who is after that" are true
 * across a tier boundary too, which is exactly the moment the user cannot
 * predict for themselves.
 */
export function accountOrder(list: SlotUsage[], opts: PickAccountOptions = {}): SlotUsage[] {
    const ceiling = typeof opts.ceiling === 'number' ? opts.ceiling : 100;
    if (String(opts.rotation ?? '').trim().toLowerCase() !== 'tiered') {
        return roomOrder(list, ceiling);
    }
    const engineOf = (u: SlotUsage): string => String(u.engine ?? '').trim().toLowerCase();
    // First-appearance order, with the campaign's own engine promoted — but only
    // when it is really in the pool. Promoting an engine that has no account
    // here would invent an empty first tier and read as "the primary is walled".
    const tiers: string[] = [];
    for (const u of list) {
        const e = engineOf(u);
        if (!tiers.includes(e)) { tiers.push(e); }
    }
    const primary = String(opts.engine ?? '').trim().toLowerCase();
    const order = primary && tiers.includes(primary)
        ? [primary, ...tiers.filter(e => e !== primary)]
        : tiers;
    const out: SlotUsage[] = [];
    for (const e of order) { out.push(...roomOrder(list.filter(u => engineOf(u) === e), ceiling)); }
    return out;
}

/** ‼️ X-226 — the shortest wait a handover can be worth. It is the floor the
 *  retry itself starts on, so a wait under it buys the work nothing. */
export const CARRY_ON_FLOOR_MS = 60_000;

/**
 * ‼️ X-254 (d) — WHAT COUNTS AS "AT THE WALL", named ONCE.
 *
 * `pickAccount` has taken a `ceiling` since X-207 and every caller has been
 * passing 100 or nothing. The work queue now asks the same question — "is
 * this sign-in full right now" — and a second number invented over there is
 * how two surfaces come to disagree about the same plan on the same night.
 * So the default lives here, beside the rotation that already uses it.
 *
 * 100 rather than something cautious: the figure is a percentage of a window
 * the CLI itself reports, and holding work back at 90 would idle a plan that
 * still has a tenth of its window left.
 */
export const ACCOUNT_WALL_CEILING = 100;

/** What a run that met a wall knows about itself when it asks to be carried on. */
export interface CarryOnInput {
    /** the sign-in it was running as; empty = whichever one was active */
    from?: string;
    /** the engine it is bound to. Empty = claude, as every other reader reads it. */
    engine?: string;
    /** the accounts this machine has measured, as they were measured */
    usage: SlotUsage[];
    /** at or above this five-hour percentage an account is a wall */
    ceiling?: number;
    /** the moment the run would otherwise start again, epoch ms */
    waitUntil?: number;
    now?: number;
    /**
     * ‼️ X-226 (round 2) — THE SWITCH, AND IT SHIPS OFF. Empty = stay on `from`
     * and wait; a policy id (`@emptiest` · `@round-robin` · `@<rule>`) hands the
     * choice among the OTHER accounts to `resolve`; a slot id names the one
     * account to carry on with, if it has room.
     */
    want?: string;
    /** resolves a policy id over the pool (the host's `resolvePolicy`, with its cursor) */
    resolve?: (policyId: string, pool: SlotUsage[]) => { id: string; note?: string; refusal?: string };
}

/** The answer, and always the sentence for it — a handover nobody can read is
 *  a run that changed plans on its own. */
export interface CarryOn {
    slotId?: string;
    why: string;
}

/**
 * ‼️ X-226 — WHICH SIGN-IN SHOULD CARRY THIS WORK ON, when the one it was
 * running as has hit its wall.
 *
 * The X-211 family promised "the quota runs out mid-work, so change account and
 * carry on" and built it into the Console window only — the surface where a
 * person is sitting and can move the card by hand. The surface that needs it is
 * the unattended one: a headless run meets a limit at 03:00, `retryDecision`
 * (M-10) reads ONE plan's reset and parks the retry until it reopens, and three
 * signed-in accounts sit at 4% for four hours while the work sleeps.
 *
 * ‼️ IT DOES NOT DECIDE WHICH ACCOUNT. `pickAccount` does — X-207's answer to
 * "whose turn is it", already shipped for the sentry pool. A second rotation
 * rule here is how the campaign and the queue would come to disagree about the
 * same night. What THIS adds is who may be asked at all, and it refuses more
 * often than it agrees:
 *
 *   · never the account that just refused the work, whatever its last read
 *     says — the refusal is fresher than the figure;
 *   · never another engine. The sentry may cross engines because it opens a NEW
 *     round; a carried-on run resumes a transcript, and a transcript belongs to
 *     one CLI;
 *   · never out of an empty pool. The absence of a slot is the main sign-in
 *     (X-172), and it cannot be asked how much room it has;
 *   · never a run PINNED to `@machine`. "Nothing is injected" is an instruction
 *     the user typed into the form, and a handover would inject one;
 *   · never for a wait shorter than the handover's own floor, which would move
 *     a plan to buy nothing.
 */
export function carryOnAccount(i: CarryOnInput): CarryOn {
    const now = typeof i.now === 'number' ? i.now : Date.now();
    const ceiling = typeof i.ceiling === 'number' ? i.ceiling : 100;
    const from = String(i.from ?? '').trim();
    const engine = (String(i.engine ?? '').trim() || 'claude').toLowerCase();
    const wait = typeof i.waitUntil === 'number' ? i.waitUntil : 0;
    const want = String(i.want ?? '').trim();

    // ‼️ X-226 (round 2) — NOTHING ASKED FOR IS NOTHING DONE. The run was given
    // a sign-in; unless its policy names who may take over, it keeps that one
    // and waits for its reset. This is the default, and it is the whole point.
    if (!want) {
        return { why: 'carrying on to another sign-in is off for this run (retry policy `carryOn` is '
            + 'not set), so it waits for its own reset' };
    }
    if (from === MACHINE_ACCOUNT) {
        return { why: 'this run is pinned to the identity the machine itself is signed in as, so '
            + 'nothing is injected — it waits rather than being moved onto a plan it did not name' };
    }
    if (wait - now <= CARRY_ON_FLOOR_MS) {
        return { why: 'the wait is shorter than the minute a handover would itself take, so moving '
            + 'the work to another plan would buy it nothing' };
    }
    const pool = (i.usage ?? []).filter(u =>
        u.slotId !== from && String(u.engine ?? '').trim().toLowerCase() === engine);
    if (!pool.length) {
        return { why: `no other ${engine} account is captured on this machine, so there is nobody `
            + 'to hand the work to' };
    }
    const walled = `${from || 'the active sign-in'} is walled until ${new Date(wait).toLocaleTimeString()}`;
    const figure = (u: SlotUsage | undefined): string =>
        u && u.state === 'ok' && u.percent >= 0 ? `${u.percent}%` : 'unmeasured';
    // A NAMED ACCOUNT: that one, if it has room — never a substitute for it.
    if (!want.startsWith('@')) {
        if (want === from) {
            return { why: `the policy names ${want} to carry on with, and that is the sign-in that just `
                + 'hit the wall, so the wait stands' };
        }
        const u = pool.find(x => x.slotId === want);
        if (!u) {
            return { why: `the policy names ${want} to carry on with, which is not a captured ${engine} `
                + 'sign-in on this machine, so the wait stands' };
        }
        if (u.state !== 'ok' || u.percent >= ceiling) {
            return { why: `the policy names ${want} to carry on with, and it is ${u.state === 'ok'
                ? `at ${u.percent}% of its window too` : u.state}, so the wait stands` };
        }
        return { slotId: want, why: `${walled}, and the policy names ${want} (${figure(u)}) — the work carries on there` };
    }
    // A POLICY: the host's own resolver, so `@round-robin` moves the same cursor a
    // launch would; without one only the built-in @emptiest can be answered here.
    if (i.resolve) {
        const r = i.resolve(want, pool);
        const id = String(r.id ?? '').trim();
        if (r.refusal || !id) {
            return { why: `${want} could not choose another ${engine} sign-in — ${r.refusal || 'nothing chosen'} — so the wait stands` };
        }
        return { slotId: id, why: `${walled}, and ${want} chose ${id} (${figure(pool.find(x => x.slotId === id))}) — the work carries on there` };
    }
    if (want.toLowerCase() !== '@emptiest') {
        return { why: `${want} names a policy and nothing here can resolve one, so the wait stands` };
    }
    const pick = pickAccount(pool, { ceiling, engine });
    if (!pick) {
        return { why: `every other ${engine} account is at or above ${ceiling}% of its five-hour `
            + 'window too, so the wait stands' };
    }
    return {
        slotId: pick.slotId,
        why: `${walled}, and ${pick.slotId} has room (${pick.percent}%) — the work carries on there rather `
            + 'than sleeping'
    };
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
    /**
     * How long one slot's figures stay fresh. ‼️ X-240 — PER SLOT when asked
     * with one: a sign-in mid-turn is on the seconds beat, one nobody is
     * running on is on the idle minutes, so five accounts of which two are
     * working cost two fast readers and three slow ones rather than five fast.
     * Asked with no slot it is the fleet-wide figure. 0 = automatic reads off.
     */
    ttlMs(slot?: EngineAccountSlot): number;
    /**
     * ‼️ X-241 — THE SWITCH. `false` and the timer's reads (`beat`) do nothing
     * at all — no slot is chosen, no request is made — while a person's ⟳
     * (`refresh` / `refreshSlot`) and the turn-boundary edge still work.
     * Absent = on.
     */
    autoBeat?(): boolean;
    /** closest two AUTOMATIC reads may be — the user's own active interval */
    edgeFloorMs?(): number;
    cliVersion?(): string | undefined;
    /** overridable for tests */
    readCreds?(file: string): OauthCredentials | undefined;
    fetchImpl?(token: string, userAgent: string): Promise<UsageReply>;
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
    /**
     * ‼️ X-261 — SOMEBODY IS TOLD WHEN A SIGN-IN FALLS OVER, and it is not
     * the campaign's business alone.
     *
     * X-178's announcement was real and well written, but its only caller
     * sat inside the sentry turn and `applySentrySlotHealth` opens with
     * `if (!this.sentry) return`. So a token that died while the user was
     * working across three accounts by hand — which is most of the day —
     * was noticed by nothing and said by nobody: the account simply stopped
     * being chosen, and the user found out by wondering.
     *
     * This is the seam for it, and it belongs HERE because this class is the
     * only thing that measures. Called after every read that settles a
     * figure, with everything known at that moment — judging what CHANGED is
     * the listener's job, not a second memory in here.
     */
    onRead?(usage: SlotUsage[]): void;
    /**
     * ‼️ X-215 — READ A SLOT'S OWN TRANSCRIPTS, for an engine whose allowance is
     * on this disk rather than behind an endpoint (`QuotaSource.session-tail`).
     *
     * The service owns no `fs` — this is the file half, handed in the way every
     * other read here is. It is called with the slot and the directory
     * `slotSessionDir` resolved, and it answers with the engine's own reading or
     * nothing. Undefined hook = the branch is simply not read, which is what
     * every caller written before this did.
     */
    readSessionTail?(slot: EngineAccountSlot, dir: string): EngineUsage | undefined;
    /**
     * ‼️ X-240 — THE LEDGER THIS SERVICE SHARES WITH `PlanUsageService`.
     *
     * Both resolve their file through `slotCredentialsFile`, so a slot that is
     * also the STANDING account is read by both — and each used to keep its own
     * floor and its own 429 curve for that one token. One account of four
     * getting stuck was not a coincidence: it was the only one with two
     * readers. Absent = this service keeps its own ledger, the old behaviour.
     */
    gate?: UsageGate;
    /** The floor between two requests for one TOKEN, across both services.
     *  Defaults to `DEFAULT_CROSS_SERVICE_MS`; never below the hard floor. */
    minIntervalMs?(): number;
    now?(): number;
}

/**
 * One request budget, shared by every account on the machine.
 *
 * The shape mirrors `PlanUsageService` on purpose — same three reasons, same
 * floors, same backoff — because two rate-limit policies in one codebase is how
 * one of them ends up wrong.
 */
/**
 * Why a read is happening, and therefore what it is allowed to skip.
 *
 * |         | skips the TTL | skips a hold | floor                |
 * |---------|---------------|--------------|----------------------|
 * | `beat`  | no            | no           | the shared minimum   |
 * | `edge`  | yes           | no           | the active interval  |
 * | `auto`  | yes           | no           | the shared minimum   |
 * | `user`  | yes           | **yes**      | the shared minimum   |
 *
 * ‼️ X-240 ADDED `auto`, AND THE HOLE THAT MADE IT NECESSARY WAS MEASURED.
 * `accounts.status` is the op an UNATTENDED RUNNER calls in a loop to decide
 * whether it may start a session — its own description says exactly that — and
 * it reached the endpoint through `refresh()`, i.e. as `user`. So the one
 * caller most likely to ask again and again held the single privilege that
 * walks through a 429, and every pass pushed the penalty further out. Only a
 * PERSON may spend through a hold; an agent in a loop is not a person, and
 * neither is a timer. `auto` is what everything automatic that still needs a
 * figure NOW asks with: the TTL is skipped, and nothing else is.
 */
export type UsageReason = 'beat' | 'edge' | 'auto' | 'user';

export class AccountUsageService {
    private byId = new Map<string, SlotUsage>();
    /** The MACHINE-wide floor: one request per interval however many accounts
     *  there are. Not the same thing as the per-token floor, which belongs to
     *  the gate — this one is about being a polite client, that one about not
     *  spending one account's allowance twice. */
    private lastFetchAt = 0;
    /**
     * ‼️ X-278 kept one curve per ACCOUNT, and X-240 moves it one step further
     * out: the curve belongs to the TOKEN, so the indicator that reads the
     * standing sign-in is held by the same refusal this service took. Keyed by
     * the credentials file in `gate`, not by slot id — two slots pointing at
     * one directory are one allowance, and they used to be two.
     */
    private gate: UsageGate;
    /** …and the fleet-wide hold, engaged only once a second slot is refused
     *  while a first is still held (see the header). */
    private backoffUntil = 0;
    private inflight: Promise<SlotUsage[]> | undefined;

    constructor(private opts: AccountUsageOptions) {
        this.gate = opts.gate ?? new UsageGate();
    }

    private now(): number { return (this.opts.now ?? Date.now)(); }

    /** The floor between two requests for one TOKEN, whoever sends them. */
    private minIntervalMs(): number {
        return this.opts.minIntervalMs?.() ?? DEFAULT_CROSS_SERVICE_MS;
    }

    /** This slot's token, as both services name it. '' = nothing to charge. */
    private fileOf(slotId: string): string {
        return slotCredentialsFile(this.opts.slots().find(s => s.id === slotId));
    }

    /** Everything known right now — never touches the network. */
    current(): SlotUsage[] {
        return this.opts.slots().map(s => this.byId.get(s.id) ?? unreadUsage(s));
    }

    /** When the FLEET-WIDE backoff lets the next automatic read through; 0 =
     *  none. One account being held is not this (X-278) — ask `rateLimitedFor`. */
    rateLimitedUntil(): number { return this.backoffUntil; }

    /** ‼️ X-278 — when THIS account's own backoff lets it be read again; 0 =
     *  none. The card's figure is stale for a reason a reader can now be told. */
    rateLimitedFor(slotId: string): number {
        return this.gate.heldUntil(this.fileOf(slotId), this.now());
    }

    /** How many accounts are being held right now — two is what a limit about
     *  the MACHINE looks like, and what escalates. Counted over TOKENS, so two
     *  slots sharing a directory cannot make one refusal look like two. */
    private heldCount(now: number, except = ''): number {
        const files = this.opts.slots().map(s => slotCredentialsFile(s)).filter(Boolean);
        return this.gate.heldCount(files, now, except ? this.fileOf(except) : '');
    }

    /**
     * Which slot the next request would spend itself on, or undefined when
     * nothing is due. Exposed because a surface that says "refreshing
     * <account>" is telling the truth about a queue the user cannot otherwise
     * see (Principle 1).
     */
    dueNext(reason: UsageReason = 'beat'): EngineAccountSlot | undefined {
        return this.pick(this.opts.slots(), reason, this.now());
    }

    /**
     * Somebody asked for a figure NOW rather than on the beat.
     *
     * `user` is a PERSON and is the only thing allowed through a 429 hold;
     * `auto` is a runner or a timer that still wants the TTL skipped and is
     * refused by a hold like everything else automatic (see `UsageReason`).
     * One slot either way — the round robin is what makes "all of them" a line
     * rather than a burst.
     */
    refresh(reason: 'user' | 'auto' = 'user'): Promise<SlotUsage[]> { return this.read(reason); }

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
    refreshSlot(slotId: string, reason: 'user' | 'auto' = 'user'): Promise<SlotUsage[]> {
        const now = this.now();
        const slot = this.opts.slots().find(s => s.id === slotId);
        if (!slot || adapterFor(slot.engine).quotaSource().kind === 'none') {
            return Promise.resolve(this.current());
        }
        // ‼️ X-215 — A FILE READ IS NOT A REQUEST. It answers here, before the
        // floor and before the in-flight guard: a card whose figure is on this
        // disk must not be told to wait for a queue that exists to be polite to
        // somebody else's endpoint.
        if (slotSessionDir(slot)) { return Promise.resolve(this.readTail(slot, 0)); }
        // ‼️ X-240 — AND THIS DOOR USED TO IGNORE THE HOLD ENTIRELY.
        //
        // `pick` skips a held account, so the beat was safe; this path chose the
        // account by name and asked no questions, and its callers are not all
        // people. The worst of them is the sentry's wall detection, which fires
        // `refreshSlot` on EXACTLY the account that just hit a wall — the one
        // certain to answer 429 — and every such answer pushed the hold further
        // out. That is the loop where a three-minute penalty never ends.
        //
        // `reason` is what separates the two: a person pressing ⟳ still spends
        // their request through a hold (a control that refuses for a quarter of
        // an hour has taught them it is broken), and everything automatic waits.
        const file = slotCredentialsFile(slot);
        const verdict = this.gate.check(file, now, this.minIntervalMs(), reason === 'user');
        if (!verdict.ok) { return Promise.resolve(this.current()); }
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
        slots: EngineAccountSlot[], reason: UsageReason, now: number
    ): EngineAccountSlot | undefined {
        // Only slots the ENDPOINT can be asked about. A slot with no source at
        // all is reported from its adapter's own sentence; a `session-tail` slot
        // has a figure and needs no request for it (X-215), and letting it take a
        // turn in a round robin that hands out one request per interval would
        // starve the slots that actually need one.
        const readable = slots.filter(s => adapterFor(s.engine).quotaSource().kind === 'oauth-credentials'
            // ‼️ X-278 — and not one the endpoint has just refused. Its turn is
            // SKIPPED rather than spent: leaving it in the round robin would
            // hand the fleet's one request per interval to the only account
            // that certainly cannot use it, which is the same blindness the
            // shared backoff caused, arriving by the other door. A person
            // asking for a named slot goes through `refreshSlot`, not here.
            && !(reason !== 'user' && this.rateLimitedFor(s.id)));
        if (!readable.length) { return undefined; }
        const due = readable.filter(s => {
            // ‼️ The TTL is per SLOT while the floor is per MACHINE. That pair is
            // what makes the round robin work: five slots on a 60 s TTL do not
            // ask five times a minute, they take one turn each in order. X-240 —
            // and the TTL is each slot's OWN: a working sign-in's seconds, an
            // idle one's minutes. A TTL of 0 is "automatic reads off" (the
            // minutes setting at 0), so a beat then owes that slot nothing —
            // measured before: 0 made every slot due on every tick.
            if (reason !== 'beat') { return true; }
            const ttl = Math.max(0, this.opts.ttlMs(s));
            if (!ttl) { return false; }
            const u = this.byId.get(s.id);
            if (!u || !u.fetchedAt) { return true; }
            return now - u.fetchedAt >= ttl;
        });
        if (!due.length) { return undefined; }
        // Oldest figures first; never read = oldest of all.
        return due.reduce((oldest, s) => {
            const a = this.byId.get(s.id)?.fetchedAt ?? 0;
            const b = this.byId.get(oldest.id)?.fetchedAt ?? 0;
            return a < b ? s : oldest;
        });
    }

    /**
     * ‼️ X-215 — THE HALF THAT COSTS NOTHING, done first and unconditionally.
     *
     * Every gate below this — the shared floor, the 429 backoff, the one-request
     * round robin, the in-flight guard — exists for one reason: asking how much
     * quota is left must not become the thing that spends it. None of that is
     * true of a file on this machine, so none of it applies here. What DOES
     * apply is the per-slot TTL, because a walk of a sessions folder on every
     * paint is a cost of its own.
     */
    private readTails(now: number): void {
        if (!this.opts.readSessionTail) { return; }
        for (const slot of this.opts.slots()) {
            const dir = slotSessionDir(slot);
            if (!dir) { continue; }
            const ttlMs = Math.max(0, this.opts.ttlMs(slot));
            const had = this.byId.get(slot.id);
            if (had && had.fetchedAt && now - had.fetchedAt < ttlMs) { continue; }
            this.readTail(slot, ttlMs);
        }
    }

    /** One slot's own transcripts, put on the record. Never throws: a folder
     *  that is not there is a slot with no figure, not a broken service. */
    private readTail(slot: EngineAccountSlot, ttlMs: number): SlotUsage[] {
        const dir = slotSessionDir(slot);
        if (!dir || !this.opts.readSessionTail) { return this.current(); }
        const now = this.now();
        const had = this.byId.get(slot.id);
        if (ttlMs && had && had.fetchedAt && now - had.fetchedAt < ttlMs) { return this.current(); }
        let eu: EngineUsage | undefined;
        try { eu = this.opts.readSessionTail(slot, dir); } catch { eu = undefined; }
        if (!eu) {
            // Nothing read is NOT nothing to read: the slot keeps saying it is
            // unread rather than acquiring a zero it never measured.
            if (!had) { this.byId.set(slot.id, unreadUsage(slot)); }
            return this.current();
        }
        return this.settle(usageFromEngine(slot, eu));
    }

    /**
     * A figure has just been settled. ONE place, so the announcement cannot
     * be attached to three of the four ways a slot's figure lands and look
     * connected. A listener that throws must never break a read: the figure
     * is the product's, the announcement is a courtesy on top of it.
     */
    private settle(u: SlotUsage): SlotUsage[] {
        this.byId.set(u.slotId, u);
        const all = this.current();
        try { this.opts.onRead?.(all); } catch { /* announcing never breaks a read */ }
        return all;
    }

    private read(reason: UsageReason): Promise<SlotUsage[]> {
        const now = this.now();
        // ‼️ X-241 — the switch is read before anything, file walks included:
        // "off" means the timer costs nothing, not "costs no request".
        if (reason === 'beat' && this.opts.autoBeat && !this.opts.autoBeat()) { return Promise.resolve(this.current()); }
        const slots = this.opts.slots();
        this.readTails(now);
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
        // ‼️ X-240 — and the chosen account's own TOKEN floor, which the round
        // robin cannot see: the standing sign-in may have been read by the
        // indicator a second ago, and that request came out of this allowance.
        if (!this.gate.check(slotCredentialsFile(target), now, this.minIntervalMs(), reason === 'user').ok) {
            return Promise.resolve(this.current());
        }
        if (this.inflight) { return this.inflight; }
        this.inflight = this.load(target, now).finally(() => { this.inflight = undefined; });
        return this.inflight;
    }

    private async load(slot: EngineAccountSlot, now: number): Promise<SlotUsage[]> {
        this.lastFetchAt = now;
        const file = slotCredentialsFile(slot);
        if (!file) { return this.current(); }
        // ‼️ X-240 — the token is charged BEFORE the reply, so the other reader
        // of this same file sees the request the moment it leaves rather than
        // when it lands. Two services each waiting on the other's answer both go.
        this.gate.spent(file, now);
        const cred = (this.opts.readCreds ?? readOauthCredentials)(file);
        const put = (u: SlotUsage) => this.settle(u);
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
                // ‼️ X-278 — THIS ACCOUNT BACKS OFF. The accounts hold different
                // tokens with different allowances, so one being refused says
                // nothing about the others until the machine says it twice.
                // ‼️ S-63 — the endpoint's own figure when it gave one; the
                // curve only when it did not. A hold the endpoint named does
                // not feed the curve: the next unexplained 429 starts it afresh.
                const hold = rateLimitHold(res, this.gate.backoffMs(file));
                const ms = hold.ms;
                this.gate.held(file, ms, hold.said, now);
                const said = hold.said ? `asked for ${holdWords(ms)}` : `did not say how long`;
                // …and a SECOND account held at the same time is what a limit
                // about this machine actually looks like. Only then does the
                // fleet stop, and only for as long as the longest hold.
                const others = this.heldCount(now, slot.id);
                if (others > 0) {
                    let until = now + ms;
                    for (const h of this.gate.heldTokens(now)) { until = Math.max(until, h.until); }
                    this.backoffUntil = until;
                    return put(bad('error',
                        `The usage endpoint rate limited this account (it ${said}), and ${others === 1 ? 'another is' : others + ' others are'} `
                        + `held too — that is a limit on this machine, so every account backs off. `
                        + `Next automatic read in ${holdWords(until - now)}.`,
                        cred.plan));
                }
                return put(bad('error',
                    `The usage endpoint rate limited THIS account (it ${said}) — it backs off for ${holdWords(ms)}; `
                    + 'the other accounts keep being read, because their allowance is their own.',
                    cred.plan));
            }
            if (res.status !== 200) {
                return put(bad('error', `Usage endpoint returned HTTP ${res.status}.`, cred.plan));
            }
            const bars = buildBars(JSON.parse(res.body) as unknown);
            if (!bars.length) {
                return put(bad('error', 'The usage endpoint reported no limits for this account.', cred.plan));
            }
            // A read that got through clears this account's hold — and the
            // fleet's, because a request the endpoint answered is the plainest
            // possible evidence that this machine is not the thing being
            // limited (X-278).
            this.gate.cleared(file);
            this.backoffUntil = 0;
            return put(usageFrom(slot, { state: 'ok', bars, plan: cred.plan, fetchedAt: now }));
        } catch (e) {
            return put(bad('error',
                `Could not reach the usage endpoint: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
                cred.plan));
        }
    }
}
