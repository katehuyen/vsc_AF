// X-444 — WHICH SCOPE A PHONE NEEDS FOR EACH BRIDGE OP, measured against the
// catalog itself (every op registered in src/extension.ts), not a list here.
//
// The levels nest (read < answer < manage < admin), no op that writes is ever
// readable, the answer ops the design names are answerable, admin namespaces
// stay admin even to look, and an unknown scope may call nothing.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { requiredScope, scopeAllows } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));

const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const ops = [...new Set([...src.matchAll(/op: '([a-zA-Z]+\.[a-zA-Z.]+)'/g)].map(m => m[1]))];
ok('the catalog was read from the source', ops.length > 200);

const WRITE_VERB = /^(add|delete|set|start|restore|run|resume|rename|remove|move|update|pause|dismiss|answer|toggle|sync|stop|save|rescan|rerun|interrupt|handover|export|edit|create|complete|cancel|archive|apply|write|tidy|tag|switch|unpark|unregister|register|send|act|kill|reset|install|approve|reject|claim|pass|attach|clear|purge|revoke|pair|restart|reload|import|check|close|open|focus)/i;
const leaks = ops.filter(op => requiredScope(op) === 'read' && WRITE_VERB.test(op.slice(op.lastIndexOf('.') + 1)));
ok('no op whose verb writes is readable: ' + leaks.join(', '), leaks.length === 0);
ok('every op needs one of the contract\'s scopes', ops.every(op => K.SCOPES.includes(requiredScope(op))));

for (const op of ['console.answer', 'sessions.answerPermission', 'needs.act']) {
    ok(`${op} is answerable, not readable`, requiredScope(op) === 'answer' && scopeAllows('answer', op) && !scopeAllows('read', op));
}
ok('a listing is readable', requiredScope('tasks.list') === 'read' && scopeAllows('read', 'tasks.list'));
ok('starting a session needs manage', requiredScope('console.start') === 'manage' && !scopeAllows('answer', 'console.start') && scopeAllows('manage', 'console.start'));
ok('an unknown op needs manage (fails upward)', requiredScope('newthing.frobnicate') === 'manage');
ok('accounts stay admin even to look', requiredScope('accounts.list') === 'admin' && !scopeAllows('manage', 'accounts.list') && scopeAllows('admin', 'accounts.list'));
ok('restarting the host is admin', !scopeAllows('manage', 'farm.restartExtensionHost'));
for (const op of ['remote.scope', 'remote.pair', 'remote.revoke', 'remote.listen', 'remote.devices', 'remote.audit']) {
    ok(`${op} is admin, so a phone at manage cannot raise its own scope or pair another`, requiredScope(op) === 'admin' && !scopeAllows('manage', op));
}
ok('a connecting phone may ping at read', scopeAllows('read', 'farm.ping'));
ok('an unknown scope may call nothing', !scopeAllows('owner', 'tasks.list') && !scopeAllows('', 'farm.ping'));
const answerable = ops.filter(op => requiredScope(op) === 'answer');
ok('every answer op the rule names exists in the catalog', answerable.length === 3 || console.log('  answer ops: ' + answerable.join(', ')));

(async () => {
    const { scopeGated } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));
    const seen = [];
    const gated = scopeGated(async (op, args, caller) => { seen.push(op); return { ok: true, result: caller.scope }; });
    const allowed = await gated('console.answer', {}, { device: 'd', scope: 'answer' });
    const refused = await gated('console.start', {}, { device: 'd', scope: 'answer' });
    ok('an allowed call reaches the op', allowed.ok && seen.join() === 'console.answer');
    ok('a refused call never reaches it, and names the scope it needs', !refused.ok && refused.error.includes('needs manage') && refused.error.includes('has answer') && seen.length === 1);
    console.log(`remote scopes: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
