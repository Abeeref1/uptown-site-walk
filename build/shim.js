/* ---------- hosted back end: sign-in, shared data, photos, offline queue ---------- */
window.SW=(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ME=null,okReady,ready=new Promise(r=>okReady=r),SEQ=0,polling=false,NAMES=null;
const DOCS={},subs=[],primed=new Set();
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function merge(cur,op){if(op.op==='delete')return null;if(op.op==='set'||!cur)return clone(op.data);const o={...cur};for(const k in op.data)o[k]=isObj(op.data[k])&&isObj(o[k])?{...o[k],...op.data[k]}:op.data[k];return o}
let Q=[];try{Q=JSON.parse(localStorage.getItem('sw-q')||'[]')}catch(e){}
const saveQ=()=>{try{localStorage.setItem('sw-q',JSON.stringify(Q))}catch(e){}badge()};
function view(col,id){let d=(DOCS[col]||{})[id];for(const op of Q)if(op.col===col&&op.id===id)d=merge(d,op);return d}
function snapDoc(col,id){const d=view(col,id);return{exists:d!=null,id,data:()=>d}}
function snapCol(col){const ids=new Set(Object.keys(DOCS[col]||{}));for(const op of Q)if(op.col===col)ids.add(op.id);
  const docs=[];for(const id of ids){const d=view(col,id);if(d!=null)docs.push({id,data:()=>d})}return{docs,metadata:{fromCache:false}}}
function emit(cols,all){for(const s of subs)if(all||cols.has(s.col)){primed.add(s);try{s.cb(s.id?snapDoc(s.col,s.id):snapCol(s.col))}catch(e){console.error(e)}}}
async function api(path,opt){opt=opt||{};let r;
  try{r=await fetch('api/'+path,{credentials:'same-origin',...opt,headers:{...(opt.body&&!(opt.body instanceof Blob)?{'content-type':'application/json'}:{}),...(opt.headers||{})}})}
  catch(e){throw Object.assign(new Error('offline'),{code:'unavailable',offline:true})}
  if(r.status===401&&path!=='login'){login();throw Object.assign(new Error('Sign in first.'),{code:'unauthenticated'})}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||('Error '+r.status)),{code:j.code||(r.status===403?'invalid_argument':'http')});return j}
async function poll(){if(polling||!ME)return;polling=true;
  try{await flush();const j=await api('changes?since='+SEQ);const cols=new Set();if(j.full){for(const k in DOCS)DOCS[k]={}}
    for(const c of j.docs){const m=DOCS[c.col]||(DOCS[c.col]={});if(c.data==null)delete m[c.id];else m[c.id]=c.data;cols.add(c.col)}
    const first=!SEQ;SEQ=j.seq;emit(cols,first||j.full);for(const s of subs)if(!primed.has(s)){primed.add(s);s.cb(s.id?snapDoc(s.col,s.id):snapCol(s.col))}}
  catch(e){}finally{polling=false;badge()}}
let flushing=null;
function flush(){if(flushing)return flushing;flushing=(async()=>{while(Q.length){const op=Q[0];
    try{const j=await api('doc',{method:'POST',body:JSON.stringify(op)});Q.shift();saveQ();if(op._ok)op._ok()}
    catch(e){if(e.offline)break;Q.shift();saveQ();if(op._no)op._no(e);else console.warn('dropped',op,e)}}})().finally(()=>{flushing=null});return flushing}
const pendingCb=new Map();
function write(op){return new Promise((ok,no)=>{const o={op:op.op,col:op.col,id:op.id,data:op.data};Q.push(o);saveQ();
    Object.defineProperty(o,'_ok',{value:ok,enumerable:false});Object.defineProperty(o,'_no',{value:no,enumerable:false});
    flush().then(()=>{if(Q.includes(o)){ok();}})})}
