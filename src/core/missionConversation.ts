/**
 * ‼️ M-19 — WHAT IT MEANS FOR TWO AGENTS TO HAVE ACTUALLY TALKED.
 *
 * The failure this exists to make impossible: a lead sends the same question to
 * three agents, gets three independent answers back, and writes "the three
 * discussed it and converged on X". Nobody discussed anything. B never saw A's
 * answer, and the convergence is the lead's own prose — a synthesis of material
 * that was never in contact, presented as the outcome of a debate. It reads
 * exactly like the real thing, which is why it has to be structurally
 * impossible rather than discouraged.
 *
 * So a conversation is a RECORD, not a rendering:
 *
 *   * A message exists only when a real speaking turn produced it. The turn is
 *     an ordinary headless task on the ordinary task path — same waves, same
 *     writer lock, same budget, same cancel. There is no message transport
 *     here and there is no second execution engine.
 *   * A message that answers something names what it answers, BY ID, and the
 *     id is checked against this conversation. `synthesis` and `vote` are in
 *     that set: a conclusion that cites nothing is the exact artefact this item
 *     exists to refuse.
 *   * The next speaker is given the REAL TEXT of the messages it is answering,
 *     assembled here from the record. The lead never gets to hand over its own
 *     summary of what somebody said — the same rule the typed intents of M-18
 *     already enforce for work, applied to speech.
 *
 * ‼️ FILE SHARING IS NOT CONVERSATION. A speaker's full output may stay in its
 * task's output file and usually should; `contentRef` points at it. But the
 * MESSAGE is the event, and it carries a bounded excerpt of its own — so the
 * transcript reads, and the record survives, without depending on a file that
 * a later run may have overwritten.
 *
 * ‼️ AND THE LEAD IS NOT GIVEN THE WHOLE TRANSCRIPT EVERY ROUND. A planner call
 * that embedded every message would grow quadratically with the conversation
 * and pay for the early turns once per round for the rest of the run.
 * `conversationDigest` is what it gets: what is still unanswered, the last few
 * turns in one line each, and the ids to ask for. The full text is one message
 * id away and the user's surfaces read it in full.
 *
 * Pure: no vscode, no disk, no clock of its own. Every time is handed in.
 */

/**
 * ‼️ THE CLOSED SET. An intent is here or it does not exist — the planner's
 * menu, the parser's dispatch and the transcript's badge are all built from
 * this one table, so an intent cannot be offered and then not understood.
 */
export type MessageIntent =
    | 'proposal'
    | 'question'
    | 'challenge'
    | 'response'
    | 'evidence'
    | 'concede'
    | 'synthesis'
    | 'vote';

export interface MessageIntentKind {
    /**
     * ‼️ Does this intent mean anything without naming what it is about?
     *
     * `challenge`, `response`, `concede`, `synthesis` and `vote` are all ABOUT
     * something somebody else said. Allowing them to be sent with no refs is
     * how a "synthesis" that cites nothing gets into the record and reads like
     * the conclusion of a debate.
     */
    needsRefs: boolean;
    /**
     * ‼️ Does this intent PUT SOMETHING TO SOMEBODY — i.e. is the conversation
     * incomplete until it is answered?
     *
     * A question and a challenge do. A proposal and a piece of evidence do NOT:
     * they are statements, and a discussion where nobody argued back is a
     * discussion with nothing outstanding, not one with two loose ends. Getting
     * this wrong is not cosmetic — it is the difference between "two challenges
     * nobody answered" and a permanently alarming count that means nothing.
     */
    awaits: boolean;
    /**
     * Does this intent SETTLE what it refers to? A response, a concession or a
     * synthesis closes what it names; a challenge does not, even though it
     * names one. This is the other half of `openThreads`, and it is why "three
     * rounds happened" is not the same claim as "nothing is left unanswered".
     */
    settles: boolean;
    /**
     * ‼️ X-77 — Is this intent somebody's REPLY, as opposed to a statement
     * that happens to settle things?
     *
     * A `response` and a `concede` are answers: they are the addressee's to
     * give, and a participant the question was never put to cannot give one —
     * without this, any bystander could settle a thread by naming it, and the
     * open count would say it had been answered by a turn nobody asked for.
     *
     * A `synthesis` settles what it names and is NOT one of these: it draws
     * the room together and is nobody's reply, so the addressee rule would be
     * wrong for it. Declared here rather than listed at the check, so the
     * next intent decides its own answer to this.
     */
    answers?: boolean;
    /** one line, shown in the planner's menu and readable by a person */
    describe: string;
    /** what the speaker is told it is doing, in the prompt this builds */
    charge: string;
}

