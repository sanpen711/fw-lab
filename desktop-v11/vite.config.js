import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  base:'./',
  build:{
    outDir:'dist',
    emptyOutDir:true,
    target:'chrome105',
    sourcemap:false,
    rollupOptions:{
      input:{
        main:resolve(__dirname,'index.html'),
        nesPlayer:resolve(__dirname,'nes-player.html')
      }
    }
  },
  server:{
    host:'127.0.0.1',
    port:1421,
    strictPort:true
  }
});
