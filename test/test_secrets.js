// SecretsVault (compiled core/secrets.js): metadata (description, timestamps,
// per-agent scope) and — the security-critical part — env(agentId) filtering,
// which decides whether a spawned agent's task receives a given secret.
const path = require('path');
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

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
