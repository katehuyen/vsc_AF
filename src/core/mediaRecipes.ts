/**
 * M-49 — the tool step's recipes: zero-token local media work. Each recipe turns
 * its parameters into ffmpeg ARGUMENT LISTS (never a shell line — nothing here is
 * quoted for a shell, so nothing can be injected through one) plus the helper
 * files it needs (the concat list) and the outputs it will write. Running them
 * is src/core/toolRun.ts; this is pure, given the input's duration.
 */
import * as path from 'path';

export type RecipeId = 'split' | 'concat' | 'extractAudio' | 'muxAudio' | 'reframe' | 'burnSubtitles' | 'short' | 'keyframes' | 'loudnorm' | 'transcode';
export type Overwrite = 'never' | 'always' | 'suffix';
export interface RecipeParam {
    name: string;
    type: 'number' | 'text' | 'enum' | 'file' | 'files';
    default?: unknown;
    options?: string[];
    min?: number;
    max?: number;
    required?: boolean;
    describe: string;
}

export interface Recipe { id: RecipeId; label: string; describe: string; input: boolean; params: RecipeParam[] }
export interface RecipePreset { name: string; recipe: RecipeId; params: Record<string, unknown> }

interface RecipesModule {
    OVERWRITES: Overwrite[];
    RECIPES: Recipe[];
    PRESETS: RecipePreset[];
    inherited(recipeId: string, presetName: string | undefined, name: string): { value: unknown; from: 'preset' | 'builtin'; preset?: string };
}

// The catalogue is data the page reads too: media/afRecipes.js — this is its typed door.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: RecipesModule = require(path.join(__dirname, '..', '..', 'media', 'afRecipes.js'));

export const OVERWRITES: readonly Overwrite[] = impl.OVERWRITES;
export const RECIPES: readonly Recipe[] = impl.RECIPES;
export const recipe = (id: string): Recipe | undefined => RECIPES.find(r => r.id === id);
/** Named parameter sets (M-49 presets) — the one a production reaches for, not a copy of a recipe. */
export const RECIPE_PRESETS: readonly RecipePreset[] = impl.PRESETS;
/** A parameter's value when a step leaves it blank: the preset's, else the recipe's own. */
export const inheritedParam = impl.inherited;

export interface RecipeCall {
    recipe: string;
    /** the input file (every recipe but concat) */
    input?: string;
    params?: Record<string, unknown>;
    outDir: string;
    overwrite?: Overwrite;
}

export interface RecipePlan {
    /** each run is one ffmpeg call's arguments, run in order */
    runs: string[][];
    /** helper files written before the runs (the concat list) */
    files: { path: string; text: string }[];
    outputs: string[];
}

/** The parameters with their defaults, each checked against its range. */
export function recipeParams(r: Recipe, given: Record<string, unknown> = {}): { params: Record<string, unknown> } | { error: string } {
    const out: Record<string, unknown> = {};
    const unknown = Object.keys(given).filter(k => !r.params.some(p => p.name === k));
    if (unknown.length) { return { error: `${r.id} has no parameter ${unknown.map(k => `"${k}"`).join(', ')} (it takes ${r.params.map(p => p.name).join(', ')})` }; }
    for (const p of r.params) {
        const v = given[p.name] ?? p.default;
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) {
            if (p.required) { return { error: `${r.id} needs "${p.name}" — ${p.describe}` }; }
            continue;
        }
        if (p.type === 'number') {
            const x = Number(v);
            if (!Number.isFinite(x) || (p.min !== undefined && x < p.min) || (p.max !== undefined && x > p.max)) {
                return { error: `${r.id} ${p.name} is ${p.min}–${p.max}, not ${String(v)}` };
            }
            out[p.name] = x;
        } else if (p.type === 'enum') {
            if (!p.options!.includes(String(v))) { return { error: `${r.id} ${p.name} is one of ${p.options!.join(', ')}, not "${String(v)}"` }; }
            out[p.name] = String(v);
        } else if (p.type === 'files') {
            out[p.name] = (Array.isArray(v) ? v : String(v).split(/\r?\n|,/)).map(x => String(x).trim()).filter(Boolean);
        } else { out[p.name] = String(v); }
    }
    return { params: out };
}

