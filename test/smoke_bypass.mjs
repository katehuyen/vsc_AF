// ‼️ K-22 — THE PROCESS SMOKE: does a bypassed session ask, or does it not?
//
// Every other check for this item is a check of OUR code. This one asks the
// installed CLI, because the contract is about what the CLI does with the flags
// we hand it — and the whole bug was that a flag we trusted did not do what its
// name suggested.
//
// It runs the shape from the report: a Git Bash compound command with a
// variable assignment, a redirect into a folder OUTSIDE the working directory
// (%APPDATA%\…\bridge-smoke), then the wait / read / remove chain. That exact
// shape was producing `can_use_tool` on a session whose card said bypass, while
// plain Read/Grep in the same session said nothing.
//
//   node test/smoke_bypass.mjs            → lane A only (the contract)
//   node test/smoke_bypass.mjs --control  → also lane B, the negative control
//
// Cost: haiku, one short turn per lane — the test-model policy. Lane A is the
// assertion; lane B exists to prove the test can SEE the bug (a session given
// only `--allow-…` is expected to ask), so it is opt-in.
import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONTROL = process.argv.includes('--control');
const MODEL = 'haiku';
/**
 * ‼️ THE WORKING FOLDER IS PART OF THE MEASUREMENT, not a detail.
 *
 * The reported prompts came from a session running in an agent's own folder,
 * which has its own `.claude/settings.local.json`. A fresh temp directory has
 * no settings at all, and a lane run there answers a different question: run it
 * with `--cwd <the agent folder>` to ask the reported one.
 */
const cwdArg = process.argv.indexOf('--cwd');
const dir = cwdArg > 0 && process.argv[cwdArg + 1]
    ? process.argv[cwdArg + 1]
    : fs.mkdtempSync(path.join(os.tmpdir(), 'af-bypass-'));
const OWN_DIR = dir.includes('af-bypass-');
const outside = path.join(process.env.APPDATA || os.tmpdir(), 'Code', 'User',
    'globalStorage', 'muvusoft.agent-farm', 'bridge-smoke');
fs.mkdirSync(outside, { recursive: true });

// The prompt is the reported recipe, spelled so the model runs it verbatim.
const RECIPE = `Run exactly this, in one Bash call, and then say only DONE:\n`
    + `b="${outside.replace(/\\/g, '/')}"; printf '{"op":"farm.ops"}' > "$b/smoke.json"; `
    + `while [ ! -f "$b/smoke.json" ]; do sleep 1; done; cat "$b/smoke.json"; rm "$b/smoke.json"`;

/** The transport flags, verbatim from hostArgs — the point is that this smoke
 *  runs the same command line the Console builds, not a simplified one. */
const TRANSPORT = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--verbose', '--permission-prompt-tool', 'stdio'];

function lane(name, permFlags, autoAnswer, env) {
    return new Promise(resolve => {
        const args = [...TRANSPORT, ...permFlags, '--model', MODEL];
        const child = cp.spawn('claude', args, {
            cwd: dir, shell: true, windowsHide: true,
            env: { ...process.env, ...(env || {}) }
        });
        const seen = { asks: 0, tools: 0, result: '', error: '' };
        let buf = '';
        const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 180000);
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', d => {
            buf += d;
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const l of lines) {
                if (!l.trim()) { continue; }
                let o;
                try { o = JSON.parse(l); } catch { continue; }
                if (o.type === 'control_request' && o.request?.subtype === 'can_use_tool') {
                    seen.asks++;
                    if (autoAnswer) {
                        child.stdin.write(JSON.stringify({
                            type: 'control_response',
                            response: {
                                subtype: 'success', request_id: o.request_id,
                                response: { behavior: 'allow', updatedInput: o.request.input ?? {} }
                            }
                        }) + '\n');
                    }
                }
                if (o.type === 'assistant') {
                    for (const b of o.message?.content ?? []) {
                        if (b.type === 'tool_use') { seen.tools++; }
                    }
                }
                if (o.type === 'result') {
                    seen.result = String(o.result ?? '').slice(0, 200);
                    if (o.is_error) { seen.error = seen.result; }
                }
            }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', d => { if (/error|fatal/i.test(String(d))) { seen.error ||= String(d).slice(0, 200); } });
        child.on('close', () => { clearTimeout(timer); resolve({ name, args, ...seen }); });
        child.stdin.write(JSON.stringify({
            type: 'user', message: { role: 'user', content: [{ type: 'text', text: RECIPE }] }
        }) + '\n');
    });
}

const report = [];
// LANE A — the contract. What the Console now spawns for an enforced bypass.
const a = await lane('A · enforced bypass', ['--dangerously-skip-permissions'], false);
report.push(a);

