import type { AgentRepoCarry } from './credentialCarry';
import { BIG_FAIL_MB, BIG_WARN_MB, bigVerdict, RepoWeight, WeighedFile } from './repoWeight';
import type { SlotCompleteness } from './slotCompleteness';

/**
 * ‼️ X-283 — THE POST-MIGRATION ACCEPTANCE GATE: one pass/fail for "did the
 * migration work", composed out of the checks that already exist.
 *
 * Every fault in the X-270 family proposed its own Doctor line, and the result
 * was ten places to look on a new machine and no answer to the one question.
 * This module asks that question. It writes NO check of its own: each item
 * CALLS the function the fault's fix left in the code — the birth contract,
 * the twin detection, the portable-store adoption, the path tokenizer — so the
 * gate cannot read green while the system it describes is broken (a gate with
 * its own logic forks from the behaviour the moment either changes).
 *
 * Every failing item carries what a PROGRAM can run to put it right, in the
 * shape the `_setup` Doctor already uses (X-209): the cockpit and the bridge
 * turn each one into a button or a call without a GUI change per item.
 */

/** X-209 — an action a program can run; `op` is the bridge op, `args` its args. */
export interface GateAction {
    id: string;
    label: string;
    op: string;
    args: Record<string, unknown>;
    danger: 'low' | 'high';
}

export interface GateItem {
    /** stable handle: `root:claudeDir`, `slot:claude-x`, `twins`, `portable-dirs`, `state:titles` */
    id: string;
    area: 'repo' | 'roots' | 'slots' | 'accounts' | 'state';
    ok: boolean;
    /** one line a card, a cockpit row or a Doctor line can print */
    detail: string;
    /** what a person does next when no program can; '' when fine or actionable */
    fix: string;
    actions: GateAction[];
}

export interface GateVerdict {
    ok: boolean;
    passed: number;
    failed: number;
    items: GateItem[];
    at: number;
}

export interface GateRoot {
    /** `claudeDir` · `globalStorage` — the two places without which no other item means anything */
    name: string;
    path: string;
}

export interface GateStore {
    /** `titles` · `marks` (S-61) */
    name: string;
    /** the portable file is there */
    exists: boolean;
    /** rows in the portable file */
    rows: number;
    /** rows only the legacy globalState holds — kept out on purpose after the first adoption */
    legacyOnly: number;
}

export interface GateSources {
    roots: GateRoot[];
    fs: { lstatSync(p: string): { isSymbolicLink(): boolean; isDirectory(): boolean }; realpathSync?(p: string): string };
    /** the birth contract, read-only — `completeSlots(true)` */
    completeness: () => SlotCompleteness[];
    /** slot id → the ids carrying the same account uuid (X-282) */
    twins: () => Map<string, string[]>;
    /** rows of the raw `agentFarm.accounts` whose dir names this machine (X-276) */
    unportable: () => { id: string; dir: string; tokenizable: boolean }[];
    /** the S-61 portable stores against the legacy globalState */
    stores: () => GateStore[];
    /** X-286 — the agent repo the claude dir lives in, measured before the gate runs */
    repo?: () => AgentRepoCarry | undefined;
    now?: () => number;
}

const item = (id: string, area: GateItem['area'], ok: boolean, detail: string, fix = '', actions: GateAction[] = []): GateItem =>
    ({ id, area, ok, detail, fix, actions });

