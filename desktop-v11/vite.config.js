import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  build:{
    outDir:'dist',
    emptyOutDir:true,
    target:'chrome105',
    sourcemap:false
  },
  server:{
    host:'127.0.0.1',
    port:1421,
    strictPort:true
  }
});