export const MESSAGE_INTENTS: Record<MessageIntent, MessageIntentKind> = {
    proposal: {
        needsRefs: false, awaits: false, settles: false,
        describe: 'put forward an approach or an answer of your own',
        charge: 'State your own position on the question below. Be concrete enough that somebody '
            + 'can disagree with a specific part of it.'
    },
    question: {
        needsRefs: false, awaits: true, settles: false,
        describe: 'ask another participant something you need answered',
        charge: 'Ask what you need to know. One question, specific enough to be answered.'
    },
    challenge: {
        needsRefs: true, awaits: true, settles: false,
        describe: 'say what is wrong with a named message, and why',
        charge: 'Say what is wrong with what was said below. Name the part you disagree with and '
            + 'give the reason — a challenge that does not point at a specific claim cannot be answered.'
    },
    response: {
        needsRefs: true, awaits: false, settles: true, answers: true,
        describe: 'answer a named question or challenge',
        charge: 'Answer what was put to you below. Address it directly: if you accept part of it and '
            + 'reject the rest, say which is which.'
    },
    evidence: {
        needsRefs: false, awaits: false, settles: false,
        describe: 'bring in something checkable — an output, a measurement, a file',
        charge: 'Bring the evidence. Point at what can be checked — a result, a measurement, a file — '
            + 'and say what it shows. Do not argue from it; let it stand.'
    },
    concede: {
        needsRefs: true, awaits: false, settles: true, answers: true,
        describe: 'accept a named point you had been arguing against',
        charge: 'Say plainly which part you now accept and why. A concession is worth recording '
            + 'exactly because it is specific — do not soften it into agreement in general.'
    },
    synthesis: {
        needsRefs: true, awaits: false, settles: true,
        describe: 'draw together named messages into where the discussion has got to',
        charge: 'Draw together what was actually said below. Every claim you make about somebody\'s '
            + 'position must be traceable to one of the messages you were given — where they still '
            + 'disagree, say so rather than smoothing it over.'
    },
    vote: {
        needsRefs: true, awaits: false, settles: true,
        describe: 'state a choice between named options, with a reason and a confidence',
        charge: 'State your choice between what is below, in one line, with the reason and how sure '
            + 'you are. A vote is a position, not a summary of the discussion.'
    }
};

export const MESSAGE_INTENT_NAMES = Object.keys(MESSAGE_INTENTS) as MessageIntent[];

/** `proposal | question | challenge | …` — the menu, built from the same table
 *  the parser dispatches on, so the two cannot drift apart. */
export function messageIntentMenu(): string {
    return MESSAGE_INTENT_NAMES.join(' | ');
}

/**
 * ‼️ X-77 (U-65) — THE FLAGS A SURFACE NEEDS, FROM THE TABLE THAT OWNS THEM.
 *
 * The Missions page carried its OWN copy of "which intents settle a thread"
 * and it said `response | concede` — while this registry has said `synthesis`
 * and `vote` settle too since M-20. The same transcript therefore read as
 * closed in the core and the bridge and as unanswered in the room, from one
 * record. Small enough to ship whole; there is no second copy to drift.
 */
