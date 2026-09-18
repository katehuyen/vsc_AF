import {
    SlotUsage, accountOrder, nextResetAt, roomOrder, slotIsUsable
} from './accountUsage';

/**
 * X-305 — AN ACCOUNT CHOSEN AT LAUNCH TIME BY A RULE, NOT BY A NAME.
 *
 * The user's own words (2026-09-14): having to guess, while writing a task or a
 * schedule, which sign-in will have room at the hour it runs is a structural
 * gap. So the `account` a launch states may now be a POLICY — `@emptiest`,
 * `@pool`, `@standing`, `@round-robin`, or one of the user's own named rules —
 * and the policy is turned into a slot at the moment the process is spawned,
 * against the usage figures the machine holds RIGHT THEN.
 *
 * ‼️ THIS FILE DECIDES; IT NEVER READS. `usage` is whatever `AccountUsageService`
 * currently holds, `standing` is what `accountResolution` would have answered
 * for a launch that stated nothing, `pool` is the running campaign's, and the
 * round-robin `cursor` is handed in and handed back. Nothing here touches a
 * disk or a clock it was not given, for the reason every pure core in this
 * codebase exists: the interesting half is WHICH slot and WHY, and that half is
 * the one that has to be provable without spending anybody's plan.
 *
 * ‼️ A POLICY THAT FINDS NOTHING REFUSES — IT NEVER FALLS THROUGH TO THE MAIN
 * SIGN-IN. `''` on the spawn seam means "no variable", and no variable means
 * whoever this machine happens to be logged in as: the exact plan a policy was
 * written to protect (X-302 learnt this for the sentry's leader turn). So a
 * pool that is walled end to end answers with a sentence naming the first
 * reset, and the door that asked decides whether to wait or to say so.
 *
 * ‼️ A WALL IS 90 HERE, NOT 100. The runner's own ceiling is where a session
 * IS refused; a policy is choosing where to START one, and 90% of the
 * five-hour window is the line at which the fleet's own agents hand over — a
 * session started above it spends its first turn writing a handover note, or
 * hits the wall mid-turn (measured 2026-09-18: @round-robin started a card on
 * a slot at 91% and the turn died on the limit). A rule, a step or a pool may
 * say its own number.
 *
 * ‼️ THE RULES ARE NOT REIMPLEMENTED HERE. "Most room, measured beats unread,
 * walled is out" is `roomOrder`; "walk the pool in the user's order, tiered or
 * free" is `accountOrder`; "when is the first one back" is `nextResetAt`. A
 * second copy of any of them would drift from the one the sentry runs on.
 */

export const POLICY_MARK = '@';
export const EMPTIEST = '@emptiest';
export const POOL = '@pool';
export const STANDING = '@standing';
export const ROUND_ROBIN = '@round-robin';
/** X-211's "the machine's own sign-in, stated outright" — starts with the mark and is NOT a policy. */
export const MACHINE_ACCOUNT_ID = '@machine';

/** Where a policy starts refusing a slot, unless the rule, step or pool says otherwise. */
export const POLICY_DEFAULT_CEILING = 90;

/** How deep a rule may point at another rule before it is a loop. */
const MAX_CHAIN_DEPTH = 4;

/** What the picker shows for a built-in policy: id, the short row, the panel's first line. */
export interface PolicyInfo {
    id: string;
    label: string;
    detail: string;
}

export const BUILT_IN_POLICIES: PolicyInfo[] = [
    { id: EMPTIEST, label: '@emptiest', detail: 'The sign-in of this engine with the most of its five-hour window left at the moment the session starts. A measured account beats an unread one; anything at or past the ceiling is out.' },
    { id: POOL, label: '@pool', detail: 'The next account with room in the running sentry campaign\'s pool, walked the way the campaign walks it (its order, its rotation, its ceiling). Refused when no campaign pool is running.' },
    { id: STANDING, label: '@standing', detail: 'This agent\'s own standing sign-in, else the machine-wide "use this next", else the main sign-in — the same answer as leaving the box empty, but skipped when it is walled inside a rule.' },
    { id: ROUND_ROBIN, label: '@round-robin', detail: 'The usable sign-ins of this engine in turn, one after another across launches, so no single plan carries every session.' }
];

