/**
 * S-77 — WHAT A SURFACE SAYS ABOUT A SESSION'S BATON RELAY, DERIVED ONCE.
 *
 * The Console card, the status bar and the sessions table answer the same
 * question — "is this run a leg of a relay, and what is the next leg waiting
 * for?" — so the words are built here and every surface renders them.
 * Pure: the list and the clock come in, nothing is read.
 */
import { Baton, isLive, openerOf } from './baton';
import { chainMaxLegs, isSeal } from './batonSeal';
import { BrakeState, brakeStateOf } from './batonLastLeg';
import { stamp } from './aftime';

/** S-99 — the mark a leg the user made the chain's last carries after its number, wherever the number is drawn. */
export const LAST_LEG_MARK = '⊣';

export interface BatonCardView {
    chainId: string;
    /** this run's leg in the chain: 1 for the run that started it */
    leg: number;
    /** SHORTHAND for the strip — `⑂ 3` */
    chip: string;
    /** MIRROR — the panel's first line */
    head: string;
    lines: string[];
    /** a live baton in the chain the user can brake (baton.stop chain=) */
    stoppable: boolean;
    /** S-99 — the soft brake of this run's leg (baton.lastLeg); absent = no running leg to brake */
    brake?: BrakeState;
    /** S-103 — the chain's leg ceiling (0 = none), when the caller gave the setting's */
    max?: number;
}

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);

const hhmm = (ts: number): string => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** What the leg after this run is doing, in one line. */
function nextLine(b: Baton): string {
    switch (b.state) {
        case 'armed': return 'Successor: recorded, not yet accepted.';
        case 'waiting-end': return 'Successor: waits for this session to end — nothing starts while it is alive.';
        case 'parked': return `Successor: parked — every account is full; wakes ${b.wakeAt ? 'at ' + hhmm(b.wakeAt) : 'at the first reset'}.`;
        case 'started': return `Successor: running — session ${short(b.toSessionId)}${b.taskId ? ` (task ${b.taskId})` : ''}.`;
        case 'stopped': return `Successor: stopped — ${b.why}`;
        case 'done': return `Successor: none — the chain ended: ${b.why}`;
        case 'failed': return `Successor: none — the chain failed: ${b.why}`;
        default: return `Successor: refused — ${b.why}`;
    }
}

export interface BatonBarView {
    /** SHORTHAND — `⑂ 3/6 · 14:37`: the leg the newest running chain is on or opens next, its ceiling, a park's wake */
    text: string;
    /** MIRROR — what the text says in full, one line per running chain, then the brake */
    tooltip: string;
    chainId: string;
    /** the session running that chain's leg right now, when one is */
    sessionId?: string;
}

/** One running chain in one line. `leg` is the newest hop + 1: the leg it is on, or the one it opens next. */
function barLine(b: Baton, leg: number, max: string, fmt: (t: number) => string): string {
    const at = `Chain ${b.chainId} — leg ${leg}${max}`;
    switch (b.state) {
        case 'started': return `${at} running (session ${short(b.toSessionId)})${b.lastLeg ? ' — its last leg: braked by the user' : ''}.`;
        case 'waiting-end': return `${at} opens when session ${short(b.from.sessionId)} ends.`;
        case 'parked': return `${at} parked — every account is full; wakes ${b.wakeAt ? 'at ' + fmt(b.wakeAt) : 'at the first reset'}.`;
        default: return `${at} recorded, not yet accepted.`;
    }
}

/**
 * The chains running right now, each by its newest baton, newest first: a live
 * baton, or a started leg whose session `alive` still sees AND whose opener it
 * is — a second seal on one session (S-103) is a chain nothing passes through.
 */
