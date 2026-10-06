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
import { readAskOf, readingText, ReadingSource, readingTimeoutMs, readTarget } from './reader';
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
    dialogue: Pick<DialogueSpeaker, 'speak' | 'speaking'>;
    readingNow: Pick<ReadingNow, 'start' | 'source'>;
    /** Cut the reading short — the same stop as `alerts.read stop` and Sound: Stop Reading. */
    stop(): boolean;
}

export interface ReadNowAnswer {
    reading: true; sessionId: string; label: string; msg?: string; turn?: number;
    surface: string; chars: number; voice: string;
}

/** Start one reading somebody asked for; refuses by name when there is nothing to read. */
export async function readNow(deps: ReaderDeps, args: Record<string, unknown>, surface: string): Promise<ReadNowAnswer> {
    const ask = readAskOf(args);
    if ('error' in ask) { throw new BridgeRefusal(ask.error, { step: 'ask' }); }
    const conv = ask.sessionId ? deps.conversation(ask.sessionId) : null;
    if (conv && 'error' in conv) { throw new BridgeRefusal(conv.error, { step: 'session' }); }
    let raw = '';
    let where: Pick<ReadingSource, 'msg' | 'turn'> = {};
    if (ask.kind === 'text') {
        raw = ask.text;
    } else {
        const t = readTarget((conv as Conversation).steps, ask);
        if ('error' in t) { throw new BridgeRefusal(t.error, { step: 'target' }); }
        raw = t.text;
        where = { msg: t.msg, ...(t.turn ? { turn: t.turn } : {}) };
    }
    const sessionId = conv ? conv.sessionId : '';
    const fleet = deps.fleet();
    const how = await deps.speechFor((sessionId && deps.voiceOf(sessionId)) || fleet.voice, raw);
    const text = readingText(raw, true, how.words);
    if (!text) { throw new BridgeRefusal('nothing in it can be spoken', { step: 'text' }); }
    const run = deps.dialogue.speak(text, { ...fleet, voice: how.voice }, { timeoutMs: readingTimeoutMs(text.length) });
    deps.readingNow.start(sessionId, run, { surface, ...where });
    return {
        reading: true, sessionId, label: conv ? conv.label : '', ...where,
        surface, chars: text.length, voice: how.voice || '(system default)'
    };
}

/** What is being read now: the source while a reading lasts, and whether its player is speaking yet. */
export function readingState(deps: Pick<ReaderDeps, 'dialogue' | 'readingNow'>): { reading: boolean; speaking: boolean; source: ReadingSource | null } {
    const source = deps.readingNow.source;
    return { reading: !!source, speaking: deps.dialogue.speaking, source };
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
                + 'turn? (1-based — that turn\'s answer), last? (true — the newest answer; also what a sessionId alone reads), text? (your own text, e.g. a report for the user; '
                + 'with a sessionId it is read in that conversation\'s voice). Returns { reading, sessionId, label, msg?, turn?, chars, voice }.',
            handler: (args) => readNow(deps, args as Record<string, unknown>, 'bridge')
        },
        {
            op: 'alerts.reading',
            describe: 'WHAT IS BEING READ ALOUD NOW — { reading, speaking, source: { sessionId, msg?, turn?, surface } | null }: the conversation (empty for a text of your own), '
                + 'the step\'s key, the turn, and who asked (`auto` = Read aloud, `bridge`, or a page). `speaking` turns true once the player is running. '
                + 'args: action? ("stop" — cut the reading short; the same stop as `alerts.read stop` and Sound: Stop Reading). Answers `stopped` with a stop.',
            handler: (args) => {
                const action = (optStr(args, 'action') ?? '').trim().toLowerCase();
                if (action && action !== 'stop') {
                    throw new BridgeRefusal(`action "${action}" is not known — "stop" is the one there is`, { step: 'action' });
                }
                if (action === 'stop') { return { stopped: deps.stop(), ...readingState(deps) }; }
                return readingState(deps);
            }
        }
    ]);
}
