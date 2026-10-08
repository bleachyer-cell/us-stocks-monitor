// Google Finance native price-history series. Unofficial internal endpoint; no third-party market data.
const RPC="https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute";
const HEADERS={
  "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
  "Accept-Language":"en-US,en;q=0.9",
  "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8",
  "Cookie":"CONSENT=YES+"
};
const cache=new Map(),inflight=new Map();
function parseResponse(raw){
  for(const line of raw.split("\n")){
    const s=line.trim();
    if(!s.startsWith("[["))continue;
    try{
      const frames=JSON.parse(s);
      for(const frame of frames)
        if(frame?.[0]==="wrb.fr"&&frame[1]==="AiCwsd"&&typeof frame[2]==="string")
          return JSON.parse(frame[2]);
    }catch{}
  }
  return null;
}
function utcMillis(date){
  if(!Array.isArray(date)||date.length<3)return NaN;
  const [y,m,d,h=0,minute=0,sec=0,,offset]=date;
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d))return NaN;
  const hours=Number.isFinite(h)?h:0,mins=Number.isFinite(minute)?minute:0,seconds=Number.isFinite(sec)?sec:0;
  const utcOffset=Array.isArray(offset)&&Number.isFinite(offset[0])?offset[0]:0;
  return Date.UTC(y,m-1,d,hours,mins,seconds)-utcOffset*1000;
}
function parseSeries(payload,range){
  const root=payload?.[0]?.[0];
  const segments=root?.[3];
  if(!Array.isArray(segments))throw Error("没有从 Google Finance 获取到分时数据");
  const data=[];
  for(const segment of segments){
    if(!Array.isArray(segment?.[1]))continue;
    // For 1D, include only regular-hours segment (type 1); do not blend after-hours.
    if(range==="1D" && segment?.[0]?.[0]!==1)continue;
    for(const item of segment[1]){
      const t=utcMillis(item?.[0]);
      const p=item?.[1]?.[0];
      if(Number.isFinite(t)&&Number.isFinite(p)&&p>0)data.push({t,p:Number(p.toFixed(4))});
    }
  }
  const unique=new Map(data.map(p=>[p.t,p]));
  const points=[...unique.values()].sort((a,b)=>a.t-b.t);
  if(points.length<2)throw Error("该股票当前没有足够的真实曲线数据");
  if(points.length>1500)throw Error("异常的价格数据量");
  return points;
}
export async function fetchHistory(symbol,exchange,range="1D"){
  if(!["1D","1M"].includes(range))throw Error("仅支持 1D、1M");
  const key=symbol+":"+exchange+":"+range;
  const ts=Date.now(),ttl=range==="1D"?75000:300000;
  const cached=cache.get(key);
  if(cached && ts-cached.fetched<ttl)return {...cached.value,cachedAt:new Date(cached.fetched).toISOString()};
  if(inflight.has(key))return await inflight.get(key);
  const task=(async()=>{
    try{
      const tuple=[null,[symbol,exchange]],mode=range==="1D"?1:3;
      const body="f.req="+encodeURIComponent(JSON.stringify([[["AiCwsd",JSON.stringify([[tuple],mode]),null,"1"]]]));
      const url=RPC+"?rpcids=AiCwsd&source-path=/finance/quote/"+encodeURIComponent(symbol+":"+exchange)+"&hl=en&gl=us&rt=c";
      const res=await fetch(url,{method:"POST",headers:HEADERS,body,signal:AbortSignal.timeout(18000)});
      if(!res.ok)throw Error("Google Finance 图表接口 HTTP "+res.status);
      const data=parseResponse(await res.text());
      const points=parseSeries(data,range);
      const value={symbol,exchange,range,source:"Google Finance",sourceUrl:"https://www.google.com/finance/quote/"+symbol+":"+exchange+"?hl=en",
        points,pointsCount:points.length,lastTimestamp:new Date(points.at(-1).t).toISOString()};
      cache.set(key,{fetched:Date.now(),value});
      return value;
    }catch(e){
      if(cached&&Date.now()-cached.fetched<600000)return {...cached.value,stale:true,warning:"历史曲线获取失败，显示近期缓存",cachedAt:new Date(cached.fetched).toISOString()};
      throw e;
    }
  })().finally(()=>inflight.delete(key));
  inflight.set(key,task);return task;
}