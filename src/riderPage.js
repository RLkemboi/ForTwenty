// The driver page: one private link per rider. Shows an offer (accept / decline), the active delivery, and the day's totals.
// It asks the server for updates every 5 seconds while it is open. All text is inserted with textContent, never as HTML.
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const riderPage = (token, name) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Rider</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;max-width:460px;margin:0 auto;padding:14px;color:#1a1a1a;background:#fafaf8}
h1{font-size:20px;margin:2px 0}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.c{background:#fff;border:1px solid #ddd;border-radius:14px;padding:14px;margin:10px 0}.c>div{margin:8px 0}.c small{display:block;color:#666;font-size:12px}.c b{font-size:18px}
.offer{border:2px solid #f0b400;background:#fffbea}.timer{font-size:28px;font-weight:700;text-align:center;margin:6px 0}
button,.btn{display:block;width:100%;text-align:center;text-decoration:none;font:600 17px system-ui;border:0;border-radius:12px;padding:15px;margin:8px 0;cursor:pointer;color:#fff;background:#1d7a46}
.no{background:#fff;color:#a22;border:1px solid #d99}.map{background:#2563c9}.call{background:#444}.sw{width:auto;padding:9px 16px;font-size:15px;margin:0;background:#888}.sw.on{background:#1d7a46}
.muted{color:#666;font-size:14px;text-align:center}.err{color:#a22;text-align:center;min-height:20px}.row{display:flex;gap:10px}.row>div{flex:1}
</style>
<body><div class="top"><h1>Hi ${esc(name)}</h1><button id="duty" class="sw" type="button">...</button></div>
<div id="offer"></div><div id="active"></div><div id="idle" class="muted"></div>
<div class="c row"><div><small>Delivered today</small><b id="n">0</b></div><div><small>Earned today</small><b id="e">KSh 0</b></div><div><small>Owed to you</small><b id="o">KSh 0</b></div></div>
<p id="err" class="err" role="alert"></p>
<script>
var T=${JSON.stringify(token)},S=null,seen='';
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function api(p,b){return fetch('/api/rider/'+T+'/'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})}
function field(card,label,val){var d=el('div');d.appendChild(el('small',0,label));d.appendChild(el('b',0,val));card.appendChild(d)}
function link(href,cls,text){var a=el('a','btn '+cls,text);a.href=href;return a}
function act(btn,path,body,confirmText){btn.onclick=function(){if(confirmText&&!confirm(confirmText))return;btn.disabled=true;api(path,body).then(function(r){if(!r.ok)document.getElementById('err').textContent=r.j.error||'That did not work.';load()})}}
function render(s){
  S=s;S._at=Date.now();document.getElementById('err').textContent='';
  var d=document.getElementById('duty');d.textContent=s.on_duty?'On duty':'Off duty';d.className='sw'+(s.on_duty?' on':'');
  d.onclick=function(){d.disabled=true;api('duty',{on:!s.on_duty}).then(function(){d.disabled=false;load()})};
  document.getElementById('n').textContent=s.today.deliveries;document.getElementById('e').textContent='KSh '+s.today.earned_kes;document.getElementById('o').textContent='KSh '+s.owed_kes;
  var of=document.getElementById('offer');of.textContent='';
  if(s.offer){
    var c=el('div','c offer');c.appendChild(el('small',0,'New delivery offer'));
    var t=el('div','timer',s.offer.seconds_left+'s');t.id='tm';c.appendChild(t);
    field(c,'Deliver to',s.offer.address);field(c,'Order',s.offer.product+' x '+s.offer.qty);field(c,'You earn','KSh '+s.offer.cut_kes);
    if(s.offer.map)c.appendChild(link(s.offer.map,'map','Preview the pin'));
    var a=el('button',0,'Accept');act(a,'accept',{order_id:s.offer.id});c.appendChild(a);
    var n=el('button','no','Decline');act(n,'decline',{order_id:s.offer.id});c.appendChild(n);
    of.appendChild(c);
    if(seen!==s.offer.id){seen=s.offer.id;try{if(navigator.vibrate)navigator.vibrate([300,150,300])}catch(e){}}
  }
  var ac=document.getElementById('active');ac.textContent='';
  if(s.active){
    var c2=el('div','c');c2.appendChild(el('small',0,'Current delivery'));
    field(c2,'Deliver to',s.active.address);field(c2,'Order',s.active.product+' x '+s.active.qty);field(c2,'Already paid','KSh '+s.active.total_kes+' (do not collect cash)');field(c2,'You earn','KSh '+s.active.cut_kes);
    if(s.active.map)c2.appendChild(link(s.active.map,'map','Open the pin in Maps'));
    c2.appendChild(link('tel:+'+s.active.phone,'call','Call customer +'+s.active.phone));
    var dn=el('button',0,'Mark delivered');act(dn,'deliver',{order_id:s.active.id},'Mark this order as delivered?');c2.appendChild(dn);
    ac.appendChild(c2);
  }
  document.getElementById('idle').textContent=s.offer||s.active?'':(s.on_duty?(s.mode==='offers'?'Waiting for orders. Keep this page open.':'Orders arrive by text message.'):'You are off duty. Switch on duty to get orders.');
}
function load(){api('state').then(function(r){if(r.ok)render(r.j);else document.getElementById('err').textContent=r.j.error||'Could not load.'}).catch(function(){document.getElementById('err').textContent='No connection. Retrying...'})}
setInterval(function(){var t=document.getElementById('tm');if(t&&S&&S.offer){var left=Math.max(0,S.offer.seconds_left-Math.floor((Date.now()-S._at)/1000));t.textContent=left+'s'}},1000);
setInterval(load,5000);load();
</script></html>`;
