/**
 * X-536 — THE AGENT MANUAL'S READER. One implementation, two hosts.
 *
 * The manual is what an agent reads to drive Agent Farm without the source:
 * a map, an area guide per subsystem, playbooks that turn a user's request
 * into ops, and one contract per op. The extension COMPILES it (core/manual)
 * against the live bridge registry and stages the result as manual.json next
 * to af.js; this file READS that JSON — in the extension, behind the bridge
 * ops `farm.guide` / `farm.find` / `farm.ops`, and in af.js, which answers
 * those three locally so they work with VS Code closed and raise no toast.
 *
 * ‼️ ZERO IMPORTS, ON PURPOSE. It is staged beside af.js and required by it
 * from the bridge folder, where nothing else of the extension exists. It is
 * pure: text and objects in, text and objects out.
 */

export type ManualEffect = 'read' | 'write' | 'run' | 'destructive' | 'ui';
export const MANUAL_EFFECTS: readonly ManualEffect[] = ['read', 'write', 'run', 'destructive', 'ui'];

export interface ManualOp {
    op: string;
    area: string;
    effect: ManualEffect;
    /** one line, plain English, no ticket ids */
    summary: string;
    /** the registry's full contract text */
    describe: string;
    /** the user gets a confirmation dialog — the call may wait on a person */
    asks?: boolean;
    /** the call only previews unless this flag is passed, e.g. "confirm=true" */
    plan?: string;
    /** true when no curated metadata existed and the build derived it */
    derived?: boolean;
}

export interface ManualDoc {
    kind: 'area' | 'playbook';
    id: string;
    title: string;
    summary: string;
    /** the area a playbook belongs to */
    area?: string;
    ui?: string;
    order?: number;
    keywords: string[];
    intents: string[];
    ops: string[];
    related: string[];
    body: string;
}

export interface CompiledManual {
    schema: 1;
    version: string;
    builtAt: number;
    /** the start-card template ({{AF}}, {{VERSION}}) */
    card: string;
    /** the map, with <!-- af:areas --> and <!-- af:playbooks --> slots */
    map: string;
    docs: ManualDoc[];
    ops: ManualOp[];
}

export const MANUAL_SCHEMA = 1;

/** The ops a reader answers without the extension. */
export const LOCAL_MANUAL_OPS: readonly string[] = ['farm.guide', 'farm.find', 'farm.ops'];

/** A text answer: af.js prints `text` as it is instead of a JSON envelope. */
export interface MarkdownAnswer { format: 'markdown'; text: string }

export function isMarkdownAnswer(x: unknown): x is MarkdownAnswer {
    return !!x && typeof x === 'object' && (x as MarkdownAnswer).format === 'markdown'
        && typeof (x as MarkdownAnswer).text === 'string';
}

export type ManualReply = { ok: true; result: unknown } | { ok: false; error: string };

const md = (text: string): MarkdownAnswer => ({ format: 'markdown', text: text.trimEnd() + '\n' });

// ------------------------------------------------------------------ lookups

const EFFECT_NOTE: Record<ManualEffect, string> = {
    read: 'changes nothing',
    write: 'changes Agent Farm state',
    run: 'starts or continues a paid agent or model run',
    destructive: 'stops, cancels, deletes or overwrites',
    ui: 'only shows something to the user'
};

function str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function bool(v: unknown): boolean {
    return v === true || v === 'true' || v === 1 || v === '1';
}

export function findDoc(m: CompiledManual, id: string): ManualDoc | undefined {
    const key = id.trim().toLowerCase();
    return m.docs.find(d => d.id === key)
        ?? m.docs.find(d => d.id === key.replace(/\s+/g, '-'));
}

export function findOp(m: CompiledManual, name: string): ManualOp | undefined {
    const key = name.trim();
    return m.ops.find(o => o.op === key) ?? m.ops.find(o => o.op.toLowerCase() === key.toLowerCase());
}

