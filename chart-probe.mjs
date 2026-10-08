const RPC="https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute";
const HEADERS={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36","Accept-Language":"en-US,en;q=0.9","Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","Cookie":"CONSENT=YES+"};
function buildBody(symbol,exchange,mode){
  const tuple=[null,[symbol,exchange]];
  return "f.req="+encodeURIComponent(JSON.stringify([[["AiCwsd",JSON.stringify([[[tuple]],mode]),null,"1"]]]));
}
function parseRpc(s){
  const rows=s.split("\n");
  for(const line of rows){
    const val=line.trim();
    if(!val.startsWith("[["))continue;
    try{
      const json=JSON.parse(val);
      for(const item of json){if(item[0]==="wrb.fr" && item[1]==="AiCwsd")return JSON.parse(item[2]);}
    }catch{}
  }
  return null;
}
async function one(symbol,exchange,mode){
  const timeout=AbortSignal.timeout(15000);
  const response=await fetch(RPC+"?rpcids=AiCwsd&source-path=/finance/quote/"+symbol+":"+exchange+"&hl=en&gl=us&rt=c",{
    method:"POST",signal:timeout,headers:HEADERS,body:buildBody(symbol,exchange,mode)});
  const raw=await response.text();
  const data=parseRpc(raw);
  const chart=data?.[0]?.[0];
  return {mode,status:response.status,rawBeginning:raw.slice(0,180),dataLength:JSON.stringify(data||"").length,
    topType:Array.isArray(data)?"array":typeof data,
    summary:JSON.stringify(chart||data).slice(0,1800),
    chartPeriods:Array.isArray(chart?.[3])?chart[3].length:null};
}
export async function chartProbe(symbol,exchange){
  return {symbol,exchange,results:await Promise.all([1,3].map(async mode=>{try{return await one(symbol,exchange,mode)}catch(e){return {mode,error:String(e)}}}))};
}