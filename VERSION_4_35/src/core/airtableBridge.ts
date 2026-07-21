import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { EngineRegistry } from '../mcp/airtable/engine';

/**
 * Farm bridge ops for the Airtable engine (§ constitution 19.C). Everything an
 * agent can do through the MCP tools, it can also drive through the farm bridge
 * — and the user's UI actions route here too. Handlers call the shared engine
 * client (src/mcp/airtable/engine); no engine logic is re-implemented.
 *
 * Registration lives here (not inline in extension.ts) so a test can dispatch
 * against a fresh BridgeRegistry with a fixture registry.
 */

export interface AirtableBridgeDeps {
    /** Fresh registry from the current settings (discovery is cheap). */
    getRegistry: () => EngineRegistry;
}

function pickArgs(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of keys) { if (args[k] !== undefined) { out[k] = args[k]; } }
    return out;
}

export function registerAirtableOps(bridge: BridgeRegistry, deps: AirtableBridgeDeps): void {
    const reg = () => deps.getRegistry();

    bridge.register([
        {
            op: 'airtable.instances',
            describe: 'Discover Airtable engine instances on this machine + live status (call first — ports change). args: force?',
            handler: async (args) => {
                const list = await reg().instances({ force: args.force === true });
                return list.map((i) => ({ name: i.name, port: i.port, live: i.live !== false, title: i.title, root: i.root }));
            },
        },
        {
            op: 'airtable.stats',
            describe: 'Item counts for an instance (lessons/slides/sentences/variants/media). args: instance?',
            handler: async (args) => reg().stats(await reg().resolveInstance(optStr(args, 'instance') || undefined)),
        },
        {
            op: 'airtable.search',
            describe: 'Search a collection (dedupe/retrieval). args: query?, tags?, status?, collection? (media|sentences|lessons|slides|variants), limit?, instance?, lang?',
            handler: (args) => reg().search(optStr(args, 'instance') || undefined, {
                collection: optStr(args, 'collection') || undefined, query: optStr(args, 'query'),
                tags: Array.isArray(args.tags) ? args.tags as string[] : undefined,
                status: optStr(args, 'status') || undefined,
                limit: typeof args.limit === 'number' ? args.limit : undefined, lang: optStr(args, 'lang') || undefined,
            }),
        },
        {
            op: 'airtable.get',
            describe: 'Full record by collection + id. args: collection, id, instance?, lang?',
            handler: async (args) => {
                const inst = await reg().resolveInstance(optStr(args, 'instance') || undefined);
                return reg().getItem(inst, argStr(args, 'collection'), argStr(args, 'id'), optStr(args, 'lang') || undefined);
            },
        },
        {
            op: 'airtable.mediaSave',
            describe: 'Create a media record referencing a file by path. args: file_path, topic?, content?, tags?, style?, content_role?, usage_context?, status?, provenance?, failure?, template?, skip_if_exists?, instance?, lang?',
            handler: (args) => {
                need(optStr(args, 'file_path'), 'file_path is required');
                return reg().mediaSave(optStr(args, 'instance') || undefined, args);
            },
        },
        {
            op: 'airtable.mediaUpdate',
            describe: 'Update a media record by id (deep-merge patch, version-checked). args: id, patch, instance?, lang?',
            handler: (args) => {
                need(optStr(args, 'id'), 'id is required');
                need(args.patch && typeof args.patch === 'object', 'patch (object) is required');
                return reg().mediaUpdate(optStr(args, 'instance') || undefined, args);
            },
        },
        {
            op: 'airtable.knowledgeSave',
            describe: 'Save an atomic knowledge "sentence". args: content, topic?, subtopic?, point?, domain?, discipline?, field?, branch?, level?, style?, tags?, status?, instance?, lang?',
            handler: (args) => {
                need(optStr(args, 'content'), 'content is required');
                return reg().knowledgeSave(optStr(args, 'instance') || undefined, args);
            },
        },
        {
            op: 'airtable.noteSave',
            describe: 'Save a free-form markdown note (Archive/001_notes). args: path, content, instance?',
            handler: (args) => reg().noteSave(optStr(args, 'instance') || undefined, {
                path: argStr(args, 'path'), content: optStr(args, 'content'),
            }),
        },
        {
            op: 'airtable.scanFolder',
            describe: 'List media files in a folder and flag which are already in the DB. args: folder, recursive?, instance?, lang?',
            handler: (args) => reg().mediaScanFolder(optStr(args, 'instance') || undefined, {
                folder: argStr(args, 'folder'), recursive: args.recursive === true, lang: optStr(args, 'lang') || undefined,
            }),
        },
        {
            op: 'airtable.ingestFolder',
            describe: 'Scan a folder and create a DRAFT media record for every NEW file (skips those already in the DB). Enrichment (topic/tags/provenance) is left to an agent. args: folder, recursive?, status? (draft|quarantine), instance?, lang?',
            handler: async (args) => {
                const registry = reg();
                const instance = optStr(args, 'instance') || undefined;
                const scan = await registry.mediaScanFolder(instance, {
                    folder: argStr(args, 'folder'), recursive: args.recursive === true, lang: optStr(args, 'lang') || undefined,
                }) as { instance: string; items: { file_path: string; in_db: boolean }[] };
                const status = optStr(args, 'status') || 'draft';
                const saved: string[] = [];
                const errors: string[] = [];
                for (const it of scan.items.filter((x) => !x.in_db)) {
                    try {
                        const out = await registry.mediaSave(scan.instance, {
                            ...pickArgs(args, ['lang']), file_path: it.file_path, status, skip_if_exists: true,
                        }) as { id: string };
                        saved.push(out.id);
                    } catch (e) { errors.push(String((e as Error).message).slice(0, 160)); }
                }
                return { instance: scan.instance, new_files: scan.items.filter((x) => !x.in_db).length, saved: saved.length, ids: saved, errors };
            },
        },
    ]);
}
