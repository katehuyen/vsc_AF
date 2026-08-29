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
/**
 * ‼️ WINDOWS KEEPS ITS VOICES IN TWO REGISTRIES, AND THE .NET WRAPPER SEES ONE.
 *
 * `System.Speech` is SAPI 5 and enumerates
 * `HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens` — on a normal Windows 10 that
 * is `Microsoft David` and `Microsoft Zira`, both en-US, and nothing else.
 * Every voice a user has ever added from Settings goes to
 * `Speech_OneCore\Voices\Tokens` instead, and `SelectVoice` can neither list
 * nor choose one. Measured on the machine this was written on: SAPI 5 had two
 * voices, OneCore had four, one of them `Microsoft Tolga — Turkish`, installed
 * and completely unreachable. Telling that user to install a language pack —
 * which is what the first version of this did — was advice for a problem they
 * did not have.
 *
 * The COM server underneath can reach both. `SpVoice.GetVoices()` enumerates
 * the SAPI 5 set only, but `SpObjectToken.SetId(<registry path>)` will load ANY
 * token by id, OneCore included — verified out loud, in Turkish, before this
 * was written. So the voice is found by walking BOTH registries here, which
 * makes every voice on the machine selectable in every language it has.
 *
 * ‼️ AND A NAME NOBODY ANSWERS IS `exit 5`, NOT A SHRUG. The wrapper's
 * `try { SelectVoice } catch { }` fell back to the system default, so a user
 * who asked for a Turkish voice and got an English one was told it worked. A
 * wrong voice is not a smaller failure than no voice; it is a harder one to
 * diagnose.
 *
 * ‼️ `Speak` IS SYNCHRONOUS (`SpeakAsync` is not used), because the alert queue
 * measures its gap from the END of a player's process.
 */
const VOICE_TOKEN_ROOTS = [
    'HKLM:\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens',
    'HKLM:\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens'
];

const SPVOICE_SCRIPT =
    'if (-not $env:AF_SPEAK_TEXT) { exit 4 };'
    + '$v = New-Object -ComObject SAPI.SpVoice;'
    + 'if ($env:AF_SPEAK_VOICE) {'
    + '  $want = $env:AF_SPEAK_VOICE; $got = $false;'
    + '  $tok = New-Object -ComObject SAPI.SpObjectToken;'
    + '  if ($want.StartsWith("HKEY_")) {'
    + '    try { $tok.SetId($want); $v.Voice = $tok; $got = $true } catch { }'
    + '  };'
    + `  foreach ($root in @('${VOICE_TOKEN_ROOTS.join("','")}')) {`
    + '    if ($got) { break };'
    + '    foreach ($k in (Get-ChildItem $root -ErrorAction SilentlyContinue)) {'
    + '      $n = (Get-ItemProperty $k.PSPath).\'(default)\';'
    + '      if ($n -and $n.ToLower().Contains($want.ToLower())) {'
    + '        try { $tok.SetId($k.Name); $v.Voice = $tok; $got = $true; break } catch { }'
    + '      }'
    + '    }'
    + '  };'
    + '  if (-not $got) { exit 5 }'
    + '};'
    + '$v.Rate = [int]$env:AF_SPEAK_RATE;'
    + '$v.Volume = [int]$env:AF_SPEAK_VOLUME;'
    + '$v.Speak($env:AF_SPEAK_TEXT) | Out-Null';

