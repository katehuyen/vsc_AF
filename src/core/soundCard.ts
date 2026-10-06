/**
 * U-181 — ONE SESSION'S SOUND, AS THE CONSOLE DRAWS IT.
 *
 * The composer always carries one speaker that says what this conversation
 * will sound like and opens its panel (media/afSoundPop.js). The card carries
 * a mark ONLY when the session behaves differently from the rest — a list of
 * eight cards that all say "like everybody else" is eight marks of nothing.
 *
 * ‼️ THE READING OUTRANKS EVERYTHING: it is the one state that is making a
 * noise right now, and the one a person looks for in order to stop it. Read
 * aloud is not silenced by Silent (alerts.read), so 🔊■ can sit on a Silent card.
 */
import { SessionSound } from './soundSession';
import type { ReadingSource } from './reader';

export interface SoundCardInput {
    sound: SessionSound;
    /** this session picked a tone of its own for at least one event */
    ownTone: boolean;
    /** Read aloud is switched on for it */
    read: boolean;
    /** its answer is being read out loud at this moment */
    reading: boolean;
}

export interface SoundCardView extends SoundCardInput {
    /** the composer's speaker — always drawn; while reading, a ■ stop follows it */
    icon: string;
    /** the card's mark — '' when it sounds like every other session */
    badge: string;
    head: string;
    /** `Label: value` lines for the hover */
    lines: string[];
}

const SOUND_TEXT: Record<SessionSound, string> = {
    'like-all': 'Like all',
    always: 'Always',
    silent: 'Silent'
};

export function soundCardView(i: SoundCardInput): SoundCardView {
    const icon = i.sound === 'silent' ? '🔇' : i.sound === 'always' ? '🔔' : '🔊';
    const badge = i.reading ? '🔊■'
        : i.sound === 'silent' ? '🔇'
            : i.sound === 'always' || i.ownTone ? '🔔' : '';
    const head = i.reading ? 'Reading its answer aloud now'
        : i.sound === 'silent' ? 'Silent — this session never makes a sound'
            : i.sound === 'always' ? 'Always — rings on its events even when the fleet switch is off'
                : i.ownTone ? 'Like all, in a tone of its own'
                    : 'Like all — the Sound page decides';
    const lines = [
        `Sound: ${SOUND_TEXT[i.sound]}`,
        `Tone: ${i.ownTone ? 'its own for at least one event' : 'the fleet\'s'}`,
        `Read aloud: ${i.reading ? 'reading now' : i.read ? 'on — every finished answer' : 'off'}`
    ];
    return { ...i, icon, badge, head, lines };
}

/**
 * Which session the one reader is reading. `DialogueSpeaker` knows only THAT
 * it speaks; the card needs WHOSE answer it is, and the reading ends by itself
 * when the player exits — so the run's own promise clears it, unless a newer
 * reading has taken its place in the meantime.
 */
export class ReadingNow {
    private id = '';
    private n = 0;
    /** U-197 — WHAT is being read: the message or turn, and the surface that asked. */
    private src: ReadingSource | null = null;
    /** U-206 — each paragraph's first words (paragraphHead), so a page can mark the one being read. */
    private heads: readonly string[] = [];

    constructor(private readonly changed: () => void = () => undefined) { }

    start(sessionId: string, run: Promise<unknown>, source?: Omit<ReadingSource, 'sessionId'>, heads: readonly string[] = []): void {
        const n = ++this.n;
        this.id = String(sessionId ?? '');
        this.src = { surface: 'auto', ...source, sessionId: this.id };
        this.heads = heads;
        this.changed();
        void run.then(undefined, () => undefined).then(() => {
            if (this.n !== n) { return; }
            this.id = '';
            this.src = null;
            this.heads = [];
            this.changed();
        });
    }

    /** The reader was stopped by hand. */
    stop(): void {
        this.n++;
        if (!this.id && !this.src) { return; }
        this.id = '';
        this.src = null;
        this.heads = [];
        this.changed();
    }

    /** What is being read, or null. A free-text reading has an empty sessionId. */
    get source(): ReadingSource | null { return this.src; }

    /** The first words of paragraph `i` of the reading now; '' when not known. */
    headOf(i: number): string { return this.heads[i] ?? ''; }

    is(sessionId: string): boolean {
        return !!sessionId && this.id === sessionId;
    }

    get current(): string { return this.id; }
}
