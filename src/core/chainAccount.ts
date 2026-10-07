/**
 * S-143 — THE ACCOUNT RULE OF A FLOWING CHAIN, changed by the user.
 *
 * A chain's next legs open on `want.account`: passBaton copies it from the
 * running leg's opener (a pool, or a single account the user pinned here), and
 * the door places a waiting baton by it. So the change is written where those
 * two read it — the running leg's opener (`leg`: its pass, and a pass made
 * again, carry it) and a successor still waiting at the door (`door`, plus the
 * opener of the session that passed it, in case it passes again). A leg already
 * parked on its task row has its account on that row and is refused by name.
 *
 * ‼️ A RECORD WITHOUT `rule` IS UNTOUCHED, and the door reads `rule` only to
 * let the user's choice win over the S-106 stay on the first leg after the
 * change — so a chain nobody changed runs exactly as before. Like a pause, no
 * `updatedAt` moves (the crash-loop guard reads it as the leg's start).
 *
 * Pure: the store's list, the account check and the clock come in.
 */
import { isPolicyId } from './accountPolicy';
import { Baton, BatonWant, ChainAccountRule, openerOf } from './baton';
import { leftBy } from './batonLastLeg';
import { newerRecord } from './chainBoard';
import { SayPart, say, saidSentence, saidWhy } from './uiSentence';

const s = (v: unknown): string => String(v ?? '').trim();
const short = (id: string | undefined): string => s(id).slice(0, 8);

/** The chain a chn_… id or a session names: the leg it runs, or the pass it left. '' = none on record. */
export function chainNamed(list: readonly Baton[], q: { chainId?: string; sessionId?: string }): string {
    const c = s(q.chainId);
    if (c) { return list.some(b => b.chainId === c) ? c : ''; }
    const sid = s(q.sessionId);
    return sid ? (openerOf(list, sid) ?? leftBy(list, sid))?.chainId ?? '' : '';
}

export interface ChainAccountNow {
    chainId: string;
    engine: string;
    /** what the next leg opens on — the chain's newest record's want, as the Chains page's Next column shows it */
    account: string;
    pinned: boolean;
    rule?: ChainAccountRule;
    state: Baton['state'];
    /** the rule can be set now: a leg runs, or a successor waits at the door */
    settable: boolean;
}

/** What the next legs of a chain open on now. Asked for every row of the board and its notices, so a thin record never throws. */
export function chainAccountOf(list: readonly Baton[], chainId: string): ChainAccountNow | undefined {
    const top = list.filter(b => b.chainId === chainId).sort(newerRecord)[0];
    if (!top) { return undefined; }
    return {
        chainId, engine: top.from?.engine || 'claude', account: top.want?.account ?? '', pinned: !!top.want?.pinned,
        ...(top.rule ? { rule: top.rule } : {}), state: top.state,
        settable: !!top.want && (top.state === 'started' || top.state === 'waiting-end')
    };
}

export interface AccountAsk {
    chainId: string;
    account: string;
    by: string;
    /** the stated-account check for the chain's engine (no such slot, another engine's, no such rule); '' = acceptable */
    refusal: (account: string, engine: string) => string;
    now: number;
}

export type AccountResult =
    | { ok: true; put: Baton[]; chainId: string; account: string; pinned: boolean; changed: boolean; leg: number; sentence: string; say: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/** The want a record gets: its own, with the account replaced — a single account pinned, a rule never. */
function wantWith(w: BatonWant, account: string): BatonWant {
    const next: BatonWant = { ...w, account };
    if (isPolicyId(account)) { delete next.pinned; } else { next.pinned = true; }
    return next;
}

/**
 * ‼️ SET THE ACCOUNT THE CHAIN'S NEXT LEGS OPEN ON. The caller stores `put`.
 * Refused when nothing runs and nothing waits, when the next leg is already
 * parked on its row, and when the account is one the chain's engine cannot run on.
 */
export function setChainAccount(list: readonly Baton[], q: AccountAsk): AccountResult {
    const account = s(q.account);
    if (!account) { return saidWhy('say which account or rule the next legs open on — a stored account id, or a rule such as @emptiest.'); }
    const now = chainAccountOf(list, q.chainId);
    if (!now) { return saidWhy('no chain {chain} on record — chains.list shows the chains.', { chain: q.chainId }); }
    const own = list.filter(b => b.chainId === q.chainId);
    const top = [...own].sort(newerRecord)[0];
    if (top.state === 'parked') {
        return saidWhy('leg {leg} of chain {chain} already went through the door and waits on task {task}, which holds its account — set the rule once that leg runs, or start it now (baton.now).',
            { leg: top.hop + 1, chain: q.chainId, task: top.taskId ?? '?' });
    }
    if (!now.settable) {
        return saidWhy('chain {chain} is {state} — no leg runs and no successor waits, so there is no next leg to set; chains.continue reopens a chain that ended.',
            { chain: q.chainId, state: top.state });
    }
    const no = q.refusal(account, now.engine);
    if (no) { return { ok: false, why: no }; }
    const rule = (on: ChainAccountRule['on']): ChainAccountRule => ({ at: q.now, by: q.by, on });
    const put: Baton[] = [];
    const mark = (b: Baton, on: ChainAccountRule['on']) => {
        if (!put.some(p => p.id === b.id)) { put.push({ ...b, want: wantWith(b.want, account), rule: rule(on) }); }
    };
    let leg: number;
    let said: SayPart;
    if (top.state === 'started') {
        mark(top, 'leg');
        leg = top.hop + 2;
        said = say('Chain {chain}: from leg {leg} on, every leg opens on {account} — leg {running} (session {session}) passes it on.',
            { chain: q.chainId, leg, account, running: top.hop + 1, session: short(top.toSessionId) || '?' });
    } else {
        for (const w of own.filter(b => b.state === 'waiting-end')) {
            mark(w, 'door');
            const passer = openerOf(list, w.from.sessionId);
            if (passer && passer.chainId === q.chainId) { mark(passer, 'leg'); }
        }
        leg = top.hop + 1;
        said = say('Chain {chain}: leg {leg}, waiting at the door, and every leg after it open on {account}.', { chain: q.chainId, leg, account });
    }
    const was = (b: Baton) => own.find(o => o.id === b.id)!;
    const changed = put.some(b => was(b).want.account !== b.want.account || !!was(b).want.pinned !== !!b.want.pinned);
    return { ok: true, put, chainId: q.chainId, account, pinned: !isPolicyId(account), changed, leg, ...saidSentence(said) };
}

/**
 * ‼️ THE DOOR'S ONE QUESTION: did the user set the account this baton opens on?
 * Then the S-106 stay on the predecessor's slot does not override it — once:
 * the leg it opens carries no mark, so the stay applies again from its pass on.
 * Undefined = the door decides exactly as it always has.
 */
export function accountRuled(list: readonly Baton[], b: Baton): string | undefined {
    const opener = openerOf(list, b.from.sessionId);
    const r = b.rule?.on === 'door' ? b.rule : opener && opener.chainId === b.chainId && opener.rule?.on === 'leg' ? opener.rule : undefined;
    return r ? `${r.by} set chain ${b.chainId}'s account to ${b.want.account} — this leg opens on it, not on its predecessor's slot` : undefined;
}
