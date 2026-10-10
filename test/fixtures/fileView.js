/**
 * X-443 — a file the farm shows, read on the phone: a file an agent wrote with its line numbers and
 * its diff against the last commit, the sentence a reader gets instead of either (gone, binary, a new
 * file, cut), and a document no agent's write tools named (a report as wrapped prose, a note's file
 * as code) — which has no diff to ask for. Every scene answers the request the page posts on load
 * with the mode it opened in.
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
const base = { file: FILE, name: NAME, diff: false, edits: true, prose: false };
const view = (diff, v) => r => r.send({ type: 'view', diff, view: Object.assign({ file: FILE, name: NAME }, v) });
// A report a notice links: prose, in the language these files are written in, with a line longer than
// a phone is wide, an address, and a digest with nowhere to break.
const REPORT = 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\00_OUTPUT\\10_REPORT\\2026-10-11_gece-vardiyasi-ozeti.md';
const REPORT_TEXT = [
    '---',
    'agent: developer',
    'tarih: 2026-10-11',
    '---',
    '# Gece vardiyası özeti',
    '',
    'Telefonda bir sayfanın gösterdiği dosya artık salt okunur açılıyor: rapor, görev çıktısı, misyon adımının çıktısı, notun dosyası ve ajanın hafıza dosyaları. Bilgisayardaki düzenleyici telefonda olmadığı için aynı dokunuş çiftliğin dosya sayfasını açıyor.',
    '',
    '- Yalnızca sayfanın zaten gösterdiği dosya okunur; telefon kendi seçtiği bir yolu gösteremez.',
    '- Ajanın ayar dosyası, MCP tanımı ve becerileri hiçbir kaynakta yok.',
    '',
    'Kaynak: https://example.com/agent-farm/raporlar/2026/10/11/gece-vardiyasi-ozeti-telefonda-dosya-okuma-ve-kapsam-kurallari.html',
    '',
    'Paket özeti: 3b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfe9f2c4e7a1d',
    ''
].join('\n');
const doc = { file: REPORT, name: '2026-10-11_gece-vardiyasi-ozeti.md', diff: false, edits: false, prose: true };
const NOTE_FILE = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\src\\core\\shownFile.ts';
const code = { file: NOTE_FILE, name: 'shownFile.ts', diff: false, edits: false, prose: false };

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
        { id: 'report', label: 'A report: prose is read wrapped, without line numbers, and has no diff to switch to', data: doc,
            act: r => r.send({ type: 'view', diff: false, view: { file: REPORT, name: doc.name, exists: true, size: 1184, mtime: MTIME, text: REPORT_TEXT } }) },
        { id: 'notefile', label: 'A file a note names: code keeps its line numbers, and has no diff to switch to', data: code,
            act: r => r.send({ type: 'view', diff: false, view: { file: NOTE_FILE, name: code.name, exists: true, size: 5120, mtime: MTIME, text: TEXT } }) },
        { id: 'loading', label: 'Before the answer arrives', data: base }
    ]
};
