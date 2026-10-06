import type { LaunchManifest } from '../core/launchManifest';
import type { RouteNames } from '../core/routeName';
import type { SessionInfo } from '../core/sessions';
import { buildTurnRows, TurnRow } from '../core/turns';
import { RunIdentity, sessionIdentity } from '../core/turnRuntime';
import { normalizeSpeakerConfig, renderSpeaker } from '../core/speaker';
import { fmtDuration, fmtStepPair } from '../core/util';
import { full as afFull } from '../core/aftime';
import { afConfig } from '../core/settingsDoor';
import { buildData as buildViewerData } from './sessionViewer';
import type { TurnsDeps } from './turnsPanel';

/**
 * The Turns page's content outside its table: one turn's messages (the fold
 * and the export) and the Markdown export, which the page and the bridge's
 * turns export both build here, so neither can describe a turn differently.
 */

export interface TurnMsg {
    role: string; text: string; tool: string; input: string;
    isError: boolean; sidechain: boolean; model: string;
}

/** The manifests are read ONCE per build, not once per session row. */
export function identityOf(
    manifests: readonly LaunchManifest[] | undefined, names: RouteNames | undefined
): (s: SessionInfo) => RunIdentity | undefined {
    return s => sessionIdentity(s, manifests, names);
}

/** One turn's messages. clip/cap keep the on-screen fold light; export passes
 *  generous limits so the Markdown is complete. */
export function turnMessages(file: string, n: number, deps: TurnsDeps, clip = 1500, cap = 150): TurnMsg[] {
    const data = buildViewerData(file, {
        extensionUri: deps.extensionUri,
        getPricing: () => deps.getPricing(),
        maxMessages: () => Number.MAX_SAFE_INTEGER,
        contextLimitFor: () => 0
    });
    const msgs = (data.messages as {
        role: string; text?: string; tool?: string; input?: string;
        isError?: boolean; sidechain?: boolean; model?: string; turn?: number;
    }[]).filter(m => m.turn === n);
    const out: TurnMsg[] = msgs.slice(0, cap).map(m => ({
        role: m.role,
        text: (m.text ?? '').slice(0, clip),
        tool: m.tool ?? '',
        input: (m.input ?? '').slice(0, clip),
        isError: !!m.isError,
        sidechain: !!m.sidechain,
        model: m.model ?? ''
    }));
    if (msgs.length > cap) {
        out.push({
            role: 'system', text: `… ${msgs.length - cap} more messages — open the transcript for the rest`,
            tool: '', input: '', isError: false, sidechain: false, model: ''
        });
    }
    return out;
}

/** The webview's content-Show chips, mirrored so export honors the same filter. */
function msgMatchesRoles(m: TurnMsg, roles: string[]): boolean {
    if (m.role === 'system') { return true; }      // our own "… N more" note
    if (!roles.length) { return true; }            // empty = show everything
    return roles.some(r =>
        r === 'error' ? m.isError
            : r === 'user' ? m.role === 'user'
                : r === 'assistant' ? m.role === 'assistant'
                    : r === 'tool' ? m.role === 'tool'
                        : r === 'toolResult' ? m.role === 'toolResult'
                            : false);
}

const mdFence = (s: string) => s.includes('```') ? '````' : '```';

/**
 * Build the Turns-page Markdown. `shown` is the exact ordered list the webview
 * lists (post filter/sort/Show), `open` the unfolded ones, `roles` the content
 * Show selection. view=false exports every listed turn's full content; view=true
 * exports open turns' content (roles-filtered) and, per foldedTitles, either a
 * header-only line for folded turns or nothing.
 */
