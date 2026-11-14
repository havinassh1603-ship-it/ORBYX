import {createServer} from 'vite';
import WebSocket from 'ws';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
async function run(){const server=await createServer({configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url)),server:{port:0,host:'127.0.0.1',strictPort:false},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});const sockets=[];
 try{await server.listen();const port=server.httpServer.address().port;const response=await fetch(`http://127.0.0.1:${port}/peerjs/orbyx/peerjs/id`);assert.equal(response.status,200);assert.ok((await response.text()).length>10);
  async function connect(id){const socket=new WebSocket(`ws://127.0.0.1:${port}/peerjs/orbyx/peerjs?key=peerjs&id=${id}&token=unit-token`);sockets.push(socket);assert.equal((await next(socket)).type,'OPEN');return socket;}
  const host=await connect('signal-host'),guest=await connect('signal-guest');let incoming=next(host);guest.send(JSON.stringify({type:'OFFER',dst:'signal-host',payload:{connectionId:'data-test',type:'data',sdp:{type:'offer',sdp:'fixture'}}}));const offer=await incoming;assert.equal(offer.type,'OFFER');assert.equal(offer.src,'signal-guest');incoming=next(guest);host.send(JSON.stringify({type:'ANSWER',dst:'signal-guest',payload:{connectionId:'data-test',type:'data',sdp:{type:'answer',sdp:'fixture'}}}));assert.equal((await incoming).type,'ANSWER');
 }finally{for(const socket of sockets)socket.terminate();await server.close();}}
function next(socket){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Signalling timeout')),4000);socket.once('message',data=>{clearTimeout(timer);resolve(JSON.parse(data.toString()));});socket.once('error',e=>{clearTimeout(timer);reject(e);});});}
// PeerServer owns maintenance intervals without a public shutdown API: this is an isolated worker.
run().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
