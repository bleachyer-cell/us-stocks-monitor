import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const stocks=[
  ['TSM','台积电','NYSE','芯片制造'],['AMD','AMD','NASDAQ','AI / CPU'],
  ['NVDA','英伟达','NASDAQ','AI GPU'],['TQQQ','TQQQ','NASDAQ','3 倍纳指 ETF'],
  ['MU','美光科技','NASDAQ','存储 / HBM'],['SPY','SPY','NYSEARCA','标普 500 ETF'],
  ['JNJ','强生','NYSE','医疗保健'],['LLY','礼来','NYSE','医药'],
  ['AMAT','应用材料','NASDAQ','半导体设备']
];
const store=new Map(),CACHE_MS=45000;
const num=s=>Number(String(s||'').replace(/[$,]/g,'').trim());
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').trim();
const quoteUrl=([symbol,,exchange])=>`https://www.google.com/finance/quote/${symbol}:${exchange}?hl=en`;
function parseQuote(html,stock){
  const [symbol,name,exchange,sector]=stock;
  const at=html.indexOf('class="N6SYTe"');
  if(at<0)throw Error('Google Finance 页面结构变化，未找到报价');
  const block=html.slice(at,at+4000);
  const value=block.match(/class="N6SYTe"[^>]*>([\s\S]*?)<\/div>/);
  const price=value?num(plain(value[1])):NaN;
  const timeAt=block.indexOf('class="jZZ2de"');
  const main=block.slice(0,timeAt>=0?timeAt:1400);
  const percent=main.match(/([-+]?\d+(?:\.\d+)?)\s*%/);
  const closePct=percent?Number(percent[1]):NaN;
  const tm=block.match(/class="jZZ2de"[^>]*>([\s\S]*?)<\/div>/);
  const quoteTime=tm?plain(tm[1]):'';
  const opening=html.match(/class="SwQK7"[^>]*>\s*Open\s*<\/div>\s*<div[^>]*class="dO6ijd"[^>]*>([\s\S]*?)<\/div>/);
  const open=opening?num(plain(opening[1])):NaN;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(closePct)||Math.abs(closePct)>100||!Number.isFinite(open)||open<=0||!quoteTime)throw Error('行情字段验证失败，不展示不完整数据');
  return {symbol,name,exchange,sector,price,open,
    vsClose:Number(closePct.toFixed(2)),
    vsOpen:Number(((price/open-1)*100).toFixed(2)),
    quoteTime,source:quoteUrl(stock)};
}
async function getOne(stock){
  const [symbol,name,exchange,sector]=stock;
  const last=store.get(symbol),now=Date.now();
  if(last&&now-last.fetched< CACHE_MS)return {...last.value,status:'ok',fetchedAt:new Date(last.fetched).toISOString()};
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let res;
    try{res=await fetch(quoteUrl(stock),{signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36','Accept-Language':'en-US,en;q=0.9','Cache-Control':'no-cache'}});}
    finally{clearTimeout(timer);}
    if(!res.ok)throw Error(`HTTP ${res.status}`);
    const value=parseQuote(await res.text(),stock);
    store.set(symbol,{value,fetched:Date.now()});
    return {...value,status:'ok',fetchedAt:new Date().toISOString()};
  }catch(e){
    if(last&&now-last.fetched<10*60*1000)return {...last.value,status:'stale',warning:'抓取失败，使用10分钟内缓存',fetchedAt:new Date(last.fetched).toISOString()};
    return {symbol,name,exchange,sector,status:'error',error:String(e.message||e),source:quoteUrl(stock)};
  }
}
let work;
async function getAll(){
  if(work)return work;
  work=(async()=>{
    let next=0,values=new Array(stocks.length);
    await Promise.all(Array.from({length:3},async()=>{while(next<stocks.length){const i=next++;values[i]=await getOne(stocks[i]);}}));
    return {provider:'Google Finance 网页（非官方 API，可能延迟）',fetchedAt:new Date().toISOString(),quotes:values};
  })().finally(()=>work=null);
  return work;
}
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  if(req.method!=='GET')return json(405,{error:'Method not allowed'});
  if(pathname==='/api/health')return json(200,{ok:true,count:stocks.length});
  if(pathname==='/api/quotes'){try{return json(200,await getAll());}catch{return json(503,{error:'行情抓取暂不可用'});}}
  if(pathname==='/'||pathname==='/index.html'){
    try{const content=await readFile(path.join(ROOT,'public','index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(content);}
    catch{res.writeHead(500);res.end('Page unavailable');}
    return;
  }
  res.writeHead(404);res.end('Not found');
}).listen(PORT,'0.0.0.0',()=>console.log(`Stock monitor started on ${PORT}`));
