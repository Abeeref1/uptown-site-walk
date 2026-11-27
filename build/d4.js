/* ---------- 4D: the walk against the programme, on the real BIM model ---------- */
const D4=(()=>{
let P={K:[],A:[]},G=null;
const EP=Date.UTC(2025,0,1),day4=d=>Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-EP)/DAY);
const dOf=n=>{const u=new Date(EP+n*DAY);return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate())};
const PR={W:{name:'Walk plan',col:'#c00000'},F:{name:'Finished design',col:'#0E6E73'},A:{name:'Actual (walk)',col:'#742781'},T:{name:'Target (R1)',idx:[0,1],col:'#c00000'},U:{name:'20 Nov update',idx:[4,5],col:'#1e1e1e'},B:{name:'Baseline',idx:[2,3],col:'#8A8178'}};
const pcol=p=>p==='U'?'var(--ink)':p==='A'?'var(--pur)':PR[p].col;
const LAYERS=[{k:'STR',name:'Structure',col:'#B8B2A7'},{k:'STA',name:'Stairs',col:'#7E776E'},{k:'FAC',name:'Façade',col:'#4F8FC9'},{k:'FIT',name:'Fit-out & MEP',col:'#0B5D63'},{k:'VT',name:'Lifts',col:'#6B4FA0'},{k:'LAND',name:'External',col:'#5E8C3A'}];
const M={mode:'AT',show:{STR:true,STA:true,FAC:true,FIT:true,VT:true,LAND:true},focus:{b:'ALL',z:null,lv:null},under:false,ready:false,loading:null,pin:null,day:null,play:0,intro:0,shadowKey:''};
const TOP={T3:22,T4:16};
const ELO={T3:['Elevation (Long side T2 side) Grid T11 to T5','Elevation (Long side Zone 4 side) Grid T5 to T11','Elevation (Short side Zone 4 side) Grid TH to TL','Elevation (Short side Zone 3 side) Grid TL to TH'],
  T4:['Elevation (Long Side Zone 5 side) Grid TA to TG','Elevation (Long Side Zone 4 side) Grid TG to TA','Elevation (Short Side Zone 4 side) Grid T1 to T4','Elevation (Short Side Zone 4 side) Grid T4 to T1']};
const SIDES=['S','N','E','W'];
const PODL=['B3','B2','B1','GF','P01','P02','P03','P04','P05'];
const ZALL=['Z1','Z2','Z3','Z4','Z5A','Z5B'];

/* areas: one per programme key; each has model parts, activities and walk items */
const AREAS=[],AK={};
function area(key,layer,label){return AK[key]||(AK[key]=(AREAS.push({key,layer,label,els:[],list:[],items:[]}),AREAS[AREAS.length-1]))}

/* walk item -> areas */
const TW={'Tower 3':'T3','Tower 4':'T4'},ZN={'Zone 3':'Z3','Zone 4':'Z4','Zone 5A':'Z5A','Zone 5B':'Z5B'};
const LAY=e=>e==='Frame'?'STR':e==='Stairs'?'STA':e==='Facade'?'FAC':e==='Lifts'?'VT':'FIT';
const lvls=(a,z)=>{const o=[];for(let i=a;i<=z;i++)o.push('L'+String(i).padStart(2,'0'));return o};
function zonesOf(s){s=s||'';
  if(/Zone\s*0?1\b/i.test(s))return['Z1'];if(/Zone\s*0?2\b/i.test(s))return['Z2'];if(/Zone\s*5A/i.test(s))return['Z5A'];if(/Zone\s*5B/i.test(s))return['Z5B'];
  if(/Zone\s*0?3/i.test(s))return['Z3'];if(/Zone\s*0?4\b/i.test(s))return['Z4'];
  if(/^T-?3\b|\bT-3\b/.test(s))return['Z1'];if(/^T-?4\b|\bT-4\b/.test(s))return['Z2'];if(/Other Zones/i.test(s))return['Z3','Z4','Z5A','Z5B'];return null}
const vcls=s=>{s=String(s||'').trim();return /Express|^B\d/.test(s)?'B':/Parking|Shuttle|Shutle|^C\d/.test(s)?'C':/Service|Fire|^S\d/.test(s)?'S':/Passenger|^A\d/.test(s)?'A':null};
function facKeys(t,loc){const parts=String(loc||'').split(' · '),el=parts[0],band=parts.slice(1).join(' · ');
  if(/^(Inclined|Standing)/.test(el))return[`${t}/ROOF/FAC/S`];
  const si=ELO[t].indexOf(el),m=band.match(/L(\d+)\s*to\s*(?:L(\d+)|Top|Roof)/i);
  if(si<0&&!m)return loc?[]:lvls(1,TOP[t]).concat('ROOF').flatMap(l=>SIDES.map(s=>`${t}/${l}/FAC/${s}`));
  let lv;if(m){const a=+m[1],z=m[2]?+m[2]:TOP[t]+1;lv=lvls(a,Math.min(z,TOP[t]));if(z>TOP[t])lv.push('ROOF')}else lv=lvls(1,TOP[t]).concat('ROOF');
  const sd=si>=0?[SIDES[si%4]]:SIDES;return lv.flatMap(l=>sd.map(s=>`${t}/${l}/FAC/${s}`))}
function keysOf(it){const b=it.b,l=it.l,L=LAY(it.e),loc=it.loc||'';
  const pod=(z,lv)=>`${z}/${lv}/${L==='STR'?'STR':L==='STA'?'STA':'FIT'}`;
  if(TW[b]){const t=TW[b];
    if(l==='Lifts'){const c=vcls(loc)||vcls(it.w);return P.K.filter(k=>k.startsWith(t+'/VT/')&&(!c||vcls(k.split('/')[2])===c))}
    if(l==='Facade')return facKeys(t,loc);
    if(l==='Roof')return L==='STR'?[`${t}/ROOF/STR`]:L==='FIT'?[`${t}/ROOF/FIT`]:[];
    if(/^L\d\d$/.test(l))return[`${t}/${l}/${L==='STR'||L==='STA'?L:'FIT'}`];
    if(PODL.includes(l))return[pod(t==='T3'?'Z1':'Z2',l)];return[]}
  if(ZN[b]){const lv=l==='L01'?'P05':l;return PODL.includes(lv)?[pod(ZN[b],lv)]:[]}
  if(b==='Podium'){if(l==='Facade')return['POD/ALL/FAC'];const lv=l==='L01'?'P05':l;if(!PODL.includes(lv)||L==='VT')return[];return(zonesOf(loc)||ZALL).map(z=>pod(z,lv))}
  if(b==='Basement'){if(!PODL.includes(l))return[];return(zonesOf(loc)||ZALL).map(z=>pod(z,l))}
  if(b==='Site')return['SITE/GF/LAND'];return[]}

