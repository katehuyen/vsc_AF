// Tool definitions for the Airtable engine MCP server.
// Each tool: { name, description, inputSchema (JSON Schema), handler(args, ctx) }.
// Handlers return a plain object; index.ts serialises it.

import { EngineRegistry } from './engine';

type Dict = Record<string, unknown>;
interface JsonSchema { type: string; properties?: Dict; required?: string[]; additionalProperties?: boolean; items?: unknown; enum?: string[]; description?: string; }

const S = (props: Dict, required: string[] = []): JsonSchema => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });
const strArr = (description: string) => ({ type: 'array', items: { type: 'string' }, description });
const bool = (description: string) => ({ type: 'boolean', description });
const int = (description: string) => ({ type: 'integer', description });
const COLLECTIONS = ['media', 'sentences', 'lessons', 'slides', 'variants'];

export interface ToolCtx { registry: EngineRegistry; }
export interface ToolDef { name: string; description: string; inputSchema: JsonSchema; handler: (args: Dict, ctx: ToolCtx) => Promise<unknown> | unknown; }

export function buildTools(ctx: ToolCtx): ToolDef[] {
    const { registry } = ctx;
    return [
        {
            name: 'airtable_instances',
            description:
                'List the Airtable engine instances found on this machine and whether each is currently running (live). ' +
                'Call this FIRST to learn the available instance names and ports — ports change, never assume one. ' +
                'Each instance is a separate knowledge/media database (e.g. "stem", "acupuncture").',
            inputSchema: S({ force: bool('Re-scan from disk instead of using the cached list.') }),
            handler: async (args) => {
                const list = await registry.instances({ force: args.force === true });
                return {
                    default_instance: registry.cfg.defaultInstance,
                    count: list.length,
                    instances: list.map((i) => ({ name: i.name, port: i.port, host: i.host, title: i.title, live: i.live !== false, root: i.root })),
                };
            },
        },
        {
            name: 'airtable_stats',
            description: 'Item counts for an instance (lessons, slides, sentences, variants, media, media by type).',
            inputSchema: S({ instance: str('Instance name (default: configured default).') }),
            handler: (args) => registry.resolveInstance(args.instance as string).then((i) => registry.stats(i)),
        },
        {
            name: 'airtable_search',
            description:
                'Search a collection and return slim results (id, topic, tags, media type, file path, description). ' +
                'Use before saving to avoid duplicates, or to retrieve previously stored knowledge/media by keyword or tag. ' +
                'Case-insensitive substring over id/topic/subtopic/point/content/description/tags/generation_prompt.',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                collection: { type: 'string', enum: COLLECTIONS, description: 'Collection to search (default: media).' },
                query: str('Free-text keyword filter.'),
                tags: strArr('Require these tags (all must match, substring-wise).'),
                status: str('Filter by exact status (draft, published, archived, quarantine).'),
                limit: int('Max results (default 25).'),
                lang: str('Language tree (default TR).'),
            }),
            handler: (args) => registry.search(args.instance as string, {
                collection: args.collection as string, query: args.query as string, tags: args.tags as string[],
                status: args.status as string, limit: args.limit as number, lang: args.lang as string,
            }),
        },
        {
            name: 'airtable_get',
            description: 'Fetch one full record by collection + id (the complete stored JSON, all sections).',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                collection: { type: 'string', enum: COLLECTIONS, description: 'Collection.' },
                id: str('Record id, e.g. media_jpg_20260721_0001.'),
                lang: str('Language tree (default TR).'),
            }, ['collection', 'id']),
            handler: async (args) => {
                const inst = await registry.resolveInstance(args.instance as string);
                return registry.getItem(inst, args.collection as string, args.id as string, args.lang as string);
            },
        },
        {
            name: 'airtable_media_templates',
            description:
                'List media templates for an instance. A template pre-fills common fields (base path, style, usage_context…) ' +
                'so you only supply what varies. Pass a template name to airtable_media_save to base a record on it.',
            inputSchema: S({ instance: str('Instance name (default: configured default).'), lang: str('Language tree (default TR).') }),
            handler: async (args) => {
                const inst = await registry.resolveInstance(args.instance as string);
                const list = await registry.mediaTemplates(inst, args.lang as string);
                return { instance: inst.name, count: Array.isArray(list) ? list.length : 0, templates: list };
            },
        },
        {
            name: 'airtable_media_scan_folder',
            description:
                'Scan a folder for media files and report which are ALREADY saved in the instance (matched by file path) ' +
                'and which are NEW. Drives an ingest loop: scan, then airtable_media_save each new file. ' +
                'Files are referenced by absolute path; never moved or copied.',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                folder: str('Absolute folder path, or a path relative to a configured mediaRoot.'),
                recursive: bool('Descend into subfolders (default false).'),
                lang: str('Language tree (default TR).'),
            }, ['folder']),
            handler: (args) => registry.mediaScanFolder(args.instance as string, { folder: args.folder as string, recursive: args.recursive as boolean, lang: args.lang as string }),
        },
        {
            name: 'airtable_media_save',
            description:
                'Create a media record that references an existing media file by path (no copy/move). The CORE ingest action: ' +
                'supply the meaningful metadata — topic, a short description (content), keyword tags, and for AI-generated media ' +
                'the provenance (generation_prompt, model, seed, steps). For a trial that did not fully work but is worth keeping, ' +
                'set status="quarantine" and failure { is_failed, salvageable, salvage_notes }. The engine assigns the id, extracts ' +
                'image dimensions, and updates its index. Everything you omit stays at sensible defaults. Check airtable_search first to avoid duplicates.',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                file_path: str('Absolute path to the media file, or relative to a configured mediaRoot. Required.'),
                topic: str('Main subject / title of the media (short).'),
                subtopic: str('Optional contextual subtitle.'),
                content: str('Short human description of what the media is / shows (defaults to the filename).'),
                description: str('Optional longer description.'),
                name: str('Optional short name/label.'),
                tags: strArr('Keyword tags for later retrieval (also copied into seo.keywords if empty).'),
                style: str('Style label, e.g. marketing, youtube, cinematic.'),
                content_role: str('Role, e.g. intro_outro, b_roll, thumbnail, concept.'),
                usage_context: str('Where it is meant to be used, e.g. marketing, lesson, social.'),
                status: { type: 'string', enum: ['draft', 'published', 'archived', 'quarantine'], description: 'Lifecycle status (default draft). Use quarantine for kept-but-unselected trials.' },
                template: str('Optional media template name to base defaults on.'),
                skip_if_exists: bool('If true, return the existing record instead of creating a duplicate for the same file.'),
                provenance: S({
                    generation_prompt: str('The prompt used to generate the media.'),
                    negative_prompt: str('Negative prompt, if any.'),
                    model: str('Model name (e.g. flux, veo, sora).'),
                    model_version: str('Model version.'),
                    seed: int('Generation seed.'), steps: int('Sampling steps.'),
                    cfg_scale: { type: 'number', description: 'CFG / guidance scale.' },
                    sampling_method: str('Sampler name.'),
                    origin: str('Origin, e.g. ai_generated, captured, edited.'),
                    production_type: str('Production type / pipeline.'),
                }),
                failure: S({
                    is_failed: bool('True if this attempt did not meet the goal.'),
                    salvageable: bool('True if parts are reusable.'),
                    reason: str('Why it failed / what is off.'),
                    salvage_notes: str('What is still useful about it.'),
                }),
                lang: str('Language tree (default TR).'),
                extra: { type: 'object', description: 'Escape hatch: any additional record fields to deep-merge (advanced).' },
            }, ['file_path']),
            handler: (args) => registry.mediaSave(args.instance as string, args),
        },
        {
            name: 'airtable_media_update',
            description:
                'Update an existing media record by id: deep-merges your patch into the current record and saves it through the ' +
                'engine (version check, backup, index + audit). Use to enrich a draft (add topic/tags/provenance) or fix a field. ' +
                'The patch mirrors the record shape, e.g. { "topic": "...", "tags": ["a","b"], "status": "published" }.',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                id: str('Media record id to update. Required.'),
                patch: { type: 'object', description: 'Fields to merge into the record (mirrors the record shape). Required.' },
                lang: str('Language tree (default TR).'),
            }, ['id', 'patch']),
            handler: (args) => registry.mediaUpdate(args.instance as string, args),
        },
        {
            name: 'airtable_knowledge_save',
            description:
                'Save an atomic piece of knowledge as a "sentence" record. Supply the content (the atomic statement) plus optional ' +
                'taxonomy (domain/discipline/field/branch), topic/subtopic/point, level, style, and tags. The engine assigns the id, ' +
                'counts words, and indexes it for later retrieval via airtable_search collection="sentences".',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                content: str('The atomic knowledge statement. Required.'),
                topic: str('Topic.'), subtopic: str('Subtopic.'), point: str('The specific point/heading.'),
                domain: str('Taxonomy: domain (e.g. Bilim).'), discipline: str('Taxonomy: discipline.'),
                field: str('Taxonomy: field.'), branch: str('Taxonomy: branch.'),
                level: str('Audience level, e.g. highschool, undergrad.'),
                style: str('Style, e.g. school, casual.'),
                tags: strArr('Keyword tags.'),
                status: { type: 'string', enum: ['draft', 'published', 'archived'], description: 'Status (default draft).' },
                lang: str('Language tree (default TR).'),
                extra: { type: 'object', description: 'Escape hatch for any other sentence fields (advanced).' },
            }, ['content']),
            handler: (args) => registry.knowledgeSave(args.instance as string, args),
        },
        {
            name: 'airtable_note_save',
            description:
                'Save a free-form markdown/text note into the instance notes archive (Archive/001_notes/<path>). Use for looser ' +
                'material that is not an atomic sentence or a media file — drafts, references, run logs.',
            inputSchema: S({
                instance: str('Instance name (default: configured default).'),
                path: str('Relative note path, e.g. "ideas/2026-07/topic.md". Required.'),
                content: str('Note body (markdown/plain text). Required.'),
            }, ['path', 'content']),
            handler: (args) => registry.noteSave(args.instance as string, args),
        },
    ];
}
