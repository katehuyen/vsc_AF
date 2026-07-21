// Media record assembly for the Airtable engine.
//
// The engine stores each media item as a JSON file under
//   <instance>/<lang>/db/media/<YYYY-MM>/<id>.json
// with a large, section-based schema. The panel UI creates full records; to make
// agent-created records indistinguishable from hand-made ones we start from a
// canonical empty skeleton (verified field-for-field against a real published
// record, W:/zome/db/stem/.../media_png_20260614_0001.json) and merge only the
// meaningful fields on top.
//
// Creation goes through POST /api/file (there is no POST /api/db); that endpoint
// writes the file, sets version, and auto-updates the search index. It runs NO
// schema validation on create, so a well-formed record is accepted as-is.

import * as fs from 'fs';
import * as path from 'path';
import { imageDimsOfFile } from './imagesize';

// --- File-type helpers -------------------------------------------------------

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'avif', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'wmv', 'flv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'json']);

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'unknown';

export function normalizeFileFormat(nameOrPath: string): string {
    return path.extname(String(nameOrPath || '')).replace(/^\./, '').toLowerCase();
}

export function guessMediaType(fileFormat: string): MediaType {
    const f = String(fileFormat || '').toLowerCase();
    if (IMAGE_EXT.has(f)) { return 'image'; }
    if (VIDEO_EXT.has(f)) { return 'video'; }
    if (AUDIO_EXT.has(f)) { return 'audio'; }
    if (DOC_EXT.has(f)) { return 'document'; }
    return 'unknown';
}

export interface FileMeta {
    fileFormat: string;
    mediaType: MediaType;
    fileSizeBytes: number;
    width: number;
    height: number;
    fileName: string;
}

/** Read basic technical metadata for a file already on disk. Image dimensions
 *  are best-effort; everything else comes from the path/stat. */
export async function extractFileMetadata(absPath: string): Promise<FileMeta> {
    const stat = await fs.promises.stat(absPath);
    const fileFormat = normalizeFileFormat(absPath);
    const mediaType = guessMediaType(fileFormat);
    let width = 0, height = 0;
    if (mediaType === 'image') {
        ({ width, height } = await imageDimsOfFile(absPath));
    }
    return { fileFormat, mediaType, fileSizeBytes: stat.size, width, height, fileName: path.basename(absPath) };
}

// --- Deep merge (arrays/scalars replace, objects merge) ----------------------

type Dict = Record<string, unknown>;

export function deepMerge(target: Dict, source: unknown): Dict {
    if (!source || typeof source !== 'object') { return target; }
    for (const [k, v] of Object.entries(source as Dict)) {
        if (v === undefined) { continue; }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) { target[k] = {}; }
            deepMerge(target[k] as Dict, v);
        } else {
            target[k] = Array.isArray(v) ? [...v] : v;
        }
    }
    return target;
}

const toForwardSlashes = (p: string): string => String(p || '').replace(/\\/g, '/');

// --- Canonical skeleton ------------------------------------------------------