/* numbers */
function frac(list,p,d){const [si,fi]=PR[p].idx;let n=0,s=0,act=0;
  for(const i of list){const a=P.A[i],st=a[si],fn=a[fi];if(st==null||fn==null)continue;n++;if(fn<=d)s++;else if(st<=d){s+=fn>st?(d-st)/(fn-st):0;act++}}
  return n?{f:s/n,act,n}:{f:1,act:0,n:0}}
const nowOf=(it,k)=>{const L=latest(it,k);if(L)return L.p;if(it.rec==='Done')return 100;if(it.rec==='Not due'||it.rec==='Not started, due')return 0;return null};
const zeroOf=it=>{const L=latest(it,'2026-11-19');return L?L.p:it.rec==='Done'?100:0};
let DAY4=0,WK='',SPAN=[0,0];
const pday=()=>M.day==null?DAY4:M.day;
function compute(){const c=ctx();WK=c.wkKey;DAY4=day4(c.date);
  for(const a of AREAS)a.items=[];
  for(const it of ALL())for(const k of new Set(keysOf(it))){const a=AK[k];if(a)a.items.push(it)}
  for(const a of AREAS){let n=0,s=0,s0=0,lw=null;const wl={};
    for(const it of a.items){const v=nowOf(it,WK);const w=it.b+'|'+it.l;wl[w]=(wl[w]||0)+1;if(v==null)continue;n++;s+=v;s0+=zeroOf(it);const L=latest(it,WK);if(L&&!L.rec&&(!lw||L.w>lw))lw=L.w}
    a.n=n;a.A=n?s/n/100:null;a.a0=n?s0/n/100:0;a.lw=lw;a.walk=Object.keys(wl).sort((x,y)=>wl[y]-wl[x])[0]||null;
    a.ref=null;let lo=1e9;for(const it of a.items){if(it.b+'|'+it.l!==a.walk)continue;const v=nowOf(it,WK);const q=v==null?101:v;if(q<lo){lo=q;a.ref=it.r}}
    a.nop=!a.list.length&&n>0&&a.a0<.995}
  prog()}
function prog(){const d=pday();
  for(const a of AREAS){for(const p of ['T','U','B']){if(a.nop){a[p]=null;a['s'+p]=false;continue}const f=frac(a.list,p,d);a[p]=a.a0+(1-a.a0)*f.f;a['s'+p]=f.act>0}
    a.gap=a.A==null||a.T==null?null:(a.A-a.T)*100}}

/* colours */
function look(a,p){const L=a.layer;
  if(p==='F')return L==='VT'?{col:C.VT1,op:.95}:{real:true,op:1};
  if(p==='W'){const w=(window.PLAN&&window.PLAN.byKey||{})[a.key];if(w)return{col:w.pr===1?C.RED:w.pr===2?C.ORG:C.AMB,op:L==='FAC'?.7:.97,glow:w.pr===1};return L==='STR'||L==='FAC'?{col:C.GHOST,op:L==='FAC'?.05:.035,ghost:true}:null}
  if(a.nop&&p!=='A')return{col:C.NOP,op:L==='FIT'?.55:.6};
  if(p==='G'){if(a.gap==null)return L==='STR'||L==='STA'||L==='FAC'?{col:C.HAZE,op:.06}:null;
    const col=a.gap>=-5?C.GRN:a.gap>=-15?C.ORG:C.RED;return{col,op:L==='FAC'?.55:L==='STR'?1:.9}}
  const v=p==='A'?a.A:a[p],st=p==='A'?false:a['s'+p];
  if(v==null)return L==='STR'||L==='FAC'||L==='LAND'?{col:C.HAZE,op:L==='STR'?.12:.05,ghost:true}:null;
  if(v>=.995)return L==='VT'?{col:C.VT1,op:.95}:{real:true,op:1};
  if(v>.005||st){if(L==='STR'||L==='STA')return{col:C.AMB,op:.96,glow:true};if(L==='FAC')return{real:true,op:.22+.5*v,part:true};
    if(L==='FIT')return{col:C.FIT0.clone().lerp(C.FIT1,v),op:.55+.4*v};if(L==='VT')return{col:C.VT0.clone().lerp(C.VT1,v),op:.9};return{col:C.L0.clone().lerp(C.L1,v),op:.92}}
  if(L==='FAC')return{col:C.GHOST,op:.06,ghost:true};
  return null}
/* explorer: one building, zone or floor at a time */
const BNAME={ALL:'Whole site',T3:'Tower 3',T4:'Tower 4',POD:'Podium',BASE:'Basements'};
const ZNAME={Z1:'Zone 1 (T3)',Z2:'Zone 2 (T4)',Z3:'Zone 3',Z4:'Zone 4',Z5A:'Zone 5A',Z5B:'Zone 5B'};
function meta(a){const p=a.key.split('/');a.zone=null;
  if(p[0]==='T3'||p[0]==='T4'){a.bld=p[0];a.lv=p[1]}
  else if(/^Z/.test(p[0])){a.zone=p[0];a.lv=p[1];a.bld=p[0]==='Z1'?'T3':p[0]==='Z2'?'T4':'POD'}
  else if(p[0]==='POD'){a.bld='POD';a.lv=p[1]==='LAND'?'LAND':'ALL'}
  else if(p[0]==='BR'){a.bld='POD';a.lv='GF'}else{a.bld='SITE';a.lv='GF'}}
function elevOf(lv,b){if(lv==null||lv==='ALL'||lv==='VT')return null;if(lv==='ROOF')return b==='T4'?100.85:128.18;if(lv==='LAND')return 27;return G.levels[lv]??null}
const aElev=a=>elevOf(a.lv,a.bld);
function inScope(a){const f=M.focus;if(f.b==='ALL')return true;
  if(f.b==='BASE')return /^B\d$/.test(a.lv)&&(!f.z||a.zone===f.z);
  if(f.z&&a.zone!==f.z)return false;
  return a.bld===f.b}
function levelsFor(b){const L=n=>Array.from({length:n},(_,i)=>'L'+String(n-i).padStart(2,'0'));const P=['P05','P04','P03','P02','P01','GF','B1','B2','B3'];
  return b==='T3'?['ROOF',...L(22),...P]:b==='T4'?['ROOF',...L(16),...P]:b==='POD'?P:b==='BASE'?['B1','B2','B3']:[]}
