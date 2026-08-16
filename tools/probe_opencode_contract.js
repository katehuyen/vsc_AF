/**
 * ‼️ THE OPENCODE HEADLESS CONTRACT, MEASURED AGAINST THE INSTALLED CLI (M-14).
 *
 * M-14's acceptance matrix asks for a real run on every production surface, not
 * a string test — and the thing this repo kept shipping instead was a builder
 * that looked right. Everything below is a REAL `opencode run`, spawned through
 * the SAME argument builder the extension uses (`opencodeRunArgs` out of
 * `out/core/opencode.js`), so a probe that passes while production fails is not
 * a shape this file can take.
 *
 * What it settles, in order:
 *
 *   1. PROMPT CHANNEL — argv, stdin, or both. Two code paths in this repo
 *      disagreed and only one had been measured: `TaskManager.spawnHeadless`
 *      pipes it (`promptOn: 'stdin'`), while `scheduleExportFor` — the .cmd that
 *      fires when VS Code is CLOSED — appends it to argv.
 *   2. PERMISSIONS — the one that matters unattended. Without `--auto`, a tool
 *      call the config marks "ask" is refused and the run still exits 0, so the
 *      failure is invisible to anything watching the exit code. With `--auto` the
 *      same prompt writes the file. This is the measurement `permissionMode` on
 *      a mission team member exists for.
 *   3. RESUME — `-s <ses_…>` continues the SAME conversation (same id back, and
 *      the model can answer from the first turn).
 *   4. COST ON A FREE MODEL — whether `step_finish` states a real `0` or states
 *      nothing. "Free" and "we could not parse it" must not look alike.
 *   5. ATTACHMENT — whether `--file` reaches the turn, checked with a word the
 *      model cannot produce without having read the file.
 *   6. CANCEL — `taskkill /pid <p> /T /F`, the line `TaskManager.killProcess`
 *      runs, against the tree it actually spawned. This engine is the heavy one
 *      (615 MB a run), so a cancel that leaves the tree up is the leak itself.
 *
 * Free models and a scratch cwd: it must cost nothing to repeat and must not be
 * able to touch the repo. Run it whenever the OpenCode CLI moves.
 *
 *   node tools/probe_opencode_contract.js [--model <provider/model>] [--only 1,2]
 */
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { opencodeRunArgs, opencodePermissionFor, OPENCODE_EXE } =
    require(path.resolve(__dirname, '..', 'out', 'core', 'opencode.js'));

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ''; };
const MODEL = flag('--model');
const ONLY = flag('--only') ? flag('--only').split(',').map(s => s.trim()) : null;
const TIMEOUT_MS = 240_000;

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'af-oc-contract-'));
const say = (s) => console.log(s);
const findings = [];

/**
 * One real run, built the way the extension builds it.
 *
 * ‼️ `shell: true` with an ARRAY is not how the extension spawns — it spawns a
 * joined string, or pipes and passes no prompt at all. Here the prompt is only
 * ever plain ASCII with no shell metacharacters, so the two are equivalent for
 * what is being measured; anything user-shaped belongs on stdin, which is the
 * whole point of case 1.
 */
