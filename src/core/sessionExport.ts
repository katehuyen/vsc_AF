import { clockUtc, full as afFull } from './aftime';
import { compileQuery } from './query';
import { normalizeSpeakerConfig, renderSpeaker } from './speaker';
import { STEP_KIND_OF, StepKind } from './stepkind';
import { fmtTokens, fmtUSD } from './util';

/**
 * B-21 — THE SESSION PAGE'S EXPORT MD, BUILT WHERE AN OP CAN BUILD IT.
 *
 * ‼️ THE DOCUMENT USED TO BE ASSEMBLED INSIDE THE WEBVIEW, out of the page's
 * own view state — which messages were visible, which turns were folded or
 * unticked, where the replay stood — and the host only filed the bytes. So
 * "this conversation as a Markdown file" existed for exactly as long as the
 * page was open, and no op could ask for it. The page still decides WHAT is
 * exported: it sends the view it is showing (`SessionExportView`), and the
 * document is assembled here from the same data the page was drawn from.
 *
 * The words are the page's words: the speaker labels come from the reader's
 * own speaker settings, the step kinds from the shared legend, the figures
 * from the same formatters — an export that named things differently from
 * the screen would be a second vocabulary.
 */

export interface SessionExportView {
    /** false = the whole transcript, ignoring everything below. */
    view?: boolean;
    /** A folded turn keeps its title line (true) or is left out (false). */
    foldedTitles?: boolean;
    /** Role chips on: user · assistant · tool · toolResult · error. Empty = every role. */
    roles?: string[];
    /** The text box, in the shared query grammar (core/query). */
    filter?: string;
    /** Turns unticked for export. */
    excludeTurns?: number[];
    /** Turns folded on screen. */
    foldedTurns?: number[];
    /** Replay position: only the first `replayPos + 1` visible steps are shown. */
    replayPos?: number | null;
    /** The reader's speaker-label settings (what the page reads as __AFUI__.speaker). */
    speaker?: unknown;
}

interface Step {
    turn?: number; turnStart?: boolean; role?: string; text?: string; tool?: string;
    input?: string; isError?: boolean; ts?: number; model?: string; tokens?: number;
    wTokens?: number; cost?: number; sidechain?: boolean; kind?: string;
}

interface Turn { n: number; label?: string; models?: string[]; attrs?: Record<string, unknown>; }

/** Plain-text twin of the page's `fmtTokW`: `4.6M (⚖ 0.6M, mark)`. */
export function fmtTokWText(n: number | undefined, w: number | undefined, mark: string): string {
    const raw = fmtTokens(n || 0);
    if (!(w && w > 0)) { return raw; }
    return raw + ' (⚖ ' + fmtTokens(Math.round(w)) + (mark ? ', ' + mark : '') + ')';
}

const ROLE_MATCH: Record<string, (m: Step) => boolean> = {
    user: m => m.role === 'user',
    assistant: m => m.role === 'assistant',
    tool: m => m.role === 'tool',
    toolResult: m => m.role === 'toolResult',
    error: m => !!m.isError
};

/** The page's own chip ids, with the two names an agent tends to say instead. */
export function normalizeExportRoles(v: unknown): string[] {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    const out: string[] = [];
    for (const r of raw) {
        const s = String(r ?? '').trim();
        const id = s === 'agent' ? 'assistant' : s === 'result' || s === 'results' ? 'toolResult' : s;
        if (id === 'all') { return []; }
        if (ROLE_MATCH[id] && !out.includes(id)) { out.push(id); }
    }
    return out;
}

function mdFence(s: string): string {
    return s.includes('```') ? '````' : '```';
}

