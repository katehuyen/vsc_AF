/**
 * X-443 — a file an agent wrote, read on the phone: the file with its line numbers, its diff against
 * the last commit, and the sentence a reader gets instead of either (gone, binary, a new file, cut).
 * Every scene answers the request the page posts on load with the mode it opened in.
 */
const FILE = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\src\\core\\editedFile.ts';
const NAME = 'editedFile.ts';
const TEXT = [
    "import * as path from 'path';",
    '',
    '/** Every file a hosted conversation\'s write tools named, once each. */',
    'export function editedFilesOf(sessions: readonly Session[]): string[] {',
    '    const seen = new Map<string, string>();',
    '    for (const s of sessions) {',
    '        for (const m of s.messages) {',
    '            const f = m.tool?.file;',
    "            if (typeof f === 'string' && f && !seen.has(key(f))) { seen.set(key(f), f); }",
    '        }',
    '    }',
    '    return [...seen.values()];',
    '}',
    ''
].join('\n');
const DIFF = [
    'diff --git a/src/core/editedFile.ts b/src/core/editedFile.ts',
    'index 1a2b3c4..5d6e7f8 100644',
    '--- a/src/core/editedFile.ts',
    '+++ b/src/core/editedFile.ts',
    '@@ -4,9 +4,10 @@ import * as path from \'path\';',
    ' export function editedFilesOf(sessions: readonly Session[]): string[] {',
    '-    const seen = new Set<string>();',
    '+    const seen = new Map<string, string>();',
    '     for (const s of sessions) {',
    '         for (const m of s.messages) {',
    '-            if (m.tool?.file) { seen.add(m.tool.file); }',
    '+            const f = m.tool?.file;',
    "+            if (typeof f === 'string' && f && !seen.has(key(f))) { seen.set(key(f), f); }",
    '         }',
    '     }',
    ''
].join('\n');
const MTIME = Date.UTC(2026, 9, 11, 1, 30);
const base = { file: FILE, name: NAME, diff: false };
const view = (diff, v) => r => r.send({ type: 'view', diff, view: Object.assign({ file: FILE, name: NAME }, v) });

module.exports = {
    script: 'fileView.js',
    data: () => base,
    variants: () => [
        { id: 'file', label: 'The file as it is on disk now, with its line numbers', data: base,
            act: view(false, { exists: true, size: 5120, mtime: MTIME, text: TEXT }) },
        { id: 'diff', label: 'Its changes since the last commit', data: Object.assign({}, base, { diff: true }),
            act: view(true, { exists: true, size: 5120, mtime: MTIME, text: TEXT, diff: DIFF }) },
        { id: 'cut', label: 'A long file: only its first 256 KB is shown', data: base,
            act: view(false, { exists: true, size: 912384, mtime: MTIME, text: TEXT, truncated: true }) },
        { id: 'new', label: 'A new file: git has no earlier version to compare', data: Object.assign({}, base, { diff: true }),
            act: view(true, { exists: true, size: 5120, mtime: MTIME, text: TEXT, diffNote: 'A new file: git has no earlier version of it.' }) },
        { id: 'gone', label: 'A file that is no longer on disk', data: base,
            act: view(false, { exists: false, note: 'This file is no longer on disk.' }) },
        { id: 'binary', label: 'A binary file', data: base,
            act: view(false, { exists: true, size: 48211, mtime: MTIME, binary: true, note: 'A binary file: it cannot be shown as text.' }) },
        { id: 'loading', label: 'Before the answer arrives', data: base }
    ]
};
