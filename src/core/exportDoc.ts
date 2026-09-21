import * as os from 'os';
import * as path from 'path';
import { optStr } from './bridge';
import { writeAtomicSync } from './atomicFile';

/**
 * B-21 — the delivery half of every "Export MD" a page has.
 *
 * ‼️ A PAGE'S EXPORT BUTTON IS A DIALOG, AND A DIALOG IS UNREACHABLE. Five
 * surfaces assembled a rich Markdown document and then handed it straight to
 * `showSaveDialog`, so the document existed for exactly as long as somebody was
 * sitting in front of it. The op side needs the same document and none of the
 * dialog, which is one contract, not five: **the content comes back**, and a
 * caller that names a `file` (or asks to `save`) gets an atomic write and the
 * path in the answer — including the path that was chosen for it, because an
 * output whose location the caller has to guess is not an output.
 *
 * The builders stay where the data is; this module only decides where the bytes
 * land.
 */
export function deliverDocument(
    args: Record<string, unknown>,
    content: string,
    defaultName: string,
    defaultDir: () => string
): Record<string, unknown> {
    const asked = optStr(args, 'file');
    if (!asked && args.save !== true) {
        return { content, bytes: Buffer.byteLength(content, 'utf8'), file: null };
    }
    // An unset report folder used to resolve to a bare relative name, which
    // lands wherever the extension host happens to stand.
    const file = asked
        ? path.resolve(asked)
        : path.join(defaultDir() || os.homedir(), defaultName);
    const r = writeAtomicSync(file, content);
    if (!r.ok) { throw new Error(r.error); }
    return {
        file, bytes: Buffer.byteLength(content, 'utf8'),
        chosenForYou: !asked,
        note: asked ? `Written to ${file}.`
            : `No path was given, so it went to ${file} — pass \`file\` to choose.`
    };
}

/** `YYYY-MM-DD`, the stem every exported document is dated with. */
export function exportStamp(at: number = Date.now()): string {
    return new Date(at).toISOString().slice(0, 10);
}
