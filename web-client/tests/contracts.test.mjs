import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),site=resolve(root,'.site');
test('deployment routes reference complete built assets',()=>{
 for(const name of ['index','square','rooms','chatrooms','play','games','buddy','membership','shop','archive','settings','activities','announcements','rules','moderation']){
  const html=readFileSync(resolve(site,name+'.html'),'utf8');
  assert.match(html,/\/web\/assets\//);assert.doesNotMatch(html,/assets\/app\.js|\/src\/app\.js|data-game-open="contra"/);
  for(const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
   const url=match[1];if(url.endsWith('.exe')&&process.env.FW_WEB_QA_SKIP_DOWNLOADS==='1')continue;
   assert(existsSync(resolve(site,'.'+url)),name+' missing '+url);
  }
 }
 assert(existsSync(resolve(site,'app/index.html')));assert(existsSync(resolve(site,'privacy.html')));
 assert(!existsSync(resolve(site,'web/emulatorjs')));assert(!existsSync(resolve(site,'web/games/nes')));
});