const dimS=(s,cap)=>s&&({...s,op:Math.min(s.op,cap),part:true,ghost:true});
function focusMod(a,s){const f=M.focus;if(!s||(f.b==='ALL'&&!f.lv))return s;const ins=inScope(a),e=aElev(a);
  if(f.lv){const fe=elevOf(f.lv,f.b);
    if(ins){if(a.lv===f.lv)return s;if(e==null)return a.layer==='VT'?dimS(s,.22):null;if(e>fe+.5)return null;return dimS(s,.26)}
    if(e==null||e>fe+.5)return null;return a.layer==='STR'?{col:C.GHOST,op:.022,ghost:true}:null}
  if(ins)return s;if(f.b==='BASE')return null;
  return a.layer==='FAC'?{col:C.GHOST,op:.026,ghost:true}:null}
function paint(p){for(const a of AREAS){const s=M.show[a.layer]?focusMod(a,look(a,p)):null;
  for(const e of a.els){const m=e.mesh;m.visible=!!s;if(!s)continue;
    if(s.real&&e.real){m.material=e.real;const op=s.part?s.op*(e.glass?.9:1):e.glass?.72:1;e.real.opacity=op;e.real.depthWrite=!e.glass&&op>.95;m.renderOrder=e.glass?3:op<1?2:0}
    else{m.material=e.tint;e.tint.color.copy(s.col);const op=e.glass?Math.min(s.op,.62):s.op;e.tint.opacity=op;e.tint.depthWrite=op>.6;
      e.tint.emissive.copy(s.glow?C.AMBG:C.BLACK);m.renderOrder=op<.6?2:op<1?1:0}
    m.castShadow=!s.ghost&&m.material.opacity>.6&&(a.layer==='STR'||a.layer==='FAC'||a.layer==='STA')}}}

/* model file: decode the delta-packed parts */
function decode(buf){const u8=new Uint8Array(buf),dv=new DataView(buf);
  if(String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!=='UPM2')throw new Error('Model file not recognised.');
  const hl=dv.getUint32(4,true),head=JSON.parse(new TextDecoder().decode(u8.subarray(8,8+hl)));let o=8+hl;o+=(4-o%4)%4;
  const nv=head.nv,ni=head.ni,lo=u8.subarray(o,o+nv*3),hi=u8.subarray(o+nv*3,o+nv*6);o+=nv*6;o+=(4-o%4)%4;
  const col=u8.subarray(o,o+nv*3);o+=nv*3;o+=(4-o%4)%4;const idd=new Uint16Array(buf,o,ni);
  const pos=new Float32Array(nv*3),mn=head.q.min,mx=head.q.max,sc=[0,1,2].map(i=>(mx[i]-mn[i])/65535);
  for(const pt of head.parts){const vs=pt[2],vc=pt[3];for(let ax=0;ax<3;ax++){let acc=0;const b=ax*nv,m0=mn[ax],s=sc[ax];
    for(let i=vs;i<vs+vc;i++){acc=((acc+(lo[b+i]|(hi[b+i]<<8)))<<16)>>16;pos[i*3+ax]=m0+(acc+32768)*s}}}
  const idx=new Uint16Array(ni);let a=0;for(let i=0;i<ni;i++){a=(a+idd[i])&65535;idx[i]=a}
  const lin=new Uint8Array(256);for(let i=0;i<256;i++)lin[i]=Math.round(255*Math.pow(i/255,2.2));
  const cl=new Uint8Array(col.length);for(let i=0;i<col.length;i++)cl[i]=lin[col[i]];
  return{head,pos,col:cl,idx}}
function fetchModel(){const url=(window.SW_MODEL||'_m/model.bin');
  return fetch(url,{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw new Error(r.status===401?'Sign in again to load the model.':'Model not reachable ('+r.status+').');
    const total=+(r.headers.get('x-raw-length')||0);if(!r.body||!total)return r.arrayBuffer();
    const rd=r.body.getReader(),buf=new Uint8Array(total);let got=0;
    for(;;){const {done,value}=await rd.read();if(done)break;buf.set(value,got);got+=value.length;const l=$('#ld4');if(l)l.querySelector('b').textContent=Math.round(got/total*100)+'%'}
    return buf.buffer})}

/* scene */
let T,renderer,scene,camera,controls,canvas,board,ray,mouse,C={},W=0,H=0,pending=false,sun,ground,gMat,coarse=false,CTR=null,HOME=null;
function build(data){const {head,pos,col,idx}=data;G=head;
  for(const pt of head.parts){const [ai,g,vs,vc,is,ic]=pt,[key,layer,label]=head.areas[ai];
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos.subarray(vs*3,(vs+vc)*3),3));
    geo.setAttribute('color',new T.BufferAttribute(col.subarray(vs*3,(vs+vc)*3),3,true));geo.setIndex(new T.BufferAttribute(idx.subarray(is,is+ic),1));
    geo.computeBoundingSphere();geo.computeBoundingBox();const glass=!!g;
    const real=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,transparent:true,side:T.DoubleSide,roughness:glass?.06:.85,metalness:glass?.6:.02,envMapIntensity:glass?1.4:.38});
    const tint=new T.MeshStandardMaterial({flatShading:true,transparent:true,side:T.DoubleSide,roughness:.6,metalness:.02,envMapIntensity:.35});
    const mesh=new T.Mesh(geo,real);mesh.matrixAutoUpdate=false;mesh.receiveShadow=!coarse;scene.add(mesh);
    const a=area(key,layer,label);const e={mesh,real,tint,glass,a};mesh.userData.e=e;a.els.push(e)}
  // lifts: shafts in each core, from B3 to the roof
  for(const t of ['T3','T4']){const tw=head.towers[t],keys=P.K.filter(k=>k.startsWith(t+'/VT/')).sort(),ang=Math.atan2(tw.u[1],tw.u[0]),n=keys.length||1;
    keys.forEach((k,j)=>{const w=2.6,d=3.2,off=(j-(n-1)/2)*(w+.5),x=tw.core[0]+Math.cos(ang)*off,z=tw.core[1]+Math.sin(ang)*off,y0=head.levels.B3,y1=tw.top-6;
      const geo=new T.BoxGeometry(w,y1-y0,d);const tint=new T.MeshStandardMaterial({transparent:true,roughness:.5});const mesh=new T.Mesh(geo,tint);
      mesh.position.set(x,(y0+y1)/2,z);mesh.rotation.y=-ang;mesh.updateMatrix();mesh.matrixAutoUpdate=false;scene.add(mesh);
      const a=area(k,'VT',`${t==='T3'?'Tower 3':'Tower 4'} · Lifts: ${k.split('/')[2].trim()}`);const e={mesh,real:null,tint,glass:false,a};mesh.userData.e=e;a.els.push(e)})}
  for(const a of AREAS)meta(a);
  P.A.forEach((a,i)=>{for(let j=6;j<a.length;j++){const ar=AK[P.K[a[j]]];if(ar)ar.list.push(i)}});
  let lo=1e9,hi=-1e9;for(const a of P.A)for(const i of [0,2,4]){if(a[i]!=null&&a[i]<lo)lo=a[i];if(a[i+1]!=null&&a[i+1]>hi)hi=a[i+1]}SPAN=[Math.max(lo,day4(new Date(2026,10,20))),hi]}
