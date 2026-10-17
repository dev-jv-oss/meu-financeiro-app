/** Input normalized JSON only. Prints review proposal; no network and no D1 writes. */
import {readFileSync} from 'node:fs';
import {migrationDryRun} from '../reconciliation.mjs';
if(!process.argv[2])throw Error('Uso: node tools/migration-dry-run.mjs arquivo-normalizado.json');
console.log(JSON.stringify(migrationDryRun(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