/** One step of a user's named rule: a slot, or a policy, with its own wall and model filter. */
export interface PolicyStep {
    /** a stored slot id */
    account?: string;
    /** a built-in policy or another named rule (`@…`) */
    policy?: string;
    /** this step's own wall; the rule's, then the default, otherwise */
    ceiling?: number;
    /** taken only when the launch's model is one of these (empty/absent = any) */
    models?: string[];
}

/**
 * X-324 — HOW A RULE READS ITS STEPS. `chain` walks them top to bottom and the
 * first with a usable answer wins, so step 1 carries every launch until it is
 * walled. `emptiest` reads the same steps as a POOL OF ITS OWN: the listed
 * sign-ins are compared on the spot and the one with the most room starts —
 * "of my five accounts, whichever of THESE three has room", which neither the
 * built-in @emptiest (every slot of the engine) nor a chain (one at a time)
 * could say. A step's wall and model filter mean the same in both.
 */
export type PolicyStrategy = 'chain' | 'emptiest';
export const POLICY_STRATEGIES: PolicyStrategy[] = ['chain', 'emptiest'];

/** A rule the user wrote and named — `agentFarm.accountPolicies`. */
export interface AccountPolicy {
    /** the name it is picked by; referred to as `@<name>` */
    name: string;
    /** one line for the picker's panel */
    note?: string;
    /** when set, the rule is for one engine and refuses a launch on another */
    engine?: string;
    /** the rule's wall for every step that names none */
    ceiling?: number;
    /** `chain` unless it says `emptiest` — see PolicyStrategy */
    strategy?: PolicyStrategy;
    /** walked top to bottom; the first step with a usable answer wins */
    chain: PolicyStep[];
}

/** The strategy a rule runs by — `chain` unless it says otherwise. */
export function policyStrategy(p: Pick<AccountPolicy, 'strategy'> | undefined): PolicyStrategy {
    return p?.strategy === 'emptiest' ? 'emptiest' : 'chain';
}

/**
 * X-324 — WHY A RULE CANNOT BE IN EMPTIEST MODE: a step that names a rule has
 * no single figure to compare, so a list holding one can only be walked as a
 * chain. Empty when every step is an account. The page locks its switch on
 * this sentence and the core refuses on it, so a hand-edited setting cannot
 * store what the page would not let through.
 */
export function emptiestLockReason(chain: PolicyStep[] | undefined): string {
    const rules = (chain ?? []).map((st, i) => ({ st, i })).filter(x => String(x.st?.policy ?? '').trim());
    if (!rules.length) { return ''; }
    return 'emptiest mode compares the listed sign-ins by their figures, and a rule has no single figure ('
        + rules.map(x => `step ${x.i + 1} names ${String(x.st.policy).trim()}`).join(', ')
        + '), so with a rule among the steps this one can only be walked as a chain.';
}

/** The campaign pool `@pool` walks — the running sentry's, handed in by the host. */
export interface PolicyPool {
    /** slot ids in the user's order (the order IS the priority — X-207) */
    accounts: string[];
    rotation?: string;
    ceiling?: number;
    engine?: string;
}

export interface PolicyWorld {
    /** the engine of the launch — a slot belongs to one engine */
    engine: string;
    /** every slot's figures as the usage service holds them right now */
    usage: SlotUsage[];
    /** what `accountResolution` answers for a launch that states nothing ('' = main) */
    standing: string;
    /** `''` unless a standing answer exists; the layer that gave it, for the note */
    standingOrigin?: string;
    pool?: PolicyPool;
    /** round-robin: the slot id picked last time, or '' */
    cursor?: string;
    /** the user's named rules */
    policies?: AccountPolicy[];
    /** the launch's model, for model-filtered steps */
    model?: string;
    /** the slot ids that are stored, when the host knows; a step naming another is skipped */
    stored?: string[];
    /** turns a slot id into the label a person recognises; id by default */
    labelOf?: (id: string) => string;
    now?: number;
}

