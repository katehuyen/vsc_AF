import * as fs from 'fs';
import * as path from 'path';
import { assetKind, MediaMeta } from './media';
import { slugify } from './util';

/**
 * Wave A (media roadmap) — production manifest: a small user-editable
 * `production.json` in an agent's folder describing a scene-by-scene media
 * project. The gallery groups assets by these scenes; statuses track where
 * each scene stands in the pipeline. Pure node — no vscode imports.
 */

export const SCENE_STATUSES = ['draft', 'generating', 'review', 'approved'] as const;
export type SceneStatus = typeof SCENE_STATUSES[number];

export interface ProductionScene {
    id: string;
    title: string;
    status: SceneStatus;
    notes?: string;
}

export interface Production {
    id: string;
    title: string;
    scenes: ProductionScene[];
}

export interface DiscoveredProduction {
    agentId: string;
    agentName: string;
    file: string;
    production: Production;
}

export const PRODUCTION_FILENAME = 'production.json';

/** Parse + shape-check a manifest; bad files return undefined (fail-soft). */
export function readProduction(agentDir: string): Production | undefined {
    const file = path.join(agentDir, PRODUCTION_FILENAME);
    if (!fs.existsSync(file)) { return undefined; }
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Production;
        if (!raw || typeof raw.id !== 'string' || !raw.id ||
            typeof raw.title !== 'string' || !Array.isArray(raw.scenes)) { return undefined; }
        const scenes: ProductionScene[] = [];
        for (const s of raw.scenes) {
            if (!s || typeof s.id !== 'string' || !s.id || typeof s.title !== 'string') { continue; }
            scenes.push({
                id: s.id,
                title: s.title,
                status: (SCENE_STATUSES as readonly string[]).includes(s.status) ? s.status : 'draft',
                notes: typeof s.notes === 'string' ? s.notes : undefined
            });
        }
        return { id: raw.id, title: raw.title, scenes };
    } catch { return undefined; }
}

export function discoverProductions(
    agents: { id: string; name: string; dir: string }[]
): DiscoveredProduction[] {
    const out: DiscoveredProduction[] = [];
    for (const a of agents) {
        const production = readProduction(a.dir);
        if (production) {
            out.push({ agentId: a.id, agentName: a.name, file: path.join(a.dir, PRODUCTION_FILENAME), production });
        }
    }
    return out;
}

export function writeProduction(file: string, production: Production): void {
    fs.writeFileSync(file, JSON.stringify(production, null, 2) + '\n', 'utf8');
}

/** Build a fresh manifest; scene ids are stable s01/s02/… slugs. */
export function newProduction(title: string, sceneTitles: string[]): Production {
    return {
        // ASCII: the id becomes a folder name and a key. Set once, at creation —
        // an existing manifest carries its own id and is never re-slugged.
        id: slugify(title, { ascii: true, max: 40 }) || 'production',
        title,
        scenes: sceneTitles.map((t, i) => ({
            id: 's' + String(i + 1).padStart(2, '0'),
            title: t,
            status: 'draft' as SceneStatus
        }))
    };
}

/** Returns true if the scene existed and was updated. */
export function setSceneStatus(production: Production, sceneId: string, status: SceneStatus): boolean {
    const scene = production.scenes.find(s => s.id === sceneId);
    if (!scene) { return false; }
    scene.status = status;
    return true;
}

export interface SceneMatrixRow {
    sceneId: string;
    title: string;
    status: SceneStatus | 'unassigned';
    counts: { image: number; video: number; audio: number; file: number };
    total: number;
}

/**
 * Scene × asset-kind counts for one production. Metas assigned to the project
 * but to no (or an unknown) scene land in a trailing "unassigned" row.
 */
export function sceneMatrix(production: Production, metas: MediaMeta[]): SceneMatrixRow[] {
    const mk = (sceneId: string, title: string, status: SceneMatrixRow['status']): SceneMatrixRow =>
        ({ sceneId, title, status, counts: { image: 0, video: 0, audio: 0, file: 0 }, total: 0 });
    const rows = new Map<string, SceneMatrixRow>();
    for (const s of production.scenes) { rows.set(s.id, mk(s.id, s.title, s.status)); }
    const unassigned = mk('', 'unassigned', 'unassigned');
    for (const m of metas) {
        if (m.projectId !== production.id) { continue; }
        const row = (m.sceneId && rows.get(m.sceneId)) || unassigned;
        const kind = assetKind(m.assetFiles.find(f => !!f) ?? '');
        row.counts[kind]++;
        row.total++;
    }
    const out = [...rows.values()];
    if (unassigned.total > 0) { out.push(unassigned); }
    return out;
}
