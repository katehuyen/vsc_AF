/**
 * S-140 — chains.pause / chains.resume on the bridge, and the two bodies the
 * Console card and the Chains page call. The store goes to the pure core
 * (chainPause.ts) and what it answers is applied; the order reaches the leg
 * through the channel ⑂ Pass now uses — said into its Console card.
 */
import { Baton, BatonRelay, batonRelayOf, ChainPauseMark, openerOf } from './baton';
import { BridgeRefusal, BridgeRegistry, optBool, optStr } from './bridge';
import { batonView } from './batonBridge';
import { BatonStore } from './batonStore';
import { newerRecord } from './chainBoard';
import { ChainBoardOpsDeps, boardNow, continueOnBoard } from './chainBoardOps';
import { lastWords } from './chainControl';
import { PauseMode, ResumeAct, markPause, pauseModeOf, resumePlan } from './chainPause';
import { DisciplineOrders, orderFor } from './contextGuard';
import { SayPart, say, saidSentence, saidWhy } from './uiSentence';

export const PAUSE_WORD = 'PAUSE';
export const RESUME_WORD = 'RESUME';

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);

/** What the user's Pause says into the running leg: the handover order worded for its relay (pass), or the stop in place (here). */
export function pauseText(mode: PauseMode, sessionId: string, relay: BatonRelay | undefined, orders?: Partial<DisciplineOrders>): string {
    if (mode === 'pass') {
        return `${PAUSE_WORD} — the user paused this chain at the pass: hand over now; your successor waits at the door until the user continues the chain. `
            + orderFor('handover', relay, orders);
    }
    return `${PAUSE_WORD} — the user asked for a short break in place. Finish the atomic step you are on and commit clean progress. `
        + `Then call the bridge op chains.pause with {"session":"${sessionId}","mode":"here","words":"<one paragraph: where you stopped and what comes next>"} `
        + '(as an @file payload) and END YOUR TURN. Do NOT pass the baton and do not open a question: this card stays open, '
        + 'and the user\'s RESUME arrives here, in this same session.';
}

/** What Continue says into a leg paused in place. */
export function resumeText(mark: ChainPauseMark): string {
    return `${RESUME_WORD} — the user continued this chain. Carry on from where you stopped`
        + `${mark.words ? ` (your own words at the pause: ${mark.words})` : ''}; the relay goes on as before.`;
}

/** The answer a leg that paused ITSELF reads: its order, since nothing is said into its own card. */
function selfOrder(mode: PauseMode): string {
    return mode === 'pass'
        ? 'Paused at the pass: commit clean progress, then pass the baton as usual (baton.pass) and end your turn — your successor waits until the user continues the chain.'
        : 'Paused in place: finish the atomic step and commit (if you have not), give words= (where you stopped) in one more chains.pause call if you have not, '
            + 'then END YOUR TURN — do not pass the baton, do not open a question. The user\'s RESUME arrives in this session.';
}

export interface ChainPauseDeps {
    store: BatonStore;
    /** the chain board's own deps: its rows, chains.continue's body, the runner's sweep */
    board: ChainBoardOpsDeps;
    /** say text into the session's live Console card (⑂ Pass now's channel) — why not, when it could not */
    tell: (sessionId: string, text: string) => { said: true } | { said: false; why: string };
    /** the user-set order sentences (contextGuard.orders()) */
    orders?: () => Partial<DisciplineOrders>;
    /** a HANDOVER order (the context or the quota line) already reached the session */
    handoverOf?: (sessionId: string) => unknown;
    now: () => number;
}

/** A full session id from a full id or a prefix that names one session on record. */
export function fullSession(list: readonly Baton[], q: string | undefined): string {
    const s = String(q ?? '').trim();
    if (!s) { return ''; }
    const ids = new Set<string>();
    for (const b of list) { for (const id of [b.toSessionId, b.from.sessionId]) { if (id && id.startsWith(s)) { ids.add(id); } } }
    return ids.has(s) ? s : ids.size === 1 ? [...ids][0] : s;
}

