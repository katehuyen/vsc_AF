#!/usr/bin/env node
/**
 * U-235 — THE THEME VARIABLES A WEBVIEW REALLY GETS, READ OFF VS CODE ITSELF.
 *
 * A page here colours itself only through `var(--vscode-…)`; what those resolve to is
 * VS Code's business: the theme file's own colour, else the colour registry's default for
 * that theme kind. A hand-written table in the renderer guessed a subset, so a light render
 * fell back to the dark defaults wherever it guessed nothing — it measured the renderer.
 *
 * This reads the INSTALLED VS Code: the four default themes (with their includes) and the
 * registry defaults compiled into the workbench — a literal, an alias to another colour, or
 * transparent(colour, a) — plus the terminal palette, for every variable media/ and src/ use.
 * Writes test/theme_vars.json; anything it cannot resolve is listed there, never guessed.
 *
 *   node tools/theme_vars.js [<VS Code install dir>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'theme_vars.json');
const KINDS = { dark: ['dark_modern.json', 'dark'], light: ['light_modern.json', 'light'], 'hc-dark': ['hc_black.json', 'hcDark'], 'hc-light': ['hc_light.json', 'hcLight'] };
/** Set from the user's font settings, not from a theme. */
const NOT_COLOURS = /^(font-|editor-font-)/;

function installDir() {
    if (process.argv[2]) { return process.argv[2]; }
    const where = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['code'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    return path.dirname(path.dirname(fs.realpathSync(where)));
}

/** Every `--vscode-x` media/ and src/ ask for, as `x`. */
function usedVars() {
    const seen = new Set();
    const walk = (dir, re) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p, re); } else if (re.test(e.name)) {
                for (const m of fs.readFileSync(p, 'utf8').matchAll(/var\(\s*--vscode-([\w-]+)/g)) { seen.add(m[1]); }
            }
        }
    };
    walk(path.join(ROOT, 'media'), /\.(js|css)$/);
    walk(path.join(ROOT, 'src'), /\.ts$/);
    return [...seen].filter(v => !NOT_COLOURS.test(v)).sort();
}

function themeColours(dir, file) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    let j;
    try { j = JSON.parse(raw); } catch { j = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')); }
    return Object.assign({}, j.include ? themeColours(dir, path.basename(j.include)) : {}, j.colors || {});
}

/**
 * The registry out of the minified workbench: key → every `X=f("key", <default>` seen (a key can be
 * registered in more than one place, and only one of them is the colour), and identifier → where
 * each `X=` is — minified names repeat across modules, so an alias is the NEAREST one.
 */
function registry(bundle) {
    const defaults = new Map(), ids = new Map();
    const add = (map, k, v) => { if (!map.has(k)) { map.set(k, []); } map.get(k).push(v); };
    // a colour id may have no dot at all (foreground, focusBorder, contrastBorder)
    const re = /([\w$]+)=[\w$]+\("([a-zA-Z][\w-]*(?:\.[\w-]+)*)",/g;
    let m;
    while ((m = re.exec(bundle))) {
        add(ids, m[1], { key: m[2], pos: m.index });
        const expr = topLevelArg(bundle, re.lastIndex);
        if (expr !== null) { add(defaults, m[2], { expr, pos: m.index }); }
    }
    for (const t of bundle.matchAll(/"(terminal\.ansi\w+)":\{index:\d+,defaults:(\{[^}]*\})\}/g)) { add(defaults, t[1], { expr: t[2], pos: t.index }); }
    return { defaults, ids };
}

/** The expression starting at `i`, up to the next comma or closing paren at depth 0. */
function topLevelArg(s, i) {
    let depth = 0, q = '';
    for (let j = i; j < s.length && j < i + 600; j++) {
        const c = s[j];
        if (q) { if (c === '\\') { j++; } else if (c === q) { q = ''; } continue; }
        if (c === '"' || c === '\'' || c === '`') { q = c; continue; }
        if ('({['.includes(c)) { depth++; } else if (')}]'.includes(c)) { if (depth === 0) { return s.slice(i, j).trim(); } depth--; }
        else if (c === ',' && depth === 0) { return s.slice(i, j).trim(); }
    }
    return null;
}

function splitTop(s) {
    const out = [];
    let depth = 0, from = 0, q = '';
    for (let j = 0; j < s.length; j++) {
        const c = s[j];
        if (q) { if (c === q) { q = ''; } continue; }
        if (c === '"') { q = c; continue; }
        if ('({['.includes(c)) { depth++; } else if (')}]'.includes(c)) { depth--; } else if (c === ',' && depth === 0) { out.push(s.slice(from, j)); from = j + 1; }
    }
    out.push(s.slice(from));
    return out.map(x => x.trim()).filter(Boolean);
}

