import { fillContinuation } from './retry';
import { parsePromptSnippets } from './prompts';
import { SessionDiagnosis, SessionOutcome } from './sessionDiagnosis';

/**
 * X-175 — THE PROMPT THE NEXT SESSION IS STARTED WITH.
 *
 * The diagnosis (X-174) says what a finished session left behind; this turns
 * that, the next backlog item and the path of the handover note into the
 * sentence the next session opens on.
 *
 * ‼️ THE EXTENSION IS SELF-CONTAINED, AND THIS FILE IS WHERE THAT IS EASIEST
 * TO BREAK. The templates ship INSIDE Agent Farm and work with nothing
 * configured — on a machine with no vault, no Obsidian and none of the user's
 * folders anywhere. A file may replace any of them (any file, on any path named
 * in settings, exactly the way the agents folder and the wiki folder are named),
 * and when that file is missing the built-ins carry on. Nothing is written to
 * anybody's notes and nothing is expected from them.
 *
 * ‼️ A MODEL IS CALLED ONLY WHEN THE FACTS ARE UNCERTAIN, and "uncertain" is
 * not a feeling: the diagnosis already separates what was measured from what
 * was not, so it is `unknown` being non-empty. The call itself belongs to the
 * runner (X-176); the DECISION is here, where it can be tested without spending
 * anything. The precedent is automation.ts — a question that could have been
 * counted, asked of a model, cost $70.90 over five nights.
 */

export interface SentryTemplate {
    /** which verdict this answers, or '*' for the one that answers any */
    when: SessionOutcome | '*';
    /** what it is called — a file block's label, or the built-in's own name */
    id: string;
    /** the prompt, with {placeholders} */
    text: string;
    source: 'built-in' | 'file';
}

/** The variables a template may ask for. Anything else is left visible. */
export interface PromptInputs {
    diagnosis: SessionDiagnosis;
    /** the item `projects.backlog.next` picked, when there is one */
    next?: { code: string; text: string; effort?: string };
    /** where the handover note really is — the caller owns the folder, not this file */
    handoverPath?: string;
    project?: string;
    /** the repositories the campaign works in */
    repos?: string[];
    /** ‼️ What the cheap turn ACTUALLY cost, when one was made. The item asks
     *  that it be recorded, and the prompt the next session reads is where a
     *  person looks for it. Absent means no model was called, and that is said
     *  in words rather than left as a zero. */
    assist?: ModelAssist;
}

/** What a cheap turn cost, in one shape, so two callers do not invent two. */
export interface ModelAssist {
    model: string;
    /**
     * ‼️ X-249 — THE SLOT WHOSE PLAN PAID FOR THIS TURN; '' = nobody named one.
     *
     * Optional because records written before the field existed are still valid
     * readings — they are simply silent about an account, which is honest: the
     * turn they describe really did run on whatever the machine was holding.
     */
    account?: string;
    ms: number;
    costUsd: number;
    at: number;
    ok: boolean;
    note?: string;
}

export interface ModelNeed {
    needed: boolean;
    /** why it is or is not worth a turn — a spend with no stated cause is the bill */
    why: string;
    /** the unmeasured facts themselves, so the turn stays small */
    questions: string[];
}

export interface NextPrompt {
    prompt: string;
    templateId: string;
    when: string;
    /** ‼️ X-191 added `leader`: the words were not rendered from a template at
     *  all, they were written by a leader turn. The template that WOULD have
     *  answered is still on the record beside them (`vars`, `when`), because
     *  "the leader wrote this" has to be something a reader can check. */
    source: 'built-in' | 'file' | 'leader';
    vars: Record<string, string>;
    /** placeholders the template asked for and nothing answered */
    unfilled: string[];
    assist: ModelNeed;
}

/**
 * ‼️ THE DEFAULTS LIVE HERE, IN THE EXTENSION. Adding a case is still one block
 * in the user's own file rather than a release — that is what the item asks for
 * — but a machine with no file configured is not a machine with no sentry.
 */