export function intentFlags(): Record<MessageIntent, { awaits: boolean; settles: boolean; answers: boolean }> {
    const out = {} as Record<MessageIntent, { awaits: boolean; settles: boolean; answers: boolean }>;
    for (const name of MESSAGE_INTENT_NAMES) {
        const k = MESSAGE_INTENTS[name];
        out[name] = { awaits: k.awaits, settles: k.settles, answers: k.answers === true };
    }
    return out;
}

export function intentKind(intent: string): MessageIntentKind | undefined {
    return Object.prototype.hasOwnProperty.call(MESSAGE_INTENTS, intent)
        ? MESSAGE_INTENTS[intent as MessageIntent]
        : undefined;
}

/**
 * ‼️ HOW THE SPEAKER'S LANE WAS CARRIED — and the reason it is recorded rather
 * than assumed.
 *
 * When the same participant speaks twice, the second turn should CONTINUE the
 * first one's conversation: same session, the agent still holding everything it
 * said and read. That is a real resume and the engines this codebase has
 * measured all support one. When it is not available — a CLI profile, an engine
 * with no resume vocabulary, a first turn — the speaker gets a NEW session and
 * the earlier exchange handed to it as text.
 *
 * Both work. They are not the same thing, and a surface that labels the second
 * one "resumed" is claiming continuity the run does not have.
 */
export type LaneCarry = 'new' | 'resumed' | 'handoff';

export type MessageState = 'pending' | 'delivered' | 'failed' | 'cancelled';

export interface MissionMessage {
    /** `m1`, `m2`… unique within the run and never reused */
    id: string;
    conversationId: string;
    /** the decision node that ordered this turn — the edge back to the lead */
    sourceActionId?: string;
    /** agent id of the speaker; `lead` when the lead speaks in its own name */
    from: string;
    fromName?: string;
    /**
     * Who it is addressed to. EMPTY MEANS EVERYONE in the conversation — the
     * one-to-many case is ordinary here, not a special mode.
     */
    to: string[];
    intent: MessageIntent;
    /** the message ids this one is about — checked against this conversation */
    refs: string[];
    /**
     * ‼️ X-77 — HOW MUCH OF THE RECORD THIS SPEAKER WAS SHOWN.
     *
     * There was no such choice: a new or handed-over lane always got the WHOLE
     * delivered history and a resumed one always got everything after its own
     * last turn, with `refs` doing nothing but emphasis. So a lead could not
     * ask one participant a question without also handing it every position
     * already taken — which is exactly what an independent opinion is not.
     *
     * `all` · `refs-only` (just the messages it names) · `since` (only what is
     * new since this speaker last spoke). On the RECORD, because "what did it
     * actually see?" is unanswerable afterwards otherwise, and a turn read
     * three months later is read as though it had seen everything.
     */
    visibility?: MessageVisibility;
    /** the speaker's own words, bounded; the record does not depend on a file */
    excerpt?: string;
    /** where the full text lives — the speaking task's archived output */
    contentRef?: string;
    /** the task that produced it, and the session it ran in: the deep links */
    taskId?: string;
    sessionId?: string;
    carried?: LaneCarry;
    /** what the lead asked this speaker for, in the lead's own words */
    ask?: string;
    orderedAt: number;
    settledAt?: number;
    state: MessageState;
    /** why it is not `delivered` — the failure's own sentence, unedited */
    note?: string;
}

export interface MissionConversation {
    /** `c1`, `c2`… unique within the run */
    id: string;
    /** the decision node that opened it */
    sourceActionId?: string;
    /** what this conversation is FOR, in the lead's words — one line */
    objective: string;
    /** agent ids that may speak here; the lead may always speak */
    participants: string[];
    openedAt: number;
    closedAt?: number;
    /** why it ended — stated, never inferred from "nothing happened since" */
    closeReason?: string;
}

export function newConversationId(existing: readonly { id: string }[]): string {
    return `c${existing.length + 1}`;
}