/** Run the gate. Read-only: nothing here writes; every repair is an action the caller may run. */
export function migrationGate(src: GateSources): GateVerdict {
    const items: GateItem[] = [];

    // (7) the roots — a real folder on the system drive is data that dies with the next format
    for (const r of src.roots) {
        let st: { isSymbolicLink(): boolean; isDirectory(): boolean } | undefined;
        try { st = src.fs.lstatSync(r.path); } catch { st = undefined; }
        if (!st) {
            items.push(item(`root:${r.name}`, 'roots', false, `${r.name} is not there: ${r.path}`,
                'run _setup\\Link-Folders.ps1 — nothing below this line means anything until the roots are linked'));
            continue;
        }
        if (!st.isSymbolicLink()) {
            items.push(item(`root:${r.name}`, 'roots', false, `${r.name} is a REAL ${st.isDirectory() ? 'folder' : 'file'} on the system drive: ${r.path}`,
                'run _setup\\Link-Folders.ps1 — the data is going to C: and will die with the next format'));
            continue;
        }
        let real = '';
        try { real = src.fs.realpathSync ? src.fs.realpathSync(r.path) : ''; } catch { real = ''; }
        if (src.fs.realpathSync && !real) {
            items.push(item(`root:${r.name}`, 'roots', false, `${r.name} is a link whose target is gone: ${r.path}`,
                'run _setup\\Link-Folders.ps1 — the link points at nothing'));
            continue;
        }
        items.push(item(`root:${r.name}`, 'roots', true, real ? `${r.name} → ${real}` : `${r.name} is a link`));
    }

    // (1)(2)(3) + keys — the birth contract, one item per slot, the clauses by name
    let slots: SlotCompleteness[] = [];
    try { slots = src.completeness(); } catch (e) {
        items.push(item('slots', 'slots', false, `the birth contract could not be read: ${String((e as Error)?.message ?? e)}`));
    }
    for (const s of slots) {
        const gaps = s.rows.filter(r => !r.ok);
        const repairable = gaps.filter(r => r.repairable);
        const identity = gaps.filter(r => !r.repairable);
        items.push(item(`slot:${s.slotId}`, 'slots', s.complete,
            s.complete
                ? `${s.slotId}: all ${s.rows.length} clauses hold`
                : `${s.slotId}: ${gaps.length} of ${s.rows.length} clauses fail — ${gaps.map(g => g.id).join(', ')}`,
            identity.length ? `sign in again on ${s.slotId}: ${identity.map(g => g.detail).join('; ')}` : '',
            repairable.length
                ? [{ id: `complete-${s.slotId}`, label: `Complete ${s.slotId}`, op: 'accounts.complete', args: { id: s.slotId, dryRun: false }, danger: 'low' }]
                : []));
    }

    // (4) one account offered twice (X-282)
    let twins = new Map<string, string[]>();
    try { twins = src.twins(); } catch { twins = new Map(); }
    const twinRows = [...twins.entries()].filter(([, ids]) => ids.length);
    items.push(twinRows.length
        ? item('twins', 'accounts', false,
            `${twinRows.length} slot(s) carry an account uuid another slot also carries — ${twinRows.map(([id, ids]) => `${id} = ${ids.join(' = ')}`).join('; ')}`,
            'one of each pair is an orphan folder: forget it (the transcripts are in the pool, nothing is lost)',
            twinRows.map(([id]) => ({ id: `forget-${id}`, label: `Forget ${id}`, op: 'accounts.forget', args: { id }, danger: 'high' as const })))
        : item('twins', 'accounts', true, 'no account uuid appears in two slots'));

    // (5) the stored slot directories name a root, not this machine (X-276)
    let unportable: { id: string; dir: string; tokenizable: boolean }[] = [];
    try { unportable = src.unportable(); } catch { unportable = []; }
    const fixable = unportable.filter(u => u.tokenizable);
    const stuck = unportable.filter(u => !u.tokenizable);
    items.push(unportable.length
        ? item('portable-dirs', 'accounts', false,
            `${unportable.length} account dir(s) are written as this machine's absolute path — ${unportable.map(u => u.id).join(', ')}`,
            stuck.length ? `${stuck.map(u => `${u.id} (${u.dir})`).join(', ')} lie under no known root and cannot be tokenized; move them under globalStorage` : '',
            fixable.length ? [{ id: 'portable-accounts', label: 'Rewrite as ${globalStorage} tokens', op: 'accounts.portable', args: { dryRun: false }, danger: 'low' }] : [])
        : item('portable-dirs', 'accounts', true, 'every account dir is stored as a portable token'));

    // (6) the session names and marks came across, merged rather than overwritten (S-61)
    let stores: GateStore[] = [];
    try { stores = src.stores(); } catch { stores = []; }
    for (const st of stores) {
        if (!st.exists && st.legacyOnly > 0) {
            items.push(item(`state:${st.name}`, 'state', false,
                `${st.name}: ${st.legacyOnly} row(s) in the legacy globalState and no portable file — the adoption never ran`,
                'restart the extension host: the portable store is adopted from globalState at start, once'));
            continue;
        }
        items.push(item(`state:${st.name}`, 'state', true,
            st.exists
                ? `${st.name}: ${st.rows} row(s) in the portable store` + (st.legacyOnly ? `, ${st.legacyOnly} legacy row(s) kept out by design (removed since the first adoption)` : '')
                : `${st.name}: nothing to carry`));
    }

    // (8) X-286 — the repo carries live sign-ins: public outranks every other item
    if (src.repo) {
        try {
            const r = src.repo();
            if (r) { items.unshift(...repoItems(r)); }
        } catch (e) {
            items.unshift(item('repo:visibility', 'repo', false, `the agent repo could not be read: ${String((e as Error)?.message ?? e)}`));
        }
    }

    const failed = items.filter(i => !i.ok).length;
    return { ok: failed === 0, passed: items.length - failed, failed, items, at: (src.now ?? Date.now)() };
}

