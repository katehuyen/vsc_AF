import * as vscode from 'vscode';
import { CLOSED_STATUSES, PartsTotal, partsTotals, Project, ProjectStatus } from '../core/projects';
import { SessionInfo } from '../core/sessions';
import { relTime } from '../core/util';

/**
 * Projects — the sidebar.
 *
 * It sits directly under Agents: the fleet is what you look at first, and the
 * project is the umbrella over what that fleet is doing.
 *
 * Two nodes here are not decoration.
 *
 * **Active project** is always the first row, whether one is set or not. It is
 * the thing that stamps new work, and a stamp nobody can see being applied is
 * exactly the kind of silent automation that costs trust — so its state is on
 * screen at all times, including when it is empty.
 *
 * **Unassigned** is always the last row, and it deliberately shows a number
 * that starts out embarrassing. A rule that fails quietly is not a rule: if
 * hundreds of sessions belong to no project, the fix is for that to be visible
 * until somebody deals with it, not for the tree to look tidy.
 *
 * ‼️ A SUB-PROJECT APPEARS IN EXACTLY ONE PLACE — under its parent, whatever
 * its own status is. The alternative (a part that also sits in "Finished"
 * because it is done) makes the same project appear twice in one tree, and a
 * reader counting rows would be wrong. A part whose parent is not in the list —
 * filtered out, or deleted in another window — comes back as a top-level row
 * instead of vanishing (`projectTree`'s orphan rule).
 */

export interface ProjectRow {
    project: Project;
    sessions: number;
    cost: number;
    todayCost: number;
    lastTs: number;
    warnings: string[];
    folderOk: boolean;
}

export interface ProjectsTreeDeps {
    rows(): ProjectRow[];
    /** Most recent sessions of one project, newest first. */
    sessionsFor(id: string, limit: number): SessionInfo[];
    /** How many sessions no project claims, and what they cost. */
    unassigned(): { sessions: number; cost: number };
    activeId(): string;
}

export type ProjectNode =
    | { kind: 'active' }
    | { kind: 'project'; row: ProjectRow }
    | { kind: 'group'; label: string; statuses: ProjectStatus[] }
    | { kind: 'sessions-root'; row: ProjectRow }
    | { kind: 'session'; session: SessionInfo }
    | { kind: 'docs'; row: ProjectRow }
    | { kind: 'unassigned' }
    | { kind: 'empty' };

/** How many sessions a project shows before the page takes over. */
const RECENT_MAX = 5;

