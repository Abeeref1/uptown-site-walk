"""Build public/index.html for the hosted app from the Claude artifact version (art5)."""
import re, os, shutil, json, base64, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/art5/index.html'
s = open(SRC).read()
def rep(a, b, n=1):
    global s
    c = s.count(a); assert c == n, (c, a[:100]); s = s.replace(a, b)
def cut(start, end, new, incl_end=False):
    global s
    i = s.index(start); j = s.index(end, i)
    s = s[:i] + new + s[j + (len(end) if incl_end else 0):]

# 1. project data leaves the page: it comes from the server after sign-in
s, n = re.subn(r'<script type="application/json" id="p4d">.*?</script>\n', '', s, flags=re.S); assert n == 1
rep("const P=JSON.parse(document.getElementById('p4d').textContent);", "let P={K:[],A:[]};")
rep("function init(){T=THREE;", "function init(){P=window.P4D||P;T=THREE;")
rep("fetch('items.json').then(r=>r.json()).then(list=>{", "SW.data().then(list=>{")
rep("'/_blob/'", "'_blob/'", 2); rep('src="/_blob/', 'src="_blob/')
# 2. back end shim before the app script
shim = open(os.path.join(HERE, 'shim.js')).read()
rep('<script>\n{\nconst $=', '<script>\n' + shim + '\n</script>\n<script>\n{\nconst $=')
# 3. words: hosted sign-in, walks instead of weeks
for a, b in [('Sign in to Claude to save your walk. You are seeing the 13 Nov record.', 'Sign in to save your walk.'), ('Sign in to Claude to save.', 'Sign in to save.'),
             ('Ask the owner to share it with you as Editor (or Contributor).', 'Ask the admin for a walker PIN.'), ('Ask the owner for edit access.', 'Ask the admin for a walker PIN.')]:
    s = s.replace(a, b)
for a, b in [('the black <b>Next floor</b>', 'the purple <b>Next floor</b>'), ('Walk week of ', 'Walk of '), ('this week', 'this walk'), ('This week', 'This walk'), ('week of ', 'walk of '), ('Week of ', 'Walk of '), ('>Week<', '>Walk<')]:
    s = s.replace(a, b)
# 4. send sheet and report: no email from here, team via PIN
cut('<div class="howto"><b>Automatic email</b>', '<div class="tools"><button class="btn" type="button" id="sendx">Close</button>',
    '<div class="howto"><b>Give it to the team</b><span>The admin opens <b>Report</b>, then <b>Team and email</b>, adds the name, and sends the password on WhatsApp in one tap. Walkers fill, viewers only look.</span></div>\n  ')
cut('<h2 style="margin-top:16px">Email</h2>', "Only the owner and Editors change the addresses.</p>'}", '', incl_end=True)
# 5. walks: the team starts a walk, entries belong to it
rep("const ALL=()=>ITEMS.concat(EXTRA);", "const ALL=()=>ITEMS.concat(EXTRA);let WALKS={};\nconst walkList=()=>Object.values(WALKS).filter(w=>w&&w.id&&w.date).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);")
rep("function ctx(){const cw=weekOf(today());const wk=ui.wk?ds(ui.wk):cw;const isCur=+wk===+cw;return{wk,wkKey:iso(wk),date:isCur?today():wk,isCur,cw}}",
    "function ctx(){const ws=walkList(),last=ws[ws.length-1],w=(ui.wk&&ws.find(x=>x.id===ui.wk))||last;if(!w){const t=today();return{wk:t,wkKey:iso(t),date:t,isCur:true,cw:t,none:true}}"
    "const d=ds(w.date);return{wk:d,wkKey:w.id,date:d,isCur:w===last,cw:ds(last.date),walk:w}}")
