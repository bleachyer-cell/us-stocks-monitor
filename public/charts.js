(()=>{
"use strict";
const el=id=>document.getElementById(id);
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const zones={NASDAQ:"America/New_York",NYSE:"America/New_York",NYSEARCA:"America/New_York",
 KRX:"Asia/Seoul",TYO:"Asia/Tokyo",TPE:"Asia/Taipei",SHE:"Asia/Shanghai",HKG:"Asia/Hong_Kong"};
const signs={KRW:"₩",JPY:"¥",TWD:"NT$",CNY:"CN¥",HKD:"HK$",USD:"$"};
const symbolCurrencies={"000660":"KRW","005930":"KRW","042700":"KRW","285A":"JPY","8035":"JPY","6857":"JPY","2330":"TWD","3711":"TWD","2317":"TWD","002371":"CNY","0981":"HKD","301308":"CNY"};
const caches=new Map();let active=0;const queue=[],MAX=4;
let selected=null,range="1D",dialogFetchId=0;
function enqueue(fn){
 return new Promise((resolve,reject)=>{queue.push({fn,resolve,reject});drain();});
}
function drain(){
 while(active<MAX&&queue.length){
  const next=queue.shift();active++;
  Promise.resolve().then(next.fn).then(next.resolve,next.reject).finally(()=>{active--;drain();});
 }
}
async function loadChart(symbol,rangeName){
 const key=symbol+"/"+rangeName,old=caches.get(key),ttl=rangeName==="1D"?75000:300000;
 if(old&&Date.now()-old.at<ttl)return old.payload;
 const response=await fetch("/api/chart?symbol="+encodeURIComponent(symbol)+"&range="+rangeName,{cache:"no-store"});
 if(!response.ok){let msg="HTTP "+response.status;try{msg=(await response.json()).error||msg}catch{}throw Error(msg);}
 const payload=await response.json();
 if(!Array.isArray(payload.points)||payload.points.length<2)throw Error("曲线点数不足");
 caches.set(key,{at:Date.now(),payload});return payload;
}
function line(points,width,height,margin=3){
 const low=Math.min(...points.map(p=>p.p)),high=Math.max(...points.map(p=>p.p)),span=Math.max(0.00001,high-low);
 const minX=points[0].t,maxX=points.at(-1).t,diff=Math.max(1,maxX-minX);
 const xy=points.map(p=>({
  x:margin+(p.t-minX)/diff*(width-2*margin),
  y:margin+(1-(p.p-low)/span)*(height-2*margin)
 }));
 const path="M"+xy.map(p=>p.x.toFixed(2)+","+p.y.toFixed(2)).join(" L");
 const color=points.at(-1).p>=points[0].p?"#3bddaa":"#ff748b";
 return {path,xy,low,high,color};
}
function money(value,sym){
 const cur=symbolCurrencies[sym]||"USD";
 const min=(cur==="JPY"||cur==="KRW")?0:2;
 return (signs[cur]||"$")+Number(value).toLocaleString("en-US",{minimumFractionDigits:min,maximumFractionDigits:2});
}
function time(t,exchange,period){
 const zone=zones[exchange]||"America/New_York";
 const options=period==="1M"?{timeZone:zone,month:"2-digit",day:"2-digit"}:{timeZone:zone,hour:"2-digit",minute:"2-digit",hour12:false};
 return new Intl.DateTimeFormat("zh-CN",options).format(new Date(t));
}
function miniSvg(points){
 const w=300,h=46,graph=line(points,w,h,3);
 const end=points.at(-1),first=points[0],pct=(end.p/first.p-1)*100;
 const pctLabel=(pct>=0?"+":"")+pct.toFixed(2)+"%";
 const fill=graph.color==="#3bddaa"?"#3bddaa":"#ff748b";
 return {html:'<svg class="spark-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-label="Google Finance 当日价格曲线">'+
 '<path d="'+graph.path+' L '+(w-3)+' '+(h-3)+' L 3 '+(h-3)+' Z" fill="'+fill+'" fill-opacity=".08"></path>'+
 '<path d="'+graph.path+'" fill="none" stroke="'+graph.color+'" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>'+
 '</svg>',pctLabel,color:graph.color};
}
const viewportObserver=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>{
 for(const e of entries)if(e.isIntersecting){viewportObserver.unobserve(e.target);updateSpark(e.target);}
},{rootMargin:"300px"}):null;
function instrument(root){
 if(!root)return;
 for(const stock of root.querySelectorAll(".stock")){
  if(stock.querySelector(".chart-mini"))continue;
  const a=stock.querySelector("a.source[href*='/finance/quote/']");
  if(!a)continue;
  const href=a.getAttribute("href")||"",m=href.match(/\/finance\/quote\/([^/:?]+):([^/?]+)/);
  if(!m)continue;
  const symbol=decodeURIComponent(m[1]),exchange=decodeURIComponent(m[2]);
  const mini=document.createElement("div");
  mini.className="chart-mini";mini.dataset.symbol=symbol;mini.dataset.exchange=exchange;
  const title=document.createElement("div");title.className="chart-mini-label";
  title.innerHTML='<span class="chart-mini-title">日内分时 <span class="chart-mini-sub">Google Finance · 1D</span></span>'+
     '<button type="button" class="chart-open">放大 / 1个月 ↗</button>';
  const graph=document.createElement("div");graph.className="chart-mini-graph";graph.textContent="分时曲线加载中…";
  mini.append(title,graph);
  title.querySelector("button").addEventListener("click",()=>openChart(symbol,exchange));
  mini.addEventListener("click",e=>{if(!e.target.closest("button"))openChart(symbol,exchange);});
  stock.append(mini);
  if(viewportObserver)viewportObserver.observe(mini);
  else updateSpark(mini);
 }
}
async function updateSpark(mini){
 if(!mini.isConnected)return;
 const symbol=mini.dataset.symbol,graph=mini.querySelector(".chart-mini-graph");
 try{
  const result=await enqueue(()=>loadChart(symbol,"1D"));
  if(!mini.isConnected)return;
  const pic=miniSvg(result.points);
  graph.innerHTML=pic.html;
  const sub=mini.querySelector(".chart-mini-sub");
  if(sub){sub.textContent="Google Finance · "+time(result.points.at(-1).t,mini.dataset.exchange,"1M")+" · "+pic.pctLabel;sub.style.color=pic.color;}
  if(result.stale)graph.insertAdjacentHTML("beforeend",'<span class="chart-warning">缓存图表</span>');
 }catch(e){
  if(!mini.isConnected)return;
  graph.textContent="暂无法读取分时曲线";
  graph.title=String(e.message||e);
  graph.classList.add("chart-mini-error");
 }
}
const modal=document.createElement("dialog");
modal.id="chart-dialog";
modal.innerHTML='<div class="chart-dialog-shell"><header class="chart-dialog-top"><div><div class="chart-dialog-kicker">GOOGLE FINANCE · PRICE HISTORY</div><div class="chart-dialog-title" id="chart-title">价格曲线</div></div><button id="chart-close" class="chart-close" type="button" aria-label="关闭图表">×</button></header>'+
 '<div class="chart-range"><button data-range="1D" class="selected" type="button">1 日 · 分钟线</button><button data-range="1M" type="button">1 个月 · 日线</button></div>'+
 '<div class="chart-plot" id="chart-plot"><div class="chart-wait">正在读取 Google Finance 曲线…</div></div>'+
 '<div class="chart-dialog-foot"><span id="chart-foot"></span><a id="chart-source" target="_blank" rel="noopener noreferrer">打开 Google Finance ↗</a></div></div>';
document.body.append(modal);
el("chart-close").addEventListener("click",()=>modal.close());
modal.addEventListener("click",e=>{if(e.target===modal)modal.close();});
for(const b of modal.querySelectorAll("[data-range]"))b.addEventListener("click",()=>{
 range=b.dataset.range;
 for(const btn of modal.querySelectorAll("[data-range]"))btn.classList.toggle("selected",btn.dataset.range===range);
 updateModal();
});
function openChart(symbol,exchange){
 selected={symbol,exchange};
 range="1D";
 for(const b of modal.querySelectorAll("[data-range]"))b.classList.toggle("selected",b.dataset.range===range);
 if(!modal.open)modal.showModal();
 updateModal();
}
async function updateModal(){
 if(!selected)return;
 const {symbol,exchange}=selected,serial=++dialogFetchId;
 el("chart-title").textContent=symbol+":"+exchange+" · "+(range==="1D"?"日内分时":"近 1 个月");
 const plot=el("chart-plot");plot.innerHTML='<div class="chart-wait">正在获取 '+symbol+' 的真实价格曲线…</div>';
 el("chart-foot").textContent="";
 el("chart-source").href="https://www.google.com/finance/quote/"+symbol+":"+exchange+"?hl=en";
 try{
  const data=await loadChart(symbol,range);
  if(serial!==dialogFetchId||!modal.open)return;
  renderBig(data,symbol,exchange,range);
 }catch(e){
  if(serial!==dialogFetchId||!modal.open)return;
  plot.innerHTML='<div class="chart-wait chart-wait-error">暂时不能取得该时段的真实曲线数据。'+escapeHtml(String(e.message||e))+'</div>';
  el("chart-foot").textContent="不会用模拟价格替代真实曲线";
 }
}
function renderBig(data,symbol,exchange,period){
 const pts=data.points,W=920,H=290,left=12,right=88,top=23,bottom=34;
 const low=Math.min(...pts.map(p=>p.p)),high=Math.max(...pts.map(p=>p.p));
 const pad=Math.max((high-low)*.13,high*.0005),min=low-pad,max=high+pad;
 const tx0=pts[0].t,tx1=pts.at(-1).t,spanX=Math.max(tx1-tx0,1);
 const xx=t=>left+(t-tx0)/spanX*(W-left-right);
 const yy=p=>top+(1-(p-min)/(max-min))*(H-top-bottom);
 const d="M"+pts.map(p=>xx(p.t).toFixed(2)+","+yy(p.p).toFixed(2)).join(" L");
 const green=pts.at(-1).p>=pts[0].p,color=green?"#3bddaa":"#ff748b";
 const baseline=H-bottom;
 const area=d+" L "+xx(pts.at(-1).t).toFixed(2)+","+baseline+" L "+left+","+baseline+" Z";
 let guides="",labels="";
 for(let i=0;i<=4;i++){
  const p=max-(max-min)*i/4,y=yy(p);
  guides+='<line x1="'+left+'" y1="'+y+'" x2="'+(W-right)+'" y2="'+y+'" stroke="#29384d" stroke-dasharray="4 7"/>';
  labels+='<text x="'+(W-right+12)+'" y="'+(y+4)+'" fill="#9dafc8" font-size="12">'+escapeHtml(money(p,symbol))+'</text>';
 }
 for(let i=0;i<=4;i++){
  const t=tx0+(tx1-tx0)*i/4;
  labels+='<text x="'+xx(t)+'" y="'+(H-9)+'" text-anchor="middle" fill="#8195b2" font-size="12">'+escapeHtml(time(t,exchange,period))+'</text>';
 }
 const svg='<svg id="chart-large-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="'+escapeHtml(symbol+' Google Finance '+period+'价格走势')+'">'+
 '<defs><linearGradient id="fill-price" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity=".24"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
 guides+'<path d="'+area+'" fill="url(#fill-price)"/><path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'+labels+
 '<line id="chart-crosshair" x1="0" x2="0" y1="'+top+'" y2="'+baseline+'" stroke="#bccade" stroke-dasharray="3 3" opacity="0"/><circle id="chart-crossdot" cx="0" cy="0" r="5" fill="'+color+'" stroke="#080d18" stroke-width="2" opacity="0"/>'+
 '<rect id="chart-hitarea" x="'+left+'" y="'+top+'" width="'+(W-left-right)+'" height="'+(baseline-top)+'" fill="transparent"/></svg>';
 const plot=el("chart-plot");plot.innerHTML=svg+'<div class="chart-tooltip" id="chart-tooltip" hidden></div>';
 const quoteDate=new Date(pts.at(-1).t);
 el("chart-foot").textContent="真实数据点 "+pts.length+" 个 · "+(period==="1D"?"分钟分时，常规交易时段":"近一月日收盘")+" · 最新点 "+time(quoteDate.getTime(),exchange,period)+(data.stale?" · 缓存":"");
 const svgElement=el("chart-large-svg"),tip=el("chart-tooltip"),cross=el("chart-crosshair"),dot=el("chart-crossdot"),hit=el("chart-hitarea");
 function hover(event){
  const rect=svgElement.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*W;
  const timeGuess=tx0+Math.max(0,Math.min(1,(px-left)/(W-left-right)))*(tx1-tx0);
  let lo=0,hi=pts.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(pts[mid].t<timeGuess)lo=mid+1;else hi=mid;}
  let idx=lo;if(idx>0&&Math.abs(pts[idx-1].t-timeGuess)<Math.abs(pts[idx].t-timeGuess))idx--;
  const pt=pts[idx],x=xx(pt.t),y=yy(pt.p);
  cross.setAttribute("x1",x);cross.setAttribute("x2",x);cross.setAttribute("opacity","1");
  dot.setAttribute("cx",x);dot.setAttribute("cy",y);dot.setAttribute("opacity","1");
  tip.hidden=false;tip.textContent=time(pt.t,exchange,period)+" · "+money(pt.p,symbol);
  tip.style.left=Math.max(8,Math.min(rect.width-190,(x/W)*rect.width-80))+"px";
  tip.style.top="6px";
 }
 hit.addEventListener("pointermove",hover);
 hit.addEventListener("pointerdown",hover);
 hit.addEventListener("pointerleave",()=>{cross.setAttribute("opacity","0");dot.setAttribute("opacity","0");tip.hidden=true;});
}
function observe(container){
 if(!container)return;
 instrument(container);
 new MutationObserver(()=>instrument(container)).observe(container,{childList:true});
}
observe(el("rows"));observe(el("asia-rows"));
})();