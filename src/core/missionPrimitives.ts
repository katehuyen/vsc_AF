/**
 * ‼️ M-18 — WHAT AN OBJECTIVE'S LEAD CAN DO, DECLARED IN ONE PLACE.
 *
 * The adaptive loop grew a primitive at a time, and each one cost three edits
 * in three files that had to agree: a line in the prompt schema, an arm in the
 * parser, a branch in the engine. Nothing checked that they did agree — a
 * primitive advertised but unparsed, or parsed but unexecuted, looks exactly
 * like a working one until a run reaches it.
 *
 * So the list is data. A primitive states its scope (who may use it), its shape
 * (what the engine does with it) and the graph kind it becomes; the prompt is
 * BUILT from the list, the parser dispatches through it, and the unknown-action
 * error names the same set the lead was offered. Adding one is an entry and a
 * handler, not a hunt.
 *
 * Deliberately NOT here: execution. A primitive never runs work of its own —
 * `review`, `compare` and `revise` are typed intents on the ordinary task path
 * (`TaskManager.addTask`/`startTask`), which is why they share the waves, the
 * writer rule, the budget and the cancel of every other delegation. A primitive
 * that opened its own execution route would be a second engine.
 */

import { messageIntentMenu } from './missionConversation';
import { MissionActionKind } from './missionTrace';

/** A typed task intent — one delegation built from work the run already has. */
export type TaskIntent = 'review' | 'compare' | 'revise';

export type PrimitiveName =
    | 'delegate' | 'parallel' | TaskIntent
    | 'evaluate' | 'run_workflow' | 'run_mission' | 'message' | 'council'
    | 'replan' | 'finish' | 'ask_user' | 'abort';

/**
 * What the engine DOES with a decision — not a category, a dispatch.
 * `work` starts real tasks and waits · `plan` records and asks again ·
 * `human` waits for the user · `terminal` ends the run.
 */
export type PrimitiveShape = 'work' | 'plan' | 'human' | 'terminal';

/**
 * A `work` primitive that is ONE task built out of results the run already
 * holds. The lead names the target ids and what it wants; the engine attaches
 * the real material, so the lead never has to copy an output into a prompt (and
 * therefore cannot paraphrase one into something that was never produced).
 */
export interface PrimitiveIntent {
    /** fewest target ids that make the request meaningful */
    minTargets: number;
    /** does the resulting task write to the working folder? */
    readonly: boolean;
    /** the built prompt's opening heading */
    heading: string;
    /** what the agent is being asked to do with the material */
    charge: string;
    /** what the lead's own free-text ask is called in the prompt */
    askHeading: string;
}

export interface MissionPrimitive {
    name: PrimitiveName;
    /** `both` = a classic lead may use it too; `adaptive` = objectives only */
    scope: 'both' | 'adaptive';
    shape: PrimitiveShape;
    /** the graph node kind the work becomes — never a new kind of work */
    kind: MissionActionKind;
    /** one line, shown in the planner's menu and readable by a person */
    describe: string;
    /** extra JSON fields this primitive needs, for the schema block */
    fields?: string[];
    /** rule sentences that go under the schema */
    rules?: string[];
    intent?: PrimitiveIntent;
}

/**
 * ‼️ ORDER IS CONTRACT. The classic menu is this list filtered to `both`, and
 * that string appears verbatim in the error a classic lead sees when it invents
 * an action — `delegate | finish | ask_user | abort`. Reordering rewrites a
 * message that is part of the classic run's behaviour, which does not move.
 */
