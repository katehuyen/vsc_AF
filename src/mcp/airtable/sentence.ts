// Knowledge-atom (sentence) record assembly for the Airtable engine.
//
// A "sentence" is one atomic piece of knowledge. The engine stores it under
//   <instance>/<lang>/db/sentences/<YYYY-MM>/<id>.json
// Shape verified against a real record (W:/zome/db/stem/.../sent_20251228_0001.json).
// Ids come from GET /api/collections/sentences/next-id; the write goes through
// POST /api/file, exactly like media (no create-time validation).

import { deepMerge } from './media';

type Dict = Record<string, unknown>;

export function emptySentenceSkeleton(): Dict {
    return {
        id: '', type: 'sentence', status: 'draft',
        domain: '', discipline: '', field: '', branch: '',
        topic: '', subtopic: '', point: '', content: '',
        word_count: 0,
        content_role: '', level: '', didactic_intent: '',
        hook_psychology: '', hook_value: '',
        style: '',
        tone: { audience: '', emotion: '', energy: '', formality: '' },
        semantic: {
            claim_type: '', complexity: '', key_concept: '', related_concepts: [],
            requires_context: false, semantic_type: '', standalone: false,
        },
        format_suitability: {
            flashcard_back: 0, flashcard_front: 0, podcast_line: 0, quiz_answer: 0,
            quiz_question: 0, slide_body: 0, slide_title: 0, summary_bullet: 0,
            tiktok_hook: 0, video_script: 0,
        },
        impact_profile: { clickbait_score: 0, credibility_score: 0, shock_factor: 0, virality_score: 0 },
        quality: {
            audience_fit: 0, clarity: 0, engagement: 0, factual_accuracy: 0,
            needs_review: false, teaching_value: 0,
        },
        relations: { variants: [] },
        tags: [],
        workflow: {
            completed_sections: {
                tags: false, relations: false, content_core: false, format_scores: false,
                identity: false, impact_scores: false, pedagogical: false,
                quality_scores: false, semantic: false, style_tone: false, taxonomy: false,
            },
            completion: 0, last_action: '', last_modified: '', notes: '',
            pending_tasks: [], stage: 'draft',
        },
        batch: {
            batch_created: '', batch_id: '', batch_name: '', batch_sequence: 0,
            batch_size: 0, batch_source: '',
        },
        provenance: {
            media_intent: '', production_type: '', origin_type: '',
            original_context: '', source_material: '',
        },
        lang: 'TR', version: 1, created_at: '', published_at: '',
    };
}

export interface SentenceRecordArgs {
    id: string;
    lang?: string;
    status?: string;
    content: string;
    topic?: string; subtopic?: string; point?: string;
    domain?: string; discipline?: string; field?: string; branch?: string;
    level?: string; style?: string; content_role?: string;
    tags?: string[];
    semantic?: Dict; provenance?: Dict; extra?: Dict;
}

export function buildSentenceRecord(args: SentenceRecordArgs): Dict {
    const record = emptySentenceSkeleton();
    const content = String(args.content ?? '').trim();

    record.id = args.id;
    record.type = 'sentence';
    record.status = args.status || 'draft';
    record.lang = args.lang || 'TR';
    record.content = content;
    record.word_count = content ? content.split(/\s+/).filter(Boolean).length : 0;

    const setIf = (key: keyof SentenceRecordArgs) => {
        const v = args[key];
        if (v !== undefined) { record[key as string] = v; }
    };
    (['topic', 'subtopic', 'point', 'domain', 'discipline', 'field', 'branch',
        'level', 'style', 'content_role'] as (keyof SentenceRecordArgs)[]).forEach(setIf);
    if (Array.isArray(args.tags)) { record.tags = args.tags; }
    if (args.semantic && typeof args.semantic === 'object') { deepMerge(record.semantic as Dict, args.semantic); }
    if (args.provenance && typeof args.provenance === 'object') { deepMerge(record.provenance as Dict, args.provenance); }

    const nowIso = new Date().toISOString();
    record.created_at = nowIso;
    record.published_at = (record.status === 'published') ? nowIso : '';
    record.version = 1;

    if (args.extra && typeof args.extra === 'object') { deepMerge(record, args.extra); }
    return record;
}
