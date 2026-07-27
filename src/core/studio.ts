/**
 * Studio — the content pipeline as one subject.
 *
 * Four working modules had no place that connected them: `media` (what was
 * generated, what it cost), `production` (the scene manifest and its
 * statuses), `premiere` (the sequence export) and `mediaProviders` (who
 * generates, with which key). The Gallery showed the assets; the manifest was
 * a JSON file; the export was a command; the money and the providers were
 * invisible. So the *pipeline* — the thing the user actually works — existed
 * nowhere:
 *
 *     plan → generate → triage → assign to a scene → approve → assemble
 *
 * This module is that pipeline as data. It answers, per scene, the only
 * question that moves work forward — **what is the next thing to do here** —
 * and it answers it from the evidence (are there assets? has anyone judged
 * them? is the scene approved?), never from a guess.
 *
 * Pure: metas + manifests in, state out. No fs, no vscode.
 */

import { assetKind, MediaMeta } from './media';
import { Production, SceneStatus } from './production';

/** What a scene is waiting for. Derived, in this order, from what exists. */
export type SceneAction =
    | 'generate'   // nothing has been made for it yet
    | 'triage'     // assets exist that nobody has kept or dropped
    | 'review'     // judged assets, but the scene is not approved yet
    | 'approved';  // done — it will go into the sequence

export interface StudioAsset {
    taskId: string;
    title: string;
    file?: string;
    kind: 'image' | 'video' | 'audio' | 'file';
    ts: number;
    cost: number;
    /** never been through a selection step */
    untriaged: boolean;
    kept: boolean;
    dropped: boolean;
    source: string;
}

export interface StudioScene {
    id: string;
    title: string;
    status: SceneStatus;
    counts: { image: number; video: number; audio: number; file: number };
    total: number;
    /** assets nobody has judged yet */
    untriaged: number;
    /** the newest few assets, for the strip on the row */
    thumbs: StudioAsset[];
    next: SceneAction;
}

export interface StudioProgress {
    draft: number;
    generating: number;
    review: number;
    approved: number;
    total: number;
    /** approved scenes as a percentage — the honest "how far along is this" */
    percent: number;
}

export interface StudioProduction {
    id: string;
    title: string;
    agentName: string;
    file: string;
    scenes: StudioScene[];
    progress: StudioProgress;
    /** assets that belong to this production but to no scene */
    unassigned: StudioAsset[];
    cost: number;
}

export interface StudioCost {
    today: number;
    month: number;
    total: number;
    budgetMonth: number;
}

export interface StudioInput {
    productions: { agentName: string; file: string; production: Production }[];
    metas: MediaMeta[];
    now: number;
    budgetMonth?: number;
    thumbsPerScene?: number;
}

export interface StudioState {
    productions: StudioProduction[];
    /** assets belonging to no production at all — the inbox */
    loose: StudioAsset[];
    /** every asset nobody has judged, production or not */
    untriaged: StudioAsset[];
    cost: StudioCost;
}

const EMPTY_COUNTS = (): StudioScene['counts'] => ({ image: 0, video: 0, audio: 0, file: 0 });

/** One meta becomes one asset row (its first existing file represents it). */
export function toAsset(m: MediaMeta): StudioAsset {
    const file = (m.assetFiles ?? []).find(f => !!f);
    const kept = (m.selectedUrls ?? []).length > 0;
    const dropped = (m.rejectedUrls ?? []).length > 0;
    return {
        taskId: m.taskId,
        title: m.title,
        file,
        kind: assetKind(file ?? ''),
        ts: m.ts ?? 0,
        cost: m.estCost ?? 0,
        // A selection step records BOTH lists, so "neither" means nobody has
        // looked at it — which is exactly what the triage queue is for.
        untriaged: !kept && !dropped,
        kept,
        dropped,
        source: m.source ?? 'fal'
    };
}

/**
 * What should happen next in this scene? The order matters: an empty scene
 * needs work made, assets nobody judged need a human eye before anything
 * else, and only then is a status decision meaningful.
 */
export function nextSceneAction(
    status: SceneStatus, total: number, untriaged: number
): SceneAction {
    if (total === 0) { return 'generate'; }
    if (untriaged > 0) { return 'triage'; }
    if (status === 'approved') { return 'approved'; }
    return 'review';
}

