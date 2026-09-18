/**
 * X-112 — WHO IS BILLED FOR A RUN, AND WHAT ITS FIGURES MEAN.
 *
 * Two numbers travel with every run and both were being read as if the route
 * did not exist: `wTokens` ("⚖ against the 5h limit") and `cost`. A Claude
 * session that went through Kimi wrote the same weighted tokens as one on the
 * Anthropic plan — and those tokens never touched the plan's window. Its
 * `total_cost_usd` is Claude's own arithmetic at the ANTHROPIC tariff, which
 * is not Kimi's invoice and not anybody's. The design (X-97 → "Maliyet, kota,
 * context ve yetenekler"): a figure carries what it IS, and a route's usage is
 * written to the plan window only when the plan is what served it.
 *
 * This file is the ONE place that rule is stated. It is derived from the run's
 * identity (which route was declared, on which engine) and the engine's own
 * cost contract — never from a model name, and never per surface.
 */
import { ProviderOrigin, RedactedRoute } from './providerIdentity';
import { engineOf } from './consoleEngine';

export type BillingMode =
    /** The Claude plan (OAuth sign-in): tokens fill its five-hour window; the
     *  dollar figure is what the same work would cost at API rates. */
    | 'plan'
    /** An Anthropic API key: the dollar figure is the bill; no plan window. */
    | 'api'
    /** A third-party endpoint behind the Claude CLI (Kimi, MiniMax, a custom
     *  Anthropic-compatible route): no plan window, and Claude's dollar figure
     *  is NOT this route's bill — it was computed at the Anthropic tariff. */
    | 'third-party'
    /** Another engine entirely: its own contract, never the Claude window. */
    | 'engine'
    /** A run we cannot place: a foreign transcript, or asked and unanswered. */
    | 'unknown';

export type CostMeaning =
    /** The figure is the engine's own statement of what was billed. */
    | 'engine-reported'
    /** The figure is an estimate at a stated tariff, not an invoice. */
    | 'estimate'
    /** No figure can be given: the tariff is not known, or the engine states none. */
    | 'none';

export interface BillingIdentity {
    mode: BillingMode;
    /** Do this run's weighted tokens count on the Claude plan's five-hour window? */
    planWindow: boolean;
    /** What a `cost` beside this run IS. */
    cost: CostMeaning;
    /** '' when no figure is an invoice or an estimate in any currency. */
    currency: 'USD' | '';
    /** One sentence a panel can print after "Billing: ". */
    why: string;
    /**
     * ‼️ THE LABEL THE ⚖ FIGURE IS PRINTED UNDER, worded here and nowhere else.
     * Every surface that draws the weighted count was writing "Against the 5h
     * limit" over runs that never touched one; a page that composed its own
     * replacement would be the same defect one route later.
     */
    weighed: string;
    /**
     * ‼️ THE FEW CHARACTERS THE ⚖ FIGURE ITSELF CARRIES IN A CELL — '' for the
     * ordinary run, which is most of them.
     *
     * Scoped to the Claude CLI on a route that is not the plan, which is the
     * same set `spendByAccount` already counts as `offPlan`. Another ENGINE is
     * deliberately left unmarked: it wears its own badge on the same row, and
     * "off-plan" said over a Codex run would be a NEW falsehood — that run is
     * on a ChatGPT plan, just not on this one's window. The panel still says so
     * in full (`weighed`); what the cell must not do is shout it on every row
     * of a machine that runs two engines.
     */
    mark: string;
    /** What a dollar figure beside this run IS, in a few words. '' when none. */
    costIs: string;
    /**
     * ‼️ THE KIND OF DOLLAR, as a key a sum groups by — the boundary a total
     * may not cross blindly. Two runs share it only when their figures mean the
     * same thing: `equivalent` (the plan), `bill` (an API key), `arithmetic`
     * (a third-party route under the Claude CLI), `rules` (your pricing rules),
     * `reported:<engine>` (one engine's own figure — two engines' own figures
     * are two vendors' claims, not one), `unplaced`. '' when there is no figure.
     */
    dollar: string;
}

