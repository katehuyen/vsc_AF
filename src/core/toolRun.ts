/**
 * M-49 — runs a media recipe (src/core/mediaRecipes.ts). ffmpeg is spawned with
 * an ARGUMENT LIST and no shell, so a path or a parameter can never become a
 * command (Shell Safety); the helper files a recipe needs are written first.
 * No ffmpeg on this machine = the call fails with a sentence that says so.
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { planRecipe, RecipeCall } from './mediaRecipes';

export interface ToolResult {
    ok: boolean;
    recipe: string;
    outputs: string[];
    ms: number;
    /** ffmpeg calls made */
    runs: number;
    /** the input's duration, when it was read */
    durationSec?: number;
    error?: string;
    /** the last lines ffmpeg wrote, when it failed */
    stderrTail?: string;
}

export interface ToolDeps {
    spawn?: typeof cp.spawn;
    /** the ffmpeg executable (default: ffmpeg on the PATH) */
    ffmpeg?: string;
    timeoutMs?: number;
}

export const NO_FFMPEG = 'ffmpeg is not installed or not on the PATH — install it (winget install Gyan.FFmpeg) and run the step again';

function run(argv: string[], d: ToolDeps): Promise<{ code: number | null; stderr: string; missing?: boolean }> {
    return new Promise(resolve => {
        let stderr = '';
        let child: cp.ChildProcess;
        try {
            child = (d.spawn ?? cp.spawn)(d.ffmpeg || 'ffmpeg', argv, { shell: false, windowsHide: true });
        } catch { resolve({ code: null, stderr: '', missing: true }); return; }
        const timer = setTimeout(() => child.kill(), d.timeoutMs ?? 30 * 60_000);
        child.stderr?.on('data', b => { stderr = (stderr + String(b)).slice(-20000); });
        child.on('error', (e: NodeJS.ErrnoException) => { clearTimeout(timer); resolve({ code: null, stderr, missing: e.code === 'ENOENT' }); });
        child.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
    });
}

/** "Duration: 00:00:34.02" off ffmpeg's own report of a file — no ffprobe needed. */
export function durationOf(stderr: string): number | undefined {
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

export async function mediaDuration(file: string, d: ToolDeps = {}): Promise<number | undefined> {
    const r = await run(['-hide_banner', '-i', file], d);
    return durationOf(r.stderr);
}

const tail = (s: string): string => s.trim().split(/\r?\n/).slice(-6).join('\n');

export async function runRecipe(call: RecipeCall, d: ToolDeps = {}): Promise<ToolResult> {
    const t0 = Date.now();
    const done = (o: Partial<ToolResult>): ToolResult => ({ ok: false, recipe: call.recipe, outputs: [], runs: 0, ms: Date.now() - t0, ...o });
    if (call.input && !fs.existsSync(call.input)) { return done({ error: `the input ${call.input} does not exist` }); }
    let durationSec: number | undefined;
    if (call.input) {
        const probe = await run(['-hide_banner', '-i', call.input], d);
        if (probe.missing) { return done({ error: NO_FFMPEG }); }
        durationSec = durationOf(probe.stderr);
    }
    const plan = planRecipe(call, { durationSec, exists: f => fs.existsSync(f) });
    if ('error' in plan) { return done({ error: plan.error, durationSec }); }
    fs.mkdirSync(call.outDir, { recursive: true });
    for (const f of plan.files) { fs.writeFileSync(f.path, f.text, 'utf8'); }
    let runs = 0;
    for (const argv of plan.runs) {
        const r = await run(argv, d);
        runs++;
        if (r.missing) { return done({ error: NO_FFMPEG, runs, durationSec }); }
        if (r.code !== 0) { return done({ error: `ffmpeg stopped with code ${r.code} on call ${runs} of ${plan.runs.length}`, stderrTail: tail(r.stderr), runs, durationSec }); }
    }
    // a pattern output (key frames: name_kf%03d.jpg) is the files it became
    const outputs = plan.outputs.flatMap(o => {
        if (!o.includes('%')) { return [o]; }
        const dir = path.dirname(o), [pre, post] = path.basename(o).split(/%\d*d/);
        return fs.readdirSync(dir).filter(f => f.startsWith(pre) && f.endsWith(post)).sort().map(f => path.join(dir, f));
    });
    return { ok: true, recipe: call.recipe, outputs, runs, ms: Date.now() - t0, ...(durationSec !== undefined ? { durationSec } : {}) };
}
