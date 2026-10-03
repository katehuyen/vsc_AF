/**
 * S-120 — THE CHAIN BOARD: every relay chain in one row, derived from the record.
 *
 * The page and `chains.list` speak from what is ON RECORD — the batons, the thin
 * links the store keeps after it drops a finished baton, the live facts of each
 * leg's session and the engine-fault watch — never from what a leg said about
 * itself. A chain's state is its newest record's; its attention signals are the
 * five things the record shows going wrong without anybody being told.
 *
 * ‼️ PURE — no file, no clock, no setting is read here. The thresholds arrive as
 * arguments, so the numbers live in settings and never in this file.
 */
import { Baton, BatonState, BrakeKind, isLive, successorSurface } from './baton';
import { chainMaxLegs } from './batonSeal';
import { ChainLink, chainIndex, linkOf } from './chainMembership';
import type { FaultEpisode } from './engineFaultWatch';

export type ChainState = 'running' | 'waiting' | 'parked' | 'done' | 'stopped' | 'refused' | 'failed';
/** The page's chips. Attention is not a state: it is a flag over every one of them. */
export type ChainBucket = 'running' | 'waiting' | 'parked' | 'done' | 'stopped';
export const CHAIN_BUCKETS: readonly ChainBucket[] = ['running', 'waiting', 'parked', 'done', 'stopped'];

/**
 * hanging — the running leg is idle (or its session is gone, or known nowhere) with no pass and no closing record;
 * stuck-wait — a successor still waits for its predecessor's session to end;
 * cut — the chain ended abnormally (the crash-loop guard, or the door refused the next leg);
 * fault — the running leg's engine failed and the fault watch has not passed for it;
 * brake — the leg ceiling or the barren-chain brake refused a pass.
 */
export type SignalKind = 'hanging' | 'stuck-wait' | 'cut' | 'fault' | 'brake';
export interface ChainSignal {
    kind: SignalKind;
    why: string;
    /** when the condition began, when known */
    since?: number;
    sessionId?: string;
}

/** What the host knows about one leg's session; every field optional — unknown is never evidence. */
export interface LegFacts {
    /** a process or a card still holds the session */
    alive: boolean;
    /** its last turn ended then and nothing has run since; absent = working, or not known */
    idleSince?: number;
    title?: string;
    agentName?: string;
    firstTs?: number;
    lastTs?: number;
    cost?: number;
    tokens?: number;
}

export interface BoardThresholds {
    /** a running leg idle this long — or gone this long with no closing record — is hanging */
    hangMs: number;
    /** a successor waiting this long for its predecessor's session to end is stuck */
    waitMs: number;
}

export interface BoardInput {
    batons: readonly Baton[];
    /** the links of batons the store dropped (batonStore.links() is fine too: the kept batons' own are added here) */
    links: readonly ChainLink[];
    facts: (sessionId: string) => LegFacts | undefined;
    faults?: readonly FaultEpisode[];
    now: number;
    /** the leg ceiling a chain without its own falls back to (agentFarm.batonMaxHops) */
    maxLegs: number;
    thresholds: BoardThresholds;
}

export interface ChainRow {
    chainId: string;
    state: ChainState;
    bucket: ChainBucket;
    /** the newest record's sentence, and when it changed */
    why: string;
    since: number;
    title?: string;
    agentId?: string;
    agentName?: string;
    projectId?: string;
    engine?: string;
    /** the leg running now, the one a waiting successor opens, or the last that ran */
    leg: number;
    /** the ceiling in force — 0 = none */
    maxLegs: number;
    /** the running leg is braked as the chain's last (baton.lastLeg) */
    lastLeg: boolean;
    /** the session of that leg */
    sessionId?: string;
    live?: 'working' | 'idle' | 'gone';
    startedAt: number;
    lastAt: number;
    wakeAt?: number;
    /** the setup the next leg opens on; absent when only links are left */
    next?: { account: string; surface: string; model?: string; effort?: string };
    totals: { legs: number; cost: number; tokens: number; ms: number };
    brake?: BrakeKind;
    /** the failsafe opened the newest hop for a leg that ended without passing: why */
    rescue?: string;
    /** the store has dropped this chain's batons; only its links are left */
    trimmed: boolean;
    signals: ChainSignal[];
}

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);

