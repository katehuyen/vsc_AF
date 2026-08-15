import { SessionProvenance } from './externalImports';

/**
 * ‼️ S-36 — `role: "user"` IS A PROTOCOL CHANNEL, NOT A CLAIM THAT A PERSON TYPED IT.
 *
 * Claude's and Codex's transcript formats both call the model's input channel
 * `user`, so every prompt Agent Farm generates — a mission brief, a task, a
 * schedule's instruction — arrives on the same line as something the user
 * actually wrote. Reading that field as authorship put "You are the LEAD of a
 * mission…" under the 🧑 You filter, and `search.transcripts roles:["user"]`
 * promised "only what a PERSON asked" while returning the extension's own
 * machinery.
 *
 * So the protocol role stays where it is and authorship is a SECOND axis,
 * derived from facts Agent Farm already records: the launcher that owns the
 * transcript, the entrypoint, and whether the Console hosted it. Three answers,
 * and the third one matters:
 *
 *   human     — a person at a keyboard
 *   automation— a program, with the mechanism named when it is known
 *   unknown   — an imported copy whose source cannot be resolved. NOT quietly
 *               filed under either; an unproven verdict is what X-44 removed.
 */
export type MessageAuthor = 'human' | 'automation' | 'unknown';

/** Which mechanism wrote an automated prompt, when Agent Farm recorded one. */
export type AutomationSource =
    'mission' | 'task' | 'schedule' | 'trigger' | 'workflow' | 'unknown-program';

const SOURCE_LABEL: Record<AutomationSource, string> = {
    mission: 'Mission prompt',
    task: 'Task prompt',
    schedule: 'Schedule prompt',
    trigger: 'Trigger prompt',
    workflow: 'Workflow prompt',
    'unknown-program': 'Automation prompt'
};

export interface AuthorFacts {
    /** From `sessionOrigin` — already carries the Console and launcher rules. */
    origin: 'user' | 'auto';
    launchedBy?: { kind: string; label: string };
    provenance?: SessionProvenance;
}

export interface AuthorLabel {
    author: MessageAuthor;
    source?: AutomationSource;
    /** What a surface prints in place of "You". */
    label: string;
    icon: string;
    /** The launcher's own name, when there is one — the AFTip's first line. */
    launcher?: string;
}

export const HUMAN_LABEL: AuthorLabel = { author: 'human', label: 'You', icon: '🧑' };

function sourceOf(kind: string | undefined): AutomationSource {
    const k = String(kind ?? '').toLowerCase();
    return k === 'mission' || k === 'task' || k === 'schedule' || k === 'trigger' || k === 'workflow'
        ? k : 'unknown-program';
}

/**
 * Who wrote the `user`-channel messages of this session.
 *
 * The order is the order of certainty. An import nobody can trace is answered
 * `unknown` BEFORE the origin rules run, because those rules read an entrypoint
 * that belongs to the copy rather than to the run — which is how a headless
 * mission came to be displayed as a person's chat in the first place.
 */
export function userAuthorOf(facts: AuthorFacts): AuthorLabel {
    if (facts.provenance === 'imported-unknown-source') {
        return {
            author: 'unknown', label: 'Imported — author unverified', icon: '❔'
        };
    }
    if (facts.origin !== 'auto') { return HUMAN_LABEL; }
    const source = sourceOf(facts.launchedBy?.kind);
    return {
        author: 'automation',
        source,
        label: SOURCE_LABEL[source],
        icon: '🤖',
        ...(facts.launchedBy?.label ? { launcher: facts.launchedBy.label } : {})
    };
}

/**
 * ‼️ S-36 (TITLE) — THE WRAPPER IS NOT THE SUBJECT.
 *
 * `missions.ts` builds every lead prompt from one template, so three missions
 * with three different goals reached Sessions, Search and the Viewer under one
 * identical title: "You are the LEAD of a mission. You do not do the work
 * yourself…". Three rows that read as one row is not a cosmetic problem — it is
 * what made the user believe Search was showing the same session three times.
 *
 * Only templates this extension GENERATES are recognized, and only by their
 * exact opening plus their own section heading. Nothing is parsed
 * speculatively: a prompt that does not match a known wrapper is returned as
 * '', and the caller keeps whatever title it already had. Inventing a subject
 * out of an unrecognized prompt would be a worse lie than the wrapper.
 */
const WRAPPERS: { kind: AutomationSource; opens: RegExp; section: RegExp }[] = [
    {
        kind: 'mission',
        opens: /^\s*You are the LEAD of a mission\./,
        // ‼️ Exactly ONE line break after the heading. `\s*\n` would swallow the
        // blank line of an EMPTY section and hand back the next heading's body
        // as the goal — a mission named after its own Team list.
        section: /\n##[ \t]*Mission[ \t]*\r?\n([\s\S]*?)(?=\n##[ \t]|\s*$)/
    }
];

export interface WrapperGoal {
    kind: AutomationSource;
    /** The goal's own text, whitespace-collapsed, uncut. */
    goal: string;
}

/** The real subject inside a recognized generated prompt, or undefined. */
export function wrapperGoal(text: string): WrapperGoal | undefined {
    const raw = String(text ?? '');
    for (const w of WRAPPERS) {
        if (!w.opens.test(raw)) { continue; }
        const body = w.section.exec(raw)?.[1] ?? '';
        const goal = body
            // The template appends its own machinery lines to the goal block.
            .replace(/^\s*Working folder \(delegates run inside it\):.*$/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!goal) { return undefined; }
        return { kind: w.kind, goal };
    }
    return undefined;
}

/** True when the text is a generated wrapper — whether or not a goal was found. */
export function isGeneratedPrompt(text: string): boolean {
    return WRAPPERS.some(w => w.opens.test(String(text ?? '')));
}
