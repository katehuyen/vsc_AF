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
import { paragraphHead, readAskOf, readingKeyNow, readingParagraphs, ReadingSource, readingTimeoutMs, readTarget } from './reader';
import { clampRate, PlayState, ReadingAction, READING_ACTIONS } from './readingPlayer';
import { ReadingPrefs, readingVoiceWant, readingWords } from './readingPrefs';
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
    /** the announcement's settings — a reading borrows only their volume */
    fleet(): SpeakConfig;
    /** U-205 — the reading's own voice, speed, Read aloud length and code (`agentFarm.alerts.reading`) */
    reading(): ReadingPrefs;
    /**
     * A chosen voice wins; Auto ('') takes an installed voice of the text's language, with that language's inserted words.
     * `lang`: the language those words are in — with Auto, the text's own (U-209 hands it to the phone's voice).
     */
    speechFor(want: string, text: string): Promise<{ voice: string; words: SpeechPhrases; lang?: string }>;
    dialogue: Pick<DialogueSpeaker, 'speak' | 'speaking' | 'state' | 'act' | 'setRate'>;
    readingNow: Pick<ReadingNow, 'start' | 'source' | 'headOf'>;
    /** Cut the reading short — the same stop as `alerts.read stop` and Sound: Stop Reading. */
    stop(): boolean;
}

export interface ReadNowAnswer {
    reading: true; sessionId: string; label: string; msg?: string; turn?: number;
    /** how many steps the reading spans */
    steps: number;
    surface: string; chars: number; voice: string;
}

/** A reading made ready to be said: its paragraphs, each one's step key, and how it is said. */
interface Prepared {
    conv: Conversation | null;
    where: Pick<ReadingSource, 'msg' | 'turn'>;
    steps: number;
    paras: string[];
    keys: string[];
    how: { voice: string; lang?: string };
    rate: number;
}

/**
 * What one ask reads, cleaned for speech — ONE body for this machine's voice and the phone's.
 * `want`: the voice asked for — the conversation's, else the reading's; '' (Auto) takes the text's language.
 */
async function prepareReading(deps: ReaderDeps, args: Record<string, unknown>, want: (sessionId: string) => string): Promise<Prepared> {
    const ask = readAskOf(args);
    if ('error' in ask) { throw new BridgeRefusal(ask.error, { step: 'ask' }); }
    const conv = ask.sessionId ? deps.conversation(ask.sessionId) : null;
    if (conv && 'error' in conv) { throw new BridgeRefusal(conv.error, { step: 'session' }); }
    let raw = '';
    let segments: { key: string; text: string }[] = [];
    let where: Pick<ReadingSource, 'msg' | 'turn'> = {};
    if (ask.kind === 'text') {
        raw = ask.text;
        segments = [{ key: ask.key ?? '', text: raw }];
        if (ask.key) { where = { msg: ask.key }; }
    } else {
        const t = readTarget((conv as Conversation).steps, ask);
        if ('error' in t) { throw new BridgeRefusal(t.error, { step: 'target' }); }
        raw = t.text;
        segments = t.segments;
        where = { msg: t.msg, ...(t.turn ? { turn: t.turn } : {}) };
    }
    const sessionId = conv ? conv.sessionId : '';
    const prefs = deps.reading();
    const how = await deps.speechFor(want(sessionId), raw);
    const words = readingWords(how.words, prefs);
    // U-199 — each step's paragraphs carry its key, so the page marks the step being read
    const paras: string[] = [], keys: string[] = [];
    for (const s of segments) {
        const ps = readingParagraphs(s.text, true, words);
        paras.push(...ps);
        keys.push(...ps.map(() => s.key));
    }
    if (!paras.length) { throw new BridgeRefusal('nothing in it can be spoken', { step: 'text' }); }
    return { conv, where, steps: segments.length, paras, keys, how, rate: prefs.rate };
}

/** Start one reading somebody asked for; refuses by name when there is nothing to read. */
export async function readNow(deps: ReaderDeps, args: Record<string, unknown>, surface: string): Promise<ReadNowAnswer> {
    const ready = await prepareReading(deps, args, sid => readingVoiceWant(sid ? deps.voiceOf(sid) : '', deps.reading()));
    const { conv, where, steps, paras, keys, how } = ready;
    const sessionId = conv ? conv.sessionId : '';
    const chars = paras.join(' ').length;
    const run = deps.dialogue.speak(paras, { ...deps.fleet(), voice: how.voice, rate: ready.rate }, { timeoutMs: readingTimeoutMs(chars) });
    deps.readingNow.start(sessionId, run, { surface, ...where, ...(steps > 1 ? { keys } : {}) }, paras.map(p => paragraphHead(p)));
    return {
        reading: true, sessionId, label: conv ? conv.label : '', ...where, steps,
        surface, chars, voice: how.voice || '(system default)'
    };
}