export function runningChains(list: readonly Baton[], alive: (sessionId: string) => boolean): Baton[] {
    const top = new Map<string, Baton>();
    for (const b of list) {
        const t = top.get(b.chainId);
        if (!t || b.hop > t.hop || (b.hop === t.hop && b.updatedAt > t.updatedAt)) { top.set(b.chainId, b); }
    }
    return [...top.values()]
        .filter(n => isLive(n) || (n.state === 'started' && !!n.toSessionId && alive(n.toSessionId)
            && openerOf(list, n.toSessionId)?.id === n.id))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * ‼️ S-77 — THE ONE STATUS-BAR ITEM: the relay running right now, or nothing.
 * With several chains the newest speaks and `+N` counts the rest; each has its line.
 * M-63 — unless the Console has a session of one of them open (`focus`): then that
 * chain speaks, and a click opens ITS legs.
 */
export function batonBarView(
    list: readonly Baton[], maxLegs: number, alive: (sessionId: string) => boolean, fmt: (t: number) => string = hhmm,
    focus?: string
): BatonBarView | undefined {
    const byTime = runningChains(list, alive);
    if (!byTime.length) { return undefined; }
    const mine = focus ? list.find(b => b.toSessionId === focus || b.from.sessionId === focus)?.chainId : undefined;
    const running = mine && byTime.some(b => b.chainId === mine)
        ? [...byTime.filter(b => b.chainId === mine), ...byTime.filter(b => b.chainId !== mine)]
        : byTime;
    const top = running[0];
    const cap = (b: Baton) => chainMaxLegs(list, b.chainId, maxLegs);
    const max = cap(top) > 0 ? `/${cap(top)}` : '';
    const wake = top.state === 'parked' && top.wakeAt ? ` · ${fmt(top.wakeAt)}` : '';
    const more = running.length > 1 ? ` +${running.length - 1}` : '';
    const lines = running.map(b => barLine(b, b.hop + 1, cap(b) > 0 ? ` of ${cap(b)}` : '', fmt));
    return {
        text: `⑂ ${top.hop + 1}${top.state === 'started' && top.lastLeg ? LAST_LEG_MARK : ''}${max}${wake}${more}`,
        tooltip: [
            `Baton relay — ${running.length === 1 ? 'one chain' : running.length + ' chains'} running`,
            ...(running.length > 1 ? [mine === top.chainId
                ? 'Showing the chain of the session open in the Console.'
                : 'Showing the newest chain; open a session of another chain in the Console to switch.'] : []),
            '',
            ...lines,
            '',
            'Click: the chain\'s legs — one more, fewer, no ceiling, last leg.',
            'Brake: ⑂⊣ Last leg on the running card, ✕⑂ Stop chain while a successor waits.',
            maxLegs > 0 ? `A new chain starts at ${maxLegs} legs (agentFarm.batonMaxHops).` : 'A new chain starts with no leg ceiling (agentFarm.batonMaxHops = 0).'
        ].join('\n'),
        chainId: top.chainId,
        ...(top.state === 'started' && top.toSessionId ? { sessionId: top.toSessionId }
            : top.state === 'waiting-end' ? { sessionId: top.from.sessionId } : {})
    };
}

/**
 * The relay seen from one session: the baton that opened it (its
 * predecessor) and the one it left (its successor). Undefined for a session
 * no baton touched.
 */
export function batonCardView(list: readonly Baton[], sessionId: string, fallbackMax?: number): BatonCardView | undefined {
    const sid = String(sessionId ?? '').trim();
    if (!sid) { return undefined; }
    const opener = openerOf(list, sid);
    const left = [...list].filter(b => b.from.sessionId === sid && !isSeal(b)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const anchor = opener ?? left;
    if (!anchor) { return undefined; }
    const chainId = anchor.chainId;
    const leg = opener ? opener.hop + 1 : left!.hop;
    const chain = list.filter(b => b.chainId === chainId);
    const legs = Math.max(leg, ...chain.map(b => b.hop + (b.state === 'started' ? 1 : 0)));
    const lines = [
        `Chain: ${chainId} — leg ${leg} of ${legs} so far.`,
        // U-170 — the stretch this leg ran, so a leg resumed after it passed (its row sorts late) still says where it was
        `Ran: ${opener ? stamp(opener.createdAt) : '?'} → ${left ? `${stamp(left.createdAt)} (${isLive(left) || left.state === 'started' ? 'passed' : left.state})` : 'no pass yet'}.`,
        opener && !isSeal(opener)
            ? `Predecessor: session ${short(opener.from.sessionId)} (${opener.from.agentId.split(/[\\/]/).pop()} · ${opener.from.engine}) `
                + (opener.rescue ? `ended without passing — the failsafe opened this run: ${opener.rescue}.` : 'passed the baton to this run.')
            : 'Predecessor: none — this run started the chain.',
        left ? nextLine(left) : 'Successor: none yet — this run has not passed the baton.'
    ];
    // X-472 — why this leg passed, as measured (limit · quota · context · flagged · early), with the figure it stood on
    // X-474 — this leg's first reading already stood at the handover line: the pass that placed it is named
    if (opener?.misplaced) { lines.push(`Misplaced: ${opener.misplaced.why}.`); }
    if (left?.cause) { lines.push(`Passed: ${left.cause.why}.`); }
    if (left?.note) { lines.push(`Note: ${left.note}`); }
    const stoppable = chain.some(isLive);
    const brake = brakeStateOf(list, sid);
    const last = brake === 'on' || brake === 'locked';
    if (brake === 'on') { lines.push('Last leg: braked by the user — at its handover line it writes the note, and no successor opens.'); }
    if (brake === 'locked') { lines.push('Last leg: braked by the user — the chain ended at this leg.'); }
    const max = fallbackMax === undefined ? undefined : chainMaxLegs(list, chainId, fallbackMax);
    if (max !== undefined) {
        lines.push(`Ceiling: ${max > 0 ? `${max} legs` : 'none'} — change it: right-click ⑂⊣, or click ⑂ in the status bar.`);
    }
    lines.push(stoppable
        ? 'Brake: ✕⑂ Stop chain on the card — recorded, never deleted.'
        : 'The chain ends when the work is done and nobody passes.');
    return {
        chainId, leg, chip: `⑂ ${leg}${last ? LAST_LEG_MARK : ''}`,
        head: `Baton relay — leg ${leg}${last ? ' · last leg' : ''}${left && isLive(left) ? ' · successor waiting' : ''}`,
        lines, stoppable, ...(brake ? { brake } : {}), ...(max !== undefined ? { max } : {})
    };
}
