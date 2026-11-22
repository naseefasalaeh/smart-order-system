// sql() only targets disposable loopback PostgreSQL. Remote callers of native()
// must pass an explicit environment from the separate guarded connection helper.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const privateRoot = path.resolve('.test-artifacts/ready-members-live');
export const pgBin = path.resolve('.test-artifacts/pg-tools/native/pgsql/bin');
const exec = promisify(execFile);
export function localEnv() {
  return { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'postgres', PGDATABASE: 'postgres',
    PGPASSWORD: fs.readFileSync(path.join(privateRoot, 'local-password.private.txt'), 'utf8').trim(), PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10' };
}
export async function native(program, args, options = {}) {
  return exec(path.join(pgBin, `${program}.exe`), args, { windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options, env: options.env ?? localEnv() });
}
export async function sql(database, statement) {
  const { stdout } = await native('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c', statement]);
  return stdout.trim();
}
export function state() { return JSON.parse(fs.readFileSync(path.join(privateRoot, 'local-state.private.json'), 'utf8')); }

if (process.argv[1]?.replaceAll('\\','/').endsWith('/feature-postgres-local.mjs')) {
  const mode = process.argv[2];
  if (mode !== 'restore') throw Error('Supported mode: restore');
  const label=process.argv[3];
  if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid backup label');
  const backupRoot=path.join(privateRoot,label??'.');
  let roles = fs.readFileSync(path.join(backupRoot, 'roles-no-passwords.sql'), 'utf8');
  // Preserve the disposable cluster owner. Hosted postgres is not a superuser.
  roles = roles.split(/\r?\n/).filter(line => !/^(CREATE|ALTER) ROLE "?postgres"?\s/.test(line)).join('\n');
  // The standalone cluster has a different bootstrap grantor. Preserve role
  // membership options, while attributing grants to the local cluster owner.
  // The original role dump remains unchanged for a hosted recovery.
  roles = roles.replace(/ GRANTED BY "?[a-zA-Z0-9_]+"?(?=;)/g, '');
  const existing = (await sql('postgres', "select rolname from pg_roles")).split(/\r?\n/);
  roles = roles.split('\n').filter(line => {
    const match = line.match(/^CREATE ROLE "?([a-zA-Z0-9_]+)"?;/);
    return !match || !existing.includes(match[1]);
  }).join('\n');
  fs.writeFileSync(path.join(privateRoot, 'local-roles.private.sql'), roles);
  await native('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(privateRoot, 'local-roles.private.sql')]);
  const database = `feature_restore_${Date.now()}`;
  await sql('postgres', `create database "${database}"`);
  await sql(database, 'drop schema public;'); // Empty default schema in this newly created local database only.
  await sql(database, 'create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;');
  try {
    await native('pg_restore', ['--exit-on-error', '--dbname', database, path.join(backupRoot, 'related-database.dump')]);
  } catch (error) {
    fs.writeFileSync(path.join(privateRoot, 'restore-error.private.log'), error.stderr ?? error.message);
    throw Error('Restore failed; inspect private restore log');
  }
  fs.writeFileSync(path.join(privateRoot, 'local-state.private.json'), JSON.stringify({ database, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ restored: true, database, version: await sql(database, 'show server_version') }));
}