function areasInOrder(m: CompiledManual): ManualDoc[] {
    return m.docs.filter(d => d.kind === 'area')
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
}

function playbooksInOrder(m: CompiledManual): ManualDoc[] {
    const areaRank = new Map(areasInOrder(m).map((a, i) => [a.id, i]));
    return m.docs.filter(d => d.kind === 'playbook')
        .sort((a, b) => (areaRank.get(a.area ?? '') ?? 999) - (areaRank.get(b.area ?? '') ?? 999)
            || (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
}

function opsOf(m: CompiledManual, area: string): ManualOp[] {
    return m.ops.filter(o => o.area === area).sort((a, b) => a.op.localeCompare(b.op));
}

/** `tasks.add [run]` plus the two cues an agent must not miss. */
export function opBadge(o: ManualOp): string {
    const cues = [o.effect, o.asks ? 'asks' : '', o.plan ? `plans first: ${o.plan}` : ''].filter(Boolean);
    return `[${cues.join(' · ')}]`;
}

// ------------------------------------------------------------------ renderers

/** The start card, filled in. Unknown placeholders are left visible rather than blanked. */
export function renderCard(template: string, vars: { af: string; version?: string }): string {
    return template
        .replace(/\{\{AF\}\}/g, vars.af)
        .replace(/\{\{VERSION\}\}/g, vars.version ? vars.version : '')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

export function renderMap(m: CompiledManual): string {
    const areas = areasInOrder(m).map(a =>
        `- **${a.id}** — ${a.summary} (${opsOf(m, a.id).length} ops)`).join('\n');
    const playbooks = playbooksInOrder(m).map(p => `- **${p.id}** — ${p.title}`).join('\n');
    const head = `Agent Farm ${m.version} · ${m.ops.length} ops · ${areasInOrder(m).length} areas · `
        + `${playbooksInOrder(m).length} playbooks`;
    const body = m.map
        .replace('<!-- af:areas -->', areas)
        .replace('<!-- af:playbooks -->', playbooks);
    return `${body.trimEnd()}\n\n---\n${head}. Next: \`farm.find q="..."\` · \`farm.guide id=<area|playbook>\` · `
        + '`farm.ops op=<name>` · `farm.brief`.';
}

export function renderDoc(m: CompiledManual, d: ManualDoc): string {
    const parts: string[] = [];
    if (d.kind === 'playbook') {
        parts.push(`# Playbook: ${d.title}`);
        const area = d.area ? `Area: ${d.area} (\`farm.guide id=${d.area}\`)` : '';
        parts.push([area, d.summary].filter(Boolean).join(' · '));
        parts.push(stripLeadingTitle(d.body));
        const used = d.ops.map(name => findOp(m, name)).filter((o): o is ManualOp => !!o);
        if (used.length) {
            parts.push('## Ops used\n' + used.map(o => `- \`${o.op}\` ${opBadge(o)} ${o.summary}`).join('\n')
                + '\n\nExact contract of any op: `farm.ops op=<name>`.');
        }
    } else {
        parts.push(d.body.trim().startsWith('# ') ? d.body.trim() : `# ${d.title}\n\n${d.body.trim()}`);
        if (d.ui) { parts.push(`Where the user sees it: ${d.ui}`); }
        const ops = opsOf(m, d.id);
        if (ops.length) {
            parts.push(`## All ops in this area (${ops.length})\n`
                + ops.map(o => `- \`${o.op}\` ${opBadge(o)} ${o.summary}`).join('\n'));
        }
        const pbs = playbooksInOrder(m).filter(p => p.area === d.id);
        if (pbs.length) {
            parts.push('## Playbooks\n' + pbs.map(p => `- \`farm.guide id=${p.id}\` — ${p.title}`).join('\n'));
        }
        if (d.related.length) { parts.push(`Related areas: ${d.related.join(', ')}.`); }
    }
    return parts.filter(p => p.trim()).join('\n\n');
}

function stripLeadingTitle(body: string): string {
    return body.trim().replace(/^# [^\n]*\n+/, '');
}

export function renderOpsIndex(m: CompiledManual): string {
    const lines: string[] = [
        `# Agent Farm bridge ops (${m.ops.length}), by area`,
        'Effects: ' + MANUAL_EFFECTS.map(e => `[${e}] ${EFFECT_NOTE[e]}`).join(' · ') + '.',
        ''
    ];
    for (const a of areasInOrder(m)) {
        const ops = opsOf(m, a.id);
        if (!ops.length) { continue; }
        lines.push(`**${a.id}** (${ops.length}): ${ops.map(o => o.op).join(', ')}`);
    }
    const orphan = m.ops.filter(o => !m.docs.some(d => d.kind === 'area' && d.id === o.area));
    if (orphan.length) {
        lines.push(`**other** (${orphan.length}): ${orphan.map(o => o.op).join(', ')}`);
    }
    lines.push('', 'One contract: `farm.ops op=<name>` · one area with summaries: `farm.ops area=<id>` · '
        + 'search: `farm.find q="..."` · the full legacy dump (large; write it to a file): '
        + '`farm.ops full=true --out <file>`.');
    return lines.join('\n');
}

export function renderAreaOps(m: CompiledManual, area: string): string {
    const ops = opsOf(m, area);
    const d = findDoc(m, area);
    return [
        `# ${d ? d.title : area}: ${ops.length} ops`,
        ...ops.map(o => `- \`${o.op}\` ${opBadge(o)} ${o.summary}`),
        '',
        d ? `Concepts and rules: \`farm.guide id=${area}\`. ` : '',
        'One contract: `farm.ops op=<name>`.'
    ].join('\n');
}

export function renderOpContract(m: CompiledManual, o: ManualOp): string {
    const cues = [
        `Effect: ${o.effect} (${EFFECT_NOTE[o.effect]})`,
        o.asks ? 'Asks: the user gets a confirmation dialog; the call may wait on a person' : '',
        o.plan ? `Plans first: it only previews unless you pass ${o.plan}` : ''
    ].filter(Boolean);
    const area = findDoc(m, o.area);
    const siblings = opsOf(m, o.area).filter(x => x.op !== o.op).slice(0, 8);
    const playbooks = m.docs.filter(d => d.kind === 'playbook' && d.ops.includes(o.op));
    return [
        `# ${o.op} ${opBadge(o)}`,
        o.summary,
        cues.join('\n'),
        `Area: ${o.area}${area ? ` — \`farm.guide id=${o.area}\`` : ''}`,
        '## Contract',
        o.describe,
        playbooks.length ? '## Playbooks that use it\n' + playbooks.map(p => `- \`farm.guide id=${p.id}\` — ${p.title}`).join('\n') : '',
        siblings.length ? '## Nearby ops\n' + siblings.map(x => `- \`${x.op}\` ${opBadge(x)} ${x.summary}`).join('\n') : '',
        'Call it: `node <af.js> ' + o.op + ' key=value ...` or `@args.json` for nested, long or non-ASCII values.'
    ].filter(s => s.trim()).join('\n\n');
}

// ------------------------------------------------------------------ search

const STOP = new Set(('a an and are as at be by can do does for from has have how i if in into is it its '
    + 'me my of on or our please should so that the their them then there these this to us want was we what '
    + 'when where which who whom why will with would you your agent farm af op ops').split(' '));

/** A deliberately small stemmer: the point is that schedule, schedules, scheduled and scheduling meet. */
export function stem(word: string): string {
    let w = word;
    if (w.length <= 3) { return w; }
    if (w.endsWith('ies') && w.length > 4) { w = w.slice(0, -3) + 'y'; }
    else if (w.endsWith('sses')) { w = w.slice(0, -2); }
    else if (w.endsWith('ing') && w.length > 5) { w = undouble(w.slice(0, -3)); }
    else if (w.endsWith('ed') && w.length > 4) { w = undouble(w.slice(0, -2)); }
    else if (/(sh|ch|x|z|ss)es$/.test(w) && w.length > 4) { w = w.slice(0, -2); }
    else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && w.length > 3) { w = w.slice(0, -1); }
    if (w.endsWith('e') && w.length > 4) { w = w.slice(0, -1); }
    return w;
}

function undouble(w: string): string {
    return /([bdfgklmnprt])\1$/.test(w) ? w.slice(0, -1) : w;
}

export function tokens(text: string): string[] {
    return String(text ?? '').toLowerCase()
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/[^a-z0-9]+/)
        .filter(t => t.length > 1 && !STOP.has(t))
        .map(stem);
}