export function sceneProgress(scenes: { status: SceneStatus }[]): StudioProgress {
    const p: StudioProgress = { draft: 0, generating: 0, review: 0, approved: 0, total: scenes.length, percent: 0 };
    for (const s of scenes) { p[s.status]++; }
    p.percent = p.total ? Math.round((p.approved / p.total) * 100) : 0;
    return p;
}

const DAY = 24 * 3600 * 1000;

export function studioCost(metas: MediaMeta[], now: number, budgetMonth = 0): StudioCost {
    const startOfDay = new Date(now).setHours(0, 0, 0, 0);
    const monthAgo = now - 30 * DAY;
    let today = 0, month = 0, total = 0;
    for (const m of metas) {
        const c = m.estCost ?? 0;
        total += c;
        if (m.ts >= monthAgo) { month += c; }
        if (m.ts >= startOfDay) { today += c; }
    }
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return { today: round(today), month: round(month), total: round(total), budgetMonth };
}

/** The whole pipeline, as one object the page renders straight from. */
export function buildStudio(input: StudioInput): StudioState {
    const thumbsPerScene = input.thumbsPerScene ?? 6;
    const assets = input.metas.map(toAsset);
    const byTask = new Map(assets.map(a => [a.taskId, a]));

    const claimed = new Set<string>();
    const productions: StudioProduction[] = input.productions.map(p => {
        const mine = input.metas.filter(m => m.projectId === p.production.id);
        mine.forEach(m => claimed.add(m.taskId));
        const scenes: StudioScene[] = p.production.scenes.map(scene => {
            const sceneMetas = mine.filter(m => m.sceneId === scene.id);
            const counts = EMPTY_COUNTS();
            let untriaged = 0;
            const rows: StudioAsset[] = [];
            for (const m of sceneMetas) {
                const a = byTask.get(m.taskId);
                if (!a) { continue; }
                counts[a.kind]++;
                if (a.untriaged) { untriaged++; }
                rows.push(a);
            }
            rows.sort((a, b) => b.ts - a.ts);
            return {
                id: scene.id,
                title: scene.title,
                status: scene.status,
                counts,
                total: rows.length,
                untriaged,
                thumbs: rows.slice(0, thumbsPerScene),
                next: nextSceneAction(scene.status, rows.length, untriaged)
            };
        });
        const known = new Set(p.production.scenes.map(s => s.id));
        const unassigned = mine
            .filter(m => !m.sceneId || !known.has(m.sceneId))
            .map(m => byTask.get(m.taskId))
            .filter((a): a is StudioAsset => !!a)
            .sort((a, b) => b.ts - a.ts);
        return {
            id: p.production.id,
            title: p.production.title,
            agentName: p.agentName,
            file: p.file,
            scenes,
            progress: sceneProgress(p.production.scenes),
            unassigned,
            cost: Math.round(mine.reduce((n, m) => n + (m.estCost ?? 0), 0) * 10000) / 10000
        };
    });

    return {
        productions,
        loose: assets.filter(a => !claimed.has(a.taskId)).sort((a, b) => b.ts - a.ts),
        untriaged: assets.filter(a => a.untriaged).sort((a, b) => b.ts - a.ts),
        cost: studioCost(input.metas, input.now, input.budgetMonth)
    };
}

/** One line per scene for the "what is left" summary. */
export function pipelineSummary(p: StudioProduction): string {
    const waiting = p.scenes.filter(s => s.next === 'generate').length;
    const triage = p.scenes.reduce((n, s) => n + s.untriaged, 0);
    const review = p.scenes.filter(s => s.next === 'review').length;
    const bits: string[] = [];
    if (waiting) { bits.push(`${waiting} scene(s) with nothing made yet`); }
    if (triage) { bits.push(`${triage} asset(s) nobody has judged`); }
    if (review) { bits.push(`${review} scene(s) waiting for your verdict`); }
    if (p.unassigned.length) { bits.push(`${p.unassigned.length} asset(s) in no scene`); }
    return bits.length ? bits.join(' · ') : 'every scene is approved';
}
