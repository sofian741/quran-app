import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const cache=path.resolve(process.env.QVP_CACHE_DIR||root+'/.cache/qvp');
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const result=spawnSync(python,[root+'/scripts/qvp/fetch-assets.py','--cache',cache],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
await import('./prepare.mjs');
// Also make the existing offline tafsir available in a source checkout.
const {copyFile}=await import('node:fs/promises');
await copyFile(root+'/scripts/tafsir_muyassar.json',root+'/data/tafsir_muyassar.json');