function skyEnv(){const pm=new T.PMREMGenerator(renderer),es=new T.Scene(),geo=new T.SphereGeometry(100,48,24),c=[],p=geo.attributes.position;
  const top=new T.Color('#9fc3ee'),hor=new T.Color('#fff4e6'),bot=new T.Color('#c9bfb1'),tmp=new T.Color();
  for(let i=0;i<p.count;i++){const y=p.getY(i)/100;tmp.copy(y>0?hor:hor).lerp(y>0?top:bot,Math.pow(Math.abs(y),y>0?.6:.4));c.push(tmp.r,tmp.g,tmp.b)}
  geo.setAttribute('color',new T.Float32BufferAttribute(c,3));es.add(new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide})));
  const s=new T.Mesh(new T.SphereGeometry(7,16,8),new T.MeshBasicMaterial({color:new T.Color(6,5.6,5)}));s.position.set(60,55,30);es.add(s);
  const env=pm.fromScene(es,.03).texture;pm.dispose();return env}
function groundTex(){const cv=document.createElement('canvas');cv.width=cv.height=512;const g=cv.getContext('2d'),r=g.createRadialGradient(256,256,30,256,256,256);
  r.addColorStop(0,'rgba(208,202,193,1)');r.addColorStop(.5,'rgba(218,212,204,.96)');r.addColorStop(1,'rgba(240,236,242,0)');g.fillStyle=r;g.fillRect(0,0,512,512);
  g.strokeStyle='rgba(170,160,150,.16)';g.lineWidth=1;for(let i=0;i<=512;i+=16){g.beginPath();g.moveTo(i,0);g.lineTo(i,512);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(512,i);g.stroke()}
  const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t}
function views(){const m=M.mode;if(m!=='AT')return[{p:m,x:0,y:0,w:W,h:H}];if(W<640){const h=H/2;return[{p:'A',x:0,y:0,w:W,h},{p:'T',x:0,y:h,w:W,h}]}const w=W/2;return[{p:'A',x:0,y:0,w,h:H},{p:'T',x:w,y:0,w,h:H}]}
function setAspect(a){camera.aspect=a;camera.fov=2*Math.atan(Math.max(.40,.38/a))*180/Math.PI;camera.updateProjectionMatrix()}
function size(){W=board.clientWidth;H=board.clientHeight;if(W&&H)renderer.setSize(W,H,false)}
function draw(){if(pending||!M.ready)return;pending=true;requestAnimationFrame(render)}
const walked=()=>AREAS.filter(a=>a.A!=null&&a.T!=null),nops=()=>AREAS.filter(a=>a.nop);
const mean=(l,f)=>l.length?l.reduce((s,a)=>s+f(a),0)/l.length:null;
function render(){pending=false;if(!M.ready||ui.view!=='4d')return;if(!W)size();
  renderer.setScissorTest(true);renderer.setClearColor(0x000000,0);let html='';const wl=walked(),vs=views();
  const sk=[M.mode,pday(),M.focus.b,M.focus.z,M.focus.lv,Object.values(M.show).join(),WK,AREAS.length].join('|');
  vs.forEach((v,i)=>{paint(v.p);setAspect(v.w/v.h);
    if(!coarse){if(i===0&&M.shadowKey!==sk){renderer.shadowMap.needsUpdate=true;M.shadowKey=sk}}
    renderer.setViewport(v.x,H-v.y-v.h,v.w,v.h);renderer.setScissor(v.x,H-v.y-v.h,v.w,v.h);renderer.clear();renderer.render(scene,camera);
    const nm=v.p==='G'?'Gap to target':PR[v.p].name,o=v.p==='G'||v.p==='F'||v.p==='W'?null:mean(wl,a=>v.p==='A'?a.A:a[v.p]);
    const when=v.p==='A'?'walk of '+fmt(ctx().wk):v.p==='F'?'BSBG BIM model':v.p==='W'?((window.PLAN&&window.PLAN.issue)||'no programme uploaded'):fmt(dOf(pday()));
    html+=`<div class="vl4" style="left:${v.x+10}px;top:${v.y+10}px;border-inline-start:4px solid ${v.p==='G'?'var(--red)':pcol(v.p)}"><b>${esc(nm)}</b><span>${v.p==='W'?((window.PLAN&&window.PLAN.n)||0)+' stops to check · red first':v.p==='F'?'Towers 3 and 4, podium, basements':o==null?wl.filter(a=>a.gap<-15).length+' areas more than 15 pts behind':Math.round(o*100)+'% done'} · ${esc(when)}</span></div>`;
    for(const t of ['T3','T4']){if(M.focus.lv||(M.focus.b!=='ALL'&&M.focus.b!==t))continue;const tw=G.towers[t],q=new T.Vector3(tw.c[0],tw.top+4,tw.c[2]).project(camera);if(q.z<1&&q.x>-1&&q.x<1&&q.y>-1&&q.y<1)html+=`<div class="tg4" style="left:${v.x+(q.x+1)/2*v.w}px;top:${v.y+(1-q.y)/2*v.h}px">${t==='T3'?'Tower 3':'Tower 4'}</div>`}
    if(v.x>0)html+=`<div style="position:absolute;left:${v.x}px;top:0;bottom:0;width:1px;background:var(--line)"></div>`;
    if(v.y>0)html+=`<div style="position:absolute;top:${v.y}px;left:0;right:0;height:1px;background:var(--line)"></div>`});
  $('#lab4').innerHTML=html}
function boxOf(test){const b=new T.Box3(),t=new T.Box3();for(const a of AREAS){if(!test(a))continue;for(const e of a.els){const g=e.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();t.copy(g.boundingBox).applyMatrix4(e.mesh.matrixWorld);b.union(t)}}return b}
function ptsOf(test){const pts=[],box=new T.Box3(),t=new T.Box3();for(const a of AREAS){if(!test(a))continue;for(const e of a.els){const g=e.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();t.copy(g.boundingBox).applyMatrix4(e.mesh.matrixWorld);box.union(t);
    for(const x of [t.min.x,t.max.x])for(const y of [t.min.y,t.max.y])for(const z of [t.min.z,t.max.z])pts.push(new T.Vector3(x,y,z))}}return{pts,box}}
