
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
export function installSpeech(root,port){let busy=false;return (req,res)=>{
 if(req.url!=='/api/speech')return false;
 if(req.method!=='POST'||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403);res.end();return true;}
 if(busy){res.writeHead(429);res.end();return true;}busy=true;
 let body='',failed=false;req.on('aborted',()=>busy=false);req.on('error',()=>busy=false);
 req.on('data',c=>{body+=c;if(body.length>24000){failed=true;body='';if(!res.writableEnded){res.writeHead(413);res.end();}}});
 req.on('end',async()=>{let input,output;try{
 if(failed)return;const {text,language}=JSON.parse(body);if(typeof text!=='string'||!text.trim()||text.length>6000)throw Error();
 const id=randomUUID();input=path.join(root,'data',id+'.txt');output=path.join(root,'data',id+'.wav');fs.writeFileSync(input,text);
 await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-File',path.join(root,'speak.ps1'),'-InputPath',input,'-OutputPath',output,'-Language',language==='en'?'en':'ru'],{windowsHide:true});child.stdout.resume();child.stderr.resume();const timer=setTimeout(()=>{child.kill();reject(Error());},45000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error());});});
 res.writeHead(200,{'Content-Type':'audio/wav'});res.end(fs.readFileSync(output));
 }catch{if(!res.writableEnded){res.writeHead(503);res.end('Local voice unavailable');}}finally{for(const file of [input,output])if(file)try{fs.unlinkSync(file);}catch{}busy=false;}});return true;
};}
