#!/usr/bin/env node
// X-408 — Jev (through Kapici's bridge, the key never leaves Agent Farm) vs today's
// Haiku judge (the same prompt the llm provider sends, as a one-shot claude -p).
// Usage: node tools/kapici-bench/bench.js [--arms jev,haiku] [--layouts en,tr] [--rules a,b] [--limit N] [--stride N] [--out file.json]
// Rows are appended to --out and a case already there is skipped, so runs resume and combine.
// Then: node tools/kapici-bench/bench_report.js file.json
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = process.env.AF_ROOT || path.resolve(__dirname, '..', '..');
const { BUILTIN_RULES } = require(path.join(ROOT, 'out/core/kapici/builtinRules.js'));
const { judgePrompt, parseJudgeReply } = require(path.join(ROOT, 'out/core/kapici/providers/llm.js'));
const AF = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js');
const HAIKU = 'claude-haiku-4-5-20251001';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const arms = arg('arms', 'jev,haiku').split(',');
const layouts = arg('layouts', 'en,tr').split(',');
const ruleIds = arg('rules', BUILTIN_RULES.map(r => r.id).join(',')).split(',');
const limit = Number(arg('limit', '0')) || Infinity;
// Every Nth case only — a class-balanced subset, since the data files are grouped by label.
const stride = Math.max(1, Number(arg('stride', '1')) || 1);
const OUT = arg('out', path.join(os.tmpdir(), 'kapici-bench.json'));

const AGENTS = {
    developer: 'Writes, debugs and ships code in the user\'s software projects.',
    psikolog: 'Talks about feelings, stress, motivation and the user\'s inner life.',
    muhasebe: 'Handles invoices, payments, taxes and bookkeeping.'
};
const AGENTS_TR = {
    developer: 'Kullanıcının yazılım projelerinde kod yazar, hata ayıklar ve yayınlar.',
    psikolog: 'Duygular, stres, motivasyon ve kullanıcının iç dünyası hakkında konuşur.',
    muhasebe: 'Fatura, ödeme, vergi ve defter tutma işlerini yürütür.'
};
// The Turkish layout: the same questions, asked in Turkish.
const TR = {
    'dispatch.route': { agent: { type: 'choice', instructions: 'Bu isteği hangi ajan ele almalı? Açıklaması isteğe en iyi uyan ajanı seç.' } },
    'retry.next-action': { action: { type: 'choice', instructions: 'Bu olaya bakarak hangi devam yolu doğru?', criteria: {
        resume: 'Koşu doğru yoldaydı; aynı oturuma devam et.',
        retryOriginal: 'Koşu yanlış yola saptı; asıl görevi baştan başlat.',
        wait: 'İşte bir sorun yok; önce limitin sıfırlanması gerekiyor.',
        stop: 'Görev yazıldığı haliyle başarılamaz.',
        needsUser: 'Başka bir şeyden önce bir insanın karar vermesi gerekiyor.' } } },
    'trigger.has-work': { work: { type: 'noul', instructions: 'Bu değişiklik bir yapay zekâ ajanını harekete geçirecek. İçinde ajan için gerçek bir iş var mı? Gürültü iş değildir: gerçek değişikliği olmayan otomatik kayıt, kilit, geçici ya da yedek dosya, yalnız boşluk/biçim düzenlemesi, boş dosya.' } }
};

/** The questions one case is asked, with $call and a case's narrowed options resolved. */
function questionsFor(rule, layout, c) {
    const base = layout === 'tr' ? TR[rule.id] : rule.questions;
    const out = {};
    for (const [id, q0] of Object.entries(base)) {
        const q = Object.assign({}, q0);
        if (rule.questions[id].criteria === '$call') {
            const o = c.options && c.options[id];
            q.criteria = o && !Array.isArray(o) ? o : (layout === 'tr' ? AGENTS_TR : AGENTS);
        }
        const narrowed = c.options && Array.isArray(c.options[id]) ? c.options[id] : undefined;
        if (narrowed && q.criteria && typeof q.criteria === 'object') {
            q.criteria = Object.fromEntries(Object.entries(q.criteria).filter(([k]) => narrowed.includes(k)));
        }
        out[id] = q;
    }
    return out;
}