/**
 * Words a user says that name a mechanism by another name. Expansion only:
 * the original word always counts in full, a synonym at a fraction.
 */
const SYNONYMS: Record<string, string> = {
    daily: 'schedule recurring', every: 'schedule recurring', weekly: 'schedule recurring',
    weekday: 'schedule weekly', recurring: 'schedule', cron: 'schedule', timer: 'schedule',
    remind: 'schedule notice reminder', tomorrow: 'schedule once', morning: 'schedule daily',
    hour: 'schedule', once: 'schedule', clock: 'schedule',
    team: 'mission', squad: 'mission', crew: 'mission', lead: 'mission', leader: 'mission',
    led: 'mission lead', coordinate: 'mission', together: 'mission', goal: 'mission',
    criteria: 'mission adaptive', until: 'mission criteria', orchestrate: 'mission',
    relay: 'baton chain', chain: 'baton relay', handover: 'baton pass', overnight: 'baton relay sentry',
    marathon: 'baton relay', limit: 'quota retry baton', continue: 'baton resume', legs: 'baton chain',
    notify: 'notice', tell: 'notice', report: 'notice report', inform: 'notice', message: 'notice console',
    question: 'notice question', warn: 'notice warning', done: 'notice result',
    watch: 'trigger', webhook: 'trigger', folder: 'trigger watch', lands: 'trigger watch',
    arrives: 'trigger watch', event: 'trigger hook', n8n: 'webhook trigger', zapier: 'webhook trigger',
    finishes: 'trigger hook stop', pipeline: 'workflow', steps: 'workflow', then: 'workflow',
    draft: 'workflow', job: 'task', background: 'task headless', unattended: 'task headless',
    talk: 'console session', chat: 'console session', conversation: 'session console',
    cost: 'spend cost', spend: 'cost', expensive: 'cost report', money: 'cost', budget: 'cost limit',
    quota: 'usage account', stop: 'cancel interrupt pause', cancel: 'stop', kill: 'stop end',
    halt: 'stop pause', stuck: 'cleanup waits', waiting: 'waits needs', running: 'now live',
    happening: 'now live', remember: 'memory', knowledge: 'wiki memory', later: 'queue',
    todo: 'queue backlog', delegate: 'handoff task', handoff: 'a2a task', capability: 'a2a requires',
    variants: 'parallel worktree', approaches: 'parallel worktree', parallel: 'worktree',
    reuse: 'template', template: 'reusable', retry: 'retry', fails: 'retry', fail: 'retry',
    account: 'accounts', second: 'account', model: 'engine models', cheaper: 'model engine',
    installed: 'engines status', restart: 'reload health', update: 'reload build',
    sound: 'alerts', mute: 'alerts', phone: 'remote mobile', mobile: 'remote phone',
    skill: 'toolbox', setting: 'settings', configure: 'settings', premiere: 'studio export',
    oriented: 'orient', start: 'orient', help: 'orient guide', who: 'whoami', am: 'whoami'
};