function fitView(box,dir,ms,P0){if(box.isEmpty())return;const tgt=box.getCenter(new T.Vector3());let pts=P0;if(!pts){pts=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new T.Vector3(x,y,z))}
  const d=dir.clone().normalize(),asp=views().map(v=>v.w/v.h),save={p:camera.position.clone(),q:camera.quaternion.clone(),a:camera.aspect,f:camera.fov},v=new T.Vector3();
  let lo=5,hi=4000;for(let i=0;i<26;i++){const mid=(lo+hi)/2;camera.position.copy(tgt).addScaledVector(d,mid);camera.lookAt(tgt);camera.updateMatrixWorld();let ok=true;
    for(const a of asp){setAspect(a);for(const q of pts){v.copy(q).project(camera);if(Math.abs(v.x)>.95||v.y>.86||v.y<-.93||v.z>1){ok=false;break}}if(!ok)break}
    if(ok)hi=mid;else lo=mid}
  camera.position.copy(save.p);camera.quaternion.copy(save.q);camera.aspect=save.a;camera.fov=save.f;camera.updateProjectionMatrix();
  const to={p:tgt.clone().addScaledVector(d,hi),t:tgt};if(ms)fly({p:camera.position.clone(),t:controls.target.clone()},to,ms);return to}
function curDir(minEl,maxEl){const d=camera.position.clone().sub(controls.target).normalize();const el=Math.asin(Math.max(-1,Math.min(1,d.y))),c=Math.min(maxEl,Math.max(minEl,el)),h=Math.hypot(d.x,d.z)||1;
  return new T.Vector3(d.x/h*Math.cos(c),Math.sin(c),d.z/h*Math.cos(c))}
function goFocus(ms){const f=M.focus;const q=ptsOf(f.lv?a=>inScope(a)&&a.lv===f.lv:f.b==='ALL'?a=>a.bld!=='SITE'&&a.key!=='BR/GF/STR':a=>inScope(a)&&a.lv!=='VT'&&a.lv!=='ALL');
  if(q.box.isEmpty())return;const dir=f.lv?curDir(.75,1.05):f.b==='ALL'?new T.Vector3(-.62,.5,.78):curDir(.35,.75);fitView(q.box,dir,ms||1100,q.pts)}
function frame(){const b=new T.Box3(new T.Vector3(...G.q.min),new T.Vector3(...G.q.max));CTR=b.getCenter(new T.Vector3());CTR.y=G.levels.P05;
  const R=b.getSize(new T.Vector3()).length()*.5;const tc=new T.Vector3((G.towers.T3.c[0]+G.towers.T4.c[0])/2,40,(G.towers.T3.c[2]+G.towers.T4.c[2])/2+12);HOME={t:tc,p:tc.clone().add(new T.Vector3(-.62,.5,.78).normalize().multiplyScalar(R*2.05))};const q=ptsOf(a=>a.bld!=='SITE'&&a.key!=='BR/GF/STR');const full=fitView(q.box,new T.Vector3(-.62,.5,.78),0,q.pts);if(full)HOME=full}
function fly(from,to,ms){const t0=performance.now();M.intro=1;const s={p:from.p.clone(),t:from.t.clone()};
  const step=now=>{const k=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-k,3);camera.position.lerpVectors(s.p,to.p,e);controls.target.lerpVectors(s.t,to.t,e);controls.update();render();if(k<1&&M.intro)requestAnimationFrame(step);else M.intro=0};
  requestAnimationFrame(step)}
async function init(){T=THREE;P=window.P4D||P;canvas=$('#cv4');board=$('#board4');coarse=matchMedia('(pointer: coarse)').matches;
  renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.5:2));
  renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.physicallyCorrectLights=false;
  renderer.shadowMap.enabled=!coarse;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  scene=new T.Scene();scene.fog=new T.Fog(0xf2eef4,900,2600);scene.environment=skyEnv();
  camera=new T.PerspectiveCamera(38,1,1,4000);
  controls=new T.OrbitControls(camera,canvas);controls.enableDamping=false;controls.maxPolarAngle=Math.PI*.495;controls.minDistance=25;controls.maxDistance=900;controls.addEventListener('change',()=>{hideTip();if(!M.intro)draw()});
  scene.add(new T.HemisphereLight(0xf3f7ff,0xcfc4b6,.42));
  sun=new T.DirectionalLight(0xffeed8,2.1);scene.add(sun,sun.target);const fill=new T.DirectionalLight(0xdbe6ff,.28);scene.add(fill,fill.target);
  const l=$('#ld4');if(l)l.innerHTML='Loading the BIM model… <b>0%</b>';
  const data=decode(await fetchModel());if(l)l.innerHTML='Building the 3D model…';await new Promise(z=>setTimeout(z,30));
  build(data);size();frame();
  sun.position.copy(CTR).add(new T.Vector3(185,205,95));sun.target.position.copy(CTR);fill.position.copy(CTR).add(new T.Vector3(-170,80,-40));fill.target.position.copy(CTR);
  if(!coarse){sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0004;sun.shadow.normalBias=.4;Object.assign(sun.shadow.camera,{left:-190,right:190,top:190,bottom:-190,near:40,far:700});sun.shadow.camera.updateProjectionMatrix()}
  gMat=new T.MeshStandardMaterial({map:groundTex(),transparent:true,roughness:1,metalness:0,depthWrite:false,envMapIntensity:.25});
  ground=new T.Mesh(new T.CircleGeometry(620,72),gMat);ground.rotation.x=-Math.PI/2;ground.position.set(CTR.x,G.ground-.08,CTR.z);ground.receiveShadow=!coarse;ground.renderOrder=-1;scene.add(ground);
  const c=h=>new T.Color(h).convertSRGBToLinear();Object.assign(C,{GLASS0:c('#9cc4ea'),FIT0:c('#a8ddd3'),FIT1:c('#0b5f66'),VT0:c('#D9CCEB'),VT1:c('#6B4FA0'),L0:c('#D8E5C7'),L1:c('#5E8C3A'),AMB:c('#F59A2F'),AMBG:c('#5a2a00'),HAZE:c('#9AA0A6'),GHOST:c('#8fa3b8'),NOP:c('#3E4A52'),GRN:c('#2e9e5b'),ORG:c('#e5701a'),RED:c('#c00000'),BLACK:new T.Color(0)});
  ray=new T.Raycaster();mouse=new T.Vector2();
  new ResizeObserver(()=>{size();draw()}).observe(board);
  canvas.addEventListener('pointermove',ev=>{if(ev.pointerType==='mouse'&&!M.pin&&!ev.buttons)pick(ev,false)});
  canvas.addEventListener('pointerleave',()=>{if(!M.pin)hideTip()});
  let down=null;canvas.addEventListener('pointerdown',ev=>{down=[ev.clientX,ev.clientY];M.intro=0;stop()});
  canvas.addEventListener('pointerup',ev=>{if(down&&Math.hypot(ev.clientX-down[0],ev.clientY-down[1])<7)pick(ev,true);down=null});
  M.ready=true;$('#ld4')?.remove();size();
  const start={p:CTR.clone().add(new T.Vector3(-520,430,160)),t:CTR.clone().add(new T.Vector3(0,30,0))};camera.position.copy(start.p);controls.target.copy(start.t);controls.update()}
