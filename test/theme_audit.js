#!/usr/bin/env node
/**
 * U-236 — THE THEME AUDIT OVER EVERY PAGE. Each fixture is rendered (test/render_page.js) in
 * a theme and measured (test/lib_theme_audit.js): its texts below the contrast they need, and
 * its colour fingerprint.
 *
 *   node test/theme_audit.js                       light: low texts per page
 *   node test/theme_audit.js --theme <kind>        the same in dark / hc-dark / hc-light; a high-contrast
 *                                                  kind also counts its LOST EDGES (a box the dark theme
 *                                                  draws whose edge there is below 3:1), and its
 *                                                  --write-budget writes test/themeaudit.hc.manifest.json
 *   node test/theme_audit.js --snapshot <file>     write every page's DARK fingerprint
 *   node test/theme_audit.js --compare <file>      ‼️ the dark theme against that snapshot —
 *                                                  take one before a light-theme change, compare after
 *   node test/theme_audit.js --under <id>          the kind as a user really runs it: under a colour customised
 *                                                  by hand (a scenario of test/theme_vars.json, lib_theme_under.js)
 *   node test/theme_audit.js --pages a,b           only those fixtures
 *   node test/theme_audit.js --write-budget        write test/themeaudit.manifest.json from today
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { audit } = require('./lib_theme_audit');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const MANIFEST = path.join(__dirname, 'themeaudit.manifest.json');
const HC_MANIFEST = path.join(__dirname, 'themeaudit.hc.manifest.json');
const HC = ['hc-dark', 'hc-light'];
const FLAG = { dark: [], light: ['--light'], 'hc-dark': ['--hc'], 'hc-light': ['--hc-light'] };
const SUFFIX = { dark: '', light: '.light', 'hc-dark': '.hc', 'hc-light': '.hclight' };

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] || '' : null; }
function pages() {
    const want = arg('--pages');
    const all = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
    return want ? all.filter(p => want.split(',').includes(p)) : all;
}

function render(page, theme, out, under) {
    return new Promise(resolve => execFile(process.execPath, [path.join(__dirname, 'render_page.js'), page].concat(FLAG[theme], under ? ['--under', under] : []),
        { cwd: ROOT, env: Object.assign({}, process.env, { AF_RENDER_OUT: out }), timeout: 180000 },
        err => resolve(err ? null : path.join(out, page + SUFFIX[theme] + (under ? '.' + under : '') + '.html'))));
}

/** Every page in `theme` (under a scenario, when one is named), a few at a time: { page: { texts, low, fingerprint, ground } | { error } }. */
async function run(theme, list, bin, width, under) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-render-'));
    const result = {};
    const queue = list.slice();
    const worker = async () => {
        while (queue.length) {
            const page = queue.shift();
            const file = await render(page, theme, out, under);
            if (!file || !fs.existsSync(file)) { result[page] = { error: 'no render' }; continue; }
            const r = await new Promise(res => setImmediate(() => res(audit(file, bin))));
            result[page] = r.error ? { error: r.error } : { texts: r.texts, low: r.low.length, fingerprint: r.fingerprint, ground: r.ground, worst: r.low.slice(0, 3), unread: r.unread, boxes: r.boxes, edges: r.edges };
        }
    };
    await Promise.all(Array.from({ length: width }, worker));
    try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* still held */ }
    return result;
}

/** U-239 — what a high-contrast kind loses: each box the dark theme draws (a fill or a line) whose edge
 *  there is below 3:1, or that is no box there at all — [index, edge x100, box, where]. */
function lost(dark, hc) {
    if (!dark || !hc || dark.error || hc.error) { return []; }
    const there = new Map(hc.edges.map(e => [e[0], e]));
    return dark.edges.filter(e => e[2]).map(e => there.get(e[0]) || [e[0], 100, 0, e[3]]).filter(e => e[1] < 300);
}

async function main() {
    const bin = require('./shoot_page').browser();
    const list = pages();
    const snap = arg('--snapshot'), cmp = arg('--compare');
    const theme = snap || cmp ? 'dark' : (arg('--theme') || 'light');
    const r = await run(theme, list, bin, 3, arg('--under') || '');
    const base = HC.includes(theme) ? await run('dark', list, bin, 3) : null;
    if (snap) {
        fs.writeFileSync(snap, JSON.stringify(Object.fromEntries(Object.entries(r).map(([p, v]) => [p, v.fingerprint || v.error])), null, 1) + '\n', 'utf8');
        console.log(`dark fingerprints of ${list.length} page(s) → ${snap}`);
        return;
    }
    if (cmp) {
        const was = JSON.parse(fs.readFileSync(cmp, 'utf8'));
        const moved = list.filter(p => was[p] !== undefined && was[p] !== (r[p].fingerprint || r[p].error));
        console.log(moved.length ? `‼️ the dark theme changed on: ${moved.join(', ')}` : `the dark theme is unchanged on all ${list.length} page(s)`);
        process.exitCode = moved.length ? 1 : 0;
        return;
    }
    for (const p of list) {
        const unread = r[p].unread && r[p].unread.length ? ` · colours it cannot read: ${r[p].unread.join(' ')}` : '';
        const edges = base ? ` · ${lost(base[p], r[p]).length} lost edge(s)` : '';
        console.log(`${p.padEnd(22)} ${r[p].error ? 'ERROR ' + r[p].error : `${r[p].low} low of ${r[p].texts}${edges}${unread}`}`);
    }
    if (base && process.argv.includes('--write-budget')) {
        const hc = fs.existsSync(HC_MANIFEST) ? JSON.parse(fs.readFileSync(HC_MANIFEST, 'utf8')) : {};
        hc[theme] = Object.fromEntries(list.filter(p => !r[p].error && !base[p].error).map(p => [p, [r[p].low, lost(base[p], r[p]).length]]));
        fs.writeFileSync(HC_MANIFEST, JSON.stringify(hc, null, 1) + '\n', 'utf8');
        console.log('→ ' + HC_MANIFEST);
    } else if (process.argv.includes('--write-budget')) {
        const budget = { theme, pages: Object.fromEntries(list.filter(p => !r[p].error).map(p => [p, r[p].low])) };
        fs.writeFileSync(MANIFEST, JSON.stringify(budget, null, 1) + '\n', 'utf8');
        console.log('→ ' + MANIFEST);
    }
}

if (require.main === module) { main(); }
module.exports = { run, pages, lost, HC, HC_MANIFEST };
