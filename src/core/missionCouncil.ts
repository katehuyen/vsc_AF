/**
 * ‼️ M-20 (X-32) — A COUNCIL IS A CONVERSATION WITH A CHAIR AND A MANDATE, NOT
 * A SECOND ENGINE.
 *
 * The thing to refuse here is the obvious build: a "council engine" that runs
 * round 1 = A, round 2 = B, round 3 = synthesis. That protocol is a guess about
 * a debate nobody has had yet — the moment the second speaker concedes in its
 * first sentence, rounds 2 and 3 are bought anyway, and the transcript reads
 * like deliberation because the shape was printed before anyone spoke. Whose
 * turn it is, and about what, is a RUNTIME decision or it is theatre.
 *
 * So a council adds no way of talking. It runs on M-19's record — the same
 * conversation, the same real speaking turns, the same one-writer waves — and
 * contributes exactly four things that record cannot state on its own:
 *
 *   1. a QUESTION the debate is about, which is not the objective;
 *   2. a CHAIR, and when the chair is not the lead, the structural fact that
 *      the lead may not order a turn the chair did not call for — enforced the
 *      only way M-19 allows, by making the next turn REFER to the chair's real
 *      message, so the speaker reads what the chair actually wrote;
 *   3. a CAP, so an endless debate stops mechanically rather than politely;
 *   4. a named WAY OUT from a closed set — a council ends for one of seven
 *      stated reasons, never because nothing has been said for a while.
 *
 * ‼️ AND A COUNCIL NEVER DECIDES THE OBJECTIVE. A vote is evidence about what
 * the participants think, not a verdict on a success criterion: M-17's
 * evaluations are the only thing that judges criteria, and a majority that
 * could overrule one would make the criteria decorative.
 */

import {
    conversationMessages, MissionConversation, MissionMessage, openThreads
} from './missionConversation';

/**
 * ‼️ THE SEVEN WAYS A COUNCIL ENDS — a closed set, because "the discussion
 * finished" is the sentence a reader three months later gets nothing from. Each
 * one says something different about what the run may do next: `consensus` and
 * `decision clear` settled the question, `need execution` did not settle it but
 * knows what to do, and `hard limit` and `chair abort` settled nothing at all.
 */
export const COUNCIL_EXITS = {
    'consensus': 'the participants agree, and the agreement is in the record',
    'sufficient evidence': 'enough has been shown to answer the question, whether or not everyone agrees',
    'no new information': 'the last turns repeated positions already held — more turns would buy nothing',
    'decision clear': 'the chair can state the answer from what was said, without further turns',
    'need execution': 'the question cannot be settled by talking — it needs work done and looked at',
    'hard limit': 'the council reached its turn cap or the run reached a budget',
    'chair abort': 'the chair stopped it: the question was wrong, or the debate was not about it'
} as const;

export type CouncilExit = keyof typeof COUNCIL_EXITS;

export const COUNCIL_EXIT_NAMES = Object.keys(COUNCIL_EXITS) as CouncilExit[];

/** `consensus | sufficient evidence | …` — generated, so no surface can drift. */
export function councilExitMenu(): string {
    return COUNCIL_EXIT_NAMES.join(' | ');
}

export function councilExit(raw: unknown): CouncilExit | undefined {
    const s = String(raw ?? '').trim().toLowerCase();
    return COUNCIL_EXIT_NAMES.find(e => e === s);
}

/**
 * ‼️ A VOTE IS A MESSAGE, AND ITS CHOICE IS THE VOTER'S OWN WORD FOR IT.
 *
 * There is no field a lead could fill in on somebody's behalf: the vote exists
 * because a speaking turn produced it, and the choice is read out of that turn's
 * own text by looking for one of the options the council named. A turn that
 * named none is `unclear` — recorded as unclear, never resolved into the
 * likeliest option, because a tally built on a guess is exactly the artefact
 * M-19 exists to refuse, with numbers on it.
 */
export interface CouncilVote {
    /** the real message that IS this vote */
    messageId: string;
    /** agent id of the voter */
    member: string;
    /** the option it named, verbatim from the council's own list */
    choice?: string;
    /** it voted, but named no option — the record says so rather than choosing */
    unclear?: boolean;
}

export interface MissionCouncil {
    /** `k1`, `k2`… unique within the run */
    id: string;
    /** the decision node that opened it — the edge back to the lead */
    sourceActionId?: string;
    /** ‼️ the M-19 conversation it runs ON. Not a copy of one; the same record. */
    conversationId: string;
    /** what this council decides — narrower than the objective, always */
    question: string;
    /** agent id of the chair, or `lead` when the objective's own lead chairs it */
    chair: string;
    /** agent ids that may speak — the conversation's cast, named again as members */
    members: string[];
    /** what a vote would be between; the voter has to name one of these */
    options?: string[];
    /** the ceiling that ends an endless debate mechanically */
    maxTurns: number;
    votes?: CouncilVote[];
    /** the messages the verdict rests on — real ids, or there is no verdict */
    verdictRefs?: string[];
    openedAt: number;
    closedAt?: number;
    exit?: CouncilExit;
}