function ground4(){if(!gMat)return;const f=M.focus,under=f.b==='BASE'||(f.lv&&/^B\d$/.test(f.lv));gMat.opacity=under?.1:1;sun.shadow&&(renderer.shadowMap.needsUpdate=true)}

/* tap and hover */
let hoverT=0;
function hideTip(){const t=$('#tip4');if(t)t.style.display='none';M.pin=null}
function pick(ev,pin){const now=performance.now();if(!pin&&now-hoverT<120)return;hoverT=now;
  const r=canvas.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;const v=views().find(v=>x>=v.x&&x<v.x+v.w&&y>=v.y&&y<v.y+v.h);if(!v)return;
  paint(v.p);setAspect(v.w/v.h);mouse.set((x-v.x)/v.w*2-1,-((y-v.y)/v.h)*2+1);ray.setFromCamera(mouse,camera);
  const meshes=[];for(const a of AREAS)for(const e of a.els)if(e.mesh.visible&&e.mesh.material.opacity>.12)meshes.push(e.mesh);
  const hits=ray.intersectObjects(meshes,false);draw();
  if(!hits.length){hideTip();return}
  const ha=hits[0].object.userData.e.a;if(pin&&M.focus.b!=='ALL'&&inScope(ha)&&ha.lv&&levelsFor(M.focus.b).includes(ha.lv)&&M.focus.lv!==ha.lv){setFocus({lv:ha.lv});return}
  showTip(ha,x,y,pin)}
const pc=v=>v==null?'–':Math.round(v*100)+'%';
function tipHTML(a){const gp=a.gap,cls=gp==null?'':gp>=-5?'g':gp>=-15?'o':'r';
  return`<button class="x" type="button" data-x4 aria-label="Close">×</button><h3>${esc(a.label)}</h3>
  <table><tr><td style="color:var(--pur);font-weight:700">Actual (walk)</td><td class="n"><b>${pc(a.A)}</b></td><td class="src">${a.n?a.n+' item'+(a.n>1?'s':'')+(a.lw?', walked '+fmt(ds(a.lw)):''):'not in the walk yet'}</td></tr>
  ${['T','U','B'].map(p=>`<tr><td style="color:${pcol(p)};font-weight:600">${PR[p].name}</td><td class="n">${pc(a[p])}</td><td class="src">${a.list.length?a.list.length+' remaining activities':a.nop?'no activity':'built before 20 Nov'}</td></tr>`).join('')}
  ${gp==null?'':`<tr><td>Gap to target</td><td class="n gp ${cls}">${gp>0?'+':''}${Math.round(gp)} pts</td><td></td></tr>`}</table>
  ${M.day!=null&&M.day!==DAY4?`<p class="src" style="margin:0 0 6px">Programme % read on ${fmt(dOf(pday()))}.</p>`:''}
  ${a.nop?'<p class="src" style="margin:0 0 8px;color:var(--red);font-weight:600">The walk says this is not finished, but ASC’s programme has no remaining activity for it.</p>':''}
  ${(()=>{const w=(window.PLAN&&window.PLAN.byKey||{})[a.key];return w?`<div class="pl4"><b>Walk plan: ${w.stops.length} stop${w.stops.length>1?'s':''}</b>${w.stops.slice(0,3).map(st=>`<button type="button" class="plk" data-pl="${esc(st.key)}"><span class="pp p${st.pr}">P${st.pr}</span> ${esc(st.id||'Open item')} · ${esc(st.top)}</button>`).join('')}</div>`:''})()}
  ${a.walk?`<button class="btn pur" type="button" data-w4="${esc(a.ref||a.walk)}">Walk it: ${esc(a.walk.replace('|',' · '))}</button>`:'<span class="src">No walk item here. Add one from the Walk tab if needed.</span>'}`}
function showTip(a,x,y,pin){const t=$('#tip4');t.innerHTML=tipHTML(a);t.style.display='block';M.pin=pin?a:null;
  const tw=Math.min(330,W-20),th=t.offsetHeight||170;t.style.left=Math.max(10,Math.min(x+14,W-tw-10))+'px';t.style.top=Math.max(10,Math.min(y+14,H-th-10))+'px'}

/* timeline: the programme week by week */
function tl(){const r=$('#rng4');if(!r||!SPAN[1])return;r.min=SPAN[0];r.max=SPAN[1];r.value=pday();
  const d=pday();$('#tld4').innerHTML=`<b>${fmt(dOf(d))}</b>${d===DAY4?' · walk date':d<DAY4?' · before the walk':' · ahead'}`;
  $('#play4').textContent=M.play?'❚❚ Pause':'▶ Play the programme';const pr=(d-SPAN[0])/(SPAN[1]-SPAN[0])*100;r.style.setProperty('--p',pr.toFixed(1)+'%');
  const tm=$('#tmk4');if(tm)tm.style.left=((DAY4-SPAN[0])/(SPAN[1]-SPAN[0])*100).toFixed(2)+'%'}