export interface PolicyResolution {
    /** the slot chosen; '' means the main sign-in and only `@standing` may say so */
    id: string;
    /** the policy that decided (the outermost one the launch stated) */
    policy: string;
    /** ONE line for a hover: which sign-in, which rule, with the figures */
    note: string;
    /** set when nothing could be chosen — and then `id` is '' and MUST NOT be spawned on */
    refusal?: string;
    /** epoch ms of the first reset that would change the answer; 0 when none is measured */
    resetsAt?: number;
    /** round-robin: the slot to remember as "picked last" */
    cursor?: string;
}

/** A policy id: starts with the mark and is not the machine's own sign-in. */
export function isPolicyId(id: string | undefined): boolean {
    const s = String(id ?? '').trim();
    return s.length > 1 && s.startsWith(POLICY_MARK) && s !== MACHINE_ACCOUNT_ID;
}

export function isBuiltInPolicy(id: string | undefined): boolean {
    return BUILT_IN_POLICIES.some(p => p.id === String(id ?? '').trim());
}

/** The named rule an id points at, if any — case-insensitive, with or without the mark. */
export function findPolicy(id: string | undefined, policies: AccountPolicy[] | undefined): AccountPolicy | undefined {
    const want = String(id ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!want) { return undefined; }
    return (policies ?? []).find(p => String(p.name ?? '').trim().toLowerCase() === want);
}

/**
 * Why a stated policy cannot be used at all — the sentence a door shows BEFORE
 * launching, so a typo is caught where it was typed. Empty when the id is not
 * a policy or names one that exists.
 */
export function policyRefusal(id: string | undefined, policies: AccountPolicy[] | undefined): string {
    const s = String(id ?? '').trim();
    if (!isPolicyId(s)) { return ''; }
    if (isBuiltInPolicy(s) || findPolicy(s, policies)) { return ''; }
    const names = [...BUILT_IN_POLICIES.map(p => p.id), ...(policies ?? []).map(p => '@' + p.name)];
    return `No account policy "${s}" exists — the built-in ones are ${BUILT_IN_POLICIES.map(p => p.id).join(', ')}`
        + ((policies ?? []).length ? `, and the named rules on this machine are ${(policies ?? []).map(p => '@' + p.name).join(', ')}` : '')
        + `. Pick one of ${names.length}, or a stored account, or leave the box empty.`;
}

/**
 * What is wrong with a rule the user is about to save — empty when it is sound.
 * Checked on the way IN so a rule that can never choose is never stored.
 */
export function policyShapeRefusal(p: AccountPolicy | undefined, others: AccountPolicy[] = []): string {
    if (!p || typeof p !== 'object') { return 'A policy is an object with a name and a chain.'; }
    const name = String(p.name ?? '').trim();
    if (!name) { return 'A policy needs a name — it is picked by it.'; }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) { return `"${name}" cannot be a policy name — letters, digits, "_" and "-" only, so it can be typed as @${name}.`; }
    if (isBuiltInPolicy('@' + name) || ('@' + name).toLowerCase() === MACHINE_ACCOUNT_ID) { return `@${name} is a built-in policy; a rule cannot take its name.`; }
    if (!Array.isArray(p.chain) || !p.chain.length) { return `Policy "${name}" has no steps — it could never choose an account.`; }
    for (let i = 0; i < p.chain.length; i++) {
        const st = p.chain[i];
        const acc = String(st?.account ?? '').trim();
        const pol = String(st?.policy ?? '').trim();
        if (!acc && !pol) { return `Step ${i + 1} of "${name}" names neither an account nor a policy.`; }
        if (acc && pol) { return `Step ${i + 1} of "${name}" names both an account and a policy — one or the other.`; }
        if (pol && !isPolicyId(pol)) { return `Step ${i + 1} of "${name}": "${pol}" is not a policy — a policy starts with @.`; }
        if (pol && pol.replace(/^@/, '').toLowerCase() === name.toLowerCase()) { return `Step ${i + 1} of "${name}" points at itself.`; }
        if (pol && !isBuiltInPolicy(pol) && !findPolicy(pol, others)) { return `Step ${i + 1} of "${name}": no policy "${pol}" exists.`; }
        if (st.ceiling !== undefined && !(typeof st.ceiling === 'number' && st.ceiling > 0 && st.ceiling <= 100)) { return `Step ${i + 1} of "${name}": the ceiling is a percentage between 1 and 100.`; }
    }
    if (p.ceiling !== undefined && !(typeof p.ceiling === 'number' && p.ceiling > 0 && p.ceiling <= 100)) { return `Policy "${name}": the ceiling is a percentage between 1 and 100.`; }
    if (p.strategy !== undefined && !POLICY_STRATEGIES.includes(p.strategy)) { return `Policy "${name}": the strategy is "chain" or "emptiest", not "${String(p.strategy)}".`; }
    if (p.strategy === 'emptiest') {
        const lock = emptiestLockReason(p.chain);
        if (lock) { return `Policy "${name}" cannot be in emptiest mode: ${lock}`; }
    }
    return '';
}

