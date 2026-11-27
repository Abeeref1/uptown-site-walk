/* ---------- walk planner: ASC's programme issue vs the walk and the previous issue ---------- */
const PLAN_UI=(()=>{
const PL={list:null,docs:{},cur:'',prev:'',stops:[],sum:null,busy:'',err:'',o:{mode:'quick',b:'All',cat:'all',sort:'pri',q:''},open:null};
const GEN=new Set(['works','work','level','levels','area','areas','floor','installation','install','final','first','second','third','fix','tower','zone','podium','basement','complete','completion','general','including','other','room','rooms','services','system','systems','testing','with','from','grid']),QUICK=20,PODL=['B3','B2','B1','GF','P01','P02','P03','P04','P05'],ZP=['Z5A','Z5B','Z1','Z3','Z4','Z2'];
const CATS={claim:'Claim vs walk',crit:'Critical',open:'Open from last walk',missed:'Missed or moved',odd:'Unusual progress',gone:'Disappeared'};
const VERIFY={claim:'Compare the two percentages and their dates. If ASC reports far more than the team recorded, check what was installed in between and ask for the inspection or handover reference.',
  crit:'Check the workface, access, outstanding approvals and remaining duration. Ask: can the next trade start here?',
  open:'Revisit the same location and check whether the agreed action was carried out.',
  missed:'Check finishes due by Wednesday, forecasts pushed back since the previous issue, and activities reopened after a reported finish.',
  odd:'Recount big gains, verify progress reductions and future-dated actuals, and check starts recorded before a finish-to-start predecessor finished.',
  gone:'Check whether ASC renumbered the activity, moved its scope to another activity, or dropped it.'};

/* ---- dates ---- */
const MONS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const isoD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function pdate(v){if(v==null||v==='')return null;if(v instanceof Date&&!isNaN(v))return{d:isoD(v),a:false};
  let s=String(v).trim();const a=/\s[A]\s*$|\sA\*?$/.test(s);s=s.replace(/\s*[A*]+\s*$/,'').trim();
  let m=s.match(/^(\d{4})-(\d\d)-(\d\d)/);if(m)return{d:`${m[1]}-${m[2]}-${m[3]}`,a};
  m=s.match(/^(\d{1,2})[-\s\/]([A-Za-z]{3})[A-Za-z]*[-\s\/](\d{2,4})/);if(m){const y=m[3].length===2?2000+ +m[3]:+m[3];const mo=MONS[m[2].toLowerCase()];if(mo!=null)return{d:isoD(new Date(y,mo,+m[1])),a}}
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(m){const y=m[3].length===2?2000+ +m[3]:+m[3];return{d:isoD(new Date(y,+m[2]-1,+m[1])),a}}
  if(!isNaN(+s)&&+s>20000&&+s<80000){const d=new Date(Date.UTC(1899,11,30)+(+s)*DAY);return{d:isoD(new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())),a}}
  return null}
const xd=s=>s?String(s).slice(0,10):null;
const dd=(a,b)=>a&&b?Math.round((ds(a)-ds(b))/DAY):null;
const fD=s=>s?fmt(ds(s)):'';

/* ---- P6 XER ---- */
function parseXER(text){const want={PROJECT:1,PROJWBS:1,TASK:1,TASKPRED:1,CALENDAR:1},T={};let cur=null,fl=null;
  for(const line of text.split(/\r?\n/)){const t=line.charCodeAt(0)===37?line.slice(0,3):'';
    if(t==='%T\t'||line.startsWith('%T')){cur=line.slice(3).trim();fl=null;if(want[cur])T[cur]=[];continue}
    if(!cur||!want[cur])continue;
    if(line.startsWith('%F')){fl=line.slice(3).split('\t');continue}
    if(line.startsWith('%R')&&fl){const v=line.slice(3).split('\t'),o={};for(let i=0;i<fl.length;i++)o[fl[i]]=v[i]==null?'':v[i];T[cur].push(o)}}
  const tasks=T.TASK||[];if(!tasks.length)throw new Error('No activities in this XER file.');
  const byProj={};for(const t of tasks)byProj[t.proj_id]=(byProj[t.proj_id]||0)+1;const pid=Object.keys(byProj).sort((a,b)=>byProj[b]-byProj[a])[0];
  const pr=(T.PROJECT||[]).find(p=>p.proj_id===pid)||{};
  const wbs={};for(const w of T.PROJWBS||[])if(w.proj_id===pid)wbs[w.wbs_id]=w;
  const pathOf=id=>{const out=[];let w=wbs[id],g=0;while(w&&g++<40){if(w.proj_node_flag!=='Y')out.unshift(w.wbs_name);w=wbs[w.parent_wbs_id]}return out};
  const hrs={};for(const c of T.CALENDAR||[])hrs[c.clndr_id]=+c.day_hr_cnt||8;
  const code={};for(const t of tasks)code[t.task_id]=t.task_code;
  const preds={};for(const r of T.TASKPRED||[])if(r.pred_type==='PR_FS'&&code[r.task_id]&&code[r.pred_task_id])(preds[r.task_id]=preds[r.task_id]||[]).push(code[r.pred_task_id]);
  const acts=[];
  for(const t of tasks){if(t.proj_id!==pid||t.task_type==='TT_LOE'||t.task_type==='TT_WBS')continue;
    const st=t.status_code==='TK_Complete'?'C':t.status_code==='TK_Active'?'A':'N';
    let pc=+t.phys_complete_pct||0;if(t.complete_pct_type==='CP_Drtn'){const td=+t.target_drtn_hr_cnt,rd=+t.remain_drtn_hr_cnt;if(td>0&&!isNaN(rd))pc=Math.max(0,Math.min(100,(1-rd/td)*100))}if(st==='C')pc=100;if(st==='N'&&!t.act_start_date)pc=Math.min(pc,0);
    const h=hrs[t.clndr_id]||8,tfh=t.total_float_hr_cnt===''?null:+t.total_float_hr_cnt,tf=tfh==null||isNaN(tfh)?null:Math.round(tfh/h*10)/10;
    acts.push({i:t.task_code,n:t.task_name,w:pathOf(t.wbs_id),s:st,pc:Math.round(pc),as:xd(t.act_start_date),af:xd(t.act_end_date),
      fs:xd(t.act_start_date||t.restart_date||t.early_start_date||t.target_start_date),ff:xd(t.act_end_date||t.reend_date||t.early_end_date||t.target_end_date),
      ps:xd(t.target_start_date),pf:xd(t.target_end_date),tf:st==='C'?null:tf,cr:st!=='C'&&(t.driving_path_flag==='Y'||(tf!=null&&tf<=0))?1:0,ty:/Mile/.test(t.task_type)?'M':'',pr:preds[t.task_id]||[]})}
  return{acts,proj:pr.proj_short_name||'',dd:xd(pr.last_recalc_date||pr.next_data_date)||isoD(today()),src:'xer'}}

/* ---- Excel or CSV export from P6 ---- */
function parseSheet(wb){const ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  let hi=-1;for(let i=0;i<Math.min(rows.length,30);i++)if(rows[i].some(c=>/^activity id$|^task code$/i.test(String(c).trim()))){hi=i;break}
  if(hi<0)throw new Error('Could not find an "Activity ID" column. Export the layout with Activity ID, Activity Name, Start, Finish and % Complete.');
  const H=rows[hi].map(c=>String(c).trim()),col=re=>H.findIndex(h=>re.test(h));
  const C={i:col(/^activity id$|^task code$/i),n:col(/^activity name$|^task name$/i),w:col(/^wbs( name| path)?$/i),s:col(/^start$|^forecast start$|^early start$|^remaining early start$/i),f:col(/^finish$|^forecast finish$|^early finish$|^remaining early finish$/i),
    as:col(/^actual start$/i),af:col(/^actual finish$/i),pc:col(/^(activity |physical |duration |schedule )?% complete$|^physical %/i),tf:col(/^total float/i),st:col(/^activity status$|^status$/i),cr:col(/^critical$/i),pr:col(/^predecessors$/i),bs:col(/^(planned|target|bl project) start$/i),bf:col(/^(planned|target|bl project) finish$/i)};
  if(C.n<0||(C.s<0&&C.f<0))throw new Error('The file needs at least Activity ID, Activity Name, Start and Finish columns.');
  let ddv=null;for(let i=0;i<hi;i++)for(let j=0;j<rows[i].length;j++)if(/data date/i.test(String(rows[i][j]))){const v=pdate(rows[i][j+1])||pdate(String(rows[i][j]).replace(/.*data date[:\s]*/i,''));if(v)ddv=v.d}
  const acts=[];
  for(let r=hi+1;r<rows.length;r++){const R=rows[r],id=String(R[C.i]||'').trim();if(!id||!R[C.n])continue;
    const S=C.s>=0?pdate(R[C.s]):null,F=C.f>=0?pdate(R[C.f]):null,AS=C.as>=0?pdate(R[C.as]):null,AF=C.af>=0?pdate(R[C.af]):null;
    let pc=C.pc>=0?parseFloat(String(R[C.pc]).replace('%','')):NaN;if(!isNaN(pc)&&pc<=1&&String(R[C.pc]).indexOf('%')<0&&!/%/.test(H[C.pc]+''))pc=pc*100;if(isNaN(pc))pc=0;
    const stx=C.st>=0?String(R[C.st]):'';const as=(AS&&AS.d)||(S&&S.a?S.d:null),af=(AF&&AF.d)||(F&&F.a?F.d:null);
    const st=/complete/i.test(stx)||af?'C':/progress|active|started/i.test(stx)||as?'A':'N';if(st==='C')pc=100;
    const tf=C.tf>=0&&String(R[C.tf]).trim()!==''?parseFloat(String(R[C.tf]).replace(/[^\d.\-−]/g,'').replace('−','-')):null;
    const crx=C.cr>=0?String(R[C.cr]):'';
    acts.push({i:id,n:String(R[C.n]),w:C.w>=0?String(R[C.w]).split(/\s*>\s*|\s*\/\s*/).filter(Boolean):[],s:st,pc:Math.round(pc),as,af,fs:as||(S&&S.d)||null,ff:af||(F&&F.d)||null,
      ps:C.bs>=0?(pdate(R[C.bs])||{}).d||null:null,pf:C.bf>=0?(pdate(R[C.bf])||{}).d||null:null,tf:st==='C'||tf==null||isNaN(tf)?null:tf,
      cr:st!=='C'&&(/^(y|yes|true|1)$/i.test(crx.trim())||(tf!=null&&!isNaN(tf)&&tf<=0))?1:0,ty:'',pr:C.pr>=0?String(R[C.pr]).split(/[,;]\s*/).map(x=>x.trim().split(/\s+/)[0]).filter(Boolean):[]})}
  return{acts,proj:'',dd:ddv||isoD(today()),src:'xlsx'}}

/* ---- where an activity is on site: same WBS rules as the target programme, then name rules ---- */
function lvTok(t){t=String(t||'').trim();let m=t.match(/^B0?(\d)$/);if(m)return'B'+m[1];if(t==='GF')return'GF';m=t.match(/^P0?(\d)$/);if(m)return'P0'+m[1];m=t.match(/^L(\d+)$/);if(m)return'L'+String(+m[1]).padStart(2,'0');if(/^roof/i.test(t))return'ROOF';return null}
const toLevel=s=>{const m=String(s).match(/\bto\s+(B0?\d|GF|P0?\d|L\d+|Roof)\b/);return m?lvTok(m[1]):null};
function podFit(lv){return ZP.map(z=>`${z}/${lv}/FIT`)}
function tagWBS(p,n){const full=p.concat([n]),has=(...k)=>p.some(s=>k.some(x=>s.includes(x))),hasF=(...k)=>full.some(s=>k.some(x=>s.includes(x)));
  const at=re=>p.findIndex(s=>re.test(s));let i;
  if((i=at(/^Structure Works/i))>=0){const zone=p[i+1]||n,lay=/Staircase/.test(n)?'STA':'STR';const lvR=()=>{for(const s of full.slice().reverse()){if(/Roof of/.test(s))return'P05';const l=toLevel(s);if(l)return l}return null};
    if(/^Zone 1/.test(zone)){if(has('Steel Structure')||has('Roof to Top of Roof'))return['T3/ROOF/STR'];if(has('Substructure'))return['Z1/B1/STR'];if(has('Swimming Pool'))return['Z1/P05/STR'];if(has('P05 to L01'))return['T3/L01/'+lay];
      let lv=null;for(const s of full.slice().reverse()){lv=toLevel(s);if(lv)break}return lv?[`T3/${lv}/${lay}`]:[]}
    if(/^Zone 2/.test(zone)){if(has('Steel Structure'))return['T4/ROOF/STR'];if(/^Inner Slabs/.test(n))return['Z2/P03/STR'];let lv=null;for(const s of full.slice().reverse()){lv=toLevel(s);if(lv)break}
      const off=has('Office Levels');if(off&&lv&&lv[0]==='P')lv='L01';const b=off&&lv&&(lv[0]==='L'||lv==='ROOF')?'T4':'Z2';return lv?[`${b}/${lv}/${lay}`]:[]}
    if(/^Zone [345]/.test(zone)){const z={'3':'Z3','4':'Z4','5':'Z5'}[zone.split(' ')[1][0]];const lv=lvR();if(!lv)return[];const zz=z==='Z5'?(hasF('(B)','5B')?'Z5B':'Z5A'):z;
      if(lay==='STA'&&zz!=='Z5A'&&zz!=='Z5B'){const m=n.match(/Staircase \((\w+) to (\w+)\)/);if(m){const a=PODL.indexOf(lvTok(m[1])),b=PODL.indexOf(lvTok(m[2]));if(a>=0&&b>a)return PODL.slice(a+1,b+1).map(l=>`${zz}/${l}/STA`)}}
      return[`${zz}/${lv}/${lay}`]}
    if(/^Steel Structure Bridges/.test(zone))return['BR/GF/STR'];return[]}
  if((i=at(/^Internal Finishes/i))>=0){const grp=p[i+1]||n,sub=p[i+2]||n;
    if(grp==='Basements'){const m=sub.match(/(B\d) \((T3|T4|Other Zones)\)/);if(m)return({T3:['Z1'],T4:['Z2'],'Other Zones':['Z3','Z4','Z5A','Z5B']})[m[2]].map(z=>`${z}/${m[1]}/FIT`);return[]}
    if(grp==='GF & Podiums'){const lv=sub==='GF'?'GF':lvTok(sub);return lv?podFit(lv):[]}
    if(grp==='Tower 03'||grp==='Tower 04'){const b=grp==='Tower 03'?'T3':'T4',m=sub.match(/Level (\d+)/);if(m)return[`${b}/L${String(+m[1]).padStart(2,'0')}/FIT`];
      if(/^Vertical/.test(sub)){const g=(p[i+3]||n).slice(0,60),k=`${b}/VT/${g}`;const P=(window.P4D||{}).K||[];return P.includes(k)?[k]:P.filter(x=>x.startsWith(b+'/VT/'))}return[]}return[]}
  if((i=at(/^External Finishes/i))>=0){const grp=p[i+1]||n,sub=p[i+2]||n;
    if(grp==='Facade Works'){if(/^GF & Podiums/.test(sub))return['POD/ALL/FAC'];if(sub==='Tower 03'||sub==='Tower 04'){const b=sub==='Tower 03'?'T3':'T4',el=p[i+3]||'',band=p[i+4]||n;
      if(/^(Inclined|Standing)/.test(el))return[`${b}/ROOF/FAC/S`];return D4.facKeys(b,el+' · '+band)}return[]}
    if(/^Roof/.test(grp)){if(/^Tower 03/.test(sub))return['T3/ROOF/FIT'];if(/^Tower 04/.test(sub))return['T4/ROOF/FIT'];if(/Podium|Level 1/.test(sub))return['POD/LAND'];if(/^GF/.test(sub))return['POD/LAND'];return[]}
    if(/^External Works/.test(grp))return['SITE/GF/LAND'];return[]}
  return null}
function tagName(p,n){const t=p.slice(-3).join(' ')+' '+n;let b=null;
  if(/Tower\s*0?3\b|\bT-?0?3\b/i.test(t))b='T3';else if(/Tower\s*0?4\b|\bT-?0?4\b/i.test(t))b='T4';else if(/Zone\s*0?1\b/i.test(t))b='Z1';else if(/Zone\s*0?2\b/i.test(t))b='Z2';
  else if(/Zone\s*5\s*-?A|\bZ5A\b/i.test(t))b='Z5A';else if(/Zone\s*5\s*-?B|\bZ5B\b/i.test(t))b='Z5B';else if(/Zone\s*0?3/i.test(t))b='Z3';else if(/Zone\s*0?4/i.test(t))b='Z4';else if(/Podium/i.test(t))b='POD';
  let lv=null,m;if((m=t.match(/\b(?:Level|L)\s*-?0?(\d{1,2})\b/i))&&+m[1]>=1&&+m[1]<=22)lv='L'+String(+m[1]).padStart(2,'0');else if((m=t.match(/\bP(?:odium)?\s*-?0?([1-5])\b/i)))lv='P0'+m[1];
  else if((m=t.match(/\bB(?:asement)?\s*-?0?([1-3])\b/i)))lv='B'+m[1];else if(/\b(GF|Ground)\b/i.test(t))lv='GF';else if(/\broof\b/i.test(t))lv='ROOF';
  const tr=/fa[cç]ade|curtain|glaz|cladding|unitis|spandrel|louv/i.test(t)?'FAC':/\blift|elevator|escalat/i.test(t)?'VT':/stair/i.test(t)?'STA':/slab|column|core wall|concrete|rebar|formwork|structur|pour|shear wall|post.?tension/i.test(t)?'STR':/landscap|hardscape|external works|paving/i.test(t)?'LAND':'FIT';
  if(tr==='LAND')return['SITE/GF/LAND'];
  if(b==='T3'||b==='T4'){if(tr==='VT'){const P=(window.P4D||{}).K||[];return P.filter(x=>x.startsWith(b+'/VT/'))}
    if(lv&&(lv[0]==='L'||lv==='ROOF'))return tr==='FAC'?['S','N','E','W'].map(s=>`${b}/${lv}/FAC/${s}`):[`${b}/${lv}/${tr==='STR'||tr==='STA'?tr:'FIT'}`];
    if(lv&&PODL.includes(lv))return[`${b==='T3'?'Z1':'Z2'}/${lv}/${tr==='STR'||tr==='STA'?tr:'FIT'}`];return[]}
  if(b&&b[0]==='Z'){if(tr==='FAC')return['POD/ALL/FAC'];const l=lv==='L01'?'P05':lv;return l&&PODL.includes(l)?[`${b}/${l}/${tr==='STR'||tr==='STA'?tr:'FIT'}`]:[]}
  if(b==='POD'){if(tr==='FAC')return['POD/ALL/FAC'];return lv&&PODL.includes(lv)?(tr==='STR'||tr==='STA'?['Z3','Z4','Z5A','Z5B'].map(z=>`${z}/${lv}/${tr}`):podFit(lv)):[]}
  return[]}
function tagAct(a){const w=tagWBS(a.w||[],a.n);return w&&w.length?{k:[...new Set(w)],how:'WBS'}:{k:[...new Set(tagName(a.w||[],a.n))],how:'name'}}

/* ---- labels ---- */
const BNM={T3:'Tower 3',T4:'Tower 4',Z1:'Tower 3 (Zone 1)',Z2:'Tower 4 (Zone 2)',Z3:'Podium Zone 3',Z4:'Podium Zone 4',Z5A:'Podium Zone 5A',Z5B:'Podium Zone 5B'};
const SIDEN={T3:{S:'long side, T2 side',N:'long side, Zone 4 side',E:'short side, Zone 4 side',W:'short side, Zone 3 side'},T4:{S:'long side, Zone 5 side',N:'long side, Zone 4 side',E:'short side, grid T1 to T4',W:'short side, grid T4 to T1'}};
function keyLabel(k){const p=k.split('/');if(p[0]==='POD')return p[1]==='ALL'?'Podium · Façade':'Podium roof and terraces';if(p[0]==='SITE')return'Site · External works';if(p[0]==='BR')return'Bridges to Tower 2';
  const b=BNM[p[0]]||p[0];if(p[1]==='VT')return b+' · Lifts: '+p.slice(2).join('/');const lv=p[1]==='ROOF'?'Roof':/^L\d/.test(p[1])?'Level '+(+p[1].slice(1)):p[1];
  if(p[2]==='FAC')return`${b} · ${lv} · Façade, ${(SIDEN[p[0]]||{})[p[3]]||p[3]}`;return`${b} · ${lv} · ${({STR:'Structure',STA:'Stairs',FIT:'Fit-out & MEP'})[p[2]]||p[2]}`}
function bldOf(stop){const it=stop.items[0];if(it)return it.b==='Tower 2'?'Podium':it.b;const k=stop.keys[0]||'',p=k.split('/');
  if(/^B\d$/.test(p[1]))return'Basement';if(p[0]==='T3'||p[0]==='Z1')return'Tower 3';if(p[0]==='T4'||p[0]==='Z2')return'Tower 4';if(p[0]==='SITE')return'Site';return k?'Podium':'Not matched'}
const LORD=LEVELS.slice().reverse();
function lvOrd(stop){const it=stop.items[0];const l=it?it.l:(stop.keys[0]||'').split('/')[1]==='ROOF'?'Roof':(stop.keys[0]||'').split('/')[1];const i=LORD.indexOf(l);return i<0?99:i}

/* ---- issues ---- */
function prevOf(id){const L=PL.list||[],c=L.find(x=>x.id===id);if(!c)return'';let b=null;for(const x of L)if(x.id!==id&&x.dd<c.dd&&(!b||x.dd+x.at>b.dd+b.at))b=x;return b?b.id:''}
async function loadList(){const r=await SW.api('prog');PL.list=r.list||[];const ids=PL.list.map(x=>x.id);
  if(!ids.includes(PL.cur))PL.cur=ids[ids.length-1]||'';if(PL.prev&&!ids.includes(PL.prev))PL.prev='';if(!PL.prev)PL.prev=prevOf(PL.cur)}
async function getDoc(id){if(!id)return null;if(PL.docs[id])return PL.docs[id];const d=await SW.api('prog/'+id);
  for(const a of d.acts){const t=tagAct(a);a.k=t.k;a.how=t.how}d.by={};for(const a of d.acts)d.by[a.i]=a;PL.docs[id]=d;return d}

/* ---- the checks ---- */
function nextWed(dd){let t=today();const x=dd?new Date(dd+'T00:00:00'):null;if(x&&!isNaN(x)&&x>t)t=x;const d=(3-t.getDay()+7)%7;return new Date(t.getTime()+d*DAY)}
function itemsByKey(){const m={};for(const it of ALL())for(const k of D4.keysOf(it))(m[k]=m[k]||[]).push(it);return m}
function team(items,wk){let n=0,s=0,w=null,rec=null;for(const it of items){const L=latest(it,wk);if(!L)continue;if(L.rec){rec=rec==null?L.p:rec;continue}n++;s+=L.p;if(!w||L.w>w)w=L.w}return n?{p:s/n,w,n}:rec!=null?{p:rec,w:'2026-11-13',n:0,rec:true}:null}
function score(rs){const w=rs.map(r=>r.w).sort((a,b)=>b-a);return Math.round(w.reduce((s,x,i)=>s+x/Math.pow(2,i),0))}
const prOf=s=>s>=80?1:s>=55?2:3;
function compute(cur,prev){const c=ctx(),wk=c.wkKey,nw=nextWed(cur.meta&&cur.meta.dd),nwI=isoD(nw),IBK=itemsByKey(),stops=[],byItem={};
  const itemsOf=(keys,name)=>{const s=new Set(),o=[];for(const k of keys)for(const it of IBK[k]||[])if(!s.has(it.r)){s.add(it.r);o.push(it)}
    if(!name||o.length<3)return o;const tk=String(name).toLowerCase().match(/[a-z]{4,}/g)||[],w=tk.filter(x=>!GEN.has(x));if(!w.length)return o;
    const hit=o.filter(it=>{const t=(it.w+' '+(it.e||'')+' '+(it.loc||'')).toLowerCase();return w.some(x=>t.includes(x.slice(0,6)))});return hit.length?hit:o};
  let matched=0,crit=0,added=0;const ddc=cur.meta.dd;
  for(const a of cur.acts){const items=itemsOf(a.k,a.n),pa=prev?prev.by[a.i]:null,rs=[];if(items.length)matched++;if(a.cr)crit++;if(prev&&!pa)added++;
    if(a.ty==='M'&&!a.k.length)continue;
    // 1 claim vs walk
    const tm=items.length?team(items,wk):null;
    if(tm&&!tm.rec){const g=a.pc-tm.p;if(g>=20)rs.push({c:'claim',w:58+Math.min(30,g/3)+(a.pc>=100?10:0),t:`ASC reports ${a.pc}% (data date ${fD(ddc)}). Team recorded ${Math.round(tm.p)}% on ${fD(tm.w)}.${a.pc>=100?' Ask for the inspection or handover reference.':''}`});
      else if(g<=-20)rs.push({c:'claim',w:24,t:`ASC reports only ${a.pc}% but the team recorded ${Math.round(tm.p)}% on ${fD(tm.w)}. ASC's programme may not be updated here.`})}
    else if(tm&&tm.rec&&a.pc-tm.p>=40)rs.push({c:'claim',w:30,t:`ASC reports ${a.pc}%. Mace record of ${fD(tm.w)} showed ${Math.round(tm.p)}% and the team has not walked it since. Walk it to confirm.`});
    // 2 critical
    if(a.cr&&a.s!=='C'&&(a.s==='A'||!a.fs||a.fs<=isoD(new Date(nw.getTime()+14*DAY)))){const nc=prev&&pa&&!pa.cr;
      rs.push({c:'crit',w:45+(nc?28:0)+Math.min(15,Math.max(0,-(a.tf||0))/3),t:`${nc?'Newly critical since the last issue'+(pa.tf!=null?` (float was ${pa.tf} d)`:'')+'. ':'On the critical path. '}Float ${a.tf==null?'n/a':a.tf+' d'}, ${a.s==='A'?'in progress':'starts '+fD(a.fs)}, finish ${fD(a.ff)}.`,nx:1})}
    // 4 missed or moved
    if(a.s!=='C'&&a.ff&&a.ff<=nwI)rs.push({c:'missed',w:a.ff<ddc?52:44,t:a.ff<ddc?`Forecast finish ${fD(a.ff)} is before the data date and it is still open (${a.pc}%).`:`Due to finish by ${fD(nwI)} (forecast ${fD(a.ff)}), now at ${a.pc}%.`});
    if(pa&&a.s!=='C'&&pa.ff&&a.ff){const mv=dd(a.ff,pa.ff);if(mv>=7)rs.push({c:'missed',w:30+Math.min(30,mv/7*5),t:`Finish pushed ${mv} days: ${fD(pa.ff)} in the last issue, now ${fD(a.ff)}.`})}
    if(pa&&pa.s==='C'&&a.s!=='C')rs.push({c:'missed',w:52,t:`Reopened: reported finished ${fD(pa.af)} in the last issue, now ${a.pc}%.`});
    // 5 unusual progress or sequencing
    if(pa){const gain=a.pc-pa.pc,lin=d=>{if(!pa.fs||!pa.ff)return null;const t0=ds(pa.fs),t1=ds(pa.ff),x=ds(d);return x<=t0?0:x>=t1?100:100*(x-t0)/(t1-t0)},e1=lin(prev.meta.dd),e2=lin(ddc),exp=e1==null||e2==null?0:Math.max(0,e2-e1);
      if(gain>=25&&gain-exp>=20)rs.push({c:'odd',w:40+Math.min(25,(gain-exp)/4),t:`Jumped ${gain} points in one issue (${pa.pc}% to ${a.pc}%) when the last issue planned about ${Math.round(exp)} points. Recount on site.`});
      else if(gain<=-1)rs.push({c:'odd',w:36,t:`Progress went down: ${pa.pc}% to ${a.pc}%. Ask why.`})}
    if((a.as&&a.as>ddc)||(a.af&&a.af>ddc))rs.push({c:'odd',w:46,t:`Actual ${a.af&&a.af>ddc?'finish '+fD(a.af):'start '+fD(a.as)} is after the data date ${fD(ddc)}.`});
    if(a.as&&a.pr&&a.pr.length){const bad=a.pr.map(x=>cur.by[x]).filter(p=>p&&(p.s!=='C'||(p.af&&p.af>a.as)));if(bad.length)rs.push({c:'odd',w:40,t:`Started ${fD(a.as)} before its finish-to-start predecessor ${bad[0].i} (${bad[0].n.slice(0,50)}) ${bad[0].s==='C'?'finished '+fD(bad[0].af):'finished'}.`})}
    if(!rs.length)continue;
    const st={key:'A:'+a.i,id:a.i,act:a,pa,items,keys:a.k,rs,tm};stops.push(st);for(const it of items)(byItem[it.r]=byItem[it.r]||[]).push(st)}
  // 6 disappeared
  let gone=0;if(prev)for(const pa of prev.acts){if(cur.by[pa.i])continue;gone++;if(pa.s==='C'&&!pa.cr)continue;
    stops.push({key:'G:'+pa.i,id:pa.i,act:null,pa,items:itemsOf(pa.k,pa.n),keys:pa.k,rs:[{c:'gone',w:pa.cr?62:pa.s==='A'?40:26,t:`In the last issue${pa.cr?' on the critical path':''} (${pa.pc}%, finish ${fD(pa.ff)}) but not in this one.`}]})}
  // 3 open from the last walk: notes on late items and next-trade promises not checked since
  for(const it of ALL()){const h=hist(it);let fw=null;for(const w of Object.keys(h).sort()){const e=h[w];if(!e)continue;const k=CALC.get(it.r)||{};if(e.nx||(e.c&&(k.esc==='ESCALATE'||k.st==='Behind')))fw=w}
    if(!fw)continue;const later=Object.keys(h).some(w=>w>fw&&h[w]&&(h[w].p!=null||h[w].c));if(later)continue;const e=h[fw],rs=[];
    if(e.nx){const due=e.nx.d&&e.nx.d<=nwI;rs.push({c:'open',w:due?66:50,t:`Promised on ${fD(fw)}: ${e.nx.t||'next trade'} can start ${e.nx.d?'by '+fD(e.nx.d):'soon'}${e.nx.o?' (owner '+e.nx.o+')':''}${e.nx.c?'. Constraint: '+e.nx.c:''}. Check it happened.`})}
    if(e.c)rs.push({c:'open',w:48,t:`Finding on ${fD(fw)}: "${String(e.c).slice(0,140)}"${e.aid?` (activity ${e.aid})`:''}. Check the agreed action.`});
    const host=(byItem[it.r]||[]).sort((x,y)=>score(y.rs)-score(x.rs))[0];
    if(host)host.rs.push(...rs);else{const lost=e.aid&&!cur.by[e.aid];stops.push({key:'I:'+it.r,id:e.aid||'',act:e.aid?cur.by[e.aid]||null:null,pa:prev&&e.aid?prev.by[e.aid]:null,items:[it],keys:D4.keysOf(it),
      rs:rs.map(r=>lost?{...r,t:r.t+` Activity ${e.aid} is not in this programme.`}:r)})}}
  for(const s of stops){s.rs.sort((a,b)=>b.w-a.w);s.score=score(s.rs);s.pr=prOf(s.score);s.b=bldOf(s);s.top=CATS[s.rs[0].c];s.crit=!!(s.act&&s.act.cr)||s.rs.some(r=>r.nx)}
  stops.sort((a,b)=>b.score-a.score);
  PL.sum={n:cur.acts.length,matched,crit,added,gone,dd:cur.meta.dd,nw:nwI,prevN:prev?prev.acts.length:0,same:prev?cur.acts.filter(a=>prev.by[a.i]).length:0,proj:cur.meta.proj,prevProj:prev?prev.meta.proj:''};
  return stops}

/* ---- view ---- */
function shown(){const o=PL.o;let l=PL.stops;if(o.b!=='All')l=l.filter(s=>s.b===o.b);if(o.cat!=='all')l=l.filter(s=>s.rs.some(r=>r.c===o.cat));
  if(o.q){const q=o.q.toLowerCase();l=l.filter(s=>(s.id+' '+(s.act||s.pa||{}).n+' '+s.items.map(i=>i.b+' '+i.l+' '+i.w).join(' ')).toLowerCase().includes(q))}
  if(o.mode==='quick')l=l.filter(s=>s.pr<3).slice(0,QUICK);
  if(o.sort==='route')l=l.slice().sort((a,b)=>BUILD.indexOf(a.b)-BUILD.indexOf(b.b)||lvOrd(a)-lvOrd(b)||b.score-a.score);return l}
function publish(){const by={},l=shown();for(const s of l)for(const k of s.keys){const w=by[k]||(by[k]={pr:3,stops:[]});w.pr=Math.min(w.pr,s.pr);w.stops.push(s)}
  const cm=(PL.list||[]).find(x=>x.id===PL.cur);window.PLAN={byKey:by,n:l.length,issue:cm?`${cm.name}, data date ${fD(cm.dd)}`:''};try{D4.draw()}catch(e){}}
const locTxt=s=>s.items.length?s.items.slice(0,2).map(i=>`${i.b} · ${i.l} · ${i.w}`).join('; ')+(s.items.length>2?` (+${s.items.length-2} more)`:''):s.keys.length?s.keys.slice(0,2).map(keyLabel).join('; ')+(s.keys.length>2?` (+${s.keys.length-2})`:''):'Not matched to the walk register';
function card(s){const a=s.act||s.pa||{};
  return`<article class="plc p${s.pr}"><div class="plt"><span class="pp p${s.pr}">P${s.pr}</span>${s.id?`<b class="aid">${esc(s.id)}</b>`:'<b class="aid">Walk item</b>'}<span class="an">${esc(a.n||(s.items[0]||{}).w||'')}</span>${s.act&&s.act.cr?'<span class="crt">Critical</span>':''}</div>
  <div class="ploc"><svg class="ic" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>${esc(locTxt(s))}${s.act&&s.act.how==='name'?' <span class="src">(matched by name)</span>':''}</div>
  <ul class="plr">${s.rs.map(r=>`<li><span class="tg t-${r.c}">${CATS[r.c]}</span>${esc(r.t)}</li>`).join('')}</ul>
  ${s.crit?`<p class="nxq"><b>Can the next trade start here?</b> Record the receiving trade, the constraint, who owns it and the promised date.</p>`:''}
  <div class="tools"><button class="btn pur" type="button" data-plc="${esc(s.key)}">Compare and fill</button>${s.items[0]?`<button class="btn" type="button" data-plw="${esc(s.items[0].r)}">Walk it</button>`:''}${s.keys[0]?`<button class="btn" type="button" data-pl4="${esc(s.key)}">See in 4D</button>`:''}</div></article>`}
function render(){const v=$('#v-plan');if(!v)return;if(!PL.list&&!PL.busy){PL.busy='Loading…';loadList().then(refresh).catch(e=>{PL.busy='';PL.err=e.message;render()})}
  const L=PL.list||[],opt=(id,sel)=>L.map(x=>`<option value="${esc(x.id)}" ${x.id===sel?'selected':''}>${esc(fD(x.dd))} · ${esc(x.name)}</option>`).join('');
  const S=PL.sum,o=PL.o,all=PL.stops,cnt=c=>all.filter(s=>s.rs.some(r=>r.c===c)).length,bl=['All',...BUILD.filter(b=>b!=='Tower 2').concat(['Not matched'])];
  const warn=[];if(S){if(S.n&&S.matched/S.n<.5)warn.push(`Only ${S.matched} of ${S.n} activities matched a walk location. Check it is the full programme export.`);
    if(S.prevN&&Math.abs(S.n-S.prevN)/S.prevN>.2)warn.push(`Activity count changed from ${S.prevN} to ${S.n}. Make sure both files are complete exports of the same project.`);
    if(S.prevProj&&S.proj&&S.prevProj!==S.proj)warn.push(`Different project codes: ${S.prevProj} and ${S.proj}.`)}
  const l=shown();
  v.innerHTML=`<div class="box plhead"><div class="hd"><h2>Walk planner</h2><span class="src">After each Wednesday walk, upload ASC's updated programme. The planner ranks what the team should verify next Wednesday.</span></div>
   <div class="tools"><label class="btn pur" for="plfile"><svg class="ic" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg> Upload programme (P6 XER or Excel)</label><input type="file" id="plfile" accept=".xer,.xlsx,.xls,.csv" hidden>
   ${L.length?`<label class="plsel">This issue <select id="plcur">${opt('plcur',PL.cur)}</select></label><label class="plsel">Compared with <select id="plprev"><option value="">The walk only</option>${opt('plprev',PL.prev)}</select></label>`:''}</div>
   ${PL.busy?`<p class="src plbusy">${esc(PL.busy)}</p>`:''}${PL.err?`<p class="src" style="color:var(--red);font-weight:600">${esc(PL.err)}</p>`:''}
   ${S?`<div class="plsum"><span><b>${fD(S.dd)}</b>data date</span><span><b>${S.n}</b>activities</span><span><b>${S.matched}</b>matched to walk locations (${S.n?Math.round(S.matched/S.n*100):0}%)</span><span><b>${S.crit}</b>critical</span>${S.prevN?`<span><b>${S.added}</b>new</span><span><b>${S.gone}</b>disappeared</span>`:''}<span><b>${fD(S.nw)}</b>next walk</span></div>`:''}
   ${warn.map(w=>`<p class="plwarn">${esc(w)}</p>`).join('')}
   ${!L.length&&!PL.busy?`<p class="src">No programme uploaded yet. Ask ASC for the native P6 file (XER) of each update. An Excel export with Activity ID, Activity Name, Start, Finish, % Complete and Total Float also works.</p>`:''}</div>
  ${S?`<div class="box plctl"><div class="seg4" role="group"><button type="button" data-plm="quick" aria-pressed="${o.mode==='quick'}">Quick walk (${Math.min(QUICK,all.filter(s=>s.pr<3).length)})</button><button type="button" data-plm="deep" aria-pressed="${o.mode==='deep'}">Deep walk (${all.length})</button></div>
   <div class="sc4">${bl.map(b=>`<button type="button" class="chip" data-plb="${esc(b)}" aria-pressed="${o.b===b}">${esc(b==='Basement'?'Basements':b)}</button>`).join('')}</div>
   <div class="sc4 zn4"><button type="button" class="chip" data-plk="all" aria-pressed="${o.cat==='all'}">All checks</button>${Object.keys(CATS).map(c=>`<button type="button" class="chip" data-plk="${c}" aria-pressed="${o.cat===c}"><span class="tg t-${c}" style="margin:0"></span>${CATS[c]} (${cnt(c)})</button>`).join('')}</div>
   <div class="tools"><div class="seg4" role="group"><button type="button" data-pls="pri" aria-pressed="${o.sort==='pri'}">By priority</button><button type="button" data-pls="route" aria-pressed="${o.sort==='route'}">By route</button></div>
   <input id="plq" type="search" placeholder="Search ID, activity or location" value="${esc(o.q)}" style="flex:1 1 200px"><button class="btn" type="button" id="pl4all">Walk plan in 4D</button><button class="btn" type="button" id="plxl">Excel walk list</button></div></div>
  <div class="plist">${l.length?l.map(card).join(''):'<div class="empty">Nothing to check for this filter.</div>'}</div>`:''}`;
  publish()}
async function refresh(){PL.busy='';PL.err='';if(!PL.cur){PL.stops=[];PL.sum=null;render();return}
  try{PL.busy='Comparing the programme with the walk…';render();const cur=await getDoc(PL.cur),prev=await getDoc(PL.prev);PL.stops=compute(cur,prev);PL.busy=''}catch(e){PL.busy='';PL.err=e.message||'Could not load the programme.'}render()}

/* ---- upload ---- */
async function upload(f){if(!f)return;if(!SW.canSend()){toast('View only.');return}PL.err='';PL.busy=`Reading ${f.name}…`;render();
  try{const buf=await f.arrayBuffer();let r;
    if(/\.xer$/i.test(f.name))r=parseXER(new TextDecoder('windows-1252').decode(buf));
    else if(/\.(xlsx|xls|csv)$/i.test(f.name)){await lib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');r=parseSheet(XLSX.read(buf,{type:'array',cellDates:true}))}
    else throw new Error('Use the P6 XER file or an Excel export. PDF programmes cannot be compared.');
    const dup=(PL.list||[]).find(x=>x.name===f.name&&x.dd===r.dd&&x.n===r.acts.length);
    if(dup){PL.busy='';PL.cur=dup.id;PL.prev=prevOf(dup.id);toast(`Already uploaded on ${fD(String(dup.at).slice(0,10))}. Showing that issue.`);await refresh();return}
    let m=0;for(const a of r.acts)if(tagAct(a).k.length)m++;
    PL.busy=`Saving ${r.acts.length} activities (${m} matched to walk locations)…`;render();
    const res=await SW.api('prog',{method:'POST',body:JSON.stringify({meta:{name:f.name,proj:r.proj,dd:r.dd,src:r.src},acts:r.acts})});
    await loadList();PL.cur=res.meta.id;PL.prev=prevOf(res.meta.id);toast(`Programme saved: ${r.acts.length} activities, data date ${fD(r.dd)}.`);await refresh()}
  catch(e){PL.busy='';PL.err=e.message||'The file could not be read.';render()}}

/* ---- compare sheet ---- */
function rowsFor(a){if(!a)return null;return{pc:a.pc+'%',fs:(a.as?'A ':'')+fD(a.fs),ff:(a.af?'A ':'')+fD(a.ff),tf:a.tf==null?'':a.tf+' d',st:{C:'Complete',A:'In progress',N:'Not started'}[a.s],cr:a.cr?'Yes':'No'}}
function chg(x,y,k){if(!x||!y)return'';if(k==='pc'){const g=parseInt(y.pc)-parseInt(x.pc);return g?`<b class="${g>0?'up':'dn'}">${g>0?'+':''}${g} pts</b>`:''}
  if(k==='ff'||k==='fs'){const a=PL.cs.pa&&PL.cs.pa[k],b=PL.cs.act&&PL.cs.act[k],d=dd(b,a);return d?`<b class="${d>0?'dn':'up'}">${d>0?'+':''}${d} d</b>`:''}
  if(k==='tf'){const a=PL.cs.pa&&PL.cs.pa.tf,b=PL.cs.act&&PL.cs.act.tf;if(a==null||b==null)return'';const d=Math.round((b-a)*10)/10;return d?`<b class="${d<0?'dn':'up'}">${d>0?'+':''}${d} d</b>`:''}
  return x[k]!==y[k]?'<b class="dn">changed</b>':''}
function openCmp(key){const s=PL.stops.find(x=>x.key===key);if(!s)return;PL.cs=s;const c=ctx(),cm=(PL.list||[]).find(x=>x.id===PL.cur),pm=(PL.list||[]).find(x=>x.id===PL.prev);
  const A=rowsFor(s.act),B=rowsFor(s.pa),tm=s.tm||(s.items.length?team(s.items,c.wkKey):null);
  const R=[['% complete','pc'],['Start','fs'],['Finish','ff'],['Total float','tf'],['Status','st'],['Critical','cr']];
  const it0=s.items[0],e0=it0?(hist(it0)[c.wkKey]||{}):{},nx=(()=>{for(const it of s.items){const h=hist(it);for(const w of Object.keys(h).sort().reverse())if(h[w]&&h[w].nx)return{...h[w].nx,w,r:it.r}}return null})();
  $('#plsh').innerHTML=`<button class="x" type="button" data-plx aria-label="Close">×</button>
   <div class="plt"><span class="pp p${s.pr}">P${s.pr}</span><b class="aid">${esc(s.id||'Walk item')}</b><span class="an">${esc((s.act||s.pa||{}).n||(it0||{}).w||'')}</span></div>
   <p class="ploc">${esc(locTxt(s))}</p>
   <div style="overflow-x:auto"><table class="plt3"><thead><tr><th></th><th style="color:var(--pur)">Last walk${tm?' · '+fD(tm.w):''}</th><th>${pm?'Previous issue · '+fD(pm.dd):'Previous issue'}</th><th style="color:#c00000">${cm?'This issue · '+fD(cm.dd):'This issue'}</th><th>Change</th></tr></thead>
   <tbody>${R.map(([n,k])=>`<tr><td>${n}</td><td>${k==='pc'&&tm?`<b>${Math.round(tm.p)}%</b>${tm.rec?' <span class="src">record</span>':''}`:''}</td><td>${B?esc(B[k]):'<span class="src">not in issue</span>'}</td><td>${A?`<b>${esc(A[k])}</b>`:'<span class="src">not in issue</span>'}</td><td>${chg(B,A,k)}</td></tr>`).join('')}</tbody></table></div>
   <h3>Why it is on the walk</h3><ul class="plr">${s.rs.map(r=>`<li><span class="tg t-${r.c}">${CATS[r.c]}</span>${esc(r.t)}</li>`).join('')}</ul>
   <h3>What the team should verify</h3><ul class="plv">${[...new Set(s.rs.map(r=>r.c))].map(cc=>`<li>${esc(VERIFY[cc])}</li>`).join('')}</ul>
   ${s.items.length?`<h3>Walk items here (${s.items.length})</h3><div class="plits">${s.items.slice(0,12).map(it=>{const L=latest(it,c.wkKey),e=hist(it)[L&&!L.rec?L.w:'']||{};return`<div class="plit"><span><b>${esc(it.b)} · ${esc(it.l)}</b> ${esc(it.w)}<br><span class="src">${L?`${Math.round(L.p)}% on ${fD(L.w)}${L.rec?' (record)':''}`:'not walked yet'}${e.c?' · '+esc(String(e.c).slice(0,90)):''}${e.ph&&e.ph.length?' · '+e.ph.length+' photo'+(e.ph.length>1?'s':''):''}</span></span><button class="btn" type="button" data-plw="${esc(it.r)}">Fill</button></div>`}).join('')}</div>`:'<p class="src">No walk item matches this activity. Add one from the Walk tab if the team checks it.</p>'}
   <h3>Can the next trade start here?</h3>
   ${nx?`<p class="src" style="margin:0 0 6px">Last recorded ${fD(nx.w)}: ${esc(nx.t||'')}${nx.c?', constraint '+esc(nx.c):''}${nx.o?', owner '+esc(nx.o):''}${nx.d?', promised '+fD(nx.d):''}.</p>`:''}
   ${it0?`<form id="plnx" class="plnx"><label>Receiving trade<input name="t" maxlength="80" placeholder="e.g. Blockwork, MEP first fix" value="${esc(e0.nx?e0.nx.t:'')}"></label><label>Outstanding constraint<input name="c" maxlength="160" placeholder="e.g. props still in, no access" value="${esc(e0.nx?e0.nx.c:'')}"></label>
   <label>Who owns it<input name="o" maxlength="80" placeholder="e.g. ASC structure" value="${esc(e0.nx?e0.nx.o:'')}"></label><label>Promised release date<input name="d" type="date" value="${esc(e0.nx?e0.nx.d:'')}"></label>
   <div class="tools"><button class="btn pur" type="submit">Save for walk of ${esc(fmt(c.wk))}</button></div></form>`:'<p class="src">Add a walk item here first to record the hand-over.</p>'}
   <div class="tools" style="margin-top:10px">${it0?`<button class="btn pur" type="button" data-plw="${esc(it0.r)}">Walk it</button>`:''}${s.keys[0]?`<button class="btn" type="button" data-pl4="${esc(s.key)}">See in 4D</button>`:''}<button class="btn" type="button" data-plx>Close</button></div>`;
  $('#plov').classList.add('show');$('#plsh').scrollTop=0}

/* ---- Excel walk list ---- */
async function excel(){try{await lib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')}catch(e){toast('Could not load the Excel tool.');return}
  const l=shown(),cm=(PL.list||[]).find(x=>x.id===PL.cur)||{},rows=[[`Uptown Phase 2 walk plan for ${fD(PL.sum.nw)}, programme ${cm.name||''} (data date ${fD(cm.dd)})`],[],['#','Priority','Score','Activity ID','Activity','Building','Location','Checks','Why it is on the walk','ASC %','Team %','Forecast finish','Total float (d)','Critical','Next trade','Constraint','Owner','Promised date','Verified (Y/N)','Notes']];
  l.forEach((s,i)=>{const a=s.act||s.pa||{},tm=s.tm;rows.push([i+1,'P'+s.pr,s.score,s.id,a.n||'',s.b,locTxt(s),[...new Set(s.rs.map(r=>CATS[r.c]))].join(', '),s.rs.map(r=>r.t).join(' | '),a.pc==null?'':a.pc,tm?Math.round(tm.p):'',fD(a.ff),a.tf==null?'':a.tf,a.cr?'Yes':'','','','','','',''])});
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[4,8,6,12,40,10,40,22,70,6,6,11,8,7,16,22,14,12,10,30].map(w=>({wch:w}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Walk plan');
  XLSX.writeFile(wb,`Uptown_Walk_Plan_${PL.sum.nw}.xlsx`)}

/* ---- events ---- */
document.addEventListener('change',e=>{const t=e.target;if(t.id==='plfile'){upload(t.files[0]);t.value='';return}
  if(t.id==='plcur'){PL.cur=t.value;PL.prev=prevOf(PL.cur);refresh();return}
  if(t.id==='plprev'){PL.prev=t.value;refresh();return}});
document.addEventListener('input',e=>{if(e.target.id==='plq'){PL.o.q=e.target.value;clearTimeout(PL.qt);PL.qt=setTimeout(()=>{const p=e.target.selectionStart;render();const q=$('#plq');if(q){q.focus();try{q.setSelectionRange(p,p)}catch(x){}}},250)}});
document.addEventListener('submit',e=>{if(e.target.id!=='plnx')return;e.preventDefault();const s=PL.cs,it=s&&s.items[0];if(!it)return;const f=e.target.elements;
  const nx={t:f.t.value.trim(),c:f.c.value.trim(),o:f.o.value.trim(),d:f.d.value||'',aid:s.id||''};if(!nx.t&&!nx.c&&!nx.d){toast('Fill at least the trade, the constraint or the date.');return}
  setEntry(it.r,{nx,aid:s.id||undefined});toast('Hand-over saved. It comes back on next Wednesday’s plan.');$('#plov').classList.remove('show')});
document.addEventListener('click',e=>{const t=e.target.closest('button,[data-plx]');if(!t)return;
  if(t.dataset.plx!==undefined||t.id==='plov'){$('#plov').classList.remove('show');return}
  if(t.dataset.plm){PL.o.mode=t.dataset.plm;render();return}if(t.dataset.plb){PL.o.b=t.dataset.plb;render();return}if(t.dataset.plk){PL.o.cat=t.dataset.plk;render();return}if(t.dataset.pls){PL.o.sort=t.dataset.pls;render();return}
  if(t.dataset.plc||t.dataset.pl){openCmp(t.dataset.plc||t.dataset.pl);return}
  if(t.dataset.plw){$('#plov').classList.remove('show');ui.due=false;openItem(t.dataset.plw);return}
  if(t.dataset.pl4){const s=PL.stops.find(x=>x.key===t.dataset.pl4);$('#plov').classList.remove('show');publish();show('4d');if(s&&s.keys[0])D4.focusKey(s.keys[0],'W');return}
  if(t.id==='pl4all'){publish();show('4d');D4.focusKey&&setTimeout(()=>{const b=$('#seg4 button[data-m4="W"]');if(b)b.click()},300);return}
  if(t.id==='plxl'){excel();return}});
return{render,tagAct,parseXER,compute,PL}})();
