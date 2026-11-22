import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { privateRoot } from './feature-postgres-local.mjs';
const exec = promisify(execFile);
// Supabase CLI creates a short-lived login role using its existing signed-in
// credentials. Never put the generated password in argv, stdout or Git.
export async function remoteConnection() {
  process.loadEnvFile('.env.local');
  const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
  if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${ref}.supabase.co`)throw Error('Linked project differs from application');
  const cli = process.env.SUPABASE_CLI_EXE ?? 'D:/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
  let response;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      response=await exec(cli, ['db','dump','--linked','--dry-run','--schema','public'], { windowsHide:true,timeout:60_000,maxBuffer:4*1024*1024 });
      break;
    } catch(error) {
      fs.writeFileSync(path.join(privateRoot,'connection-error.private.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));
      if(attempt<2&&/TransportError|NetworkError|ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(String(error.stdout)+String(error.message))) {
        await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
        continue;
      }
      throw Error('Temporary Supabase login failed; inspect the private connection log');
    }
  }
  const {stdout,stderr}=response;
  fs.writeFileSync(path.join(privateRoot,'connection-refresh.private.log'),stderr);
  const env={...process.env,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'};
  for (const match of stdout.matchAll(/^export (PG[A-Z]+)=(.+)$/gm)) {
    let value=match[2].trim();
    if ((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    env[match[1]]=value;
  }
  if (!env.PGHOST||!env.PGPASSWORD||!env.PGUSER) throw Error('Incomplete temporary PostgreSQL login');
  return env;
}