export function speakCandidates(platform: string, text: string, cfg: SpeakConfig): PlayerCandidate[] {
    if (platform === 'win32') {
        return [
            {
                backend: 'sapi:SpVoice',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command', SPVOICE_SCRIPT
                ],
                env: {
                    AF_SPEAK_TEXT: text,
                    AF_SPEAK_VOICE: cfg.voice,
                    AF_SPEAK_RATE: String(cfg.rate),
                    AF_SPEAK_VOLUME: String(cfg.volume)
                },
                codes: {
                    4: 'there was nothing to say — the template rendered empty',
                    5: 'no installed voice matched that name'
                        + ' — `alerts.speak` lists what this machine has'
                }
            },
            {
                // ‼️ THE FALLBACK CANNOT REACH A ONECORE VOICE and that is
                // accepted rather than hidden: it is here for a machine where
                // the COM server is unavailable, where speaking in the WRONG
                // voice still beats silence, and the result names the backend
                // that spoke so the difference is visible.
                backend: 'powershell:SpeechSynthesizer',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command',
                    'if (-not $env:AF_SPEAK_TEXT) { exit 4 };'
                    + 'Add-Type -AssemblyName System.Speech;'
                    + '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;'
                    + 'if ($env:AF_SPEAK_VOICE) {'
                    + '  $got = $false;'
                    + '  try { $s.SelectVoice($env:AF_SPEAK_VOICE); $got = $true } catch { };'
                    + '  if (-not $got) { exit 5 }'
                    + '};'
                    + '$s.Rate = [int]$env:AF_SPEAK_RATE;'
                    + '$s.Volume = [int]$env:AF_SPEAK_VOLUME;'
                    + '$s.Speak($env:AF_SPEAK_TEXT);'
                    + '$s.Dispose()'
                ],
                env: {
                    AF_SPEAK_TEXT: text,
                    AF_SPEAK_VOICE: cfg.voice,
                    AF_SPEAK_RATE: String(cfg.rate),
                    AF_SPEAK_VOLUME: String(cfg.volume)
                },
                codes: {
                    4: 'there was nothing to say — the template rendered empty',
                    5: 'no installed voice matched that name'
                        + ' — `alerts.speak` lists what this machine has'
                }
            }
        ];
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
    'Both of Windows\' voice registries are listed: the classic SAPI 5 set and'
    + ' the modern OneCore set, which is where every language pack installed'
    + ' from Settings goes. Both are selectable. If a language you want is'
    + ' missing from this list it really is not installed —'
    + ' Settings ▸ Time & language ▸ Speech ▸ Add voices, and they are free.';

export function voiceListCandidate(platform: string): PlayerCandidate | null {
    if (platform !== 'win32') { return null; }
    return {
        backend: 'powershell:InstalledVoices',
        file: 'powershell',
        args: [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command',
            `foreach ($r in @(@('onecore','${VOICE_TOKEN_ROOTS[0]}'),`
            + ` @('sapi5','${VOICE_TOKEN_ROOTS[1]}'))) {`
            + '  foreach ($k in (Get-ChildItem $r[1] -ErrorAction SilentlyContinue)) {'
            + '    $n = (Get-ItemProperty $k.PSPath).\'(default)\';'
            + '    $c = \'\';'
            + '    try {'
            + '      $a = Get-ItemProperty ($k.PSPath + \'\\Attributes\') -ErrorAction Stop;'
            + '      $c = [System.Globalization.CultureInfo]::GetCultureInfo('
            + '        [Convert]::ToInt32((($a.Language -split \';\')[0]), 16)).Name'
            + '    } catch { $c = \'\' };'
            + '    if ($n) { Write-Output ($k.Name + [char]9 + $n + [char]9 + $c + [char]9 + $r[0]) }'
            + '  }'
            + '}'
        ]
    };
}

/** One installed voice, as a picker shows it. */
export interface InstalledVoice {
    /** The token's registry path — unambiguous, and what `SetId` takes. */
    id: string;
    name: string;
    /** `tr-TR`, read from the token's own attributes. Empty if it has none. */
    culture: string;
    /** Which of Windows' two registries it came from. */
    engine: 'onecore' | 'sapi5';
}

/**
 * Parse what `voiceListCandidate` prints: `id⇥name⇥culture⇥engine`, one a line.
 *
 * Sorted by culture then name, because the question a reader brings to this
 * list is "is there one that speaks MY language" and registry order answers a
 * different one. A voice with no culture sorts last rather than first — it is
 * the least informative row, not the most.
 */
export function parseVoiceList(stdout: string): InstalledVoice[] {
    return String(stdout || '').split(/\r?\n/)
        .map(l => l.split('\t'))
        .filter(p => p.length >= 4 && p[0].trim() && p[1].trim())
        .map(p => ({
            id: p[0].trim(),
            name: p[1].trim(),
            culture: p[2].trim(),
            engine: (p[3].trim() === 'sapi5' ? 'sapi5' : 'onecore') as 'onecore' | 'sapi5'
        }))
        .sort((a, b) =>
            (a.culture ? 0 : 1) - (b.culture ? 0 : 1)
            || a.culture.localeCompare(b.culture)
            || a.name.localeCompare(b.name));
}
