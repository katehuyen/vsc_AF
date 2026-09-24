import { SessionDiagnosis } from './sessionDiagnosis';
import {
    Condition, conditionHits, evaluateConditions, FieldSpec, FieldType, OperatorSpec, OPERATORS,
    PolicyDictionary, SNAPSHOT_TEXT_MAX, snapshotFacts
} from './policyEngine';

export { Condition, FieldSpec, FieldType, OperatorSpec, OPERATORS, SNAPSHOT_TEXT_MAX };

/**
 * X-190 — WHEN THE LEADER WAKES, AND WHO DECIDES.
 *
 * The sentry that shipped was purely mechanical: measure, fill a template, open
 * the next round, never think. The design conversation had agreed on something
 * else — "bir lider ajan bakar, kendini uyutur, uyanması için gereken görevi
 * ayarlar" — and the correction is not to throw the mechanical engine away but
 * to make it one END of a switch.
 *
 * ‼️ THE THREE MODES ARE NOT THREE CODE PATHS.
 *
 * Mechanical, intelligent and hybrid are three PRESETS over ONE condition set:
 *
 *   mechanical  = the empty set        → the leader never wakes, zero tokens
 *   intelligent = a set that always fires → it wakes every round
 *   hybrid      = whatever the user built, starting from a preset
 *
 * Written as three branches, two of them would rot unwatched; and three fixed
 * modes ARE the narrow mould the user warned against ("çok dar kalıplara
 * sıkışmış bir hibrit sistem çok etkili olmaz"). As presets, the mechanical
 * path is exercised by every hybrid round that fires nothing, so it cannot rot
 * without the hybrid tests noticing.
 *
 * ‼️ AND AN UNKNOWN FIELD FAILS WITH ITS EYES OPEN. It does not fire (firing on
 * a name nobody implemented spends money at 3 a.m. for no reason) and it is not
 * swallowed either (a condition that quietly never fires is a rule that failed
 * silently). It comes back in `problems`, by name.
 *
 * Pure: no `fs`, no `vscode`, no model, no clock. Everything is handed in.
 */

/* -------------------------------------------------------------- the facts */

/**
 * What the pipeline measured about the round that just ended, in the shape the
 * conditions read it. Deliberately NOT `SessionFacts`: that is what was read
 * off the disk, this is what a person writes a rule against.
 */
export interface PolicyFacts {
    diagnosis: SessionDiagnosis;
    /** X-189's answer: was a handover note found, where, and how sure */
    handover?: { found: boolean; source: string; score: number };
    repo?: { dirty: number; untracked: number };
    round?: { index: number; failed: boolean; barren: boolean; consecutiveBarren: number };
    quota?: { percent: number };
    accounts?: { usable: number };
    /** the tail of the round's output — the only place an engine speaks freely */
    output?: string;
    code?: { closed: boolean };
}

/* --------------------------------------------------------- the dictionary */


/**
 * ‼️ ONE PLACE. A settings or missions surface DRAWS this list rather than
 * repeating it, so adding a field below turns up in the editor without the
 * editor being touched — which is the whole of "the conditions must not be a
 * narrow mould".
 */
