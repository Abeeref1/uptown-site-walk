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
for a, b in [('Walk week of ', 'Walk of '), ('this week', 'this walk'), ('This week', 'This walk'), ('week of ', 'walk of '), ('Week of ', 'Walk of '), ('>Week<', '>Walk<')]:
    s = s.replace(a, b)
# 4. send sheet and report: no email from here, team via PIN
cut('<div class="howto"><b>Automatic email</b>', '<div class="tools"><button class="btn" type="button" id="sendx">Close</button>',
    '<div class="howto"><b>Give it to the team</b><span>The admin presses <b>Team</b> at the top, adds the name, and sends the password on WhatsApp in one tap. Walkers fill, viewers only look.</span></div>\n  ')
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
newwalk_js = r"""
/* ---------- new walk ---------- */
function newWalk(){if(!db||canWrite===false){toast('Only walkers and the admin start a walk.');return}const f=$('#nwf');f.elements.date.value=iso(today());f.elements.title.value='';$('#nwov').classList.add('show')}
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.id==='newwalk'||t.dataset.newwalk!==undefined){newWalk();return}if(t.id==='nwx')$('#nwov').classList.remove('show')});
$('#nwov').addEventListener('click',e=>{if(e.target.id==='nwov')$('#nwov').classList.remove('show')});
$('#nwf').addEventListener('submit',e=>{e.preventDefault();const el=e.target.elements,date=el.date.value;if(!date)return;let id=date,n=2;while(WALKS[id])id=date+'-'+(n++);
  const w={id,date,title:el.title.value.trim()||'Site walk',by:ME.id||null,at:new Date().toISOString()};WALKS={...WALKS,[id]:w};const ws=walkList();ui.wk=ws[ws.length-1].id===id?null:id;
  db.doc('walks/'+id).set(w).then(()=>toast('New walk started: '+fmt(ds(date))),()=>toast('Not saved. Check signal.'));$('#nwov').classList.remove('show');rerender();if(ui.view!=='home')show('home')});
"""
rep('/* ---------- start ---------- */', newwalk_js + '\n/* ---------- start ---------- */')
# 6. markup: header tools, overlays, offline line, PWA tags
rep('<div class="me" id="me"></div>', '<div class="me" id="me"></div>\n  <div class="swx" id="swx"></div>')
rep('<div class="note hidden" id="note"></div>', '<div class="note hidden" id="note"></div>\n<div class="note hidden" id="swq"></div>')
overlays = r"""<div class="over" id="swlogin"><form class="sheet swl" id="swf" autocomplete="on">
  <div class="swlh"><img src="dmcc_white.png" alt="DMCC"><span></span><img src="logo.png" alt="Mace"></div>
  <h2>Uptown Phase 2 site walk</h2><p class="src" style="margin:0">Type your password.</p>
  <label>Password<input name="pin" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" required style="font-size:22px;letter-spacing:.08em;text-align:center"></label>
  <button class="btn pur" type="submit" id="swbtn" style="min-height:52px;font-size:17px">Sign in</button>
  <p class="src" id="swerr" style="margin:0;color:var(--red);font-weight:600"></p><p class="src" style="margin:0">No password yet? Ask the site walk admin.</p></form></div>
<div class="over" id="swteamov"><div class="sheet" style="width:min(720px,100%)" role="dialog" aria-label="Team">
  <h2 style="margin:0;font:700 24px/1.1 'Barlow Semi Condensed',Barlow,sans-serif">Team</h2>
  <form class="tools" id="swadd"><input name="name" placeholder="Person's name" required style="flex:1 1 200px"><select name="role"><option value="walker">Walker (fills)</option><option value="viewer">Viewer (looks)</option><option value="admin">Admin</option></select><button class="btn pur" type="submit">Add and make password</button></form>
  <div id="swtmsg"></div><div id="swtbody" style="overflow-x:auto"></div>
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
@media(max-width:899px){.swx .swb{padding:4px 8px;font-size:13px}.swx #swteam{display:none}.btn.nwb{padding:6px 10px;font-size:14px;flex:none;min-height:38px}.week .wprog{display:none}.hcta .btn{width:100%}.week select{flex:1 1 auto!important;min-width:0;width:0}}
"""
rep('</style>\n<script>new MutationObserver', css + '</style>\n<script>new MutationObserver')
rep('<title>Uptown Site Walk</title>', '<title>Uptown Phase 2 Site Walk</title>\n<link rel="manifest" href="manifest.webmanifest">')
out = os.path.join(ROOT, 'public'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(s)
print('index.html', len(s))
