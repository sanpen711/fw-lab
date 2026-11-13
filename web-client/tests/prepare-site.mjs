import {cp,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// The public deployment serves the static download site. Browser QA still
// exercises the interactive client and its legacy entry points in isolation.
const root=resolve(import.meta.dirname,'../..');
const site=resolve(root,'.site');
await cp(resolve(root,'web-client/dist'),resolve(site,'web'),{recursive:true});
const shell=await readFile(resolve(site,'web/index.html'),'utf8');
const routes=['index','square','rooms','chatrooms','play','games','buddy','membership','shop',
  'archive','settings','activities','announcements','rules','moderation','compose','bird','echo','admin'];
await Promise.all(routes.map(route=>writeFile(resolve(site,`${route}.html`),shell)));
await cp(resolve(root,'app'),resolve(site,'app'),{recursive:true});