export const FIELDS: FieldSpec[] = [
    {
        field: 'always', type: 'boolean',
        describe: 'always true — the one condition the "intelligent" preset is made of'
    },
    {
        field: 'outcome', type: 'enum',
        values: ['item-done', 'clean-handover', 'nothing-to-continue', 'hit-the-wall'],
        describe: 'what the finished round left behind, as the diagnosis ruled it'
    },
    {
        field: 'unknown.count', type: 'number',
        describe: 'how many facts could NOT be measured — the honest size of the doubt'
    },
    {
        field: 'limit', type: 'boolean',
        describe: 'did an engine say the plan window was spent'
    },
    {
        field: 'handover.found', type: 'boolean',
        describe: 'was a handover note found for the session that just ended'
    },
    {
        field: 'handover.source', type: 'enum',
        values: ['transcript', 'configured', 'projectNotes', 'fallback', ''],
        describe: 'where it was found — the session\'s own writes are surer than a configured folder'
    },
    {
        field: 'handover.score', type: 'number',
        describe: 'how well the file name matched; a low score is a guess, not a find'
    },
    {
        field: 'repo.dirty', type: 'number',
        describe: 'uncommitted paths left behind, as git status --porcelain counts them'
    },
    {
        field: 'repo.untracked', type: 'number',
        describe: 'files the round created and never added'
    },
    {
        field: 'code.closed', type: 'boolean',
        describe: 'did the backlog item the round worked on actually close'
    },
    {
        field: 'round.failed', type: 'boolean',
        describe: 'did the run itself fail rather than finish'
    },
    {
        field: 'round.barren', type: 'boolean',
        describe: 'did it "succeed" while producing nothing anybody can carry on from'
    },
    {
        field: 'round.consecutiveBarren', type: 'number',
        describe: 'how many barren rounds in a row — the shape of a loop going nowhere'
    },
    {
        field: 'round.index', type: 'number',
        describe: 'which round of the campaign this is'
    },
    {
        field: 'quota.percent', type: 'number',
        describe: 'how much of the five-hour window the account had spent'
    },
    {
        field: 'accounts.usable', type: 'number',
        describe: 'how many accounts the campaign can still open a session with'
    },
    {
        field: 'output', type: 'text',
        describe: 'the tail of the round\'s output — where a stack trace or a refusal shows up'
    }
];


/* --------------------------------------------------------- the conditions */


export interface SentryPolicy {
    /** the preset this started from, kept so a surface can say "hybrid (edited)" */
    preset?: string;
    conditions: Condition[];
}

export interface PolicyVerdict {
    verdict: 'mechanical' | 'leader';
    /** the ids of the conditions that fired, in the order they were written */
    fired: string[];
    /** one sentence a person reads on the round's row */
    why: string;
    /** ‼️ conditions that could not be evaluated. Never silent. */
    problems: string[];
}

export const PRESETS: { id: string; label: string; describe: string }[] = [
    {
        id: 'mechanical', label: 'Mechanical',
        describe: 'no condition — the next prompt is always built from a template. Zero tokens, zero thinking.'
    },
    {
        id: 'intelligent', label: 'Intelligent',
        describe: 'the leader wakes on every round and writes the next prompt itself.'
    },
    {
        id: 'hybrid', label: 'Hybrid',
        describe: 'a routine round stays free; the leader wakes only when something is off. Edit the conditions to taste.'
    }
];

/**
 * ‼️ THE HYBRID STARTING SET IS DATA, NOT A RULE.
 *
 * These are the four states where a template demonstrably cannot say anything
 * useful: nobody knows where the work got to, the repository is carrying
 * unexplained work, the run itself broke, or the campaign is going round in
 * circles. The user edits from here; nothing below is load-bearing.
 */
export function presetConditions(preset: string): Condition[] {
    if (preset === 'intelligent') {
        return [{ id: 'always', field: 'always', operator: 'isTrue' }];
    }
    if (preset === 'hybrid') {
        return [
            { id: 'no-handover', field: 'handover.found', operator: 'isFalse' },
            { id: 'dirty-repo', field: 'repo.dirty', operator: 'gt', value: 0 },
            { id: 'round-failed', field: 'round.failed', operator: 'isTrue' },
            { id: 'going-nowhere', field: 'round.consecutiveBarren', operator: 'gte', value: 2 },
            { id: 'facts-missing', field: 'unknown.count', operator: 'gte', value: 2 }
        ];
    }
    return [];
}

/* ---------------------------------------------------------- the evaluation */

/** `undefined` = this field could not be read AT ALL, which is a problem rather
 *  than a false. A fact that was never measured is not a fact that is absent. */
function read(field: string, f: PolicyFacts): unknown {
    switch (field) {
        case 'always': return true;
        case 'outcome': return f.diagnosis?.outcome;
        case 'unknown.count': return f.diagnosis?.unknown?.length ?? 0;
        case 'limit': return !!f.diagnosis?.limit;
        case 'handover.found': return !!f.handover?.found;
        case 'handover.source': return f.handover?.source ?? '';
        case 'handover.score': return f.handover?.score ?? 0;
        case 'repo.dirty': return f.repo?.dirty ?? 0;
        case 'repo.untracked': return f.repo?.untracked ?? 0;
        case 'code.closed': return !!f.code?.closed;
        case 'round.failed': return !!f.round?.failed;
        case 'round.barren': return !!f.round?.barren;
        case 'round.consecutiveBarren': return f.round?.consecutiveBarren ?? 0;
        case 'round.index': return f.round?.index ?? 0;
        case 'quota.percent': return f.quota?.percent ?? -1;
        case 'accounts.usable': return f.accounts?.usable ?? 0;
        case 'output': return f.output ?? '';
        default: return undefined;
    }
}

