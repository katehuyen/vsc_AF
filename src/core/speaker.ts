/**
 * The AI participant's display name for a message, derived from the model id
 * that message carries — so the label is a fact about the data, never a
 * hardcoded engine name. The moment a Gemini or Codex turn is read it labels
 * itself correctly; nothing here changes per engine beyond the prefix table.
 *
 * `aiName` returns a lowercase canonical engine word ('claude' | 'gemini' |
 * 'codex'), or '' when the id is missing/unknown. `aiLabel` is what the pages
 * actually print: that word — or 'agent' when unknown (this is an agent, not an
 * "assistant") — upper-cased where the surrounding role labels are upper-case.
 *
 * Mirrored in media/charts.js (window.AFCharts.aiName / .aiLabel) for the
 * webviews; the two copies must stay in sync.
 */
export function aiName(rawModel: string | undefined | null): string {
    const m = String(rawModel ?? '').toLowerCase();
    if (!m || m === '<synthetic>') { return ''; }
    if (m.startsWith('claude')) { return 'claude'; }
    if (m.startsWith('gemini')) { return 'gemini'; }
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.includes('codex')) {
        return 'codex';
    }
    return '';
}

export function aiLabel(rawModel: string | undefined | null, upper = false): string {
    const name = aiName(rawModel) || 'agent';
    return upper ? name.toUpperCase() : name;
}