export function buildTurnsMarkdown(
    deps: TurnsDeps,
    shown: { file: string; n: number }[],
    openKeys: Set<string>,
    roles: string[],
    opts: { view: boolean; foldedTitles: boolean }
): string {
    const rowByKey = new Map<string, TurnRow>();
    const now = Date.now();
    // ‼️ THE SAME POOL THE TABLE WAS BUILT FROM (X-35). `buildData` widened to
    // `allWithExternal`, so a Codex turn reaches the page — and then every
    // downstream step here still looked it up in the claude-only list, where it
    // is not. The export silently dropped those rows and the header lookup below
    // fell through to a bare "turn N". A LOG surface reads the log list, once.
    for (const r of buildTurnRows(deps.index.allWithExternal(), s => deps.index.isSessionActive(s, now),
        afConfig().get<number>('contextWindowTokens', 0), identityOf(deps.launchManifests?.(), deps.routeNames?.()))) {
        rowByKey.set(r.file + '#' + r.n, r);
    }
    const sc = afConfig();
    const speakerCfg = normalizeSpeakerConfig({
        template: sc.get('speakerLabelTemplate'),
        casing: sc.get('speakerLabelCase'),
        fallback: sc.get('speakerLabelFallback')
    });
    const lines: string[] = ['# Agent Farm — Turns export', ''];
    lines.push(`- Generated: ${afFull(Date.now())}`);
    lines.push(opts.view
        ? `- Export: current view · ${shown.length} listed turn(s) · open turns' content shown${roles.length ? ` (show: ${roles.join(', ')})` : ''} · folded turns ${opts.foldedTitles ? 'as titles only' : 'omitted'}`
        : `- Export: everything · ${shown.length} listed turn(s), each with its full content`);
    lines.push('', '---');

    let emitted = 0;
    for (const ref of shown) {
        const key = ref.file + '#' + ref.n;
        const r = rowByKey.get(key);
        if (!r) { continue; }
        const isOpen = openKeys.has(key);
        // In view mode, a folded turn is either a title line or skipped.
        if (opts.view && !isOpen && !opts.foldedTitles) { continue; }
        emitted++;

        // The same figures the table shows, in the same words — an export that
        // describes a turn differently from the row it came from is a second,
        // quieter answer to the same question.
        const meta = [
            r.models.map(m => m.replace(/^claude-/, '')).join(', '),
            // ‼️ X-110 — AND WHO SERVED IT, which a model name does not say. An
            // export naming only the model is the same burial the pages were
            // doing: `claude-opus-5` was served by Anthropic or by a gateway and
            // the file cannot be asked which, for ever.
            r.providerIds.length ? `via ${r.providerIds.join(', ')}` : '',
            r.steps || r.apiCalls ? fmtStepPair(r.apiCalls, r.steps) : '',
            r.ms ? `took ${fmtDuration(r.ms)}` : '',
            r.tokens ? `${r.tokens} tok` : '',
            r.endCtx ? `ctx ${r.endCtx}` : '',
            r.cost ? `$${r.cost.toFixed(r.cost >= 1 ? 2 : 4)}` : '',
            r.tools ? `${r.tools} tools` : '',
            r.errors ? `${r.errors} err` : '',
            r.ts ? afFull(r.ts) : ''
        ].filter(Boolean).join(' · ');
        lines.push('', `## ${r.agentName || '?'} · turn ${r.n}/${r.of} — ${r.label || '(no prompt)'}`);
        lines.push(`*session: ${r.session}${meta ? ' · ' + meta : ''}*`);

        const wantContent = opts.view ? isOpen : true;
        if (!wantContent) { continue; }
        const msgs = turnMessages(ref.file, ref.n, deps, 4000, 400)
            .filter(m => opts.view ? msgMatchesRoles(m, roles) : true);
        for (const m of msgs) {
            const bits = [m.model ? m.model.replace(/^claude-/, '') : '', m.sidechain ? 'subagent' : '', m.isError ? '⚠ ERROR' : ''].filter(Boolean).join(' · ');
            if (m.role === 'tool') {
                const f = mdFence(m.input || '');
                lines.push('', `**TOOL CALL — ${m.tool || '?'}**${bits ? ' (' + bits + ')' : ''}`, '', f + 'json', m.input || '', f);
            } else if (m.role === 'toolResult') {
                const f = mdFence(m.text || '');
                lines.push('', `**TOOL RESULT**${bits ? ' (' + bits + ')' : ''}`, '', f, m.text || '(empty result)', f);
            } else {
                const roleLabel = m.role === 'assistant'
                    ? renderSpeaker(m.model, true, speakerCfg)
                    : ({ user: 'USER', system: 'NOTE' } as Record<string, string>)[m.role] || m.role.toUpperCase();
                lines.push('', `**${roleLabel}**${bits ? ' (' + bits + ')' : ''}`, '', m.text || '');
            }
        }
    }
    if (!emitted) { lines.push('', '_No turns matched the export selection._'); }
    lines.push('');
    return lines.join('\n');
}