interface SearchDoc {
    kind: 'playbook' | 'area' | 'op';
    id: string;
    title: string;
    summary: string;
    effect?: ManualEffect;
    tf: Map<string, number>;
    len: number;
    /** an op's name as words: `chains.pause` → chain, pause */
    name: string[];
}

interface SearchIndex {
    docs: SearchDoc[];
    df: Map<string, number>;
    avgLen: number;
    syn: Map<string, string[]>;
}

const FIELD = { name: 3, title: 3, intents: 3, keywords: 2.5, summary: 2, body: 0.6, describe: 0.35 };
const KIND_BOOST = { playbook: 1.35, area: 1.1, op: 1 };
const INDEXES = new WeakMap<CompiledManual, SearchIndex>();

function addField(tf: Map<string, number>, text: string, weight: number): number {
    const ts = tokens(text);
    for (const t of ts) { tf.set(t, (tf.get(t) ?? 0) + weight); }
    return ts.length * weight;
}

function buildIndex(m: CompiledManual): SearchIndex {
    const docs: SearchDoc[] = [];
    for (const d of m.docs) {
        const tf = new Map<string, number>();
        let len = 0;
        len += addField(tf, d.id.replace(/-/g, ' '), FIELD.name);
        len += addField(tf, d.title, FIELD.title);
        len += addField(tf, d.intents.join(' . '), FIELD.intents);
        len += addField(tf, d.keywords.join(' '), FIELD.keywords);
        len += addField(tf, d.summary, FIELD.summary);
        len += addField(tf, d.body.slice(0, 2500), FIELD.body);
        docs.push({ kind: d.kind, id: d.id, title: d.title, summary: d.summary, tf, len, name: [] });
    }
    for (const o of m.ops) {
        const tf = new Map<string, number>();
        let len = 0;
        len += addField(tf, o.op.replace(/\./g, ' '), FIELD.name);
        len += addField(tf, o.summary, FIELD.summary + 0.5);
        len += addField(tf, o.describe.slice(0, 700), FIELD.describe);
        docs.push({ kind: 'op', id: o.op, title: o.op, summary: o.summary, effect: o.effect, tf, len, name: tokens(o.op.replace(/\./g, ' ')) });
    }
    const df = new Map<string, number>();
    for (const d of docs) { for (const t of d.tf.keys()) { df.set(t, (df.get(t) ?? 0) + 1); } }
    const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
    const syn = new Map<string, string[]>();
    for (const [k, v] of Object.entries(SYNONYMS)) { syn.set(stem(k), tokens(v)); }
    return { docs, df, avgLen, syn };
}

