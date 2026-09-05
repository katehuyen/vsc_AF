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
    /** what the leader turn cost, when one was taken — even a failed one */
    assist?: ModelAssist;
    /** one sentence a person reads on the row's panel */
    why: string;
}

export interface RoundWhyInput {
    verdict: PolicyVerdict;
    /** absent = no leader turn was taken at all */
    leader?: { path: 'mechanical' | 'leader'; assist?: ModelAssist; why: string; announce: boolean };
    /** the words the round was actually opened on */
    prompt: string;
    outcome?: string;
}

export function roundWhy(i: RoundWhyInput): RoundWhy {
    const first = String(i.prompt ?? '').split('\n').map(s => s.trim()).find(s => s.length) ?? '';
    return {
        path: i.leader ? i.leader.path : 'mechanical',
        fired: i.verdict?.fired ?? [],
        problems: i.verdict?.problems ?? [],
        ...(i.outcome ? { outcome: i.outcome } : {}),
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
