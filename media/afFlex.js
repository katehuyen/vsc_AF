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
    // the tool step's recipes (M-49) — on a page afRecipes.js is loaded first
    const recipes = typeof window !== 'undefined' && window.AFRecipes ? window.AFRecipes : require('./afRecipes.js');
    const api = factory(recipes);
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFFlex = api; }
})(function (RECIPES) {
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

    /** A for-each step's own policy (M-40): set on the step card's For each row, carried by the step's `forEach`. */
    function forEachPoint(field, label, type, dflt, box, extra) {
        return Object.assign({
            id: 'foreach.' + field, label: label, type: type, default: dflt, remembered: false,
            levels: {
                step: {
                    surface: 'media/tasksPage.js#st-' + box,
                    bridge: 'workflows.add:steps.forEach.' + (field === 'budgetUsd' ? 'budgetUSD' : field)
                }
            }
        }, extra || {});
    }

    /** A checkpoint's own limits (M-43): set on the step card's Checkpoint row, carried by the step's `checkpoint`. */
    function checkpointPoint(field, label, type, dflt, box, extra) {
        return Object.assign({
            id: 'checkpoint.' + field, label: label, type: type, default: dflt, remembered: false,
            levels: { step: { surface: 'media/afCheckpoint.js#st-' + box, bridge: 'workflows.add:steps.checkpoint.' + field } }
        }, extra || {});
    }

    /** A workflow's supervisor (M-44): set on the workflow form's Supervisor row, carried by the workflow's `supervisor`. */
    function wfSupervisor(field, label, type, dflt, box, extra, liveBox) {
        const key = field === 'budgetUsd' ? 'budgetUSD' : field;
        const levels = { workflow: { surface: 'media/afCheckpoint.js#wf-' + box, bridge: 'workflows.add:supervisor.' + key } };
        // M-46 — the few a running workflow takes live (src/workflowLiveUi.ts)
        if (liveBox) { levels.live = { surface: 'src/workflowLiveUi.ts#' + liveBox, bridge: 'workflows.live:' + key }; }
        return Object.assign({
            id: 'workflow.supervisor.' + field, label: label, type: type, default: dflt, remembered: false, levels: levels
        }, extra || {});
    }

    /** A tool step's own choice (M-49): set on the step card's tool row, carried by the step's `tool`; some have a Farm Settings default too. */
    function toolPoint(field, label, type, dflt, box, extra) {
        const x = Object.assign({}, extra || {});
        const levels = { step: { surface: 'media/afTool.js#st-' + box, bridge: 'workflows.add:steps.tool.' + field } };
        if (x.settings) { levels.settings = { surface: 'setting:' + x.settings, bridge: 'settings.set:' + x.settings }; }
        delete x.settings;
        return Object.assign({ id: 'tool.' + field, label: label, type: type, default: dflt, remembered: false, levels: levels }, x);
    }

    /** X-416/X-417/X-418 — where a run's files are filed and recorded: the workflow form's Library row, a media or tool step's Library row. */
    function libPoint(field, label, type, dflt, at, extra) {
        const levels = {};
        if (at.settings) { levels.settings = at.settings; }
        if (at.workflow) { levels.workflow = { surface: 'media/afLibrary.js#wf-lib' + at.workflow, bridge: 'workflows.add:library.' + field }; }
        if (at.step) { levels.step = { surface: 'media/afLibrary.js#st-lib' + at.step, bridge: 'workflows.add:steps.library.' + field }; }
        return Object.assign({ id: 'library.' + field, label: label, type: type, default: dflt, remembered: false, levels: levels }, extra || {});
    }

    /** X-420 — airtable.input.*: the Farm setting, then the input's own search line on the workflow form. */
    function aqPoint(field, label, type, dflt, key, extra) {
        return Object.assign({
            id: 'airtable.input.' + field, label: label, type: type, default: dflt, remembered: false,
            levels: {
                settings: { surface: 'setting:agentFarm.' + key, bridge: 'settings.set:agentFarm.' + key },
                workflow: { surface: 'media/afAirtableInput.js#wi-aq-' + field, bridge: 'workflows.add:inputs.airtable.' + field }
            }
        }, extra || {});
    }

    /** X-424 — studio.library.*: the Farm setting, then the Studio wall's own filter row (live — never remembered). */
    function slPoint(field, label, type, dflt, key, extra) {
        return Object.assign({
            id: 'studio.library.' + field, label: label, type: type, default: dflt, remembered: false,
            levels: {
                settings: { surface: 'setting:agentFarm.' + key, bridge: 'settings.set:agentFarm.' + key },
                live: { surface: 'media/afStudioLibrary.js#sl-' + field, bridge: 'studio.library:' + field }
            }
        }, extra || {});
    }

    /** X-419 — library.enrich.*: the Farm setting, then the workflow form's Library block. */
    function enPoint(field, label, type, dflt, key, box, extra) {
        return Object.assign({
            id: 'library.enrich.' + field, label: label, type: type, default: dflt, remembered: false,
            levels: {
                settings: { surface: 'setting:agentFarm.' + key, bridge: 'settings.set:agentFarm.' + key },
                workflow: { surface: 'media/afLibrary.js#wf-libEn' + box, bridge: 'workflows.add:library.enrich.' + field }
            }
        }, extra || {});
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
        setting('workflow.prevTextChars', '{prev_text} length', 'number', 1500, 'agentFarm.workflowPrevTextChars',
            { min: 200, max: 20000 }),
        // M-49 — where a tool step writes, and what it does with a file already there (src/core/toolCall.ts)
        toolPoint('outDir', 'Tool step — output folder', 'text', '', 'tOutDir', { settings: 'agentFarm.toolOutDir' }),
        toolPoint('overwrite', 'Tool step — an output already there', 'enum', 'never', 'tOverwrite',
            { settings: 'agentFarm.toolOverwrite', options: ['never', 'suffix', 'always'] }),
        toolPoint('recipe', 'Tool step — recipe', 'text', '', 'tRecipe'),
        toolPoint('preset', 'Tool step — recipe preset', 'text', '', 'tPreset'),
        toolPoint('input', 'Tool step — input file', 'text', '', 'tInput'),
        // every recipe parameter, its default the recipe's own (media/afRecipes.js)
        ...RECIPES.RECIPES.flatMap(r => r.params.map(q => ({
            id: RECIPES.paramPoint(r.id, q.name), label: r.label + ' — ' + q.name,
            type: q.type === 'number' || q.type === 'enum' ? q.type : 'text',
            default: q.default === undefined ? '' : q.default, remembered: false,
            ...(q.options ? { options: q.options } : {}), ...(q.min !== undefined ? { min: q.min, max: q.max } : {}),
            levels: { step: { surface: 'media/afTool.js#st-tp', bridge: 'workflows.add:steps.tool.params' } }
        }))),
        // M-47 — a mission's workflow: its supervisor's question goes to the lead, to you, or the lead first (src/core/workflowMission.ts)
        setting('workflow.askEscalation', 'Inside a mission — who answers the supervisor', 'enum', 'leader-then-human', 'agentFarm.workflowAskEscalation',
            { options: ['leader-then-human', 'leader', 'human'] }),
        judgeStep('engine', 'Judge engine', 'claude'),
        forEachPoint('concurrency', 'For each — at once', 'number', 4, 'feConc', { min: 1, max: 16 }),
        forEachPoint('onBranchFail', 'For each — a failed element', 'enum', 'continue', 'feFail', { options: ['continue', 'drop'] }),
        forEachPoint('retries', 'For each — retries', 'number', 0, 'feRetries', { min: 0, max: 5 }),
        forEachPoint('cap', 'For each — at most', 'number', 20, 'feCap', { min: 1, max: 200 }),
        forEachPoint('capMode', 'For each — a longer list', 'enum', 'soft', 'feCapMode', { options: ['soft', 'hard'] }),
        forEachPoint('budgetUsd', 'For each — $ per element', 'number', 0, 'feBudget', { min: 0 }),
        judgeStep('model', 'Judge model', ''),
        wfSupervisor('model', 'Workflow supervisor model', 'text', '', 'supModel', null, 'wl-model'),
        wfSupervisor('effort', 'Workflow supervisor effort', 'text', '', 'supEffort'),
        wfSupervisor('account', 'Workflow supervisor sign-in', 'text', '', 'supAccount'),
        wfSupervisor('maxCalls', 'Workflow supervisor — calls per run', 'number', 10, 'supCalls', { min: 1, max: 50 }, 'wl-calls'),
        wfSupervisor('budgetUsd', 'Workflow supervisor — budget $', 'number', 0, 'supBudget', { min: 0 }, 'wl-budget'),
        wfSupervisor('budgetMode', 'Workflow supervisor — over the budget', 'enum', 'soft', 'supBudgetMode', { options: ['soft', 'hard'] }),
        wfSupervisor('maxFailures', 'Workflow supervisor — failures in a row', 'number', 3, 'supFailures', { min: 1, max: 10 }),
        wfSupervisor('timeoutMin', 'Workflow supervisor — minutes per call', 'number', 5, 'supTimeout', { min: 1, max: 30 }),
        checkpointPoint('allowed', 'Checkpoint — decisions it may take', 'text', 'proceed,retry,jump,insert,ask_user,stop', 'cpAllowed'),
        checkpointPoint('maxInsert', 'Checkpoint — steps it may insert', 'number', 2, 'cpMaxInsert', { min: 0, max: 5 }),
        checkpointPoint('insertKinds', 'Checkpoint — kinds it may insert', 'text', 'agent,approval', 'cpKinds'),
        checkpointPoint('maxRetries', 'Checkpoint — retries per step', 'number', 2, 'cpRetries', { min: 0, max: 5 }),
        checkpointPoint('minConfidence', 'Checkpoint — confidence threshold', 'number', 0.6, 'cpConf', { min: 0, max: 1 }),
        checkpointPoint('lowConfidence', 'Checkpoint — below the threshold', 'enum', 'ask', 'cpLow', { options: ['ask', 'mechanical', 'escalate'] }),
        // X-416/X-417/X-418 — the media library of the local Airtable (src/core/runLibrary.ts)
        libPoint('base', 'Library — Airtable database', 'text', '', {
            settings: { surface: 'media/airtablePage.js#def-inst', bridge: 'airtable.config.set:defaultInstance' }, workflow: 'Base', step: 'Base'
        }),
        libPoint('lang', 'Library — record language', 'text', '', {
            settings: { surface: 'media/airtablePage.js#def-lang', bridge: 'airtable.config.set:defaultLang' }, workflow: 'Lang', step: 'Lang'
        }),
        libPoint('autoStart', 'Library — an engine that is not running', 'tri', 'auto', { workflow: 'Start' },
            { states: { ask: 'ask', auto: 'auto', never: 'never' } }),
        libPoint('record', 'Library — which files get a record', 'enum', 'all', { workflow: 'Record', step: 'Record' },
            { options: ['all', 'passed', 'none'] }),
        libPoint('template', 'Library — record template', 'text', '', { workflow: 'Template', step: 'Template' }),
        libPoint('stage', 'Library — the stage of this step\'s files', 'enum', '', { step: 'Stage' },
            { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        // X-417 — the workflow's own role → stage mapping; blank = the built-in default of that role
        libPoint('stages.input', 'Library — stage of a run input', 'enum', '', { workflow: 'MapInput' }, { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        libPoint('stages.intermediate', 'Library — stage of a part or a candidate', 'enum', '', { workflow: 'MapIntermediate' }, { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        libPoint('stages.failed', 'Library — stage of a judge FAIL', 'enum', '', { workflow: 'MapFailed' }, { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        libPoint('stages.rejected', 'Library — stage of a left-out file', 'enum', '', { workflow: 'MapRejected' }, { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        libPoint('stages.final', 'Library — stage of the run\'s last output', 'enum', '', { workflow: 'MapFinal' }, { options: ['', 'source', 'raw', 'semi', 'final', 'asset'] }),
        // X-420 — an airtable workflow input's search defaults (src/core/airtableInput.ts)
        aqPoint('stages', 'Airtable input — stages searched', 'text', 'asset, final', 'airtableInputStages'),
        aqPoint('limit', 'Airtable input — most records', 'number', 20, 'airtableInputLimit', { min: 1, max: 200 }),
        aqPoint('sort', 'Airtable input — order', 'enum', 'newest', 'airtableInputSort', { options: ['newest', 'oldest', 'name'] }),
        // X-424 — which records the Studio wall shows (src/core/studioLibrary.ts)
        slPoint('base', 'Studio wall — database', 'text', '', 'studioLibraryBase'),
        slPoint('stages', 'Studio wall — stages shown', 'text', '', 'studioLibraryStages'),
        slPoint('kind', 'Studio wall — kind', 'enum', '', 'studioLibraryKind', { options: ['', 'image', 'video', 'audio'], emptyLabel: 'every kind' }),
        slPoint('success', 'Studio wall — outcome', 'enum', '', 'studioLibrarySuccess', { options: ['', 'passed', 'failed'], emptyLabel: 'passed + failed' }),
        // X-419 — a model fills the records' meaning (src/core/enrichSpec.ts)
        enPoint('when', 'Enrich — when', 'enum', 'end', 'libraryEnrich', 'When', { options: ['end', 'record', 'never'] }),
        enPoint('scope', 'Enrich — which files', 'enum', 'final-failed', 'libraryEnrichScope', 'Scope', { options: ['final-failed', 'final', 'all'] }),
        enPoint('model', 'Enrich — image model (claude)', 'text', 'sonnet', 'libraryEnrichModel', 'Model'),
        enPoint('videoModel', 'Enrich — video model (agy)', 'text', 'gemini-3.8-flash-low', 'libraryEnrichVideoModel', 'Video'),
        enPoint('effort', 'Enrich — effort (claude)', 'text', 'low', 'libraryEnrichEffort', 'Effort'),
        enPoint('sections', 'Enrich — sections', 'text', '', 'libraryEnrichSections', 'Sections'),
        enPoint('cap', 'Enrich — dollars per record', 'number', 0, 'libraryEnrichCap', 'Cap', { min: 0, max: 50 }),
        // M-45 — what wakes the supervisor after a step: [] = mechanical (src/core/workflowWake.ts)
        {
            id: 'workflow.wake', label: 'Wake the supervisor', type: 'conditions', default: [], remembered: false,
            levels: {
                workflow: { surface: 'media/afWake.js#wf-wake', bridge: 'workflows.add:wake' },
                step: { surface: 'media/afWake.js#st-wake', bridge: 'workflows.add:steps.wake' },
                run: { surface: 'media/afWake.js#wi-wake', bridge: 'workflows.run:wake' },
                live: { surface: 'src/workflowLiveUi.ts#wl-wake', bridge: 'workflows.live:wake' }
            }
        },
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
        setting('upload.auto', 'Upload local files', 'enum', 'ask', 'agentFarm.mediaUploadAuto', { options: ['ask', 'auto', 'never'] }),
        setting('upload.provider', 'Upload local files to', 'enum', 'auto', 'agentFarm.mediaUploadProvider', { options: ['auto', 'fal', 'replicate'] }),
        setting('upload.retentionDays', 'Keep an upload (days)', 'number', 7, 'agentFarm.mediaUploadRetentionDays', { min: 0, max: 365 }),
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