/** U-209 — a reading for a device that says it with its own voice. */
export interface SpokenReading {
    sessionId: string; label: string; msg?: string; turn?: number;
    /** what is said, paragraph by paragraph, cleaned exactly as this machine would say it */
    paragraphs: string[];
    /** each paragraph's step key — what a page marks while that paragraph is said */
    keys: string[];
    /** each paragraph's first words — what a page finds in the step and marks (U-206) */
    heads: string[];
    /** the text's language ('' when it gives no sign); the device's own voice for it says it */
    lang: string;
    /** the reading's speed, −10 … 10 */
    rate: number;
}

/**
 * U-209 — THE PHONE'S READING: the same ask, prepared exactly as this machine would read it — the
 * same cleaning, the same inserted words, the text's own language (Auto: the PC's chosen voices mean
 * nothing to a phone) — and handed back, never spoken here.
 */
export async function spokenReading(deps: ReaderDeps, args: Record<string, unknown>): Promise<SpokenReading> {
    const p = await prepareReading(deps, args, () => '');
    const keyOf = (i: number): string => (p.steps > 1 ? p.keys[i] : undefined) ?? p.where.msg ?? '';
    return {
        sessionId: p.conv ? p.conv.sessionId : '', label: p.conv ? p.conv.label : '', ...p.where,
        paragraphs: p.paras, keys: p.paras.map((_, i) => keyOf(i)), heads: p.paras.map(x => paragraphHead(x)),
        lang: p.how.lang ?? '', rate: p.rate
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
 * U-199 — what a page draws on its steps (🔊 · ■ · ▶, media/afReadAloud.js); null while nothing is read.
 * U-206 — `head`: the first words of the paragraph being read, which the page finds in the step's text and marks.
 */
export function readingView(deps: Pick<ReaderDeps, 'dialogue' | 'readingNow'> | undefined): { sessionId: string; key: string; paused: boolean; head: string } | null {
    const s = deps ? readingState(deps) : null;
    if (!deps || !s?.source) { return null; }
    const head = s.at && typeof deps.readingNow.headOf === 'function' ? deps.readingNow.headOf(s.at.paragraph) : '';
    return { sessionId: s.source.sessionId, key: s.key, paused: !!s.at?.paused, head };
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
                + '(markdown, code, links), in the conversation\'s own voice, else the reading\'s voice, speed and way of saying code (`alerts.readingSettings`). It is NOT silenced by Mute all, Quiet hours or Silent — an ask is a choice, not noise. '
                + 'There is one reading at a time: this cuts short whatever is being read, and anything newer cuts this. Stop it with `alerts.reading action=stop`. '
                + 'args: sessionId? (id, 8-character prefix or transcript path; required unless text) + exactly one of: msg? (a step\'s key, as `sessions.read` lists it), '
                + 'turn? (1-based — that turn\'s answer; with whole=true the whole turn: what was asked and everything the agent said in words), '
                + 'from? (a step\'s key — that step, then everything the agent said in words to the end of the conversation), '
                + 'last? (true — the newest answer; also what a sessionId alone reads, and what Sound: Read Last Answer runs), text? (your own text, e.g. a report for the user; '
                + 'with a sessionId it is read in that conversation\'s voice; key? names the text - `alerts.reading` then answers it as the step being read). Returns { reading, sessionId, label, msg?, turn?, steps, chars, voice } — '
                + 'while a reading of several steps goes on, `alerts.reading` names the one being read (`key`).',
            handler: (args) => readNow(deps, args as Record<string, unknown>, 'bridge')
        },
        {
            op: 'alerts.readText',
            describe: 'THE TEXT A READING WOULD SAY, NOT SAID — for a device that reads it with its own voice (the phone app\'s 🔊 asks this). '
                + 'The same args as `alerts.readNow` (sessionId? + one of msg, turn, from, last, text; key?), prepared the same way (markdown, code, links spoken; '
                + 'the reading\'s length and code settings) but in the text\'s OWN language — a voice chosen on this machine means nothing to another device. '
                + 'Returns { sessionId, label, msg?, turn?, paragraphs[], keys[] (each paragraph\'s step), heads[] (each paragraph\'s first words), lang (\'\' = no sign), rate (-10…10) }. '
                + 'Nothing is spoken here and the reading channel (`alerts.reading`) is not touched.',
            handler: (args) => spokenReading(deps, args as Record<string, unknown>)
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
                + 'from the sentence it is on — the setting is not changed; the same as Sound: Reading Speed… and the page header player\'s − / +). Answers `done` (false: nothing is being read, or there is nowhere to go) with the state after it.',
            handler: (args) => {
                const action = optStr(args, 'action');
                const rate = (args as { rate?: unknown }).rate;
                return action || rate !== undefined ? readingAct(deps, action ?? '', rate) : readingState(deps);
            }
        }
    ]);
}