function indexOf(m: CompiledManual): SearchIndex {
    let ix = INDEXES.get(m);
    if (!ix) { ix = buildIndex(m); INDEXES.set(m, ix); }
    return ix;
}

export interface ManualHit {
    kind: 'playbook' | 'area' | 'op';
    id: string;
    title: string;
    summary: string;
    effect?: ManualEffect;
    score: number;
    /** the call that opens it */
    next: string;
}

export interface FindResult {
    query: string;
    hits: ManualHit[];
    /** the best hit covers too little of the request to trust: worth recording as a gap */
    weak: boolean;
}

/**
 * The best hit must account for at least this share of the request's words
 * (synonyms count) or the answer is called weak. Measured on intents.eval.json:
 * every real request clears it, an off-topic one ("banana smoothie recipe") does not.
 */
export const WEAK_COVERAGE = 0.5;

export function findInManual(
    m: CompiledManual,
    query: string,
    opts: { limit?: number; kinds?: Array<'playbook' | 'area' | 'op'> } = {}
): FindResult {
    const ix = indexOf(m);
    const limit = Math.max(1, Math.min(30, Number(opts.limit) || 8));
    const q = String(query ?? '').trim();
    // An op name typed in full is an answer, not a query.
    const exact = m.ops.find(o => o.op === q || q.split(/\s+/).includes(o.op));
    const terms = new Map<string, number>();
    for (const t of tokens(q)) {
        terms.set(t, Math.max(terms.get(t) ?? 0, 1));
        for (const s of ix.syn.get(t) ?? []) { terms.set(s, Math.max(terms.get(s) ?? 0, 0.4)); }
    }
    const original = [...new Set(tokens(q))];
    const N = ix.docs.length, k1 = 1.2, b = 0.5;
    const scored: Array<ManualHit & { cover: number }> = [];
    for (const d of ix.docs) {
        if (opts.kinds && !opts.kinds.includes(d.kind)) { continue; }
        let s = 0;
        for (const [t, w] of terms) {
            const tf = d.tf.get(t);
            if (!tf) { continue; }
            const df = ix.df.get(t) ?? 0;
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
            s += w * idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d.len / ix.avgLen));
        }
        if (exact && d.kind === 'op' && d.id === exact.op) { s += 100; }
        if (s <= 0) { continue; }
        // An op whose very name the request spells out ("cancel the task" → tasks.cancel)
        // is the answer itself, ahead of the guide that would lead to it.
        if (d.name.length) {
            const named = d.name.filter(t => terms.has(t)).length / d.name.length;
            s *= named >= 1 ? 1.6 : named >= 0.5 ? 1.15 : 1;
        }
        s *= KIND_BOOST[d.kind];
        // How much of what was asked this document accounts for, synonyms included.
        const cover = original.length
            ? original.filter(t => d.tf.has(t) || (ix.syn.get(t) ?? []).some(x => d.tf.has(x))).length / original.length
            : 0;
        scored.push({
            kind: d.kind, id: d.id, title: d.title, summary: d.summary, score: Math.round(s * 100) / 100,
            ...(d.effect ? { effect: d.effect } : {}),
            next: d.kind === 'op' ? `farm.ops op=${d.id}` : `farm.guide id=${d.id}`,
            cover
        });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const hits = scored.slice(0, limit).map(({ cover, ...h }) => h);
    const top = scored[0];
    return { query: q, hits, weak: !top || (top.cover < WEAK_COVERAGE && top.score < 100) };
}