cut('function renderTop(){', 'const t=tally(ALL());', r"""function renderTop(){const c=ctx();const sel=$('#wk');const ws=walkList().slice().reverse(),key=ws.map(w=>w.id+':'+w.title).join('|');
  if(sel.dataset.k!==key||sel.value!==c.wkKey){sel.innerHTML=ws.map((w,i)=>`<option value="${esc(w.id)}"${w.id===c.wkKey?' selected':''}>${esc(fmtS(ds(w.date)))} · ${esc(w.title||'Site walk')}${i===0?' (latest)':''}</option>`).join('')||'<option>No walk yet</option>';sel.dataset.k=key}
  $('#wdate').textContent=c.none?'Start a walk to begin':c.isCur?'Walk date '+DOW[c.date.getDay()]+' '+fmt(c.date):'Looking back: entries go into the walk of '+fmt(c.wk);
  """)
rep("if(t.id==='wk'){ui.wk=t.value===iso(weekOf(today()))?null:t.value;rerender();return}",
    "if(t.id==='wk'){const ws=walkList();ui.wk=ws.length&&t.value===ws[ws.length-1].id?null:t.value;rerender();return}")
rep("  db.doc('settings/main').onSnapshot(", "  db.collection('walks').onSnapshot(snap=>{const n={};for(const d of snap.docs)n[d.id]=d.data();WALKS=n;if(loaded)rerender()},()=>{});\n  db.doc('settings/main').onSnapshot(")
rep("function setEntry(r,patch,silent){", "function setEntry(r,patch,silent){if(ctx().none){toast('Start a new walk first.');return}")
rep('<select id="wk" aria-label="Walk week"></select>', '<select id="wk" aria-label="Walk"></select>\n  <button class="btn nwb" type="button" id="newwalk">+ New walk</button>')
rep('<button class="btn ghost" type="button" data-v="4d">${IC.cube} Open 4D</button>', '<button class="btn ghost" type="button" data-newwalk>+ New walk</button><button class="btn ghost" type="button" data-v="4d">${IC.cube} Open 4D</button>')
# install card on Home
cut('${instHide?\'\':`<div class="inst">', '`}`;\n', r"""${instHide||(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'':`<div class="inst"><span><b>Install it on your phone</b>Opens full screen from an icon, works in the basement and sends saves when signal is back.</span><span class="tools"><button class="btn pur" type="button" id="instgo">Install</button><button class="btn" type="button" id="instx">Later</button></span></div>`}`;
""", incl_end=True)
EMAIL_JS = r'''
/* ---------- email: walk report and escalations ---------- */
let MAILINFO=null;
async function mailInfo(){try{MAILINFO=await SW.api('mail')}catch(e){}return MAILINFO}
const mailNames=k=>{const n=MAILINFO&&MAILINFO[k];return n&&n.length?n.join(', '):''};
const mailLabel=k=>(k==='walk'?'Email report':'Email escalations')+(mailNames(k)?' to '+mailNames(k):'');
function mailRefresh(){mailInfo().then(()=>document.querySelectorAll('[data-mailbtn],[data-mailopen]').forEach(b=>{b.textContent=mailLabel(b.dataset.mailbtn||'walk')}))}
const b64=blob=>new Promise(z=>{const r=new FileReader();r.onload=()=>z(String(r.result).split(',')[1]||'');r.readAsDataURL(blob)});
function escRows(){return ALL().map(it=>({it,k:CALC.get(it.r)})).filter(x=>x.k.esc==='ESCALATE').sort((a,b)=>(b.k.late||0)-(a.k.late||0))
  .map(({it,k})=>({b:it.b,l:it.l,w:it.w+(it.loc?' ('+it.loc+')':''),st:k.st,late:k.late,a:k.a??0,p:k.p??0,c:(k.cur&&k.cur.c)||''}))}
function mailMsg(m){const el=$('#mailst');if(el&&$('#sendov').classList.contains('show'))el.textContent=m;else toast(m)}
function mailApp(to,subject,body){const b=body.length>1800?body.slice(0,1800)+'\n(more in the app)':body;location.href='mailto:'+(to||[]).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(b)}
const noOne=k=>SW.isAdmin()?'No one gets '+(k==='walk'?'the walk report':'escalations')+' yet. Open Report, then Team and email, and add the person under Email.':'No one is set to get '+(k==='walk'?'the report':'escalations')+'. Ask the admin.';
async function emailWalk(btn){if(!SW.canSend()){toast('View only.');return}const c=ctx(),t=tally(ALL());if(btn)btn.disabled=true;
  try{await mailInfo();if(!MAILINFO){mailMsg('No signal. Try again.');return}if(!MAILINFO.walk.length){mailMsg(noOne('walk'));return}
    const note=(($('#mailnote')||{}).value||'').trim(),wk=fmt(c.wk);
    if(!MAILINFO.on){mailApp(MAILINFO.walkEmails,'Site walk report: walk of '+wk+' (Uptown Phase 2)',(note?note+'\n\n':'')+reportText()+'\n\nOpen the app: '+location.href.split('#')[0]);mailMsg('Your email app is open with the report. Press Send there.');return}
    mailMsg('Making the PDF and Excel…');window.SW_CAP=[];
    try{await makePdf();await makeXlsx()}catch(e){}
    const got=window.SW_CAP||[];window.SW_CAP=null;const s2=$('#sendst');if(s2)s2.textContent='';
    const files=await Promise.all(got.map(async f=>({filename:f.filename,content:await b64(f.blob)})));
    mailMsg('Sending…');
    const sum={wkLabel:wk,title:(c.walk&&c.walk.title)||'',note,t:{walked:t.walked,walk:t.walk,done:t.done,behind:t.behind,ns:t.ns,esc:t.esc,worst:t.worst},
      areas:BUILD.map(b=>[b,tally(ALL().filter(i=>i.b===b))]).filter(x=>x[1].n).map(([b,x])=>[b,x.n,x.walked,x.done,x.behind,x.ns,x.esc,x.worst]),
      top:escRows().slice(0,10),esc:escRows(),text:reportText(),files};
    const r=await SW.api('mail/walk',{method:'POST',body:JSON.stringify(sum)});
    mailMsg('Sent to '+r.to.join(', ')+(files.length?' with the PDF and Excel.':'.'));if($('#mailnote'))$('#mailnote').value=''}
  catch(e){mailMsg(e.code==='no_one'?noOne('walk'):(e.message||'Not sent. Check signal and try again.'))}
  finally{window.SW_CAP=null;if(btn)btn.disabled=false}}
async function emailEsc(btn){if(!SW.canSend()){toast('View only.');return}const rows=escRows();if(!rows.length){toast('Nothing to escalate.');return}if(btn)btn.disabled=true;
  try{await mailInfo();if(!MAILINFO){toast('No signal. Try again.');return}if(!MAILINFO.esc.length){toast(noOne('esc'));return}const wk=fmt(ctx().wk);
    if(!MAILINFO.on){mailApp(MAILINFO.escEmails,'Escalation list: '+rows.length+' items (Uptown Phase 2, walk of '+wk+')',rows.map(x=>`- ${x.b} ${x.l}: ${x.w}. ${x.late} days late, ${Math.round(x.a)}% of ${Math.round(x.p)}%.${x.c?' '+x.c:''}`).join('\n')+'\n\nOpen the app: '+location.href.split('#')[0]);return}
    toast('Sending…');const r=await SW.api('mail/esc',{method:'POST',body:JSON.stringify({wkLabel:wk,items:rows})});toast('Escalation list sent to '+r.to.join(', ')+'.')}
  catch(e){toast(e.code==='no_one'?noOne('esc'):(e.message||'Not sent.'))}finally{if(btn)btn.disabled=false}}
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.mailbtn==='walk'){emailWalk(t);return}if(t.dataset.mailbtn==='esc'){emailEsc(t);return}
  if(t.dataset.mailopen!==undefined){$('#send').click();return}if(t.id==='send'||t.id==='swtx'||t.dataset.v)mailRefresh()});
SW.ready.then(mailRefresh);
'''
newwalk_js = r"""
/* ---------- new walk ---------- */
function newWalk(){if(!db||canWrite===false){toast('Only walkers and the admin start a walk.');return}const f=$('#nwf');f.elements.date.value=iso(today());f.elements.title.value='';$('#nwov').classList.add('show')}
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.id==='newwalk'||t.dataset.newwalk!==undefined){newWalk();return}if(t.id==='nwx')$('#nwov').classList.remove('show')});
$('#nwov').addEventListener('click',e=>{if(e.target.id==='nwov')$('#nwov').classList.remove('show')});
$('#nwf').addEventListener('submit',e=>{e.preventDefault();const el=e.target.elements,date=el.date.value;if(!date)return;let id=date,n=2;while(WALKS[id])id=date+'-'+(n++);
  const w={id,date,title:el.title.value.trim()||'Site walk',by:ME.id||null,at:new Date().toISOString()};WALKS={...WALKS,[id]:w};const ws=walkList();ui.wk=ws[ws.length-1].id===id?null:id;
  db.doc('walks/'+id).set(w).then(()=>toast('New walk started: '+fmt(ds(date))),()=>toast('Not saved. Check signal.'));$('#nwov').classList.remove('show');rerender();if(ui.view!=='home')show('home')});
"""
rep('/* ---------- start ---------- */', newwalk_js + EMAIL_JS + '\n/* ---------- start ---------- */')

