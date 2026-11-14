import { defineConfig } from 'vite';
import express from 'express';
import { ExpressPeerServer } from 'peer';
import { WebSocketServer } from 'ws';
export default defineConfig({base:'./',server:{host:'0.0.0.0',port:3000,strictPort:true,allowedHosts:['terminal.local']},
 plugins:[{name:'local-peer-signalling',configureServer(vite){
  if(!vite.httpServer)return;
  const app=express();
  const peer=ExpressPeerServer(vite.httpServer!,{path:'/orbyx',proxied:true,allow_discovery:false,createWebSocketServer({server,path}){
   const wss=new WebSocketServer({noServer:true});server.on('upgrade',(request,socket,head)=>{if(request.url?.split('?')[0]===path)wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));});return wss;
  }});
  app.use('/peerjs',peer);vite.middlewares.use(app);
 }}],build:{outDir:'dist',chunkSizeWarningLimit:2000,rollupOptions:{output:{manualChunks:{phaser:['phaser'],peer:['peerjs']}}}},test:{include:['tests/**/*.test.ts'],environment:'node'}
} as any);