export function renderFind(r: FindResult): string {
    if (!r.hits.length) {
        return `Nothing in the manual matches "${r.query}". Try other words (what the user wants done, `
            + 'in English), or read the map: `farm.guide`.';
    }
    const lines = [`Best matches for "${r.query}":`];
    r.hits.forEach((h, i) => {
        const badge = h.kind === 'op' ? ` [${h.effect}]` : '';
        lines.push(`${i + 1}. [${h.kind}] ${h.id}${badge} — ${h.kind === 'op' ? h.summary : h.title}  → \`${h.next}\``);
    });
    if (r.weak) {
        lines.push('', 'These are weak matches. If none fits, read the map (`farm.guide`) or browse an area '
            + '(`farm.ops area=<id>`).');
    }
    return lines.join('\n');
}

// ------------------------------------------------------------------ did-you-mean

function editDistance(a: string, b: string): number {
    if (a === b) { return 0; }
    const prev = new Array(b.length + 1).fill(0).map((_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const up = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = up;
        }
    }
    return prev[b.length];
}

/** The registered names closest to one that does not exist: same namespace, few edits, shared words. */
export function suggestOps(names: readonly string[], wanted: string, max = 3): string[] {
    const w = String(wanted ?? '').trim();
    if (!w) { return []; }
    const ns = w.split('.')[0].toLowerCase();
    const wt = new Set(tokens(w.replace(/\./g, ' ')));
    const scored = names.map(n => {
        let s = 0;
        if (n.split('.')[0].toLowerCase() === ns) { s += 2; }
        const d = editDistance(w.toLowerCase(), n.toLowerCase());
        if (d <= 3) { s += 4 - d; }
        for (const t of tokens(n.replace(/\./g, ' '))) { if (wt.has(t)) { s += 1; } }
        return { n, s };
    }).filter(x => x.s >= 2);
    scored.sort((a, b) => b.s - a.s || a.n.localeCompare(b.n));
    return scored.slice(0, max).map(x => x.n);
}

