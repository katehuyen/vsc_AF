/**
 * S-83 — THE FAILSAFE, APPLIED: gathers what is known about a relay leg that
 * ended without passing, asks `failsafeVerdict`, and records the answer — a
 * closing record, or a rescue that goes through the same door and the same
 * brakes as `baton.pass`. `batonRunner.ts` calls it; the decision is pure and
 * lives in `batonFailsafe.ts`.
 *
 * ‼️ ONLY AN END THIS WINDOW SAW. A live `end` event is one; so is a sweep
 * finding dead a leg an earlier sweep found alive. A leg that was already over
 * when this window opened is never judged — after a reload, the last leg of
 * every old chain would otherwise be "rescued" from a dirty folder.
 */
import { BATON_DEFAULT_MAX_LEGS, Baton, moveBaton, newBatonId, passBaton } from './baton';
import { batonBrake } from './batonBrake';
import { closingRecord, failsafeVerdict, LegEndFacts, legOpener, rescueEvidence } from './batonFailsafe';
import { markFolder } from './batonLegFacts';
import { chainMaxLegs, isSeal } from './batonSeal';
import { BatonStore } from './batonStore';
import { LaunchManifest } from './launchManifest';
import type { FolderRead } from './legRoots';

export type NoticeLevel = 1 | 2 | 3 | 4;

export interface LegEndDeps {
    store: BatonStore;
    /** what is known about the session's end (card, task row, context guard, note, git) */
    legFacts: (sessionId: string, endedAt: number) => Promise<LegEndFacts>;
    /** is this leg's session over, by evidence (the runner's endedVerdict) */
    isEnded: (sessionId: string, opener: Baton) => boolean;
    launchIdOf?: (sessionId: string) => string | undefined;
    manifestOf?: (launchId: string) => LaunchManifest | undefined;
    /** S-83 — the HEADs of the leg's folder and its project's repositories (legRoots.ts) */
    headOf?: FolderRead;
    /** S-92 — the same roots' `git status --short` as the rescued leg opens on it */
    dirtOf?: FolderRead;
    maxLegs?: () => number;
    notify?: (title: string, body: string, key: string, level?: NoticeLevel, type?: 'info' | 'warning') => void;
    now: () => number;
    log: (line: string) => void;
    /** how long to let the card and the task row settle before reading them */
    settleMs?: number;
}

export class LegEndWatch {
    private readonly judging = new Set<string>();
    private readonly seenAlive = new Set<string>();

    constructor(private readonly deps: LegEndDeps, private readonly release: (b: Baton, why: string) => Baton) { }

    /** The legs running right now: a started baton whose session has not passed or closed. */
    private runningLegs(): Baton[] {
        const all = this.deps.store.all();
        return all.filter(b => b.state === 'started' && !!b.toSessionId
            && !all.some(x => x.from.sessionId === b.toSessionId && x.hop > b.hop));
    }

    /** The sweep's half: a leg seen alive earlier and dead now ended with no hook. */
    sweep(): void {
        for (const o of this.runningLegs()) {
            const sid = o.toSessionId!;
            let ended: boolean;
            try { ended = this.deps.isEnded(sid, o); } catch { continue; }
            if (!ended) { this.seenAlive.add(sid); continue; }
            if (this.seenAlive.delete(sid)) { void this.legEnded(sid, 'swept: no live process'); }
        }
    }

    async legEnded(sessionId: string, reason: string): Promise<Baton | undefined> {
        const sid = String(sessionId ?? '').trim();
        if (!sid || this.judging.has(sid) || !legOpener(this.deps.store.all(), sid)) { return undefined; }
        this.judging.add(sid);
        this.seenAlive.delete(sid);
        try {
            if (this.deps.settleMs) { await new Promise(r => setTimeout(r, this.deps.settleMs)); }
            const endedAt = this.deps.now();
            const facts = await this.deps.legFacts(sid, endedAt);
            const v = failsafeVerdict(this.deps.store.all(), { ...facts, sessionId: sid, endedAt: facts.endedAt ?? endedAt });
            if (v.act === 'none') { return undefined; }
            const now = this.deps.now();
            if (v.act !== 'rescue') {
                const rec = closingRecord(v.opener, sid, v.act, v.why, newBatonId(now), now);
                this.deps.store.put(rec);
                this.deps.log(`baton ${rec.id}: chain ${rec.chainId} ${v.act} — ${v.why} (${reason})`);
                this.say(v.act === 'done' ? `Relay finished — chain ${rec.chainId}` : `Relay failed — chain ${rec.chainId}`,
                    `${v.why}.\n\nbaton.status chain=${rec.chainId} shows every leg.`, `baton:${rec.chainId}:${v.act}`,
                    v.act === 'done' ? 1 : 2, v.act === 'done' ? 'info' : 'warning');
                return rec;
            }
            return await this.rescue(v.opener, sid, facts, v.evidence, v.why, now);
        } finally {
            this.judging.delete(sid);
        }
    }

    private async rescue(opener: Baton, sid: string, facts: LegEndFacts, evidence: string[], why: string, now: number): Promise<Baton> {
        const prompt = rescueEvidence(facts, evidence, isSeal(opener) ? undefined : opener.prompt);
        const launchId = this.deps.launchIdOf?.(sid);
        const manifest = launchId ? this.deps.manifestOf?.(launchId) : undefined;
        const passed = passBaton({ prompt, sessionId: sid, launchId, manifest, prior: this.deps.store.all(), now });
        // No manifest for the ended leg: the chain's own setup — the opener's, which this leg was launched from.
        let draft: Baton = passed.ok ? passed.baton : {
            id: newBatonId(now), chainId: opener.chainId, hop: opener.hop + 1, prompt,
            from: { ...opener.from, sessionId: sid, launchId: launchId ?? '' },
            inherit: opener.inherit, want: opener.want,
            state: 'waiting-end', why: 'the session has ended', createdAt: now, updatedAt: now
        };
        draft = { ...draft, rescue: why, note: `failsafe — ${why}` };
        draft = await markFolder(draft, this.deps.headOf, this.deps.dirtOf);
        const all = this.deps.store.all();
        const brake = batonBrake(draft, all, chainMaxLegs(all, draft.chainId, this.deps.maxLegs ? this.deps.maxLegs() : BATON_DEFAULT_MAX_LEGS));
        if (brake) {
            const m = moveBaton(draft, 'stopped', `braked — ${brake.why}`, now);
            const stopped = m.ok ? m.baton : draft;
            this.deps.store.put(stopped);
            this.say(`Relay stopped — chain ${draft.chainId}`, `The failsafe would have rescued leg ${opener.hop + 1} (${why}), but ${brake.why}`,
                `baton:${draft.id}:braked`, 2, 'warning');
            return stopped;
        }
        this.deps.store.put(draft);
        this.say(`Relay rescued — chain ${draft.chainId}`,
            `${why}.\n\nThe failsafe opened hop ${draft.hop} from what it left behind — ✕ Stop chain on its card, or baton.stop chain=${draft.chainId}, stops it.`,
            `baton:${draft.id}:rescued`, 2, 'info');
        return this.release(draft, `failsafe: ${why}`);
    }

    private say(title: string, body: string, key: string, level: NoticeLevel, type: 'info' | 'warning'): void {
        try { this.deps.notify?.(title, body, key, level, type); } catch { /* best effort */ }
    }
}
