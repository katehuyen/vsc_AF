// U-220 — A RENDER DRAWN UNDER A COLOUR CUSTOMISED BY HAND. test/theme_vars.json holds the themes
// as shipped, and beside them each scenario a user really runs (`under`): the variables a theme kind
// hands a page once workbench.colorCustomizations is resolved over it. `--under <id>` on the render,
// shoot and audit tools draws a kind with those variables laid over its own table, into a file of its
// own (now.light.darkground.html) — a light render that only ever drew Light Modern as shipped
// measured a ground this machine never showed.
'use strict';
const T = require('./theme_vars.json');

/**
 * `--under <id>` on a command line. `theme` (dark · light · hc-dark · hc-light) is given by a tool
 * that draws; one that only names the file leaves it out.
 * → { id, suffix, flag, vars }: the file suffix, the flag that draws it, and the variables it changes.
 */
function underOf(args, theme) {
    const i = args.indexOf('--under');
    if (i < 0) { return { id: '', suffix: '', flag: '', vars: {} }; }
    const id = String(args[i + 1] || '');
    const all = T.under || {};
    const sc = all[id];
    const kinds = sc ? Object.keys(sc.themes) : [];
    if (!sc || (theme && !kinds.includes(theme))) {
        // a scenario that does not exist, or is not one of this kind, draws nothing rather than the plain kind
        console.error(sc ? `--under ${id} is a scenario of ${kinds.join(' / ')}, not of ${theme}`
            : `no scenario "${id}" — have: ${Object.keys(all).map(k => `${k} (${Object.keys(all[k].themes).join(' / ')})`).join(', ') || '(none)'}`);
        process.exit(1);
    }
    return { id, suffix: '.' + id, flag: ' --under ' + id, vars: theme ? sc.themes[theme] : {} };
}

module.exports = { underOf };
