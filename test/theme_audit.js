#!/usr/bin/env node
/**
 * U-236 — THE THEME AUDIT OVER EVERY PAGE. Each fixture is rendered (test/render_page.js) in
 * a theme and measured (test/lib_theme_audit.js): its texts below the contrast they need, and
 * its colour fingerprint.
 *
 *   node test/theme_audit.js                       light: low texts per page
 *   node test/theme_audit.js --theme dark          the same in dark
 *   node test/theme_audit.js --snapshot <file>     write every page's DARK fingerprint
 *   node test/theme_audit.js --compare <file>      ‼️ the dark theme against that snapshot —
 *                                                  take one before a light-theme change, compare after
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
const FLAG = { dark: [], light: ['--light'] };
const SUFFIX = { dark: '', light: '.light' };

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] || '' : null; }
function pages() {
    const want = arg('--pages');
    const all = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
    return want ? all.filter(p => want.split(',').includes(p)) : all;
}

function render(page, theme, out) {
    return new Promise(resolve => execFile(process.execPath, [path.join(__dirname, 'render_page.js'), page].concat(FLAG[theme]),
        { cwd: ROOT, env: Object.assign({}, process.env, { AF_RENDER_OUT: out }), timeout: 180000 },
        err => resolve(err ? null : path.join(out, page + SUFFIX[theme] + '.html'))));
}

/** Every page in `theme`, a few at a time: { page: { texts, low, fingerprint } | { error } }. */
async function run(theme, list, bin, width) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-render-'));
    const result = {};
    const queue = list.slice();
    const worker = async () => {
        while (queue.length) {
            const page = queue.shift();
            const file = await render(page, theme, out);
            if (!file || !fs.existsSync(file)) { result[page] = { error: 'no render' }; continue; }
            const r = await new Promise(res => setImmediate(() => res(audit(file, bin))));
            result[page] = r.error ? { error: r.error } : { texts: r.texts, low: r.low.length, fingerprint: r.fingerprint, worst: r.low.slice(0, 3) };
        }
    };
    await Promise.all(Array.from({ length: width }, worker));
    try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* still held */ }
    return result;
}

async function main() {
    const bin = require('./shoot_page').browser();
    const list = pages();
    const snap = arg('--snapshot'), cmp = arg('--compare');
    const theme = snap || cmp ? 'dark' : (arg('--theme') || 'light');
    const r = await run(theme, list, bin, 3);
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
    for (const p of list) { console.log(`${p.padEnd(22)} ${r[p].error ? 'ERROR ' + r[p].error : `${r[p].low} low of ${r[p].texts}`}`); }
    if (process.argv.includes('--write-budget')) {
        const budget = { theme, pages: Object.fromEntries(list.filter(p => !r[p].error).map(p => [p, r[p].low])) };
        fs.writeFileSync(MANIFEST, JSON.stringify(budget, null, 1) + '\n', 'utf8');
        console.log('→ ' + MANIFEST);
    }
}

if (require.main === module) { main(); }
module.exports = { run, pages };