export function emptyMediaSkeleton(): Dict {
    return {
        id: '', type: 'media', status: 'draft',
        domain: '', discipline: '', field: '', branch: '',
        topic: '', subtopic: '', content: '',
        content_role: '', usage_context: '',
        level: '', didactic_intent: '', bloom_taxonomy_level: '',
        prerequisite_knowledge: [], learning_objectives: [],
        media: {
            type: '', aspect_ratio: '', duration_seconds: 0, file_format: '',
            file_path: '', file_size_bytes: 0, frame_rate: 0, has_transparency: false,
            height: 0, is_vectorized: false, width: 0,
        },
        publishing: {
            status: '', additional_info: '', platform: '', pub_header: '', pub_note: '',
            pub_tags: '', pub_text: '', pub_url: '', status_date: '',
        },
        failure: { is_failed: false, reason: '', salvage_notes: '', salvageable: false },
        technical_quality: {
            auto_quality_score: 0, bit_depth: 0, bitrate: 0, channels: '', clarity: 0,
            codec: '', color_depth: 0, color_space: '', compression_ratio: 0, dpi: 0,
            human_quality_score: 0, noise_level: 0, resolution_quality: '', sample_rate: 0,
            sharpness: 0,
        },
        accessibility: {
            alt_text: '', aria_label: '', color_blind_safe: false, contrast_ratio: 0,
            has_captions: false, has_transcript: false, screen_reader_compatible: false,
            transcript_path: '', wcag_compliance: '',
        },
        seo: { title: '', description: '', canonical_url: '', keywords: [], slug: '' },
        educational_impact: {
            avg_comprehension_score: 0, avg_study_time_seconds: 0, difficulty_perceived: '',
            educational_value: 0, hook_psychology: '', hook_value: '', quiz_success_rate: 0,
        },
        marketing: {
            clickbait_score: 0, credibility_score: 0, engagement_rate: 0, shock_factor: 0,
            virality_score: 0,
        },
        style: '',
        tone: { audience: '', emotion: '', energy: '', formality: '' },
        platform_fit: {
            flashcard: 0, instagram_feed_ready: false, instagram_reel_ready: false,
            instagram_story_ready: false, slide_body: 0, slide_title: 0,
            tiktok_sound_on_score: 0, tiktok_text_overlay_safe: false,
            tiktok_vertical_optimized: false, tiktok_visual: 0, video_overlay: 0,
            youtube_description_ready: false, youtube_thumbnail_optimized: false,
        },
        optimization: {
            caching_strategy: '', cdn_url: '', load_priority: '', preview_path: '',
            responsive_variants: [], thumbnail_path: '',
        },
        provenance: {
            ai_bias_score: 0, ai_confidence: 0, cfg_scale: 0, generation_prompt: '',
            media_intent: '', model: '', model_version: '', negative_prompt: '', origin: '',
            original_context: '', original_url: '', production_type: '', prompt_hash: '',
            sampling_method: '', seed: 0, source_material: '', steps: 0,
            training_data_source: '',
        },
        batch: {
            batch_created: '', batch_id: '', batch_name: '', batch_sequence: 0,
            batch_size: 0, batch_source: '', sort_a: 0, sort_b: 0, sort_c: 0, sort_d: 0,
            sort_e: 0,
        },
        version: 1,
        dependencies: {
            min_browser_version: '', requires_assets: [], requires_fonts: [],
            requires_media: [], requires_plugins: [], supported_devices: [],
        },
        relations: { variants: [] },
        analytics: {
            as_input_count: 0, as_output_count: 0, as_reference_count: 0,
            avg_rewatch_count: 0, avg_view_duration_seconds: 0, bounce_rate: 0,
            comment_count: 0, completion_rate: 0, dislike_count: 0, download_count: 0,
            drop_off_seconds: [], engagement_heatmap: [], fullscreen_rate: 0,
            hotspot_seconds: [], last_viewed_at: '', like_count: 0,
            median_view_duration_seconds: 0, mute_rate: 0, pause_events: 0,
            peak_concurrent_viewers: 0, peak_usage_date: '', published_count: 0,
            quality_switches: 0, replay_events: 0, rewatch_rate: 0, save_count: 0,
            seek_events: 0, share_count: 0, total_usage_count: 0, unique_viewers: 0,
            usage_events: [], view_count: 0,
        },
        moderation: {
            status: '', age_restriction: '', contains_sensitive_content: false,
            content_warnings: [], dmca_strikes: 0, drm_protected: false,
            last_reviewed_at: '', notes: '', reported_count: 0, reviewed_by: '',
            watermarked: false,
        },
        rights: {
            attribution_required: false, attribution_text: '', commercial_restriction: false,
            license: '', ownership: '', reuse_allowed: false,
        },
        compliance: {
            contains_personal_data: false, coppa_compliant: false, data_retention_days: 0,
            deletion_scheduled: '', gdpr_compliant: false, legal_holds: [],
        },
        monetization: {
            ad_revenue: 0, currency: '', is_premium: false, licensing_revenue: 0, price: 0,
            revenue_generated: 0, subscription_tier: '',
        },
        tags: [],
        workflow: {
            actual_effort_hours: 0, approval_chain: [], assigned_to: '',
            auto_assign_ids: true, auto_upload_enabled: false, due_date: '',
            estimated_effort_hours: 0, iteration_count: 0, last_action: '',
            last_modified: '', priority: '', rejection_count: 0, review_required: false,
            stage: '',
        },
        completed_sections: {
            tags: false, version: false, accessibility: false, analytics: false,
            compliance: false, content_context: false, dependencies: false,
            educational_impact: false, failure: false, identity: false, marketing: false,
            media_core: false, metadata: false, moderation: false, monetization: false,
            optimization: false, platform_fit: false, provenance: false, publishing: false,
            rights: false, seo: false, style_tone: false, taxonomy: false,
            technical_quality: false, workflow: false,
        },
        pipeline_history: [],
        lang: 'TR', region: '',
        localization: { available_languages: [], cultural_sensitivity: '', localized_variants: [] },
        created_at: '', published_at: '', description: '', name: '',
    };
}

