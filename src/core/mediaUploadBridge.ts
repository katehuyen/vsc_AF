/**
 * M-41 — the bridge's door to the media upload: a file on this computer onto
 * fal's or Replicate's storage, by the same code a media step uses (one upload
 * per content; the cache answers a second call with the same URL).
 */
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { UPLOAD_PROVIDERS, UploadDone, UploadProvider } from './mediaUpload';

export interface MediaUploadBridgeDeps {
    upload(file: string, provider?: UploadProvider): Promise<UploadDone>;
}

export function registerMediaUploadOps(bridge: BridgeRegistry, deps: MediaUploadBridgeDeps): void {
    bridge.register([
        {
            op: 'media.upload',
            describe: 'Upload a file on this computer to a media provider\'s storage and get the https URL a model can read — what a media step does by itself for a local path in its input. args: path, provider? (fal|replicate; default = Farm Settings "Upload local files to", else fal). The same content is uploaded once: a second call answers cached:true with the same URL until it expires. Uses the provider key the media step uses; answers {url, provider, cached, hash, expiresAt?}.',
            handler: async (args) => {
                const file = argStr(args, 'path');
                const p = optStr(args, 'provider');
                need(!p || (UPLOAD_PROVIDERS as readonly string[]).includes(p), `provider is one of ${UPLOAD_PROVIDERS.join(', ')}.`);
                const r = await deps.upload(file, (p || undefined) as UploadProvider | undefined);
                return { url: r.url, provider: r.provider, cached: r.cached, hash: r.hash, path: r.path, ...(r.expiresAt ? { expiresAt: new Date(r.expiresAt).toISOString() } : {}) };
            }
        }
    ]);
}
