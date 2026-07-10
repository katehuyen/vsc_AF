import * as fs from 'fs';
import * as path from 'path';
import { relTime, safeStat } from './util';

/**
 * Standing duties ("nöbet görevleri"): recurring vigilance agreements between
 * the user and an agent, stored as DUTIES.md in the agent folder so that
 * BOTH the agent (reads it every session) and the extension (parses, shows,
 * edits) work from the same source of truth. Hand-edits are preserved.
 */

export const DUTIES_FILENAME = 'DUTIES.md';

export const CADENCES = ['every-turn', 'session-start', 'daily', 'weekly', 'manual'] as const;
export type Cadence = string; // free-form tolerated; the list above is what the wizard offers

export interface Duty {
    title: string;
    cadence: Cadence;
    paused: boolean;
    watch?: string;
    action?: string;
    note?: string;
}

interface DutyBlock extends Duty {
    /** raw lines of the block, heading included — preserved on rewrite */
    lines: string[];
}

const HEADING_RE = /^##\s+(.*?)\s*\[([^\]]+)\]\s*$/;
const FIELD_RE = /^-\s*\*\*(Watch|Do|Note):\*\*\s*(.*)$/i;

const FILE_TEMPLATE = `# Nöbet Görevleri (Standing Duties)

<!-- agentfarm:duties — Bu dosyayı Agent Farm yönetir; elle de düzenleyebilirsin.
     Görev biçimi: "## Başlık [cadence]" + "- **Watch:**" + "- **Do:**" satırları. -->

Bu dosya, ajanın sürekli tetikte olması gereken görevlerini tanımlar. Kurallar (ajan için):

- **[every-turn]** görevler: her turda kontrol et.
- **[session-start]** görevler: oturumun başında bir kez kontrol et.
- **[daily] / [weekly]** görevler: o gün/hafta içindeki ilk fırsatta kontrol et.
- **[... , paused]** işaretli görevleri atla.
- Watch hedefinde yeni içerik veya değişiklik varsa Do adımını uygula; iş bittiyse hedefi temizlemek de görevin parçasıdır.
`;

/** The line we offer to append to CLAUDE.md so the agent actually obeys DUTIES.md. */
export const CLAUDE_MD_SNIPPET = `

## Nöbet Görevleri
Her oturumun başında \`DUTIES.md\` dosyasını oku ve kurallarına uy; [every-turn] görevlerini her turda yeniden kontrol et.
`;

function stripValue(raw: string): string {
    return raw.trim().replace(/^`(.*)`$/, '$1').trim();
}

function parseHeading(line: string): { title: string; cadence: string; paused: boolean } | undefined {
    const m = HEADING_RE.exec(line);
    if (!m) { return undefined; }
    const tags = m[2].split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const paused = tags.includes('paused');
    const cadence = tags.filter(t => t !== 'paused').join(', ') || 'manual';
    return { title: m[1].trim(), cadence, paused };
}

function parseBlocks(content: string): { headerLines: string[]; blocks: DutyBlock[] } {
    const lines = content.split(/\r?\n/);
    const headerLines: string[] = [];
    const blocks: DutyBlock[] = [];
    let current: DutyBlock | undefined;

    for (const line of lines) {
        const heading = parseHeading(line);
        if (heading) {
            current = { ...heading, lines: [line] };
            blocks.push(current);
            continue;
        }
        if (!current) {
            headerLines.push(line);
            continue;
        }
        current.lines.push(line);
        const field = FIELD_RE.exec(line);
        if (field) {
            const value = stripValue(field[2]);
            const key = field[1].toLowerCase();
            if (key === 'watch') { current.watch = value; }
            else if (key === 'do') { current.action = value; }
            else { current.note = value; }
        }
    }
    return { headerLines, blocks };
}

export function parseDutiesContent(content: string): Duty[] {
    return parseBlocks(content).blocks.map(({ lines: _lines, ...duty }) => duty);
}

export function readDuties(agentDir: string): { file: string; duties: Duty[] } | undefined {
    const file = path.join(agentDir, DUTIES_FILENAME);
    if (!fs.existsSync(file)) { return undefined; }
    try {
        return { file, duties: parseDutiesContent(fs.readFileSync(file, 'utf8')) };
    } catch {
        return { file, duties: [] };
    }
}

export function serializeDuty(d: Duty): string {
    const tags = d.paused ? `${d.cadence}, paused` : d.cadence;
    const lines = [`## ${d.title} [${tags}]`];
    if (d.watch) { lines.push(`- **Watch:** \`${d.watch}\``); }
    if (d.action) { lines.push(`- **Do:** ${d.action}`); }
    if (d.note) { lines.push(`- **Note:** ${d.note}`); }
    return lines.join('\n');
}

