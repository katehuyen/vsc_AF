/**
 * ‼️ A-20 — SAYING WHICH AGENT, WHEN A TONE CAN ONLY SAY THAT SOMETHING
 * HAPPENED.
 *
 * Twenty voices answer "what kind of news is this?" and nothing else. With
 * eight lanes running, the question the user actually has from the next room is
 * WHICH ONE — and no palette can carry a name. A spoken line can, it costs
 * nothing (every Windows install has had `System.Speech` for twenty years, and
 * macOS `say` and Linux `spd-say` are equally already there), and it needs no
 * network, no account and no model.
 *
 * ‼️ IT IS AN ADDITION TO THE TONE, NOT A REPLACEMENT FOR IT. A tone reaches
 * the ear in half a second and is recognised before it finishes; a sentence
 * takes two seconds and cannot be told from a podcast in the next room until
 * it is over. So the tone still says WHAT KIND, immediately, and the sentence
 * arrives behind it saying WHICH ONE. They ride in one queue ticket, so nothing
 * else can play between a tone and the sentence that explains it.
 *
 * ‼️ AND IT SHIPS OFF. A machine that talks unbidden is a machine people
 * switch off entirely, taking the tones with it.
 *
 * Pure: no vscode, no child_process. The candidate table is data; running it is
 * `turnAlerts`, which already owns every question about spawning a process.
 */

import { EVENT_LABEL, type AlertEvent } from './alertVoices';
import type { PlayerCandidate } from './turnAlerts';

export interface SpeakConfig {
    on: boolean;
    /** Which events are announced. Not all of them: see `SPEAK_DEFAULT`. */
    events: AlertEvent[];
    /** `{agent}`, `{event}` and `{session}` are substituted; anything else is
     *  left alone, because a typo should be heard rather than swallowed. */
    template: string;
    /** SAPI's own scale, −10 (slow) to 10 (fast). 0 is the voice's normal. */
    rate: number;
    /** 0–100. Separate from the tone's volume, which is the OS mixer's. */
    volume: number;
    /**
     * ‼️ WHICH INSTALLED VOICE, BY NAME — AND WINDOWS HAS TWO SEPARATE SETS OF
     * THEM, WHICH IS THE TRAP HERE.
     *
     * `System.Speech` is SAPI 5 and reads
     * `HKLM\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens`, which on a normal
     * Windows 10 holds `Microsoft David` and `Microsoft Zira` and nothing else.
     * The MODERN voices — including every language pack a user has ever added
     * from Settings — are registered under `Speech_OneCore\\Voices\\Tokens` and
     * are reached only through the WinRT synthesiser. Measured on this machine:
     * SAPI 5 lists two en-US voices, while OneCore holds four, **one of them
     * `Microsoft Tolga — Turkish`, already installed.**
     *
     * So "install a language pack" is the WRONG advice and this backend cannot
     * take it: the pack is usually already there and the engine simply cannot
     * see it. The honest thing the list can do today is say which set a voice
     * is in, and reaching the OneCore set is its own piece of work — see
     * `voiceListCandidate` below. An `en-US` voice reading a Turkish sentence
     * is not accented, it is unintelligible, so this matters.
     *
     * Empty means the system default.
     */
    voice: string;
}

/**
 * ‼️ `question` ONLY, OUT OF THE BOX, AND THAT IS THE WHOLE ARGUMENT FOR THIS
 * FEATURE RATHER THAN A LIMITATION OF IT.
 *
 * `question` is the one event where an agent is STOPPED and the cost of not
 * knowing is the whole run standing still. `turn-ready` happens constantly and
 * costs nothing to miss. A machine that announces every finished turn out loud
 * is the machine somebody turns off in an afternoon, and then hears nothing at
 * all — including the question.
 */
export const SPEAK_DEFAULT: SpeakConfig = {
    on: false,
    events: ['question'],
    template: '{agent}, {event}',
    rate: 0,
    volume: 100,
    voice: ''
};

/**
 * ‼️ A CEILING ON THE SENTENCE, because it is a queue and not a monologue.
 * Every announcement holds the whole farm's alerts for as long as it runs, so
 * a template that grew a paragraph would silence everything else behind it.
 */