export function newCouncilId(existing: readonly { id: string }[]): string {
    return `k${existing.length + 1}`;
}

export function councilOf(
    councils: readonly MissionCouncil[] | undefined,
    conversationId: string
): MissionCouncil | undefined {
    return (councils ?? []).find(k => k.conversationId === conversationId);
}

/** Turns SPENT — ordered ones count. A turn that failed still cost a delegation,
 *  and a cap that only counted successes would not be a cap. */
export function councilTurns(messages: readonly MissionMessage[], conversationId: string): number {
    return conversationMessages(messages, conversationId).filter(m => m.state !== 'cancelled').length;
}

/** The chair's most recent delivered message — what a called turn must refer to. */
export function chairCall(
    council: MissionCouncil,
    messages: readonly MissionMessage[]
): MissionMessage | undefined {
    const mine = conversationMessages(messages, council.conversationId)
        .filter(m => m.from === council.chair && m.state === 'delivered');
    return mine[mine.length - 1];
}

/**
 * ‼️ WHAT A COUNCIL REFUSES ON TOP OF WHAT A CONVERSATION ALREADY REFUSES.
 *
 * `refuseMessage` answers "is this a legal turn in this record"; this answers
 * "is this a legal turn in this DEBATE". They are separate questions and are
 * kept separate: a council is optional, and every rule below would be wrong for
 * an ordinary conversation.
 */
export function refuseCouncilTurn(
    council: MissionCouncil,
    req: { from: string; refs: readonly string[]; close?: string },
    messages: readonly MissionMessage[],
    knownAgents: readonly { id: string; name: string }[]
): string {
    const name = (id: string) =>
        (id === 'lead' ? 'the lead' : (knownAgents.find(a => a.id === id)?.name ?? id));
    if (council.closedAt) {
        return `Council "${council.id}" is closed (${council.exit ?? 'no reason recorded'}). `
            + 'Open another one if the question is still live.';
    }
    if (req.from !== 'lead' && !council.members.includes(req.from)) {
        return `"${name(req.from)}" is not a member of council "${council.id}" `
            + `(${council.members.map(name).join(', ')}). A council's members are fixed when it opens.`;
    }
    // ‼️ THE CAP STOPS THE DEBATE, NOT THE ENDING. A closing turn is a turn, so
    // a cap that counted it would lock the council open for ever: every exit
    // refused for being one turn too many, including the exit that exists for
    // exactly this. One turn is allowed past the cap and only if it CLOSES.
    const spent = councilTurns(messages, council.conversationId);
    if (spent >= council.maxTurns && req.close === undefined) {
        return `Council "${council.id}" has used all ${council.maxTurns} of its turns. `
            + 'The next turn has to close it: send one with "close" set to "hard limit", or state its '
            + 'answer from what was said and close it with "decision clear". A closing turn is allowed '
            + `past the cap. The exits are: ${councilExitMenu()}.`;
    }
    // ‼️ A CHAIR THAT IS NOT THE LEAD REALLY CHAIRS. The lead still orders every
    // turn — it is the only thing running — so "the chair chose the next
    // speaker" could be pure narration. It is made a fact of the record the one
    // way M-19 allows: the turn must REFER to what the chair last said, which
    // means the speaker is shown the chair's own words. A lead that wanted to
    // invent an instruction would have to invent a message, and it cannot.
    const said = conversationMessages(messages, council.conversationId)
        .filter(m => m.state === 'delivered');
    // ‼️ …AND THE OPENING TURNS ARE THE ONE EXCEPTION, because there is nothing
    // to cite yet. A chaired council whose opening round is independent — every
    // member stating a position before any of them has seen another — would
    // otherwise be refused for not answering a chair that had not spoken, which
    // is the one moment in a debate when nobody could have.
    if (council.chair !== 'lead' && req.from !== council.chair && said.length) {
        const call = chairCall(council, messages);
        if (!call) {
            return `Council "${council.id}" is chaired by ${name(council.chair)}, and it has not spoken yet. `
                + 'The chair opens the turn it wants — order a turn from the chair first, or open an '
                + 'unchaired council if you mean to direct this yourself.';
        }
        if (!req.refs.includes(call.id)) {
            return `Council "${council.id}" is chaired by ${name(council.chair)}, so a turn by somebody else `
                + `has to answer what the chair asked for: put "${call.id}" in "refs". `
                + 'That is how the speaker is shown what the chair actually wrote rather than your account of it.';
        }
    }
    if (req.close !== undefined && !councilExit(req.close)) {
        return `A council closes for one of these stated reasons, not a sentence of your own: `
            + `${councilExitMenu()}. "${req.close}" is none of them.`;
    }
    return '';
}