export const PRIMITIVES: readonly MissionPrimitive[] = [
    {
        name: 'delegate', scope: 'both', shape: 'work', kind: 'task',
        describe: 'give one or more pool agents self-contained work; the engine waves them by the writer rule'
    },
    {
        name: 'parallel', scope: 'adaptive', shape: 'work', kind: 'task',
        describe: 'the same as delegate, but you are stating these tasks are INDEPENDENT and want them started together',
        rules: [
            '"parallel" is "delegate" plus a claim: that these tasks do not depend on each other. The engine still obeys the one-writer-per-folder rule — if two of them write, they are run in order and you are told so.'
        ]
    },
    {
        name: 'review', scope: 'adaptive', shape: 'work', kind: 'task',
        describe: 'ask a pool agent to critique named results and report back — evidence for you, not a verdict on the objective',
        intent: {
            minTargets: 1, readonly: true,
            heading: 'You are reviewing work somebody else produced',
            charge: 'Read the work below and report what is wrong with it, what is missing, and what is sound. '
                + 'You are NOT fixing it and you are NOT deciding whether the objective is met — your report is evidence for the lead.',
            askHeading: 'What the lead wants looked at'
        }
    },
    {
        name: 'compare', scope: 'adaptive', shape: 'work', kind: 'task',
        describe: 'ask a pool agent to weigh two or more named results against each other',
        intent: {
            minTargets: 2, readonly: true,
            heading: 'You are comparing several pieces of work',
            charge: 'Weigh the pieces below against each other. Say where they really differ, which is stronger for the '
                + 'purpose stated, and why. Do not merge them and do not produce a new version.',
            askHeading: 'What the lead is choosing between, and for what'
        }
    },
    {
        name: 'revise', scope: 'adaptive', shape: 'work', kind: 'task',
        describe: 'send named results back to be corrected — same approach, same artefact, the gap closed',
        intent: {
            minTargets: 1, readonly: false,
            heading: 'You are revising work that already exists',
            charge: 'Produce the corrected version. Same approach and the same artefact — close the gap named below '
                + 'rather than starting over. If the gap cannot be closed the way it is stated, say so plainly instead of '
                + 'substituting a different piece of work.',
            askHeading: 'The gap to close'
        }
    },
    {
        name: 'evaluate', scope: 'adaptive', shape: 'work', kind: 'task',
        describe: 'judge the success criteria — yourself from what you hold, or through an independent reviewer'
    },
    {
        name: 'run_workflow', scope: 'adaptive', shape: 'work', kind: 'workflow',
        describe: 'run one of this window\'s existing workflows as a single step and take its final output as the result',
        rules: [
            '"run_workflow" runs a chain that ALREADY EXISTS — you cannot compose one, and you do not drive its steps. '
            + 'To you it is one unit of work: it finishes, fails or stops short, and what comes back is what its last '
            + 'completed step produced. Use it when the chain already encodes the work; delegate when it does not.'
        ]
    },
    {
        name: 'run_mission', scope: 'adaptive', shape: 'work', kind: 'mission',
        describe: 'hand a whole sub-objective to a child run with its own lead, and take back its verdict',
        rules: [
            '"run_mission" is for a piece of the objective big enough to need its own planning — it gets a lead of its '
            + 'own, works from the same pool and the same folder, and comes back with a verdict rather than an output. '
            + 'It spends YOUR budget: what the child costs is charged to this run once, and its limits are cut from what '
            + 'you have left. Do not use it for work one delegation can do, and do not nest it deeply — there is a cap, '
            + 'and an objective already inside itself is refused.'
        ]
    },
    {
        name: 'message', scope: 'adaptive', shape: 'work', kind: 'conversation',
        describe: 'have one pool agent SPEAK to the others — a real turn that reads their real messages',
        fields: [
            '"conversation": "for message: the id of a conversation you already opened (c1, c2…) — omit it to open a new one"',
            '"objective": "for message, only when opening a new conversation: what it is FOR, in one line"',
            '"participants": ["for message, only when opening: the pool agents who may speak in it"]',
            '"from": "for message: the pool agent that speaks this turn — or a LIST of them to have '
            + 'each speak without seeing the others\' answer"',
            '"to": ["for message: who it is addressed to — leave empty for everyone in the conversation"]',
            `"intent": "for message: ${messageIntentMenu()}"`,
            '"refs": ["for message: the message ids this turn is about — required for challenge, response, concede, synthesis and vote"]',
            '"visibility": "for message: how much of the record this speaker is shown — all | refs-only | since. '
            + 'Omit for the default: the whole record, or everything since that speaker\'s own last turn on a lane being resumed"',
            '"close": "for message: end the conversation after this turn, and say in one line why"'
        ],
        rules: [
            '"message" is a REAL speaking turn, not a note you write. The agent you name in "from" runs as an '
            + 'ordinary delegation, is shown the ACTUAL TEXT of the messages you put in "refs", and whatever it '
            + 'writes becomes the message. You never write somebody else\'s message and you are never asked to '
            + 'summarise one — you name ids, and the engine attaches the words.',
            '‼️ X-77 — a "response" and a "concede" are the ADDRESSEE\'s to give: a participant a question or '
            + 'challenge was not put to cannot settle it, and nobody settles their own. It may "challenge" or '
            + '"propose" in its own name instead. And "refs" name messages that were really SAID — a turn you '
            + 'ordered this round has an id but no words yet, so it cannot be answered.',
            '"visibility": "refs-only" asks somebody about one thing without also handing it every position '
            + 'already taken — which is what you want when you are after an independent opinion rather than a '
            + 'reaction. What each speaker was shown is kept on its message.',
            '‼️ You may NOT report a discussion that did not happen. Three agents answering the same question '
            + 'separately are three proposals, not a debate: a "synthesis" or a "vote" has to name the messages it '
            + 'rests on, and only a real speaking turn produces a message id to name.',
            'One participant speaks at a time in one conversation. To have several speak WITHOUT seeing each '
            + 'other — the independent first round — put them all in "from" in ONE decision: they are briefed '
            + 'from the record as it stands before any of them answers. Two separate rounds cannot do this, '
            + 'because by the second one the first message has been delivered and is in the record.',
            'When the same agent speaks again, its own session is continued where its engine can be resumed — '
            + 'you do not manage that, and the record says which of the two actually happened.',
            'Close a conversation with "close" when it is finished, saying why in one line. A conversation left '
            + 'open is one you may still speak in; one that is closed is a finished record.'
        ]
    },
    {
        name: 'council', scope: 'adaptive', shape: 'work', kind: 'conversation',
        describe: 'open a CHAIRED debate on one question — a conversation with a chair, a cap and a named way out',
        fields: [
            '"question": "for council: the ONE question this council settles — narrower than the objective"',
            '"members": ["for council: the pool agents who debate it — at least two"]',
            '"chair": "for council: the pool agent that directs it; omit it and YOU chair"',
            '"from": ["for council: who speaks the opening turn — several to have each open '
            + 'without seeing the others"]',
            '"maxTurns": "for council: the ceiling on turns in it (default 8)"',
            '"options": ["for council: what a vote in it would be between; a voter has to name one of these"]'
        ],
        rules: [
            '"council" is "message" with a chair, a cap and a stated way out — nothing else. It runs on an '
            + 'ordinary conversation and every turn in it is an ordinary speaking turn, so you go on using '
            + '"message" to run it. There is no debate protocol: whose turn it is, and about what, is yours '
            + 'to decide each round from what has actually been said.',
            '‼️ If you name a "chair" other than yourself, you may not order a turn it did not call for: a '
            + 'turn by anybody else has to name the chair\'s latest message in "refs", which is what makes '
            + 'the speaker read what the chair really wrote instead of your account of it.',
            'A council closes with "close" and one of its OWN reasons, never a sentence of your own — and '
            + 'reaching the turn cap is one of them ("hard limit"), not a failure.',
            '‼️ A council decides ITS question. A vote in it is what the members think, not a verdict on a '
            + 'success criterion — only "evaluate" judges those, and a majority never stands in for one.'
        ]
    },
    {
        name: 'replan', scope: 'adaptive', shape: 'plan', kind: 'task',
        describe: 'state that the approach itself has changed, before ordering the work it calls for'
    },
    {
        name: 'finish', scope: 'both', shape: 'terminal', kind: 'task',
        describe: 'stop with an honest verdict on the objective'
    },
    {
        name: 'ask_user', scope: 'both', shape: 'human', kind: 'task',
        describe: 'put one question to the human and wait'
    },
    {
        name: 'abort', scope: 'both', shape: 'terminal', kind: 'task',
        describe: 'stop because the objective cannot be reached'
    }
];