export function newMessageId(existing: readonly { id: string }[]): string {
    return `m${existing.length + 1}`;
}

/**
 * ‼️ ONE TURN AT A TIME PER PARTICIPANT, PER CONVERSATION.
 *
 * Two turns of the same agent in flight on the same conversation is not
 * parallelism, it is a race: the second one is briefed on a record the first
 * one is about to change, and on a resuming engine both would try to continue
 * the same session — which the task layer's own session lock would refuse
 * halfway through, after the round had already been ordered.
 *
 * Different participants speaking at once IS allowed, and is how an independent
 * first round works.
 */
export function participantBusy(
    messages: readonly MissionMessage[],
    conversationId: string,
    from: string
): MissionMessage | undefined {
    return messages.find(m =>
        m.conversationId === conversationId && m.from === from && m.state === 'pending');
}

/** The messages of one conversation, in the order they were ordered. */
export function conversationMessages(
    messages: readonly MissionMessage[],
    conversationId: string
): MissionMessage[] {
    return messages.filter(m => m.conversationId === conversationId);
}

/**
 * ‼️ WHAT IS STILL UNANSWERED — the fact that makes a conversation more than a
 * turn count.
 *
 * A question or a challenge is open until a message that SETTLES refers to it.
 * "Six messages happened" says nothing; "two challenges nobody answered" is the
 * thing a lead has to act on and a reader wants to see.
 */
export function openThreads(
    messages: readonly MissionMessage[],
    conversationId: string
): MissionMessage[] {
    const all = conversationMessages(messages, conversationId);
    const settled = new Set<string>();
    for (const m of all) {
        if (m.state !== 'delivered') { continue; }
        if (!intentKind(m.intent)?.settles) { continue; }
        for (const r of m.refs) { settled.add(r); }
    }
    return all.filter(m =>
        m.state === 'delivered'
        && intentKind(m.intent)?.awaits === true
        && !settled.has(m.id));
}

/** ‼️ X-77 — the three honest answers to "what was this speaker shown?". */
export type MessageVisibility = 'all' | 'refs-only' | 'since';
export const MESSAGE_VISIBILITY: MessageVisibility[] = ['all', 'refs-only', 'since'];

export interface MessageRequest {
    conversationId: string;
    from: string;
    to: string[];
    intent: string;
    refs: string[];
    ask?: string;
}

/**
 * ‼️ EVERY REASON A SPEAKING TURN CAN BE REFUSED, IN ONE PLACE — and each one
 * is a sentence the lead can act on rather than a rejection it has to guess at.
 *
 * These are checked before anything is spawned, because all of them are facts
 * the run already holds. A refused turn costs a round; a turn that runs on a
 * bad ref costs a delegation and produces a message about nothing.
 */
