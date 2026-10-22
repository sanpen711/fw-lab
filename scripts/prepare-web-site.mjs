import {cp,mkdir,readFile,readdir,rm,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'.site');
await rm(site,{recursive:true,force:true});await mkdir(site,{recursive:true});
for(const file of await readdir(root)){if(/\.(?:html|json|webmanifest|xml|txt|ico)$/.test(file)&&!/^package/.test(file)||['CNAME','.nojekyll','service-worker.js'].includes(file))await cp(resolve(root,file),resolve(site,file));}
for(const folder of ['assets','app','download']){if(folder==='download'&&process.env.FW_WEB_QA_SKIP_DOWNLOADS==='1'&&!await stat(resolve(root,folder)).catch(()=>null))continue;await cp(resolve(root,folder),resolve(site,folder),{recursive:true});}
await cp(resolve(root,'desktop-v11/public'),resolve(site,'desktop-v11/public'),{recursive:true});
await cp(resolve(root,'web-client/dist'),resolve(site,'web'),{recursive:true});
const html=await readFile(resolve(root,'web-client/dist/index.html'),'utf8');
for(const page of ['index','square','rooms','bird','chatrooms','play','games','buddy','echo','compose','membership','shop','archive','settings','activities','announcements','rules','moderation'])await writeFile(resolve(site,page+'.html'),html);
const desktopVersion=(await readFile(resolve(root,'desktop-v11/src/config.js'),'utf8')).match(/APP_VERSION = '([^']+)'/)[1];
await writeFile(resolve(site,'web/version.json'),JSON.stringify({version:'2026.10.22',desktopParity:desktopVersion,guestBrowsing:true,commit:process.env.GITHUB_SHA||''}));
console.log('Browser site prepared in .site');