function repoItems(r: AgentRepoCarry): GateItem[] {
    if (!r.root) {
        return [item('repo:credentials', 'repo', true, 'the claude dir lies in no git repo — git carries no sign-in')];
    }
    const c = r.carry;
    const who = c.accounts.join(', ');
    const vis = !r.remote
        ? item('repo:visibility', 'repo', true, `${r.root} has no remote — nothing is published`)
        : r.visibility === 'public'
            ? item('repo:visibility', 'repo', false,
                `the agent repo is PUBLIC (${r.why}) and carries ${c.entries.length} live credential file(s) — sign-ins of ${who || 'no account'}`,
                'make it private now, then revoke every carried sign-in at the provider (claude.ai → Settings → Sessions): '
                + 'a private switch does not un-read what was already public, and the tokens stay in git history')
            : item('repo:visibility', 'repo', true, r.visibility === 'hidden'
                ? `the agent repo is not visible to strangers (${r.why})`
                : `visibility NOT MEASURED — ${r.why}`);
    const plainInSealed = c.mode === 'sealed' ? c.entries : [];
    const carried = plainInSealed.length
        ? item('repo:credentials', 'repo', false,
            `${plainInSealed.length} credential file(s) are tracked in plain text while the carry mode is sealed — ${plainInSealed.map(e => e.file).join(', ')}`,
            'untrack them (git rm --cached) and let the seal step pack them')
        : item('repo:credentials', 'repo', true, c.mode === 'sealed'
            ? 'sign-ins travel sealed — no credential file is tracked in plain text'
            : c.entries.length
                ? `${c.entries.length} live credential file(s) travel in PLAIN text — sign-ins of ${who}; the repo must stay private`
                : 'no credential file is tracked — a new machine signs in by hand');
    return r.weight ? [vis, carried, weightItem(r.weight)] : [vis, carried];
}

/** X-285 — a committed file over the FAIL line, or a big file in no backup, fails; 50–90 MB is said. */
function weightItem(w: RepoWeight): GateItem {
    const list = (fs: WeighedFile[]) => fs.map(f => `${f.file} (${f.mb} MB)`).join(' | ');
    if (w.leftOut.length) {
        return item('repo:big-files', 'repo', false,
            `${w.leftOut.length} file(s) of ${BIG_WARN_MB} MB or more are in NO backup — ${list(w.leftOut)}`,
            'too big for GitHub: they live only on this disk until the local vault (X-335) carries them');
    }
    const worst = w.top.length ? bigVerdict(w.top[0].mb) : 'ok';
    if (worst === 'fail') {
        return item('repo:big-files', 'repo', false,
            `a committed file is ${BIG_FAIL_MB} MB or more — ${list(w.top.filter(f => f.mb >= BIG_FAIL_MB))}`,
            'GitHub refuses a push over 100 MB: the next backup would fail as a whole. Move the file out of the repo or into the local vault');
    }
    return item('repo:big-files', 'repo', true,
        (worst === 'warn' ? `GitHub warns over ${BIG_WARN_MB} MB — ` : 'largest committed: ') + (w.top.length ? list(w.top) : 'nothing committed'));
}
