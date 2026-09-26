/**
 * X-424 — THE STUDIO WALL READ FROM THE LIBRARY.
 *
 * A card per media record of the production's database: what the search
 * summary already carries (id, file, stage, status, failed…) plus what a
 * reviewer judges by — the score, how much of the form is filled, why it
 * failed, and the relation chain it sits in. Pure.
 */
import { RecordSummary, summarize } from './airtableInput';

type Dict = Record<string, unknown>;

export interface LibraryCard extends RecordSummary {
    /** human_quality_score when a person gave one, else auto_quality_score; 0 = none */
    score: number;
    scoreBy: 'human' | 'auto' | '';
    /** completed_sections that are true, as a percentage of all of them */
    fill: number;
    reason: string;
    causes: string[];
    effects: string[];
    version: number;
}

const get = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Dict)[k] : undefined), o);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export function libraryCard(item: Dict): LibraryCard {
    const human = num(get(item, 'technical_quality.human_quality_score'));
    const auto = num(get(item, 'technical_quality.auto_quality_score'));
    const sections = get(item, 'completed_sections');
    const flags = sections && typeof sections === 'object' ? Object.values(sections as Dict) : [];
    return {
        ...summarize(item),
        score: human || auto,
        scoreBy: human ? 'human' : auto ? 'auto' : '',
        fill: flags.length ? Math.round(100 * flags.filter(f => f === true).length / flags.length) : 0,
        reason: String(get(item, 'failure.reason') ?? ''),
        causes: ids(get(item, 'relations.causal.causes')),
        effects: ids(get(item, 'relations.causal.effects')),
        version: num(item.version)
    };
}
