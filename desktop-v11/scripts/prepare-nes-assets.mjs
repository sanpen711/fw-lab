import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outputDir=resolve(root,'public/emulatorjs/cores');
const localPackageDir=resolve(root,'node_modules/@emulatorjs/core-fceumm');
const assets=new Map([
  ['fceumm-wasm.data','8c449fd5c36646fb0769423ed6ffa9efbdfc21fbfdc9bac7952b559d34d5b493'],
  ['fceumm-legacy-wasm.data','f1054b094e7149fd6278485bc1b2e51ff75c5259048ddb1134171e53d651f239'],
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
    await copyFile(source,resolve(outputDir,name));
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
      await writeFile(resolve(outputDir,name),data);
    }
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
}

await mkdir(outputDir,{recursive:true});
const pending=new Map();
for(const [name,expected] of assets){
  if(!await isValid(resolve(outputDir,name),expected))pending.set(name,expected);
}
if(pending.size){
  await copyFromInstalledPackage(pending);
  if(pending.size)await downloadPackage(pending);
}
for(const [name,expected] of assets){
  if(!await isValid(resolve(outputDir,name),expected))throw new Error(`${name} 未准备完成`);
}
console.log('NES core assets ready');