export const BUILT_IN_SENTRY_TEMPLATES: SentryTemplate[] = [
    {
        when: 'item-done', id: 'built-in/item-done', source: 'built-in',
        text: 'The previous session ({session}) finished its work: {closed}. Nothing is '
            + 'outstanding — {why}\n\nTake the next item on {project}: {nextCode} — {nextText} '
            + '(effort {nextEffort}). Read what has already been fought over it before you '
            + 'start, do the work, and close it with a note somebody can read in three months.'
    },
    {
        when: 'clean-handover', id: 'built-in/clean-handover', source: 'built-in',
        text: 'The previous session ({session}) stopped and left a handover note:\n\n'
            + '  {handoverPath}\n\nRead it FIRST and carry on from exactly where it stopped. '
            + 'It says what was done, what was left half-finished and what the first five '
            + 'minutes should be. Do not restart the item from the beginning and do not '
            + 're-derive what it already settled.\n\nWhat was measured about that session: {evidence}'
    },
    {
        when: 'nothing-to-continue', id: 'built-in/nothing-to-continue', source: 'built-in',
        text: 'The previous session ({session}) produced no turn and left nothing behind, so '
            + 'there is nothing to carry on from — this is not a fault to investigate.\n\n'
            + 'Start on {nextCode} — {nextText} (effort {nextEffort}) on {project}.'
    },
    {
        when: 'hit-the-wall', id: 'built-in/hit-the-wall', source: 'built-in',
        text: 'The previous session ({session}) ended with work outstanding and NO handover '
            + 'note. {why}\n\nWhat was measured: {evidence}\nWhat was NOT measured: {unknown}\n\n'
            + 'Before you start anything new, find out what was in flight: read the working '
            + 'tree of {repos} and the last turns of that session. Write down what you find, '
            + 'finish or revert it deliberately, and only then move on.'
            + '\n\nWhat filled those gaps: {assist}.'
    },
    {
        when: '*', id: 'built-in/any', source: 'built-in',
        text: 'The previous session ({session}) ended: {why}\n\nWhat was measured: {evidence}\n'
            + 'What was NOT measured: {unknown}\n\nDecide what to do about it before starting '
            + 'anything new.'
            + '\n\nWhat filled those gaps: {assist}.'
    }
];

/** ‼️ The headings a template file may use, in one place — the parser refuses
 *  anything else BY NAME, and `sentry.templates` hands the same list back, so a
 *  person writing their own file is never guessing what to call a block. */
export const SENTRY_VERDICTS: string[] =
    ['item-done', 'clean-handover', 'nothing-to-continue', 'hit-the-wall', '*'];

/**
 * ‼️ X-192 — ONE POOL, TWO USES.
 *
 * A block of the user's own words, as it comes off the page. The same block is
 * read twice and for two different jobs: if its heading names a verdict it is a
 * TEMPLATE and the mechanical path fills it; whatever its heading says, it is
 * MATERIAL the leader may blend. Before this, a heading naming no verdict was
 * refused and then thrown away — which is why the user's standing instructions
 * ("always give the session id", "after 3am keep it short") had nowhere to live
 * but their own hands.
 */
export interface InstructionBlock {
    /** what it is called — the fence's info string, the line above it, or its first words */
    label: string;
    /** the user's words, verbatim */
    text: string;
    /** the verdict its heading named, or that heading kept as a free-form "when" hint */
    when: string;
    /** which file it came from, so "why is this in my prompt" has an answer */
    file: string;
    /** true when `when` is one of the verdicts — i.e. it is ALSO a template */
    template: boolean;
}

/**
 * Read a user's file into blocks. The FORMAT is the saved-prompts format, on
 * purpose: this codebase already has one shape for "a file of prompts a person
 * edits", and a second parser would be a second set of rules about fences,
 * headings and blank blocks for somebody to learn.
 */
export function instructionsFromFile(text: string, file = ''): InstructionBlock[] {
    const out: InstructionBlock[] = [];
    for (const item of parsePromptSnippets(String(text ?? '')).items) {
        if (!item.text.trim()) { continue; }     // a block with no words is nothing
        const heading = String(item.group ?? '').trim();
        const verdict = SENTRY_VERDICTS.includes(heading.toLowerCase());
        out.push({
            label: item.label || heading || 'snippet',
            text: item.text,
            when: verdict ? heading.toLowerCase() : heading,
            file,
            template: verdict
        });
    }
    return out;
}

/**
 * ‼️ A HEADING NAMING NO VERDICT IS STILL REFUSED BY NAME — dropping it silently
 * is how somebody spends an evening wondering why their template never fires —
 * but the refusal now SAYS the block was kept. A refusal that reads as a loss
 * teaches people to stop writing the blocks this item exists to collect.
 */
function blocksToTemplates(
    blocks: InstructionBlock[]
): { templates: SentryTemplate[]; refusals: string[] } {
    const templates: SentryTemplate[] = [];
    const refusals: string[] = [];
    for (const b of blocks) {
        if (!b.template) {
            refusals.push(`${b.file ? `${b.file}: ` : ''}"${b.when || '(no heading)'}" is not a `
                + `verdict — the headings are ${SENTRY_VERDICTS.join(', ')}. It fills nothing `
                + 'mechanically; it is kept as material for the leader.');
            continue;
        }
        templates.push({
            when: b.when as SentryTemplate['when'],
            id: `file/${b.label || b.when}`, text: b.text, source: 'file'
        });
    }
    return { templates, refusals };
}