export function refuseMessage(
    req: MessageRequest,
    conv: MissionConversation | undefined,
    messages: readonly MissionMessage[],
    knownAgents: readonly { id: string; name: string }[]
): string {
    if (!conv) {
        return `There is no conversation "${req.conversationId}" in this run. `
            + 'Open one by naming its purpose and its participants, or name one that exists.';
    }
    if (conv.closedAt) {
        return `Conversation "${conv.id}" is closed (${conv.closeReason || 'no reason recorded'}). `
            + 'A closed conversation is a finished record — open a new one if there is more to say.';
    }
    const kind = intentKind(req.intent);
    if (!kind) {
        return `Unknown message intent "${req.intent}" (use ${messageIntentMenu()}).`;
    }
    if (!conv.participants.includes(req.from) && req.from !== 'lead') {
        return `"${req.from}" is not a participant in conversation "${conv.id}" `
            + `(${conv.participants.join(', ') || 'nobody yet'}). A conversation's participants are `
            + 'fixed when it opens — open a new one if somebody else needs to be in it.';
    }
    if (req.from !== 'lead' && !knownAgents.some(a => a.id === req.from)) {
        return `"${req.from}" is not an agent in this run's pool.`;
    }
    const strangers = req.to.filter(t => t !== 'lead' && !conv.participants.includes(t));
    if (strangers.length) {
        return `Addressed to ${strangers.map(s => `"${s}"`).join(', ')}, who ${strangers.length > 1 ? 'are' : 'is'} `
            + `not in conversation "${conv.id}". Leave "to" empty to address everyone in it.`;
    }
    const busy = participantBusy(messages, conv.id, req.from);
    if (busy) {
        return `"${req.from}" is already speaking in this conversation (${busy.id}). `
            + 'Wait for that turn to come back, or have somebody else speak.';
    }
    const own = conversationMessages(messages, conv.id);
    const said = own.filter(m => m.state === 'delivered');
    const missing = req.refs.filter(r => !own.some(m => m.id === r));
    if (missing.length) {
        return `No message of conversation "${conv.id}" carries the id ${missing.map(m => `"${m}"`).join(', ')}. `
            + (said.length
                ? `Its messages are: ${said.slice(-8).map(m => m.id).join(', ')}.`
                : 'It has none yet — the first turn cannot refer to anything.');
    }
    // ‼️ X-77 — A REF POINTS AT SOMETHING THAT WAS ACTUALLY SAID.
    //
    // The check above asked only whether the id EXISTED in the conversation,
    // and an ordered turn has an id from the moment it is ordered. So a
    // pending, failed or cancelled turn's id satisfied the "needsRefs" rule —
    // and then the prompt builder, which materialises only DELIVERED messages,
    // silently dropped it. The speaker was told to answer something it was
    // never shown, and the record said it had been given it.
    const unsaid = req.refs.filter(r => !said.some(m => m.id === r));
    if (unsaid.length) {
        const state = (id: string) => own.find(m => m.id === id)?.state ?? 'unknown';
        return `${unsaid.map(m => `"${m}"`).join(', ')} ${unsaid.length > 1 ? 'were' : 'was'} ordered but never `
            + `said (${unsaid.map(m => `${m}: ${state(m)}`).join(', ')}), so there is nothing to answer. `
            + (said.length
                ? `What has actually been said: ${said.slice(-8).map(m => m.id).join(', ')}.`
                : 'Nothing has been said in it yet.');
    }
    if (kind.needsRefs && !req.refs.length) {
        return `A "${req.intent}" is about something somebody said, so it has to name it: `
            + 'put the message id(s) it answers in "refs". '
            + (said.length ? `This conversation has ${said.map(m => m.id).join(', ')}.` : 'Nothing has been said yet.');
    }
    // ‼️ X-77 — AN ANSWER IS THE ADDRESSEE'S TO GIVE.
    //
    // Nothing tied the intent to the speaker's place in the exchange, so any
    // participant could settle a question or a challenge that had been put to
    // somebody else — and `openThreads` would then show it answered, by a turn
    // that was never asked. Empty `to` means EVERYONE, which is the ordinary
    // case, so the rule only bites on a turn that was addressed narrowly.
    //
    // `answers` is declared in the registry rather than listed here: a
    // `synthesis` also settles what it names, but it draws the room together
    // and is nobody's reply, so the addressee rule would be wrong for it.
    if (kind.answers) {
        for (const r of req.refs) {
            const target = said.find(m => m.id === r);
            if (!target || !intentKind(target.intent)?.awaits) { continue; }
            if (target.from === req.from) {
                const who = knownAgents.find(a => a.id === req.from)?.name ?? req.from;
                return `${r} is ${who}'s own ${target.intent} — answering it would settle a thread `
                    + 'nobody else ever got to. Have the participant it was put to answer it.';
            }
            if (target.to.length && !target.to.includes(req.from)) {
                const who = knownAgents.find(a => a.id === req.from)?.name ?? req.from;
                const meant = target.to
                    .map(t => knownAgents.find(a => a.id === t)?.name ?? t).join(', ');
                return `${r} was put to ${meant}, not to ${who}, so ${who} cannot answer it. `
                    + `${who} may "challenge" or "propose" in its own name, or ${meant} can respond.`;
            }
        }
    }
    // ‼️ THE SAME TURN ORDERED AGAIN WITH NOTHING SAID IN BETWEEN — a loop the
    // generic guard cannot see. The work-level dup key hashes agent + prompt,
    // and a repeated speaking turn builds a DIFFERENT prompt: the second one
    // carries a resumed lane's preamble and a record that has grown, so the
    // strings never match and the lead can re-order the identical turn round
    // after round, paying for each one. What makes it a loop is a fact of the
    // record rather than of the prompt, so it is refused here, by naming the
    // message that already is this turn.
    // ‼️ X-77 — AND THE KEY IS THE WHOLE TURN. It skipped `to` entirely, so
    // the same question put to a DIFFERENT participant read as the identical
    // turn and was refused; and it compared refs in written order, so naming
    // the same two messages the other way round read as a different turn and
    // was allowed. Both halves of that were wrong in opposite directions.
    const keyOf = (xs: readonly string[]) => [...xs].sort().join(',');
    const last = said[said.length - 1];
    if (last && last.from === req.from && last.intent === req.intent
        && (last.ask ?? '') === (req.ask ?? '')
        && keyOf(last.to) === keyOf(req.to)
        && keyOf(last.refs) === keyOf(req.refs)) {
        const who = knownAgents.find(a => a.id === req.from)?.name ?? req.from;
        return `${who} already sent exactly this in "${conv.id}" (${last.id}), and nothing has been `
            + 'said since — ordering it again would buy the same turn twice. Ask something else, '
            + 'have another participant answer it, or close the conversation.';
    }
    return '';
}

