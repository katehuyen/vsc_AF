import * as fs from 'fs';
import { BridgeRegistry, need, optBool, optStr } from './bridge';
import { readMediaMetas } from './media';
import { CacheEntry, cacheOf, LibraryWall, STUDIO_VIEW_KEYS, StudioView, viewRefusal } from './studioLibrary';

/**
 * X-424 — the Studio wall over the bridge: the same reader the page's Assets
 * tab draws with (src/core/studioLibrary.ts libraryWall), so an agent sees
 * exactly the cards a person sees, cache fallback and its note included.
 */
export interface StudioLibraryOpsDeps {
    /** where the sidecar .media.json cache lives */
    outputsDir(): string;
    /** start = a stopped engine may be started (the page never starts one) */
    read(view: StudioView, cache: CacheEntry[], start: boolean): Promise<LibraryWall>;
}

export function registerStudioLibraryOps(bridge: BridgeRegistry, deps: StudioLibraryOpsDeps): void {
    bridge.register([
        {
            op: 'studio.library',
            describe: 'X-424 — THE STUDIO WALL AS DATA: the media records of a local Airtable database, one card each — {id, file, name, stage, type, topic, tags, status, failed, score, scoreBy (human|auto), fill (% of completed_sections), reason (why it failed), causes, effects (relation chain ids), version, at, from (library|cache)}. The .media.json sidecars are only a cache: used when the engine is not answering (source:"cache", note says why) and for files with no record yet. args: base? (default the setting agentFarm.studioLibraryBase, else the Airtable page\'s default), stages? (comma list of source|raw|semi|final|asset; default every stage), kind? (image|video|audio), success? (passed|failed), autoStart? (true = start a stopped engine; default false, as the page). Returns {base, source, note, view, why, cards, matched}; at most 200 cards, newest first.',
            handler: async (args) => {
                const view: StudioView = {};
                for (const k of STUDIO_VIEW_KEYS) { const v = optStr(args, k); if (v) { view[k] = v; } }
                const no = viewRefusal(view);
                need(!no, no);
                return deps.read(view, cacheOf(readMediaMetas(deps.outputsDir()), fs.existsSync), optBool(args, 'autoStart'));
            }
        }
    ]);
}