export function chainStateOf(s: BatonState): ChainState {
    switch (s) {
        case 'started': return 'running';
        case 'armed': case 'waiting-end': return 'waiting';
        default: return s;
    }
}

export function bucketOf(s: ChainState): ChainBucket {
    return s === 'refused' || s === 'failed' ? 'stopped' : s;
}

type Rec = Pick<Baton, 'hop' | 'state' | 'updatedAt'>;
/** The newest record of a chain, as a sort order: the highest hop, a live one before a finished one on the same hop, then the latest change. */
export function newerRecord(a: Rec, b: Rec): number {
    return b.hop - a.hop || Number(isLive(b)) - Number(isLive(a)) || b.updatedAt - a.updatedAt;
}

function signalsOf(row: ChainRow, top: Baton | undefined, f: LegFacts | undefined, input: BoardInput): ChainSignal[] {
    const out: ChainSignal[] = [];
    const { now, thresholds: t } = input;
    const sid = row.sessionId;
    if (row.state === 'running' && sid && f) {
        if (f.alive && f.idleSince !== undefined && now - f.idleSince >= t.hangMs) {
            out.push({
                kind: 'hanging', since: f.idleSince, sessionId: sid,
                why: `leg ${row.leg} (session ${short(sid)}) is idle — it neither passed the baton nor closed the chain`
            });
        } else if (!f.alive) {
            const since = f.lastTs ?? row.since;
            if (now - since >= t.hangMs) {
                out.push({
                    kind: 'hanging', since, sessionId: sid,
                    why: `leg ${row.leg} (session ${short(sid)}) ended with no pass and no closing record`
                });
            }
        }
    } else if (row.state === 'running' && sid && !f && now - row.since >= t.hangMs) {
        // unknown never reads as gone, but a record nothing has moved past the threshold must not sit silent
        out.push({
            kind: 'hanging', since: row.since, sessionId: sid,
            why: `leg ${row.leg} (session ${short(sid)}) is known nowhere — no card, no process, no watcher, no transcript — and the record has not moved since`
        });
    }
    if (row.state === 'waiting' && now - row.since >= t.waitMs) {
        out.push({
            kind: 'stuck-wait', since: row.since, sessionId: sid,
            why: `the next leg still waits for session ${short(sid)} to end — ${row.why}`
        });
    }
    if (row.state === 'failed' || row.state === 'refused') {
        out.push({ kind: 'cut', since: row.since, sessionId: sid, why: row.why });
    }
    for (const e of input.faults ?? []) {
        if (e.chainId !== row.chainId || e.sessionId !== sid || e.state === 'passed') { continue; }
        out.push({ kind: 'fault', since: e.since, sessionId: sid, why: `${e.kind} — ${e.state}: ${e.why}` });
    }
    if (top?.brake === 'ceiling' || top?.brake === 'barren') {
        out.push({ kind: 'brake', since: row.since, sessionId: sid, why: row.why });
    }
    return out;
}

