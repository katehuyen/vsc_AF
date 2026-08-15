// Writes decisions into parity.manifest.json — the one-off tool the initial
// fill was done with, kept because the next sweep will want it too.
//
//   node tools/parity_decide.js <decisions.json>
//
// A decisions file is `{ "<capability>": "<code>", … }` where the code is
// either `op:<name>[,<name>…]` or one of the exemption codes below. Anything
// the manifest does not already have is reported rather than invented, so a
// renamed capability shows up instead of silently doing nothing.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'parity.manifest.json');

/** The reason each code writes, so an exemption never reads as a shrug. */
const REASONS = {
    'nav-open': ['navigation', 'Opens a page, a document or a card; whatever is done on that surface is a capability of its own and carries its own op.'],
    'nav-copy': ['navigation', 'Copies a value to the clipboard — nothing is read that an agent could not read directly, and nothing is changed.'],
    'nav-reveal': ['navigation', 'Reveals a path, a terminal or a row in the shell or the UI. It moves the eye and changes nothing.'],
    'nav-refresh': ['navigation', 'Re-reads what is already on disk and repaints. No state of its own, nothing produced that a read op does not already return.'],
    'nav-focus': ['navigation', 'Moves the selection or the focus inside a page that is already open.'],
    'visual': ['visual', 'A filter, a sort, a column or an expand/collapse choice — the same data, drawn differently.'],
    'picker': ['file-picker', 'The file-picker adaptor in front of a capability that IS on the bridge: the dialog chooses a path, the op takes the path directly.'],
    'secrets': ['secrets', 'The secret vault is deliberately not on the bridge — it is managed from the panel only (`_REF/bridge.md`).'],
    'human': ['human-only', 'Documented as needing a person: the run exists to be judged by one, and a bridge caller would only be automating the judgement away.']
};

const decisions = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const manifest = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byName = new Map(manifest.entries.map(e => [e.capability, e]));

let applied = 0;
const unknown = [];
for (const [capability, raw] of Object.entries(decisions)) {
    const entry = byName.get(capability);
    if (!entry) { unknown.push(capability); continue; }
    const [code, extra] = String(raw).split('|');
    delete entry.ops; delete entry.exempt; delete entry.core; delete entry.fronts;
    if (code.startsWith('op:')) {
        entry.ops = code.slice(3).split(',').map(s => s.trim()).filter(Boolean);
    } else if (REASONS[code]) {
        const [kind, why] = REASONS[code];
        entry.exempt = { kind, why };
        if (extra) { entry.fronts = extra; }
    } else {
        unknown.push(`${capability} (unknown code "${code}")`);
        continue;
    }
    applied++;
}

manifest.entries.sort((a, b) => a.capability.localeCompare(b.capability));
fs.writeFileSync(FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const open = manifest.entries.filter(e => !e.exempt && !(e.ops || []).length);
console.log(`${applied} decision(s) applied · ${open.length} still open`);
for (const u of unknown) { console.log('  ? ' + u); }
