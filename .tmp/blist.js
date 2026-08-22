const fs=require('fs'),path=require('path');
const DIR=path.join(process.env.APPDATA,'Code','User','globalStorage','muvusoft.agent-farm','bridge');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function post(p){const n=`developer-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
 const req=path.join(DIR,n+'.request.json'),res=path.join(DIR,n+'.response.json');
 fs.writeFileSync(req,JSON.stringify(p),'utf8');
 for(let w=0;w<90;w++){if(fs.existsSync(res)){const raw=fs.readFileSync(res,'utf8').replace(/^\uFEFF/,'');fs.unlinkSync(res);return JSON.parse(raw);}await sleep(1000);}
 return {ok:false,error:'timeout'};}
(async()=>{
 const out=await post({op:'projects.backlog',args:{project:'prj_9ujsbtzr'}});
 if(!out.ok){console.log(out);return;}
 const items=out.result.items||out.result;
 for(const it of items){
   const t=(it.text||'').replace(/\s+/g,' ');
   console.log(`${it.done?'x':' '} ${it.code||'--'} | ${it.effort||''} ${it.priority||''} ${it.parent?'^'+it.parent:''} | ${t.slice(0,110)}`);
 }
})();
