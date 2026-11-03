import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['tests/tour-navigation-browser.cjs'],{stdio:'inherit',env:{...process.env,QURAN_TOUR_QA_ONLY:'1'}});
if(result.error)throw result.error;
process.exit(result.status??1);
