import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cacheDir=resolve(root,'.cache/nes-cores');
const outputDir=resolve(root,'public/emulatorjs/cores/unpacked/fceumm');
const localPackageDir=resolve(root,'node_modules/@emulatorjs/core-fceumm');
const require=createRequire(import.meta.url);
const {path7za}=require('7zip-bin');
const assets=new Map([
  ['fceumm-legacy-wasm.data','f1054b094e7149fd6278485bc1b2e51ff75c5259048ddb1134171e53d651f239'],
]);
const unpackedAssets=new Map([
  ['fceumm_libretro.js','dba07936f4502e66cd1d31adfcea8102664c3c6d8fd947bf3c151a3c93e5e73c'],
  ['fceumm_libretro.wasm','86b8aca214421da72b2eb4827c93bddc8bd35c5e529f141de74ab5c5f57c8b8e'],
  ['build.json','27d8d02b31afc26c5beeb9dd6a8603b1b2d05c447fef13288e12ef2066090996'],
  ['core.json','5d568c0241a1ffb1e8b0496fd864d8be390b88f4ca5ce031be6e67a2ebfcf17e'],
  ['license.txt','a6996dcf0c334281f734560926e079b2dbbd5b78e81c0ca00a413ec01e1cd2fb'],
]);

const digest=data=>createHash('sha256').update(data).digest('hex');

async function isValid(path,expected){
  try{return digest(await readFile(path))===expected;}catch{return false;}
}

function extractTarFile(tar,name){
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    const text=(start,end)=>header.subarray(start,end).toString('utf8').replace(/\0.*$/s,'');
    const path=[text(345,500),text(0,100)].filter(Boolean).join('/');
    const size=parseInt(text(124,136).trim()||'0',8);
    const bodyStart=offset+512;
    if(path===name)return tar.subarray(bodyStart,bodyStart+size);
    offset=bodyStart+Math.ceil(size/512)*512;
  }
  throw new Error(`npm 包缺少 ${name}`);
}

async function copyFromInstalledPackage(pending){
  for(const [name,expected] of [...pending]){
    const source=resolve(localPackageDir,name);
    if(!existsSync(source)||!await isValid(source,expected))continue;
    await copyFile(source,resolve(cacheDir,name));
    pending.delete(name);
  }
}

async function downloadPackage(pending){
  const temp=await mkdtemp(join(tmpdir(),'fw-nes-core-'));
  try{
    const npmCli=process.env.npm_execpath;
    if(!npmCli)throw new Error('找不到 npm 执行入口');
    const output=execFileSync(process.execPath,[npmCli,'pack','@emulatorjs/core-fceumm@4.2.3','--silent'],{
      cwd:temp,
      encoding:'utf8',
      stdio:['ignore','pipe','inherit'],
    }).trim();
    const archive=resolve(temp,basename(output.split(/\r?\n/).at(-1)));
    const tar=gunzipSync(await readFile(archive));
    for(const [name,expected] of pending){
      const data=extractTarFile(tar,`package/${name}`);
      if(digest(data)!==expected)throw new Error(`${name} 校验失败`);
      await writeFile(resolve(cacheDir,name),data);
    }
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
}

await mkdir(cacheDir,{recursive:true});
const pending=new Map();
for(const [name,expected] of assets){
  if(!await isValid(resolve(cacheDir,name),expected))pending.set(name,expected);
}
if(pending.size){
  await copyFromInstalledPackage(pending);
  if(pending.size)await downloadPackage(pending);
}
for(const [name,expected] of assets){
  if(!await isValid(resolve(cacheDir,name),expected))throw new Error(`${name} 未准备完成`);
}

const unpackedReady=(await Promise.all([...unpackedAssets].map(([name,expected])=>isValid(resolve(outputDir,name),expected)))).every(Boolean);
if(!unpackedReady){
  await rm(outputDir,{recursive:true,force:true});
  await mkdir(outputDir,{recursive:true});
  if(process.platform!=='win32')await chmod(path7za,0o755);
  execFileSync(path7za,['x','-y',`-o${outputDir}`,resolve(cacheDir,'fceumm-legacy-wasm.data')],{stdio:'inherit'});
}
for(const [name,expected] of unpackedAssets){
  if(!await isValid(resolve(outputDir,name),expected))throw new Error(`${name} 解包校验失败`);
}
await rm(resolve(root,'public/emulatorjs/cores/fceumm-wasm.data'),{force:true});
await rm(resolve(root,'public/emulatorjs/cores/fceumm-legacy-wasm.data'),{force:true});
console.log('NES unpacked core assets ready');
