import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optNum, optStr } from './bridge';
import {
    assetKind, injectMediaFeedback, MEDIA_EXTS, MediaMeta, readMediaMetas, registerExternalAsset,
    registeredAssetPaths, updateMediaMeta
} from './media';
import { defaultSequenceFile, SEQUENCE_FORMATS, SequenceFormat, writeSequence } from './sequenceExport';
import {
    DiscoveredProduction, discoverProductions, newProduction, PRODUCTION_FILENAME, sceneMatrix,
    SCENE_STATUSES, SceneStatus, setSceneStatus, writeProduction
} from './production';

/**
 * Studio bridge ops (B-2).
 *
 * ‼️ THE STUDIO HAD NO BRIDGE AT ALL, and it is the surface where that cost the
 * most: producing media is exactly the long, repetitive, many-step job an agent
 * should be able to drive — write the manifest, generate, judge, assign, export
 * — and every one of those gestures existed only as a card on a page a person
 * had to click. This is that page's write surface, op for op.
 *
 * Registration lives here rather than inline in extension.ts so tests can
 * dispatch against a fresh registry with fixture deps, exactly as the Toolbox's
 * does. Every handler calls the SAME core function the panel calls
 * (core/production.ts · core/media.ts · core/premiere.ts) — the rule in
 * _REF/agentfarm-dev.md is that the bridge never grows a second implementation.
 */

export interface StudioBridgeDeps {
    getAgents(): AgentInfo[];
    /** where generated assets and their .meta.json land */
    outputsDir(): string;
    /** the one that actually starts a generation — TaskManager.runMediaAdhoc */
    runMedia(title: string, model: string, input: string,
        opts?: { projectId?: string; sceneId?: string }): void;
    /** repaint an open Studio — the panel's own path, so a bridge write shows. */
    refresh?(): void;
}

/** Every production this farm can see, with the file it came out of. */
function productions(deps: StudioBridgeDeps): DiscoveredProduction[] {
    return discoverProductions(deps.getAgents());
}

function metasOf(deps: StudioBridgeDeps): MediaMeta[] {
    return readMediaMetas(deps.outputsDir());
}