function setDay(d){M.day=Math.max(SPAN[0],Math.min(SPAN[1],Math.round(d)));if(M.day===DAY4)M.day=null;prog();tl();kpis();sel();draw()}
function stop(){if(M.play){clearInterval(M.play);M.play=0;tl();trades();behind()}}
function play(){if(M.play){stop();return}if(M.mode==='A'){M.mode='AT';$$('#seg4 button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m4==='AT'));legend()}
  if(pday()>=SPAN[1]-7)M.day=SPAN[0];
  M.play=setInterval(()=>{const d=pday()+7;if(d>=SPAN[1]){setDay(SPAN[1]);stop();return}setDay(d)},coarse?190:120);tl()}

/* panels */
function kpis(){const wl=walked(),A=mean(wl,a=>a.A),Tt=mean(wl,a=>a.T),U=mean(wl,a=>a.U),n15=wl.filter(a=>a.gap<-15).length,tot=AREAS.filter(a=>a.items.length||a.list.length).length;
  const k=(c,v,t)=>`<div class="kpi" style="--c:${c}"><b>${v}</b><span>${t}</span></div>`,on=M.day!=null?' on '+fmt(dOf(pday())):'';
  $('#kp4').innerHTML=k('var(--pur)',pc(A),'Actual, from the walk')+k('#c00000',pc(Tt),'Target (R1) says'+on)+k('#1e1e1e',pc(U),'20 Nov update says'+on)
    +`<div class="kpi r" style="--c:var(--red)"><b>${n15}</b><span>areas more than 15 pts behind target${on}</span></div>`+k('#3E4A52',nops().length,'areas open on site with no activity in the programme')+k('var(--line)',wl.length+nops().length+' / '+tot,'areas walked / areas in the model')}
function trades(){const rows=LAYERS.map(l=>{const wl=walked().filter(a=>a.layer===l.k);if(!wl.length)return'';const v={A:mean(wl,a=>a.A),T:mean(wl,a=>a.T),U:mean(wl,a=>a.U),B:mean(wl,a=>a.B)};const g=(v.A-v.T)*100,cls=g>=-5?'g':g>=-15?'o':'r';
    return`<tr><td>${l.name}<div class="src">${wl.length} areas</div></td>${['A','T','U','B'].map(p=>`<td class="n">${pc(v[p])}<span class="bar4"><i style="width:${(v[p]*100).toFixed(1)}%;background:${pcol(p)}"></i></span></td>`).join('')}<td class="n gp ${cls}">${g>0?'+':''}${Math.round(g)}</td></tr>`}).join('');
  $('#tr4').innerHTML=`<thead><tr><th>Trade</th>${['A','T','U','B'].map(p=>`<th class="n" style="color:${pcol(p)}">${PR[p].name}</th>`).join('')}<th class="n">Gap, pts</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Nothing walked yet this walk.</td></tr>'}</tbody>`}
const nopHTML=()=>{const l=nops();return l.length?`<h3 style="margin:14px 0 4px;font:600 18px/1.2 'Barlow Semi Condensed',sans-serif">Open on site, not in ASC’s programme (${l.length})</h3>`+l.slice(0,10).map(a=>`<button type="button" class="bh4" ${a.walk?`data-w4="${esc(a.ref||a.walk)}"`:''}><span><b>${esc(a.label)}</b></span><span class="go">Walk it</span><span class="d" style="color:#3E4A52">${pc(a.A)}</span><span class="m">Walk ${pc(a.A)} done, no remaining activity in the target</span></button>`).join(''):''};
function behind(){const l=walked().filter(a=>a.gap<-5).sort((x,y)=>x.gap-y.gap).slice(0,12);
  $('#bh4').innerHTML=nopHTML();$('#bh4').insertAdjacentHTML('afterbegin',l.length?l.map(a=>`<button type="button" class="bh4" ${a.walk?`data-w4="${esc(a.ref||a.walk)}"`:''}><span><b>${esc(a.label)}</b></span><span class="go">Walk it</span><span class="d">${Math.round(a.gap)} pts</span><span class="m">Actual ${pc(a.A)}, target ${pc(a.T)}, 20 Nov update ${pc(a.U)}</span></button>`).join(''):'<div class="empty">No area is more than 5 points behind the target.</div>')}
function legend(){const g=M.mode==='G';
  $('#lg4').innerHTML=(g?[['#2e9e5b','On target or ahead (within 5 pts)'],['#e5701a','Behind 5 to 15 pts'],['#c00000','Behind more than 15 pts']]:[['linear-gradient(135deg,#d6d2cb 50%,#7eaacc 50%)','Built: real materials from the BIM model'],['#F59A2F','In progress'],['#9cc4ea','Façade going up'],['linear-gradient(90deg,#a8ddd3,#0b5f66)','Fit-out & MEP (darker = further on)'],['#6B4FA0','Lifts'],['#8fa3b8','Faint: not started yet']])
    .map(([c,t])=>`<span><span class="sw" style="background:${c}"></span> ${t}</span>`).join('')+'<span><span class="sw" style="background:#9AA0A6;opacity:.5"></span> Grey haze: not in the walk yet</span><span><span class="sw" style="background:#3E4A52"></span> Slate: open on site, no activity in the programme</span>'}
function lay(){$('#lay4').innerHTML=LAYERS.map(l=>`<button type="button" class="chip" data-l4="${l.k}" aria-pressed="${M.show[l.k]}"><span class="sw" style="background:${l.col}"></span>${l.name}</button>`).join('')
}

function lvStat(b,z,lv){const l=AREAS.filter(a=>a.lv===lv&&(b==='BASE'?(!z||a.zone===z):(a.bld===b&&(!z||a.zone===z)))&&a.A!=null&&a.T!=null&&a.layer!=='VT');
  return l.length?{A:mean(l,a=>a.A),T:mean(l,a=>a.T),U:mean(l,a=>a.U),B:mean(l,a=>a.B),n:l.length,walk:(l.find(a=>a.walk)||{}).walk,ref:(l.find(a=>a.walk)||{}).ref}:null}
const lvLab=lv=>lv==='ROOF'?'Roof':lv;
function explorer(){const ex=$('#ex4');if(!ex||!M.ready)return;const f=M.focus;
  let h=`<div class="sc4">${Object.keys(BNAME).map(b=>`<button type="button" class="chip" data-b4="${b}" aria-pressed="${f.b===b}">${BNAME[b]}</button>`).join('')}</div>`;
  if(f.b==='POD'||f.b==='BASE'){const zs=f.b==='POD'?['Z3','Z4','Z5A','Z5B']:['Z1','Z2','Z3','Z4','Z5A','Z5B'];
    h+=`<div class="sc4 zn4"><button type="button" class="chip" data-z4="" aria-pressed="${!f.z}">All zones</button>${zs.map(z=>`<button type="button" class="chip" data-z4="${z}" aria-pressed="${f.z===z}">${ZNAME[z]}</button>`).join('')}</div>`}
  const lvs=levelsFor(f.b);
  if(lvs.length)h+=`<div class="lvs4" role="group" aria-label="Levels"><button type="button" class="lv4c all" data-lv4="" aria-pressed="${!f.lv}"><b>All</b><span>levels</span></button>${lvs.map(lv=>{const s=lvStat(f.b,f.z,lv),g=s?(s.A-s.T)*100:null,c=g==null?'#c9c3cc':g>=-5?'#2e9e5b':g>=-15?'#e5701a':'#c00000';
    return`<button type="button" class="lv4c" data-lv4="${lv}" aria-pressed="${f.lv===lv}" title="${esc(lvLab(lv))}${s?`: actual ${pc(s.A)}, target ${pc(s.T)}`:''}"><b>${esc(lvLab(lv))}</b><span><i style="background:${c}"></i>${s?pc(s.A):'–'}</span></button>`}).join('')}</div>`;
  else h+=`<p class="src" style="margin:0">Pick a tower, the podium or the basements to go floor by floor.</p>`;
  ex.innerHTML=h;const on=ex.querySelector('.lv4c[aria-pressed="true"]');if(on&&f.lv)on.scrollIntoView({block:'nearest',inline:'center'});sel()}
function sel(){const el=$('#sel4');if(!el)return;const f=M.focus;if(f.b==='ALL'){el.style.display='none';return}
  const nm=BNAME[f.b]+(f.z?' · '+ZNAME[f.z]:'')+(f.lv?' · '+(f.lv==='ROOF'?'Roof':/^L/.test(f.lv)?'Level '+(+f.lv.slice(1)):f.lv):'');
  let s=null;if(f.lv)s=lvStat(f.b,f.z,f.lv);else{const l=AREAS.filter(a=>inScope(a)&&a.A!=null&&a.T!=null&&a.layer!=='VT');s=l.length?{A:mean(l,a=>a.A),T:mean(l,a=>a.T),U:mean(l,a=>a.U),n:l.length,walk:(l.find(a=>a.walk)||{}).walk,ref:(l.find(a=>a.walk)||{}).ref}:null}
  const g=s?(s.A-s.T)*100:null,cls=g==null?'':g>=-5?'g':g>=-15?'o':'r';
  el.style.display='block';el.innerHTML=`<b>${esc(nm)}</b>${s?`<div class="r4"><span style="color:var(--pur)">Actual <b>${pc(s.A)}</b></span><span style="color:#c00000">Target <b>${pc(s.T)}</b></span><span>20 Nov update <b>${pc(s.U)}</b></span><span class="gp ${cls}">${g>0?'+':''}${Math.round(g)} pts</span></div><span class="src">${s.n} area${s.n>1?'s':''} in the walk${M.day!=null?', programme read on '+fmt(dOf(pday())):''}</span>`:'<span class="src">Nothing walked here yet.</span>'}
    <div class="tools">${s&&s.walk?`<button class="btn pur" type="button" data-w4="${esc(s.ref||s.walk)}">Walk it</button>`:''}${f.lv?`<button class="btn" type="button" data-lvstep="1">▲ Up</button><button class="btn" type="button" data-lvstep="-1">▼ Down</button>`:''}<button class="btn" type="button" data-b4="ALL">Whole site</button></div>`}
function setFocus(nf,fly){Object.assign(M.focus,nf);hideTip();ground4();explorer();draw();if(fly!==false)goFocus()}

/* three.js and the model load only when the 4D tab opens */
function loadJS(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('Could not load '+src));document.head.appendChild(s)})}
function ensure(){if(M.ready)return Promise.resolve();if(!M.loading)M.loading=(window.THREE?Promise.resolve():loadJS('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'))
  .then(()=>THREE.OrbitControls?0:loadJS('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js')).then(init)
  .then(()=>{compute();fly({p:camera.position.clone(),t:controls.target.clone()},HOME,2600)})
  .catch(e=>{M.loading=null;const l=$('#ld4');if(l)l.textContent=(e&&e.message&&/Sign in|Model/.test(e.message))?e.message:'The 3D model could not load. Check the internet connection and open the tab again.'});return M.loading}