function badge(){const n=Q.length,el=$('#swq');if(!el)return;el.textContent=n?`Offline: ${n} save${n>1?'s':''} waiting, they send when signal is back`:'';el.classList.toggle('hidden',!n)}
addEventListener('online',()=>poll());
setInterval(poll,6000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
const db={
  doc(p){const [col,...rest]=p.split('/'),id=rest.join('/');return{
    get:async()=>{await ready;if(!SEQ)await poll();return snapDoc(col,id)},
    set:d=>write({op:'set',col,id,data:d}),
    update:d=>write({op:'update',col,id,data:d}),
    delete:()=>write({op:'delete',col,id,data:{}}),
    onSnapshot(cb,err){const s={col,id,cb};subs.push(s);if(SEQ){primed.add(s);cb(snapDoc(col,id))}return()=>subs.splice(subs.indexOf(s),1)}}},
  collection(col){return{onSnapshot(cb,err){const s={col,cb};subs.push(s);if(SEQ){primed.add(s);cb(snapCol(col))}return()=>subs.splice(subs.indexOf(s),1)}}}};
const avatar=n=>{const i=String(n||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();return'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#8b3aa3"/><text x="20" y="25.5" font-family="Arial" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${i}</text></svg>`)};
const user={
  me:async()=>{await ready;return{id:ME.id,name:ME.name,avatarUrl:avatar(ME.name)}},
  can:async()=>{await ready;return ME.role!=='viewer'},
  canEdit:async()=>{await ready;return ME.role==='admin'},
  profiles:async ids=>{if(!NAMES||ids.some(id=>!NAMES[id]))NAMES=await api('names').catch(()=>NAMES||({}));const o={};for(const id of ids)o[id]={name:NAMES[id]||'Someone'};return o}};
const assets={upload:async blob=>{const r=await api('photo',{method:'POST',body:blob,headers:{'content-type':blob.type||'image/jpeg'}});return{id:r.id}}};
const downloads={save:async({filename,data})=>{const b=data instanceof Blob?data:new Blob([data]);const f=new File([b],filename,{type:b.type||'application/octet-stream'});
  if(matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:filename});return}catch(e){if(e&&e.name==='AbortError')throw Object.assign(e,{code:'declined'})}}
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}};
window.claude={use:async n=>{await ready;return{db,user,assets,downloads}[n]||null}};

/* sign in */
function login(msg){ME=null;const o=$('#swlogin');if(!o)return;o.classList.add('show');$('#swerr').textContent=msg||'';setTimeout(()=>{try{$('#swf').elements.pin.focus()}catch(e){}},60)}
async function start(){try{const j=await api('me');ME=j.user;afterLogin()}catch(e){if(e.offline){const c=localStorage.getItem('sw-me');if(c){ME=JSON.parse(c);afterLogin();return}}login()}}
function afterLogin(){try{localStorage.setItem('sw-me',JSON.stringify(ME))}catch(e){}$('#swlogin')?.classList.remove('show');okReady();poll();tools()}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('#swshow');if(!t)return;const f=$('#swf').elements.pin;const show=f.type==='password';f.type=show?'text':'password';t.textContent=show?'Hide':'Show';f.focus()});
document.addEventListener('submit',async e=>{if(e.target.id!=='swf')return;e.preventDefault();const el=e.target.elements,b=$('#swbtn');b.disabled=true;$('#swerr').textContent='';
  try{const j=await api('login',{method:'POST',body:JSON.stringify({pin:el.pin.value})});ME=j.user;el.pin.value='';afterLogin()}
  catch(x){$('#swerr').textContent=x.offline?'No signal. Try again when online.':x.message}finally{b.disabled=false}});
