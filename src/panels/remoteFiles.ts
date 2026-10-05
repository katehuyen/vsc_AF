import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * X-456 — A PAGE'S OWN FILES ON A PHONE. A desktop tab loads a picture or a
 * clip from the folders its panel lists; a phone's view can only fetch through
 * the remote host. So a file the panel's own code turns into an address (the
 * Studio's wall, a selection's candidates) gets a random token in THAT view,
 * and /res/~/<view>/<token> serves exactly that file to exactly that device
 * while the view is open. Nothing else on the disk has an address.
 *
 * The path stays under /res/ because the phone app fetches every /res/ path
 * with its session and refuses any other shape under /view/.
 */

export const FILE_PREFIX = '/res/~/';
export const FILE_URL = /^\/res\/~\/([A-Za-z0-9._-]+)\/([a-f0-9]{24})(?:[?#]|$)/;
/** A clip bigger than this is read into memory whole, so it is refused rather than served. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

const MIME: Readonly<Record<string, string>> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac'
};

export function mimeOf(file: string): string {
    return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export interface ServedFile { status: number; type: string; body: Buffer | string }

/** The files one view has given an address, by token; the same file keeps its token. */
export class ViewFiles {
    private readonly byToken = new Map<string, string>();
    private readonly byFile = new Map<string, string>();

    constructor(private readonly view: string) { }

    /** The address of a file on the disk, or undefined when there is no such file. */
    address(file: string): string | undefined {
        const at = path.resolve(file);
        let token = this.byFile.get(at);
        if (!token) {
            try { if (!fs.statSync(at).isFile()) { return undefined; } } catch { return undefined; }
            token = crypto.randomBytes(12).toString('hex');
            this.byFile.set(at, token);
            this.byToken.set(token, at);
        }
        return FILE_PREFIX + this.view + '/' + token;
    }

    async serve(token: string, max = MAX_FILE_BYTES): Promise<ServedFile | null> {
        const file = this.byToken.get(token);
        if (!file) { return null; }
        let size: number;
        try {
            const st = await fs.promises.stat(file);
            if (!st.isFile()) { return null; }
            size = st.size;
        } catch { return null; }
        if (size > max) { return { status: 413, type: 'text/plain; charset=utf-8', body: 'Too large for the phone — open it on the PC.' }; }
        try { return { status: 200, type: mimeOf(file), body: await fs.promises.readFile(file) }; } catch { return null; }
    }
}