/** ‼️ THE WHOLE BOARD: one row per chain on record, newest activity first. */
export function chainBoard(input: BoardInput): ChainRow[] {
    const all = [...input.links, ...input.batons.map(linkOf)];
    const ix = chainIndex(all);
    const batons = new Map<string, Baton[]>();
    for (const b of input.batons) { batons.set(b.chainId, [...(batons.get(b.chainId) ?? []), b]); }
    const links = new Map<string, ChainLink[]>();
    for (const l of all) { if (l?.chainId) { links.set(l.chainId, [...(links.get(l.chainId) ?? []), l]); } }
    const rows: ChainRow[] = [];
    for (const [chainId, chainLinks] of links) {
        const own = batons.get(chainId) ?? [];
        const top = [...own].sort(newerRecord)[0];
        const link = [...chainLinks].sort(newerRecord)[0];
        const state = chainStateOf(top?.state ?? link.state);
        const hop = top?.hop ?? link.hop;
        const running = state === 'running';
        const leg = Math.max(1, running || isLive({ state: top?.state ?? link.state }) ? hop + 1 : hop);
        const sessionId = (running ? (top?.toSessionId ?? link.to) : (top?.from.sessionId ?? link.from)) || undefined;
        const f = sessionId ? input.facts(sessionId) : undefined;
        const legs = ix.byChain.get(chainId)?.legs ?? [];
        const first = legs[0] ? input.facts(legs[0].sessionId) : undefined;
        const totals = { legs: legs.length, cost: 0, tokens: 0, ms: 0 };
        for (const l of legs) {
            const lf = input.facts(l.sessionId);
            totals.cost += lf?.cost ?? 0;
            totals.tokens += lf?.tokens ?? 0;
            if (lf?.firstTs !== undefined && lf.lastTs !== undefined) { totals.ms += Math.max(0, lf.lastTs - lf.firstTs); }
        }
        const stamps = [...chainLinks.map(l => l.createdAt), ...own.map(b => b.createdAt)];
        const agentId = top?.from.agentId;
        const agentName = f?.agentName ?? first?.agentName ?? (agentId ? agentId.split(/[\\/]/).pop() : undefined);
        const row: ChainRow = {
            chainId, state, bucket: bucketOf(state),
            why: top?.why ?? `${link.state} — only the chain's links are left on record`,
            since: top?.updatedAt ?? link.updatedAt,
            ...(first?.title ? { title: first.title } : {}),
            ...(agentId ? { agentId } : {}),
            ...(agentName ? { agentName } : {}),
            ...(top?.from.projectId ? { projectId: top.from.projectId } : {}),
            ...(top?.from.engine ? { engine: top.from.engine } : {}),
            leg,
            maxLegs: chainMaxLegs(input.batons, chainId, input.maxLegs),
            lastLeg: running && !!top?.lastLeg,
            ...(sessionId ? { sessionId } : {}),
            ...(f ? { live: f.alive ? (f.idleSince !== undefined ? 'idle' : 'working') : 'gone' } : {}),
            startedAt: Math.min(...stamps),
            lastAt: Math.max(top?.updatedAt ?? 0, ...chainLinks.map(l => l.updatedAt)),
            ...(top?.state === 'parked' && top.wakeAt ? { wakeAt: top.wakeAt } : {}),
            ...(top ? {
                next: {
                    account: top.want.account, surface: successorSurface(top),
                    ...(top.inherit.model ? { model: top.inherit.model } : {}),
                    ...(top.inherit.effort ? { effort: top.inherit.effort } : {})
                }
            } : {}),
            totals,
            ...(top?.brake ? { brake: top.brake } : {}),
            ...(top?.rescue ? { rescue: top.rescue } : {}),
            trimmed: !own.length,
            signals: []
        };
        row.signals = signalsOf(row, top, f, input);
        rows.push(row);
    }
    return rows.sort((a, b) => b.lastAt - a.lastAt);
}

export interface BoardCounts { total: number; attention: number; running: number; waiting: number; parked: number; done: number; stopped: number }

/** The chips' figures. */
export function boardCounts(rows: readonly ChainRow[]): BoardCounts {
    const c: BoardCounts = { total: rows.length, attention: 0, running: 0, waiting: 0, parked: 0, done: 0, stopped: 0 };
    for (const r of rows) {
        c[r.bucket]++;
        if (r.signals.length) { c.attention++; }
    }
    return c;
}

export interface BoardFilter {
    /** a state or a bucket */
    state?: string;
    /** an agent's name or id */
    agent?: string;
    project?: string;
    attention?: boolean;
}

export function filterBoard(rows: readonly ChainRow[], q: BoardFilter): ChainRow[] {
    const st = String(q.state ?? '').trim().toLowerCase();
    const ag = String(q.agent ?? '').trim().toLowerCase();
    const pj = String(q.project ?? '').trim();
    return rows.filter(r =>
        (!st || r.state === st || r.bucket === st)
        && (!ag || String(r.agentName ?? '').toLowerCase() === ag || String(r.agentId ?? '').toLowerCase() === ag)
        && (!pj || r.projectId === pj)
        && (!q.attention || r.signals.length > 0));
}
