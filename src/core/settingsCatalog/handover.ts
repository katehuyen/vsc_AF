import { CatalogSection } from './types';

/**
 * S-80 — the handover rule is a section of its own: the percentages are not a monitor's sensitivity but the law a
 * run is held to, and once the sentence they deliver became editable there was a subject here. WHEN a run is
 * spoken to and WHAT it is then told are filed together on purpose — a threshold nobody can retune and a sentence
 * nobody can rewrite were each half a rule. `contextWindowTokens` stays under Monitoring: it is the ceiling every
 * context figure is drawn against, not a line anybody is held to.
 */
export const handover: CatalogSection = {
    id: 'handover',
    label: 'Handover & Relay',
    about: 'When a long run hands over or passes the baton, and what the next run is told.',
    groups: [
        // Quota is read from that session's sign-in, never the home folder's. 0 switches a line off, and a converge
        // line above its own handover line is folded down onto it.
        {
            id: 'when', label: 'When to hand over',
            about: 'A run is held to whichever line it reaches first: its context window, or its own account\'s five-hour or weekly quota. Converge is the earlier, quieter warning; handover ends the run.'
        },
        // The lead words (CONTEXT HANDOVER, QUOTA CONVERGE...) and the reading in front of them are the law's. A run
        // carrying a baton passes it instead of writing a note, and a leg the user braked as the chain's last goes
        // back to the note. An empty branch keeps its built-in sentence.
        {
            id: 'words', label: 'Handover words',
            about: 'What a run is told to do after each warning; the lead words in front of it stay fixed.'
        },
        // A chain ends naturally when a run finishes the work and passes nothing. Past the ceiling, or after two legs
        // in a row that committed nothing, the pass opens no leg: the baton is kept as stopped, the runner writes a
        // note instead, and Notices says so once.
        {
            id: 'limits', label: 'Relay limits',
            about: 'The brakes on a relay chain: the most legs it may run, and legs that commit nothing.'
        },
        // The system writes a header, then the predecessor's own words; the template replaces the header. Leave both
        // empty and the built-in header stays in charge; the predecessor's words are never dropped.
        {
            id: 'legMessage', label: 'Leg message',
            about: 'The first message of every new leg: your own header, and a rule said to every leg.'
        },
        // A leg that finishes the work and passes nothing ends the chain, and one the user ends is never overridden.
        // A cut-off leg (told to hand over, a note in its last two minutes, an error, uncommitted work) is rescued
        // through the same brakes; a successor that dies within 30 seconds without a tool call stops the chain
        // instead. The evidence is never dropped.
        {
            id: 'emergency', label: 'Emergency leg',
            about: 'The first message of a leg the failsafe opens because the leg before it was cut off.'
        },
        // A context handover leaves the account's five-hour window half used, so under this line the successor (a
        // relay's next leg, the sentry's next round) stays on it. A stay is a start, so the line never stands above
        // the account ceiling; set higher, it acts at the ceiling and the row says so. The relay's pool is kept for
        // every later leg.
        {
            id: 'account', label: 'Account choice',
            about: 'Whether the next run stays on the same account when the handover was not caused by the quota.'
        },
        // A turn that fails on the engine's side ends nothing, so the chain would wait for ever. When the engine is
        // down, overloaded or refuses the sign-in, no new leg is opened: the same session is asked to continue at
        // growing intervals, and past the ceiling a person is asked. A flagged conversation passes the baton, on the
        // fallback model from the second flagged pass in a row, until the cap holds the chain.
        {
            id: 'faults', label: 'Engine failures',
            about: 'What a relay does when the engine fails or flags the conversation.'
        },
        { id: 'board', label: 'Chain board', about: 'When the chain board marks a relay as needing your attention.' }
    ],
    rows: {
        // Delivered through the live hook's answer (PostToolUse additionalContext) on Claude Code. Bridge:
        // sessions.contextGuard / sessions.contextGuard.set.
        contextConvergePct: {
            group: 'when', unit: '%', zeroMeans: 'off',
            label: 'Context converge at',
            summary: 'How full a session\'s context gets before it is told to finish the step in flight.'
        },
        contextHandoverPct: {
            group: 'when', tier: 'basic', unit: '%', zeroMeans: 'off',
            label: 'Context handover at',
            summary: 'How full a session\'s context gets before it is told to wrap up and end the run.'
        },
        // The handover law has no quota converge line. The sign-in is a Console card's or its launch manifest's
        // account slot, never the home folder.
        quotaConvergePct: {
            group: 'when', unit: '%', zeroMeans: 'off',
            label: 'Quota converge at',
            summary: 'How full the account\'s five-hour window gets before the session is told to start nothing new.'
        },
        quotaHandoverPct: {
            group: 'when', tier: 'basic', unit: '%', zeroMeans: 'off',
            label: 'Quota handover at',
            summary: 'How full the account\'s five-hour window gets before the session is told to end the run.'
        },
        quotaWeeklyHandoverPct: {
            group: 'when', tier: 'basic', unit: '%', zeroMeans: 'off',
            label: 'Weekly handover at',
            summary: 'How full the account\'s weekly window gets before the session is told to end the run.'
        },
        // It binds the built-in policies (@emptiest, @round-robin, @standing, @pool), a run carried to another
        // account after a limit, and accounts.status asked without a ceiling. A slot past the quota handover line
        // would be told to hand over on its first reading, so lowering that line lowers every wall. The Account
        // Policies table, the campaign's Ceiling box and sentry.status show the wall in force and why.
        defaultAccountCeiling: {
            group: 'when', tier: 'basic', unit: '%',
            label: 'Account ceiling',
            summary: 'How full a five-hour window may be before unattended starts pass that account over.'
        },
        // Every place the Account ceiling binds judges the week here. A session started past the weekly handover line
        // would be told to hand over on its first reading.
        defaultAccountWeeklyCeiling: {
            group: 'when', unit: '%',
            label: 'Weekly account ceiling',
            summary: 'How full a weekly window may be before unattended starts pass that account over.'
        },
        // The handover law waits for exactly CONTEXT CONVERGE / CONTEXT HANDOVER / QUOTA CONVERGE / QUOTA HANDOVER.
        // Bridge: sessions.contextGuard / sessions.contextGuard.set orders=.
        disciplineOrders: {
            group: 'words',
            label: 'Handover orders',
            summary: 'What a session is told to do after each converge or handover warning.'
        },
        batonMaxHops: {
            group: 'limits', tier: 'basic',
            label: 'Most legs per chain',
            summary: 'The most legs one relay chain may run.'
        },
        // An unknown {name} is left as typed. {agentPrompt} left out is appended under a --- line; {relayRules} left
        // out is placed above the directive.
        batonHandoverTemplate: {
            group: 'legMessage',
            label: 'Leg message template',
            summary: 'Your own first message for every new leg, in place of the built-in header.'
        },
        batonInjectedDirective: {
            group: 'legMessage',
            label: 'Standing rule',
            summary: 'A rule said to every leg of every chain, above the predecessor\'s words.'
        },
        // A late note is a handover note written in the leg's last two minutes. A leg that finished cleanly, or that
        // you ended yourself, is never rescued; a successor that dies within 30 seconds without a tool call stops the
        // chain (crash-loop guard). {evidence} is the handover note's status, remaining and first-five-minutes
        // sections, or the uncommitted state.
        batonEmergencyTemplate: {
            group: 'emergency',
            label: 'Emergency leg template',
            summary: 'Your own first message for a leg the failsafe opens.'
        },
        // A stay is a start, so it never stands above the wall every start obeys (the account ceiling, itself never
        // above the quota handover line); a line set higher acts at that wall. The chain's pool is kept for later
        // legs.
        contextHandoverStayAccountPct: {
            group: 'account', unit: '%', zeroMeans: 'off',
            label: 'Stay on the account under',
            summary: 'Below this, a successor opens on the same account unless the quota caused the handover.'
        },
        batonFaultWaitHours: {
            group: 'faults', unit: 'h',
            label: 'Engine failure wait',
            summary: 'How long a leg keeps retrying a failing engine before you are asked.'
        },
        batonFlaggedPasses: {
            group: 'faults',
            label: 'Flagged passes in a row',
            summary: 'How many flagged passes may come in a row before the chain waits for you.'
        },
        batonFlaggedModel: {
            group: 'faults', control: 'model', engine: 'claude',
            label: 'Model after a flag',
            summary: 'The model a successor opens on after two flagged passes in a row.'
        },
        chainHangMinutes: {
            group: 'board', unit: 'min',
            label: 'Hanging after',
            summary: 'How long a leg may sit idle without passing before its chain is flagged.'
        },
        chainWaitMinutes: {
            group: 'board', unit: 'min',
            label: 'Next leg stuck after',
            summary: 'How long a next leg may wait for the one before it to end before the chain is flagged.'
        }
    }
};