function run(opts) {
    const args = [...opencodeRunArgs({
        model: MODEL || undefined,
        cwd: DIR,
        permissionMode: opts.permissionMode,
        ...(opts.resume ? { resume: opts.resume } : {})
    })];
    if (opts.argvPrompt) { args.push(JSON.stringify(opts.argvPrompt)); }
    const started = Date.now();
    const r = cp.spawnSync(OPENCODE_EXE, args, {
        cwd: DIR, shell: true, windowsHide: true, timeout: TIMEOUT_MS,
        input: opts.stdinPrompt === undefined ? '' : opts.stdinPrompt,
        maxBuffer: 32 * 1024 * 1024, encoding: 'utf8'
    });
    return { args, ms: Date.now() - started, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Decode `--format json` the way the extension's parser does: one object a line. */
function decode(out) {
    const objs = [];
    for (const line of out.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith('{')) { continue; }
        try { objs.push(JSON.parse(t)); } catch { /* a truncated tail is its own finding */ }
    }
    let sessionID = null, text = '', cost, tokens;
    const types = [], tools = [];
    for (const o of objs) {
        types.push(o.type || '(none)');
        const part = o.part || o;
        if (!sessionID) { sessionID = o.sessionID || part.sessionID || (o.info && o.info.sessionID) || null; }
        if (part.type === 'text' && typeof part.text === 'string') { text += part.text; }
        if (part.type === 'tool') {
            const st = part.state || {};
            tools.push({
                name: part.tool || st.title || '(unnamed)',
                status: st.status || '(none)',
                error: st.error !== undefined ? String(st.error).slice(0, 160)
                    : (typeof st.output === 'string' && /rejected|denied/i.test(st.output)
                        ? String(st.output).slice(0, 160) : null)
            });
        }
        // step_finish carries this turn's usage; the extension SUMS steps.
        if ((o.type === 'step_finish' || part.type === 'step_finish')) {
            const src = o.tokens || part.tokens || {};
            const c = o.cost !== undefined ? o.cost : part.cost;
            if (c !== undefined) { cost = (cost || 0) + Number(c); }
            const tot = (src.input || 0) + (src.output || 0) + (src.reasoning || 0);
            if (tot) { tokens = (tokens || 0) + tot; }
        }
    }
    return { objs, lines: objs.length, sessionID, text: text.trim(), types: [...new Set(types)], tools, cost, tokens };
}

const ASK = (t) => `Reply with exactly this one word and nothing else: ${t}`;
const want = (label, cond, detail) => {
    say(`   ${cond ? 'OK  ' : '‼️ NO'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) { findings.push(`${label}${detail ? ` — ${detail}` : ''}`); }
    return cond;
};
const on = (n) => !ONLY || ONLY.indexOf(String(n)) >= 0;

say(`opencode contract probe · cwd=${DIR}${MODEL ? ` · model=${MODEL}` : ' · CLI default model'}`);
say(`builder = opencodeRunArgs (the extension's own), exe = ${OPENCODE_EXE}`);

// ---------------------------------------------------------------------------
// 1. Prompt channel
// ---------------------------------------------------------------------------
let firstSession = null;
if (on(1)) {
    say('\n═══ 1. PROMPT CHANNEL — argv, stdin, or both?');
    const a = decode(run({ argvPrompt: ASK('ARGVOK') }).stdout);
    want('argv carries the prompt', a.text.toUpperCase().includes('ARGVOK'), `text=${JSON.stringify(a.text.slice(0, 40))}`);
    const s = run({ stdinPrompt: ASK('STDINOK') });
    const sd = decode(s.stdout);
    want('stdin carries the prompt (the production path)', sd.text.toUpperCase().includes('STDINOK'),
        `text=${JSON.stringify(sd.text.slice(0, 40))}`);
    firstSession = sd.sessionID;
    const b = decode(run({ argvPrompt: ASK('ARGVWINS'), stdinPrompt: ASK('STDINWINS') }).stdout);
    const winner = b.text.toUpperCase().includes('ARGVWINS') ? 'argv'
        : b.text.toUpperCase().includes('STDINWINS') ? 'stdin' : 'neither';
    say(`   →  given BOTH, the CLI reads: ${winner.toUpperCase()}`
        + (winner === 'argv' ? ' (the piped prompt is swallowed with no error)' : ''));
    want('a real session id comes off the FIRST event', /^ses_/.test(String(sd.sessionID)), `id=${sd.sessionID}`);
    want('the step vocabulary is the one the parser expects',
        sd.types.includes('step_start') && sd.types.includes('step_finish'), sd.types.join(', '));
}

// ---------------------------------------------------------------------------
// 2. Permissions — the M-14 defect, proved from both sides
// ---------------------------------------------------------------------------
if (on(2)) {
    say('\n═══ 2. PERMISSIONS — what an unattended run may actually DO');
    say('   ‼️ READ THIS BEFORE BELIEVING ANY ROW: what `build` refuses is decided by');
    say('   the USER\'S `opencode.json`, not by the engine. A machine whose config marks');
    say('   nothing "ask" lets the default agent write freely; the same run elsewhere is');
    say('   refused. Only `plan` and an explicit `deny` are properties of the engine.');

    const inside = path.join(DIR, 'proof.txt');
    // Outside the run's cwd — what `external_directory` rules speak about.
    const outside = path.join(os.tmpdir(), `af-oc-outside-${Date.now()}.txt`);
    const writeTo = (f) => `Create the file ${f.replace(/\\/g, '/')} whose only content is the word OK. `
        + 'Use your write tool. Then reply with the single word DONE.';

    const attempt = (label, mode, target, expectWrite, why) => {
        try { fs.rmSync(target, { force: true }); } catch { /* fresh each time */ }
        const p = opencodePermissionFor(mode);
        const r = run({ stdinPrompt: writeTo(target), permissionMode: mode });
        const d = decode(r.stdout);
        const wrote = fs.existsSync(target);
        const refused = d.tools.some(t => /reject|denied|permission|not allow/i.test(String(t.error || '')))
            || /rejected|denied|permission|not allowed/i.test(d.text);
        say(`\n   ${label} · permissionMode=${JSON.stringify(mode)} → agent=${p.mode} auto=${p.auto}`);
        say(`   flags: ${r.args.join(' ')}`);
        say(`   exit=${r.status} · ${(r.ms / 1000).toFixed(1)}s · tools=${d.tools.map(t => `${t.name}:${t.status}`).join(', ') || '(none)'}`
            + ` · wrote=${wrote ? 'YES' : 'no'}${refused ? ' · refusal on the wire' : ''}`);
        // `expectWrite: null` = measure and report, do not assert. Used where the
        // honest finding is not a pass/fail on whether the file appeared.
        if (expectWrite !== null) { want(label, wrote === expectWrite, why); }
        try { fs.rmSync(target, { force: true }); } catch { /* ignore */ }
        return { wrote, refused, exit: r.status, tools: d.tools };
    };

    // (a) The default agent, inside its own cwd. On THIS config nothing here is
    //     an "ask" decision, so it writes — which is why the universal claim
    //     "an unattended OpenCode run cannot call a tool" is wrong as stated.
    const a = attempt('default agent writes inside its own cwd', '', inside, true,
        'config-dependent: true wherever opencode.json marks nothing "ask"');

    // ‼️ (b)(c) THE PAIR M-14 GOT WRONG, AND THE FIRST TWO MEASUREMENTS TOO.
    //
    // The item says "--auto yalnız ask kararlarını once olarak geçirir ve
    // explicit deny'ı aşmaz", so the obvious probe is: deny a directory, write
    // to it with and without `--auto`, expect a refusal both times.
    //
    // Measured three times on 2026-08-16, and the FLAG turned out not to be the
    // variable at all. What is stable across every run is that the `write` tool
    // comes back `error` on a denied path — with `--auto` and without it. What
    // varies is whether the model then reaches for `bash`, and a `bash` that
    // runs writes into the denied directory just fine: seen succeeding WITH
    // `--auto` (runs 1, 2) and WITHOUT it (run 3). The first two runs alone
    // would have supported a tidy and false conclusion — "`--auto` bypasses the
    // deny by tool substitution" — which the third killed.
    //
    // So the honest statement is about the CONFIG, not the flag:
    // `external_directory` fences the file tools and does not fence a shell.
    // Both cases therefore assert only the stable part and report the escape.
    const denied = (label, mode) => {
        const x = attempt(label, mode, outside, null, '');
        want(`${label}: the write tool is refused`,
            x.tools.some(t => t.name === 'write' && t.status === 'error'),
            'this is the part that holds in every run');
        if (x.wrote) {
            say('   ‼️ …AND THE FILE LANDED ANYWAY, through the `bash` fallback.');
            findings.push(`${label}: reached a DENIED directory via bash — an external_directory `
                + 'deny fences the file tools, not a shell (independent of --auto)');
        }
        return x;
    };
    const b = denied('default agent, denied directory', '');
    const c = denied('--auto, denied directory', 'acceptEdits');

    // (d) `plan` is a property of the ENGINE, not of anybody's config — and it is
    //     the setting a read-only reviewer on a mission team actually needs.
    const d = attempt('plan agent cannot write at all', 'plan', inside, false,
        'OpenCode\'s own plan agent disallows every edit tool');

    say(`\n   →  every one of these exited 0: ${[a, b, c, d].map(x => x.exit).join(', ')}.`
        + ' A refused run and a successful one are indistinguishable by exit code.');
}

// ---------------------------------------------------------------------------
// 3. Resume
// ---------------------------------------------------------------------------
if (on(3)) {
    say('\n═══ 3. RESUME — does `-s` continue the SAME conversation?');
    const first = decode(run({ stdinPrompt: 'Remember this number: 4173. Reply with the single word STORED.' }).stdout);
    say(`   first run → ${first.sessionID}`);
    if (/^ses_/.test(String(first.sessionID))) {
        const again = run({ stdinPrompt: 'What number did I ask you to remember? Reply with the digits only.', resume: first.sessionID });
        const d = decode(again.stdout);
        say(`   resumed  → ${d.sessionID} · flags: ${again.args.join(' ')}`);
        want('the same session id comes back', d.sessionID === first.sessionID, `${first.sessionID} → ${d.sessionID}`);
        want('‼️ …and the conversation really carried (not just the id)', d.text.includes('4173'),
            `answer=${JSON.stringify(d.text.slice(0, 60))}`);
    } else {
        want('a session id to resume from', false, 'the first run published none');
    }
}

// ---------------------------------------------------------------------------
// 4. Cost on a free model
// ---------------------------------------------------------------------------
if (on(4)) {
    say('\n═══ 4. COST — is a free model a real 0, or nothing at all?');
    const d = decode(run({ stdinPrompt: ASK('COSTOK') }).stdout);
    say(`   cost=${d.cost === undefined ? '(absent)' : d.cost} · tokens=${d.tokens === undefined ? '(absent)' : d.tokens}`);
    want('tokens are stated even when the price is not', d.tokens !== undefined && d.tokens > 0,
        'the token ceiling is the only fence on a plan-billed engine (X-19)');
    say(`   →  a real 0 and an unparsed price are told apart by whether STEPS were seen:`
        + ` ${d.lines} step object(s) here.`);
}

// ---------------------------------------------------------------------------
// 5. Attachment — `--file`
// ---------------------------------------------------------------------------
if (on(5)) {
    say('\n═══ 5. ATTACHMENT — does `--file` actually reach the turn?');
    const att = path.join(DIR, 'attached.txt');
    // A token the model cannot produce by guessing: it has to have read the file.
    fs.writeFileSync(att, 'The secret word is ZARFIL. Nothing else in this file matters.\n', 'utf8');
    const args = [...opencodeRunArgs({ cwd: DIR, model: MODEL || undefined }), '--file', JSON.stringify(att)];
    const r = cp.spawnSync(OPENCODE_EXE, args, {
        cwd: DIR, shell: true, windowsHide: true, timeout: TIMEOUT_MS,
        input: 'What is the secret word in the attached file? Reply with that one word only.',
        maxBuffer: 32 * 1024 * 1024, encoding: 'utf8'
    });
    const d = decode(r.stdout);
    say(`   flags: ${args.join(' ')}`);
    say(`   exit=${r.status} · text=${JSON.stringify(d.text.slice(0, 80))}`);
    // A word the model cannot reach by guessing, so the reply IS the evidence.
    want('`--file` carries the attachment into the turn', d.text.toUpperCase().includes('ZARFIL'),
        `looked for ZARFIL in the reply · exit ${r.status}`);
    try { fs.rmSync(att, { force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 6. Cancel — does killing the tree really take the engine with it?
// ---------------------------------------------------------------------------
if (on(6)) {
    say('\n═══ 6. CANCEL — `taskkill /T /F` on the spawned pid, as TaskManager does');
    say('   ‼️ This engine is the heavy one — 615 MB per run measured — so a cancel that');
    say('   leaves the tree behind is not an untidy detail on this machine, it is the leak.');
    const args = opencodeRunArgs({ cwd: DIR, model: MODEL || undefined });
    // A prompt long enough that the run is certainly alive when we cut it.
    const child = cp.spawn(OPENCODE_EXE, args, {
        cwd: DIR, shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.write('Count slowly from 1 to 500, writing every number out in full English words.');
    child.stdin.end();
    let out = '';
    child.stdout.on('data', c => { out += c; });

    /** Every pid under `root`, walked by ParentProcessId the way the memory probe does. */
    const treeOf = (root) => {
        const q = cp.execSync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process | '
            + 'Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"',
            { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        const all = JSON.parse(q);
        const kids = new Map();
        for (const p of all) {
            if (!kids.has(p.ParentProcessId)) { kids.set(p.ParentProcessId, []); }
            kids.get(p.ParentProcessId).push(p);
        }
        const seen = [], walk = (pid) => {
            for (const k of kids.get(pid) || []) { seen.push(k); walk(k.ProcessId); }
        };
        const self = all.find(p => p.ProcessId === root);
        if (self) { seen.push(self); }
        walk(root);
        return seen;
    };

    const wait = (ms) => cp.execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`);
    wait(9000);                                   // let the tree come up
    const before = treeOf(child.pid);
    say(`   tree before cancel: ${before.length} process(es) — ${before.map(p => p.Name).join(', ') || '(none)'}`);
    want('the run really is alive before we cut it', before.length > 0, 'nothing to cancel');

    cp.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });   // TaskManager.killProcess
    wait(3000);
    const after = treeOf(child.pid).filter(p => before.some(b => b.ProcessId === p.ProcessId));
    say(`   tree after cancel:  ${after.length} process(es) — ${after.map(p => p.Name).join(', ') || '(none)'}`);
    want('‼️ cancel takes the WHOLE tree, not just the shim', after.length === 0,
        after.map(p => `${p.Name}(${p.ProcessId})`).join(', '));
    // A stray `opencode` from somewhere else must not be blamed on us, and one
    // of ours must not be left running: only pids that were in OUR tree count.
    try { child.kill(); } catch { /* already gone */ }
}

say('\n===== SUMMARY =====');
if (findings.length) {
    say(`${findings.length} finding(s):`);
    findings.forEach(f => say(`  ‼️ ${f}`));
} else {
    say('every checked contract line held.');
}
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* leave it for inspection */ }
process.exit(findings.length ? 1 : 0);
