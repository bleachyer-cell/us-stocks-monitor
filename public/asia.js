(()=>{
"use strict";
const regions=["韩国","日本","台湾","中国"];
const currencyNames={韩国:"KRW 韩元",日本:"JPY 日元",台湾:"TWD 新台币",中国:"CNY 人民币 / HKD 港币"};
const currencySigns={KRW:"₩",JPY:"¥",TWD:"NT$",CNY:"CN¥",HKD:"HK$",USD:"$"};
const linkage={
 "000660":"MU / HBM","005930":"MU / 存储","042700":"MU / HBM设备",
 "285A":"MU / NAND","8035":"AMAT / 半导体设备","6857":"NVDA / AI芯片测试",
 "2330":"TSM / NVDA / AMD","3711":"NVDA / AMD 封装","2317":"NVDA / AI服务器",
 "002371":"AMAT / 设备","0981":"TSM / 晶圆代工","301308":"MU / 存储模组"
};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cash=(v,c)=>Number(v).toLocaleString("en-US",{minimumFractionDigits:(c==="JPY"||c==="KRW")?0:2,maximumFractionDigits:2});
const pct=n=>(n>=0?"+":"")+Number(n).toFixed(2)+"%";
const movement=n=>n>0?"positive":n<0?"negative":"neutral";
let quotes=[],busy=false,intervalId;
function row(q){
 const nam='<div class="namecol"><div class="symbol">'+esc(q.name)+'<span class="region-chip">'+esc(q.region)+'</span></div><div class="stockname">'+esc(q.symbol+":"+q.exchange)+" · 对应 "+esc(linkage[q.symbol]||q.sector||"")+"</div></div>";
 const href=esc(q.source||"#");
 if(q.status==="error")return '<div class="stock">'+nam+
 '<div class="pricecol"><span class="error">获取失败</span></div>'+
 '<div class="closecol"><span class="pct-label">较昨收</span><span class="error">报价未验证</span></div>'+
 '<div class="opencol"><span class="pct-label">较开盘</span><span class="error">报价未验证</span></div>'+
 '<div class="datecol"><span class="timestamp">'+esc(q.error||"获取失败")+'</span><a class="source" target="_blank" rel="noopener noreferrer" href="'+href+'">Google Finance ↗</a></div></div>';
 const cur=currencySigns[q.currency]||esc(q.currency||"");
 const status=q.status==="stale";
 return '<div class="stock">'+nam+
 '<div class="pricecol"><div class="price">'+cur+cash(q.price,q.currency)+'</div><div class="stamptext">开盘 '+cur+cash(q.open,q.currency)+' · '+esc(q.currency)+'</div></div>'+
 '<div class="closecol"><div class="pct-label">较昨收</div><div class="pct '+movement(q.vsClose)+'">'+pct(q.vsClose)+'</div></div>'+
 '<div class="opencol"><div class="pct-label">较开盘</div><div class="pct '+movement(q.vsOpen)+'">'+pct(q.vsOpen)+'</div></div>'+
 '<div class="datecol"><div><div class="timestamp">'+esc(q.quoteTime)+'</div><div class="stamptext '+(status?'warn':'')+'">'+(status?"⚠ 本次抓取失败，显示近期缓存":"Google Finance 原始报价时间")+'</div></div><a class="source" href="'+href+'" rel="noopener noreferrer" target="_blank">来源 ↗</a></div></div>';
}
function draw(){
 const filter=$("asia-filter").value,sort=$("asia-sort").value;
 const selected=quotes.filter(q=>filter==="all"||q.region===filter);
 let content="";
 for(const region of regions){
  let items=selected.filter(q=>q.region===region);
  if(!items.length)continue;
  if(sort==="close")items.sort((a,b)=>(b.vsClose??-999)-(a.vsClose??-999));
  if(sort==="open")items.sort((a,b)=>(b.vsOpen??-999)-(a.vsOpen??-999));
  content+='<div class="region-hd">'+region+'<span class="region-meta">'+currencyNames[region]+' · '+items.length+'只</span></div>'+items.map(row).join("");
 }
 $("asia-rows").innerHTML=content||'<div class="region-hd">加载中……</div>';
 $("asia-count").textContent=selected.length+"只";
}
async function load(){
 if(busy)return;
 busy=true;$("asia-refresh").disabled=true;$("asia-state").textContent="亚洲行情更新中";
 try{
  const rsp=await fetch("/api/asia",{cache:"no-store"});
  if(!rsp.ok)throw Error("HTTP "+rsp.status);
  const data=await rsp.json();
  if(!Array.isArray(data.quotes)||data.quotes.length!==12)throw Error("行情数量不完整");
  quotes=data.quotes;
  draw();
  const failed=quotes.filter(q=>q.status==="error").length;
  const stale=quotes.filter(q=>q.status==="stale").length;
  $("asia-state").textContent=failed||stale?"部分行情暂不可用":"亚洲行情已同步";
  $("asia-status").textContent="共12只，成功 "+(12-failed)+" 只；抓取失败 "+failed+" 只；缓存 "+stale+" 只。各行显示的当地交易所报价时间为准。";
 }catch(e){$("asia-state").textContent="亚洲行情更新失败";$("asia-status").textContent=String(e.message||e);}
 finally{busy=false;$("asia-refresh").disabled=false;}
}
function schedule(){clearInterval(intervalId);intervalId=setInterval(()=>{if(document.visibilityState!=="hidden")load()},Number($("interval").value)*1000);}
$("asia-refresh").addEventListener("click",load);
$("asia-filter").addEventListener("change",draw);
$("asia-sort").addEventListener("change",draw);
$("interval").addEventListener("change",schedule);
schedule();load();
})();