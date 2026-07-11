import * as path from 'path';
import { assetKind, MediaMeta } from './media';
import { Production } from './production';

/**
 * Wave D — editor bridge: turn a production manifest + its assets into an
 * assembly sequence an NLE can open. Emits FCP7 XML (xmeml — Premiere Pro
 * imports it) and a CMX3600 EDL. Pure/deterministic so it's fully unit-tested;
 * the host just picks a target file and writes the string.
 */

export interface SeqClip {
    file: string;
    name: string;
    sceneTitle: string;
    kind: 'image' | 'video' | 'audio' | 'file';
}

export interface SeqOptions {
    fps?: number;
    width?: number;
    height?: number;
    /** default clip length when the real duration is unknown */
    clipSeconds?: number;
    title?: string;
}

/**
 * One clip per scene, in manifest order: prefer a video the user kept in a
 * selection step, else any video, else any image. Scenes assigned to no usable
 * asset are skipped. `rejectedUrls` assets are never chosen.
 */
export function pickSequenceAssets(production: Production, metas: MediaMeta[]): SeqClip[] {
    const forProject = metas.filter(m => m.projectId === production.id);
    const clips: SeqClip[] = [];
    for (const scene of production.scenes) {
        const sceneMetas = forProject.filter(m => m.sceneId === scene.id);
        const candidates: { file: string; url: string; kind: SeqClip['kind']; selected: boolean }[] = [];
        for (const m of sceneMetas) {
            const files = m.assetFiles ?? [];
            const urls = m.assetUrls ?? [];
            const rejected = new Set(m.rejectedUrls ?? []);
            const selected = new Set(m.selectedUrls ?? []);
            for (let i = 0; i < files.length; i++) {
                const url = urls[i] ?? files[i];
                if (rejected.has(url)) { continue; }
                candidates.push({ file: files[i], url, kind: assetKind(files[i]), selected: selected.has(url) });
            }
        }
        if (!candidates.length) { continue; }
        const rank = (c: typeof candidates[number]) =>
            (c.selected ? 0 : 2) + (c.kind === 'video' ? 0 : c.kind === 'image' ? 1 : 3);
        candidates.sort((a, b) => rank(a) - rank(b));
        const pick = candidates[0];
        clips.push({ file: pick.file, name: path.basename(pick.file), sceneTitle: scene.title, kind: pick.kind });
    }
    return clips;
}

function pad(n: number, w = 2): string { return String(n).padStart(w, '0'); }

/** frames → HH:MM:SS:FF at fps */
export function framesToTc(frames: number, fps: number): string {
    const f = frames % fps;
    const totalSec = Math.floor(frames / fps);
    return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}:${pad(f)}`;
}

/** absolute local path → file:// URL Premiere accepts (Windows drive aware) */
export function pathToFileUrl(file: string): string {
    let p = file.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(p)) { p = '/' + p; }          // D:/a → /D:/a
    return 'file://localhost' + encodeURI(p);
}

function xmlEsc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildFcpXml(clips: SeqClip[], opts: SeqOptions = {}): string {
    const fps = opts.fps ?? 30;
    const width = opts.width ?? 1920;
    const height = opts.height ?? 1080;
    const clipFrames = Math.max(1, Math.round((opts.clipSeconds ?? 5) * fps));
    const title = opts.title ?? 'Agent Farm Sequence';

    const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
    let cursor = 0;
    const items = clips.map((c, i) => {
        const start = cursor;
        const end = cursor + clipFrames;
        cursor = end;
        return `        <clipitem id="clipitem-${i + 1}">
          <name>${xmlEsc(c.name)}</name>
          <enabled>TRUE</enabled>
          <duration>${clipFrames}</duration>
          ${rate}
          <start>${start}</start>
          <end>${end}</end>
          <in>0</in>
          <out>${clipFrames}</out>
          <file id="file-${i + 1}">
            <name>${xmlEsc(c.name)}</name>
            <pathurl>${xmlEsc(pathToFileUrl(c.file))}</pathurl>
            ${rate}
            <duration>${clipFrames}</duration>
            <media><video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video></media>
          </file>
        </clipitem>`;
    }).join('\n');
    const total = cursor;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="agentfarm-seq">
    <name>${xmlEsc(title)}</name>
    <duration>${total}</duration>
    ${rate}
    <media>
      <video>
        <format><samplecharacteristics><width>${width}</width><height>${height}</height>${rate}</samplecharacteristics></format>
        <track>
${items}
        </track>
      </video>
    </media>
  </sequence>
</xmeml>
`;
}

export function buildEdl(clips: SeqClip[], opts: SeqOptions = {}): string {
    const fps = opts.fps ?? 30;
    const clipFrames = Math.max(1, Math.round((opts.clipSeconds ?? 5) * fps));
    const title = opts.title ?? 'Agent Farm Sequence';
    const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
    let rec = 0;
    clips.forEach((c, i) => {
        const recIn = framesToTc(rec, fps);
        const recOut = framesToTc(rec + clipFrames, fps);
        const srcIn = framesToTc(0, fps);
        const srcOut = framesToTc(clipFrames, fps);
        const track = c.kind === 'audio' ? 'A' : 'V';
        lines.push(`${pad(i + 1, 3)}  AX       ${track}     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
        lines.push(`* FROM CLIP NAME: ${c.name}`);
        lines.push(`* SCENE: ${c.sceneTitle}`);
        lines.push('');
        rec += clipFrames;
    });
    return lines.join('\n');
}

/**
 * Naming-convention scene detection for ingested files. Matches either a scene
 * id token (e.g. "s03") or an `S<n>` index (1-based) somewhere in the filename.
 * Returns the scene id or undefined. Enables "P01_S03_T02_approved.mp4" style
 * exports to auto-link to their scene on ingest.
 */
export function detectSceneId(filename: string, production: Production): string | undefined {
    const base = path.basename(filename).toLowerCase();
    for (const scene of production.scenes) {
        const id = scene.id.toLowerCase();
        if (new RegExp(`(^|[^a-z0-9])${id}([^a-z0-9]|$)`).test(base)) { return scene.id; }
    }
    const m = /(?:^|[_\-. ])s(\d{1,2})(?:[_\-. ]|$)/i.exec(base);
    if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < production.scenes.length) { return production.scenes[idx].id; }
    }
    return undefined;
}