/**
 * LANE B — the negative control: the flag S-18 left behind, on its own.
 *
 * ‼️ IT CANNOT FIRE ON A MACHINE WHOSE OWN SETTINGS SAY BYPASS, and that is not
 * a flaw in the fix — it is what the CLI does. Read out of the installed binary
 * (2026-08-14 build), the settings branch is:
 *
 *   else if (v === "bypassPermissions") {
 *       if (s || t.allowDangerouslySkipPermissions) f.push(v);
 *       else if (f.length === 0) { …ignored, push("default") }
 *   }
 *
 * — so `--allow-dangerously-skip-permissions` is enough to let a settings
 * bypass through, and this user's `~/.claude/settings.json` states
 * `permissions.defaultMode: "bypassPermissions"`. With that file in place the
 * old launch bypasses too and the control has nothing to show. Skipped, with
 * the reason said out loud, rather than reported as a pass or a failure.
 */
/**
 * ‼️ LANES C AND D — THE CONSOLE'S OWN ENTRYPOINT, WHICH IS THE WHOLE ANSWER.
 *
 * Decoded out of the installed CLI, the settings branch is guarded by
 *
 *   function T$e(){ return entrypoint() === "claude-vscode"
 *                   && !childSession && !claudecode }
 *
 * — so `permissions.defaultMode: "bypassPermissions"` in a settings file is
 * only ever consulted for a session whose entrypoint is `claude-vscode`. An
 * Agent Farm Console session is `sdk-cli` (that is what its own transcripts
 * record), so that branch NEVER RAN for it: the user's settings said bypass,
 * the card said bypass, and the process was resolved without the file being
 * looked at. That is K-22, exactly, and it is why `--allow-…` could never have
 * been enough here however permissive the settings were.
 *
 * These two lanes run the same argv with the Console's own entrypoint marker:
 * C is the launch S-18 left behind, D is the one this release builds.
 */
const ENTRY = { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' };
const c = await lane('C · --allow- only, Console entrypoint (the OLD launch)',
    ['--allow-dangerously-skip-permissions'], true, ENTRY);
report.push(c);
const d = await lane('D · --dangerously-skip-permissions, Console entrypoint (THIS release)',
    ['--dangerously-skip-permissions'], false, ENTRY);
report.push(d);

let b;
if (CONTROL) {
    let settingsMode = '';
    try {
        const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
        settingsMode = j?.permissions?.defaultMode ?? '';
    } catch { /* no settings is exactly what the control wants */ }
    if (settingsMode === 'bypassPermissions') {
        console.log('\n  B · skipped — this machine\'s own settings resolve Default to bypassPermissions,'
            + '\n      and --allow-dangerously-skip-permissions is enough to let that through'
            + '\n      (measured in the CLI: `if (s || t.allowDangerouslySkipPermissions) f.push(v)`).'
            + '\n      The control needs a home whose settings say nothing.');
    } else {
        b = await lane('B · --allow- only (the old launch)', ['--allow-dangerously-skip-permissions'], true);
        report.push(b);
    }
}

// Cleanup is a courtesy, never the result: on Windows the shell that ran the
// turn can still hold the folder for a moment, and a smoke that reports EPERM
// instead of its own finding is worse than a stray temp directory.
// …and a folder the smoke did not create is never one it removes.
if (OWN_DIR) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* it will age out */ }
}
try { fs.rmSync(path.join(outside, 'smoke.json')); } catch { /* the recipe removes it */ }

console.log('\nK-22 process smoke — installed CLI, model ' + MODEL);
for (const r of report) {
    console.log(`\n  ${r.name}`);
    console.log(`    argv        ${r.args.join(' ')}`);
    console.log(`    tool calls  ${r.tools}`);
    console.log(`    can_use_tool ${r.asks}`);
    if (r.error) { console.log(`    error       ${r.error}`); }
}

let fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); if (!c) { fail++; } };
console.log('');
ok('‼️ enforced bypass asked for permission ZERO times', a.asks === 0);
ok('…and the turn actually ran the command (a lane that did nothing proves nothing)', a.tools > 0);
ok('‼️ K-22: with the CONSOLE\'S OWN entrypoint, enforced bypass still asks zero times',
    d.asks === 0);
ok('…and that lane really ran the command too', d.tools > 0);
console.log(`\n  note · the old launch (lane C, --allow- only, Console entrypoint) asked ${c.asks} time(s).`
    + '\n         The settings branch is guarded by entrypoint === "claude-vscode", so a Console'
    + '\n         session never reached it — which is why only the enforcing flag settles this.');
if (b) {
    ok('the control lane CAN see the bug — the old flag on its own still asks', b.asks > 0);
}
process.exit(fail ? 1 : 0);
