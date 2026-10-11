/**
 * X-536 — COMPILE THE MANUAL AGAINST THE BUILD THAT IS RUNNING.
 *
 * The registry is the truth about which ops exist; `ops.meta.json` is the
 * truth about how to talk about them. Joined here, every registered op gets a
 * contract page — including one nobody has described yet, whose area and
 * summary are DERIVED (and marked `derived`) rather than left out: an agent
 * must never meet an op the manual pretends not to know. The tests forbid a
 * derived entry in a release (test/test_manual_content.js), so the fallback
 * exists for the window between registering an op and describing it.
 *
 * Pure: the caller hands in the source, the catalog and the version.
 */

import { CompiledManual, ManualOp, MANUAL_SCHEMA } from '../service/manualQuery';
import { ManualSource } from './manualSource';

export interface CatalogRow { op: string; describe: string }

export interface ManualBuild {
    manual: CompiledManual;
    /** source problems plus ops with derived metadata and metadata for ops that do not exist */
    problems: string[];
}

/** The first sentence of a contract, with the developer's ticket ids and shouting taken out. */
export function derivedSummary(describe: string): string {
    const clean = String(describe ?? '')
        .replace(/‼️/g, '')
        .replace(/\b[A-Z]{1,3}-\d{1,4}\b\s*[—-]?\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const first = /^(.{20,220}?[.!?])(\s|$)/.exec(clean)?.[1] ?? clean.slice(0, 160);
    // A sentence written in capitals for emphasis reads as shouting to a model.
    return first === first.toUpperCase() ? first.charAt(0) + first.slice(1).toLowerCase() : first;
}

/** Ops whose area is not curated land in the area their namespace mostly belongs to. */
function guessArea(op: string, meta: ManualSource['meta']): string {
    const ns = op.split('.')[0];
    const counts = new Map<string, number>();
    for (const [name, m] of Object.entries(meta)) {
        if (name.split('.')[0] === ns) { counts.set(m.area, (counts.get(m.area) ?? 0) + 1); }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'basics';
}

function guessEffect(op: string): ManualOp['effect'] {
    const verb = op.split('.').pop() ?? '';
    if (/^(list|get|status|find|read|recent|live|health|history|preview|trace|export|forecast|show|catalog|ops)$/i.test(verb)) { return 'read'; }
    if (/^(delete|remove|clear|cancel|stop|end|forget|revoke|sweep|reset|kill)/i.test(verb)) { return 'destructive'; }
    if (/^(run|start|rerun|resume|now|fire|test)$/i.test(verb)) { return 'run'; }
    return 'write';
}

export function compileManual(
    src: ManualSource,
    catalog: readonly CatalogRow[],
    version: string,
    now: number = Date.now()
): ManualBuild {
    const problems = [...src.problems];
    const registered = new Set(catalog.map(c => c.op));
    const ops: ManualOp[] = catalog.map(c => {
        const m = src.meta[c.op];
        if (m) {
            return { op: c.op, describe: c.describe, ...m };
        }
        problems.push(`no ops.meta.json entry for ${c.op} (derived)`);
        return {
            op: c.op, describe: c.describe, derived: true,
            area: guessArea(c.op, src.meta), effect: guessEffect(c.op), summary: derivedSummary(c.describe)
        };
    }).sort((a, b) => a.op.localeCompare(b.op));
    for (const name of Object.keys(src.meta)) {
        if (!registered.has(name)) { problems.push(`ops.meta.json describes ${name}, which is not registered`); }
    }
    const areaIds = new Set(src.docs.filter(d => d.kind === 'area').map(d => d.id));
    for (const o of ops) {
        if (!areaIds.has(o.area)) { problems.push(`${o.op} is filed under area "${o.area}", which has no guide`); }
    }
    for (const d of src.docs) {
        for (const name of d.ops) {
            if (!registered.has(name)) { problems.push(`${d.kind} ${d.id} lists op ${name}, which is not registered`); }
        }
        if (d.kind === 'playbook' && (!d.area || !areaIds.has(d.area))) {
            problems.push(`playbook ${d.id} names area "${d.area ?? ''}", which has no guide`);
        }
    }
    return {
        manual: { schema: MANUAL_SCHEMA, version, builtAt: now, card: src.card, map: src.map, docs: src.docs, ops },
        problems
    };
}