/** The template half of one file, for callers that only want that. */
export function templatesFromFile(text: string): { templates: SentryTemplate[]; refusals: string[] } {
    return blocksToTemplates(instructionsFromFile(text));
}

/** The user's templates first, so theirs win and the built-ins stay as the
 *  answer for every verdict they did not touch. */
export function mergeTemplates(builtIn: SentryTemplate[], fromFile: SentryTemplate[]): SentryTemplate[] {
    return [...(fromFile || []), ...(builtIn || [])];
}

/** Which templates are in force, where they came from, and what was refused. */
export interface SentryTemplateSet {
    /** the effective set: the user's first, the built-ins behind them */
    templates: SentryTemplate[];
    /** the file actually read — '' when there is none, which is the normal case */
    file: string;
    /** 'setting' = the user named one and it is on disk · 'none' = the built-ins */
    source: 'setting' | 'none';
    /** a path that was named but is not on disk — reported, never erased */
    missing: string;
    /** headings that name no verdict, blocks with nothing in them, a file that would not read */
    refusals: string[];
    /** the verdicts the file answered — so "why did mine not fire" is answerable */
    covers: string[];
}

/**
 * ‼️ SETTLE WHICH FILE, THEN FALL BACK TO WHAT SHIPS. The item asks for
 * templates that live as DATA so a new case is a line rather than a release;
 * the parser alone was half of that, because nothing settled WHICH file or read
 * it. Reading and existence are injected, so this stays a pure function and the
 * fallback can be tested on a machine that has no such file at all.
 *
 * ‼️ THE BUILT-INS ARE NOT A PATH TO SOMEWHERE. Nothing is named by default:
 * with the setting empty, or with a named file that has gone, every verdict
 * still has an answer and the extension needs nobody's folders. A named path
 * that is missing is REPORTED and never erased — same rule as the snippets
 * file, and for the same reason: writing '' into a user's settings on their
 * behalf is one-way.
 */
export function resolveSentryTemplates(
    setting: string,
    exists: (p: string) => boolean,
    read: (p: string) => string
): SentryTemplateSet {
    const chosen = String(setting ?? '').trim();
    const pool = resolveInstructionPool(chosen ? [chosen] : [], exists, read);
    return {
        templates: pool.templates,
        file: pool.files[0] ?? '',
        source: pool.files.length ? 'setting' : 'none',
        missing: pool.missing[0] ?? '',
        refusals: pool.refusals,
        covers: pool.covers
    };
}

/** What the whole pool holds, where each part came from, and what it refused. */
export interface InstructionPool {
    /** the effective templates: the user's first, the built-ins behind them */
    templates: SentryTemplate[];
    /** every block of the user's own words, in the order the files were listed */
    instructions: InstructionBlock[];
    /** the files actually read, in order — empty is the normal case */
    files: string[];
    /** paths that were named but are not on disk — reported, never erased */
    missing: string[];
    /** headings that name no verdict, and files that would not read */
    refusals: string[];
    /** the verdicts the pool answered — so "why did mine not fire" is answerable */
    covers: string[];
}

/**
 * ‼️ THE POOL IS A LIST OF PATHS, NOT A FILE. One file was the defect X-192 was
 * written for: the user keeps standing instructions in one place, per-project
 * wording in another, and a single setting made them choose. Reading and
 * existence are injected, so this stays pure and the "nothing configured at
 * all" case can be tested on a machine that has none of those folders.
 *
 * ‼️ AND THE BUILT-INS ARE NOT A PATH TO SOMEWHERE (X-179). With the list empty
 * every verdict still has an answer and the extension needs nobody's folders.
 * A named path that has gone is REPORTED and never cleared, and the rest of the
 * list still reads — one missing file does not silence the pool.
 *
 * ‼️ A PATH NAMED TWICE IS READ ONCE. The list is assembled out of two settings,
 * so the same file lands in it by accident; a doubled instruction would be a
 * doubled prompt on a model that is metered by the word.
 */
export function resolveInstructionPool(
    paths: string[],
    exists: (p: string) => boolean,
    read: (p: string) => string
): InstructionPool {
    const files: string[] = [];
    const missing: string[] = [];
    const refusals: string[] = [];
    const instructions: InstructionBlock[] = [];
    const seen = new Set<string>();
    for (const raw of paths ?? []) {
        const p = String(raw ?? '').trim();
        // An EMPTY entry is nothing rather than a fault — a user who clears a
        // row in a settings list means "not this one".
        if (!p) { continue; }
        const key = p.replace(/[\\/]+/g, '/').toLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        if (!exists(p)) { missing.push(p); continue; }
        let text = '';
        try {
            text = String(read(p) ?? '');
        } catch (e) {
            refusals.push(`${p} could not be read — ${e instanceof Error ? e.message : String(e)}`);
            continue;
        }
        files.push(p);
        instructions.push(...instructionsFromFile(text, p));
    }
    const found = blocksToTemplates(instructions);
    refusals.push(...found.refusals);
    return {
        templates: mergeTemplates(BUILT_IN_SENTRY_TEMPLATES, found.templates),
        instructions, files, missing, refusals,
        covers: [...new Set(found.templates.map(t => String(t.when)))]
    };
}