/** #rgb / #rrggbb / #rrggbbaa with its alpha multiplied by `a`. */
function transparent(hex, a) {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) { h = h.split('').map(c => c + c).join(''); }
    const alpha = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return '#' + h.slice(0, 6) + Math.round(alpha * a * 255).toString(16).padStart(2, '0');
}

function resolver(theme, reg, field) {
    const memo = new Map();
    /** A key's value: the theme's own, else the first registration whose default resolves (null = VS Code sets none). */
    function key(k, depth) {
        if (theme[k] !== undefined) { return theme[k]; }
        if (memo.has(k)) { return memo.get(k); }
        let v;
        for (const c of depth > 12 ? [] : reg.defaults.get(k) || []) {
            v = expr(c.expr, depth + 1, c.pos);
            if (v !== undefined) { break; }
        }
        memo.set(k, v);
        return v;
    }
    function alias(id, pos, depth) {
        const near = (reg.ids.get(id) || []).slice().sort((a, b) => Math.abs(a.pos - pos) - Math.abs(b.pos - pos))[0];
        return near ? key(near.key, depth) : undefined;
    }
    function expr(e, depth, pos) {
        e = e.trim();
        if (/^"#[0-9a-fA-F]{3,8}"$/.test(e)) { return e.slice(1, -1).toLowerCase(); }
        if (e === 'null') { return null; }
        if (/^[\w$]+\.black$/.test(e)) { return '#000000'; }
        if (/^[\w$]+\.white$/.test(e)) { return '#ffffff'; }
        if (/^[\w$]+\.transparent$/.test(e)) { return '#00000000'; }
        if (e.startsWith('{')) {
            const f = splitTop(e.slice(1, -1)).map(p => [p.slice(0, p.indexOf(':')).trim(), p.slice(p.indexOf(':') + 1)]).find(([n]) => n === field);
            return f ? expr(f[1], depth, pos) : undefined;
        }
        const tr = /^[\w$]+\(([\w$.]+|"#[0-9a-fA-F]+"),\s*([\d.]+)\)$/.exec(e);
        if (tr && reg.transparentFn && e.startsWith(reg.transparentFn + '(')) {
            const base = expr(tr[1], depth, pos);
            return typeof base === 'string' && base.startsWith('#') ? transparent(base, Number(tr[2])) : undefined;
        }
        if (/^[\w$]+$/.test(e) && reg.ids.has(e)) { return alias(e, pos, depth); }
        return undefined;
    }
    return k => key(k, 0);
}

function main() {
    const dir = installDir();
    const app = path.join(dir, 'resources', 'app');
    const version = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version;
    const bundle = fs.readFileSync(path.join(app, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'), 'utf8');
    const reg = registry(bundle);
    // transparent() is the function charts.lines is written with: "charts.lines",<fn>(<foreground>,.5)
    const tl = /"charts\.lines",([\w$]+)\(/.exec(bundle);
    reg.transparentFn = tl ? tl[1] : '';
    const themesDir = path.join(app, 'extensions', 'theme-defaults', 'themes');
    const vars = usedVars();
    // none: VS Code sets no colour (the page's fallback applies) · unresolved: a default this could not read
    const out = { vscode: version, generated: new Date().toISOString().slice(0, 10), vars: vars.length, themes: {}, none: {}, unresolved: {} };
    for (const [kind, [file, field]] of Object.entries(KINDS)) {
        const colours = themeColours(themesDir, file);
        const value = resolver(colours, reg, field);
        out.themes[kind] = {};
        out.none[kind] = [];
        out.unresolved[kind] = [];
        for (const v of vars) {
            // --vscode-a-b → a.b: VS Code writes a colour id's dots as dashes
            const val = value(v.replace(/-/g, '.'));
            if (typeof val === 'string') { out.themes[kind][v] = val.toLowerCase(); } else { out[val === null ? 'none' : 'unresolved'][kind].push(v); }
        }
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
    console.log(`VS Code ${version}: ${vars.length} variables · ` + Object.keys(KINDS).map(k => `${k} ${Object.keys(out.themes[k]).length} (none ${out.none[k].length}, unresolved ${out.unresolved[k].length})`).join(' · '));
    for (const k of Object.keys(KINDS)) { if (out.unresolved[k].length) { console.log(`  ${k} unresolved: ${out.unresolved[k].join(' ')}`); } }
    console.log(OUT);
}

main();
