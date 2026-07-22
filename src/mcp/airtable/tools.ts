// Tool surface of the Airtable Engine MCP server: names, schemas, handlers.
// Every handler re-reads the config (fresh settings without a restart), and
// resolveInstance turns "which engine?" into a helpful, self-correcting error
// instead of a guess — ports move, instances come and go.

import { loadConfig, NOT_CONFIGURED } from './config';
import {
    checkInstances, discoverInstances, EngineClient, resolveInstance,
    saveMedia, saveSentence, scanFolder, searchRecords, summarizeRecord, updateRecord
} from './engine';

type Dict = Record<string, unknown>;

export interface ToolDef {
    name: string;
    description: string;
    inputSchema: Dict;
    handler(args: Dict): Promise<unknown>;
}

const str = (description: string): Dict => ({ type: 'string', description });
const arr = (description: string): Dict => ({ type: 'array', items: { type: 'string' }, description });
const obj = (description: string): Dict => ({ type: 'object', description });

const COMMON_PROPS: Dict = {
    instance: str('Engine instance name (folder name, e.g. "stem"). Omit = the configured default, or the single running one.'),
    lang: str('Language tree (e.g. "TR", "EN"). Omit = the configured default (engine falls back to TR).')
};

function schema(props: Dict, required: string[] = []): Dict {
    return { type: 'object', properties: { ...COMMON_PROPS, ...props }, required };
}

async function client(args: Dict): Promise<{ c: EngineClient; lang?: string }> {
    const config = loadConfig();
    if (!config.databaseRoots.length) { throw new Error(NOT_CONFIGURED); }
    const c = await resolveInstance(config, typeof args.instance === 'string' ? args.instance : undefined);
    const lang = typeof args.lang === 'string' && args.lang.trim()
        ? args.lang.trim() : (config.defaultLang || undefined);
    return { c, lang };
}

const sList = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : undefined;