# 7. email: send sheet, report, issues; fix the send sheet; light PDF header
rep("$('#sendto').textContent=SET.emails||'the owner';", "")
rep('<p class="src" style="margin:0">Pick a file, then send it on WhatsApp or email. On the phone it opens the share menu.</p>',
    '<div class="howto"><b>Email it</b><span>One tap sends the summary, the PDF and the Excel file.</span><label style="margin:6px 0 0">Note for the email (optional)<input id="mailnote" maxlength="1500" placeholder="e.g. T3 L14 slab pour moved to Sunday"></label><div class="tools" style="margin-top:8px"><button class="btn pur" type="button" data-mailbtn="walk">Email report</button></div><p class="src" id="mailst" style="margin:4px 0 0;font-weight:600"></p></div>\n  <p class="src" style="margin:0">Or pick a file and send it on WhatsApp. On the phone it opens the share menu.</p>')
rep('<div class="box"><h2>Share this walk</h2><div class="tools">', '<div class="box"><h2>Share this walk</h2><div class="tools"><button class="btn pur" type="button" data-mailopen>${esc(mailLabel(\'walk\'))}</button>')
rep('<button class="btn" type="button" id="copy">Copy report text</button></div>\n</div>',
    '<button class="btn" type="button" id="copy">Copy report text</button></div>\n</div>${SW.isAdmin()?`<div class="box"><h2>Team and email</h2><p class="src">Add people, make passwords, and choose who gets the walk report and the escalation emails.</p><div class="tools"><button class="btn pur" type="button" id="swteam">Open Team and email</button></div></div>`:\'\'}')