// --- Build a full media record ----------------------------------------------

export interface MediaRecordArgs {
    id: string;
    lang?: string;
    status?: string;
    absPath: string;
    fileMeta: FileMeta;
    topic?: string; subtopic?: string; content?: string; description?: string; name?: string;
    tags?: string[]; style?: string; content_role?: string; usage_context?: string;
    provenance?: Dict; failure?: Dict; extra?: Dict;
    templateItem?: Dict | null;
}

export function buildMediaRecord(args: MediaRecordArgs): Dict {
    const {
        id, lang = 'TR', status = 'draft', absPath, fileMeta,
        topic, subtopic, content, description, name,
        tags, style, content_role, usage_context,
        provenance, failure, extra, templateItem,
    } = args;

    const record = emptyMediaSkeleton();

    // 1) template base (structure/defaults the user pre-filled), minus identity/tech.
    if (templateItem && typeof templateItem === 'object') {
        const t: Dict = { ...templateItem };
        delete t.id; delete t.type; delete t.version;
        delete t.created_at; delete t.updated_at; delete t.published_at;
        delete t.__template_prefs; delete t.template_prefs;
        if (t.media && typeof t.media === 'object') {
            const m = t.media as Dict;
            delete m.file_path; delete m.file_size_bytes; delete m.width;
            delete m.height; delete m.duration_seconds;
        }
        deepMerge(record, t);
    }

    // 2) identity
    record.id = id;
    record.type = 'media';
    record.status = status || 'draft';
    record.lang = lang;
    const nowIso = new Date().toISOString();
    record.created_at = nowIso;
    record.published_at = (status === 'published') ? nowIso : '';
    record.version = 1;

    // 3) media core from the real file
    const media = record.media as Dict;
    media.type = fileMeta.mediaType || media.type || 'unknown';
    media.file_format = fileMeta.fileFormat || media.file_format || '';
    media.file_path = toForwardSlashes(absPath);
    media.file_size_bytes = fileMeta.fileSizeBytes || 0;
    media.width = fileMeta.width || 0;
    media.height = fileMeta.height || 0;

    // 4) meaningful agent-supplied fields (only set when provided). Default the
    //    content line to the filename, matching how the panel fills new records.
    record.topic = topic !== undefined ? topic : record.topic;
    if (subtopic !== undefined) { record.subtopic = subtopic; }
    record.content = content !== undefined ? content : (record.content || fileMeta.fileName);
    if (description !== undefined) { record.description = description; }
    if (name !== undefined) { record.name = name; }
    if (Array.isArray(tags)) {
        record.tags = tags;
        const seo = record.seo as Dict;
        if (Array.isArray(seo.keywords) && (seo.keywords as unknown[]).length === 0) {
            seo.keywords = [...tags];
        }
    }
    if (style !== undefined) { record.style = style; }
    if (content_role !== undefined) { record.content_role = content_role; }
    if (usage_context !== undefined) { record.usage_context = usage_context; }
    if (provenance && typeof provenance === 'object') { deepMerge(record.provenance as Dict, provenance); }
    if (failure && typeof failure === 'object') { deepMerge(record.failure as Dict, failure); }
    if (extra && typeof extra === 'object') { deepMerge(record, extra); }

    return record;
}

// --- Date helpers ------------------------------------------------------------

export function monthSegmentFromDate(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function dateStrFromDate(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}
