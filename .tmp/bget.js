const fs=require('fs'),path=require('path');
const DIR=path.join(process.env.APPDATA,'Code','User','globalStorage','muvusoft.agent-farm','bridge');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function post(p){const n=`developer-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
 const req=path.join(DIR,n+'.request.json'),res=path.join(DIR,n+'.response.json');
 fs.writeFileSync(req,JSON.stringify(p),'utf8');
 for(let w=0;w<90;w++){if(fs.existsSync(res)){const raw=fs.readFileSync(res,'utf8').replace(/^\uFEFF/,'');fs.unlinkSync(res);return JSON.parse(raw);}await sleep(1000);}
 return {ok:false,error:'timeout'};}
(async()=>{
 const want=process.argv.slice(2);
 const out=await post({op:'projects.backlog',args:{project:'prj_9ujsbtzr'}});
 const items=out.result.items||out.result;
 for(const it of items){ if(want.includes(it.code)) console.log('=== '+it.code+' ===\n'+it.text+'\n'); }
})();