/**
 * ‼️ WHAT THE SPEAKER ACTUALLY SEES — the real messages, never a summary.
 *
 * This is the whole mechanism. The lead names ids; the engine attaches the text
 * that was really produced under those ids. There is no parameter here through
 * which a lead could describe what somebody said, which is what makes "B saw
 * A's message" a property of the code rather than a hope about the prompt.
 *
 * `carried` changes what is included, and the difference is not cosmetic. On a
 * resumed lane the speaker is already holding everything it said and read, so
 * repeating the conversation would pay for the same tokens again — it gets only
 * what is NEW to it. On a fresh lane it gets the exchange it is joining.
 */
export function buildSpeakerPrompt(opts: {
    conversation: MissionConversation;
    intent: MessageIntent;
    speakerName: string;
    /** the messages named in `refs`, in record order, with their real text */
    referenced: readonly MissionMessage[];
    /** everything else it should see; empty on a resumed lane */
    context?: readonly MissionMessage[];
    /** the lead's own words about what it wants from this turn */
    ask?: string;
    /**
     * ‼️ Who this turn is addressed to, EMPTY MEANING EVERYONE — the same field
     * the record carries. Without it the speaker writes to the room while the
     * transcript says "Ada → Rev", and the row is claiming an address the turn
     * was never told about.
     */
    to?: readonly string[];
    goal?: string;
    carried: LaneCarry;
    /**
     * ‼️ Somebody else is answering the same thing at the same moment, and
     * neither will see the other's answer before writing. The speaker is TOLD
     * so — not as a courtesy but because it changes what a good turn is: this
     * is the round where an independent position is wanted, and an agent that
     * thought it was replying to a silence would hedge towards agreement with
     * nobody.
     */
    independent?: boolean;
    /**
     * Anything the turn is speaking UNDER that this record does not know about
     * — M-20 puts a council's question, chair and vote options here. Kept as
     * text so a conversation never has to learn what a council is.
     */
    mandate?: string;
    /** how the speaker names the others — id to display name */
    nameOf?: (id: string) => string;
    /** ‼️ X-77 — how much of the record `context` is; said out loud so the
     *  speaker does not read a deliberate silence as an empty room. */
    visibility?: MessageVisibility;
}): string {
    const kind = MESSAGE_INTENTS[opts.intent];
    const name = (id: string) => (opts.nameOf?.(id) ?? id);
    const block = (m: MissionMessage) =>
        `### [${m.id}] ${name(m.from)} — ${m.intent}`
        + (m.refs.length ? ` (on ${m.refs.join(', ')})` : '')
        + `\n${(m.excerpt ?? '').trim() || '(this turn produced no text)'}`;

    const parts: string[] = [];
    parts.push(`# You are speaking in a conversation between agents`);
    parts.push(kind.charge);
    parts.push(`\n## What this conversation is for\n${opts.conversation.objective.trim()}`);
    if (opts.goal?.trim()) {
        parts.push(`\n## The objective it serves\n${opts.goal.trim()}`);
    }
    // ‼️ WHO IS IN THE ROOM, AND WHICH OF THEM THIS TURN IS FOR. Neither is
    // inferable from the exchange on a first turn — there is no exchange yet —
    // and both are already facts of the record: `to` is stored on the message
    // and printed on its row. A speaker not told it was addressed to one
    // participant writes to the room, and the row that says "Ada → Rev" is then
    // describing an address nobody made. One-to-many is the ordinary case here,
    // which is exactly why the narrow case has to be said out loud.
    // ‼️ X-77 — AND HOW MUCH OF THE RECORD IT IS BEING SHOWN. A speaker given
    // only what it was asked about will otherwise write as though it had read
    // the room and simply found it empty.
    if (opts.visibility === 'refs-only') {
        parts.push('\n## What you are being shown\nOnly the message(s) named below. '
            + 'The rest of this conversation is deliberately not in front of you: answer from '
            + 'what you are given and your own knowledge, and do not guess at what else was said.');
    } else if (opts.visibility === 'since' && opts.carried !== 'resumed') {
        parts.push('\n## What you are being shown\nOnly what is new since your last turn here.');
    }
    const cast = opts.conversation.participants;
    if (cast.length > 1) {
        parts.push('\n## Who is in it\n'
            + cast.map(p => `- ${name(p)}${name(p) === opts.speakerName ? ' (you)' : ''}`).join('\n'));
    }
    const addressed = (opts.to ?? []).filter(t => name(t) !== opts.speakerName);
    if (addressed.length) {
        parts.push(`\n## Who you are addressing\n${addressed.map(name).join(', ')}. `
            + 'The others in the conversation read this too — the record is shared — but write it to '
            + `${addressed.length > 1 ? 'them' : addressed.map(name)[0]}.`);
    } else if (cast.length > 1) {
        parts.push('\n## Who you are addressing\nEveryone in the conversation.');
    }
    if (opts.carried === 'resumed') {
        parts.push('\n## Where you are\n'
            + 'This is the same conversation you were in a moment ago — you already hold what you '
            + 'said and what you were shown. What follows is only what is new since your last turn.');
    } else if (opts.carried === 'handoff') {
        parts.push('\n## Where you are\n'
            + 'You have spoken in this conversation before, but not in this session — the exchange '
            + 'is reproduced below in full rather than continued, so read it as the record it is.');
    }
    if (opts.independent) {
        parts.push('\n## You are not the only one answering this\n'
            + 'Another participant is writing on this at the same moment and neither of you will see '
            + 'the other before you send. That is deliberate: an independent position is what is '
            + 'wanted here. Say what you actually think rather than what you expect will be agreed.');
    }
    if (opts.mandate?.trim()) { parts.push(opts.mandate.trim().startsWith('\n') ? opts.mandate : `\n${opts.mandate}`); }
    if (opts.referenced.length) {
        parts.push(`\n## What you are ${opts.intent === 'response' ? 'answering' : 'addressing'}\n`
            + opts.referenced.map(block).join('\n\n'));
    }
    const rest = (opts.context ?? []).filter(m => !opts.referenced.some(r => r.id === m.id));
    if (rest.length) {
        parts.push(`\n## The rest of the exchange, in order\n${rest.map(block).join('\n\n')}`);
    }
    parts.push(`\n## What the lead wants from this turn\n`
        + (opts.ask?.trim() || '(the lead named nothing specific — use your judgement)'));
    parts.push('\n## How to reply\n'
        + 'Write your message to the other participants and nothing else — no preamble about being an '
        + 'agent, no restating of what you were given. This text is shown to them and to the user '
        + 'exactly as you write it.');
    return parts.join('\n');
}