// ------------------------------------------------------------------ the three ops

/**
 * Answer `farm.guide`, `farm.find` or `farm.ops` from a compiled manual, or
 * `undefined` for any other op. Errors are the caller's to report.
 */
export function answerManualOp(m: CompiledManual, op: string, args: Record<string, unknown>): ManualReply | undefined {
    const json = str(args.format).toLowerCase() === 'json';
    if (op === 'farm.guide') {
        const id = str(args.id) || str(args.topic) || str(args.area) || str(args.playbook);
        const q = str(args.q);
        if (!id && q) { return answerManualOp(m, 'farm.find', { q, format: args.format }); }
        if (!id) { return { ok: true, result: json ? { map: renderMap(m) } : md(renderMap(m)) }; }
        const d = findDoc(m, id);
        if (d) { return { ok: true, result: json ? d : md(renderDoc(m, d)) }; }
        const o = findOp(m, id);
        if (o) { return { ok: true, result: json ? o : md(renderOpContract(m, o)) }; }
        const near = findInManual(m, id.replace(/[-_.]/g, ' '), { limit: 3, kinds: ['playbook', 'area'] }).hits.map(h => h.id);
        return {
            ok: false,
            error: `No guide "${id}".` + (near.length ? ` Closest: ${near.join(', ')}.` : '')
                + ' The map lists every area and playbook: farm.guide'
        };
    }
    if (op === 'farm.find') {
        const q = str(args.q) || str(args.query);
        if (!q) { return { ok: false, error: 'farm.find needs q="<what you want to do>".' }; }
        const kinds = str(args.kind) ? str(args.kind).split(',').map(s => s.trim())
            .filter((k): k is 'playbook' | 'area' | 'op' => k === 'playbook' || k === 'area' || k === 'op') : undefined;
        const r = findInManual(m, q, { limit: Number(args.limit) || 8, ...(kinds && kinds.length ? { kinds } : {}) });
        return { ok: true, result: json ? r : md(renderFind(r)) };
    }
    if (op === 'farm.ops') {
        if (bool(args.full)) {
            // The shape every caller before the manual received: one row per op.
            return { ok: true, result: m.ops.map(o => ({ op: o.op, describe: o.describe })) };
        }
        const name = str(args.op) || str(args.name);
        if (name) {
            const o = findOp(m, name);
            if (o) { return { ok: true, result: json ? o : md(renderOpContract(m, o)) }; }
            const near = suggestOps(m.ops.map(x => x.op), name);
            return {
                ok: false,
                error: `Unknown op "${name}".` + (near.length ? ` Did you mean ${near.join(', ')}?` : '')
                    + ` Search: farm.find q="${name.replace(/\./g, ' ')}"`
            };
        }
        const area = str(args.area);
        if (area) {
            if (!m.ops.some(o => o.area === area)) {
                return { ok: false, error: `No area "${area}". Areas: ${areasInOrder(m).map(a => a.id).join(', ')}.` };
            }
            return { ok: true, result: json ? m.ops.filter(o => o.area === area).map(({ describe, ...rest }) => rest) : md(renderAreaOps(m, area)) };
        }
        const q = str(args.q);
        if (q) {
            const r = findInManual(m, q, { limit: Number(args.limit) || 10, kinds: ['op'] });
            return { ok: true, result: json ? r : md(renderFind(r)) };
        }
        return {
            ok: true,
            result: json ? m.ops.map(({ describe, ...rest }) => rest) : md(renderOpsIndex(m))
        };
    }
    return undefined;
}

/** Light shape check for a manual read off disk: anything else is ignored rather than trusted. */
export function looksLikeManual(x: unknown): x is CompiledManual {
    const m = x as CompiledManual;
    return !!m && typeof m === 'object' && m.schema === MANUAL_SCHEMA && Array.isArray(m.docs)
        && Array.isArray(m.ops) && typeof m.map === 'string' && typeof m.card === 'string';
}
