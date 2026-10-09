/**
 * U-233 — the one card a special block of Farm Settings is drawn as: "Open with" ready, and warning when a custom
 * app has no command (its Details open on the boxes that fix it). Only General is drawn, with one row beside the
 * card, so the scenes show the card and nothing the other fixtures already measure.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const ALL = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

const PROPS = { 'agentFarm.consoleDropZone': ALL['agentFarm.consoleDropZone'] };
const MODES = ['vscode', 'preview', 'obsidian', 'custom'];

const base = docOpen => ({
    focus: '', profiles: [], prompts: null, docOpen, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: S.buildSettingsModel(PROPS, k => PROPS[k].default),
    pathVars: [],
    pathPreview: {},
    valueSources: {}
});

const READY = { defaultMode: 'preview', modes: MODES, customCommand: '', customArgs: '{file}' };
const WARN = { defaultMode: 'custom', modes: MODES, customCommand: '', customArgs: '{file}' };
const state = { open: ['general'] };

const data = () => base(READY);

const variants = () => ([
    { id: 'cardsettings', label: 'Settings — the Open with card, ready: its state, its sentence and its pick on one line', data: base(READY), state },
    {
        id: 'cardsettings-warn',
        label: 'Settings — the same card warning: a custom app with no command, Details open on the boxes that fix it',
        data: base(WARN), state
    }
]);

module.exports = { script: 'settings.js', data, variants };