/** One line for a message — the transcript's SHORTHAND row and the ledger's. */
export function messageLine(m: MissionMessage, nameOf?: (id: string) => string): string {
    const name = (id: string) => (nameOf?.(id) ?? id);
    const to = m.to.length ? m.to.map(name).join(', ') : 'all';
    const head = `[${m.id}] ${name(m.from)} → ${to} · ${m.intent}`
        + (m.refs.length ? ` (on ${m.refs.join(', ')})` : '');
    if (m.state === 'delivered') {
        const text = (m.excerpt ?? '').replace(/\s+/g, ' ').trim();
        return `${head} — ${text.length > 160 ? `${text.slice(0, 157)}…` : (text || '(no text)')}`;
    }
    return `${head} — ${m.state}${m.note ? `: ${m.note}` : ''}`;
}

export interface ConversationDigest {
    conversationId: string;
    objective: string;
    participants: string[];
    total: number;
    open: number;
    text: string;
}

/**
 * ‼️ WHAT THE LEAD GETS BETWEEN ROUNDS — bounded on purpose.
 *
 * The planner is resumed each round, so anything put in front of it is paid for
 * once and then carried; a whole transcript re-sent every round is paid for
 * once per round for the rest of the run, and grows while it does it. What the
 * lead actually needs to decide the next turn is: what is still unanswered, who
 * spoke last and roughly what they said, and the ids to name. Everything else
 * is one id away — and the user's surfaces, which are not paying per token, get
 * the full text.
 */
