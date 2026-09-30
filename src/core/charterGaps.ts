/**
 * X-438 — WHICH OF THE CHARTER'S BINDING SECTIONS ARE NOT THERE.
 *
 * Code Architecture, Verification Gate and Project Invariants are inlined into
 * every session's brief. A section that is deleted or left empty is simply not
 * printed — so the sessions stop being told the project's rules and nothing
 * says so (measured: and_AgentFarm's charter lost them and no surface noticed).
 * This is the one verdict both the brief and the project warnings ask.
 */
import type { CharterSections } from './projectDocs';

export const CHARTER_REQUIRED: readonly { key: keyof CharterSections; heading: string }[] = [
    { key: 'architecture', heading: 'Code Architecture' },
    { key: 'verification', heading: 'Verification Gate' },
    { key: 'invariants', heading: 'Project Invariants' }
];

export interface CharterGap {
    heading: string;
    /** `missing` = no heading of that kind; `empty` = the heading is there with nothing under it */
    state: 'missing' | 'empty';
}

/** An HTML comment is a note to the reader, not a rule a session can follow. */
function hasContent(text: string): boolean {
    return text.replace(/<!--[\s\S]*?(-->|$)/g, '').trim().length > 0;
}

export function charterGaps(sections: CharterSections): CharterGap[] {
    const out: CharterGap[] = [];
    for (const { key, heading } of CHARTER_REQUIRED) {
        const text = sections[key];
        if (text === undefined) { out.push({ heading, state: 'missing' }); }
        else if (!hasContent(text)) { out.push({ heading, state: 'empty' }); }
    }
    return out;
}

/** One sentence for a warning list: `charter: Code Architecture missing · Project Invariants empty`. */
export function charterGapSentence(gaps: CharterGap[], hasCharter = true): string | undefined {
    if (!hasCharter) { return 'no charter file (af-role: charter) — sessions get no architecture, gate or invariants'; }
    if (!gaps.length) { return undefined; }
    return 'charter: ' + gaps.map(g => `${g.heading} ${g.state}`).join(' · ')
        + ' — sessions are not told it';
}
