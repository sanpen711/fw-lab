import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  base:'./',
  build:{
    outDir:'dist',
    emptyOutDir:true,
    target:'chrome105',
    sourcemap:false
  },
  server:{
    fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]},
    host:'127.0.0.1',
    port:1422,
    strictPort:true
  }
});