/** Append a duty; creates the file with the agent-facing template on first use. */
export function addDuty(agentDir: string, duty: Duty): string {
    const file = path.join(agentDir, DUTIES_FILENAME);
    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : FILE_TEMPLATE;
    if (!content.endsWith('\n')) { content += '\n'; }
    content += `\n${serializeDuty(duty)}\n`;
    fs.writeFileSync(file, content, 'utf8');
    return file;
}

function rewrite(agentDir: string, mutate: (blocks: DutyBlock[]) => DutyBlock[]): boolean {
    const file = path.join(agentDir, DUTIES_FILENAME);
    if (!fs.existsSync(file)) { return false; }
    const { headerLines, blocks } = parseBlocks(fs.readFileSync(file, 'utf8'));
    const next = mutate(blocks);
    const parts = [headerLines.join('\n').replace(/\n+$/, ''), ...next.map(b => b.lines.join('\n').replace(/\n+$/, ''))];
    fs.writeFileSync(file, parts.join('\n\n') + '\n', 'utf8');
    return true;
}

export function togglePauseDuty(agentDir: string, title: string): boolean {
    return rewrite(agentDir, blocks => blocks.map(b => {
        if (b.title !== title) { return b; }
        const tags = b.paused ? b.cadence : `${b.cadence}, paused`;
        return { ...b, paused: !b.paused, lines: [`## ${b.title} [${tags}]`, ...b.lines.slice(1)] };
    }));
}

export function deleteDuty(agentDir: string, title: string): boolean {
    return rewrite(agentDir, blocks => blocks.filter(b => b.title !== title));
}

/**
 * Replace a duty block in place (title/cadence/watch/action/note). The block
 * is regenerated from the fields; other blocks and the file header stay
 * untouched.
 */
export function updateDuty(agentDir: string, oldTitle: string, duty: Duty): boolean {
    return rewrite(agentDir, blocks => blocks.map(b =>
        b.title === oldTitle ? { ...duty, lines: serializeDuty(duty).split('\n') } : b));
}

/** True if the agent's CLAUDE.md references DUTIES.md (i.e. the agent will obey it). */
export function claudeMdReferencesDuties(claudeMdContent: string): boolean {
    return claudeMdContent.toUpperCase().includes('DUTIES.MD');
}

export interface WatchStatus {
    exists: boolean;
    kind: 'file' | 'dir' | 'missing';
    /** e.g. "3 waiting", "changed 2h ago", "missing" */
    summary: string;
    /** true when there is likely pending work (non-empty dir / recently changed file) */
    pending: boolean;
    /** for dirs: first few waiting file names (the "what exactly is waiting" preview) */
    files?: string[];
    /** for dirs: mtime of the oldest waiting entry (how long work has been sitting) */
    oldestMtime?: number;
}

/** Inspect a duty's watch target so the UI can show at a glance whether work is waiting. */
export function watchStatus(watch: string | undefined, now = Date.now()): WatchStatus | undefined {
    if (!watch) { return undefined; }
    // Only inspect things that look like paths.
    if (!/^([a-zA-Z]:[\\/]|\\\\|\/|~)/.test(watch)) { return undefined; }
    const st = safeStat(watch);
    if (!st) {
        return { exists: false, kind: 'missing', summary: 'missing', pending: false };
    }
    if (st.isDirectory()) {
        let entries: string[] = [];
        try {
            entries = fs.readdirSync(watch).filter(n => !n.startsWith('.'));
        } catch { /* unreadable */ }
        const count = entries.length;
        // Preview: which files are waiting + how long the oldest has been sitting.
        let oldestMtime: number | undefined;
        for (const name of entries.slice(0, 20)) {
            const es = safeStat(path.join(watch, name));
            if (es && (oldestMtime === undefined || es.mtimeMs < oldestMtime)) {
                oldestMtime = es.mtimeMs;
            }
        }
        return {
            exists: true,
            kind: 'dir',
            summary: count > 0 ? `${count} waiting` : 'empty',
            pending: count > 0,
            files: count > 0 ? entries.slice(0, 5) : undefined,
            oldestMtime
        };
    }
    const changedRecently = now - st.mtimeMs < 24 * 3600 * 1000;
    return {
        exists: true,
        kind: 'file',
        summary: `changed ${relTime(st.mtimeMs, now)}`,
        pending: changedRecently && st.size > 0
    };
}