export function buildSessionMarkdown(data: Record<string, unknown>, opts: SessionExportView = {}): string {
    const view = opts.view !== false;
    const foldedTitles = !!opts.foldedTitles;
    const roles = normalizeExportRoles(opts.roles);
    const filter = typeof opts.filter === 'string' ? opts.filter : '';
    const excluded = new Set((opts.excludeTurns || []).map(Number).filter(n => n > 0));
    const folded = new Set((opts.foldedTurns || []).map(Number).filter(n => n > 0));
    const replayPos = typeof opts.replayPos === 'number' && opts.replayPos >= 0 ? opts.replayPos : null;
    const speaker = normalizeSpeakerConfig(opts.speaker);

    const messages = (Array.isArray(data.messages) ? data.messages : []) as Step[];
    const turns = (Array.isArray(data.turns) ? data.turns : []) as Turn[];
    const totals = (data.turnTotals && typeof data.turnTotals === 'object'
        ? data.turnTotals : {}) as Record<string, { tokens?: number; wTokens?: number; cost?: number }>;
    const identity = data.identity as { billing?: { mark?: string } } | undefined;
    const mark = identity?.billing?.mark || '';
    const lane = !!data.lane;
    const agentName = typeof data.agentName === 'string' ? data.agentName : '';
    const turnCount = Number(data.turnCount) || 0;

    const q = compileQuery(filter);
    const visible = (m: Step): boolean =>
        (!roles.length || roles.some(r => ROLE_MATCH[r](m)))
        && (q.empty || q.test((m.text || '') + ' ' + (m.tool || '') + ' ' + (m.input || '')));

    // Each entry: the step + whether only its turn header should render (a
    // folded turn kept for its title). rows drive the loop below.
    const rows: { m: Step; headerOnly: boolean }[] = [];
    if (!view) {
        for (const m of messages) { rows.push({ m, headerOnly: false }); }
    } else {
        let source = messages.filter(visible);
        if (replayPos !== null) { source = source.slice(0, replayPos + 1); }
        for (const m of source) {
            if (m.turn && excluded.has(m.turn)) { continue; }
            if (m.turn && folded.has(m.turn)) {
                if (foldedTitles && m.turnStart) { rows.push({ m, headerOnly: true }); }
                continue;
            }
            rows.push({ m, headerOnly: false });
        }
    }

    const inLane = (m: Step): boolean => !!(m.sidechain || lane);
    const speakerLabel = (m: Step): string => {
        if (inLane(m) && m.role === 'user') { return 'DELEGATOR' + (agentName ? ` (${agentName})` : ''); }
        if (inLane(m) && m.role === 'assistant') { return 'HANDLER'; }
        if (m.role === 'assistant') { return renderSpeaker(m.model, true, speaker); }
        return ({ user: 'USER', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' } as Record<string, string>)[m.role || '']
            || String(m.role || '').toUpperCase();
    };
    const fmtTime = (ts: unknown): string => ts ? afFull(ts) : '—';

    const lines: string[] = [`# ${String(data.title ?? '')}`, ''];
    lines.push(`- Session: \`${String(data.sessionId ?? '')}\``);
    if (data.cwd) { lines.push(`- Folder: \`${String(data.cwd)}\``); }
    lines.push(`- Span: ${fmtTime(data.firstTs)} → ${fmtTime(data.lastTs)}`);
    lines.push(`- Total: ${fmtTokWText(Number(data.totalTokens) || 0, Number(data.totalWTokens) || 0, mark)} tok`
        + ` · ${fmtUSD(Number(data.cost) || 0)} · ${turnCount} turns · ${Number(data.toolCalls) || 0} tool calls`);
    if (!view) {
        lines.push(`- Export: everything — the full transcript (${messages.length} messages), ignoring the on-screen filters and folding`);
    } else {
        const v: string[] = [];
        if (roles.length) { v.push('show: ' + roles.join(', ')); }
        if (filter) { v.push(`text filter: "${filter}"`); }
        if (excluded.size) { v.push(`excluded turns: ${[...excluded].sort((a, b) => a - b).join(', ')}`); }
        if (folded.size) { v.push(foldedTitles ? `${folded.size} folded turn(s): titles only` : `${folded.size} folded turn(s) omitted`); }
        if (replayPos !== null) { v.push(`replay position: ${replayPos + 1}/${messages.filter(visible).length}`); }
        v.push(`${rows.filter(r => !r.headerOnly).length} of ${messages.length} messages`);
        lines.push(`- Export: current view · ${v.join(' · ')}`);
    }
    lines.push('', '---');
    for (const row of rows) {
        const m = row.m;
        if (m.turnStart && m.turn) {
            const t = totals[String(m.turn)];
            const info = turns.find(x => x.n === m.turn);
            const tags = info
                ? (info.models || []).map(x => x.replace(/^claude-/, '')).concat(Object.values(info.attrs || {}).map(String))
                : [];
            const stats = (tags.length ? ` · ${tags.join(' · ')}` : '')
                + (t && (t.tokens || t.cost) ? ` · ${fmtTokWText(t.tokens, t.wTokens, mark)} tok · ${fmtUSD(t.cost || 0)}` : '');
            lines.push('', `## Turn ${m.turn}/${turnCount || '?'}${info && info.label ? ' — ' + info.label : ''}${stats}`);
        }
        if (row.headerOnly) { continue; }
        // The export carries the kind too — a file handed to someone else must
        // not lose the one column that says where the cost came from.
        const spec = m.kind ? STEP_KIND_OF[m.kind as StepKind] : undefined;
        const bits = [
            spec ? `${spec.glyph} ${spec.label}` : '',
            m.ts ? clockUtc(m.ts) : '',
            m.model ? m.model.replace(/^claude-/, '') : '',
            m.tokens ? fmtTokWText(m.tokens, m.wTokens, mark) + ' tok' : '',
            m.cost ? fmtUSD(m.cost) : '',
            m.sidechain ? 'subagent' : '',
            m.isError ? '⚠ ERROR' : ''
        ].filter(Boolean).join(' · ');
        if (m.role === 'tool') {
            const f = mdFence(m.input || '');
            lines.push('', `**TOOL CALL — ${m.tool || '?'}**${bits ? ' (' + bits + ')' : ''}`, '', f + 'json', m.input || '', f);
        } else if (m.role === 'toolResult') {
            const f = mdFence(m.text || '');
            lines.push('', `**TOOL RESULT**${bits ? ' (' + bits + ')' : ''}`, '', f, m.text || '(empty result)', f);
        } else {
            lines.push('', `**${speakerLabel(m)}**${bits ? ' (' + bits + ')' : ''}`, '', m.text || '');
        }
    }
    lines.push('');
    return lines.join('\n');
}
