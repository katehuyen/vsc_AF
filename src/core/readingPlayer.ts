/**
 * U-198 — THE READING PLAYER: pause, resume, next and previous paragraph, rate, position.
 *
 * On Windows ONE long-lived PowerShell runs per reading: SAPI `SpVoice` speaks
 * every paragraph as its own queued async stream, takes commands on stdin and
 * writes where it is on stdout. Measured on this machine (volume 0, real time):
 * a new process is ~0.8 s from spawn to its first word — a process per
 * paragraph would put that gap between every two of them — while queued
 * streams follow each other with only the voice's own sentence pause. Pause
 * holds at the next word boundary; a jump while paused stays paused; closing
 * stdin (the host going away) ends the process within a quarter of a second.
 *
 * Pure: the script, its line protocol, and where a step lands. The process is
 * driven by `readingPlayback.ts`.
 */
import { SPVOICE_PICK } from './speech';

/** Paragraphs travel in one environment value, split on the ASCII record separator. */
export const PLAYER_SEP = '\u001e';

/**
 * stdin: `pause` · `resume` · `stop` · `goto <paragraph> <char>` · `rate <-10..10>` (replays from the current sentence).
 * stdout: `ready <n>` · `at <paragraph> <sentenceChar> <wordChar> <wordLen>` · `paused` · `resumed` · `rate <n>` · `stopped` · `done`.
 * exit 4: nothing to say · exit 5: no installed voice matched.
 */
export const READING_PLAYER_SCRIPT =
    '$paras = @(($env:AF_SPEAK_TEXT -split [char]30) | Where-Object { $_.Trim() });'
    + 'if ($paras.Count -eq 0) { exit 4 };'
    + '$v = New-Object -ComObject SAPI.SpVoice;'
    + SPVOICE_PICK
    + '$v.Rate = [int]$env:AF_SPEAK_RATE;'
    + '$v.Volume = [int]$env:AF_SPEAK_VOLUME;'
    + '$script:map = @{}; $paused = $false; $para = 0; $sent = 0; $last = \'\'; $ls = -1;'
    + 'function Say([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() };'
    + 'function Play([int]$i, [int]$c) {'
    + '  $script:map = @{}; $flags = 3;'
    + '  for ($k = $i; $k -lt $paras.Count; $k++) {'
    + '    $t = $paras[$k]; $off = 0;'
    + '    if ($k -eq $i -and $c -gt 0 -and $c -lt $t.Length) { $t = $t.Substring($c); $off = $c };'
    + '    $n = $v.Speak($t, $flags); $flags = 1; $script:map[[int]$n] = @($k, $off)'
    + '  }'
    + '};'
    + '$in = New-Object IO.StreamReader([Console]::OpenStandardInput());'
    + '$task = $in.ReadLineAsync();'
    + 'Play 0 0; Say (\'ready \' + $paras.Count);'
    + 'while ($true) {'
    + '  if ($task.IsCompleted) {'
    + '    $line = $task.Result;'
    + '    if ($line -eq $null) { $v.Speak(\'\', 2) | Out-Null; exit 0 };'
    + '    $w = $line.Trim().Split(\' \');'
    + '    if ($w[0] -eq \'pause\') { if (-not $paused) { $v.Pause(); $paused = $true }; Say \'paused\' }'
    + '    elseif ($w[0] -eq \'resume\') { if ($paused) { $v.Resume(); $paused = $false }; Say \'resumed\' }'
    + '    elseif ($w[0] -eq \'stop\') { $v.Speak(\'\', 2) | Out-Null; Say \'stopped\'; exit 0 }'
    + '    elseif ($w[0] -eq \'goto\') { Play ([int]$w[1]) ([int]$w[2]); $last = \'\' }'
    + '    elseif ($w[0] -eq \'rate\') { $v.Rate = [int]$w[1]; Play $para $sent; $last = \'\'; Say (\'rate \' + $v.Rate) };'
    + '    $task = $in.ReadLineAsync()'
    + '  };'
    + '  if ($v.WaitUntilDone(100)) { Say \'done\'; exit 0 };'
    + '  $st = $v.Status; $sn = [int]$st.CurrentStreamNumber; $m = $script:map[$sn];'
    + '  if ($m) {'
    + '    $para = $m[0]; $sent = $m[1] + $st.InputSentencePosition; $wp = $m[1] + $st.InputWordPosition; $wl = $st.InputWordLength;'
    // The first poll of a new stream still carries the previous stream's word.
    + '    if ($sn -ne $ls) { $ls = $sn; $wp = $sent; $wl = 0 };'
    + '    $now = \'at \' + $para + \' \' + $sent + \' \' + $wp + \' \' + $wl;'
    + '    if ($now -ne $last) { Say $now; $last = $now }'
    + '  }'
    + '}';

export type PlayerEvent =
    | { kind: 'ready'; paragraphs: number }
    | { kind: 'at'; paragraph: number; sentence: number; word: number; wordLen: number }
    | { kind: 'paused' } | { kind: 'resumed' } | { kind: 'stopped' } | { kind: 'done' }
    | { kind: 'rate'; rate: number };

/** One stdout line of the player, or null for anything else. */
export function parsePlayerLine(line: string): PlayerEvent | null {
    const w = String(line ?? '').trim().split(/\s+/);
    const n = (i: number) => Number(w[i]);
    const whole = (...xs: number[]) => xs.every(x => Number.isInteger(x));
    switch (w[0]) {
        case 'ready': return whole(n(1)) ? { kind: 'ready', paragraphs: n(1) } : null;
        case 'at': return whole(n(1), n(2), n(3), n(4))
            ? { kind: 'at', paragraph: n(1), sentence: n(2), word: n(3), wordLen: n(4) } : null;
        case 'rate': return whole(n(1)) ? { kind: 'rate', rate: n(1) } : null;
        case 'paused': case 'resumed': case 'stopped': case 'done': return { kind: w[0] };
        default: return null;
    }
}

/** Where a reading is — what `alerts.reading` reports and a follow highlight reads. Chars are within the paragraph. */
export interface PlayState {
    paragraph: number;
    paragraphs: number;
    sentence: number;
    word: number;
    wordLen: number;
    paused: boolean;
    rate: number;
    /** false where the backend cannot pause mid-paragraph or say the word it is on (the paragraph-by-paragraph path) */
    live: boolean;
}

export type ReadingAction = 'pause' | 'resume' | 'toggle' | 'next' | 'prev';
export const READING_ACTIONS: readonly ReadingAction[] = ['pause', 'resume', 'toggle', 'next', 'prev'];

/** The rate a reading can be set to — SAPI's own scale; the other backends map it. */
export function clampRate(rate: unknown): number | null {
    const r = Number(rate);
    return Number.isFinite(r) ? Math.max(-10, Math.min(10, Math.round(r))) : null;
}

/**
 * Where a step lands. Next is the following paragraph (none after the last).
 * Previous restarts the paragraph being read once it is past its first
 * sentence — as a player's ⏮ does — and goes to the one before otherwise.
 */
export function stepTarget(st: Pick<PlayState, 'paragraph' | 'paragraphs' | 'sentence'>, action: 'next' | 'prev'): number | null {
    if (action === 'next') { return st.paragraph + 1 < st.paragraphs ? st.paragraph + 1 : null; }
    return st.sentence > 0 ? st.paragraph : Math.max(0, st.paragraph - 1);
}
