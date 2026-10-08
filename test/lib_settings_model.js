// U-228 — Farm Settings draws its four cards (Engines, Claude Code, Agent folders, Open with) at the head of the section
// each belongs to. The real model always carries every section; a fixture or a test that builds a few rows by hand adds
// the sections its cards need with this, in the catalog's order, so a card has its home without inventing rows.
'use strict';
const path = require('path');
const { SECTIONS } = require(path.join(__dirname, '..', 'out', 'core', 'settingsCatalog', 'index.js'));

function withCardSections(categories, ids) {
    const have = new Set((categories || []).map(c => c.id));
    const add = SECTIONS.filter(s => ids.indexOf(s.id) >= 0 && !have.has(s.id))
        .map(s => ({ id: s.id, label: s.label, about: s.about, groups: [], items: [] }));
    const at = id => { const i = SECTIONS.findIndex(s => s.id === id); return i < 0 ? SECTIONS.length : i; };
    return (categories || []).concat(add).sort((a, b) => at(a.id) - at(b.id));
}

module.exports = { withCardSections };