const money = (n: number): string => `$${(n || 0).toFixed(2)}`;

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | ProjectNode | ProjectNode[] | null | undefined>;

    constructor(private deps: ProjectsTreeDeps) { }

    refresh(): void { this.emitter.fire(); }

    /** The rows that head the tree: everything except the parts, which are shown
     *  under their own parent. A part whose parent is not here is one of them. */
    private rootRows(rows: ProjectRow[]): ProjectRow[] {
        const present = new Set(rows.map(r => r.project.id));
        return rows.filter(r => !r.project.parentId || !present.has(r.project.parentId));
    }

    private partsOf(rows: ProjectRow[], id: string): ProjectRow[] {
        return rows.filter(r => r.project.parentId === id && r.project.id !== id);
    }

    /** Each parent's parts, folded by the one implementation of that sum
     *  (`core/projects.partsTotals`) — the page prints the same figure and the
     *  two must not be able to drift. */
    private parts(rows: ProjectRow[]): Record<string, PartsTotal> {
        return partsTotals(rows.map(r => r.project), rows.map(r => ({
            id: r.project.id, name: r.project.name, sessions: r.sessions,
            cost: r.cost, tokens: 0, todayCost: r.todayCost, agents: [], lastTs: r.lastTs
        })));
    }

    getChildren(node?: ProjectNode): ProjectNode[] {
        if (!node) {
            const rows = this.rootRows(this.deps.rows());
            const open = rows.filter(r => !CLOSED_STATUSES.includes(r.project.status) && r.project.status !== 'paused' && r.project.status !== 'planned');
            const out: ProjectNode[] = [{ kind: 'active' }];
            out.push(...open.map(row => ({ kind: 'project', row } as ProjectNode)));
            if (!rows.length) { out.push({ kind: 'empty' }); }
            if (rows.some(r => r.project.status === 'paused' || r.project.status === 'planned')) {
                out.push({ kind: 'group', label: 'On hold', statuses: ['paused', 'planned'] });
            }
            if (rows.some(r => CLOSED_STATUSES.includes(r.project.status))) {
                out.push({ kind: 'group', label: 'Finished', statuses: [...CLOSED_STATUSES] });
            }
            out.push({ kind: 'unassigned' });
            return out;
        }
        if (node.kind === 'group') {
            return this.rootRows(this.deps.rows())
                .filter(r => node.statuses.includes(r.project.status))
                .map(row => ({ kind: 'project', row }));
        }
        if (node.kind === 'project') {
            // the parts come FIRST: they are other projects, and burying them
            // under this project's own sessions reads as if they were part of
            // its transcript list rather than work of their own
            const kids: ProjectNode[] = this.partsOf(this.deps.rows(), node.row.project.id)
                .map(row => ({ kind: 'project', row } as ProjectNode));
            kids.push({ kind: 'sessions-root', row: node.row });
            if (node.row.project.folder) { kids.push({ kind: 'docs', row: node.row }); }
            return kids;
        }
        if (node.kind === 'sessions-root') {
            const list = this.deps.sessionsFor(node.row.project.id, RECENT_MAX);
            return list.length ? list.map(session => ({ kind: 'session', session } as ProjectNode)) : [{ kind: 'empty' }];
        }
        return [];
    }

    getTreeItem(node: ProjectNode): vscode.TreeItem {
        const C = vscode.TreeItemCollapsibleState;

        if (node.kind === 'active') {
            const id = this.deps.activeId();
            const row = this.deps.rows().find(r => r.project.id === id);
            const item = new vscode.TreeItem(
                row ? `Active: ${row.project.name}` : 'No active project', C.None);
            item.iconPath = new vscode.ThemeIcon(row ? 'circle-filled' : 'circle-outline');
            item.description = row
                ? 'sessions started here are filed under it'
                : 'pick one and sessions get filed under it';
            item.tooltip = new vscode.MarkdownString(
                'The **active project** of this window. While one is set, every session you ' +
                'start here — in the Console or in a terminal — is filed under it as soon as ' +
                'it reports its id: visibly, and reversibly from any session row.\n\n' +
                'A session you already filed by hand is never re-stamped, and neither is one ' +
                'you took off every project.');
            item.command = { command: 'agentfarm.setActiveProject', title: 'Set active project' };
            item.contextValue = 'afActiveProject';
            return item;
        }

        if (node.kind === 'group') {
            const item = new vscode.TreeItem(node.label, C.Collapsed);
            item.iconPath = new vscode.ThemeIcon('folder-library');
            item.contextValue = 'afProjectGroup';
            return item;
        }

        if (node.kind === 'project') {
            const p = node.row.project;
            const rows = this.deps.rows();
            const parts = this.parts(rows)[p.id];
            const isPart = !!p.parentId && rows.some(r => r.project.id === p.parentId);
            const item = new vscode.TreeItem(`${p.icon ? p.icon + ' ' : ''}${p.name}`, C.Collapsed);
            const bits = [`${node.row.sessions} sessions`, money(node.row.cost)];
            if (node.row.todayCost > 0) { bits.push(`${money(node.row.todayCost)} today`); }
            // ‼️ the parts' figures ride ALONGSIDE, never inside: the parent's own
            // number has to keep adding up against every other surface
            if (parts) { bits.push(`+${money(parts.cost)} in ${parts.n}`); }
            // a part is placed by its PARENT, so its own status is not implied by
            // where it sits — an archived part under an active parent looks alive
            if (isPart && p.status !== 'active') { bits.push(p.status); }
            if (node.row.lastTs) { bits.push(relTime(node.row.lastTs)); }
            item.description = (node.row.warnings.length ? '⚠️ ' : '') + bits.join(' · ');
            item.iconPath = new vscode.ThemeIcon(
                p.id === this.deps.activeId() ? 'circle-filled' : (isPart ? 'symbol-namespace' : 'project'));
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**${p.name}** — ${p.status}\n\n`);
            if (p.summary) { md.appendMarkdown(`${p.summary}\n\n`); }
            md.appendMarkdown(`${node.row.sessions} sessions · ${money(node.row.cost)} total\n\n`);
            if (parts) {
                md.appendMarkdown(`Its ${parts.n} part(s) add ${parts.sessions} sessions and `
                    + `${money(parts.cost)} — counted on their own rows, never in this one.\n\n`);
            }
            if (isPart) {
                const parent = rows.find(r => r.project.id === p.parentId);
                if (parent) { md.appendMarkdown(`Part of **${parent.project.name}**\n\n`); }
            }
            if (p.folder) { md.appendMarkdown(`\`${p.folder}\`\n\n`); }
            for (const w of node.row.warnings) { md.appendMarkdown(`- ⚠️ ${w}\n`); }
            item.tooltip = md;
            item.command = {
                command: 'agentfarm.openProject', title: 'Open project', arguments: [{ id: p.id }]
            };
            item.contextValue = 'afProject';
            return item;
        }

        if (node.kind === 'sessions-root') {
            const item = new vscode.TreeItem('Recent sessions', C.Collapsed);
            item.iconPath = new vscode.ThemeIcon('comment-discussion');
            item.description = `${node.row.sessions} total`;
            item.contextValue = 'afProjectSessions';
            return item;
        }

        if (node.kind === 'session') {
            const s = node.session;
            const item = new vscode.TreeItem(s.title || '(untitled session)', C.None);
            item.description = `${s.agentName ?? ''} · ${relTime(s.lastTs || s.mtime)}`;
            item.iconPath = new vscode.ThemeIcon('comment');
            item.tooltip = `${s.title}\n${s.cwd ?? ''}`;
            item.command = {
                command: 'agentfarm.openSession', title: 'Open transcript', arguments: [s]
            };
            // the shared session contract, so the tree row offers the same menu
            // every other surface does
            item.contextValue = 'session';
            return item;
        }

        if (node.kind === 'docs') {
            const item = new vscode.TreeItem('Documents', C.None);
            item.iconPath = new vscode.ThemeIcon(node.row.folderOk ? 'folder-opened' : 'warning');
            item.description = node.row.folderOk ? '' : 'folder not found';
            item.tooltip = node.row.project.folder;
            item.command = {
                command: 'agentfarm.openProject', title: 'Open project',
                arguments: [{ id: node.row.project.id }]
            };
            item.contextValue = 'afProjectDocs';
            return item;
        }

        if (node.kind === 'unassigned') {
            const u = this.deps.unassigned();
            const item = new vscode.TreeItem('Unassigned', C.None);
            item.iconPath = new vscode.ThemeIcon('circle-slash');
            item.description = u.sessions
                ? `${u.sessions} sessions · ${money(u.cost)}`
                : 'nothing left over';
            item.tooltip = new vscode.MarkdownString(
                'Sessions no project claims. Right-click any session row — anywhere in ' +
                'Agent Farm — to put it on a project, take it off one, or move it.');
            item.command = { command: 'agentfarm.openProjects', title: 'Open projects' };
            item.contextValue = 'afUnassigned';
            return item;
        }

        const item = new vscode.TreeItem('Nothing here yet', C.None);
        item.description = 'create a project to start grouping work';
        item.command = { command: 'agentfarm.newProject', title: 'New project' };
        return item;
    }
}
