/**
 * The farm's identity: an id minted once per install and kept in the remote
 * storage dir (a phone pins its pairing to it, and signs it into every hello),
 * with the display name the caller gives each time — a renamed machine keeps
 * its paired phones.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FarmIdentity } from '../port';

const FILE = 'farm.json';

export function farmIdentity(dir: string, name: string): FarmIdentity {
    const file = path.join(dir, FILE);
    try {
        const id = JSON.parse(fs.readFileSync(file, 'utf8'))?.id;
        if (typeof id === 'string' && /^farm_[0-9a-f]{12}$/.test(id)) { return { id, name }; }
    } catch { /* first start, or unreadable: mint below */ }
    const id = 'farm_' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ id }), 'utf8');
    return { id, name };
}