rep("'to escalate'}</h2>", "'to escalate'}</h2>${SW.canSend()&&rows.length?`<div class=\"tools\" style=\"margin:6px 0\"><button class=\"btn pur\" type=\"button\" data-mailbtn=\"esc\">${esc(mailLabel('esc'))}</button></div>`:''}")
rep("doc.setFillColor(30,30,30);doc.rect(0,0,W,24,'F');const logo=await blobURL('logo.png');if(logo)doc.addImage(logo,'PNG',10,7,40,6.6);\n  doc.setTextColor(255);",
    "doc.setFillColor(139,58,163);doc.rect(0,23,W,1.2,'F');const lg1=await blobURL('dmcc.png'),lg2=await blobURL('mace.png');if(lg1)doc.addImage(lg1,'PNG',10,7.5,25,7);doc.setDrawColor(210);doc.line(38.5,7.5,38.5,14.5);if(lg2)doc.addImage(lg2,'PNG',42,8,36.4,6);\n  doc.setTextColor(30);")
rep("Uptown Phase 2  |  Weekly Site Walk',56,12)", "Uptown Phase 2  |  Site Walk',84,12)")
rep("+'   |   Mace PMC, contractor ASC',56,18)", "+'   |   Mace PMC, contractor ASC',84,18)")
rep("const head={fillColor:[30,30,30]", "const head={fillColor:[110,42,131]")