async function data(){await ready;for(let i=0;;i++){
  try{const r=await fetch('api/data',{credentials:'same-origin'});if(r.status===401){login();await new Promise(z=>{const t=setInterval(()=>{if(ME){clearInterval(t);z()}},500)});continue}
    if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();if(!d.items||!d.items.length)throw new Error('empty');window.P4D=d.p4d;const n=$('#swq');if(n&&n.dataset.c){n.textContent='';n.classList.add('hidden');delete n.dataset.c}return d.items}
  catch(e){const n=$('#swq');if(n){n.textContent='Connecting to the server…';n.classList.remove('hidden');n.dataset.c='1'}await new Promise(z=>setTimeout(z,Math.min(15000,2000*(i+1))))}}}

/* header tools: team, sign out, install */
let deferred=null;addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;tools()});
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function tools(){const t=$('#swx');if(!t||!ME)return;
  t.innerHTML=`${deferred&&!standalone()?'<button class="btn swb" type="button" id="swinst">Install app</button>':''}${ME.role==='admin'?'<button class="btn swb" type="button" id="swteam">Team</button>':''}<button class="btn swb" type="button" id="swout">Sign out</button>`}
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;
  if(t.id==='swout'){try{await api('logout',{method:'POST'})}catch(x){}try{localStorage.removeItem('sw-me')}catch(x){}location.reload();return}
  if(t.id==='swinst'||t.id==='instgo'){if(deferred){deferred.prompt();await deferred.userChoice.catch(()=>{});deferred=null;tools()}else{const h=$('#swih');if(h)h.classList.add('show')}return}
  if(t.id==='swteam'){team();return}
  if(t.id==='swtx'||t.id==='swihx'){t.closest('.over').classList.remove('show');return}
  if(t.dataset.rmu){if(!confirmRm(t))return;try{await api('users?id='+encodeURIComponent(t.dataset.rmu),{method:'DELETE'});team()}catch(x){alertBox(x.message)}return}
  if(t.dataset.pinu){try{const r=await api('users',{method:'POST',body:JSON.stringify({id:t.dataset.pinu})});showPin(r)}catch(x){alertBox(x.message)}return}
  if(t.id==='swcopy'){navigator.clipboard.writeText(t.dataset.msg).then(()=>{t.textContent='Copied'},()=>{});return}});
function confirmRm(t){if(t.dataset.sure)return true;t.dataset.sure='1';t.textContent='Tap again to remove';setTimeout(()=>{if(t.isConnected){delete t.dataset.sure;t.textContent='Remove'}},4000);return false}
function alertBox(m){const s=$('#swtmsg');if(s)s.textContent=m}
async function team(){const o=$('#swteamov');o.classList.add('show');const box=$('#swtbody');box.innerHTML='<p class="src">Loading…</p>';
  try{const list=await api('users');box.innerHTML=`<table class="stack"><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>${list.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td style="white-space:nowrap"><button class="btn" type="button" data-pinu="${esc(u.id)}">New password</button>${u.id===ME.id?'':` <button class="btn" type="button" data-rmu="${esc(u.id)}">Remove</button>`}</td></tr>`).join('')}</tbody></table>`}
  catch(x){box.innerHTML='<p class="src">'+esc(x.message)+'</p>'}}
document.addEventListener('submit',async e=>{if(e.target.id!=='swadd')return;e.preventDefault();const el=e.target.elements;
  try{const r=await api('users',{method:'POST',body:JSON.stringify({name:el.name.value,role:el.role.value})});e.target.reset();showPin(r)}catch(x){alertBox(x.message)}});
function showPin(r){const url=location.href.split('#')[0];const msg=`Uptown Phase 2 site walk\n${url}\nPassword for ${r.name}: ${r.pin}`;
  $('#swtmsg').innerHTML=`<div class="howto"><b>Password for ${esc(r.name)}: <span style="font-size:22px;letter-spacing:.12em">${esc(r.pin)}</span></b><span>Send it now. It is shown once.</span><div class="tools"><a class="btn pur" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Send on WhatsApp</a><button class="btn" type="button" id="swcopy" data-msg="${esc(msg)}">Copy</button></div></div>`;team()}
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
start();
return{data,ready,api}})();