/** The sentry's dictionary for the shared condition engine (src/core/policyEngine.ts). */
export const SENTRY_DICTIONARY: PolicyDictionary<PolicyFacts> = { noun: 'sentry', when: 'this round', fields: FIELDS, read };

/**
 * ‼️ X-194 — WHAT EVERY FIELD READS RIGHT NOW, by the evaluator's OWN `read()`
 * over the dictionary: a field added to `FIELDS` turns up on the row without
 * this being touched, and a row can never show a figure the verdict disagrees
 * with. A long text keeps its END (`output` is a tail), opening with `…`.
 */
export const factsSnapshot = (facts: PolicyFacts): Record<string, unknown> => snapshotFacts(SENTRY_DICTIONARY, facts);


/**
 * ‼️ THE WHOLE DECISION, AND IT COSTS NOTHING TO MAKE.
 *
 * Conditions are ORed: any one of them wakes the leader, and the ones that did
 * are named. A broken condition never stops the working ones — a typo in row
 * four must not silently disarm rows one to three.
 */
export function evaluateSentryPolicy(policy: SentryPolicy, facts: PolicyFacts): PolicyVerdict {
    const { fired, problems } = evaluateConditions(SENTRY_DICTIONARY, policy?.conditions, facts);
    const tail = problems.length
        ? ` ${problems.length} condition(s) could not be judged and did not fire.`
        : '';
    if (fired.length) {
        return {
            verdict: 'leader', fired, problems,
            why: `The leader was woken by ${fired.map(id => `"${id}"`).join(', ')}.${tail}`
        };
    }
    return {
        verdict: 'mechanical', fired: [], problems,
        why: (policy?.conditions?.length
            ? 'No condition fired, so this round was built from a template and cost nothing.'
            : 'There is no condition on this campaign, so every round is built from a template.')
            + tail
    };
}

/**
 * ‼️ X-194 — WOULD THIS SET FIRE TONIGHT?
 *
 * One implementation, two callers: the Missions condition editor asks it on
 * every repaint of the draft, and an agent asks it over `sentry.probe`. Neither
 * is allowed to work the answer out for itself — operator semantics live in
 * this file, and a surface carrying its own copy is the copy that goes out of
 * date and marks a row the round will disagree with.
 *
 * ‼️ AND WITH NOTHING MEASURED THERE IS NO ANSWER. A campaign that has never
 * finished a round has no readings; saying "mechanical" for it would be the
 * guess this system refuses everywhere else, because "nothing fired" and
 * "nothing was read" are opposite answers.
 */
export interface PolicyProbe {
    /** was there anything to judge against at all */
    measured: boolean;
    conditions: Condition[];
    verdict?: 'mechanical' | 'leader';
    fired: string[];
    /** per condition, IN THE ORDER GIVEN — see below for why not by id */
    hits: boolean[];
    problems: string[];
    why: string;
    /** the readings it judged against, so a surface shows the same figures */
    facts?: Record<string, unknown>;
}

export function probePolicy(conditions: Condition[], facts?: PolicyFacts): PolicyProbe {
    const list = Array.isArray(conditions) ? conditions : [];
    if (!facts) {
        return {
            measured: false, conditions: list, fired: [], hits: [], problems: [],
            why: 'No round has been measured yet, so there is nothing to judge these conditions '
                + 'against. They are read for the first time when a round finishes.'
        };
    }
    const whole = evaluateSentryPolicy({ conditions: list }, facts);
    return {
        measured: true, conditions: list,
        verdict: whole.verdict, fired: whole.fired, why: whole.why, problems: whole.problems,
        // ‼️ JUDGED ONE AT A TIME AS WELL, because a row is marked by its
        // POSITION while the verdict names conditions by their handle — and two
        // rows are free to carry the same handle. Conditions are ORed, so
        // judging one alone is exactly the question "does this row hold".
        hits: conditionHits(SENTRY_DICTIONARY, list, facts),
        facts: factsSnapshot(facts)
    };
}
