import {createHash} from 'node:crypto';
import {mkdir,readdir,lstat,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep,extname} from 'node:path';

export const ACTIVE_GAMES=Object.freeze(['2048','minesweeper','sudoku','reaction']);
const appIcons=['folder','document','computer','drive','image','archive','text','printer','network'];
const navIcons=['home','brain','discussion','chatrooms','game','buddy','archive','settings','info','notice'];
export const PUBLIC_ENTRIES=Object.freeze([
  'brand-theme.css','chat-rooms.css','fw-client-logo.png','game-center.css','game-party.css',
  'hero-fufu-office-banner.webp','mascot-fufu.webp','membership-experience.css',
  'private-chat.css','site-content.css','ui-icons.svg',
  'emoji','membership-badges','third-party-licenses/pinyin-pro.txt',
  ...appIcons.map(name=>'app-icons/'+name+'.png'),
  ...navIcons.map(name=>'nav-icons/'+name+'.svg'),
  ...ACTIVE_GAMES.map(name=>'games/'+name),'games/THIRD_PARTY_NOTICES.txt'
]);
export const SOURCE_ONLY_PREFIXES=Object.freeze([
  'emulatorjs','games/nes','games/snake','games/catch','app','web','web-client',
  'admin-desktop','src','tests','node_modules'
]);
const blockedExtensions=new Set(['.nes','.fds','.unf','.unif','.wasm','.7z','.zip','.map','.scss']);
const retiredSelector=/\.(?:weather(?:-[\w-]+)?|nav-icon-(?:news|echo)|game-card-nes|hero-(?:visual|halo|ground|character(?:-motion)?|mascot|note)|mascot-status|note-(?:day|poll|lie|open|news))(?=[^\w-]|$)/;
const textExtensions=new Set(['.html','.js','.css','.json','.svg','.txt','.webmanifest']);
const forbiddenContent=/(?:contra-infinite-spread|nes-player\.html|__FW_NES_PROGRESS__|EJS_core|EmulatorJS|fceumm|mascot-fufu-seated\.webp|hero-office\.webp|nav-icon-news|nav-icon-echo|weather-card)/i;
const portable=path=>path.split(sep).join('/');
const within=(root,path)=>{const rel=relative(resolve(root),resolve(path));if(rel.startsWith('..'+sep)||rel==='..'||resolve(root)===resolve(path)||rel.startsWith(sep))throw new Error('Path outside build directory: '+path);return rel;};
const allowedPublic=path=>PUBLIC_ENTRIES.some(entry=>path===entry||path.startsWith(entry+'/'));
const blockedPath=path=>SOURCE_ONLY_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'))||blockedExtensions.has(extname(path).toLowerCase());