function render4(){if(!loaded)return;const c=ctx();$('#d4date').textContent='Walk of '+fmt(c.wk)+(c.isCur?', today '+fmt(c.date):'')+'. Real BIM model (BSBG Revit, Nov 2026).';
  lay();legend();ensure().then(()=>{if(!M.ready)return;compute();tl();kpis();trades();behind();explorer();hideTip();size();if(!M.intro)draw()})}
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.m4){M.mode=t.dataset.m4;$$('#seg4 button').forEach(b=>b.setAttribute('aria-pressed',b===t));hideTip();legend();draw();return}
  if(t.dataset.l4){const k=t.dataset.l4;M.show[k]=!M.show[k];t.setAttribute('aria-pressed',M.show[k]);hideTip();draw();return}
  if(false){if(!M.ready)return;M.under=!M.under;t.setAttribute('aria-pressed',M.under);ground4();controls.maxPolarAngle=M.under?Math.PI*.85:Math.PI*.495;if(M.under&&HOME&&!M.intro){fly({p:camera.position.clone(),t:controls.target.clone()},{p:CTR.clone().add(new T.Vector3(-160,-25,190)),t:CTR.clone().add(new T.Vector3(0,-6,0))},1400)}else draw();return}
  if(t.id==='play4'){play();return}
  if(t.id==='now4'){stop();M.day=null;prog();tl();kpis();trades();behind();draw();return}
  if(t.id==='home4'){if(!M.ready)return;M.focus={b:'ALL',z:null,lv:null};ground4();explorer();draw();goFocus(1200);return}
  if(t.dataset.b4!==undefined){if(!M.ready)return;setFocus({b:t.dataset.b4,z:null,lv:null});return}
  if(t.dataset.z4!==undefined){if(!M.ready)return;setFocus({z:t.dataset.z4||null,lv:null});return}
  if(t.dataset.lv4!==undefined){if(!M.ready)return;const lv=t.dataset.lv4||null;setFocus({lv:M.focus.lv===lv?null:lv});return}
  if(t.dataset.lvstep){const l=levelsFor(M.focus.b),i=l.indexOf(M.focus.lv),j=i-(+t.dataset.lvstep);if(i>=0&&j>=0&&j<l.length)setFocus({lv:l[j]});return}
  if(t.dataset.x4!==undefined){hideTip();return}
  if(t.dataset.w4){const w=t.dataset.w4;hideTip();stop();if(BYREF[w]){ui.due=false;openItem(w);return}const [b,l]=w.split('|');ui.b=b;ui.l=l;ui.q='';ui.due=false;remember();show('walk');if(innerWidth<900)scrollTo({top:0});return}});
document.addEventListener('input',e=>{if(e.target.id==='rng4'){stop();setDay(+e.target.value)}});
document.addEventListener('change',e=>{if(e.target.id==='rng4'){trades();behind()}});
function focusKey(key,mode){const go=()=>{const a=AK[key];if(!a)return;M.mode=mode||M.mode;$$('#seg4 button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m4===M.mode));legend();
    const b=a.bld==='SITE'?'ALL':a.bld,lv=a.lv&&levelsFor(b).includes(a.lv)?a.lv:null;setFocus({b,z:b==='POD'?a.zone:null,lv})};
  if(M.ready)go();else ensure().then(()=>setTimeout(go,2700))}
return{render:render4,draw,keysOf:it=>keysOf(it),facKeys,focusKey,setP:p=>{P=p}}})();
