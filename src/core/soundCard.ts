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

    constructor(private readonly changed: () => void = () => undefined) { }

    start(sessionId: string, run: Promise<unknown>): void {
        const n = ++this.n;
        this.id = String(sessionId ?? '');
        this.changed();
        void run.then(undefined, () => undefined).then(() => {
            if (this.n !== n) { return; }
            this.id = '';
            this.changed();
        });
    }

    /** The reader was stopped by hand. */
    stop(): void {
        this.n++;
        if (!this.id) { return; }
        this.id = '';
        this.changed();
    }

    is(sessionId: string): boolean {
        return !!sessionId && this.id === sessionId;
    }

    get current(): string { return this.id; }
}