export interface BillingSubject {
    engine: string;
    providerId?: string;
    providerLabel?: string;
    origin?: ProviderOrigin;
    binding?: 'declared' | 'legacy' | 'external' | 'unknown';
    /**
     * ‼️ THE PUBLIC HALF OF THE ROUTE THE LAUNCH SEALED, AND IT DECIDES.
     *
     * `baseUrl` is the same field `ProviderAdapter.billingPolicy` reads to
     * answer this very question, and the two must not disagree: a rule stated
     * twice is a rule that is about to be stated two ways. A name list can only
     * recognise the routes THIS build ships, so a user's own profile pointed at
     * Anthropic was being called third-party and one pointed at a proxy was
     * being called the plan — exactly backwards, in the one item written to
     * stop a figure claiming a window it never filled.
     */
    route?: RedactedRoute;
}

/** The shipped Claude routes that are Anthropic's own — the fallback for a
 *  record from before the route was written into the manifest. */
const ANTHROPIC_PLAN = new Set(['', 'anthropic']);
const ANTHROPIC_API = 'anthropic-api';

/**
 * ‼️ ONE PHRASE FOR EVERY RUN THAT IS WEIGHED AND ON NO WINDOW. The weighting
 * itself is Anthropic's plan formula (`QUOTA_WEIGHTS`), which is why the figure
 * is still worth printing — it is how these runs are compared with each other.
 * What it is NOT is a reading of anybody's five-hour limit.
 */
const OFF_PLAN_WEIGHED = 'Weighted at the plan formula — but on NO plan window';

/** plan · api · third-party, off a sealed route. `undefined` = none recorded. */
function modeFromRoute(route: RedactedRoute | undefined): 'plan' | 'api' | 'third-party' | undefined {
    if (!route) { return undefined; }
    if (String(route.baseUrl || '').trim()) { return 'third-party'; }
    return String(route.authKind || '').trim() === 'api-key' ? 'api' : 'plan';
}

export function billingOf(v: BillingSubject): BillingIdentity {
    const engine = String(v.engine || 'claude').trim().toLowerCase() || 'claude';
    const providerId = String(v.providerId || '').trim().toLowerCase();

    if (engine !== 'claude') {
        const src = engineOf(engine).costSource;
        const label = engineOf(engine).label;
        return {
            mode: 'engine', planWindow: false,
            cost: src === 'cli' ? 'engine-reported' : src === 'tokens' ? 'estimate' : 'none',
            currency: src === 'none' ? '' : 'USD',
            why: label + '’s own billing — never the Claude plan window. '
                + (src === 'cli' ? 'The dollar figure is what the engine itself reported.'
                    : src === 'tokens' ? 'The dollar figure is derived from tokens by your pricing rules — for comparing runs, not an invoice.'
                        : 'This engine states neither a price nor tokens, so there is no figure.'),
            weighed: OFF_PLAN_WEIGHED, mark: '',
            costIs: src === 'cli' ? 'reported by ' + label + ' itself'
                : src === 'tokens' ? 'your pricing rules, not an invoice' : '',
            dollar: src === 'cli' ? 'reported:' + engine : src === 'tokens' ? 'rules' : ''
        };
    }

    if (v.binding === 'external' || v.binding === 'unknown') {
        return {
            mode: 'unknown', planWindow: false, cost: 'none', currency: '',
            why: v.binding === 'external'
                ? 'not ours — which sign-in or route served this transcript was never recorded, so neither its tokens nor its dollars are placed anywhere.'
                : 'asked, and nothing answered — this run is on no window and no invoice until somebody looks.',
            weighed: 'Weighted — but nothing says which window, if any, it filled',
            mark: 'unplaced', costIs: '', dollar: 'unplaced'
        };
    }

    const mode = modeFromRoute(v.route)
        ?? (providerId === ANTHROPIC_API ? 'api'
            : ANTHROPIC_PLAN.has(providerId) ? 'plan' : 'third-party');

    if (mode === 'api') {
        return {
            mode: 'api', planWindow: false, cost: 'engine-reported', currency: 'USD',
            why: 'Anthropic API key — the dollar figure is the bill at the API tariff. Not on any plan window: a key is metered, not rationed.',
            weighed: 'Weighted — but a key fills no plan window',
            mark: 'off-plan', costIs: 'the bill, at the API tariff', dollar: 'bill'
        };
    }

    if (mode === 'plan') {
        return {
            mode: 'plan', planWindow: true, cost: 'estimate', currency: 'USD',
            why: 'the Claude plan — ⚖ weighted tokens fill this sign-in’s five-hour window. The dollar figure is what the same work would cost at API rates; a plan pays nothing per token.',
            weighed: 'Against the 5h limit', mark: '',
            costIs: 'API-equivalent — a plan pays no per-token bill', dollar: 'equivalent'
        };
    }

    const name = String(v.providerLabel || '').trim() || providerId || 'a route of your own';
    return {
        mode: 'third-party', planWindow: false, cost: 'none', currency: '',
        why: name + ' — a third-party endpoint behind the Claude CLI. ⚖ NOT on the Claude plan window: these tokens never touched the sign-in’s five-hour limit. '
            + 'Any dollar figure beside this run is Claude’s own arithmetic at the ANTHROPIC tariff, not this route’s bill — no tariff is known for it, so none is stated.',
        weighed: OFF_PLAN_WEIGHED, mark: 'off-plan',
        costIs: 'Anthropic-tariff arithmetic, not this route’s bill', dollar: 'arithmetic'
    };
}

