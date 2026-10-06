/**
 * U-197 — THE DOORS OF READING ON DEMAND: `alerts.readNow` and `alerts.reading`.
 *
 * One body for every surface that asks for a reading (the bridge today; the
 * transcript's and the Console's 🔊 next), so what is read, in which voice,
 * and how the one channel records it are the same whoever asks. What to read
 * is `readTarget` / `readingText` (reader.ts); the player is `DialogueSpeaker`.
 *
 * ‼️ An ask is NOT put through Mute all / Quiet hours / Silent: those stop
 * noise nobody chose, and asking for a reading is a choice.
 */
import { BridgeRefusal, BridgeRegistry, optStr } from './bridge';
import { readAskOf, readingKeyNow, readingParagraphs, ReadingSource, readingTimeoutMs, readTarget } from './reader';
import { clampRate, PlayState, ReadingAction, READING_ACTIONS } from './readingPlayer';
import type { ReadableStep } from './sessionRead';
import type { SpeakConfig } from './speech';
import type { SpeechPhrases } from './speechPhrases';
import type { DialogueSpeaker } from './turnAlerts';
import type { ReadingNow } from './soundCard';

export interface Conversation { sessionId: string; label: string; steps: readonly ReadableStep[] }

export interface ReaderDeps {
    /** One conversation by id, 8-character prefix or transcript path — steps unclipped, as the transcript page parses them. */
    conversation(ref: string): Conversation | { error: string };
    /** The conversation's own voice; '' = none chosen. */
    voiceOf(sessionId: string): string;
    fleet(): SpeakConfig;
    /** A chosen voice wins; Auto ('') takes an installed voice of the text's language, with that language's inserted words. */
    speechFor(want: string, text: string): Promise<{ voice: string; words: SpeechPhrases }>;
    dialogue: Pick<DialogueSpeaker, 'speak' | 'speaking' | 'state' | 'act' | 'setRate'>;
    readingNow: Pick<ReadingNow, 'start' | 'source'>;
    /** Cut the reading short — the same stop as `alerts.read stop` and Sound: Stop Reading. */
    stop(): boolean;
}

export interface ReadNowAnswer {
    reading: true; sessionId: string; label: string; msg?: string; turn?: number;
    /** how many steps the reading spans */
    steps: number;
    surface: string; chars: number; voice: string;
}

/** Start one reading somebody asked for; refuses by name when there is nothing to read. */
export async function readNow(deps: ReaderDeps, args: Record<string, unknown>, surface: string): Promise<ReadNowAnswer> {
    const ask = readAskOf(args);
    if ('error' in ask) { throw new BridgeRefusal(ask.error, { step: 'ask' }); }
    const conv = ask.sessionId ? deps.conversation(ask.sessionId) : null;
    if (conv && 'error' in conv) { throw new BridgeRefusal(conv.error, { step: 'session' }); }
    let raw = '';
    let segments: { key: string; text: string }[] = [];
    let where: Pick<ReadingSource, 'msg' | 'turn'> = {};
    if (ask.kind === 'text') {
        raw = ask.text;
        segments = [{ key: '', text: raw }];
    } else {
        const t = readTarget((conv as Conversation).steps, ask);
        if ('error' in t) { throw new BridgeRefusal(t.error, { step: 'target' }); }
        raw = t.text;
        segments = t.segments;
        where = { msg: t.msg, ...(t.turn ? { turn: t.turn } : {}) };
    }
    const sessionId = conv ? conv.sessionId : '';
    const fleet = deps.fleet();
    const how = await deps.speechFor((sessionId && deps.voiceOf(sessionId)) || fleet.voice, raw);
    // U-199 — each step's paragraphs carry its key, so the page marks the step being read
    const paras: string[] = [], keys: string[] = [];
    for (const s of segments) {
        const ps = readingParagraphs(s.text, true, how.words);
        paras.push(...ps);
        keys.push(...ps.map(() => s.key));
    }
    if (!paras.length) { throw new BridgeRefusal('nothing in it can be spoken', { step: 'text' }); }
    const chars = paras.join(' ').length;
    const run = deps.dialogue.speak(paras, { ...fleet, voice: how.voice }, { timeoutMs: readingTimeoutMs(chars) });
    deps.readingNow.start(sessionId, run, { surface, ...where, ...(segments.length > 1 ? { keys } : {}) });
    return {
        reading: true, sessionId, label: conv ? conv.label : '', ...where, steps: segments.length,
        surface, chars, voice: how.voice || '(system default)'
    };
}

export interface ReadingStateAnswer {
    reading: boolean;
    speaking: boolean;
    source: ReadingSource | null;
    /** U-198 — where the player is; null while nothing plays */
    at: PlayState | null;
    /** U-199 — the step being read right now ('' for a text of your own) */
    key: string;
}