/** The option this turn named, from the council's own list — or nothing. */
export function readVoteChoice(text: string, options: readonly string[]): string | undefined {
    const hay = (text || '').toLowerCase();
    // Longest first, so "single file" is not matched as "file" when both are on
    // offer — a shorter option contained in a longer one would otherwise decide
    // the vote by accident of wording.
    const ranked = [...options].sort((a, b) => b.length - a.length);
    return ranked.find(o => o.trim() && hay.includes(o.trim().toLowerCase()));
}

export interface CouncilTally {
    /** option → how many members named it */
    counts: Record<string, number>;
    /** votes that named no option — counted, never assigned */
    unclear: number;
    total: number;
    /** the option with the most votes, or undefined when there is a tie or none */
    leader?: string;
    tie: boolean;
}

/**
 * ‼️ A TIE IS A RESULT AND IS REPORTED AS ONE. The alternative — handing the
 * lead a `leader` when two options are level — invents an outcome at exactly
 * the moment the council found it had none.
 */
export function tallyVotes(council: MissionCouncil): CouncilTally {
    const counts: Record<string, number> = {};
    let unclear = 0;
    for (const v of council.votes ?? []) {
        if (v.choice) { counts[v.choice] = (counts[v.choice] ?? 0) + 1; }
        else { unclear++; }
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const tie = ranked.length > 1 && ranked[1][1] === top[1];
    return {
        counts, unclear, total: (council.votes ?? []).length,
        ...(top && !tie ? { leader: top[0] } : {}),
        tie
    };
}

/**
 * What a SPEAKER is told about the council it is speaking in — beyond what the
 * conversation already tells it. Short on purpose: the question, who chairs,
 * and, when a vote is on offer, the options it must name one of. Everything
 * else it needs is the exchange itself, which it already gets in full.
 */
export function councilBrief(
    council: MissionCouncil,
    opts: { nameOf?: (id: string) => string; voting?: boolean } = {}
): string {
    const name = (id: string) =>
        (id === 'lead' ? 'the lead' : (opts.nameOf?.(id) ?? id));
    const parts = [
        '\n## You are speaking in a council',
        `The question it exists to settle: ${council.question.trim()}`,
        `It is chaired by ${name(council.chair)}. A council decides its own question and nothing else — `
        + 'it does not judge whether the mission succeeded.'
    ];
    if (opts.voting && council.options?.length) {
        parts.push('\nThis turn is a VOTE. Name ONE of these, in these words, and then say in a sentence or '
            + 'two why, and how sure you are:\n'
            + council.options.map(o => `- ${o}`).join('\n')
            + '\nA turn that names none of them is recorded as an unclear vote, not as one of the options.');
    }
    return parts.join('\n');
}

/**
 * ‼️ WHAT THE LEAD READS BETWEEN ROUNDS — bounded like the conversation digest
 * and for the same reason: the planner session is resumed every round, so
 * anything put here is paid for once per round for the rest of the run. The
 * transcript is one op away and the user's surfaces read it in full for free.
 */
export function councilDigest(
    council: MissionCouncil,
    messages: readonly MissionMessage[],
    opts: { nameOf?: (id: string) => string } = {}
): string {
    const name = (id: string) =>
        (id === 'lead' ? 'you' : (opts.nameOf?.(id) ?? id));
    const spent = councilTurns(messages, council.conversationId);
    const open = openThreads(messages, council.conversationId);
    const lines = [
        `## Council ${council.id} — ${council.question}`,
        `On conversation ${council.conversationId} · chaired by ${name(council.chair)} · `
        + `members ${council.members.map(name).join(', ')} · ${spent}/${council.maxTurns} turns used`
    ];
    if (council.closedAt) {
        lines.push(`CLOSED — ${council.exit} (${council.exit ? COUNCIL_EXITS[council.exit] : ''}).`);
        return lines.join('\n');
    }
    lines.push(open.length
        ? `Unanswered: ${open.map(m => `${m.id} (${name(m.from)}, ${m.intent})`).join(', ')} — `
        + 'a council that closes over an unanswered challenge is closing on "no new information" at best.'
        : 'Nothing is left unanswered.');
    if (council.chair !== 'lead') {
        const call = chairCall(council, messages);
        lines.push(call
            ? `The chair last spoke in ${call.id}; a turn by anybody else has to name it in "refs".`
            : 'The chair has not spoken yet — the next turn has to be the chair\'s.');
    }
    if (council.options?.length) {
        const t = tallyVotes(council);
        lines.push(t.total
            ? `Votes (${t.total}): `
            + Object.entries(t.counts).map(([o, n]) => `${o} ${n}`).join(' · ')
            + (t.unclear ? ` · unclear ${t.unclear}` : '')
            + (t.tie ? ' — TIED, which is a result and not a failure to decide' : '')
            + '. ‼️ A majority is what the members think, not a verdict on a success criterion.'
            : `On offer if you call a vote: ${council.options.join(' | ')}.`);
    }
    lines.push(`Close it with "close" and one of: ${councilExitMenu()}.`);
    return lines.join('\n');
}
