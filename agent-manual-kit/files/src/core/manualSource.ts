/**
 * X-536 — THE AGENT MANUAL'S SOURCE, as it is written: `manual/` at the
 * extension root (it ships in the VSIX).
 *
 *   manual/card.md               the start card, a template ({{AF}}, {{VERSION}})
 *   manual/map.md                the map, with <!-- af:areas --> / <!-- af:playbooks -->
 *   manual/areas/<id>.md         one guide per area, frontmatter + body
 *   manual/playbooks/<id>.md     one playbook per user intent, frontmatter + body
 *   manual/ops.meta.json         area · effect · summary (· asks · plan) per op
 *
 * Parsing is pure (text in, records out) so the tests read the same files the
 * runtime reads; `readManualSource` is the only function that touches a disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ManualDoc, ManualEffect, MANUAL_EFFECTS } from '../service/manualQuery';

export interface OpMeta {
    area: string;
    effect: ManualEffect;
    summary: string;
    asks?: boolean;
    plan?: string;
}

export interface ManualSource {
    card: string;
    map: string;
    docs: ManualDoc[];
    meta: Record<string, OpMeta>;
    /** what could not be read, said rather than dropped */
    problems: string[];
}

/**
 * The frontmatter subset the manual uses: `key: value`, `key: [a, b]` and a
 * block list (`key:` then `  - item` lines). Anything else is a problem the
 * caller reports — never a silent default.
 */
export function parseFrontmatter(text: string): { data: Record<string, string | string[]>; body: string; error?: string } {
    const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    if (!src.startsWith('---\n')) { return { data: {}, body: src, error: 'no frontmatter' }; }
    const end = src.indexOf('\n---', 4);
    if (end < 0) { return { data: {}, body: src, error: 'frontmatter is not closed' }; }
    const head = src.slice(4, end).split('\n');
    const body = src.slice(end + 4).replace(/^\n+/, '');
    const data: Record<string, string | string[]> = {};
    let listKey = '';
    for (const raw of head) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) { continue; }
        const item = /^\s+-\s+(.*)$/.exec(line);
        if (item && listKey) {
            (data[listKey] as string[]).push(unquote(item[1]));
            continue;
        }
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
        if (!kv) { return { data, body, error: `unreadable frontmatter line: ${line}` }; }
        const [, key, value] = kv;
        if (!value) { data[key] = []; listKey = key; continue; }
        listKey = '';
        const inline = /^\[(.*)\]$/.exec(value);
        data[key] = inline
            ? inline[1].split(',').map(s => unquote(s.trim())).filter(Boolean)
            : unquote(value);
    }
    return { data, body };
}

function unquote(s: string): string {
    const t = s.trim();
    return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

const asList = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];
const asText = (v: string | string[] | undefined): string =>
    Array.isArray(v) ? v.join(', ') : v ?? '';

/** One area guide or playbook. The file name is the id, and the frontmatter must agree. */
export function parseManualDoc(kind: ManualDoc['kind'], fileId: string, text: string): { doc?: ManualDoc; problem?: string } {
    const fm = parseFrontmatter(text);
    if (fm.error) { return { problem: `${kind} ${fileId}: ${fm.error}` }; }
    const d = fm.data;
    const id = asText(d.id) || fileId;
    if (id !== fileId) { return { problem: `${kind} ${fileId}: frontmatter id "${id}" does not match the file name` }; }
    const title = asText(d.title);
    const summary = asText(d.summary);
    if (!title || !summary) { return { problem: `${kind} ${fileId}: title and summary are required` }; }
    const order = Number(asText(d.order));
    return {
        doc: {
            kind, id, title, summary,
            ...(asText(d.area) ? { area: asText(d.area) } : {}),
            ...(asText(d.ui) ? { ui: asText(d.ui) } : {}),
            ...(Number.isFinite(order) && asText(d.order) ? { order } : {}),
            keywords: asList(d.keywords),
            intents: asList(d.intents),
            ops: asList(d.ops),
            related: asList(d.related),
            body: fm.body.trim()
        }
    };
}

/** ops.meta.json: `{ "ops": { "<op>": { area, effect, summary, asks?, plan? } } }`. */
export function parseOpsMeta(text: string): { meta: Record<string, OpMeta>; problems: string[] } {
    const problems: string[] = [];
    let raw: unknown;
    try { raw = JSON.parse(String(text ?? '').replace(/^﻿/, '')); } catch (e) {
        return { meta: {}, problems: [`ops.meta.json is not JSON: ${(e as Error).message}`] };
    }
    const ops = (raw as { ops?: unknown })?.ops;
    if (!ops || typeof ops !== 'object') { return { meta: {}, problems: ['ops.meta.json has no "ops" object'] }; }
    const meta: Record<string, OpMeta> = {};
    for (const [op, v] of Object.entries(ops as Record<string, unknown>)) {
        const r = v as Partial<OpMeta>;
        if (!r || typeof r.area !== 'string' || typeof r.summary !== 'string'
            || !MANUAL_EFFECTS.includes(r.effect as ManualEffect)) {
            problems.push(`ops.meta.json: ${op} needs area, summary and an effect (${MANUAL_EFFECTS.join('|')})`);
            continue;
        }
        meta[op] = {
            area: r.area, effect: r.effect as ManualEffect, summary: r.summary,
            ...(r.asks ? { asks: true } : {}),
            ...(typeof r.plan === 'string' && r.plan ? { plan: r.plan } : {})
        };
    }
    return { meta, problems };
}

/** Read `manual/` off disk. A missing folder is a problem, not a throw: the bridge must still start. */
export function readManualSource(dir: string): ManualSource {
    const problems: string[] = [];
    const read = (rel: string): string => {
        try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch {
            problems.push(`missing ${rel}`);
            return '';
        }
    };
    const docs: ManualDoc[] = [];
    for (const [kind, sub] of [['area', 'areas'], ['playbook', 'playbooks']] as const) {
        let names: string[] = [];
        try { names = fs.readdirSync(path.join(dir, sub)).filter(f => f.endsWith('.md')).sort(); } catch {
            problems.push(`missing ${sub}/`);
        }
        for (const f of names) {
            const r = parseManualDoc(kind, f.slice(0, -3), read(path.join(sub, f)));
            if (r.doc) { docs.push(r.doc); } else if (r.problem) { problems.push(r.problem); }
        }
    }
    const metaText = read('ops.meta.json');
    const parsed = metaText ? parseOpsMeta(metaText) : { meta: {}, problems: [] };
    problems.push(...parsed.problems);
    return { card: read('card.md').trim(), map: read('map.md').trim(), docs, meta: parsed.meta, problems };
}
