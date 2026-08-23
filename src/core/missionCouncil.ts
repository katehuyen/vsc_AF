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
    conversationMessages, intentKind, MissionConversation, MissionMessage, openThreads
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
    /**
     * ‼️ X-79 — this member had already voted, so this turn is NOT their ballot.
     * Kept whole, because a council's record is what was said and a vote that
     * vanished from it could never be explained; out of the tally, because one
     * member counted twice is a council with an extra person in it.
     */
    superseded?: boolean;
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
    req: {
        /** ‼️ X-78 — THE WHOLE ROUND, never one speaker at a time. */
        from: readonly string[];
        refs: readonly string[];
        close?: string;
        /** what the ordered turn is, so an exit can be read against what it will settle */
        intent?: string;
    },
    messages: readonly MissionMessage[],
    knownAgents: readonly { id: string; name: string }[]
): string {
    const name = (id: string) =>
        (id === 'lead' ? 'the lead' : (knownAgents.find(a => a.id === id)?.name ?? id));
    if (council.closedAt) {
        return `Council "${council.id}" is closed (${council.exit ?? 'no reason recorded'}). `
            + 'Open another one if the question is still live.';
    }
    for (const from of req.from) {
        if (from !== 'lead' && !council.members.includes(from)) {
            return `"${name(from)}" is not a member of council "${council.id}" `
                + `(${council.members.map(name).join(', ')}). A council's members are fixed when it opens.`;
        }
    }
    if (req.close !== undefined && !councilExit(req.close)) {
        return `A council closes for one of these stated reasons, not a sentence of your own: `
            + `${councilExitMenu()}. "${req.close}" is none of them.`;
    }
    // ‼️ THE CAP STOPS THE DEBATE, NOT THE ENDING. A closing turn is a turn, so
    // a cap that counted it would lock the council open for ever: every exit
    // refused for being one turn too many, including the exit that exists for
    // exactly this. One turn is allowed past the cap and only if it CLOSES.
    //
    // ‼️ X-78 — AND THE ROUND IS WEIGHED WHOLE. This was asked once per speaker
    // against the spent count as it stood BEFORE the round, so three speakers
    // ordered together each read "one turn left" and all three were allowed:
    // the cap was a ceiling on rounds, not on turns, and a wide round walked
    // over it by as many turns as it had speakers. A round is ordered whole or
    // not at all — the same reason every speaker is refusal-checked before any
    // of them is recorded — so it is the round's SIZE that is measured here.
    const spent = councilTurns(messages, council.conversationId);
    const remaining = council.maxTurns - spent;
    // ‼️ …AND AN ENDING IS ONE TURN BY ONE SPEAKER. `close` is a property of the
    // decision, so a three-speaker round carried it on all three: three closing
    // turns past the cap, of which the record can honour exactly one (the first
    // delivered) while the other two are bought and spent on a council that is
    // already closed. The grace the cap gives is a turn, not a round.
    if (req.close !== undefined && req.from.length > 1) {
        return `A council ends in ONE turn by ONE speaker, and this round orders ${req.from.length} `
            + `(${req.from.map(name).join(', ')}) all carrying "close". Order the closing turn on its own — `
            + 'the others would be paid for and said into a council that had already closed.';
    }
    if (req.close === undefined && req.from.length > remaining) {
        return remaining <= 0
            ? `Council "${council.id}" has used all ${council.maxTurns} of its turns. `
            + 'The next turn has to close it: send one with "close" set to "hard limit", or state its '
            + 'answer from what was said and close it with "decision clear". A closing turn is allowed '
            + `past the cap. The exits are: ${councilExitMenu()}.`
            : `Council "${council.id}" has ${remaining} of its ${council.maxTurns} turns left and this round `
            + `orders ${req.from.length} (${req.from.map(name).join(', ')}). A round is ordered whole or not `
            + `at all, so it cannot be part-funded: order ${remaining}, or make the next turn the one that `
            + `closes it. The exits are: ${councilExitMenu()}.`;
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
    if (council.chair !== 'lead' && said.length) {
        const call = chairCall(council, messages);
        for (const from of req.from) {
            if (from === council.chair) { continue; }
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
            // ‼️ X-78 — AND THE CHAIR'S CALL IS ADDRESSED. Citing it was the
            // whole test, so the lead could put any member up to answer a call
            // the chair had put to somebody else and the record would read as
            // though the chair had chosen the speaker. Who the chair called is
            // already a fact of the record — `to` on its own message — so it is
            // read rather than assumed. Empty `to` means the chair asked the
            // room, which is the ordinary case; the rule only bites on a call
            // that named people.
            if (call.to.length && !call.to.includes(from)) {
                return `${name(call.from)} put "${call.id}" to ${call.to.map(name).join(', ')}, `
                    + `not to ${name(from)}, so ${name(from)} cannot be the turn that answers the chair's call. `
                    + `Order ${call.to.map(name).join(' or ')} to answer it, or have the chair call `
                    + `${name(from)} first.`;
            }
        }
    }
    return refuseCouncilExit(council, req, messages, name);
}

/**
 * ‼️ X-78 — AN EXIT IS A CLAIM ABOUT THE RECORD, SO THE RECORD IS READ.
 *
 * The seven ways out do not say the same thing. `hard limit` and `chair abort`
 * report what happened to the council and claim nothing about the question;
 * `consensus` and `decision clear` claim the question was SETTLED, and a run
 * that reads them afterwards — a lead planning its next action, a person
 * reading the transcript — takes them at their word. Nothing checked them: a
 * lead could label a debate `consensus` over a challenge nobody had answered,
 * or `decision clear` on a turn that named nothing it rested on, and the
 * council's own record would contradict its stated ending.
 *
 * What is checkable is checked, and only that. Whether the participants really
 * agree is not a property of the record; whether anything is still unanswered,
 * and whether the closing turn points at what it rests on, are.
 */
function refuseCouncilExit(
    council: MissionCouncil,
    req: { from: readonly string[]; refs: readonly string[]; close?: string; intent?: string },
    messages: readonly MissionMessage[],
    name: (id: string) => string
): string {
    const exit = req.close === undefined ? undefined : councilExit(req.close);
    if (!exit) { return ''; }
    // What this closing turn will itself settle when it lands: a settling intent
    // closes the threads it names, so an objection the closer is answering is
    // not an objection left open.
    const settles = req.intent ? intentKind(req.intent)?.settles === true : false;
    const open = openThreads(messages, council.conversationId)
        .filter(m => !(settles && req.refs.includes(m.id)));
    if (exit === 'consensus' && open.length) {
        return `"consensus" says the participants agree and the agreement is in the record, but `
            + `${open.map(m => `${m.id} (${name(m.from)}'s ${m.intent})`).join(', ')} `
            + `${open.length > 1 ? 'are' : 'is'} still unanswered. Answer `
            + `${open.length > 1 ? 'them' : 'it'} first, have this turn settle `
            + `${open.length > 1 ? 'them' : 'it'} by naming ${open.length > 1 ? 'them' : 'it'} in "refs", `
            + 'or close on "no new information" or "sufficient evidence", which claim less.';
    }
    if ((exit === 'consensus' || exit === 'decision clear')
        && !req.refs.length && !(council.verdictRefs ?? []).length) {
        return `"${exit}" says the question was settled by what was SAID, so the turn that closes on it `
            + 'has to name what it rests on: put the message ids in "refs". A verdict that points at '
            + 'nothing cannot be checked by the reader it is written for — if there is nothing to point '
            + 'at, the honest exits are "no new information", "sufficient evidence" or "hard limit".';
    }
    return '';
}

/** The option this turn named, from the council's own list — or nothing. */
/**
 * ‼️ X-79 — THE OPTIONS ARE A SET, NOT A LIST OF STRINGS.
 *
 * Trimmed, blanks dropped, and unique by CASEFOLD: `["Fragments", "fragments"]`
 * is one option written twice, and letting it through would split a council's
 * own vote between two spellings of the same answer.
 */
export function normalizeOptions(options: readonly string[] | undefined): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of options ?? []) {
        const o = String(raw ?? '').trim();
        if (!o) { continue; }
        const key = o.toLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(o);
    }
    return out;
}

