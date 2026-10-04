/**
 * U-212 — THE TONES' OWN LEVEL (`agentFarm.alerts.toneVolume`), handed to each player in its own words.
 *
 * ‼️ 100 IS TODAY, EXACTLY: the candidates come back untouched, so the default changes nothing.
 * Below 100 the level is a LINEAR AMPLITUDE FACTOR, the scale MediaPlayer, ffplay, afplay and
 * pw-play already speak; PulseAudio's `pa_volume_t` is cubic, so paplay is given the cube root.
 *
 * ‼️ WINDOWS' MEDIAPLAYER STARTS AT 0.5, NOT 1.0 (`MediaPlayer.Volume`, documented default), while
 * SoundPlayer plays a `.wav` at full scale. Each file is therefore scaled from what plays it TODAY:
 * a `.wav` from SoundPlayer's full scale (v / 100), anything else from MediaPlayer's 0.5 (v / 200) —
 * so lowering the level never makes one kind of file jump against the other.
 *
 * A player with no level of its own (SoundPlayer, aplay) is not dropped: it moves behind every
 * player that has one and stays the last resort, at full volume, rather than an alert that is never
 * heard because WPF or PulseAudio is missing.
 */
import { extensionOf } from './alertVoices';
import type { SoundCandidate } from './turnAlerts';

export const TONE_VOLUME_DEFAULT = 100;

/** The stored level, 0–100 in whole steps; unset is today's loudness. */
export function toneVolumeOf(v: unknown): number {
    if (v === undefined || v === null || v === '') { return TONE_VOLUME_DEFAULT; }
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : TONE_VOLUME_DEFAULT;
}

/** A level someone typed: refused by name rather than stored as something else. */
export function parseToneVolume(v: unknown): { ok: true; value: number } | { ok: false; error: string } {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    if (v === null || typeof v === 'boolean' || !Number.isFinite(n)) {
        return { ok: false, error: `tone volume must be a number from 0 to 100, not ${JSON.stringify(v)}` };
    }
    return { ok: true, value: toneVolumeOf(n) };
}

const factor = (v: number): string => String(Math.round(v * 10) / 1000);

/** One player told the level, or null when it has no way to take one. */
function leveled(c: SoundCandidate, v: number, wav: boolean): SoundCandidate | null {
    const before = (flag: string[]): string[] => c.args.slice(0, -1).concat(flag, c.args.slice(-1));
    switch (c.backend) {
        // per mille in an environment variable: no decimal point for a culture to misread
        case 'powershell:MediaPlayer':
            return { ...c, env: { ...c.env, AF_TURN_VOLUME: String(wav ? v * 10 : v * 5) } };
        case 'ffplay': return { ...c, args: before(['-volume', String(v)]) };
        case 'afplay': return { ...c, args: before(['-v', factor(v)]) };
        case 'paplay': return { ...c, args: before([`--volume=${Math.round(Math.cbrt(v / 100) * 65536)}`]) };
        case 'pw-play': return { ...c, args: before([`--volume=${factor(v)}`]) };
        default: return null;
    }
}

/** The order to try at this level: the players that can lower it first, the rest behind as they were. */
export function withToneVolume(candidates: SoundCandidate[], volume: unknown, asset: string): SoundCandidate[] {
    const v = toneVolumeOf(volume);
    if (v >= 100) { return candidates; }
    const wav = extensionOf(asset) === 'wav';
    const can: SoundCandidate[] = [];
    const cannot: SoundCandidate[] = [];
    for (const c of candidates) {
        const l = leveled(c, v, wav);
        if (l) { can.push(l); } else { cannot.push(c); }
    }
    return can.concat(cannot);
}
