import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {releasePackagePlugin} from './scripts/release-package.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({command})=>({
  base:'./',
  appType:'mpa',
  // Development can still inspect archived sources. Releases copy approved assets only.
  publicDir:command==='build'?false:'public',
  plugins:command==='build'?[releasePackagePlugin(root)]:[],
  build:{
    outDir:'dist',
    emptyOutDir:true,
    target:'chrome105',
    sourcemap:false,
    rollupOptions:{input:{main:resolve(root,'index.html')}}
  },
  server:{host:'127.0.0.1',port:1421,strictPort:true},
  preview:{host:'127.0.0.1',port:1422,strictPort:true}
}));
