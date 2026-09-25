/**
 * M-47 — a workflow run a MISSION started. Three things differ from a run you
 * started yourself: its supervisor's question goes to the mission's lead first
 * (the `workflow.askEscalation` flex point says who is asked, in what order),
 * the lead may hand it flex values as well as inputs (`wake`, or a preset whose
 * run-level values are applied), and what the mission reads back at the end is
 * the final handoff WITH the run's board, so the lead sees every step and not
 * just the last one. Pure.
 */
import { RunBoard } from './runContext';

export type AskEscalation = 'leader' | 'human' | 'leader-then-human';
export const ASK_ESCALATIONS: readonly AskEscalation[] = ['leader', 'human', 'leader-then-human'];
export const DEFAULT_ASK_ESCALATION: AskEscalation = 'leader-then-human';

export const askEscalationOf = (v: unknown): AskEscalation =>
    (ASK_ESCALATIONS as readonly unknown[]).includes(v) ? v as AskEscalation : DEFAULT_ASK_ESCALATION;

const cut = (s: string | undefined, n: number): string => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
};

export function leaderAskPrompt(o: { goal: string; workflow: string; question: string; options: readonly string[] }): string {
    return [
        `You lead the mission: ${cut(o.goal, 1500)}`,
        `The workflow "${o.workflow}" you started is running, and its supervisor asks:`,
        cut(o.question, 1500),
        o.options.length ? `Options: ${o.options.map(x => `"${x}"`).join(', ')}` : 'It gave no options — answer in one short sentence.',
        'Answer for the person if the mission already settles it. If it does not — a matter of taste, money or risk the objective leaves open — do not guess.',
        `Reply with ONLY one JSON object: {"answer": ${o.options.length ? 'one of the options, word for word' : '"your answer"'}, "why": "one sentence"} — or {"answer": null, "why": "what the person has to decide"}.`
    ].join('\n\n');
}

/** The lead's reply: an answer the question can take, or the reason it cannot. */
export function readLeaderAnswer(raw: string | undefined, options: readonly string[]): { answer?: string; why: string } {
    const m = /\{[\s\S]*\}/.exec(String(raw ?? ''));
    if (!m) { return { why: 'the lead did not answer with a JSON object' }; }
    let o: { answer?: unknown; why?: unknown };
    try { o = JSON.parse(m[0]); } catch { return { why: 'the lead\'s answer was not valid JSON' }; }
    const why = cut(typeof o.why === 'string' ? o.why : '', 300);
    if (o.answer === null || o.answer === undefined || String(o.answer).trim() === '') {
        return { why: why ? `the lead left it to the person: ${why}` : 'the lead left it to the person' };
    }
    const said = String(o.answer).trim();
    if (!options.length) { return { answer: cut(said, 1000), why }; }
    const hit = options.find(x => x.toLowerCase() === said.toLowerCase());
    return hit ? { answer: hit, why } : { why: `the lead answered "${cut(said, 80)}", which is not one of the options` };
}

export interface EscalatedAnswer {
    answer?: string;
    by?: 'leader' | 'human';
    /** what happened, for the checkpoint row and the mission's ledger */
    note: string;
}

/** Ask in the order the flex point says; the lead is asked only when there is one. */
export async function escalateAsk(o: {
    mode: AskEscalation;
    /** the lead's raw reply — absent when the run has no mission */
    leader?: () => Promise<string | undefined>;
    human: () => Promise<string | undefined>;
    options: readonly string[];
}): Promise<EscalatedAnswer> {
    const toHuman = async (before: string): Promise<EscalatedAnswer> => {
        const a = await o.human();
        return a === undefined ? { note: `${before}the person did not answer` } : { answer: a, by: 'human', note: `${before}the person answered` };
    };
    if (!o.leader || o.mode === 'human') { return toHuman(''); }
    let got: { answer?: string; why: string };
    try { got = readLeaderAnswer(await o.leader(), o.options); } catch (e) { got = { why: `the lead could not be asked (${cut(String(e), 120)})` }; }
    if (got.answer !== undefined) { return { answer: got.answer, by: 'leader', note: `the mission lead answered${got.why ? `: ${got.why}` : ''}` }; }
    if (o.mode === 'leader') { return { note: `${got.why}; only the lead is asked here` }; }
    return toHuman(`${got.why}; `);
}

/** The run's board, one line a step — what the mission reads beside the final handoff. */
export function boardSummary(board: RunBoard | undefined, chars = 300): string[] {
    const steps = Object.values(board?.steps ?? {}).sort((a, b) => a.index - b.index);
    return [
        ...steps.map(s => `- ${s.id} "${s.title}": ${s.status}${s.verdict ? ` · verdict ${s.verdict}` : ''}`
            + `${s.costUSD ? ` · $${s.costUSD.toFixed(2)}` : ''}${s.file ? ` · file ${s.file}` : ''}${s.text ? ` — ${cut(s.text, chars)}` : ''}`),
        ...(board?.notes ?? []).map(n => `- note: ${cut(n, chars)}`)
    ];
}

/** The mission's copy of a finished run's result: the last handoff, then the board. */
export function missionHandoffText(title: string, finalText: string | undefined, board: RunBoard | undefined): string {
    const lines = boardSummary(board);
    return `# Workflow "${title}" — result\n\n${String(finalText ?? '').trim() || '(the last step handed on no text)'}\n`
        + (lines.length ? `\n## Run board — every step\n\n${lines.join('\n')}\n` : '');
}