# 6. markup: header tools, overlays, offline line, PWA tags
rep('<div class="me" id="me"></div>', '<div class="me" id="me"></div>\n  <div class="swx" id="swx"></div>')
rep('<div class="note hidden" id="note"></div>', '<div class="note hidden" id="note"></div>\n<div class="note hidden" id="swq"></div>')
overlays = r"""<div class="over" id="swlogin"><form class="sheet swl" id="swf" autocomplete="on">
  <div class="swlh"><img src="dmcc.png" alt="DMCC"><span></span><img src="mace.png" alt="Mace"></div>
  <h2>Uptown Phase 2 site walk</h2><p class="src" style="margin:0">Type your password.</p>
  <label>Password<span style="display:flex;gap:8px;align-items:stretch"><input name="pin" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" required style="font-size:22px;letter-spacing:.08em;text-align:center;flex:1;min-width:0"><button type="button" class="btn" id="swshow" style="min-width:70px">Show</button></span></label>
  <button class="btn pur" type="submit" id="swbtn" style="min-height:52px;font-size:17px">Sign in</button>
  <p class="src" id="swerr" style="margin:0;color:var(--red);font-weight:600"></p><p class="src" style="margin:0">No password yet? Ask the site walk admin.</p></form></div>
<div class="over" id="swteamov"><div class="sheet" style="width:min(720px,100%)" role="dialog" aria-label="Team">
  <h2 style="margin:0;font:700 24px/1.1 'Barlow Semi Condensed',Barlow,sans-serif">Team</h2>
  <form class="tools" id="swadd"><input name="name" placeholder="Person's name" required style="flex:1 1 200px"><select name="role"><option value="walker">Walker (fills)</option><option value="viewer">Viewer (looks)</option><option value="admin">Admin</option></select><button class="btn pur" type="submit">Add and make password</button></form>
  <div id="swtmsg"></div><div id="swtbody" style="overflow-x:auto"></div>
  <div id="swmail" style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:10px"></div>
  <div class="tools"><button class="btn" type="button" id="swtx">Close</button></div></div></div>
<div class="over" id="swih"><div class="sheet" role="dialog" aria-label="Install"><h2 style="margin:0">Install the app</h2>
  <div class="howto"><b>iPhone (Safari)</b><span>Tap Share, then <b>Add to Home Screen</b>.</span></div><div class="howto"><b>Android (Chrome)</b><span>Tap the menu ⋮, then <b>Install app</b> or <b>Add to Home screen</b>.</span></div><div class="howto"><b>Laptop (Chrome or Edge)</b><span>Click the install icon at the right of the address bar.</span></div>
  <div class="tools"><button class="btn" type="button" id="swihx">Close</button></div></div></div>
<div class="over" id="nwov"><form class="sheet" id="nwf"><h2 style="margin:0;font:700 24px/1.1 'Barlow Semi Condensed',Barlow,sans-serif">Start a new site walk</h2>
  <label>Walk date<input type="date" name="date" required></label><label>Name<input name="title" maxlength="60" placeholder="Weekly site walk"></label>
  <p class="src" style="margin:0">Everyone sees the new walk at once. Each item keeps its last % as <b>Last</b>, so you only change what moved.</p>
  <div class="tools"><button class="btn pur" type="submit">Start walk</button><button class="btn" type="button" id="nwx">Cancel</button></div></form></div>
"""
rep('<div class="over" id="lb">', overlays + '<div class="over" id="lb">')
css = r"""
.swx{display:flex;gap:6px;flex:none}.swx .btn{white-space:nowrap}
@media(max-width:1440px){header.appbar .me span{display:none}}.btn.swb{min-height:36px;padding:4px 10px;background:none;color:#ddd;border-color:#444;font-size:14px}
.btn.nwb{min-height:40px;background:var(--pur2);color:#fff;border:0;font-weight:700}
#swlogin{background:#141414;z-index:60}.swl{gap:12px}.swl h2{margin:0;font:700 26px/1.1 "Barlow Semi Condensed",Barlow,sans-serif}
.swlh{background:#141414;border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center}.swlh img{height:22px}.swlh span{width:1px;height:20px;background:#444}
#swq{background:var(--orgbg);font-weight:600}
.over .sheet{max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain}
#swmail .tog{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
@media(max-width:899px){.swx .swb{padding:4px 8px;font-size:13px}.swx #swteam{display:none}.btn.nwb{padding:6px 10px;font-size:14px;flex:none;min-height:38px}.week .wprog{display:none}.hcta .btn{width:100%}.week select{flex:1 1 auto!important;min-width:0;width:0}}
"""
css += r'''
/* ---------- light only: no black backgrounds ---------- */
header.appbar{background:#fff;color:#1e1e1e;box-shadow:0 1px 0 var(--line)}
header.appbar .brand .sep{background:#d9d6de}
header.appbar .proj{color:#6b6b6b}
nav.tabs{background:#f1eff4}
nav.tabs button{color:#4a4a4a}
nav.tabs button:hover{color:#1e1e1e}
nav.tabs button[aria-current=page]{background:var(--pur2);color:#fff}
header.appbar .me{color:#333}
.btn.swb{color:#333;border-color:#dcd9e0;background:#fff}
.hero{background:linear-gradient(135deg,#ffffff 0%,#f6eefa 50%,#ecdcf4 100%);color:#1e1e1e;border:1px solid #e6dcec;box-shadow:0 10px 28px rgba(110,42,131,.10)}
.hero .sky{opacity:.10!important}.hero .sky g[fill]{fill:#6e2a83}.hero .sky g[stroke]{stroke:#fff}
.eyebrow{color:#7a3a92}.hdate{color:#555}
.btn.cta{background:var(--pur2);color:#fff;box-shadow:0 6px 16px rgba(110,42,131,.28)}.btn.cta small{color:#f1e2f7}
.btn.ghost{background:#fff;color:#1e1e1e;border:1px solid #e1d6e8}
.ring svg circle:first-child{stroke:#e8dcef}.ring .rt b{color:#1e1e1e}.ring .rt span{color:#666}
.btn.next{background:linear-gradient(90deg,#6e2a83,#8b3aa3);color:#fff;box-shadow:0 8px 20px rgba(110,42,131,.28)}
.btn.next small{color:#f0dff6}.btn.next .nn{color:#fff}
.toast{background:#3b1d48}
header.appbar .me{display:none!important}
.chip[aria-pressed=true]{background:var(--pur2);border-color:var(--pur2);color:#fff}
#swlogin{background:#f3f1f5}
.swlh{background:#fff;border:1px solid var(--line)}
.btn.dark{background:#fff;color:#4a1f5a;border:1px solid #d9c7e3}.swlh span{background:#d9d6de}
@media(max-width:899px){
 nav.tabs{background:#fff!important;border-top:1px solid var(--line);box-shadow:0 -4px 16px rgba(0,0,0,.05)}
 nav.tabs button{color:#777}
 nav.tabs button[aria-current=page]{color:var(--pur2)}
 nav.tabs button[aria-current=page] .ic{background:var(--pur2);color:#fff}
}
'''
rep('</style>\n<script>new MutationObserver', css + '</style>\n<script>new MutationObserver')
rep('<html lang="en">', '<html lang="en" data-theme="light">')
rep('<meta name="theme-color" content="#141414">', '<meta name="theme-color" content="#ffffff">')
rep('<div class="brand"><img src="dmcc_white.png" alt="DMCC"><span class="sep"></span><img src="logo.png" alt="Mace"></div>', '<div class="brand"><img src="dmcc.png" alt="DMCC"><span class="sep"></span><img src="mace.png" alt="Mace"></div>')
rep('<title>Uptown Site Walk</title>', '<title>Uptown Phase 2 Site Walk</title>\n<link rel="manifest" href="manifest.webmanifest">')
out = os.path.join(ROOT, 'public'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(s)
print('index.html', len(s))
