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
        {
            id: 'when', label: 'When to hand over',
            about: 'A run is held to whichever line it reaches first — its own context window, or the 5-hour or weekly quota of the account it is signed in as (read from that session\'s sign-in, never the home folder\'s). Converge is the earlier, quieter word; hand over is the end of the run. 0 switches a line off, and a converge line above its own handover line is folded down onto it.'
        },
        {
            id: 'words', label: 'Handover words',
            about: 'The lead words (CONTEXT HANDOVER, QUOTA CONVERGE…) and the reading in front of them are the law\'s and stay fixed — this is the order that follows them. Eight branches, because a run carrying a baton passes it instead of writing a note — and a leg the user braked as the chain\'s last goes back to the note. Leave a branch empty and its built-in sentence stays in charge; {chain} becomes the relay\'s own chain and hop.'
        },
        {
            id: 'limits', label: 'Relay limits',
            about: 'A run that passes the baton opens the next leg of its chain. The chain ends naturally when a run finishes the work and passes nothing; these are its brakes. Past the ceiling, or after two legs in a row that committed nothing, the pass opens no leg — the baton is kept as stopped, the runner writes a note instead, and Notices says so once.'
        },
        {
            id: 'legMessage', label: 'Leg message',
            about: 'The first message of each new leg: a header the system writes, then the predecessor\'s own words. Your template replaces the header — its variables are listed on it — and your standing rule is said to every leg. Leave both empty and the built-in header stays in charge; the predecessor\'s words are never dropped.'
        },
        {
            id: 'emergency', label: 'Emergency leg',
            about: 'A leg that finishes the work and passes nothing is the chain\'s natural end, and one you end yourself is never overridden. A leg that was cut off — told to hand over, a note written in its last two minutes, an error, uncommitted work — is rescued: the failsafe opens the next leg from what it left behind, through the same brakes. A successor that dies within 30 seconds without a tool call stops the chain instead. Your template replaces the emergency header; the evidence is never dropped.'
        },
        {
            id: 'account', label: 'Account choice',
            about: 'A run that hands over because its context filled up — not because its account ran out — leaves that account\'s five-hour window half used. Under this line the successor stays on the same account (a relay\'s next leg, the sentry\'s next round); at or above it, or when the handover was the quota\'s, the pool picks as before. A stay is a start, so this line never stands above the Account ceiling every start obeys: set higher, it acts at the ceiling and the row says so. The relay\'s pool is kept for every later leg. 0 = off.'
        },
        {
            id: 'faults', label: 'Engine failures',
            about: 'A turn that fails on the engine\'s side ends nothing — the card sits idle and the chain would wait for ever. When the engine is down, overloaded or refuses the sign-in, no new leg is opened (it would fail the same way): the same session is asked to continue at growing intervals, and past the ceiling a person is asked. When the engine flags the conversation itself, Agent Farm passes the baton for the leg — from the second flagged pass in a row on the fallback model, if one is set — until the cap holds the chain for you.'
        },
        { id: 'board', label: 'Chain board', about: 'When the chain board marks a relay as needing your attention.' }
    ],
    rows: {
        contextConvergePct: { group: 'when', unit: '%', zeroMeans: 'off' },
        contextHandoverPct: { group: 'when', tier: 'basic', unit: '%', zeroMeans: 'off' },
        quotaConvergePct: { group: 'when', unit: '%', zeroMeans: 'off' },
        quotaHandoverPct: { group: 'when', tier: 'basic', unit: '%', zeroMeans: 'off' },
        quotaWeeklyHandoverPct: { group: 'when', tier: 'basic', unit: '%' },
        defaultAccountCeiling: { group: 'when', tier: 'basic', unit: '%' },
        defaultAccountWeeklyCeiling: { group: 'when', unit: '%' },
        disciplineOrders: { group: 'words' },
        batonMaxHops: { group: 'limits', tier: 'basic' },
        batonHandoverTemplate: { group: 'legMessage' },
        batonInjectedDirective: { group: 'legMessage' },
        batonEmergencyTemplate: { group: 'emergency' },
        contextHandoverStayAccountPct: { group: 'account', unit: '%', zeroMeans: 'off' },
        batonFaultWaitHours: { group: 'faults', unit: 'h' },
        batonFlaggedPasses: { group: 'faults' },
        batonFlaggedModel: { group: 'faults', control: 'model', engine: 'claude' },
        chainHangMinutes: { group: 'board', unit: 'min' },
        chainWaitMinutes: { group: 'board', unit: 'min' }
    }
};
