import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {ACTIVE_GAMES,PUBLIC_ENTRIES,copyReleasePublic,auditReleaseDist,cleanReleaseCss,cleanReleaseHtml} from '../scripts/release-package.mjs';

async function fixture(){
  const root=await mkdtemp(resolve(tmpdir(),'fw-release-policy-')),source=resolve(root,'source'),dist=resolve(root,'dist');
  const put=async(path,value='asset')=>{const target=resolve(source,'public',path);await mkdir(dirname(target),{recursive:true});await writeFile(target,value);};
  for(const entry of PUBLIC_ENTRIES){
    if(entry==='emoji'||entry==='membership-badges')await put(entry+'/sample.svg','<svg/>');
    else if(ACTIVE_GAMES.some(game=>entry==='games/'+game))await put(entry+'/index.html','<!doctype html><body>active game</body>');
    else await put(entry);
  }
  await put('games/nes/roms/contra-infinite-spread.nes',Buffer.concat([Buffer.from([78,69,83,26]),Buffer.alloc(160,7)]));
  await put('emulatorjs/core.wasm',Buffer.from([0,97,115,109,1,0,0,0]));
  await put('games/snake/index.html','retired snake');
  await put('games/catch/index.html','retired catch');
  await put('news.html','retired news');
  await put('hero-office.webp','retired hero');
  await put('mascot-fufu-seated.webp','retired mascot');
  await put('nav-icons/news.svg','retired icon');
  await put('ui-icons.svg','<svg><symbol id="face"></symbol><symbol id="sun"></symbol></svg>');
  await put('brand-theme.css','.weather-card,.home-tool-card{color:red}.nav-icon-news{display:block}');
  await put('games/THIRD_PARTY_NOTICES.txt','1. 2048\nMIT License\n4. EmulatorJS 4.2.3\nGPL\n5. FCEUmm EmulatorJS Core 4.2.3\nGPL\n反应测试为本地小游戏。');
  await mkdir(dist,{recursive:true});
  await writeFile(resolve(dist,'index.html'),'<!doctype html><body>active app</body>');
  await copyReleasePublic(source,dist);
  return{source,dist,put};
}
const absent=async path=>{await assert.rejects(access(path));};

test('release copies active assets while archived ROM, emulator and retired resources remain intact in source',async()=>{
  const {source,dist}=await fixture();
  const rom=resolve(source,'public/games/nes/roms/contra-infinite-spread.nes'),before=await readFile(rom);
  const report=await auditReleaseDist(dist,{sourceDir:source});
  assert.deepEqual(report.activeGames,['2048','minesweeper','sudoku','reaction']);
  assert.ok(report.archivedSourceRomSha256);assert.deepEqual(await readFile(rom),before);
  for(const path of ['games/nes','emulatorjs','games/snake','games/catch','news.html','hero-office.webp','mascot-fufu-seated.webp','nav-icons/news.svg'])await absent(resolve(dist,path));
  assert.match(await readFile(resolve(dist,'ui-icons.svg'),'utf8'),/id="face"/);
  assert.doesNotMatch(await readFile(resolve(dist,'ui-icons.svg'),'utf8'),/id="sun"/);
  const notices=await readFile(resolve(dist,'games/THIRD_PARTY_NOTICES.txt'),'utf8');
  assert.match(notices,/MIT License/);assert.doesNotMatch(notices,/EmulatorJS|FCEUmm|GPL/);
});

test('release audit rejects renamed ROM and emulator binaries even under a permitted asset path',async()=>{
  const {dist}=await fixture();await mkdir(resolve(dist,'assets'),{recursive:true});
  const file=resolve(dist,'assets/picture.bin');
  for(const payload of [Buffer.from([78,69,83,26,0]),Buffer.from([0,97,115,109,0])]){
    await writeFile(file,payload);
    await assert.rejects(auditReleaseDist(dist),/ROM or emulator binary/);
  }
  await unlink(file);
});

test('release audit rejects archived player references and unexpected legacy pages',async()=>{
  const {dist}=await fixture();await mkdir(resolve(dist,'assets'),{recursive:true});
  const script=resolve(dist,'assets/main.js');await writeFile(script,'const player="nes-player.html";');
  await assert.rejects(auditReleaseDist(dist),/Archived feature content/);
  await unlink(script);await writeFile(resolve(dist,'news.html'),'old news');
  await assert.rejects(auditReleaseDist(dist),/Unapproved release resource|Retired page/);
});

test('release audit rejects an inline encoding of the archived ROM',async()=>{
  const {source,dist}=await fixture();await mkdir(resolve(dist,'assets'),{recursive:true});
  const rom=await readFile(resolve(source,'public/games/nes/roms/contra-infinite-spread.nes'));
  await writeFile(resolve(dist,'assets/main.js'),'const bytes="'+rom.toString('base64')+'";');
  await assert.rejects(auditReleaseDist(dist,{sourceDir:source}),/Archived feature content/);
});

test('retired decorations are removed without deleting active shared styles or surrounding markup',()=>{
  const html='<main><div class="hero-visual"><span>old</span><div><div>nested</div></div></div><section>active</section></main><!-- 魂斗罗 ROM 归档 -->';
  assert.equal(cleanReleaseHtml(html),'<main><section>active</section></main>');
  assert.equal(cleanReleaseCss('.weather-card,.home-tool-card{color:red}.nav-icon-news{display:block}'),'.home-tool-card{color:red}');
});