export const TOOLS: ToolDef[] = [
    {
        name: 'airtable_instances',
        description: 'Discover Airtable Engine instances under the configured database roots and health-check each one (alive, port, title). CALL THIS FIRST when unsure which engine is running — ports are not stable.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
            const config = loadConfig();
            if (!config.databaseRoots.length) { throw new Error(NOT_CONFIGURED); }
            const found = discoverInstances(config.databaseRoots);
            const checked = await checkInstances(found);
            return {
                databaseRoots: config.databaseRoots,
                defaultInstance: config.defaultInstance || null,
                instances: checked.map(i => ({
                    name: i.name, port: i.port, host: i.host, alive: i.alive,
                    title: i.title, dir: i.dir, error: i.error
                }))
            };
        }
    },
    {
        name: 'airtable_stats',
        description: 'Record counts of one instance (lessons/slides/sentences/variants/media, media by type).',
        inputSchema: schema({}),
        handler: async (args) => {
            const { c, lang } = await client(args);
            return { instance: c.instance.name, stats: await c.stats(lang) };
        }
    },
    {
        name: 'airtable_search',
        description: 'Keyword/tag search in a collection (media, sentences, lessons, slides, variants). Case-insensitive substring over id/topic/subtopic/content/description/tags/generation-prompt. Use before saving to avoid duplicates, and to re-find stored work.',
        inputSchema: schema({
            collection: str('Collection to search: media | sentences | lessons | slides | variants.'),
            query: str('Free-text substring (matches any indexed field).'),
            tags: arr('Tags that must ALL be present on a hit.'),
            limit: { type: 'number', description: 'Max hits returned (default 25).' }
        }, ['collection']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            const items = await c.listItems(String(args.collection), lang);
            const hits = searchRecords(items, typeof args.query === 'string' ? args.query : undefined, sList(args.tags));
            const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 25;
            return {
                instance: c.instance.name,
                total: hits.length,
                shown: Math.min(hits.length, limit),
                hits: hits.slice(0, limit).map(summarizeRecord)
            };
        }
    },
    {
        name: 'airtable_get',
        description: 'Fetch ONE full record by id (all ~200 fields, plus version/mtime).',
        inputSchema: schema({
            collection: str('Collection the record lives in.'),
            id: str('Record id, e.g. media_png_20260614_0001.')
        }, ['collection', 'id']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            return await c.getRecord(String(args.collection), String(args.id), lang);
        }
    },
    {
        name: 'airtable_media_templates',
        description: 'List the media templates of an instance (pre-filled field sets — pass a template name to airtable_media_save so recurring fields are set once, not per record).',
        inputSchema: schema({}),
        handler: async (args) => {
            const { c, lang } = await client(args);
            return { instance: c.instance.name, templates: await c.mediaTemplates(lang) };
        }
    },
    {
        name: 'airtable_media_scan_folder',
        description: 'Scan a folder (recursive) and split its files into NEW (no media record yet) vs KNOWN (already recorded, matched on media.file_path). This feeds the ingest loop: scan → describe each new file → airtable_media_save.',
        inputSchema: schema({
            folder: str('Absolute folder path to scan (e.g. a media library subfolder).'),
            recursive: { type: 'boolean', description: 'Descend into subfolders (default true).' }
        }, ['folder']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            return await scanFolder(c, String(args.folder), lang, args.recursive !== false);
        }
    },
    {
        name: 'airtable_media_save',
        description: 'CREATE a media record referencing a file by ABSOLUTE PATH (the file is not moved or copied). Technical metadata (size, format, image dimensions) is extracted automatically; you provide the meaning: topic, content (short description), tags. For AI-generated media pass provenance (generation_prompt, model, seed…); for kept-but-not-chosen trials use status "quarantine" and failure {is_failed, reason, salvageable}.',
        inputSchema: schema({
            file: str('Absolute path of the media file to record.'),
            topic: str('Short subject/title of the media.'),
            content: str('Short description (defaults to the file name).'),
            description: str('Longer free-form description.'),
            tags: arr('Keywords for later retrieval (also copied to seo.keywords when empty).'),
            status: str('draft (default) | published | quarantine (kept trial) | archived.'),
            template: str('Media template name to merge (see airtable_media_templates).'),
            style: str('e.g. cinematic, marketing, youtube.'),
            content_role: str('e.g. concept, b_roll, thumbnail, intro_outro.'),
            usage_context: str('e.g. lesson, marketing, social.'),
            subtopic: str('Optional finer subject.'),
            name: str('Optional display name.'),
            provenance: obj('AI generation details: { generation_prompt, negative_prompt, model, model_version, seed, steps, cfg_scale, sampling_method, origin: "ai_generated", production_type }.'),
            failure: obj('For kept failures: { is_failed: true, reason, salvage_notes, salvageable }.'),
            extra: obj('Any other schema fields to merge verbatim (advanced).')
        }, ['file', 'topic']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            const res = await saveMedia(c, {
                file: String(args.file),
                topic: typeof args.topic === 'string' ? args.topic : undefined,
                subtopic: typeof args.subtopic === 'string' ? args.subtopic : undefined,
                content: typeof args.content === 'string' ? args.content : undefined,
                description: typeof args.description === 'string' ? args.description : undefined,
                name: typeof args.name === 'string' ? args.name : undefined,
                tags: sList(args.tags),
                status: typeof args.status === 'string' ? args.status : undefined,
                template: typeof args.template === 'string' ? args.template : undefined,
                style: typeof args.style === 'string' ? args.style : undefined,
                content_role: typeof args.content_role === 'string' ? args.content_role : undefined,
                usage_context: typeof args.usage_context === 'string' ? args.usage_context : undefined,
                provenance: (args.provenance ?? undefined) as Dict | undefined,
                failure: (args.failure ?? undefined) as Dict | undefined,
                extra: (args.extra ?? undefined) as Dict | undefined,
                lang
            });
            return { instance: c.instance.name, id: res.id, rel: res.rel };
        }
    },
    {
        name: 'airtable_media_update',
        description: 'Update fields of an EXISTING record: reads the current version, deep-merges your patch, writes back with optimistic concurrency (a conflicting panel edit raises version_conflict instead of being overwritten).',
        inputSchema: schema({
            collection: str('Collection of the record (default media).'),
            id: str('Record id to update.'),
            patch: obj('Fields to merge, e.g. { "status": "published", "tags": [...] }. Arrays/scalars replace; objects merge.')
        }, ['id', 'patch']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            const collection = typeof args.collection === 'string' && args.collection ? args.collection : 'media';
            const res = await updateRecord(c, collection, String(args.id), (args.patch ?? {}) as Dict, lang);
            return { instance: c.instance.name, id: args.id, version: res.version };
        }
    },
    {
        name: 'airtable_knowledge_save',
        description: 'CREATE a knowledge atom (one atomic piece of knowledge) in the sentences collection: content is the sentence itself; add topic/tags so it can be found again.',
        inputSchema: schema({
            content: str('The knowledge atom — one self-contained sentence/statement.'),
            topic: str('Subject it belongs to.'),
            subtopic: str('Finer subject.'),
            point: str('The specific point being made.'),
            tags: arr('Keywords for retrieval.'),
            status: str('draft (default) | published.'),
            level: str('Audience level, e.g. beginner/intermediate/advanced.'),
            semantic: obj('Optional semantic fields: { key_concept, claim_type, related_concepts[], standalone… }.'),
            provenance: obj('Optional origin info: { source_material, original_context, origin_type… }.'),
            extra: obj('Any other schema fields to merge verbatim (advanced).')
        }, ['content']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            const res = await saveSentence(c, {
                content: String(args.content),
                topic: typeof args.topic === 'string' ? args.topic : undefined,
                subtopic: typeof args.subtopic === 'string' ? args.subtopic : undefined,
                point: typeof args.point === 'string' ? args.point : undefined,
                tags: sList(args.tags),
                status: typeof args.status === 'string' ? args.status : undefined,
                level: typeof args.level === 'string' ? args.level : undefined,
                semantic: (args.semantic ?? undefined) as Dict | undefined,
                provenance: (args.provenance ?? undefined) as Dict | undefined,
                extra: (args.extra ?? undefined) as Dict | undefined,
                lang
            });
            return { instance: c.instance.name, id: res.id, rel: res.rel };
        }
    },
    {
        name: 'airtable_note_save',
        description: 'Save a free-form markdown/text note into the instance archive (Archive/001_notes/<path>) — for meeting notes, research dumps, anything not atomic enough for a record.',
        inputSchema: schema({
            path: str('Note path relative to the notes root, e.g. "research/2026-07-22-flow-findings.md".'),
            content: str('The note body (markdown or plain text).')
        }, ['path', 'content']),
        handler: async (args) => {
            const { c, lang } = await client(args);
            await c.saveNote(String(args.path), String(args.content), lang);
            return { instance: c.instance.name, saved: args.path };
        }
    }
];
