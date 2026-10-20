import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from '../desktop-v11/node_modules/vite/dist/node/index.js';
import {adaptModule,adaptHtml} from '../web-client/adapt-source.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stage=resolve(root,'.web-stage'),out=resolve(root,'web-client/dist');
await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
await cp(resolve(root,'desktop-v11/src'),resolve(stage,'src'),{recursive:true});
for(const file of await readdir(resolve(stage,'src'))){if(file.endsWith('.js')){const path=resolve(stage,'src',file);await writeFile(path,adaptModule(file,await readFile(path,'utf8')));}}
await cp(resolve(root,'desktop-v11/public'),resolve(stage,'public'),{recursive:true,filter:path=>!/(?:\/emulatorjs(?:\/|$)|\/games\/nes(?:\/|$))/.test(path)});
for(const file of await readdir(resolve(stage,'public'))){if(file.endsWith('.css')){const path=resolve(stage,'public',file);await writeFile(path,(await readFile(path,'utf8')).replace(/url\((['"]?)\/(?!web\/)/g,'url($1/web/'));}}
await cp(resolve(root,'desktop-v11/styles.css'),resolve(stage,'styles.css'));
await cp(resolve(root,'web-client/web.css'),resolve(stage,'web.css'));
await cp(resolve(root,'web-client/overrides'),resolve(stage,'src'),{recursive:true});
await writeFile(resolve(stage,'index.html'),adaptHtml(await readFile(resolve(root,'desktop-v11/index.html'),'utf8')));
await build({configFile:false,root:stage,base:'/web/',resolve:{alias:{'@supabase/supabase-js':createRequire(resolve(root,'desktop-v11/package.json')).resolve('@supabase/supabase-js')}},build:{outDir:out,emptyOutDir:true,target:'es2022',sourcemap:false,rollupOptions:{input:resolve(stage,'index.html')}}});
