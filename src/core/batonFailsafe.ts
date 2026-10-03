/**
 * S-83 — THE FAILSAFE: a relay leg that ended WITHOUT passing the baton.
 *
 * The chain's one NATURAL end is a run that finishes the work and passes
 * nothing, so an unpassed end is never rescued on its own. It is rescued only
 * when the end carries evidence the run was cut off rather than done:
 *   (a) a QUOTA/CONTEXT HANDOVER had reached it (told to hand over, did not);
 *   (b) it wrote a handover note in its last two minutes (the note, not a pass);
 *   (c) it ended abnormally — a non-zero exit, an error, or uncommitted work.
 * A leg the USER ended by hand is left alone, and so is a successor that died
 * at once with no tool call: opening another would only die again.
 *
 * Every decision leaves a record, so a chain is judged once: a rescue is a
 * waiting baton from the ended session (it goes through the same door and the
 * same brakes as `baton.pass`), and every other end is a closing record —
 * `done` (the chain ended) or `failed` (the crash-loop guard stopped it).
 *
 * Pure — the facts arrive as arguments; `batonRunner.ts` gathers and applies.
 */
import { Baton, BatonState, openerOf } from './baton';
import { isSeal } from './batonSeal';
import type { DoorContext } from './batonDoor';
import { RELAY_RULES, withRelayRules } from './batonRules';

/** (b): a note written this close to the end is the run's last act. */
export const FAILSAFE_NOTE_WINDOW_MS = 2 * 60_000;
/** A successor that ends sooner than this with no tool call crashed on arrival. */
export const CRASH_LOOP_MS = 30_000;
/** The most of a note or a status the rescue carries — the rest is one read away. */
const EVIDENCE_CAP = 6000;

/** What is known about a leg's end — each field optional: unknown is never evidence. */
export interface LegEndFacts {
    sessionId: string;
    endedAt: number;
    /** the user ended the run by hand (End session on its card, a cancelled task row) */
    byUser?: boolean;
    /** the handover order that reached it — `QUOTA HANDOVER 91%` / `CONTEXT HANDOVER 41%` */
    handover?: string;
    /** a handover note it wrote: the path, when, and its text */
    note?: { path: string; ts: number; text?: string };
    /** the process exit code, when known */
    exitCode?: number;
    /** it ended in error (a Console card in `error`, a failed task row) — the reason */
    error?: string;
    /** `git status --short` of its folder: '' = clean, undefined = not read */
    dirty?: string;
    /** S-83 — what its folder and its project's repositories committed during the run (`git log --oneline`) */
    commits?: string;
    /** tool calls it made; undefined = not known */
    toolCalls?: number;
}

export type FailsafeVerdict =
    | { act: 'none'; why: string }
    | { act: 'done' | 'failed'; why: string; opener: Baton; byUser?: true }
    | { act: 'rescue'; why: string; opener: Baton; evidence: string[] };

/** The baton that opened this session's leg (a seal for leg 1), if it runs in a relay. */
export function legOpener(list: readonly Baton[], sessionId: string): Baton | undefined {
    return openerOf(list, sessionId);
}

/**
 * ‼️ THE WHOLE DECISION. `none` = nothing to record (not a relay leg, it
 * passed, the chain was braked or already closed); `done` / `failed` = close
 * the chain with a record; `rescue` = open the next leg from what it left.
 */
