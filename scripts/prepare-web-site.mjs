import {cp,mkdir,readdir,rm,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'.site');
await rm(site,{recursive:true,force:true});
await cp(resolve(root,'official-site'),site,{recursive:true});
// Retain download/update resources and assets required by installed clients.
for(const folder of ['assets','download','desktop-v11/public']){
  if(await stat(resolve(root,folder)).catch(()=>null)) await cp(resolve(root,folder),resolve(site,folder),{recursive:true});
}
// Official artwork wins over any same-name legacy asset.
await cp(resolve(root,'official-site/assets'),resolve(site,'assets'),{recursive:true});
for(const file of ['CNAME','.nojekyll','admin.html','practice-1022-b7d9e4.html']){
  if(await stat(resolve(root,file)).catch(()=>null)) await cp(resolve(root,file),resolve(site,file));
}
const redirect='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/"><title>FW研究所官网</title><script>location.replace("/")</script><a href="/">前往 FW研究所官网</a></html>';
for(const file of await readdir(root)){
  if(file.endsWith('.html')&&!['index.html','privacy.html','admin.html','practice-1022-b7d9e4.html'].includes(file)) await writeFile(resolve(site,file),redirect);
}
for(const folder of ['app','web']){
  await mkdir(resolve(site,folder),{recursive:true});
  await writeFile(resolve(site,folder,'index.html'),redirect);
}
// Retire the old PWA worker and its cached community pages.
const retire=`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.registration.unregister();for(const client of await self.clients.matchAll({type:'window'}))await client.navigate('/');})()));`;
await writeFile(resolve(site,'service-worker.js'),retire);
await writeFile(resolve(site,'app/sw.js'),retire);
await writeFile(resolve(site,'robots.txt'),'User-agent: *\nAllow: /\n');
await writeFile(resolve(site,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://fwyanjiusuo.com/</loc></url><url><loc>https://fwyanjiusuo.com/privacy.html</loc></url></urlset>');
console.log('Static official website prepared; legacy community routes hidden.');
