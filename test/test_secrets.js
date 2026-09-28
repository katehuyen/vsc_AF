// SecretsVault (compiled core/secrets.js): metadata (description, timestamps,
// per-agent scope) and — the security-critical part — env(agentId) filtering,
// which decides whether a spawned agent's task receives a given secret.
const path = require('path');
const fs = require('fs');
const Module = require('module');

// ---- fake vscode (SecretsVault only touches the injected storage/state; the
// module still `require('vscode')` at load, so return an empty shim) ----
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return {}; }
    return origLoad.call(this, request, parent, isMain);
};

const { SecretsVault, looksLikePlaintextSecret } =
    require(path.join(__dirname, '..', 'out', 'core', 'secrets.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// keychain-backed store (async) + globalState memento (sync get, async update)
function fakes() {
    const kv = new Map();
    const storage = {
        get: async (k) => kv.get(k),
        store: async (k, v) => { kv.set(k, v); },
        delete: async (k) => { kv.delete(k); }
    };
    const st = new Map();
    const state = {
        get: (k, d) => (st.has(k) ? st.get(k) : d),
        update: async (k, v) => { st.set(k, v); }
    };
    return { storage, state };
}

(async () => {
    // ---------- set + metadata + list ----------
    {
        const { storage, state } = fakes();
        const v = new SecretsVault(storage, state);
        await v.set('A', 'aval', { description: 'account A' });
        await v.set('B', 'bval');
        ok('names lists stored secrets sorted', JSON.stringify(v.names()) === '["A","B"]');
        const list = v.list();
        ok('list carries description', list.find(s => s.name === 'A').description === 'account A');
        ok('list never leaks values', !JSON.stringify(list).includes('aval'));
        ok('timestamps set on create', list[0].createdAt > 0 && list[0].updatedAt > 0);
        ok('get returns cached value', v.get('A') === 'aval');
    }

    // ---------- env(agentId) scope filtering ----------
    {
        const { storage, state } = fakes();
        const v = new SecretsVault(storage, state);
        await v.set('SHARED', 's');                         // unrestricted → all agents
        await v.set('ONLY1', 'x', { agents: ['ag1'] });     // scoped to ag1
        const e0 = v.env();                                 // no agent context
        ok('unrestricted secret goes to every env', e0.SHARED === 's');
        ok('scoped secret withheld with no agent context', e0.ONLY1 === undefined);
        const e1 = v.env('ag1');
        ok('scoped agent receives its secret', e1.ONLY1 === 'x' && e1.SHARED === 's');
        const e2 = v.env('ag2');
        ok('other agent does not receive scoped secret', e2.ONLY1 === undefined && e2.SHARED === 's');
    }

    // ---------- setMeta re-scopes without changing the value ----------
    {
        const { storage, state } = fakes();
        const v = new SecretsVault(storage, state);
        await v.set('K', 'kval', { agents: ['ag1'] });
        await v.setMeta('K', { agents: ['ag2'] });
        ok('re-scope moves the secret to the new agent', v.env('ag2').K === 'kval' && v.env('ag1').K === undefined);
        ok('re-scope keeps the value intact', v.get('K') === 'kval');
        await v.setMeta('K', { agents: [] });               // empty = back to all agents
        ok('empty scope means all agents again', v.env('anyone').K === 'kval');
        await v.setMeta('nope', { description: 'x' });
        ok('setMeta on unknown name is a no-op', v.list().every(s => s.name !== 'nope'));
    }

    // ---------- createdAt preserved across value replacement ----------
    {
        const { storage, state } = fakes();
        const v = new SecretsVault(storage, state);
        await v.set('P', 'v1', { description: 'first' });
        const created = v.list()[0].createdAt;
        await new Promise(r => setTimeout(r, 5));
        await v.set('P', 'v2');                              // replace value only
        const after = v.list()[0];
        ok('replacing value keeps createdAt', after.createdAt === created);
        ok('replacing value bumps updatedAt', after.updatedAt >= created);
        ok('description survives value replacement', after.description === 'first');
        ok('new value cached', v.get('P') === 'v2');
    }

    // ---------- delete + refresh reload ----------
    {
        const { storage, state } = fakes();
        const v = new SecretsVault(storage, state);
        await v.set('D', 'd', { agents: ['ag1'], description: 'gone soon' });
        await v.delete('D');
        ok('delete removes from names', !v.names().includes('D'));
        ok('delete removes from env', v.env('ag1').D === undefined);
        ok('delete removes metadata', v.list().every(s => s.name !== 'D'));

        await v.set('R', 'rval');
        const v2 = new SecretsVault(storage, state);         // same backing store, fresh cache
        ok('fresh vault has empty cache before refresh', v2.get('R') === undefined);
        await v2.refresh();
        ok('refresh reloads values from keychain', v2.get('R') === 'rval' && v2.env().R === 'rval');
    }

    // ---------- plaintext sniff still works ----------
    {
        ok('sniffs an api key', looksLikePlaintextSecret('{"api_key":"abcdefghijklmnop1234"}') !== undefined);
        ok('ignores {secret:...} placeholders', looksLikePlaintextSecret('{"token":"{secret:FAL_KEY}"}') === undefined);
    }

    
// ---------- X-173 — WHERE THE ONE GESTURE THIS PAGE IS FOR ACTUALLY SITS ----
//
// ‼️ `+ Add secret` used to be handed to the header as a page ACTION, which puts
// it in the same row as the twelve global navigation buttons with a divider
// between them. A row mixing "go somewhere else" with "make a new thing here"
// reads as thirteen destinations, and the gesture the page exists for is the
// least findable thing on it. It belongs beside the filter — the row that is
// already about the list underneath.
{
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'secrets.js'), 'utf8');
    const header = page.slice(page.indexOf('AFHeader.html({'), page.indexOf('class="card sec-intro"'));
    ok('‼️ the add button is NOT a header action — the nav row is destinations only',
        !/actions:/.test(header) && !/sec-add/.test(header));
    ok('…it is in the page\'s own toolbar, on the row the filter is on',
        /class="sec-tools"[\s\S]*?id="sec-q"[\s\S]*?id="sec-add"/.test(page));
    ok('…and that row is one thing rather than two stacked ones',
        page.includes('.sec-tools { display: flex;'));
    ok('the empty state still points at it, since it is the only thing to do there',
        page.includes('No secrets stored yet — click <b>+ Add secret</b>'));
}

// ---------- X-409 — farm only: Agent Farm reads it, no agent receives it ----
{
    const { storage, state } = fakes();
    const v = new SecretsVault(storage, state);
    await v.set('OLD_KEY', 'old-value-123');
    await v.set('SCOPED', 'scoped-value', { agents: ['dev'] });
    await v.set('KAPICI_KEY', 'kapici-value', { farmOnly: true });
    await v.set('BOTH', 'both-value', { farmOnly: true, agents: ['dev'] });
    for (const agent of ['dev', 'other', undefined]) {
        const env = v.env(agent);
        ok('farm-only never in env() for ' + agent, !('KAPICI_KEY' in env) && !('BOTH' in env));
    }
    ok('farm-only still read by get()', v.get('KAPICI_KEY') === 'kapici-value' && v.get('BOTH') === 'both-value');
    ok('farm-only still substituted in an explicit {secret:NAME}', v.substitute('{secret:KAPICI_KEY}') === 'kapici-value');
    ok('existing records unchanged: unscoped to all', v.env('other').OLD_KEY === 'old-value-123' && v.env(undefined).OLD_KEY === 'old-value-123');
    ok('existing records unchanged: scoped to its agent', v.env('dev').SCOPED === 'scoped-value' && !('SCOPED' in v.env('other')));
    const rows = Object.fromEntries(v.list().map(r => [r.name, r]));
    ok('list says farmOnly, false by default', rows.KAPICI_KEY.farmOnly === true && rows.OLD_KEY.farmOnly === false);
    await v.set('KAPICI_KEY', 'kapici-value-2');
    ok('replacing the value keeps farm-only', v.list().find(r => r.name === 'KAPICI_KEY').farmOnly === true && !('KAPICI_KEY' in v.env('dev')));
    await v.setMeta('KAPICI_KEY', { farmOnly: false });
    ok('turned off, it reaches agents again', v.env('dev').KAPICI_KEY === 'kapici-value-2');

    await v.set('TYPESAFE_API_KEY', 'ts-value');
    await v.set('CHOSEN', 'c', { farmOnly: false });
    const moved = await v.adoptFarmOnly(['TYPESAFE_API_KEY', 'CHOSEN', 'ABSENT']);
    ok('TYPESAFE_API_KEY moved into farm-only', moved.join() === 'TYPESAFE_API_KEY' && !('TYPESAFE_API_KEY' in v.env('dev')) && v.get('TYPESAFE_API_KEY') === 'ts-value');
    ok('a scope already chosen is never overridden, an absent name is skipped', v.env('dev').CHOSEN === 'c');
    ok('adoption runs once: a later explicit off stays off', (await v.setMeta('TYPESAFE_API_KEY', { farmOnly: false }), (await v.adoptFarmOnly(['TYPESAFE_API_KEY'])).length === 0));
    ok('the adopt list names the Kapici key', require(path.join(__dirname, '..', 'out', 'core', 'secrets.js')).FARM_ONLY_ADOPT.includes('TYPESAFE_API_KEY'));

    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'secrets.js'), 'utf8');
    ok('page: the farm-only box travels with the save', /farmOnly: !!form\.farmOnly/.test(page));
    ok('page: the box mirrors its value first, then explains', /tip: 'Farm only: ' \+ \(form\.farmOnly \? 'on' : 'off'\) \+ '\\n\\n/.test(page));
    ok('page: a farm-only row says so', page.includes('<span class="tag farm"'));
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'secretsPanel.ts'), 'utf8');
    ok('panel: saves the flag both ways', /vault\.set\(name, value, \{ description, agents, farmOnly \}\)/.test(panel) && /vault\.setMeta\(name, \{ description, agents, farmOnly \}\)/.test(panel));
}
console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