export const SPEAK_MAX = 160;

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
    const v = typeof n === 'number' ? n : Number(n);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
};

/**
 * Read the setting the way the rest of the alert code reads its own: never
 * throw, never trust, and answer with something that works. A half-typed
 * object in `settings.json` must not be the reason an agent's question goes
 * unannounced.
 */
export function speakConfig(raw: Partial<SpeakConfig> | undefined | null): SpeakConfig {
    const r = (raw ?? {}) as Partial<SpeakConfig>;
    const events = Array.isArray(r.events)
        ? r.events.filter((e): e is AlertEvent => !!EVENT_LABEL[e as AlertEvent])
        : SPEAK_DEFAULT.events;
    const template = String(r.template ?? '').trim();
    return {
        on: r.on === true,
        // An empty list is not "announce everything" and it is not an error
        // either — it is a switch that is on with nothing selected, which the
        // page has to be able to show rather than silently correct.
        events: Array.from(new Set(events)),
        template: template ? template.slice(0, SPEAK_MAX) : SPEAK_DEFAULT.template,
        rate: clamp(r.rate, -10, 10, SPEAK_DEFAULT.rate),
        volume: clamp(r.volume, 0, 100, SPEAK_DEFAULT.volume),
        voice: String(r.voice ?? '').trim().slice(0, 120)
    };
}

export interface SpeakFacts {
    event: AlertEvent;
    agent?: string;
    session?: string;
}

/**
 * ‼️ WHAT IS ACTUALLY SAID — and the substitution is deliberately dumb.
 *
 * A template language is a thing to debug at three in the morning by ear. This
 * replaces three names and leaves everything else exactly as typed, so a
 * mistyped `{agnet}` is HEARD as "agnet" rather than vanishing: a placeholder
 * that silently disappears is a bug with no symptom at all.
 */
export function announcement(cfg: SpeakConfig, facts: SpeakFacts): string {
    const fill: Record<string, string> = {
        '{agent}': String(facts.agent ?? '').trim() || 'an agent',
        '{event}': (EVENT_LABEL[facts.event] ?? String(facts.event)).toLowerCase(),
        '{session}': String(facts.session ?? '').trim()
    };
    let out = cfg.template;
    for (const [k, v] of Object.entries(fill)) { out = out.split(k).join(v); }
    // Collapse what an empty `{session}` leaves behind, so a template written
    // for a name that is not there does not announce a stray comma.
    return out.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1')
        .replace(/([,;:])\s*(?=[,.;:!?])/g, '').trim().slice(0, SPEAK_MAX);
}

export function speaks(cfg: SpeakConfig, event: AlertEvent): boolean {
    return cfg.on && cfg.events.indexOf(event) >= 0;
}

/**
 * ‼️ THE TEXT NEVER ENTERS A COMMAND STRING — the same contract the sound
 * players are held to, and it matters more here, not less: the sentence is
 * written BY THE USER, in a settings box, and an agent's name goes into it.
 * On Windows it reaches PowerShell as an environment variable; everywhere else
 * it is an `execFile` argument of its own. An agent called `; rm -rf ~` is
 * therefore a strange name and nothing else.
 *
 * ‼️ AND EVERY BACKEND BLOCKS UNTIL IT HAS FINISHED SPEAKING. `Speak()` is the
 * synchronous call and `SpeakAsync()` is not used; `say` and `spd-say -w` wait
 * too. The alert queue measures its 500 ms gap from the END of a player's
 * process, so a backend that returned as soon as it started talking would let
 * the next agent's chime land in the middle of this one's sentence.
 */