export function failsafeVerdict(list: readonly Baton[], f: LegEndFacts): FailsafeVerdict {
    const sid = String(f.sessionId ?? '').trim();
    const opener = legOpener(list, sid);
    if (!opener) { return { act: 'none', why: 'not a relay leg' }; }
    if (list.some(b => b.from.sessionId === sid && !isSeal(b))) {
        return { act: 'none', why: 'the leg passed the baton, or its end is already recorded' };
    }
    if (list.some(b => b.chainId === opener.chainId && b.hop > opener.hop)) {
        return { act: 'none', why: `chain ${opener.chainId} already went on or was stopped past this leg` };
    }
    const leg = opener.hop + 1;
    // S-96 — the user already said this leg is the last: its note is the end they asked for, never evidence for a rescue.
    if (opener.lastLeg) {
        return { act: 'done', opener, why: `leg ${leg} was the chain's last — ${opener.lastLeg.by} braked it, so the failsafe stays out and the chain ends here` };
    }
    if (f.byUser) {
        return { act: 'done', opener, byUser: true, why: `leg ${leg} was ended by the user — the failsafe stays out, and the chain ends here` };
    }
    const lived = Math.max(0, f.endedAt - opener.updatedAt);
    if (!isSeal(opener) && lived < CRASH_LOOP_MS && !(Number(f.toolCalls) > 0)) {
        return {
            act: 'failed', opener,
            why: `leg ${leg} ended ${Math.round(lived / 1000)}s after it opened, with no tool call`
                + `${f.error ? ` (${f.error})` : ''} — a successor that dies at once would only die again (crash-loop guard)`
        };
    }
    const evidence: string[] = [];
    if (f.handover) { evidence.push(`${f.handover} had reached it`); }
    if (f.note && f.note.ts >= f.endedAt - FAILSAFE_NOTE_WINDOW_MS) { evidence.push(`it wrote a handover note (${f.note.path})`); }
    if (typeof f.exitCode === 'number' && f.exitCode !== 0) {
        evidence.push(`it exited with code ${f.exitCode}`);
    } else if (f.error) {
        evidence.push(`it ended in error: ${f.error}`);
    }
    if (f.dirty) { evidence.push('it left uncommitted changes'); }
    if (!evidence.length) {
        return { act: 'done', opener, why: `leg ${leg} finished cleanly without passing — the chain's natural end` };
    }
    return { act: 'rescue', opener, evidence, why: `leg ${leg} ended without passing the baton: ${evidence.join('; ')}` };
}

/** The record that closes a chain: the ended leg as `from`, nothing handed on. */
export function closingRecord(
    opener: Baton, sessionId: string, state: Extract<BatonState, 'done' | 'failed'>, why: string, id: string, now: number
): Baton {
    return {
        id,
        chainId: opener.chainId,
        hop: opener.hop + 1,
        prompt: '',
        from: { ...opener.from, sessionId, launchId: '' },
        inherit: opener.inherit,
        want: opener.want,
        state,
        why,
        createdAt: now,
        updatedAt: now
    };
}

const cap = (t: string, n = EVIDENCE_CAP): string => (t.length > n ? t.slice(0, n) + `\n… (${t.length - n} more characters)` : t);