/** A word-boundary match: `file` does not match inside `profile` or `filed`. */
const namesOption = (hay: string, option: string): boolean => {
    const esc = option.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'u').test(hay);
};

/** Words that turn "X" into "not X" when they sit just in front of it. */
const NEGATION = /\b(not|no|never|n't|rather than|instead of|against|reject|oppose|avoid)\b[^.;!?]{0,24}$/;

/**
 * ‼️ X-79 — A VOTE IS READ EXACTLY OR IT IS UNCLEAR.
 *
 * This looked for the longest option that appeared ANYWHERE in the text as a
 * substring, which produced a confident answer for three kinds of turn that had
 * not chosen anything: one that weighed BOTH options ("fragments read better
 * but the single file is easier to ship"), one that named an option in order to
 * REJECT it ("not fragments"), and one where the option happened to be part of
 * another word (`file` inside `profile`). A tally built on any of those is the
 * M-19 failure with numbers on it.
 *
 * So: a STRUCTURED line wins first — `vote: X`, `choice: X`, `I vote X` — which
 * is what the brief asks the speaker for. Failing that, whole-word matches over
 * the whole text, and the answer stands only when EXACTLY ONE option is named
 * and it is not being refused. Zero matches, two matches, or a negated one are
 * all `undefined`, which the record keeps as `unclear` rather than resolving
 * into the likeliest guess.
 */
export function readVoteChoice(text: string, options: readonly string[]): string | undefined {
    const opts = normalizeOptions(options);
    if (!opts.length) { return undefined; }
    const body = String(text || '');
    const hay = body.toLowerCase();

    const ranked = [...opts].sort((a, b) => b.length - a.length);
    /**
     * Which options this text names — with the longest winning over any option
     * CONTAINED in it, because `single file` and `file` on the same six words
     * are one naming written once, not two competing ones. Two options that do
     * not contain each other really are two, and that is ambiguity.
     */
    const namedIn = (s: string): string[] => {
        const hit = ranked.filter(o => namesOption(s, o));
        return hit.filter(o => !hit.some(other =>
            other !== o && other.toLowerCase().includes(o.toLowerCase())));
    };

    // 1. The structured statement the speaker was asked for.
    const declared = /(?:^|\n)\s*(?:my\s+)?(?:final\s+)?(?:vote|choice|i\s+vote|i\s+choose|i\s+pick)\s*[:\-–—]?\s*(.{1,120})/i
        .exec(body);
    if (declared) {
        const named = namedIn(declared[1].toLowerCase());
        if (named.length === 1) { return named[0]; }
    }

    // 2. Otherwise the whole text, and only an unambiguous, unrefused naming.
    const named = namedIn(hay);
    if (named.length !== 1) { return undefined; }
    const at = hay.search(new RegExp(named[0].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return at >= 0 && NEGATION.test(hay.slice(0, at)) ? undefined : named[0];
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
    // ‼️ X-79 — ONE BALLOT PER MEMBER. A vote is a message, and a member that
    // spoke `vote` twice was counted twice: on a three-member council one agent
    // could out-vote the other two by talking. A superseded turn stays in the
    // record and out of the arithmetic. The tally is also read back off a
    // stored run, so it never trusts the writer to have marked them — a second
    // ballot from the same member is not counted here either.
    const counted = new Set<string>();
    for (const v of council.votes ?? []) {
        if (v.superseded) { continue; }
        if (v.member && counted.has(v.member)) { continue; }
        if (v.member) { counted.add(v.member); }
        if (v.choice) { counts[v.choice] = (counts[v.choice] ?? 0) + 1; }
        else { unclear++; }
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const tie = ranked.length > 1 && ranked[1][1] === top[1];
    return {
        // `total` is BALLOTS, not messages — a superseded turn is neither a
        // vote for something nor an unclear one; it is not a ballot at all.
        counts, unclear, total: Object.values(counts).reduce((a, b) => a + b, 0) + unclear,
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
    opts: {
        nameOf?: (id: string) => string; voting?: boolean;
        /** ‼️ X-78 — the chair's own message this turn was called by, when somebody else chairs. */
        call?: MissionMessage;
    } = {}
): string {
    const name = (id: string) =>
        (id === 'lead' ? 'the lead' : (opts.nameOf?.(id) ?? id));
    const parts = [
        '\n## You are speaking in a council',
        `The question it exists to settle: ${council.question.trim()}`,
        `It is chaired by ${name(council.chair)}. A council decides its own question and nothing else — `
        + 'it does not judge whether the mission succeeded.'
    ];
    // ‼️ X-78 — AND THE CHAIR'S INSTRUCTION IS NAMED AS THE ONE THAT GOVERNS.
    //
    // The turn was already made to cite the chair's message, so its words were
    // in front of the speaker — as one more block in the record, indistinguish-
    // able from any other, under a heading saying what the LEAD wanted. Whether
    // the two agree is not something the engine can decide (that is a reading of
    // two pieces of prose), so the one thing it can do it does: say which of
    // them chairs this council. A speaker told that reads a conflict as a
    // conflict instead of quietly obeying the last thing it was told.
    if (opts.call) {
        parts.push(`\nYou were called into this turn by the chair: message [${opts.call.id}], `
            + `${name(opts.call.from)}'s own words, is below. That is your instruction for this turn. `
            + 'The lead\'s "what the lead wants from this turn" is how the turn was ordered, not what '
            + 'the council asked of you — where the two differ, the chair chairs, so answer the chair '
            + 'and say plainly that you are doing so.');
    }
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
