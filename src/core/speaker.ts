/**
 * The AI participant's label for a message — a fact derived from the model id
 * the message carries, never a hardcoded engine name. The day a Gemini or Codex
 * session is read it labels itself correctly.
 *
 * The label is USER-COMPOSABLE via a small template (Farm Settings → Display &
 * Labels). Four tokens are filled from the model id; anything else in the
 * template is literal, so a template with no tokens is simply a fixed label:
 *   {ai}       engine name   — claude · gemini · codex
 *   {model}    model family  — opus · sonnet · haiku · gpt · …
 *   {version}  version       — 4.8 · 3.5 · 2.5 · …
 *   {raw}      raw model id  — opus-4-8 (vendor prefix stripped)
 * Token values are lowercase and canonical; `casing` decides the final case and
 * `fallback` is what shows when the id yields nothing (default 'agent' — this is
 * an agent, not an "assistant").
 *
 * Mirrored in media/charts.js (window.AFCharts.parseModel / .renderSpeaker /
 * .aiLabel) for the webviews; the two copies must stay in sync.
 */

export interface SpeakerParts { ai: string; model: string; version: string; raw: string; }

export type SpeakerCasing = 'page' | 'upper' | 'lower' | 'asis';

export interface SpeakerConfig {
    /** Template with {ai} {model} {version} {raw} tokens; '' → the default '{ai}'. */
    template: string;
    /** page = match the page (Sessions upper, Turns lower); or force upper/lower; asis = leave. */
    casing: SpeakerCasing;
    /** Shown when the model id yields no tokens (unknown / <synthetic> / absent). */
    fallback: string;
}

export const DEFAULT_SPEAKER_CONFIG: SpeakerConfig = { template: '{ai}', casing: 'page', fallback: 'agent' };

/**
 * The engine word for a speaker label.
 *
 * ‼️ U-35 — THE MODEL ID IS A GUESS, AND THE SESSION'S OWN ENGINE IS NOT.
 * This used to read the id alone, which was safe while a model name implied
 * its vendor and stopped being safe the moment Antigravity started serving
 * three vendors' models at once: measured in its catalog, `gpt-oss-120b` is
 * an open-weights model on an Antigravity account and this function called
 * it Codex, while `claude-sonnet-4-6` from the same list was called Claude.
 * Both are wrong in the way that matters — they name a product the user is
 * not talking to.
 *
 * So when the caller KNOWS which engine the session ran on, that wins; the
 * id is the fallback for a transcript that carries no engine, which is every
 * transcript written before this existed.
 */
export function aiName(rawModel: string | undefined | null, engine?: string | null): string {
    const e = String(engine ?? '').trim().toLowerCase();
    // 'agy' is Antigravity's id; the word a person reads is its own name, not
    // the vendor of whichever model it happened to route to.
    if (e === 'agy') { return 'antigravity'; }
    if (e === 'codex' || e === 'gemini' || e === 'claude') { return e; }
    const m = String(rawModel ?? '').toLowerCase();
    if (!m || m === '<synthetic>') { return ''; }
    if (m.startsWith('claude')) { return 'claude'; }
    if (m.startsWith('gemini')) { return 'gemini'; }
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.includes('codex')) {
        return 'codex';
    }
    return '';
}

const FAMILIES = ['opus', 'sonnet', 'haiku', 'flash', 'pro', 'gpt', 'codex'];

/** Best-effort version: a dotted number if present, else the leading numeric
 *  tokens (major[.minor]) joined by '.', skipping 8-digit dates. */
function extractVersion(m: string): string {
    const dotted = m.match(/\d+\.\d+/);
    if (dotted) { return dotted[0]; }
    const nums: string[] = [];
    for (const tok of m.split(/[^a-z0-9]+/i)) {
        if (!tok || /^\d{6,}$/.test(tok)) { continue; }   // date-like → skip
        const lead = tok.match(/^(\d+)/);                  // leading digits of e.g. '4o'
        if (lead) { nums.push(lead[1]); }
    }
    return nums.slice(0, 2).join('.');
}

/** Split a model id into its composable parts (all lowercase, '' where absent).
 *  `engine` is the session's own, when the caller has it — see aiName. */
export function parseModel(rawModel: string | undefined | null, engine?: string | null): SpeakerParts {
    const m = String(rawModel ?? '').toLowerCase().trim();
    if (!m || m === '<synthetic>') { return { ai: '', model: '', version: '', raw: '' }; }
    const ai = aiName(m, engine);
    const raw = ai === 'claude' ? m.replace(/^claude-/, '') : m;
    let model = '';
    for (const f of FAMILIES) { if (m.includes(f)) { model = f; break; } }
    if (!model && ai === 'codex') { const o = m.match(/\bo[1-9]\b/); if (o) { model = o[0]; } }
    return { ai, model, version: extractVersion(m), raw };
}

/** Coerce a possibly-partial/invalid settings object into a valid config. */
export function normalizeSpeakerConfig(o: unknown): SpeakerConfig {
    const c = (o && typeof o === 'object') ? o as Record<string, unknown> : {};
    const casings: SpeakerCasing[] = ['page', 'upper', 'lower', 'asis'];
    const casing = casings.includes(c.casing as SpeakerCasing) ? c.casing as SpeakerCasing : 'page';
    const template = typeof c.template === 'string' && c.template.trim() ? c.template : DEFAULT_SPEAKER_CONFIG.template;
    const fallback = typeof c.fallback === 'string' && c.fallback.trim() ? c.fallback : DEFAULT_SPEAKER_CONFIG.fallback;
    return { template, casing, fallback };
}

/**
 * The label a page prints for an AI message. `pageUpper` is the page's own
 * default case (Sessions true, Turns false) — used only when casing='page'.
 */
export function renderSpeaker(
    rawModel: string | undefined | null,
    pageUpper: boolean,
    cfg: SpeakerConfig = DEFAULT_SPEAKER_CONFIG
): string {
    const p = parseModel(rawModel);
    let out = (cfg.template || DEFAULT_SPEAKER_CONFIG.template)
        .replace(/\{ai\}/g, p.ai)
        .replace(/\{model\}/g, p.model)
        .replace(/\{version\}/g, p.version)
        .replace(/\{raw\}/g, p.raw)
        .replace(/\(\s*\)|\[\s*\]/g, ' ')   // empty bracket pairs left by absent tokens
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-·,/|]+|[\s\-·,/|]+$/g, '')   // dangling separators
        .trim();
    if (!out) { out = cfg.fallback || DEFAULT_SPEAKER_CONFIG.fallback; }
    switch (cfg.casing) {
        case 'upper': return out.toUpperCase();
        case 'lower': return out.toLowerCase();
        case 'asis': return out;
        default: return pageUpper ? out.toUpperCase() : out.toLowerCase();
    }
}
