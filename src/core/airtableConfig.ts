import * as vscode from 'vscode';
import { EngineConfig, DEFAULT_CONFIG, EngineRegistry } from '../mcp/airtable/engine';
import { expandEnvPath } from './util';

/**
 * Host-side glue for the Airtable engine module. Reads the agentFarm.airtable.*
 * settings into the EngineConfig shape the shared engine client (src/mcp/airtable)
 * understands, and hands back a ready EngineRegistry for bridge ops and ingest
 * linking. Machine-specific paths live in settings (not code) so the module is
 * portable — installing the VSIX on another machine only needs its paths set.
 */

export function airtableSettings(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('agentFarm.airtable');
}

export function airtableEnabled(): boolean { return airtableSettings().get<boolean>('enabled', false); }
export function airtableAutoRecord(): boolean { return airtableSettings().get<boolean>('autoRecord', false); }

function expandList(arr: string[] | undefined): string[] {
    return (arr ?? []).map((s) => expandEnvPath(String(s).trim())).filter(Boolean);
}

export function airtableConfigFromSettings(): EngineConfig {
    const c = airtableSettings();
    return {
        roots: expandList(c.get<string[]>('roots', DEFAULT_CONFIG.roots)),
        instances: c.get<EngineConfig['instances']>('instances', []),
        defaultInstance: c.get<string>('defaultInstance', DEFAULT_CONFIG.defaultInstance),
        defaultLang: c.get<string>('defaultLang', DEFAULT_CONFIG.defaultLang),
        host: c.get<string>('host', DEFAULT_CONFIG.host),
        mediaRoots: expandList(c.get<string[]>('mediaRoots', DEFAULT_CONFIG.mediaRoots)),
        requestTimeoutMs: c.get<number>('requestTimeoutMs', DEFAULT_CONFIG.requestTimeoutMs),
    };
}

/** A fresh registry built from the current settings (discovery is cheap). */
export function newAirtableRegistry(): EngineRegistry {
    return new EngineRegistry(airtableConfigFromSettings());
}
