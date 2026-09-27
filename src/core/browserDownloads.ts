/**
 * M-54 — WHAT A RECIPE STEP DOWNLOADED, FILED. Playwright MCP saves a download
 * into its --output-dir under the site's own file name (measured), next to its
 * own page snapshots (`page-<iso>.yml`) and screenshots (`page-<iso>.png`). When
 * the step ends, every file in that folder newer than the step's start that is
 * not one of Playwright's own is filed into the library (when the run has one),
 * named in a gallery sidecar (`<taskId>.media.json`, source `browser`) and
 * listed in the step's answer so the next step can find it.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { MediaMeta } from './media';

const OWN = /^page-\d{4}-\d{2}-\d{2}T[\d-]+Z\.(ya?ml|png|jpe?g)$/i;
const NOT_A_DOWNLOAD = /\.(ya?ml|md|log|crdownload|part|tmp)$/i;

/** The files a step downloaded: newer than its start, never Playwright's own. Oldest first. */
export function downloadedFiles(dir: string, since: number): string[] {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { return []; }
    const out: { f: string; t: number }[] = [];
    for (const n of names) {
        if (OWN.test(n) || NOT_A_DOWNLOAD.test(n)) { continue; }
        const f = path.join(dir, n);
        try {
            const st = fs.statSync(f);
            if (st.isFile() && st.size > 0 && st.mtimeMs >= since - 2000) { out.push({ f, t: st.mtimeMs }); }
        } catch { /* gone */ }
    }
    return out.sort((a, b) => a.t - b.t).map(x => x.f);
}

/** The step's answer with its downloads listed above the archive footer. */
export function withDownloads(content: string, files: string[], lines: string[] = []): string {
    const block = `\n\nDownloaded files:\n${files.map(f => `- ${f}`).join('\n')}${lines.length ? `\n${lines.map(l => `- ${l}`).join('\n')}` : ''}\n`;
    const foot = content.lastIndexOf('\n---\nFinished:');
    return foot < 0 ? content.trimEnd() + block : content.slice(0, foot).trimEnd() + block + content.slice(foot);
}

export interface BrowserRun { downloadDir: string; since: number; recipe: string; mcpConfig: string }

/** The gallery card of one recipe step. */
export function browserMediaMeta(o: {
    taskId: string; title: string; goal: string; recipe: string; files: string[]; workflowTitle?: string; ts?: number;
}): MediaMeta {
    return {
        taskId: o.taskId, title: o.title, model: `browser:${o.recipe}`, input: o.goal.slice(0, 2000),
        assetFiles: o.files, estCost: 0, ts: o.ts ?? Date.now(),
        ...(o.workflowTitle ? { workflowTitle: o.workflowTitle } : {}),
        source: 'browser'
    };
}

/** File a finished recipe step's downloads: library first (it may move them), then the sidecar and the answer. */
export async function fileBrowserDownloads(o: {
    outputsDir: string; task: { id: string; title: string; outputFile?: string }; run: BrowserRun;
    goal: string; workflowTitle?: string;
    produced?: (files: string[]) => Promise<{ files: string[]; lines: string[] }>;
}): Promise<string[]> {
    let files = downloadedFiles(o.run.downloadDir, o.run.since);
    if (!files.length) { return []; }
    let lines: string[] = [];
    if (o.produced) {
        try { const r = await o.produced(files); files = r.files; lines = r.lines; }
        catch (e) { lines = [`Library: not filed — ${(e as Error).message.slice(0, 200)}`]; }
    }
    try {
        fs.mkdirSync(o.outputsDir, { recursive: true });
        fs.writeFileSync(path.join(o.outputsDir, `${o.task.id}.media.json`), JSON.stringify(browserMediaMeta({
            taskId: o.task.id, title: o.task.title, goal: o.goal, recipe: o.run.recipe, files, workflowTitle: o.workflowTitle
        }), null, 2), 'utf8');
    } catch { /* gallery meta is best-effort */ }
    if (o.task.outputFile) {
        try { fs.writeFileSync(o.task.outputFile, withDownloads(fs.readFileSync(o.task.outputFile, 'utf8'), files, lines), 'utf8'); }
        catch { /* archive gone */ }
    }
    return files;
}