export interface PauseAskOps {
    session?: string;
    chain?: string;
    mode: unknown;
    why?: string;
    words?: string;
    by: string;
    /** say the order into the leg's card; absent = unless the leg is pausing itself */
    tell?: boolean;
    /** the session that asked (the bridge envelope's claim) */
    caller?: string;
}

export type PauseOutcome =
    | { ok: true; baton: Baton; sessionId: string; chainId: string; mode: PauseMode; on: 'leg' | 'successor'; told?: string; order?: string; sentence: string; say: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/** chains.pause's body — the op, the Console card's menu and the Chains page alike. */
export function pauseChain(deps: ChainPauseDeps, q: PauseAskOps): PauseOutcome {
    const mode = pauseModeOf(q.mode);
    if (!mode) { return saidWhy('mode is here (a short break in place: the leg keeps its session) or pass (the leg passes and its successor waits for Continue).'); }
    const list = deps.store.all();
    const r = markPause(list, {
        sessionId: fullSession(list, q.session), chainId: q.chain, mode, by: q.by, why: q.why, words: q.words,
        handover: sid => !!deps.handoverOf?.(sid), now: deps.now()
    });
    if (!r.ok) { return r; }
    deps.store.put(r.baton);
    const self = !!q.caller && q.caller === r.sessionId;
    let told: string | undefined;
    if (r.on === 'leg' && (q.tell ?? !self)) {
        const t = deps.tell(r.sessionId, pauseText(r.mode, r.sessionId, batonRelayOf(deps.store.all(), r.sessionId), deps.orders?.()));
        told = t.said ? 'said' : t.why;
    }
    return {
        ok: true, baton: r.baton, sessionId: r.sessionId, chainId: r.chainId, mode: r.mode, on: r.on,
        ...(told ? { told } : {}), ...(self ? { order: selfOrder(r.mode) } : {}), sentence: r.sentence, say: r.say
    };
}

export type ResumeOutcome =
    | { ok: true; act: ResumeAct; chainId: string; sessionId: string; baton?: Baton; sentence: string; say?: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/** chains.resume's body — the op, the Console card's menu and the Chains page alike. */
export function resumeChain(deps: ChainPauseDeps, q: { chain?: string; session?: string; by: string; why?: string }): ResumeOutcome {
    const list = deps.store.all();
    const sid = fullSession(list, q.session);
    const chainId = String(q.chain ?? '').trim() || (sid ? (openerOf(list, sid) ?? list.find(b => b.from.sessionId === sid))?.chainId ?? '' : '');
    if (!chainId) { return saidWhy('say which: chain (its chn_… id) or session (one of its legs).'); }
    const top = list.filter(b => b.chainId === chainId).sort(newerRecord)[0];
    const p = resumePlan(list, top, boardNow(deps.board).find(r => r.chainId === chainId)?.live);
    if (!p.ok) { return p; }
    deps.store.put(...p.put);
    const vars = { chain: chainId, session: short(p.sessionId) };
    const done = (parts: SayPart, baton?: Baton): ResumeOutcome => ({ ok: true, act: p.act, chainId, sessionId: p.sessionId, ...(baton ? { baton } : {}), ...saidSentence(parts) });
    if (p.act === 'release') {
        try { deps.board.sweep?.(); } catch { /* the minute sweep follows anyway */ }
        const now = deps.store.all().find(b => b.id === top!.id);
        return done(now && now.state !== 'waiting-end'
            ? say('Chain {chain} continues: the next leg went through the door ({state}).', { ...vars, state: now.state })
            : say('Chain {chain} continues: the next leg opens once session {session} has ended.', vars), now);
    }
    if (p.act === 'cancel') {
        return done(say('The pause of chain {chain} is cancelled before its leg passed: session {session} passes as usual and the next leg opens at once.', vars));
    }
    if (p.act === 'speak') {
        const t = deps.tell(p.sessionId, resumeText(p.mark));
        return done(t.said
            ? say('Chain {chain} continues in place: RESUME was said into session {session}.', vars)
            : say('The pause of chain {chain} is lifted, but nothing could be said into session {session} ({why}) — type "continue" into it yourself.', { ...vars, why: t.why }));
    }
    const before = lastWords(list, chainId);
    const words = p.mark.words
        ? ['Where the paused leg stopped, in its own words at the pause:', p.mark.words, ...(before ? ['', 'The handover words before it:', before] : [])].join('\n')
        : undefined;
    const c = continueOnBoard(deps.board, { chain: chainId, prompt: words, by: q.by, why: q.why || 'continued after a pause' });
    if (!c.ok) { deps.store.put(...p.was); return c; }
    return { ok: true, act: p.act, chainId, sessionId: p.sessionId, baton: c.baton, sentence: c.sentence, ...(c.say ? { say: c.say } : {}) };
}

export function registerChainPauseOps(bridge: BridgeRegistry, deps: ChainPauseDeps): void {
    bridge.register([
        {
            op: 'chains.pause',
            describe: 'S-140 — PAUSE A RELAY CHAIN, one command, two modes. mode=here (a short break): the running leg finishes its atomic step, commits, calls this op on itself with words= (where it stopped) and ends its turn WITHOUT passing; its card stays, and chains.resume speaks into the same session. '
                + 'mode=pass (a long break, a restart, the night): the leg passes as usual and its successor stays at the door until chains.resume — it survives a restart and never starts by itself. A leg that has already passed has its waiting successor held. '
                + 'Unless the leg is pausing ITSELF, the order is said into its Console card (⑂ Pass now\'s channel); an agent pausing itself reads its order in the answer (`order`). mode=here is refused once a HANDOVER order reached the leg. '
                + 'args: session? (the leg\'s session id or prefix) | chain? (chn_… id), mode (here | pass), words? (where the leg stopped — the leg\'s own paragraph), why? (a line, recorded), tell? (say the order into the card; default: unless pausing yourself), by? (who, default "the user")',
            handler: (args, from) => {
                const r = pauseChain(deps, {
                    session: optStr(args, 'session'), chain: optStr(args, 'chain'), mode: optStr(args, 'mode'), why: optStr(args, 'why'), words: optStr(args, 'words'),
                    by: optStr(args, 'by') || (from?.sessionId ? `the user, through session ${short(from.sessionId)}` : 'the user'),
                    tell: args.tell === undefined ? undefined : optBool(args, 'tell'), caller: from?.sessionId
                });
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'pause', say: r.say }); }
                return {
                    baton: batonView(r.baton), chainId: r.chainId, sessionId: r.sessionId, mode: r.mode, on: r.on,
                    told: r.told ?? null, order: r.order ?? null, sentence: r.sentence
                };
            }
        },
        {
            op: 'chains.resume',
            describe: 'S-140 — CONTINUE A PAUSED RELAY CHAIN: a successor held at the door goes through it (now, or as soon as its predecessor\'s session has ended); a leg paused in place is told RESUME in its own session; a pass-pause its leg has not reached yet is cancelled (the leg passes as usual); '
                + 'a leg paused in place whose session is gone (a restart) is reopened from the words it left at the pause (chains.continue\'s door). Only the user\'s Continue lifts a pause — nothing does it by itself. '
                + 'Answers { act: release | speak | cancel | reopen, chainId, sessionId, baton, sentence }. args: chain? (chn_… id) | session? (one of its legs), why? (a line, recorded), by? (who, default "the user")',
            handler: (args) => {
                const r = resumeChain(deps, { chain: optStr(args, 'chain'), session: optStr(args, 'session'), by: optStr(args, 'by') || 'the user', why: optStr(args, 'why') });
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'resume', say: r.say }); }
                return { act: r.act, chainId: r.chainId, sessionId: r.sessionId, baton: r.baton ? batonView(r.baton) : null, sentence: r.sentence };
            }
        }
    ]);
}
