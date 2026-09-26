// A local Airtable engine in memory, for the media library tests (X-418): the part
// of EngineClient the recorder uses — list, get, versioned update, next id, templates, create.
'use strict';

module.exports = function fakeEngine(name = 'TEST', templates = ['Video-Raw', 'Video-Source']) {
    const items = new Map();
    let n = 0;
    const calls = [];
    const clone = o => JSON.parse(JSON.stringify(o));
    return {
        instance: { name, port: 3000 }, items, calls,
        async listItems() { calls.push('list'); return [...items.values()].map(x => clone(x.item)); },
        async getRecord(c, id) { const x = items.get(id); if (!x) { throw new Error('HTTP 404'); } return { item: clone(x.item), version: x.version }; },
        async updateRecord(c, id, p) {
            const x = items.get(id);
            if (p.expectedVersion !== x.version) { throw new Error('HTTP 409 version_conflict'); }
            items.set(id, { item: p.item, version: x.version + 1 }); calls.push('update ' + id); return {};
        },
        async nextMediaId(t, fmt, d) { return { nextId: `media_${fmt}_${d}_${String(++n).padStart(4, '0')}` }; },
        async mediaTemplates() { return templates.map(id => ({ id })); },
        async mediaTemplate(id) { return { item: { style: 'tpl-' + id, workflow: { stage: 'from-template' } } }; },
        async createFile(rel, it) { items.set(it.id, { item: it, version: 1 }); calls.push('create ' + it.id); return {}; },
        /** the records, by file name */
        byName(base) { return [...items.values()].map(x => x.item).find(i => String(i.media.file_path).endsWith('/' + base)); }
    };
};
