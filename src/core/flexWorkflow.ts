/**
 * U-151 — a flex point's value on ONE workflow record (level workflow): what
 * `flex.set level=workflow` and the Run card's '↑ this flow' write. Only a point
 * whose workflow value has a single home on the record is written here; the
 * rest (library, supervisor) travel with the whole object through workflows.update.
 */
import { flexPoint, flexValid } from './flexPoints';
import { valueProblem, WorkflowInput } from './workflowInputs';
import { setWorkflowWake, wakeFromArg, WakeSpec } from './workflowWake';

export interface FlexWorkflowRecord { id: string; title?: string; wake?: WakeSpec; inputs?: WorkflowInput[] }

/** `value` undefined = back to inherited; `name` says which input for workflow.input. A refusal is thrown. */
export function setWorkflowFlex(w: FlexWorkflowRecord, id: string, value: unknown, name?: string) {
    const p = flexPoint(id);
    if (!p) { throw new Error(`"${id}" is not a flex point — flex.list shows every one.`); }
    const e = p.levels.workflow;
    if (!e) { throw new Error(`${id} is not set per workflow — it is set ${Object.keys(p.levels).join(', ')}.`); }
    const path = e.bridge.replace(/^workflows\.add:/, '');
    if (path === 'wake') {
        const wk = wakeFromArg(value === undefined ? '' : value);
        if (wk.error) { throw new Error(`${wk.error}.`); }
        setWorkflowWake(w, wk.wake);
        return { workflow: w.id, point: id, value: w.wake ?? [] };
    }
    if (path === 'inputs.default') {
        const who = String(name ?? '').trim();
        const input = (w.inputs ?? []).find(i => i.name === who);
        if (!input) {
            throw new Error(`name: which input of "${w.title ?? w.id}" — ${(w.inputs ?? []).map(i => i.name).join(', ') || 'it takes none'}.`);
        }
        if (value === undefined || value === null || value === '') {
            delete input.default;
        } else {
            const bad = flexValid(p, value) ? valueProblem(input, String(value)) : `${JSON.stringify(value)} is not a valid ${p.type}`;
            if (bad) { throw new Error(`${id} (${who}): ${bad}.`); }
            input.default = String(value);
        }
        return { workflow: w.id, point: id, name: who, value: input.default ?? '' };
    }
    throw new Error(`${id} on a workflow travels with the whole object — workflows.update writes it (${path}).`);
}
