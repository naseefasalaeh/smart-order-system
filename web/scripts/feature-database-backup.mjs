// Native PostgreSQL logical backup. Connection material and data stay outside Git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { remoteConnection } from './feature-remote-connection.mjs';

process.loadEnvFile('.env.local');
const label = process.argv[2];
if (label && !/^[a-z0-9-]+$/.test(label)) throw Error('Invalid backup label');
const root = path.resolve('.test-artifacts/ready-members-live', label ?? '.');
fs.mkdirSync(root, { recursive: true });
const bin = path.resolve('.test-artifacts/pg-tools/native/pgsql/bin');
if (fs.existsSync(path.join(root, 'related-database.dump'))) throw Error('Refusing to overwrite existing backup');
const env = await remoteConnection();
const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`) throw Error('Linked project differs from application');
function run(program, args, out) {
  const output = fs.openSync(path.join(root, out), 'w');
  const error = fs.openSync(path.join(root, `${program}.private.log`), 'a');
  try { execFileSync(path.join(bin, `${program}.exe`), args, { env, windowsHide: true, stdio: ['ignore', output, error], timeout: 180_000 }); }
  catch { throw Error(`${program} failed; inspect its private log outside Git`); }
  finally { fs.closeSync(output); fs.closeSync(error); }
}
run('pg_dump', ['--format=custom', '--role=postgres', '--schema=public', '--schema=auth', '--schema=catalog_backup', '--schema=supabase_migrations', `--file=${path.join(root, 'related-database.dump')}`], 'dump.stdout.private.log');
run('pg_dumpall', ['--roles-only', '--no-role-passwords', '--role=postgres'], 'roles-no-passwords.sql');
run('pg_restore', ['--list', path.join(root, 'related-database.dump')], 'archive-list.private.txt');
const names = ['related-database.dump', 'roles-no-passwords.sql', 'archive-list.private.txt'];
const manifest = {
  at: new Date().toISOString(),
  scope: 'Logical backup: public, auth, catalog_backup, supabase_migrations and roles without passwords. Not a full-instance backup. Storage files, platform configuration and cron extension state are excluded.',
  files: Object.fromEntries(names.map(name => {
    const data = fs.readFileSync(path.join(root, name));
    return [name, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }];
  })),
};
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ backupCreated: true, files: manifest.files }));