/**
 * The blocks worth waking the leader with.
 *
 * ‼️ NOT THE WHOLE POOL. The leader runs on a cheap model under a per-round cost
 * ceiling; handing it all four verdicts' wording is noise it pays for and, worse,
 * an invitation to copy the one that does not apply. It gets the standing
 * instructions — the blocks that name no verdict, which is exactly the user's
 * "give it the session id, keep it short after 3am" — plus the one block that
 * answers the round that actually happened, and the catch-all that answers any.
 */
export function materialFor(pool: InstructionPool, outcome: string): InstructionBlock[] {
    const want = String(outcome ?? '');
    return (pool?.instructions ?? []).filter(
        b => !b.template || b.when === want || b.when === '*');
}

/** The first template that answers this verdict, then the first catch-all. */
export function pickTemplate(templates: SentryTemplate[], outcome: string): SentryTemplate | undefined {
    const list = templates || [];
    return list.find(t => t.when === outcome) || list.find(t => t.when === '*');
}

/**
 * ‼️ WHEN A MODEL IS WORTH CALLING, AND ONLY THEN. `unknown` is the diagnosis's
 * own list of facts nobody measured — no handover folder listed, no repo state
 * read, no transcript opened. Everything else is already written down, and
 * asking a model about a fact you are holding is the spend this family exists
 * to stop.
 */
export function modelNeeded(diagnosis: SessionDiagnosis): ModelNeed {
    const unknown = diagnosis?.unknown ?? [];
    if (!unknown.length) {
        return {
            needed: false, questions: [],
            why: 'every fact this verdict rests on was measured — there is nothing to ask'
        };
    }
    return {
        needed: true, questions: [...unknown],
        why: `${unknown.length} fact${unknown.length === 1 ? ' was' : 's were'} not measured, so the `
            + 'verdict is uncertain — a cheap turn is worth it only for these'
    };
}

/** `claude-haiku · 2.4s · $0.0031`, or the plain truth that nothing was called. */
export function describeAssist(a?: ModelAssist): string {
    if (!a || !a.model) { return 'no model was called'; }
    return `${a.model} · ${(a.ms / 1000).toFixed(1)}s · $${a.costUsd.toFixed(4)}`;
}

/** The bag a template draws on. A fact that is not there is left VISIBLE in the
 *  prompt rather than blanked — see `fillContinuation`. */
export function promptVars(i: PromptInputs): Record<string, string> {
    const d = i.diagnosis;
    const closed = (d.evidence || []).filter(e => / closed$/.test(e)).map(e => e.replace(/ closed$/, ''));
    return {
        session: d.session,
        outcome: d.outcome,
        rule: d.rule,
        why: d.why,
        evidence: (d.evidence || []).join(' · ') || 'nothing was measured',
        unknown: (d.unknown || []).join(' · ') || 'nothing — every fact was measured',
        closed: closed.join(', ') || 'no item closed',
        handoverFile: d.handover?.file || '',
        handoverPath: i.handoverPath || d.handover?.file || '',
        nextCode: i.next?.code || '',
        nextText: i.next?.text || '',
        nextEffort: i.next?.effort || 'unstated',
        project: i.project || 'this project',
        repos: (i.repos || []).join(', ') || 'the project repositories',
        assist: describeAssist(i.assist)
    };
}

/**
 * The sentence the next session opens on. `templates` defaults to the built-in
 * set, so a caller that has configured nothing still gets a working prompt.
 */
export function buildNextPrompt(i: PromptInputs, templates?: SentryTemplate[]): NextPrompt {
    const list = templates && templates.length ? templates : BUILT_IN_SENTRY_TEMPLATES;
    const t = pickTemplate(list, i.diagnosis.outcome);
    const vars = promptVars(i);
    const prompt = t ? fillContinuation(t.text, vars) : i.diagnosis.why;
    return {
        prompt,
        templateId: t?.id || '',
        when: t?.when || '',
        source: t?.source || 'built-in',
        vars,
        unfilled: [...new Set((prompt.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1)))],
        assist: modelNeeded(i.diagnosis)
    };
}
