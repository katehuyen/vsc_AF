const fs = require('fs');
const path = require('path');
const BT = String.fromCharCode(96);
const file = path.join(__dirname, '..', 'src', 'core', 'missions.ts');
let s = fs.readFileSync(file, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const nl = t => t.split('\n').join(EOL).split('@BT@').join(BT);
let n = 0;
const swap = (from, to) => {
    const f = nl(from), t = nl(to);
    const parts = s.split(f);
    if (parts.length !== 2) { throw new Error('hunk ' + (n + 1) + ' matched ' + (parts.length - 1)); }
    s = parts.join(t); n++;
};

swap(
`            if (guard && d.action === 'delegate') {
                if (guardNudged) {
                    this.finish('failed',
                        {
                            verdict: 'partial',
                            summary: 'Stopped at the budget limit; the planner kept delegating.',
                            stopReason: 'hard-limit'
                        },
                        'budget exhausted');
                    return;
                }
                guardNudged = true;
                roundMsg = @BT@Not allowed: \${guard}. Reply with "finish" or "abort" only.@BT@;
                continue;
            }`,
`            // ‼️ X-70 — A SPENT CEILING STOPS ALL WORK, NOT THE ONE WORD.
            //
            // This asked @BT@d.action === 'delegate'@BT@ — the whole vocabulary when it
            // was written, and not since M-18. Measured on the current build
            // with the cost budget fully spent: @BT@parallel@BT@, @BT@review@BT@, @BT@revise@BT@ and
            // a reviewer'd @BT@evaluate@BT@ each started a real wave and wrote a real
            // @BT@action.created@BT@; @BT@compare@BT@, @BT@run_workflow@BT@ and @BT@run_mission@BT@ take the
            // same branch and were only stopped, in that harness, by unrelated
            // validation. The in-flight guard (X-46b) does catch them — but it
            // catches them AFTER the work has started and up to one guard
            // interval of spending and side effects has happened. Work that
            // must not run should never begin.
            //
            // So the question is answered by the REGISTRY, not by a list of
            // names somebody has to remember to grow: a primitive whose shape
            // is @BT@work@BT@ orders work. The next primitive is covered on the day it
            // is declared, which is the only version of this that stays true.
            //
            // ‼️ ONE EXEMPTION, AND IT IS NOT AN OVERSIGHT. An @BT@evaluate@BT@ with no
            // reviewer is the lead judging what it ALREADY holds, in the same
            // round, ordering nothing — and it is exactly what a run needs to
            // close honestly as @BT@partial@BT@ with real verdicts instead of guessing.
            // Refusing it at a spent ceiling would block the one action that
            // makes the ending true.
            const ordersWork = (() => {
                const prim = primitiveFor(d.action, isAdaptive(spec));
                if (!prim || prim.shape !== 'work') { return false; }
                if (d.action === 'evaluate' && !(d as { reviewer?: string }).reviewer) { return false; }
                return true;
            })();
            if (guard && ordersWork) {
                if (guardNudged) {
                    this.finish('failed',
                        {
                            verdict: 'partial',
                            summary: @BT@Stopped at the budget limit; the planner kept ordering work (\${d.action}).@BT@,
                            stopReason: 'hard-limit'
                        },
                        'budget exhausted');
                    return;
                }
                guardNudged = true;
                roundMsg = @BT@Not allowed: \${guard}. "\${d.action}" would start new work, and there is no budget left for it.@BT@
                    + ' Reply with "finish" or "abort" only.';
                continue;
            }`);

fs.writeFileSync(file, s, 'utf8');
console.log('X-70: ' + n + ' hunks');