function correct(q, ans, want) {
    if (!ans) { return false; }
    if (q.type === 'noul') { return (ans.p > 0.5) === want; }
    if (q.type === 'choice') { return ans.choice === want; }
    return ans.score === want;
}

function jev(state, questions) {
    const file = path.join(os.tmpdir(), 'af-kb-ask.json');
    fs.writeFileSync(file, JSON.stringify({ state, questions, providers: ['jev'], consumer: 'bench' }), 'utf8');
    const t0 = Date.now();
    const r = cp.spawnSync(process.execPath, [AF, 'kapici.ask', '@' + file], { encoding: 'utf8', maxBuffer: 8 << 20 });
    const wall = Date.now() - t0;
    let j; try { j = JSON.parse(r.stdout); } catch { return { error: 'bridge reply not JSON: ' + String(r.stdout || r.stderr).slice(0, 200), wall }; }
    if (!j.ok) { return { error: String(j.error || 'bridge refused').slice(0, 200), wall }; }
    const res = j.result || {};
    return { answers: res.answers || {}, latencyMs: res.latencyMs, costUsd: res.costUsd, provider: res.provider, fallback: res.fallback, error: res.error, wall, raw: res };
}

function haiku(state, questions) {
    const t0 = Date.now();
    const r = cp.spawnSync('claude', ['--model', HAIKU, '--output-format', 'json', '-p'], { input: judgePrompt(state, questions), cwd: os.homedir(), encoding: 'utf8', shell: true, timeout: 120000, maxBuffer: 8 << 20 });
    const wall = Date.now() - t0;
    let j; try { j = JSON.parse(r.stdout); } catch { return { error: 'claude reply not JSON: ' + String(r.stdout || r.stderr).slice(0, 200), wall }; }
    const answers = parseJudgeReply(String(j.result || ''), questions);
    return { answers: answers || {}, latencyMs: wall, costUsd: j.total_cost_usd, apiMs: j.duration_api_ms, error: answers ? undefined : 'unparseable: ' + String(j.result).slice(0, 160), wall };
}

const rows = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const done = new Set(rows.map(r => [r.arm, r.layout, r.rule, r.i].join('|')));
for (const rule of BUILTIN_RULES.filter(r => ruleIds.includes(r.id))) {
    const cases = fs.readFileSync(path.join(__dirname, 'data', rule.id + '.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).slice(0, limit);
    for (const layout of layouts) {
        for (const arm of arms) {
            cases.forEach((c, i) => {
                const k = [arm, layout, rule.id, i].join('|');
                if (done.has(k) || i % stride !== 0) { return; }
                const qs = questionsFor(rule, layout, c);
                const r = arm === 'jev' ? jev(c.state, qs) : haiku(c.state, qs);
                const [qid, want] = Object.entries(c.expect)[0];
                const a = (r.answers || {})[qid];
                rows.push({ arm, layout, rule: rule.id, i, want, got: a ? (a.choice ?? a.p ?? a.score) : null, confidence: a ? a.confidence : null,
                    ok: correct(qs[qid], a, want), minConfidence: rule.minConfidence, latencyMs: r.latencyMs ?? null, wall: r.wall, costUsd: r.costUsd ?? null,
                    provider: r.provider, fallback: r.fallback, error: r.error || null });
                fs.writeFileSync(OUT, JSON.stringify(rows, null, 1), 'utf8');
                process.stdout.write(`${k} ${a ? 'ok=' + rows[rows.length - 1].ok : 'ERR ' + (r.error || '')} ${r.wall}ms\n`);
            });
        }
    }
}
console.log('rows', rows.length, '->', OUT);