/** A path inside a filter graph: forward slashes, the drive colon and quotes escaped. */
export const filterPath = (p: string): string => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, '\\\'')}'`;

const ratio = (a: string): number => { const [w, h] = a.split(':').map(Number); return w / h; };
const even = (x: number): number => Math.max(2, Math.round(x / 2) * 2);
const secs = (x: number): string => String(Math.round(x * 10) / 10);
/** The reframe filter: crop to the aspect from the centre, or fit inside it with bars. */
function reframeVf(p: Record<string, unknown>): string {
    const a = ratio(p.aspect as string);
    if (p.mode === 'crop') { return `crop=trunc(min(iw\\,ih*${a.toFixed(6)})/2)*2:trunc(min(ih\\,iw/${a.toFixed(6)})/2)*2`; }
    const H = even(p.height as number), W = even(H * a);
    return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

/**
 * The plan for one call. `durationSec` is the input's length (split and
 * keyframes need it); `exists` tells an output that is already there, for the
 * overwrite policy.
 */
export function planRecipe(call: RecipeCall, facts: { durationSec?: number; exists?: (p: string) => boolean } = {}): RecipePlan | { error: string } {
    const r = recipe(call.recipe);
    if (!r) { return { error: `there is no recipe "${call.recipe}" — ${RECIPES.map(x => x.id).join(', ')}` }; }
    if (r.input && !call.input) { return { error: `${r.id} needs an input file` }; }
    const pp = recipeParams(r, call.params);
    if ('error' in pp) { return pp; }
    const p = pp.params;
    const policy: Overwrite = call.overwrite ?? 'never';
    const exists = facts.exists ?? (() => false);
    const base = call.input ? path.basename(call.input, path.extname(call.input)) : 'out';
    const ext = call.input ? path.extname(call.input) || '.mp4' : '.mp4';
    const taken: string[] = [];
    const out = (name: string): string => {
        let f = path.join(call.outDir, name);
        if (policy === 'suffix') {
            const e2 = path.extname(name), b = name.slice(0, name.length - e2.length);
            for (let i = 2; exists(f) || taken.includes(f); i++) { f = path.join(call.outDir, `${b}-${i}${e2}`); }
        }
        taken.push(f);
        return f;
    };
    const head = policy === 'always' ? ['-hide_banner', '-y'] : ['-hide_banner', '-n'];
    const inp = call.input ? ['-i', call.input] : [];
    const one = (args: string[], file: string): RecipePlan => ({ runs: [[...head, ...inp, ...args, file]], files: [], outputs: [file] });
    const needDur = (): string => (facts.durationSec && facts.durationSec > 0 ? '' : `${r.id} needs the input's duration, which could not be read`);
    const plan = ((): RecipePlan | { error: string } => {
        switch (r.id) {
            case 'split': {
                if (needDur()) { return { error: needDur() }; }
                const seg = p.segmentSec as number, lap = p.overlapSec as number;
                if (lap >= seg) { return { error: `split overlap (${lap}s) must be shorter than a part (${seg}s)` }; }
                const runs: string[][] = [], outputs: string[] = [];
                for (let start = 0, i = 1; start < facts.durationSec! - 0.05; start += seg - lap, i++) {
                    const len = Math.min(seg, facts.durationSec! - start);
                    const f = out(`${base}_part${String(i).padStart(3, '0')}${ext}`);
                    runs.push([...head, '-ss', start.toFixed(3), '-i', call.input!, '-t', len.toFixed(3),
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-avoid_negative_ts', 'make_zero', f]);
                    outputs.push(f);
                    if (start + seg >= facts.durationSec!) { break; }
                }
                return { runs, files: [], outputs };
            }
            case 'concat': {
                const files = p.files as string[];
                const list = path.join(call.outDir, `${String(p.name).replace(/\.[^.]+$/, '')}.concat.txt`);
                const f = out(String(p.name));
                return {
                    runs: [[...head, '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', f]],
                    files: [{ path: list, text: files.map(x => `file '${x.replace(/\\/g, '/').replace(/'/g, '\'\\\'\'')}'`).join('\n') + '\n' }],
                    outputs: [f]
                };
            }
            case 'extractAudio': {
                const fmt = p.format as string;
                const codec = fmt === 'wav' ? ['-c:a', 'pcm_s16le'] : fmt === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'aac', '-b:a', '192k'];
                return one(['-vn', ...codec], out(`${base}.${fmt}`));
            }
            case 'muxAudio': {
                const off = p.offsetSec as number, f = out(`${base}_muxed${ext}`);
                return {
                    runs: [[...head, '-i', call.input!, ...(off ? ['-itsoffset', off.toFixed(3)] : []), '-i', String(p.audio),
                        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', f]],
                    files: [], outputs: [f]
                };
            }
            case 'reframe':
                return one(['-vf', reframeVf(p), '-c:a', 'copy'], out(`${base}_${String(p.aspect).replace(':', 'x')}${ext}`));
            case 'burnSubtitles':
                return one(['-vf', `subtitles=${filterPath(String(p.subtitles))}`, '-c:a', 'copy'], out(`${base}_subbed${ext}`));
            case 'short': {
                // seeking before -i restarts the clock at the moment, so the SRT is timed from its first frame
                const s = p.start as number, e = p.end as number;
                if (e <= s) { return { error: `short end (${e}s) must be after its start (${s}s)` }; }
                if (facts.durationSec && s >= facts.durationSec) { return { error: `short start (${s}s) is past the end of the input (${facts.durationSec.toFixed(1)}s)` }; }
                const f = out(`${base}_short_${secs(s)}-${secs(e)}${ext}`);
                const srt = String(p.srt ?? '').trim();
                const subFile = f.slice(0, f.length - path.extname(f).length) + '.srt';
                const vf = reframeVf(p) + (srt ? `,subtitles=${filterPath(subFile)}` : '');
                return {
                    runs: [[...head, '-ss', s.toFixed(3), '-i', call.input!, '-t', (e - s).toFixed(3), '-vf', vf,
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', f]],
                    files: srt ? [{ path: subFile, text: srt.replace(/\r\n/g, '\n') + '\n' }] : [],
                    outputs: [f]
                };
            }
            case 'keyframes': {
                const pattern = out(`${base}_kf%03d.jpg`);
                if (p.mode === 'scene') {
                    return { runs: [[...head, ...inp, '-vf', `select=gt(scene\\,${p.threshold})`, '-fps_mode', 'vfr', '-q:v', '3', pattern]], files: [], outputs: [pattern] };
                }
                if (needDur()) { return { error: needDur() }; }
                const c = p.count as number;
                return { runs: [[...head, ...inp, '-vf', `fps=${c}/${facts.durationSec!.toFixed(3)}`, '-frames:v', String(c), '-q:v', '3', pattern]], files: [], outputs: [pattern] };
            }
            case 'loudnorm':
                return one(['-af', `loudnorm=I=${p.lufs}:TP=${p.truePeak}:LRA=11`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k'], out(`${base}_loud${ext}`));
            case 'transcode': {
                const v = p.codec === 'h265' ? 'libx265' : p.codec === 'vp9' ? 'libvpx-vp9' : 'libx264';
                const e3 = p.codec === 'vp9' ? '.webm' : '.mp4';
                const a = p.codec === 'vp9' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
                return one(['-c:v', v, '-crf', String(p.crf), ...(p.codec === 'vp9' ? ['-b:v', '0'] : ['-preset', String(p.preset)]), ...a, '-b:a', `${p.audioKbps}k`], out(`${base}_${p.codec}${e3}`));
            }
        }
    })();
    if ('error' in plan) { return plan; }
    if (policy === 'never') {
        const clash = plan.outputs.find(f => !f.includes('%') && exists(f));
        if (clash) { return { error: `${clash} is already there, and the overwrite policy is "never" (use "suffix" or "always")` }; }
    }
    return plan;
}