export function speakCandidates(platform: string, text: string, cfg: SpeakConfig): PlayerCandidate[] {
    if (platform === 'win32') {
        return [{
            backend: 'powershell:SpeechSynthesizer',
            file: 'powershell',
            args: [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-Command',
                'Add-Type -AssemblyName System.Speech;'
                + '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;'
                + 'if ($env:AF_SPEAK_VOICE) { try { $s.SelectVoice($env:AF_SPEAK_VOICE) } catch { } };'
                + '$s.Rate = [int]$env:AF_SPEAK_RATE;'
                + '$s.Volume = [int]$env:AF_SPEAK_VOLUME;'
                + 'if (-not $env:AF_SPEAK_TEXT) { exit 4 };'
                + '$s.Speak($env:AF_SPEAK_TEXT);'
                + '$s.Dispose()'
            ],
            env: {
                AF_SPEAK_TEXT: text,
                AF_SPEAK_VOICE: cfg.voice,
                AF_SPEAK_RATE: String(cfg.rate),
                AF_SPEAK_VOLUME: String(cfg.volume)
            },
            codes: { 4: 'there was nothing to say — the template rendered empty' }
        }];
    }
    if (platform === 'darwin') {
        // `say`'s rate is words per minute, not SAPI's −10..10; 175 is its own
        // default, and the setting is mapped onto it rather than kept as two
        // scales the user has to know about.
        const wpm = Math.max(80, Math.min(400, Math.round(175 + cfg.rate * 15)));
        const args = ['-r', String(wpm)];
        if (cfg.voice) { args.push('-v', cfg.voice); }
        return [{ backend: 'say', file: 'say', args: args.concat([text]) }];
    }
    return [
        // `-w` is "wait until it has been spoken", which the queue depends on.
        {
            backend: 'spd-say', file: 'spd-say',
            args: ['-w', '-r', String(cfg.rate * 10), '-i', String(cfg.volume - 100), '--', text]
        },
        { backend: 'espeak', file: 'espeak', args: ['-a', String(Math.round(cfg.volume * 2)), '--', text] }
    ];
}

/**
 * ‼️ LISTING WHAT THIS BACKEND CAN ACTUALLY SAY IT WITH — WHICH IS NOT THE
 * SAME AS WHAT THE MACHINE HAS.
 *
 * This asks `System.Speech`, so it returns the SAPI 5 set and only that.
 * Windows 10 and 11 keep a SECOND, modern set under `Speech_OneCore` that
 * carries every language pack the user has added, and no `System.Speech` call
 * can see or select one of them. Measured here: SAPI 5 has two en-US voices;
 * OneCore has four, one of which is `Microsoft Tolga — Turkish`, installed and
 * unreachable.
 *
 * The list is therefore honest about the PLAYER rather than about the machine,
 * and `SPEECH_ONECORE_NOTE` is what says so out loud — without it, a user with
 * a Turkish voice already installed is told they have none, which is the worst
 * of the three possible answers.
 *
 * Windows only: `say -v ?` and `spd-say -L` have their own shapes, and the
 * answer states plainly that the list is unavailable rather than pretending
 * the machine has no voices at all.
 */
export const SPEECH_ONECORE_NOTE =
    'These are the SAPI 5 voices, which is all `System.Speech` can select.'
    + ' Windows 10/11 keeps a second, modern set under `Speech_OneCore` —'
    + ' that is where an installed language pack (Turkish, German, …) goes, and'
    + ' this player cannot reach it. If your language is missing here, it is'
    + ' very likely already installed and simply invisible to this engine:'
    + ' check `HKLM\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens`.';

export function voiceListCandidate(platform: string): PlayerCandidate | null {
    if (platform !== 'win32') { return null; }
    return {
        backend: 'powershell:InstalledVoices',
        file: 'powershell',
        args: [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command',
            'Add-Type -AssemblyName System.Speech;'
            + '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;'
            + '$s.GetInstalledVoices() | ForEach-Object {'
            + ' $i = $_.VoiceInfo; Write-Output ($i.Name + [char]9 + $i.Culture) };'
            + '$s.Dispose()'
        ]
    };
}

/** One installed voice, as the page shows it. */
export interface InstalledVoice { name: string; culture: string }

/** Parse what `voiceListCandidate` prints. Tab-separated, one per line. */
export function parseVoiceList(stdout: string): InstalledVoice[] {
    return String(stdout || '').split(/\r?\n/)
        .map(l => l.split('\t'))
        .filter(p => p.length >= 2 && p[0].trim())
        .map(p => ({ name: p[0].trim(), culture: p[1].trim() }));
}