/** A handover note's working sections (Durum · Kalan · İlk 5 dakika), or the whole note when it has none. */
export function noteSections(text: string): string {
    const body = String(text ?? '').replace(/^---[\s\S]*?\n---\s*\n/, '');
    const parts = body.split(/^(?=## )/m).filter(p => /^## (Durum|Kalan|İlk 5 dakika|Status|Remaining|First five minutes)\b/i.test(p));
    return (parts.length ? parts.join('').trim() : body.trim());
}

/**
 * What the rescued successor is handed under the emergency header — the
 * baton's `prompt`, and the template's `{evidence}`: the note when there is
 * one; otherwise ‼️ S-83 the brief the leg itself started from (`brief`, its
 * opener's words), so a leg cut off before it could pass is continued on its
 * job rather than guessed at. Then what it committed and left uncommitted.
 * Its last words are never guessed here; the header points at `sessions.read`.
 */
export function rescueEvidence(f: LegEndFacts, reasons: readonly string[], brief?: string): string {
    const lines = [`Why it was rescued: ${reasons.join('; ')}.`];
    const note = f.note && f.note.ts >= f.endedAt - FAILSAFE_NOTE_WINDOW_MS ? f.note : undefined;
    if (note) {
        lines.push('', `Its handover note (${note.path}):`, '', cap(noteSections(note.text ?? '')) || '(the note could not be read — open it yourself)');
    } else {
        lines.push('', 'It wrote no handover note.');
    }
    if (f.commits) { lines.push('', 'What it committed during its run (git log --oneline, newest first):', cap(f.commits, 2000)); }
    if (f.dirty) { lines.push('', 'Uncommitted in its folder (git status --short):', cap(f.dirty, 2000)); }
    const words = String(brief ?? '').trim();
    if (!note && words) {
        lines.push('', 'The brief it started from — its own opening words; the commits above are what it got done of it:', '', cap(words));
    }
    return lines.join('\n');
}

/** The variables an emergency template may name (agentFarm.batonEmergencyTemplate). */
export const EMERGENCY_TEMPLATE_VARS = ['fromSessionId', 'agentId', 'chain', 'leg', 'hop', 'maxHops', 'why', 'evidence', 'userDirective', 'relayRules'] as const;

/**
 * The first message of a RESCUED leg. The user's template when set — the
 * evidence is kept even when it forgets `{evidence}` — else the built-in one.
 * The read command names the LAST turns (`from=-10`): `limit` alone reads
 * from the start of the conversation, which is the one part that is stale.
 */
export function emergencyPrompt(b: Baton, ctx: DoorContext = {}): string {
    const directive = String(ctx.directive ?? '').trim();
    const maxHops = ctx.maxHops && ctx.maxHops > 0 ? String(ctx.maxHops) : '';
    const vars: Record<string, string> = {
        fromSessionId: b.from.sessionId,
        agentId: ctx.agentName || b.from.agentId,
        chain: b.chainId,
        leg: String(b.hop + 1),
        hop: String(b.hop),
        maxHops: maxHops || 'none',
        why: b.rescue || b.why,
        evidence: b.prompt,
        userDirective: directive,
        relayRules: RELAY_RULES.join('\n')
    };
    const tpl = String(ctx.emergencyTemplate ?? '').trim();
    if (tpl) {
        let out = tpl.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
        const tail: string[] = [];
        withRelayRules(tpl, tail);
        if (directive && !/\{userDirective\}/.test(tpl)) { tail.push(`Standing directive: ${directive}`); }
        if (!/\{evidence\}/.test(tpl)) { tail.push('---', b.prompt); }
        if (tail.length) { out = [out.replace(/\s+$/, ''), ...tail].join('\n'); }
        return out;
    }
    // S-87 — in LEGS, the unit the ceiling, the card and the status bar count in
    const leg = maxHops ? `leg ${b.hop + 1}/${maxHops}` : `leg ${b.hop + 1}`;
    const model = b.inherit.model ? `${b.from.engine}/${b.inherit.model}` : b.from.engine;
    const project = b.from.projectId ? ` · project ${b.from.projectId}` : '';
    return [
        `=== BATON RELAY — chain ${b.chainId} · ${leg} · EMERGENCY HANDOVER ===`,
        `Predecessor: session ${b.from.sessionId} (${vars.agentId} · ${model}${project}) ended WITHOUT passing the baton — ${vars.why}.`,
        'Agent Farm opened you from what it left behind (below). If that is not enough, read its last turns first:',
        `  node af.js sessions.read session=${b.from.sessionId} from=-10`,
        'then continue exactly where it stopped, in this folder and this project. Check `git status` before you build on uncommitted work.',
        'If you cannot finish either, pass the baton yourself when your run is ending (_REF/handover.md): write { "prompt": "<what your successor starts from>" } to a file and run',
        '  node af.js baton.pass "@<file>"',
        ...RELAY_RULES,
        ...(directive ? [`Standing directive (the user's, on every leg): ${directive}`] : []),
        '---',
        b.prompt
    ].join('\n');
}
