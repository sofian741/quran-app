import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.WEB_ROOT||process.cwd());
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.qvp':'application/octet-stream'};
http.createServer((req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||relative.split('/').some(x=>x.startsWith('.'))||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Ayat: http://127.0.0.1:'+(process.env.PORT||4173)));
