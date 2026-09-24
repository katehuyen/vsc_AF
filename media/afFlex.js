// Agent Farm — THE FLEX POINTS, AS DATA. (X-367)
//
// Every preference a user can set is a FLEX POINT, declared once here: its type,
// its default, and the LEVELS it can be set at. A level is not a word — each one
// names the SURFACE that sets it (a setting key, a page box) and the BRIDGE key
// that sets it without a page. `test/test_flex_points.js` resolves every one of
// them against the real files, in both directions: a level with a surface and no
// bridge key is red, a box on a page that no point claims is red, a schema field
// with no point is red. That is what turns "every preference, every surface" from
// a sentence into something that fails the build — the arrangement
// `media/afDimensions.js` proved for the launch dimensions.
//
// ‼️ THE BRIDGE KEY IS PER LEVEL, NOT PER POINT. One point is set by different
// doors at different levels — `settings.set` writes the Farm Settings default,
// `tasks.add` writes one run's value — so a single key per point would be a key
// that is true at one level and silently wrong at the others.
//
// ‼️ `builtin` IS THE BOTTOM OF THE CHAIN, NOT A LEVEL A POINT DECLARES. Its value
// is the point's `default`; nobody sets it, so it has no surface to name.
//
// Lives in `media/` because the page needs it too (the resolver and the pickers
// read it); `src/core/flexPoints.ts` is its typed door.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFFlex = api; }
})(function () {
    'use strict';

    /** Lowest to highest precedence — the order a value is resolved in. */
    const LEVELS = ['builtin', 'settings', 'agent', 'project', 'workflow', 'step', 'run', 'live'];
    const LEVEL_LABELS = {
        builtin: 'built-in', settings: 'Farm Settings', agent: 'agent', project: 'project',
        workflow: 'workflow', step: 'step / checkpoint', run: 'run start', live: 'live (while running)'
    };
    const TYPES = ['enum', 'number', 'boolean', 'text', 'range', 'tri', 'conditions', 'dimensions'];
    /** The three states a `tri` point has; `states` maps each to the value it stores. */
    const TRI = ['ask', 'auto', 'never'];
    /** The keys a level entry carries — anything else is a typo nobody reads. */
    const LEVEL_KEYS = ['surface', 'bridge'];

    const supervisorOnly = c => !c || c.retryBehavior === undefined || c.retryBehavior === 'supervisor'
        ? true : 'Only a retry whose behavior is "supervisor" asks a supervisor.';

    /** M-13's supervisor, one point per field of `SupervisorPolicy`. `box` = its task-form box, if any. */
    function supervisor(field, label, type, dflt, box, extra) {
        const levels = {
            settings: {
                surface: 'setting:agentFarm.taskRetry#supervisor.' + field,
                bridge: 'settings.set:agentFarm.taskRetry#supervisor.' + field
            }
        };
        if (box) {
            levels.run = {
                surface: 'media/afSupervisor.js#nt-sup' + box,
                bridge: 'tasks.add:retry.supervisor.' + field
            };
        }
        return Object.assign({
            id: 'retry.supervisor.' + field, label: label, type: type, default: dflt,
            remembered: false, applies: supervisorOnly, levels: levels
        }, extra || {});
    }

    /** A point set only in Farm Settings today, under its own key. */
    function setting(id, label, type, dflt, key, extra) {
        return Object.assign({
            id: id, label: label, type: type, default: dflt, remembered: false,
            levels: { settings: { surface: 'setting:' + key, bridge: 'settings.set:' + key } }
        }, extra || {});
    }

    /** A step's own judge (M-42): set on the step card's verify row, carried by the step's `verify`. */
    function judgeStep(field, label, dflt) {
        return {
            id: 'judge.' + field, label: label, type: 'text', default: dflt, remembered: false,
            levels: {
                step: {
                    surface: 'media/tasksPage.js#st-verify' + field[0].toUpperCase() + field.slice(1),
                    bridge: 'workflows.add:steps.verify.' + field
                }
            }
        };
    }

    const POINTS = [
        supervisor('engine', 'Supervisor engine', 'text', '', 'engine'),
        supervisor('model', 'Supervisor model', 'text', '', 'model'),
        supervisor('agent', 'Supervisor agent folder', 'text', '', null),
        supervisor('maxCalls', 'Supervisor calls', 'number', 2, 'calls', { min: 1, max: 5 }),
        supervisor('budgetUsd', 'Supervisor budget $', 'number', 0, 'budget', { min: 0 }),
        supervisor('minConfidence', 'Supervisor min confidence', 'number', 0.6, 'conf', { min: 0, max: 1 }),
        supervisor('lowConfidence', 'If the supervisor is not sure', 'tri', 'smart', 'fallback',
            { states: { ask: 'park', auto: 'smart', never: 'stop' } }),
        setting('judge.args', 'Judge CLI arguments', 'text', '--model claude-haiku-4-5-20251001', 'agentFarm.judgeArgs'),
        judgeStep('engine', 'Judge engine', 'claude'),
        judgeStep('model', 'Judge model', ''),
        // M-38 — a workflow input's value: its default on the workflow, what a run is given, the last run's remembered
        {
            id: 'workflow.input', label: 'Workflow input', type: 'text', default: '', remembered: true,
            levels: {
                workflow: { surface: 'media/afWorkflowInputs.js#wi-default', bridge: 'workflows.add:inputs.default' },
                run: { surface: 'media/afWorkflowInputs.js#wi-run', bridge: 'workflows.run:inputs' }
            }
        },
        {
            id: 'trigger.inputs', label: 'What a trigger hands a workflow input', type: 'text', default: '', remembered: false,
            levels: { run: { surface: 'media/afWorkflowInputs.js#wi-map', bridge: 'triggers.add:action.inputs' } }
        },
        setting('judge.unjudged', 'If no judge can look at it', 'tri', 'ask', 'agentFarm.judgeUnjudged',
            { states: { ask: 'ask', auto: 'pass', never: 'stop' } }),
        setting('sentry.leaderModel', 'Sentry leader model', 'text', '', 'agentFarm.sentryLeaderModel'),
        setting('sentry.leaderBudgetUsd', 'Sentry leader budget $/day', 'number', 2,
            'agentFarm.sentryLeaderBudgetUsd', { min: 0 }),
        setting('media.budgetMonthUSD', 'Media budget $/month', 'number', 0, 'agentFarm.mediaBudgetMonthUSD', { min: 0 })
    ];

    const byId = {};
    POINTS.forEach(function (p) { byId[p.id] = p; });

    const ids = () => POINTS.map(p => p.id);
    const point = id => byId[id] || null;
    /** The levels a point can be set at, in precedence order. */
    const levelsOf = id => { const p = byId[id]; return p ? LEVELS.filter(l => p.levels[l]) : []; };
    /** Every point settable at one level. */
    const pointsAt = level => POINTS.filter(p => p.levels[level]).map(p => p.id);

    /** Does the point mean anything here? An unstated fact means yes; a no carries its reason. */
    function applies(id, ctx) {
        const p = byId[id];
        if (!p) { return { ok: false, why: 'No flex point "' + id + '".' }; }
        if (typeof p.applies !== 'function') { return { ok: true }; }
        const r = p.applies(ctx || {});
        return r === true ? { ok: true } : { ok: false, why: String(r || 'Not applicable here.') };
    }

    /** Is `v` a value this point can hold? */
    function valid(p, v) {
        switch (p.type) {
            case 'number':
                return typeof v === 'number' && Number.isFinite(v)
                    && (p.min === undefined || v >= p.min) && (p.max === undefined || v <= p.max);
            case 'boolean': return typeof v === 'boolean';
            case 'text': return typeof v === 'string';
            case 'enum': return Array.isArray(p.options) && p.options.indexOf(v) >= 0;
            case 'tri': return !!p.states && TRI.some(s => p.states[s] === v);
            case 'range':
                return !!v && typeof v === 'object' && v.lo !== undefined && v.hi !== undefined;
            case 'conditions': return Array.isArray(v);
            case 'dimensions': return !!v && typeof v === 'object' && !Array.isArray(v);
            default: return false;
        }
    }

    /** Everything structurally wrong with a list of points, one sentence each; [] = sound. */
    function problems(list) {
        const out = [];
        const seen = {};
        (list || POINTS).forEach(function (p, i) {
            const who = p && p.id ? p.id : '#' + i;
            if (!p || !p.id) { out.push(who + ': no id'); return; }
            if (seen[p.id]) { out.push(who + ': declared twice'); }
            seen[p.id] = true;
            if (!p.label) { out.push(who + ': no label'); }
            if (TYPES.indexOf(p.type) < 0) { out.push(who + ': unknown type "' + p.type + '"'); }
            if (p.type === 'tri' && (!p.states || TRI.some(s => typeof p.states[s] !== 'string'))) {
                out.push(who + ': a tri point maps ask, auto and never');
            }
            if (TYPES.indexOf(p.type) >= 0 && !valid(p, p.default)) { out.push(who + ': default is not a valid ' + p.type); }
            if (typeof p.remembered !== 'boolean') { out.push(who + ': remembered must be said'); }
            ['applies', 'suggest'].forEach(function (f) {
                if (p[f] !== undefined && typeof p[f] !== 'function') { out.push(who + ': ' + f + ' must be a function'); }
            });
            const levels = p.levels && typeof p.levels === 'object' ? Object.keys(p.levels) : [];
            if (!levels.length) { out.push(who + ': settable at no level'); }
            levels.forEach(function (l) {
                if (l === 'builtin') { out.push(who + ': builtin is the default, not a level to declare'); return; }
                if (LEVELS.indexOf(l) < 0) { out.push(who + ': unknown level "' + l + '"'); return; }
                const e = p.levels[l] || {};
                LEVEL_KEYS.forEach(function (k) {
                    if (typeof e[k] !== 'string' || !e[k].trim()) { out.push(who + ' @' + l + ': no ' + k); }
                });
                Object.keys(e).forEach(function (k) {
                    if (LEVEL_KEYS.indexOf(k) < 0) { out.push(who + ' @' + l + ': unknown key "' + k + '"'); }
                });
            });
        });
        return out;
    }

    return {
        LEVELS: LEVELS, LEVEL_LABELS: LEVEL_LABELS, TYPES: TYPES, TRI: TRI, POINTS: POINTS,
        ids: ids, point: point, levelsOf: levelsOf, pointsAt: pointsAt,
        applies: applies, valid: valid, problems: problems
    };
});