export function cleanReleaseCss(css){
  return css.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector,body)=>{
    if(!retiredSelector.test(selector)||selector.trimStart().startsWith('@'))return rule;
    const selectors=selector.split(',').filter(item=>!retiredSelector.test(item));
    return selectors.length?selectors.join(',')+'{'+body+'}':'';
  });
}
export function cleanReleaseHtml(html){
  const start=html.indexOf('<div class="hero-visual"');
  if(start>=0){
    const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,end=-1,match;
    while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0){end=tags.lastIndex;break;}}
    if(end<0)throw new Error('Unclosed archived hero visual');
    html=html.slice(0,start)+html.slice(end);
  }
  return html.replace(/<!--[^]*?-->/g,comment=>/魂斗罗|ROM/.test(comment)?'':comment).replace('NES 播放器使用 EmulatorJS 与 FCEUmm；','');
}
function cleanPublicText(path,text){
  if(path.endsWith('.css'))return cleanReleaseCss(text);
  if(path==='ui-icons.svg')return text.replace(/\s*<symbol\b[^]*?<\/symbol>/g,node=>/\bid="(?:sun|partly-cloudy|cloud|rain|storm|snow|fog|temperature|game-snake|game-catch)"/.test(node)?'':node);
  if(path==='games/THIRD_PARTY_NOTICES.txt')return text.replace(/\n4\. EmulatorJS[^]*?(?=\n反应测试)/,'\n');
  return text;
}
export async function copyReleasePublic(sourceDir,distDir){
  const publicDir=resolve(sourceDir,'public');
  async function copy(path){
    if(blockedPath(path))return;
    const from=resolve(publicDir,path),to=resolve(distDir,path);within(publicDir,from);within(distDir,to);
    const info=await lstat(from);
    if(info.isSymbolicLink())throw new Error('Symlink not permitted in release assets: '+path);
    if(info.isDirectory()){
      await mkdir(to,{recursive:true});
      for(const name of await readdir(from))await copy(path+'/'+name);
    }else{
      await mkdir(dirname(to),{recursive:true});
      let bytes=await readFile(from);
      if(textExtensions.has(extname(path)))bytes=Buffer.from(cleanPublicText(path,bytes.toString('utf8')));
      await writeFile(to,bytes);
    }
  }
  for(const path of PUBLIC_ENTRIES)await copy(path);
}
export async function auditReleaseDist(distDir,{sourceDir}={}){
  const files=[];
  const sourceRom=sourceDir?await readFile(resolve(sourceDir,'public/games/nes/roms/contra-infinite-spread.nes')):null;
  const romHash=sourceRom?createHash('sha256').update(sourceRom).digest('hex'):null;
  const encodedRom=sourceRom?.subarray(0,120).toString('base64');
  async function visit(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const absolute=resolve(dir,entry.name),path=portable(within(distDir,absolute));
      if(entry.isSymbolicLink())throw new Error('Release symlink: '+path);
      if(blockedPath(path))throw new Error('Source-only resource in release: '+path);
      if(entry.isDirectory()){await visit(absolute);continue;}
      if(path!=='index.html'&&!path.startsWith('assets/')&&!allowedPublic(path))throw new Error('Unapproved release resource: '+path);
      if(path.endsWith('.html')&&path!=='index.html'&&!ACTIVE_GAMES.some(game=>path==='games/'+game+'/index.html'))throw new Error('Retired page in release: '+path);
      const bytes=await readFile(absolute),hash=createHash('sha256').update(bytes).digest('hex');
      if((bytes[0]===78&&bytes[1]===69&&bytes[2]===83&&bytes[3]===26)||(bytes[0]===0&&bytes[1]===97&&bytes[2]===115&&bytes[3]===109)||hash===romHash)throw new Error('ROM or emulator binary in release: '+path);
      if(textExtensions.has(extname(path))){
        const text=bytes.toString('utf8');
        const archived=forbiddenContent.exec(text);
        if(archived||(encodedRom&&text.includes(encodedRom)))throw new Error('Archived feature content in release: '+path+' ('+(archived?.[0]||'encoded ROM')+')');
      }
      files.push({path,bytes:bytes.length,sha256:hash});
    }
  }
  await visit(resolve(distDir));
  for(const path of ['index.html',...ACTIVE_GAMES.map(game=>'games/'+game+'/index.html')]){
    if(!files.some(file=>file.path===path))throw new Error('Missing active release page: '+path);
  }
  return{schemaVersion:1,activeGames:[...ACTIVE_GAMES],fileCount:files.length,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),archivedSourceRomSha256:romHash,excludedSourcePrefixes:[...SOURCE_ONLY_PREFIXES],files:files.sort((a,b)=>a.path.localeCompare(b.path))};
}
export function releasePackagePlugin(sourceDir){
  let distDir;
  return{
    name:'fw-active-resources-only',apply:'build',enforce:'pre',
    configResolved(config){distDir=resolve(config.root,config.build.outDir);},
    resolveId(source,importer){if(source==='./nes-games.js'&&importer?.replaceAll('\\','/').endsWith('/src/game-center.js'))return '\0fw-release-games';},
    load(id){if(id==='\0fw-release-games')return 'export const NES_GAMES={};';},
    transform(code,id){if(id.replaceAll('\\','/').endsWith('/styles.css'))return{code:cleanReleaseCss(code),map:null};},
    transformIndexHtml:{order:'pre',handler:cleanReleaseHtml},
    async writeBundle(){
      await copyReleasePublic(sourceDir,distDir);
      const report=await auditReleaseDist(distDir,{sourceDir});
      await mkdir(resolve(sourceDir,'.cache'),{recursive:true});
      await writeFile(resolve(sourceDir,'.cache/release-package-audit.json'),JSON.stringify(report,null,2)+'\n');
      console.log('[release audit] '+report.fileCount+' files; active games: '+report.activeGames.join(', ')+'; no ROM, NES player, emulator or retired pages.');
    }
  };
}
