import { ModelAssist } from './sentryPrompt';
import { PolicyVerdict } from './sentryPolicy';

/**
 * X-195 — WHY THIS ROUND OPENED ON THESE WORDS, AND WHAT IT COST.
 *
 * The rounds table shows status, account and duration. NOTHING anywhere says
 * why a round was given the prompt it was given — so "sessiz durma yasaktır",
 * a rule the round obeys on the session side, has never been obeyed on the
 * PROMPT side: a night of eight rounds leaves eight prompts nobody can account
 * for, and the one that cost money is indistinguishable from the seven that did
 * not.
 *
 * This is the record the surfaces draw. It lives on the round's own row, so it
 * outlives the closure that made it and the window that was open at the time.
 *
 * Pure: no `vscode`, no clock, no store. Everything is handed in.
 */
export interface RoundWhy {
    /**
     * ‼️ WHAT ACTUALLY BUILT THE WORDS, never what was asked for. A verdict of
     * `leader` whose turn timed out, refused, answered prose or ran out of
     * budget produced a TEMPLATE round, and a record that called it a leader
     * round would be describing a decision nobody carried out.
     */
    path: 'mechanical' | 'leader';
    /** the conditions that woke the leader, in the order they were written */
    fired: string[];
    /** ‼️ and the ones nobody could judge — never silently absent */
    problems: string[];
    /** the diagnosis the words were chosen by */
    outcome?: string;
    /**
     * ‼️ THE FIRST LINE ONLY. The whole prompt is on the task row already; a
     * second copy here is the same text stored twice, and the copy is the one
     * that goes stale.
     */
    opening: string;
    /**
     * ‼️ WHICH HANDOVER NOTE THE WORDS WERE BUILT ON, AND WHERE IT CAME FROM.
     *
     * The prompt of a continuation round is largely somebody else's note, and
     * "the previous session left this behind" is the single claim in it that a
     * reader cannot check: the file lives in a folder the round searched, and
     * two sources can offer a note for the same session. Naming the source and
     * the file is what turns that claim into something falsifiable.
     *
     * Absent = the round never went looking (there was no finished session).
     * `found: false` = it looked and there was nothing, which is a different
     * answer and the one that explains a thin prompt.
     */
    handover?: { found: boolean; source: string; path?: string; score?: number };
    /** what the leader turn cost, when one was taken — even a failed one */
    assist?: ModelAssist;
    /** one sentence a person reads on the row's panel */
    why: string;
}

export interface RoundWhyInput {
    /**
     * ‼️ ABSENT IS A REAL ANSWER, and the commonest one: the FIRST round of a
     * night has no finished session to judge, so no policy was ever evaluated.
     * Requiring it here would have forced the writer to invent an empty verdict
     * at the one call site, and an invented verdict is indistinguishable on the
     * row from a policy that ran and fired nothing.
     */
    verdict?: PolicyVerdict;
    /** absent = no leader turn was taken at all */
    leader?: { path: 'mechanical' | 'leader'; assist?: ModelAssist; why: string; announce: boolean };
    /** the words the round was actually opened on */
    prompt: string;
    outcome?: string;
    /**
     * What the search for a handover note answered — absent when it was never
     * run, `found:false` when it ran and there was nothing. See RoundWhy.
     */
    handover?: { found: boolean; source: string; path?: string; score?: number };
}

export function roundWhy(i: RoundWhyInput): RoundWhy {
    const first = String(i.prompt ?? '').split('\n').map(s => s.trim()).find(s => s.length) ?? '';
    return {
        path: i.leader ? i.leader.path : 'mechanical',
        fired: i.verdict?.fired ?? [],
        problems: i.verdict?.problems ?? [],
        ...(i.outcome ? { outcome: i.outcome } : {}),
        ...(i.handover ? { handover: i.handover } : {}),
        opening: first,
        ...(i.leader?.assist ? { assist: i.leader.assist } : {}),
        why: i.leader?.why || i.verdict?.why || ''
    };
}

/**
 * SHORTHAND — the mark a five-column table has room for; the panel carries the
 * rest. `L` woke the leader, `M` never asked, and `M!` ASKED AND GOT NOTHING
 * USABLE: reading that third state as plain `M` hides the only failure that
 * spends money without buying words.
 */
export function whyShorthand(w?: Pick<RoundWhy, 'path' | 'fired'> & { assist?: { ok?: boolean } }): string {
    if (!w) { return ''; }
    if (w.path === 'leader') { return 'L'; }
    return (w.assist && w.assist.ok === false) || (w.assist && w.fired?.length) ? 'M!' : 'M';
}
