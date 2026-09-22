import * as fs from 'fs';
import * as path from 'path';
import { MediaMeta } from './media';
import { buildEdl, buildFcpXml, pickSequenceAssets } from './premiere';
import { Production } from './production';

/**
 * A production's scene assets written out as an editing timeline. The Studio's
 * export card and `studio.export` both write through here, so the file a
 * person gets and the file an agent gets are the same file.
 */

export type SequenceFormat = 'fcpxml' | 'edl' | 'both';
export const SEQUENCE_FORMATS: readonly SequenceFormat[] = ['fcpxml', 'edl', 'both'];

/** Beside the production.json, named after the production — where a timeline lands unless told otherwise. */
export function defaultSequenceFile(productionFile: string, productionId: string, format: SequenceFormat = 'fcpxml'): string {
    const safe = productionId.replace(/[^\w.-]+/g, '-');
    return path.join(path.dirname(productionFile), `${safe}.${format === 'edl' ? 'edl' : 'xml'}`);
}

export interface SequenceWritten {
    /** 0 = no scene has an assigned asset, and nothing was written. */
    clips: number;
    files: string[];
    fps: number;
    clipSeconds: number;
}

/** `both` writes the XML at `file` and the EDL beside it under the same name. */
export function writeSequence(
    production: Production, metas: MediaMeta[], file: string,
    o: { format?: SequenceFormat; fps?: number; clipSeconds?: number } = {}
): SequenceWritten {
    const format = o.format ?? 'fcpxml';
    const fps = o.fps || 30;
    const clipSeconds = o.clipSeconds || 5;
    const clips = pickSequenceAssets(production, metas);
    if (!clips.length) { return { clips: 0, files: [], fps, clipSeconds }; }
    const opts = { fps, clipSeconds, title: production.title };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const files: string[] = [];
    if (format === 'edl') {
        fs.writeFileSync(file, buildEdl(clips, opts), 'utf8');
        files.push(file);
    } else {
        fs.writeFileSync(file, buildFcpXml(clips, opts), 'utf8');
        files.push(file);
        if (format === 'both') {
            const edl = file.replace(/\.xml$/i, '') + '.edl';
            fs.writeFileSync(edl, buildEdl(clips, opts), 'utf8');
            files.push(edl);
        }
    }
    return { clips: clips.length, files, fps, clipSeconds };
}