export function conversationDigest(
    conv: MissionConversation,
    messages: readonly MissionMessage[],
    opts?: { recent?: number; nameOf?: (id: string) => string }
): ConversationDigest {
    const all = conversationMessages(messages, conv.id);
    const open = openThreads(messages, conv.id);
    const recent = Math.max(1, opts?.recent ?? 4);
    const tail = all.slice(-recent);
    const lines: string[] = [];
    lines.push(`## Conversation ${conv.id} — ${conv.objective}`);
    lines.push(`Participants: ${conv.participants.map(p => (opts?.nameOf?.(p) ?? p)).join(', ') || '(none)'}`
        + ` · ${all.length} message(s)`
        + (conv.closedAt ? ` · closed (${conv.closeReason || 'no reason recorded'})` : ''));
    if (open.length) {
        lines.push('', `Unanswered (${open.length}):`);
        for (const m of open) { lines.push(`- ${messageLine(m, opts?.nameOf)}`); }
    } else if (all.some(m => m.state === 'delivered')) {
        lines.push('', 'Nothing is left unanswered.');
    }
    if (tail.length) {
        lines.push('', `Last ${tail.length} of ${all.length}:`);
        for (const m of tail) { lines.push(`- ${messageLine(m, opts?.nameOf)}`); }
    }
    if (all.length > tail.length) {
        lines.push('', `Ask for the full text of any message by its id — ${all.map(m => m.id).join(', ')}.`);
    }
    return {
        conversationId: conv.id,
        objective: conv.objective,
        participants: [...conv.participants],
        total: all.length,
        open: open.length,
        text: lines.join('\n')
    };
}
