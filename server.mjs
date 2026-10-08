import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chartProbe } from './chart-probe.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const stocks=[
  ['TSM','台积电','NYSE','芯片制造'],['AMD','AMD','NASDAQ','AI / CPU'],
  ['NVDA','英伟达','NASDAQ','AI GPU'],['TQQQ','TQQQ','NASDAQ','3 倍纳指 ETF'],
  ['MU','美光科技','NASDAQ','存储 / HBM'],['SPY','SPY','NYSEARCA','标普 500 ETF'],
  ['JNJ','强生','NYSE','医疗保健'],['LLY','礼来','NYSE','医药'],
  ['AMAT','应用材料','NASDAQ','半导体设备']
];
const asiaStocks=[
  ['000660','SK海力士','KRX','存储 / HBM','韩国','KRW'],
  ['005930','三星电子','KRX','存储 / HBM','韩国','KRW'],
  ['042700','韩美半导体','KRX','HBM 封装设备','韩国','KRW'],
  ['285A','铠侠','TYO','NAND 存储','日本','JPY'],
  ['8035','东京电子','TYO','半导体设备','日本','JPY'],
  ['6857','Advantest','TYO','AI 芯片测试','日本','JPY'],
  ['2330','台积电','TPE','先进晶圆代工','台湾','TWD'],
  ['3711','日月光投控','TPE','先进封装','台湾','TWD'],
  ['2317','鸿海','TPE','AI 服务器','台湾','TWD'],
  ['002371','北方华创','SHE','半导体设备','中国','CNY'],
  ['0981','中芯国际H','HKG','晶圆代工','中国','HKD'],
  ['301308','江波龙','SHE','存储模组','中国','CNY']
];
const store=new Map(),CACHE_MS=45000;
const num=s=>Number(String(s??'').replace(/[^0-9.+-]/g,''));
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').trim();
const quoteUrl=([symbol,,exchange])=>`https://www.google.com/finance/quote/${symbol}:${exchange}?hl=en`;
function parseQuote(html,stock){
  const [symbol,name,exchange,sector,region,currency]=stock;
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
  return {symbol,name,exchange,sector,region:region||'美国',currency:currency||'USD',price,open,
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
    return {symbol,name,exchange,sector,region:stock[4]||'美国',currency:stock[5]||'USD',status:'error',error:String(e.message||e),source:quoteUrl(stock)};
  }
}
let work,asiaWork;
async function getAll(){
  if(work)return work;
  work=(async()=>{
    let next=0,values=new Array(stocks.length);
    await Promise.all(Array.from({length:3},async()=>{while(next<stocks.length){const i=next++;values[i]=await getOne(stocks[i]);}}));
    return {provider:'Google Finance 网页（非官方 API，可能延迟）',fetchedAt:new Date().toISOString(),quotes:values};
  })().finally(()=>work=null);
  return work;
}
async function getAsia(){
  if(asiaWork)return asiaWork;
  asiaWork=(async()=>{
    let next=0;const values=new Array(asiaStocks.length);
    await Promise.all(Array.from({length:4},async()=>{while(next<asiaStocks.length){const i=next++;values[i]=await getOne(asiaStocks[i]);}}));
    return {provider:'Google Finance 公开网页',fetchedAt:new Date().toISOString(),quotes:values};
  })().finally(()=>{asiaWork=null;});
  return asiaWork;
}
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  if(req.method!=='GET')return json(405,{error:'Method not allowed'});
  if(pathname==='/api/health')return json(200,{ok:true,count:stocks.length+asiaStocks.length,usCount:stocks.length,asiaCount:asiaStocks.length});
  if(pathname==='/api/quotes'){try{return json(200,await getAll());}catch{return json(503,{error:'美股行情抓取暂不可用'});}}
  if(pathname==='/api/asia'){try{return json(200,await getAsia());}catch{return json(503,{error:'亚洲行情抓取暂不可用'});}}
  if(pathname==='/api/chart-probe'){const symbol=new URL(req.url,'http://localhost').searchParams.get('symbol')||'NVDA';const matched=[...stocks,...asiaStocks].find(x=>x[0]===symbol);if(!matched)return json(400,{error:'Unsupported symbol'});try{return json(200,await chartProbe(matched[0],matched[2]));}catch(e){return json(503,{error:String(e)});}}
  if(pathname==='/asia.js'){
    try{const content=await readFile(path.join(ROOT,'public','asia.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(content);}
    catch{res.writeHead(500);res.end('Asia script unavailable');}
    return;
  }
  if(pathname==='/'||pathname==='/index.html'){
    try{const content=await readFile(path.join(ROOT,'public','index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(content);}
    catch{res.writeHead(500);res.end('Page unavailable');}
    return;
  }
  res.writeHead(404);res.end('Not found');
}).listen(PORT,'0.0.0.0',()=>console.log(`Stock monitor started on ${PORT}`));
