/**
 * X-418 — THE TECHNICAL FIELDS OF A MEDIA FILE, READ OFF FFMPEG'S OWN REPORT.
 *
 * There is no ffprobe on the user's machine (measured 2026-09-26); `ffmpeg -i`
 * prints the same facts to stderr — duration, bitrate, and one line per stream —
 * so that report is parsed here and mapped onto the Admin form's Medya Dosyası
 * and Teknik Kalite fields. Pure except `probeFile`, which runs ffmpeg once.
 */
import { ffmpegReport, ToolDeps } from './toolRun';

export interface ProbeInfo {
    durationSec?: number;
    /** kb/s, the container's overall rate */
    bitrateKbps?: number;
    video?: { codec: string; width: number; height: number; fps?: number; alpha: boolean; dar?: string };
    audio?: { codec: string; sampleRate: number; channels: string };
}

const ALPHA = /\b(rgba|argb|bgra|abgr|yuva\w*|pal8|ya8|ya16\w*|gbrap\w*|rgba64\w*)\b/;

/** One `ffmpeg -hide_banner -i <file>` report → what it says about the file. */
export function parseReport(stderr: string): ProbeInfo {
    const s = String(stderr || '');
    const info: ProbeInfo = {};
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    if (d) { info.durationSec = Math.round((Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) * 100) / 100; }
    const b = /Duration:[^\n]*?bitrate:\s*(\d+)\s*kb\/s/.exec(s);
    if (b) { info.bitrateKbps = Number(b[1]); }
    const v = /Stream #\d+:\d+[^\n]*?: Video: ([^\s,(]+)([^\n]*)/.exec(s);
    if (v) {
        const rest = v[2];
        const wh = /\b(\d{2,5})x(\d{2,5})\b/.exec(rest);
        const fps = /([\d.]+) fps/.exec(rest);
        const dar = /DAR (\d+):(\d+)/.exec(rest);
        info.video = {
            codec: v[1], width: wh ? Number(wh[1]) : 0, height: wh ? Number(wh[2]) : 0,
            ...(fps ? { fps: Number(fps[1]) } : {}), alpha: ALPHA.test(rest),
            ...(dar ? { dar: `${dar[1]}:${dar[2]}` } : {})
        };
    }
    const a = /Stream #\d+:\d+[^\n]*?: Audio: ([^\s,(]+)[^\n]*?(\d+) Hz, ([^,\n]+)/.exec(s);
    if (a) { info.audio = { codec: a[1], sampleRate: Number(a[2]), channels: a[3].trim() }; }
    return info;
}

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

/** "9:16" from the stream's own DAR, else from its pixels. */
export function aspectRatio(v: ProbeInfo['video']): string {
    if (!v) { return ''; }
    if (v.dar && v.dar !== '0:1') { return v.dar; }
    if (!v.width || !v.height) { return ''; }
    const g = gcd(v.width, v.height);
    return `${v.width / g}:${v.height / g}`;
}

/** The form's Çözünürlük Kalitesi by the SHORT side, so a vertical 1080×1920 reads 1080p. */
export function resolutionQuality(w: number, h: number): string {
    const s = Math.min(w || 0, h || 0);
    if (!s) { return ''; }
    return s >= 2160 ? '4K' : s >= 1440 ? '2K' : s >= 1080 ? '1080p' : s >= 720 ? '720p' : s >= 480 ? '480p' : '360p';
}

/** The record fields this report fills — only the ones it actually knows. */
export function probeFields(info: ProbeInfo | undefined, type: string): Record<string, unknown> {
    if (!info) { return {}; }
    const media: Record<string, unknown> = {};
    const tq: Record<string, unknown> = {};
    const v = info.video;
    if (v && v.width && v.height) {
        media.width = v.width; media.height = v.height;
        media.aspect_ratio = aspectRatio(v);
        tq.resolution_quality = resolutionQuality(v.width, v.height);
        if (v.alpha) { media.has_transparency = true; }
    }
    if (type !== 'image') {
        if (info.durationSec) { media.duration_seconds = info.durationSec; }
        if (v?.fps) { media.frame_rate = v.fps; }
        if (info.bitrateKbps) { tq.bitrate = info.bitrateKbps; }
    }
    const codec = type === 'audio' ? info.audio?.codec : v?.codec;
    if (codec) { tq.codec = codec; }
    if (info.audio) { tq.sample_rate = info.audio.sampleRate; tq.channels = info.audio.channels; }
    const out: Record<string, unknown> = {};
    if (Object.keys(media).length) { out.media = media; }
    if (Object.keys(tq).length) { out.technical_quality = tq; }
    return out;
}

/** ffmpeg's report of one file, parsed; undefined when ffmpeg is not installed. */
export async function probeFile(file: string, d: ToolDeps = {}): Promise<ProbeInfo | undefined> {
    const r = await ffmpegReport(file, { timeoutMs: 60_000, ...d });
    return r === undefined ? undefined : parseReport(r);
}
