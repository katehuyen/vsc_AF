import * as path from 'path';
import * as vscode from 'vscode';
import { MediaMeta, updateMediaMeta } from '../core/media';
import { promotionOf, scoreOf, StudioEditKind, StudioEditOutcome, StudioEditRequest } from '../core/studioLibraryWrite';

/**
 * X-425 — the wall's ✓ / ✗ / ✎ / ↑ on the host. The decision is written by the
 * same writer studio.library.edit calls (a promotion by media.restage's), and
 * the answer is said: written, the record changed in the panel (nothing
 * written — the wall is read again), or why nothing could be written.
 */
export interface LibraryActDeps {
    edit(req: StudioEditRequest): Promise<StudioEditOutcome>;
    promote(r: { file: string; stage: string; base?: string; id?: string }): Promise<{ file: string; base: string; id?: string; pending?: string; error?: string }>;
    /** studio.library.promote — ask first, or promote at once */
    promoteMode(): string;
}

/** Where a file made here keeps its sidecar selection, so the sequence picker agrees with the record. */
export interface SidecarSide { metas(): MediaMeta[]; outputsDir: string }

type Msg = { [k: string]: unknown };
const str = (m: Msg, k: string): string => (typeof m[k] === 'string' ? m[k] as string : '');
const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function say(r: StudioEditOutcome): void {
    if (r.written) { vscode.window.setStatusBarMessage(`Studio — ${r.why}`, 5000); return; }
    if (r.conflict) { void vscode.window.showWarningMessage(`Studio — ${r.id}: ${r.why}`); return; }
    void vscode.window.showErrorMessage(`Studio — ${r.id}: ${r.why}`);
}

/** ✎ — which field, then its value, each box opening on what the record holds now. */
async function askEdit(msg: Msg): Promise<{ kind: StudioEditKind; value: string } | undefined> {
    const cur = (msg.current && typeof msg.current === 'object' ? msg.current : {}) as Msg;
    const shown = (k: string) => String(cur[k] ?? '').trim() || '(none)';
    const pick = await vscode.window.showQuickPick([
        { label: 'Tags', description: shown('tags'), detail: 'Comma separated — replaces the record\'s tags', field: 'tags' as StudioEditKind },
        { label: 'Score', description: shown('score'), detail: 'Your score, 0–1 or a percent — it beats the automatic one', field: 'score' as StudioEditKind },
        { label: 'Note', description: shown('note'), detail: 'The review note (moderation.notes) — not the file\'s description', field: 'note' as StudioEditKind }
    ], { placeHolder: `Edit ${str(msg, 'id')} on ${str(msg, 'base') || 'the database'}`, ignoreFocusOut: true });
    if (!pick) { return undefined; }
    const value = await vscode.window.showInputBox({
        prompt: `${pick.label} of ${str(msg, 'id')}`, value: String(cur[pick.field] ?? ''), ignoreFocusOut: true,
        validateInput: pick.field === 'score' ? (v => (scoreOf(v) === undefined ? 'A score is 0–1, or a percent 0–100' : undefined)) : undefined
    });
    return value === undefined ? undefined : { kind: pick.field, value };
}

/** ✓ / ✗ / ✎ from the page — written onto the version the card showed. */
export async function libraryEditFromPage(msg: Msg, deps: LibraryActDeps, side: SidecarSide): Promise<void> {
    let kind = str(msg, 'kind') as StudioEditKind | 'edit';
    let value: unknown;
    if (kind === 'edit') {
        const asked = await askEdit(msg);
        if (!asked) { return; }
        ({ kind, value } = asked);
    }
    const version = Number(msg.version);
    const r = await deps.edit({
        id: str(msg, 'id'), base: str(msg, 'base'), kind, value,
        ...(Number.isFinite(version) && version > 0 ? { version } : {})
    });
    const file = str(msg, 'file');
    if (r.written && (kind === 'select' || kind === 'reject') && file) {
        const m = side.metas().find(x => x.assetFiles.some(f => same(f, file)));
        if (m) {
            const urls = (m.assetUrls?.length ? m.assetUrls : m.assetFiles) ?? [];
            updateMediaMeta(side.outputsDir, m.taskId, { selectedUrls: kind === 'select' ? urls : [], rejectedUrls: kind === 'select' ? [] : urls });
        }
    }
    say(r);
}

/** ↑ from the page — raw → asset, semi → final; the file and its record move together. */
export async function libraryPromoteFromPage(msg: Msg, deps: LibraryActDeps): Promise<void> {
    const from = str(msg, 'stage');
    const to = promotionOf(from);
    const file = str(msg, 'file');
    if (!to || !file) {
        void vscode.window.showWarningMessage(`Studio — a ${from || 'file with no'} stage has no promotion: raw → asset and semi → final only.`);
        return;
    }
    if (deps.promoteMode() !== 'auto') {
        const ok = await vscode.window.showWarningMessage(
            `Promote ${path.basename(file)} from ${from} to ${to}? The file moves into the ${to} folder and its record moves with it.`,
            { modal: true, detail: 'Farm setting agentFarm.studioLibraryPromote: ask → auto promotes without this question.' }, 'Promote');
        if (ok !== 'Promote') { return; }
    }
    const r = await deps.promote({ file, stage: to, base: str(msg, 'base') || undefined, id: str(msg, 'id') || undefined });
    if (r.error) { void vscode.window.showErrorMessage(`Studio — ${path.basename(file)} was not promoted: ${r.error}`); return; }
    vscode.window.setStatusBarMessage(r.pending
        ? `Studio — ${path.basename(r.file)} moved to ${to}; its record waits for the ${r.base} engine (media.pending)`
        : `Studio — ${path.basename(r.file)} promoted to ${to} on ${r.base}`, 6000);
}