const BY_NAME = new Map<string, MissionPrimitive>(PRIMITIVES.map(p => [p.name, p]));

/** The primitive a lead in this mode may use, or undefined — one lookup, so
 *  "unknown action" and "not in this mode" are the same answer to the lead. */
export function primitiveFor(action: string, adaptive: boolean): MissionPrimitive | undefined {
    const p = BY_NAME.get(action);
    if (!p) { return undefined; }
    if (p.scope === 'adaptive' && !adaptive) { return undefined; }
    return p;
}

/** Metadata lookup that ignores mode — for surfaces reading a recorded run. */
export function primitiveNamed(action: string): MissionPrimitive | undefined {
    return BY_NAME.get(action);
}

export function primitivesFor(adaptive: boolean): MissionPrimitive[] {
    return PRIMITIVES.filter(p => adaptive || p.scope === 'both');
}

/** `delegate | finish | ask_user | abort` — the menu, generated from the same
 *  list the parser dispatches on, so the two can never drift apart. */
export function primitiveMenu(adaptive: boolean): string {
    return primitivesFor(adaptive).map(p => p.name).join(' | ');
}

export function unknownActionError(action: string, adaptive: boolean): string {
    return `unknown "action": "${action}" (use ${primitiveMenu(adaptive)})`;
}

/** Is this a typed task intent (one task built from named results)? */
export function intentPrimitive(action: string): MissionPrimitive | undefined {
    const p = BY_NAME.get(action);
    return p?.intent ? p : undefined;
}

/**
 * The delegate's whole world for a typed intent: what it is doing, what the
 * lead asked, and the REAL material — never a summary of it. The lead cannot
 * hand over a paraphrase here, which is the point: the agent revising a file
 * reads what was actually produced.
 */
export function buildIntentPrompt(p: MissionPrimitive, ask: string, material: string, goal?: string): string {
    const i = p.intent;
    if (!i) { return ask; }
    return `# ${i.heading}
${i.charge}
${goal ? `\n## The objective this serves\n${goal.trim()}\n` : ''}
## ${i.askHeading}
${ask.trim() || '(the lead named none — use your judgement on the material below)'}

## The work itself
${material}`;
}

/** A one-line label for a typed intent's task, when the lead names none. */
export function intentTitle(name: PrimitiveName, targets: readonly string[]): string {
    const n = targets.length;
    if (name === 'compare') { return `compare ${n} results`; }
    return `${name} ${n === 1 ? 'a result' : `${n} results`}`;
}
