const fs=require('fs'),os=require('os'),path=require('path'),https=require('https');
const cred=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.claude','.credentials.json'),'utf8'));
const tok=cred.claudeAiOauth.accessToken;
const req=https.request({host:'api.anthropic.com',path:'/api/oauth/usage',method:'GET',headers:{
 'Authorization':'Bearer '+tok,'anthropic-beta':'oauth-2025-04-20','User-Agent':'claude-cli/2.1.220 (external, cli)','x-app':'cli'}},res=>{
 let b='';res.on('data',d=>b+=d);res.on('end',()=>{
  if(res.statusCode!==200){console.log('HTTP',res.statusCode,b.slice(0,200));return;}
  const j=JSON.parse(b);
  for(const k of ['five_hour','seven_day','seven_day_opus','seven_day_sonnet']){
   if(j[k]&&j[k].utilization!=null)console.log(k.padEnd(18),String(j[k].utilization).padStart(6),'%  resets',j[k].resets_at);
  }
 });});
req.on('error',e=>console.log('ERR',e.message));req.end();
