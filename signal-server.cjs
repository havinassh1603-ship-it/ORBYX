const {PeerServer}=require('peer');
const port=Number(process.env.ORBYX_SIGNAL_PORT||9000);
PeerServer({port,path:'/orbyx',allow_discovery:false},()=>console.log(`ORBYX optional signalling: http://localhost:${port}/orbyx`));