export function registerStudioOps(bridge: BridgeRegistry, deps: StudioBridgeDeps): void {
    const findProduction = (ref: string): DiscoveredProduction => {
        const all = productions(deps);
        const p = all.find(x => x.production.id === ref)
            ?? all.find(x => x.production.title.toLowerCase() === ref.toLowerCase());
        need(p, `No production "${ref}" — studio.productions lists what exists.`);
        return p as DiscoveredProduction;
    };
    const findMeta = (taskId: string): MediaMeta => {
        const m = metasOf(deps).find(x => x.taskId === taskId);
        need(m, `No generation with taskId "${taskId}" in the outputs folder — studio.assets lists them.`);
        return m as MediaMeta;
    };

    bridge.register([
        {
            op: 'studio.productions',
            describe: 'Every production manifest the farm can see (production.json in an agent\'s folder), with its scenes, each scene\'s status and how many assets are attached to it. This is the read the write ops are aimed with: a production is named by its id or its title, a scene by its id. args: project? (id or title — one production in full), agent? (name|id)',
            handler: (args) => {
                const ref = optStr(args, 'project');
                const agentRef = optStr(args, 'agent').toLowerCase();
                const metas = metasOf(deps);
                const list = productions(deps).filter(p =>
                    (!ref || p.production.id === ref
                        || p.production.title.toLowerCase() === ref.toLowerCase())
                    && (!agentRef || p.agentName.toLowerCase() === agentRef || p.agentId === agentRef));
                return {
                    productions: list.map(p => ({
                        id: p.production.id, title: p.production.title,
                        agent: p.agentName, file: p.file,
                        // The matrix, not the raw scene list: an agent asking
                        // "what is left to shoot" wants the counts per kind, and
                        // it is the same row the page draws.
                        scenes: sceneMatrix(p.production, metas).map(row => ({
                            id: row.sceneId, title: row.title, status: row.status,
                            assets: row.total, counts: row.counts
                        }))
                    }))
                };
            }
        },
        {
            op: 'studio.assets',
            describe: 'Generations in the outputs folder: what was asked for, which model answered, what came back, and where it has been filed. `state` narrows to what triage has decided — kept (selected), rejected, or undecided, which is the pile worth working through. `project` narrows to one production, `scene` to one scene inside it, and `unassigned:true` to the ones filed nowhere at all. args: project?, scene?, state? (kept|rejected|undecided), unassigned?, limit? (default 100)',
            handler: (args) => {
                const project = optStr(args, 'project');
                const scene = optStr(args, 'scene');
                const state = optStr(args, 'state').toLowerCase();
                need(!state || ['kept', 'rejected', 'undecided'].includes(state),
                    `state is kept, rejected or undecided — not "${state}"`);
                const limit = Math.max(1, optNum(args, 'limit', 100));
                const rows = metasOf(deps).filter(m => {
                    if (project && m.projectId !== project) { return false; }
                    if (scene && m.sceneId !== scene) { return false; }
                    if (args.unassigned === true && m.projectId) { return false; }
                    if (state) {
                        const kept = (m.selectedUrls ?? []).length > 0;
                        const rejected = (m.rejectedUrls ?? []).length > 0;
                        if (state === 'kept' && !kept) { return false; }
                        if (state === 'rejected' && !rejected) { return false; }
                        if (state === 'undecided' && (kept || rejected)) { return false; }
                    }
                    return true;
                });
                return {
                    total: rows.length,
                    assets: rows.slice(0, limit).map(m => ({
                        taskId: m.taskId, title: m.title, model: m.model,
                        project: m.projectId ?? null, scene: m.sceneId ?? null,
                        files: m.assetFiles ?? [], urls: m.assetUrls ?? [],
                        kept: (m.selectedUrls ?? []).length > 0,
                        rejected: (m.rejectedUrls ?? []).length > 0
                    }))
                };
            }
        },
        {
            op: 'studio.production.new',
            describe: '‼️ WRITE A PRODUCTION MANIFEST — the scene list a whole shoot is then organised around, as production.json in one agent\'s folder. `scenes` is ONE TITLE PER LINE (or an array): the panel\'s own box splits on newlines and never on commas, because a scene called "Opening, wide" is one scene. Refuses if that agent already has a manifest unless `overwrite:true` — overwriting throws away every scene id, and an asset filed against an old id is then filed against nothing. args: agent (name|id), title, scenes (array or newline-separated), overwrite? (default false)',
            handler: (args) => {
                const agentRef = argStr(args, 'agent');
                const agent = deps.getAgents().find(a =>
                    a.id === agentRef || a.name.toLowerCase() === agentRef.toLowerCase());
                need(agent, `Agent "${agentRef}" not found — agents.list shows the current farm.`);
                const title = argStr(args, 'title').trim();
                need(title, 'A production needs a title.');
                const raw = args.scenes;
                const scenes = (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/\r?\n/))
                    .map(x => x.trim()).filter(Boolean);
                const file = path.join((agent as AgentInfo).dir, PRODUCTION_FILENAME);
                need(!fs.existsSync(file) || args.overwrite === true,
                    `${(agent as AgentInfo).name} already has a ${PRODUCTION_FILENAME} — pass overwrite:true if that is really meant.`);
                const made = newProduction(title, scenes);
                writeProduction(file, made);
                return {
                    id: made.id, title: made.title, agent: (agent as AgentInfo).name, file,
                    scenes: made.scenes.map(s => ({ id: s.id, title: s.title, status: s.status })),
                    note: `"${title}" created with ${scenes.length} scene(s).`
                };
            }
        },
        {
            op: 'studio.scene.status',
            describe: `Move one scene through the pipeline: ${SCENE_STATUSES.join(' → ')}. It is a fact about the SCENE and not about any one asset — a scene is "approved" when somebody decided the shot is right, which is the state an export and a progress read both go by. args: project (id or title), scene (id), status (${SCENE_STATUSES.join('|')})`,
            handler: (args) => {
                const found = findProduction(argStr(args, 'project'));
                const sceneId = argStr(args, 'scene');
                const status = argStr(args, 'status');
                need((SCENE_STATUSES as readonly string[]).includes(status),
                    `status is one of: ${SCENE_STATUSES.join(', ')}`);
                need(setSceneStatus(found.production, sceneId, status as SceneStatus),
                    `"${sceneId}" is not a scene in ${found.production.title} — studio.productions lists them.`);
                writeProduction(found.file, found.production);
                return {
                    project: found.production.title, scene: sceneId, status,
                    file: found.file, note: `${sceneId} is ${status}.`
                };
            }
        },
        {
            op: 'studio.assign',
            describe: 'File a generation against a production and a scene, which is what makes it appear in that scene\'s row and what the sequence export places. Omit BOTH `project` and `scene` to detach it — it then belongs to no production, which is a real state and not an error. Assigning to a production without a scene is allowed: it says which shoot the asset is for while the shot it answers is still undecided. args: taskId, project? (id or title), scene? (id)',
            handler: (args) => {
                const taskId = argStr(args, 'taskId');
                findMeta(taskId);
                const projectRef = optStr(args, 'project');
                if (!projectRef) {
                    updateMediaMeta(deps.outputsDir(), taskId,
                        { projectId: undefined, sceneId: undefined });
                    return { taskId, project: null, scene: null, note: 'Detached — it belongs to no production now.' };
                }
                const found = findProduction(projectRef);
                const sceneId = optStr(args, 'scene');
                need(!sceneId || found.production.scenes.some(s => s.id === sceneId),
                    `"${sceneId}" is not a scene in ${found.production.title} — studio.productions lists them.`);
                updateMediaMeta(deps.outputsDir(), taskId,
                    { projectId: found.production.id, sceneId: sceneId || undefined });
                return {
                    taskId, project: found.production.title, scene: sceneId || null,
                    note: `Assigned to ${found.production.title}${sceneId ? ' · ' + sceneId : ''}.`
                };
            }
        },
        {
            op: 'studio.asset.register',
            describe: '‼️ PUT A FILE THE FARM DID NOT GENERATE INTO THE GALLERY — a render downloaded by hand, a frame made in another tool, a clip that arrived by mail. Until now this existed only behind a file picker, so an agent could produce nothing an agent could then file. `files` is one path or an array of them; every path is checked BEFORE anything is written, so a bad one in the middle registers nothing. A file already registered is reported in `alreadyKnown`, not an error — re-running the same call is safe. The asset is external: it can be assigned, triaged and exported like any other, but it has no input to re-run. args: files (path or array), project? (id or title), scene? (id, needs project), title? (one file only), prompt? (what it was made from elsewhere), mediaKind? (image|video|audio — refuses anything else), source? (default external:bridge)',
            handler: (args) => {
                const raw = args.files ?? args.file;
                const list = (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/\r?\n/))
                    .map(x => x.trim()).filter(Boolean);
                need(list.length, 'Nothing to register — `files` is one path or an array of them.');
                const kind = optStr(args, 'mediaKind').toLowerCase();
                need(!kind || ['image', 'video', 'audio'].includes(kind),
                    `mediaKind is image, video or audio — not "${kind}"`);
                const title = optStr(args, 'title');
                need(!title || list.length === 1,
                    '`title` names ONE asset — with several files each keeps its own filename.');

                const projectRef = optStr(args, 'project');
                const sceneId = optStr(args, 'scene');
                let found: DiscoveredProduction | undefined;
                if (projectRef) {
                    found = findProduction(projectRef);
                    need(!sceneId || found.production.scenes.some(s => s.id === sceneId),
                        `"${sceneId}" is not a scene in ${found.production.title} — studio.productions lists them.`);
                } else {
                    need(!sceneId, 'A scene belongs to a production — pass `project` as well.');
                }

                // Every path is judged before a single sidecar is written: a
                // half-done registration is worse than a refused one, because
                // the caller cannot tell which half happened.
                const abs = list.map(f => path.resolve(f));
                for (const f of abs) {
                    let isFile = false;
                    try { isFile = fs.statSync(f).isFile(); } catch { /* missing */ }
                    need(isFile, `No file at ${f}.`);
                    const ext = path.extname(f).slice(1).toLowerCase();
                    need(MEDIA_EXTS.includes(ext),
                        `${path.basename(f)} is not a media file — the gallery reads ${MEDIA_EXTS.join(', ')}.`);
                    need(!kind || assetKind(f) === kind,
                        `${path.basename(f)} is ${assetKind(f)}, not ${kind}.`);
                }

                const outputs = deps.outputsDir();
                // One registry read for the whole batch — and it is what makes
                // the SAME file passed twice in one call collapse to one asset.
                const known = registeredAssetPaths(outputs);
                const registered: { taskId: string; title: string; file: string; kind: string }[] = [];
                const alreadyKnown: string[] = [];
                for (const f of abs) {
                    const meta = registerExternalAsset(outputs, f, {
                        title: title || undefined,
                        projectId: found?.production.id,
                        sceneId: sceneId || undefined,
                        source: optStr(args, 'source') || 'external:bridge',
                        input: optStr(args, 'prompt') || undefined
                    }, known);
                    if (meta) {
                        registered.push({
                            taskId: meta.taskId, title: meta.title, file: f, kind: assetKind(f)
                        });
                    } else { alreadyKnown.push(f); }
                }
                deps.refresh?.();
                return {
                    registered: registered.length, assets: registered,
                    skipped: alreadyKnown.length, alreadyKnown,
                    project: found?.production.title ?? null, scene: sceneId || null,
                    note: `${registered.length} asset(s) registered`
                        + (alreadyKnown.length ? `, ${alreadyKnown.length} already known` : '')
                        + (found ? ` — filed against ${found.production.title}` : '') + '.'
                };
            }
        },
        {
            op: 'studio.triage',
            describe: '‼️ KEEP OR REJECT WHAT CAME BACK. Judging assets used to exist only INSIDE a workflow\'s selection step, so anything generated outside one could never be judged at all — this writes the same two fields that step writes, so the gallery badges and the sequence picker honour it either way. `keep:false` rejects: the asset stays on disk and is simply not placed. args: taskId, keep (true|false)',
            handler: (args) => {
                const taskId = argStr(args, 'taskId');
                const meta = findMeta(taskId);
                const urls = (meta.assetUrls?.length ? meta.assetUrls : meta.assetFiles) ?? [];
                const keep = args.keep !== false && args.keep !== 'false';
                updateMediaMeta(deps.outputsDir(), taskId, {
                    selectedUrls: keep ? urls : [],
                    rejectedUrls: keep ? [] : urls
                });
                return { taskId, keep, assets: urls.length, note: keep ? 'Kept.' : 'Rejected — it stays on disk, it is just not placed.' };
            }
        },
        {
            op: 'studio.rerun',
            describe: '‼️ ASK THE SAME MODEL AGAIN — the three ways, and the difference between them is the whole point. Plain (`mode:"rerun"`) sends the identical input, for a provider that is not deterministic. `mode:"vary"` sends an input YOU rewrite (`input`, the provider\'s whole payload) — this is the one that used to be a JSON blob in a one-line box. `mode:"feedback"` keeps the input and folds a critique into it (`feedback`, in words: what should change), which is what to reach for when the shot is nearly right. The new run inherits the original\'s production and scene, so it lands where the first one was filed, and it appears in studio.assets when the model answers. args: taskId, mode? (rerun|vary|feedback, default rerun), input? (vary), feedback? (feedback)',
            handler: (args) => {
                const taskId = argStr(args, 'taskId');
                const meta = findMeta(taskId);
                const mode = optStr(args, 'mode') || 'rerun';
                need(['rerun', 'vary', 'feedback'].includes(mode),
                    `mode is rerun, vary or feedback — not "${mode}"`);
                let input = meta.input;
                let suffix = ' (re-run)';
                if (mode === 'vary') {
                    const edited = optStr(args, 'input');
                    need(edited.trim(), 'vary needs the new `input` — it is what the provider receives.');
                    input = edited;
                    suffix = ' (vary)';
                } else if (mode === 'feedback') {
                    const fb = optStr(args, 'feedback');
                    need(fb.trim(), 'feedback needs to SAY what should change — that is what makes it different from a plain re-run.');
                    input = injectMediaFeedback(meta.input, fb);
                    suffix = ' (feedback)';
                }
                deps.runMedia(meta.title + suffix, meta.model, input,
                    { projectId: meta.projectId, sceneId: meta.sceneId });
                return {
                    from: taskId, mode, model: meta.model,
                    project: meta.projectId ?? null, scene: meta.sceneId ?? null,
                    note: `Started — ${meta.model}. It appears in studio.assets when it finishes.`
                };
            }
        },
        {
            op: 'studio.export',
            describe: 'Write a production\'s approved assets out as an editing timeline: `format:"fcpxml"` for Premiere / Final Cut, `format:"edl"` for anything that reads a CMX3600, `format:"both"` for the XML with the EDL beside it — what the Studio\'s export card writes. Only assets ASSIGNED to a scene are placed, in scene order (studio.assign files them; studio.triage decides which of several is the one). `file` is where it is written — with none, it lands beside the production.json as <id>.xml / <id>.edl. args: project (id or title), format? (fcpxml|edl|both, default fcpxml), file?, fps? (default 30), clipSeconds? (default 5)',
            handler: (args) => {
                const found = findProduction(argStr(args, 'project'));
                const format = (optStr(args, 'format') || 'fcpxml').toLowerCase() as SequenceFormat;
                need(SEQUENCE_FORMATS.includes(format), `format is fcpxml, edl or both — not "${format}"`);
                const out = optStr(args, 'file') || defaultSequenceFile(found.file, found.production.id, format);
                const res = writeSequence(found.production, metasOf(deps), out, {
                    format, fps: optNum(args, 'fps', 30), clipSeconds: optNum(args, 'clipSeconds', 5)
                });
                need(res.clips,
                    `"${found.production.title}" has no scene assets to place — assign assets to scenes first (studio.assign).`);
                return {
                    project: found.production.title, format, file: out, files: res.files, clips: res.clips,
                    fps: res.fps, clipSeconds: res.clipSeconds,
                    note: `${res.clips} clip(s) written to ${res.files.map(f => path.basename(f)).join(' + ')}.`
                };
            }
        }
    ]);
}