/** One kind of dollar inside a total: what it is, how much, over how many runs. */
export interface DollarPart {
    dollar: string;
    /** The run's own `costIs`, so a breakdown is worded by the rule, not a page. */
    label: string;
    usd: number;
    runs: number;
}

export interface DollarSum {
    usd: number;
    /** Largest first. Empty when nothing had a figure. */
    parts: DollarPart[];
    /** More than one kind of dollar went into `usd` — the total is not one thing. */
    mixed: boolean;
}

const UNPLACED_LABEL = 'unplaced — no record says what this figure is';

/**
 * ‼️ A TOTAL THAT SAYS WHAT IT ADDED.
 *
 * An API-equivalent a plan never pays, a key's real bill, Claude's arithmetic
 * for a Kimi run and an engine's own statement are four different claims, and
 * one `$` over their sum reads as an exact figure it is not. The sum is still
 * given — hiding it would be the opposite lie — but it carries its parts, and
 * `mixed` is what a page marks. A zero figure crosses no boundary: a free run
 * does not turn a clean total into a mixed one. A run with no billing at all is
 * `unplaced`, never quietly counted as the plan.
 */
export function sumDollars<T>(
    items: Iterable<T>,
    cost: (t: T) => number,
    billing: (t: T) => BillingIdentity | undefined
): DollarSum {
    const by = new Map<string, DollarPart>();
    let usd = 0;
    for (const it of items) {
        const c = Number(cost(it)) || 0;
        if (!(c > 0)) { continue; }
        const b = billing(it);
        const key = (b && b.dollar) || 'unplaced';
        const part = by.get(key) ?? { dollar: key, label: (b && b.costIs) || UNPLACED_LABEL, usd: 0, runs: 0 };
        part.usd += c;
        part.runs++;
        by.set(key, part);
        usd += c;
    }
    const parts = [...by.values()]
        .map(p => ({ ...p, usd: Math.round(p.usd * 10000) / 10000 }))
        .sort((a, b) => b.usd - a.usd);
    return { usd: Math.round(usd * 10000) / 10000, parts, mixed: parts.length > 1 };
}

/** The breakdown as lines — one per kind, `fmt` formatting the money. */
export function describeDollars(sum: DollarSum, fmt: (usd: number) => string): string[] {
    return sum.parts.map(p => fmt(p.usd) + ' — ' + p.label
        + ' (' + p.runs + ' run' + (p.runs === 1 ? '' : 's') + ')');
}

/**
 * ⚖ weighted tokens split by whether they filled the plan window. A run with no
 * billing is counted OFF the window: "against the limit" is the claim that has
 * to be earned.
 */
export function splitWeighed<T>(
    items: Iterable<T>,
    weighed: (t: T) => number,
    billing: (t: T) => BillingIdentity | undefined
): { plan: number; off: number } {
    let plan = 0, off = 0;
    for (const it of items) {
        const w = Number(weighed(it)) || 0;
        if (!(w > 0)) { continue; }
        if (billing(it)?.planWindow) { plan += w; } else { off += w; }
    }
    return { plan: Math.round(plan), off: Math.round(off) };
}