/**
 * The slot a stated policy chooses RIGHT NOW, or the sentence saying why none.
 * A non-policy `stated` is handed back untouched as the answer, so a caller may
 * pass every launch through here and only the policies are changed.
 */
export function resolvePolicy(stated: string | undefined, world: PolicyWorld): PolicyResolution {
    const s = String(stated ?? '').trim();
    if (!isPolicyId(s)) { return { id: s, policy: '', note: '' }; }
    return walk(s, world, POLICY_DEFAULT_CEILING, 0, s);
}

function walk(id: string, w: PolicyWorld, ceiling: number, depth: number, outer: string): PolicyResolution {
    const engine = String(w.engine || 'claude').trim().toLowerCase() || 'claude';
    const now = w.now ?? Date.now();
    const name = (slot: string): string => (w.labelOf ? w.labelOf(slot) : slot) || slot;
    const mine = w.usage.filter(u => String(u.engine ?? '').trim().toLowerCase() === engine);
    const figure = (u: SlotUsage | undefined): string =>
        !u ? 'unmeasured' : u.state === 'ok' && u.percent >= 0 ? `${u.percent}% of its ${u.window ? u.window : 'five-hour'} window` : (u.note || u.state);
    const refuse = (why: string, list: SlotUsage[]): PolicyResolution => {
        const resetsAt = nextResetAt(list, ceiling, now);
        return {
            id: '', policy: outer, refusal: why + (resetsAt ? ` The first one back resets at ${new Date(resetsAt).toLocaleTimeString()}.` : ''),
            note: '', resetsAt
        };
    };
    const usableOf = (slot: string, c: number): SlotUsage | undefined | null => {
        // null = walled or dead; undefined = unmeasured (usable by the rule every runner follows)
        const u = w.usage.find(x => x.slotId === slot);
        if (!u) { return undefined; }
        return slotIsUsable(u, c) ? u : null;
    };

    if (depth > MAX_CHAIN_DEPTH) {
        return { id: '', policy: outer, note: '', refusal: `Policy ${outer} points at rules ${MAX_CHAIN_DEPTH + 1} deep — that is a loop, not a chain.` };
    }

    if (id === EMPTIEST) {
        const line = roomOrder(mine, ceiling);
        const pick = line[0];
        if (!pick) {
            return refuse(mine.length
                ? `@emptiest: every ${engine} sign-in is at or past ${ceiling}% of its window (${mine.map(u => `${name(u.slotId)} ${figure(u)}`).join(', ')}).`
                : `@emptiest: no ${engine} sign-in is stored on this machine, so there is nothing to choose from.`, mine);
        }
        const next = line[1];
        return {
            id: pick.slotId, policy: outer,
            note: `${name(pick.slotId)} — @emptiest: the ${engine} sign-in with the most room right now (${figure(pick)})`
                + (next ? `; next would be ${name(next.slotId)} (${figure(next)}).` : '.')
        };
    }

    if (id === POOL) {
        const pool = w.pool;
        if (!pool || !pool.accounts.length) {
            return { id: '', policy: outer, note: '', refusal: '@pool: no sentry campaign pool is running on this machine — pick @emptiest, a named rule, or an account.' };
        }
        const c = typeof pool.ceiling === 'number' ? pool.ceiling : ceiling;
        const byId = new Map(w.usage.map(u => [u.slotId, u]));
        const list = pool.accounts.map(a => byId.get(a)).filter((u): u is SlotUsage => !!u);
        const line = accountOrder(list, { ceiling: c, ...(pool.rotation ? { rotation: pool.rotation } : {}), ...(pool.engine ? { engine: pool.engine } : {}) });
        const pick = line[0];
        if (!pick) {
            return refuse(`@pool: every account of the campaign pool is at or past ${c}% (${pool.accounts.map(a => `${name(a)} ${figure(byId.get(a))}`).join(', ')}).`, list);
        }
        return {
            id: pick.slotId, policy: outer,
            note: `${name(pick.slotId)} — @pool: next in the campaign pool with room (${figure(pick)}${pool.rotation ? `, ${pool.rotation} rotation` : ''})`
                + (line[1] ? `; then ${name(line[1].slotId)}.` : '.')
        };
    }

    if (id === STANDING) {
        const st = String(w.standing ?? '').trim();
        if (!st) {
            return { id: '', policy: outer, note: 'the main sign-in — @standing: nothing is set for this agent and nothing standing for ' + engine + ', so nothing is injected.' };
        }
        const u = usableOf(st, ceiling);
        if (u === null) {
            return refuse(`@standing: ${name(st)} (${w.standingOrigin || 'standing'}) is at ${figure(w.usage.find(x => x.slotId === st))}, at or past ${ceiling}%.`, w.usage.filter(x => x.slotId === st));
        }
        return { id: st, policy: outer, note: `${name(st)} — @standing: the ${w.standingOrigin || 'standing'} sign-in for ${engine} (${figure(u ?? undefined)}).` };
    }

    if (id === ROUND_ROBIN) {
        const usable = mine.filter(u => slotIsUsable(u, ceiling));
        if (!usable.length) {
            return refuse(mine.length
                ? `@round-robin: every ${engine} sign-in is at or past ${ceiling}% (${mine.map(u => `${name(u.slotId)} ${figure(u)}`).join(', ')}).`
                : `@round-robin: no ${engine} sign-in is stored on this machine.`, mine);
        }
        // The one after the last pick, in the user's list order; the list may have
        // changed underneath the cursor, so "after" is by position in the FULL
        // engine list, not by index into a line that no longer has that slot.
        const last = String(w.cursor ?? '').trim();
        const lastAt = mine.findIndex(u => u.slotId === last);
        let pick = usable[0];
        if (lastAt >= 0) {
            const after = mine.slice(lastAt + 1).concat(mine.slice(0, lastAt + 1)).find(u => slotIsUsable(u, ceiling));
            if (after) { pick = after; }
        }
        return {
            id: pick.slotId, policy: outer, cursor: pick.slotId,
            note: `${name(pick.slotId)} — @round-robin: ${lastAt >= 0 ? `after ${name(last)}` : 'first in the list'}, ${usable.length} of ${mine.length} ${engine} sign-ins have room (${figure(pick)}).`
        };
    }

    const rule = findPolicy(id, w.policies);
    if (!rule) {
        return { id: '', policy: outer, note: '', refusal: policyRefusal(id, w.policies) || `No account policy "${id}" exists.` };
    }
    const ruleEngine = String(rule.engine ?? '').trim().toLowerCase();
    if (ruleEngine && ruleEngine !== engine) {
        return { id: '', policy: outer, note: '', refusal: `@${rule.name} is a rule for ${ruleEngine} and this launch is on ${engine}. A slot belongs to one engine, so a rule does too.` };
    }
    const ruleCeiling = typeof rule.ceiling === 'number' ? rule.ceiling : ceiling;
    const model = String(w.model ?? '').trim().toLowerCase();
    const skipped: string[] = [];
    let earliest = 0;
    const noteReset = (r: SlotUsage | undefined): void => {
        if (r && r.state === 'ok' && r.resetsAt > now) { earliest = earliest ? Math.min(earliest, r.resetsAt) : r.resetsAt; }
    };
    const wallOf = (st: PolicyStep): number => typeof st.ceiling === 'number' ? st.ceiling : ruleCeiling;
    /** A model-filtered step that is not for this launch — said in `skipped`. */
    const offModel = (st: PolicyStep, i: number): boolean => {
        const models = (st.models ?? []).map(m => String(m).trim().toLowerCase()).filter(Boolean);
        if (!models.length || (model && models.includes(model))) { return false; }
        skipped.push(`step ${i + 1} is for ${models.join('/')} and this launch is ${model || 'unspecified'}`);
        return true;
    };
    /**
     * The account a step names, if a session may start on it: its record
     * (undefined = nobody has read it, usable by the rule every runner
     * follows), or null when it is not stored or is walled — said in `skipped`.
     */
    const accountOf = (acc: string, i: number, c: number): SlotUsage | undefined | null => {
        if (w.stored && !w.stored.includes(acc)) { skipped.push(`step ${i + 1}: no account "${acc}" is stored`); return null; }
        const u = usableOf(acc, c);
        if (u === null) {
            const r = w.usage.find(x => x.slotId === acc);
            skipped.push(`step ${i + 1}: ${name(acc)} is at ${figure(r)} (wall ${c}%)`);
            noteReset(r);
        }
        return u;
    };
    const total = (rule.chain ?? []).length;

    if (policyStrategy(rule) === 'emptiest') {
        // X-324 — the steps are a pool: every account that clears its own wall
        // is a candidate, and `roomOrder` ranks them exactly as it ranks the
        // engine-wide @emptiest (most room first, a measured slot before an
        // unread one). No second wall is asked of it — each candidate has
        // already cleared the one its step names. A slot nobody holds a record
        // for cannot be ranked and comes last, in the user's order.
        const recorded: SlotUsage[] = [];
        const unrecorded: string[] = [];
        for (let i = 0; i < total; i++) {
            const st = rule.chain[i];
            const acc = String(st.account ?? '').trim();
            if (!acc) { skipped.push(`step ${i + 1} (${String(st.policy ?? '').trim()}) is a rule, which has no figure to compare`); continue; }
            if (offModel(st, i)) { continue; }
            const u = accountOf(acc, i, wallOf(st));
            if (u === null) { continue; }
            if (u === undefined) { unrecorded.push(acc); } else { recorded.push(u); }
        }
        const line = roomOrder(recorded);
        const pick = line[0];
        if (pick) {
            const next = line[1];
            return {
                id: pick.slotId, policy: outer,
                note: `${name(pick.slotId)} — @${rule.name} (emptiest of its ${total} listed): the most room right now (${figure(pick)})`
                    + (next ? `; next would be ${name(next.slotId)} (${figure(next)}).` : '.')
            };
        }
        if (unrecorded.length) {
            return {
                id: unrecorded[0], policy: outer,
                note: `${name(unrecorded[0])} — @${rule.name} (emptiest of its ${total} listed): no listed sign-in with room has been measured, so the first unmeasured one starts.`
            };
        }
        return {
            id: '', policy: outer, note: '', resetsAt: earliest,
            refusal: `@${rule.name} (emptiest): none of its ${total} listed sign-ins can be chosen — ${skipped.join('; ')}.`
                + (earliest ? ` The first one back resets at ${new Date(earliest).toLocaleTimeString()}.` : '')
        };
    }

    for (let i = 0; i < total; i++) {
        const st = rule.chain[i];
        const c = wallOf(st);
        if (offModel(st, i)) { continue; }
        const acc = String(st.account ?? '').trim();
        if (acc) {
            const u = accountOf(acc, i, c);
            if (u === null) { continue; }
            return { id: acc, policy: outer, note: `${name(acc)} — @${rule.name} step ${i + 1} of ${total} (${figure(u ?? undefined)}, wall ${c}%).` };
        }
        const inner = walk(String(st.policy ?? '').trim(), w, c, depth + 1, outer);
        if (!inner.refusal) {
            return { ...inner, note: `${inner.note} — via @${rule.name} step ${i + 1} of ${rule.chain.length}.` };
        }
        skipped.push(`step ${i + 1} (${st.policy}): ${inner.refusal}`);
        if (inner.resetsAt) { earliest = earliest ? Math.min(earliest, inner.resetsAt) : inner.resetsAt; }
    }
    return {
        id: '', policy: outer, note: '', resetsAt: earliest,
        refusal: `@${rule.name}: no step could choose — ${skipped.join('; ')}.`
            + (earliest ? ` The first one back resets at ${new Date(earliest).toLocaleTimeString()}.` : '')
    };
}