/** What is being read now: the source while a reading lasts, whether its player is speaking yet, and where it is. */
export function readingState(deps: Pick<ReaderDeps, 'dialogue' | 'readingNow'>): ReadingStateAnswer {
    const source = deps.readingNow.source;
    const at = deps.dialogue.state;
    return { reading: !!source, speaking: deps.dialogue.speaking, source, at, key: readingKeyNow(source, at) };
}

/**
 * U-198 — ONE BODY for every control of the reading now: the bridge's
 * `alerts.reading` and the Sound: Pause / Resume, Next and Previous commands.
 * `done` is false when nothing is being read or there is nowhere to go.
 */
export function readingAct(deps: Pick<ReaderDeps, 'dialogue' | 'readingNow' | 'stop'>, action: string, rate?: unknown): ReadingStateAnswer & { done: boolean } {
    const a = String(action ?? '').trim().toLowerCase();
    if (a && a !== 'stop' && !(READING_ACTIONS as readonly string[]).includes(a)) {
        throw new BridgeRefusal(`action "${a}" is not known — one of stop, ${READING_ACTIONS.join(', ')}`, { step: 'action' });
    }
    if (rate !== undefined && rate !== null && rate !== '' && clampRate(rate) === null) {
        throw new BridgeRefusal('rate is a number from -10 (slowest) to 10 (fastest)', { step: 'rate' });
    }
    let done = false;
    if (a === 'stop') { done = deps.stop(); } else if (a) { done = deps.dialogue.act(a as ReadingAction); }
    if (rate !== undefined && rate !== null && rate !== '' && a !== 'stop') { done = deps.dialogue.setRate(rate) || done; }
    return { done, ...readingState(deps) };
}

export function registerReaderOps(bridge: BridgeRegistry, deps: ReaderDeps): void {
    bridge.register([
        {
            op: 'alerts.readNow',
            describe: 'READ THIS NOW — read one answer, one turn, one step or a text of your own out loud on this machine, once. '
                + 'Unlike `alerts.read` (a session\'s switch that reads every turn as it ends, cut to the timeline\'s quote length) this reads the WHOLE text, cleaned for speech '
                + '(markdown, code, links), in the conversation\'s own voice or the fleet\'s. It is NOT silenced by Mute all, Quiet hours or Silent — an ask is a choice, not noise. '
                + 'There is one reading at a time: this cuts short whatever is being read, and anything newer cuts this. Stop it with `alerts.reading action=stop`. '
                + 'args: sessionId? (id, 8-character prefix or transcript path; required unless text) + exactly one of: msg? (a step\'s key, as `sessions.read` lists it), '
                + 'turn? (1-based — that turn\'s answer; with whole=true the whole turn: what was asked and everything the agent said in words), '
                + 'from? (a step\'s key — that step, then everything the agent said in words to the end of the conversation), '
                + 'last? (true — the newest answer; also what a sessionId alone reads), text? (your own text, e.g. a report for the user; '
                + 'with a sessionId it is read in that conversation\'s voice). Returns { reading, sessionId, label, msg?, turn?, steps, chars, voice } — '
                + 'while a reading of several steps goes on, `alerts.reading` names the one being read (`key`).',
            handler: (args) => readNow(deps, args as Record<string, unknown>, 'bridge')
        },
        {
            op: 'alerts.reading',
            describe: 'WHAT IS BEING READ ALOUD NOW, AND ITS CONTROLS — with no args: { reading, speaking, source: { sessionId, msg?, turn?, surface, keys? } | null, at, key }: '
                + '`key` = the step being read right now (on a reading of several steps it moves with the paragraphs); the conversation '
                + '(empty for a text of your own), the step\'s key, the turn, and who asked (`auto` = Read aloud, `bridge`, or a page); `speaking` turns true once the player runs; '
                + '`at` = { paragraph, paragraphs (0-based of n), sentence, word, wordLen (characters within the paragraph), paused, rate, live } — `live` is false where the '
                + 'backend reads a paragraph at a time (macOS, Linux): there pause and rate restart the paragraph and the word is not known. '
                + 'args: action? (stop · pause · resume · toggle · next · prev — the same body as Sound: Stop Reading, Sound: Pause / Resume Reading, Sound: Next Paragraph and '
                + 'Sound: Previous Paragraph; prev restarts the paragraph once it is past its first sentence, else goes back one), rate? (-10…10, this reading only, '
                + 'from the sentence it is on — the setting is not changed). Answers `done` (false: nothing is being read, or there is nowhere to go) with the state after it.',
            handler: (args) => {
                const action = optStr(args, 'action');
                const rate = (args as { rate?: unknown }).rate;
                return action || rate !== undefined ? readingAct(deps, action ?? '', rate) : readingState(deps);
            }
        }
    ]);
}
