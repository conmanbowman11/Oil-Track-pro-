'use client';

import React, { useState, useCallback, useRef, useEffect } from "react";

function uid(){return Math.random().toString(36).slice(2,10)}
const TIERS=["250hr","500hr","1000hr","DEF","Hydraulic"];
const SUPPLIERS=["CAT","Donaldson","John Deere","Case IH","AGCO","NAPA","Other"];

const SEED={
  customers:[{id:"c1",name:"IronTree Solutions, LLC",contact:"",phone:"",email:"",address:"",notes:"Fleet units I-1 through I-27. Mix of tub trucks (Cat 4.4) and harvesters (Cat 7.1). Some JD units."}],
  units:[
    {id:"u1",cid:"c1",num:"I-1",nick:"Tub Truck",eid:"e1",type:"Tub Truck",make:"CAT",model:"",year:"",hours:0,notes:""},
    {id:"u2",cid:"c1",num:"I-2",nick:"Tub Truck",eid:"e1",type:"Tub Truck",make:"CAT",model:"",year:"",hours:0,notes:""},
    {id:"u3",cid:"c1",num:"I-3",nick:"Tub Truck",eid:"e1",type:"Tub Truck",make:"CAT",model:"",year:"",hours:0,notes:""},
    {id:"u4",cid:"c1",num:"ITH",nick:"IronTree Harvester",eid:"e2",type:"Harvester",make:"CAT",model:"",year:"",hours:0,notes:""},
    {id:"u5",cid:"c1",num:"CTM",nick:"CTM Harvester",eid:"e2",type:"Harvester",make:"CAT",model:"",year:"",hours:0,notes:""},
    {id:"u6",cid:"c1",num:"JD-1",nick:"JD 7810",eid:"e3",type:"Tractor",make:"John Deere",model:"7810",year:"",hours:0,notes:""},
  ],
  engines:[
    {id:"e1",name:"Cat 4.4",mfr:"Caterpillar",disp:"4.4L",oilType:"15W-40",oilCap:"3 gal"},
    {id:"e2",name:"Cat 7.1",mfr:"Caterpillar",disp:"7.1L",oilType:"15W-40",oilCap:"4 gal"},
    {id:"e3",name:"JD PowerTech 6068",mfr:"John Deere",disp:"6.8L",oilType:"15W-40",oilCap:"5 gal"},
  ],
  specs:[
    {id:"s1",eid:"e1",tier:"500hr",parts:[
      {pn:"7W-2326",desc:"Oil Filter",sup:"CAT",qty:1,cost:22.14},
      {pn:"479-4133",desc:"Water / Fuel Separator",sup:"CAT",qty:1,cost:53.76},
      {pn:"360-8960",desc:"Fuel Filter",sup:"CAT",qty:1,cost:37.21},
      {pn:"206-5234",desc:"Air Filter",sup:"CAT",qty:1,cost:69.64},
      {pn:"339-1048",desc:"Crankcase Filter",sup:"CAT",qty:1,cost:73.86},
    ]},
    {id:"s2",eid:"e2",tier:"500hr",parts:[
      {pn:"462-1171",desc:"Oil Filter",sup:"CAT",qty:1,cost:26.17},
      {pn:"479-4131",desc:"Water / Fuel Separator",sup:"CAT",qty:1,cost:56.57},
      {pn:"360-8960",desc:"Fuel Filter",sup:"CAT",qty:1,cost:37.21},
      {pn:"525-6205",desc:"In-line Fuel Filter",sup:"CAT",qty:1,cost:58.29},
      {pn:"289-2348",desc:"Air Filter",sup:"CAT",qty:1,cost:137.74},
      {pn:"339-1048",desc:"Crankcase Filter",sup:"CAT",qty:1,cost:73.86},
    ]},
    {id:"s3",eid:"e3",tier:"500hr",parts:[]},
  ],
  workOrders:[
    {id:"wo1",cid:"c1",uid:"u1",status:"complete",tier:"500hr",date:"2025-10-20",hours:0,tech:"Conner",custFilters:false,invoice:"1003",
      items:[{text:"Oil change — 3 gal 15W-40",done:true},{text:"Oil filter replaced (7W-2326)",done:true},{text:"Fuel filter replaced (360-8960)",done:true},{text:"Water/fuel separator replaced (479-4133)",done:true},{text:"Air filter replaced (206-5234)",done:true},{text:"Crankcase filter replaced (339-1048)",done:true},{text:"Greased all lube points",done:true},{text:"Oil sample collected",done:true}],
      costs:{labor:350,trip:40,supplies:18.50,enviro:40,parts:256.61,oilSample:58.55,other:0},notes:"",total:829.69},
    {id:"wo2",cid:"c1",uid:"u4",status:"complete",tier:"500hr",date:"2025-10-20",hours:0,tech:"Conner",custFilters:false,invoice:"1004",
      items:[{text:"Oil change — 4 gal 15W-40",done:true},{text:"Oil filter replaced (462-1171)",done:true},{text:"Fuel filter replaced (360-8960)",done:true},{text:"In-line fuel filter replaced (525-6205)",done:true},{text:"Water/fuel separator replaced (479-4131)",done:true},{text:"Air filter replaced (289-2348)",done:true},{text:"Crankcase filter replaced (339-1048)",done:true},{text:"Greased all lube points",done:true},{text:"Oil sample collected",done:true}],
      costs:{labor:390,trip:40,supplies:0,enviro:40,parts:389.84,oilSample:58.55,other:0},notes:"",total:1006.43},
    {id:"wo3",cid:"c1",uid:"u5",status:"complete",tier:"500hr",date:"2025-10-20",hours:0,tech:"Conner",custFilters:true,invoice:"1005",
      items:[{text:"Oil change — 4 gal 15W-40",done:true},{text:"Customer provided all filters",done:true},{text:"Oil sample collected",done:true}],
      costs:{labor:325,trip:40,supplies:18.50,enviro:40,parts:0,oilSample:58.55,other:0},notes:"Customer provided filters",total:658.13},
    {id:"wo4",cid:"c1",uid:"u6",status:"complete",tier:"500hr",date:"2025-10-20",hours:0,tech:"Conner",custFilters:true,invoice:"1006",
      items:[{text:"Oil change — 5 gal 15W-40",done:true},{text:"Customer provided all filters",done:true},{text:"Oil sample collected",done:true}],
      costs:{labor:300,trip:40,supplies:18.50,enviro:40,parts:0,oilSample:58.55,other:0},notes:"Customer provided filters",total:567.10},
  ],
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root{--bg:#f3f0e8;--bg2:#e9e5db;--cd:#fff;--cd2:#fafaf7;--bd:#d4d0c6;--bd2:#e6e2d8;--tx:#2b2924;--tx2:#6d6a62;--tx3:#a09c94;--ac:#c45d2c;--ac2:#a84b22;--ac3:#f6ece5;--gn:#2d7a3a;--gn2:#e5f2e8;--bl:#2a679c;--bl2:#e4eff8;--am:#ad7d0c;--am2:#f8f1dc;--rd:#b83028;--rd2:#fae6e4;--r:6px;--rl:10px}
*{margin:0;padding:0;box-sizing:border-box}
body,#root{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--tx)}
.app{display:flex;height:100vh;overflow:hidden}
.sb{width:210px;min-width:210px;background:var(--cd);border-right:1px solid var(--bd);display:flex;flex-direction:column}
.sb-hd{padding:20px 16px 16px;border-bottom:1px solid var(--bd2)}
.sb-hd h1{font-size:16px;font-weight:800;color:var(--ac);letter-spacing:-.04em}
.sb-hd p{font-size:10.5px;color:var(--tx3);margin-top:2px}
.sb-nav{padding:8px;flex:1;overflow-y:auto}
.si{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:var(--r);cursor:pointer;color:var(--tx2);font-size:13px;font-weight:500;transition:all .1s;border:1px solid transparent;margin-bottom:1px}
.si:hover{background:var(--bg);color:var(--tx)}
.si.on{background:var(--ac3);color:var(--ac);border-color:rgba(196,93,44,.12);font-weight:600}
.si .ct{margin-left:auto;font-size:10px;font-family:'IBM Plex Mono',monospace;background:var(--bg2);padding:1px 6px;border-radius:8px;color:var(--tx3)}
.mn{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{padding:12px 22px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;gap:10px;background:var(--cd)}
.topbar h2{font-size:17px;font-weight:700;letter-spacing:-.03em;flex:1}
.area{flex:1;overflow-y:auto;padding:18px 22px}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:var(--r);font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--bd);background:var(--cd);color:var(--tx);transition:all .1s;font-family:'Outfit',sans-serif}
.btn:hover{border-color:var(--tx3);background:var(--cd2)}
.bp{background:var(--ac);color:#fff;border-color:var(--ac)}.bp:hover{background:var(--ac2)}
.bs{padding:5px 9px;font-size:11px}
.bg{border:none;background:none;color:var(--tx2);padding:5px 8px}.bg:hover{color:var(--tx);background:var(--bg)}
.card{background:var(--cd);border:1px solid var(--bd2);border-radius:var(--rl);padding:16px 18px;margin-bottom:12px}
.ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ch h3{font-size:14px;font-weight:700;letter-spacing:-.02em}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;padding:7px 10px;font-size:10.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;border-bottom:1px solid var(--bd2)}
tbody td{padding:9px 10px;font-size:12.5px;border-bottom:1px solid var(--bd2)}
tbody tr{cursor:pointer;transition:background .06s}tbody tr:hover{background:var(--bg)}tbody tr:last-child td{border-bottom:none}
.m{font-family:'IBM Plex Mono',monospace;font-size:11.5px}
.tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10.5px;font-weight:600;font-family:'IBM Plex Mono',monospace}
.tg{background:var(--gn2);color:var(--gn)}.tb{background:var(--bl2);color:var(--bl)}.ta{background:var(--am2);color:var(--am)}.tr{background:var(--rd2);color:var(--rd)}.tc{background:var(--ac3);color:var(--ac)}
.crumbs{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx3);margin-bottom:14px;flex-wrap:wrap}
.crumbs span{cursor:pointer;transition:color .08s}.crumbs span:hover{color:var(--ac)}.crumbs .sep{color:var(--bd);cursor:default}.crumbs .cur{color:var(--tx);font-weight:600;cursor:default}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.st{background:var(--cd);border:1px solid var(--bd2);border-radius:var(--rl);padding:14px}
.st-l{font-size:10.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:500}
.st-v{font-size:22px;font-weight:700;font-family:'IBM Plex Mono',monospace;letter-spacing:-.04em;margin-top:3px}
.mbg{position:fixed;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px}
.mdl{background:var(--cd);border:1px solid var(--bd);border-radius:12px;width:100%;max-width:540px;max-height:85vh;overflow-y:auto}
.mh{padding:14px 18px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;justify-content:space-between}
.mh h3{font-size:15px;font-weight:700}
.mb2{padding:18px}.mf{padding:10px 18px;border-top:1px solid var(--bd2);display:flex;justify-content:flex-end;gap:6px}
.fld{margin-bottom:12px}.fld label{display:block;font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
.fld input,.fld select,.fld textarea{width:100%;padding:7px 11px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font-size:13px;font-family:'Outfit',sans-serif;outline:none;transition:border-color .1s}
.fld input:focus,.fld select:focus,.fld textarea:focus{border-color:var(--ac)}
.fld textarea{resize:vertical;min-height:44px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tg2{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0}
.tb2{padding:12px 6px;border-radius:var(--rl);border:1.5px solid var(--bd);background:var(--cd);cursor:pointer;text-align:center;transition:all .1s}
.tb2:hover{border-color:var(--ac);background:var(--ac3)}
.tb2 h4{font-size:13px;font-weight:700}.tb2 p{font-size:10px;color:var(--tx3);margin-top:1px}
.tb2.off{opacity:.45;border-style:dashed}
.wo{border:2px solid var(--bd);border-radius:12px;background:var(--cd);overflow:hidden}
.wh{padding:16px 20px;border-bottom:1px solid var(--bd2);display:flex;justify-content:space-between;align-items:flex-start}
.ws{padding:14px 20px;border-bottom:1px solid var(--bd2)}.ws:last-child{border-bottom:none}
.ws h4{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.wi{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.wi div label{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;display:block}
.wi div p{font-size:13px;margin-top:1px}
.wk{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bd2);font-size:13px}.wk:last-child{border-bottom:none}
.ck{width:20px;height:20px;border-radius:4px;border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .1s;flex-shrink:0}
.ck.on{background:var(--gn);border-color:var(--gn);color:#fff}
.cr{display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px}
.cr.tot{font-weight:700;font-size:14px;border-top:2px solid var(--tx);padding-top:8px;margin-top:6px}
.aip{display:flex;flex-direction:column;height:100%}
.aim{flex:1;overflow-y:auto;padding:14px}
.am{margin-bottom:10px;max-width:85%}.am.u{margin-left:auto}
.am .bb{padding:9px 13px;border-radius:var(--rl);font-size:13px;line-height:1.5}
.am.u .bb{background:var(--ac);color:#fff;border-bottom-right-radius:2px}
.am.a .bb{background:var(--cd);border:1px solid var(--bd2);border-bottom-left-radius:2px}
.am .sn{font-size:9.5px;color:var(--tx3);margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.ab{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--bd2);background:var(--cd)}
.ab input{flex:1;padding:8px 12px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:'Outfit',sans-serif;background:var(--bg);outline:none}
.ab input:focus{border-color:var(--ac)}
.empty{text-align:center;padding:36px 16px;color:var(--tx3)}.empty p{font-size:13px;margin-top:5px}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
@media print{.sb,.topbar,.ab,.btn{display:none!important}.app{display:block}.area{padding:10px}.wo{border-width:1px}}
`;

function CustForm({init,engines,onSave,onClose}){
  const[f,sF]=useState(init||{name:"",contact:"",phone:"",email:"",address:"",notes:""});
  return <div className="mbg" onClick={onClose}><div className="mdl" onClick={e=>e.stopPropagation()}>
    <div className="mh"><h3>{init?.id?"Edit Customer":"Add Customer"}</h3><button className="btn bs bg" onClick={onClose}>✕</button></div>
    <div className="mb2">
      <div className="fld"><label>Business Name</label><input value={f.name} onChange={e=>sF(p=>({...p,name:e.target.value}))}/></div>
      <div className="fr"><div className="fld"><label>Contact</label><input value={f.contact} onChange={e=>sF(p=>({...p,contact:e.target.value}))}/></div><div className="fld"><label>Phone</label><input value={f.phone} onChange={e=>sF(p=>({...p,phone:e.target.value}))}/></div></div>
      <div className="fld"><label>Email</label><input value={f.email} onChange={e=>sF(p=>({...p,email:e.target.value}))}/></div>
      <div className="fld"><label>Address</label><input value={f.address} onChange={e=>sF(p=>({...p,address:e.target.value}))}/></div>
      <div className="fld"><label>Notes</label><textarea value={f.notes} onChange={e=>sF(p=>({...p,notes:e.target.value}))}/></div>
    </div>
    <div className="mf"><button className="btn" onClick={onClose}>Cancel</button><button className="btn bp" onClick={()=>onSave(f)}>Save</button></div>
  </div></div>;
}

function UnitForm({init,cid,engines,onSave,onClose}){
  const[f,sF]=useState(init||{cid:cid||"",num:"",nick:"",eid:engines[0]?.id||"",type:"",make:"",model:"",year:"",hours:0,notes:""});
  return <div className="mbg" onClick={onClose}><div className="mdl" onClick={e=>e.stopPropagation()}>
    <div className="mh"><h3>{init?.id?"Edit Unit":"Add Fleet Unit"}</h3><button className="btn bs bg" onClick={onClose}>✕</button></div>
    <div className="mb2">
      <div className="fr"><div className="fld"><label>Unit Number</label><input value={f.num} onChange={e=>sF(p=>({...p,num:e.target.value}))} placeholder="e.g. I-14"/></div><div className="fld"><label>Nickname</label><input value={f.nick} onChange={e=>sF(p=>({...p,nick:e.target.value}))} placeholder="e.g. Tub Truck"/></div></div>
      <div className="fld"><label>Engine</label><select value={f.eid} onChange={e=>sF(p=>({...p,eid:e.target.value}))}>{engines.map(en=><option key={en.id} value={en.id}>{en.name}</option>)}</select></div>
      <div className="fr"><div className="fld"><label>Type</label><input value={f.type} onChange={e=>sF(p=>({...p,type:e.target.value}))} placeholder="Tractor, Harvester..."/></div><div className="fld"><label>Make</label><input value={f.make} onChange={e=>sF(p=>({...p,make:e.target.value}))}/></div></div>
      <div className="fr"><div className="fld"><label>Model</label><input value={f.model} onChange={e=>sF(p=>({...p,model:e.target.value}))}/></div><div className="fld"><label>Year</label><input value={f.year} onChange={e=>sF(p=>({...p,year:e.target.value}))}/></div></div>
      <div className="fld"><label>Engine Hours</label><input type="number" value={f.hours} onChange={e=>sF(p=>({...p,hours:e.target.value}))}/></div>
      <div className="fld"><label>Notes</label><textarea value={f.notes} onChange={e=>sF(p=>({...p,notes:e.target.value}))}/></div>
    </div>
    <div className="mf"><button className="btn" onClick={onClose}>Cancel</button><button className="btn bp" onClick={()=>onSave(f)}>Save</button></div>
  </div></div>;
}

export default function App(){
  const[D,setD]=useState(SEED);
  const[pg,setPg]=useState("dashboard");
  const[trail,setTrail]=useState([]);
  const[modal,setModal]=useState(null);
  const[aiMsgs,setAiMsgs]=useState([{r:"a",t:"Hey! I'm your OilTrack assistant. Ask me about specs, parts, service history — or paste invoice data and I'll help you build work orders."}]);
  const[aiIn,setAiIn]=useState("");
  const[aiLoad,setAiLoad]=useState(false);
  const[newItem,setNewItem]=useState("");
  const aiRef=useRef(null);

  const{customers,units,engines,specs,workOrders}=D;
  const up=useCallback((k,v)=>setD(p=>({...p,[k]:typeof v==="function"?v(p[k]):v})),[]);
  const nav=useCallback((p,id,lbl)=>{setTrail(pr=>[...pr,{p,id,lbl}]);setPg(p)},[]);
  const back=useCallback(()=>setTrail(pr=>{const n=pr.slice(0,-1);setPg(n.length?n[n.length-1].p:"dashboard");return n}),[]);
  const goTo=useCallback(i=>setTrail(pr=>{const n=pr.slice(0,i+1);setPg(n[n.length-1].p);return n}),[]);

  const eng4u=u=>engines.find(e=>e.id===u?.eid);
  const spec4=(eid,tier)=>specs.find(s=>s.eid===eid&&s.tier===tier);
  const cust=id=>customers.find(c=>c.id===id);
  const unit2=id=>units.find(u=>u.id===id);

  function buildWO(unitId,tier){
    const u=unit2(unitId);const e=eng4u(u);const sp=spec4(u.eid,tier);
    const items=[{text:`Oil change — ${e?.oilCap||"?"} ${e?.oilType||"15W-40"}`,done:false}];
    if(sp?.parts.length)sp.parts.forEach(p=>items.push({text:`${p.desc} replaced (${p.pn})`,done:false}));
    items.push({text:"Greased all lube points",done:false},{text:"Oil sample collected",done:false},{text:"Checked for leaks",done:false},{text:"Recorded engine hours",done:false});
    const pt=sp?sp.parts.reduce((s,p)=>s+p.cost*p.qty,0):0;
    const wo={id:uid(),cid:u.cid,uid:unitId,status:"open",tier,date:new Date().toISOString().split("T")[0],hours:u.hours||"",tech:"",custFilters:false,invoice:"",items,costs:{labor:0,trip:40,supplies:18.50,enviro:40,parts:Math.round(pt*100)/100,oilSample:58.55,other:0},notes:"",total:0};
    wo.total=Object.values(wo.costs).reduce((s,v)=>s+Number(v),0);
    up("workOrders",pr=>[...pr,wo]);return wo.id;
  }

  const sendAi=useCallback(async()=>{
    if(!aiIn.trim())return;const msg=aiIn.trim();setAiIn("");
    setAiMsgs(p=>[...p,{r:"u",t:msg}]);setAiLoad(true);
    const ctx=JSON.stringify({customers:customers.map(c=>({name:c.name})),units:units.map(u=>({num:u.num,nick:u.nick,engine:eng4u(u)?.name})),engines:engines.map(e=>({name:e.name,oil:e.oilType,cap:e.oilCap})),specs:specs.map(s=>({engine:engines.find(x=>x.id===s.eid)?.name,tier:s.tier,parts:s.parts})),wos:workOrders.slice(-8).map(w=>({unit:unit2(w.uid)?.num,date:w.date,tier:w.tier,total:w.total,status:w.status}))});
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:ctx,messages:[{role:"user",content:msg}]})});
      const d=await r.json();setAiMsgs(p=>[...p,{r:"a",t:d.content?.map(c=>c.text||"").join("\n")||"Error"}]);
    }catch(err){setAiMsgs(p=>[...p,{r:"a",t:"Connection error."}])}
    setAiLoad(false);
  },[aiIn,customers,units,engines,specs,workOrders]);

  useEffect(()=>{aiRef.current?.scrollIntoView({behavior:"smooth"})},[aiMsgs]);

  const curId=trail.length?trail[trail.length-1].id:null;
  const IC=(d,s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
  const iHome="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10";
  const iUsers="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M9 7a4 4 0 100 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75";
  const iClip="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M8 2h8v4H8z";
  const iHist="M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v6l4 2";
  const iChat="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z";
  const iPlus="M12 5v14 M5 12h14";
  const iBack="M19 12H5 M12 19l-7-7 7-7";
  const iChk="M20 6L9 17l-5-5";
  const iSend="M22 2L11 13 M22 2l-7 20-4-9-9-4z";
  const iPrint="M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z";
  const iEdit="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z";

  // ═══ RENDER FUNCTIONS (no hooks) ═══
  const renderDashboard=()=>{
    const open=workOrders.filter(w=>w.status==="open");
    const rev=workOrders.filter(w=>w.status==="complete").reduce((s,w)=>s+(w.total||0),0);
    return <><div className="stats">
      <div className="st"><div className="st-l">Customers</div><div className="st-v" style={{color:"var(--ac)"}}>{customers.length}</div></div>
      <div className="st"><div className="st-l">Fleet Units</div><div className="st-v" style={{color:"var(--bl)"}}>{units.length}</div></div>
      <div className="st"><div className="st-l">Open WOs</div><div className="st-v" style={{color:open.length?"var(--am)":"var(--gn)"}}>{open.length}</div></div>
      <div className="st"><div className="st-l">Revenue</div><div className="st-v">${Math.round(rev).toLocaleString()}</div></div>
    </div>
    {open.length>0&&<div className="card"><div className="ch"><h3>Open Work Orders</h3></div><table><thead><tr><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th></tr></thead><tbody>{open.map(w=>{const u2x=unit2(w.uid);return <tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td style={{fontWeight:700,color:"var(--ac)"}}>{u2x?.num}</td><td>{cust(w.cid)?.name}</td><td><span className="tag tc">{w.tier}</span></td><td className="m">{w.date}</td></tr>})}</tbody></table></div>}
    <div className="card"><div className="ch"><h3>Recent Completed</h3></div>
      <table><thead><tr><th>Date</th><th>Unit</th><th>Customer</th><th>Service</th><th>Total</th></tr></thead><tbody>{[...workOrders].filter(w=>w.status==="complete").reverse().slice(0,8).map(w=><tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td className="m">{w.date}</td><td style={{fontWeight:600}}>{unit2(w.uid)?.num}</td><td style={{color:"var(--tx2)"}}>{cust(w.cid)?.name}</td><td><span className="tag tc">{w.tier}</span></td><td className="m">${w.total?.toFixed(2)}</td></tr>)}</tbody></table>
    </div></>;
  };

  const renderCustomers=()=><div className="card"><div className="ch"><h3>Customers</h3><button className="btn bs bp" onClick={()=>setModal({t:"addCust"})}>{IC(iPlus,15)} Add</button></div>
    <table><thead><tr><th>Name</th><th>Contact</th><th>Units</th><th>WOs</th></tr></thead><tbody>{customers.map(c=><tr key={c.id} onClick={()=>nav("cust",c.id,c.name)}><td style={{fontWeight:600}}>{c.name}</td><td style={{color:"var(--tx2)"}}>{c.contact||"—"}</td><td className="m">{units.filter(u=>u.cid===c.id).length}</td><td className="m">{workOrders.filter(w=>w.cid===c.id).length}</td></tr>)}</tbody></table>
  </div>;

  const renderCustDetail=()=>{
    const c=cust(curId);if(!c)return <div className="empty"><p>Not found</p></div>;
    const cu=units.filter(u=>u.cid===curId);
    return <><div className="card">
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div><div style={{fontSize:19,fontWeight:800,letterSpacing:"-.03em"}}>{c.name}</div><div style={{fontSize:12,color:"var(--tx2)",marginTop:2}}>{c.address||"No address"}</div></div><button className="btn bs" onClick={()=>setModal({t:"editCust",d:{...c}})}>{IC(iEdit,14)} Edit</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>{[["Contact",c.contact],["Phone",c.phone],["Email",c.email]].map(([l,v])=><div key={l}><label style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".05em",fontWeight:600,display:"block"}}>{l}</label><p style={{fontSize:13}}>{v||"—"}</p></div>)}</div>
      {c.notes&&<div style={{marginTop:10,fontSize:12,color:"var(--tx2)",padding:"7px 10px",background:"var(--bg)",borderRadius:"var(--r)"}}>{c.notes}</div>}
    </div>
    <div className="card"><div className="ch"><h3>Equipment ({cu.length})</h3><button className="btn bs bp" onClick={()=>setModal({t:"addUnit",cid:curId})}>{IC(iPlus,15)} Add</button></div>
      {cu.length===0?<div className="empty"><p>No equipment yet</p></div>:<table><thead><tr><th>Unit #</th><th>Description</th><th>Engine</th><th>Hours</th><th>WOs</th></tr></thead><tbody>{cu.map(u=><tr key={u.id} onClick={()=>nav("unit",u.id,u.num)}><td style={{fontWeight:700,color:"var(--ac)"}}>{u.num}</td><td>{u.nick||u.type}{u.make?` — ${u.make} ${u.model||""}`:""}</td><td><span className="tag tb">{eng4u(u)?.name||"—"}</span></td><td className="m">{u.hours>0?u.hours.toLocaleString():"—"}</td><td className="m">{workOrders.filter(w=>w.uid===u.id).length}</td></tr>)}</tbody></table>}
    </div></>;
  };

  const renderUnitDetail=()=>{
    const u=unit2(curId);if(!u)return <div className="empty"><p>Not found</p></div>;
    const e=eng4u(u);const c=cust(u.cid);const uWOs=[...workOrders].filter(w=>w.uid===curId).sort((a,b)=>b.date.localeCompare(a.date));
    return <><div className="card">
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div><div style={{fontSize:19,fontWeight:800,letterSpacing:"-.03em"}}>{u.num} — {u.nick||u.type}</div><div style={{fontSize:12,color:"var(--tx2)",marginTop:2}}>{c?.name} · {e?.name||"No engine"}</div></div><button className="btn bs" onClick={()=>setModal({t:"editUnit",d:{...u}})}>{IC(iEdit,14)} Edit</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{[["Make/Model",`${u.make||"—"} ${u.model||""}`],["Engine",e?.name||"—"],["Hours",u.hours>0?u.hours.toLocaleString():"—"],["Oil",`${e?.oilCap||"—"} ${e?.oilType||""}`],["Year",u.year||"—"],["Type",u.type||"—"]].map(([l,v])=><div key={l}><label style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".05em",fontWeight:600,display:"block"}}>{l}</label><p style={{fontSize:13,fontWeight:l==="Engine"?600:400,color:l==="Engine"?"var(--bl)":"inherit"}}>{v}</p></div>)}</div>
    </div>
    <div className="card"><div className="ch"><h3>Create Work Order</h3></div><p style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>Select a service tier.</p>
      <div className="tg2">{TIERS.map(t=>{const sp=spec4(u.eid,t);return <div key={t} className={`tb2${sp?"":" off"}`} onClick={()=>{if(!sp){setModal({t:"noSpec",tier:t,en:e?.name});return}const wid=buildWO(curId,t);nav("wo",wid,"WO-"+wid.slice(0,4))}}><h4>{t}</h4><p>{sp?`${sp.parts.length} parts`:"No spec"}</p></div>})}</div>
    </div>
    <div className="card"><div className="ch"><h3>History ({uWOs.length})</h3></div>
      {uWOs.length===0?<div className="empty"><p>No work orders</p></div>:<table><thead><tr><th>Date</th><th>Service</th><th>Status</th><th>Total</th><th>Tech</th></tr></thead><tbody>{uWOs.map(w=><tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td className="m">{w.date}</td><td><span className="tag tc">{w.tier}</span></td><td><span className={`tag ${w.status==="complete"?"tg":"ta"}`}>{w.status}</span></td><td className="m">${w.total?.toFixed(2)}</td><td>{w.tech||"—"}</td></tr>)}</tbody></table>}
    </div></>;
  };

  const renderWO=()=>{
    const wo=workOrders.find(w=>w.id===curId);if(!wo)return <div className="empty"><p>Not found</p></div>;
    const u=unit2(wo.uid);const c=cust(wo.cid);const e=u?eng4u(u):null;const isO=wo.status==="open";
    const sp=u?spec4(u.eid,wo.tier):null;
    const tog=i=>up("workOrders",pr=>pr.map(w=>w.id===curId?{...w,items:w.items.map((it,j)=>j===i?{...it,done:!it.done}:it)}:w));
    const uw=(k,v)=>up("workOrders",pr=>pr.map(w=>w.id===curId?{...w,[k]:v}:w));
    const uc=(k,v)=>up("workOrders",pr=>pr.map(w=>w.id===curId?{...w,costs:{...w.costs,[k]:Number(v)||0},total:Object.entries({...w.costs,[k]:Number(v)||0}).reduce((s,[,x])=>s+x,0)}:w));
    const addI=()=>{if(!newItem.trim())return;up("workOrders",pr=>pr.map(w=>w.id===curId?{...w,items:[...w.items,{text:newItem.trim(),done:false}]}:w));setNewItem("")};
    const comp=()=>{up("workOrders",pr=>pr.map(w=>w.id===curId?{...w,status:"complete"}:w));if(wo.hours&&Number(wo.hours)>0)up("units",pr=>pr.map(x=>x.id===wo.uid?{...x,hours:Number(wo.hours)}:x))};
    const byS={};if(sp&&!wo.custFilters)sp.parts.forEach(p=>{if(!byS[p.sup])byS[p.sup]=[];byS[p.sup].push(p)});
    const allD=wo.items.length>0&&wo.items.every(i=>i.done);
    const inp={padding:"4px 8px",border:"1px solid var(--bd)",borderRadius:4,fontSize:12,background:"var(--bg)",fontFamily:"'Outfit',sans-serif"};

    return <div className="wo">
      <div className="wh"><div><div style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em"}}>Work Order</div><div style={{fontSize:12,color:"var(--tx2)",marginTop:2}}>{c?.name} · {u?.num} ({u?.nick}) · {e?.name}</div></div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",background:isO?"var(--am2)":"var(--gn2)",color:isO?"var(--am)":"var(--gn)"}}>{wo.status.toUpperCase()}</span><button className="btn bs" onClick={()=>window.print()}>{IC(iPrint,15)}</button></div>
      </div>
      <div className="ws"><h4>Details</h4><div className="wi">
        <div><label>Unit</label><p style={{fontWeight:700,color:"var(--ac)"}}>{u?.num}</p></div>
        <div><label>Equipment</label><p>{u?.nick}{u?.make?` — ${u.make} ${u.model||""}`:""}</p></div>
        <div><label>Engine</label><p style={{color:"var(--bl)",fontWeight:600}}>{e?.name}</p></div>
        <div><label>Service</label><p><span className="tag tc">{wo.tier}</span></p></div>
        <div><label>Date</label>{isO?<input type="date" value={wo.date} onChange={ev=>uw("date",ev.target.value)} style={inp}/>:<p className="m">{wo.date}</p>}</div>
        <div><label>Engine Hours</label>{isO?<input type="number" value={wo.hours} onChange={ev=>uw("hours",ev.target.value)} placeholder="Current" style={{...inp,fontFamily:"'IBM Plex Mono',monospace",width:120}}/>:<p className="m">{wo.hours||"—"}</p>}</div>
        <div><label>Technician</label>{isO?<input value={wo.tech} onChange={ev=>uw("tech",ev.target.value)} placeholder="Name" style={{...inp,width:140}}/>:<p>{wo.tech||"—"}</p>}</div>
        <div><label>Invoice #</label>{isO?<input value={wo.invoice} onChange={ev=>uw("invoice",ev.target.value)} placeholder="Optional" style={{...inp,fontFamily:"'IBM Plex Mono',monospace",width:100}}/>:<p className="m">{wo.invoice||"—"}</p>}</div>
        {isO&&<div><label>Cust. Filters</label><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginTop:2}}><input type="checkbox" checked={wo.custFilters} onChange={ev=>uw("custFilters",ev.target.checked)} style={{accentColor:"var(--ac)"}}/>Customer providing</label></div>}
      </div></div>

      {!wo.custFilters&&sp&&sp.parts.length>0&&<div className="ws"><h4>Parts / Filter Order</h4>
        <table><thead><tr><th>Part #</th><th>Description</th><th>Supplier</th><th>Qty</th><th>Cost</th></tr></thead><tbody>{sp.parts.map((p,i)=><tr key={i} style={{cursor:"default"}}><td className="m" style={{fontWeight:600}}>{p.pn}</td><td style={{fontSize:12}}>{p.desc}</td><td><span className="tag tb">{p.sup}</span></td><td className="m">{p.qty}</td><td className="m">${p.cost.toFixed(2)}</td></tr>)}</tbody></table>
        {Object.keys(byS).length>0&&<div style={{marginTop:10}}><p style={{fontSize:10,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6}}>By supplier</p>
          {Object.entries(byS).map(([s,ps])=><div key={s} style={{marginBottom:6,padding:"6px 10px",background:"var(--bg)",borderRadius:"var(--r)"}}><div style={{fontWeight:700,fontSize:11,color:"var(--tx2)",marginBottom:3}}>{s}</div>{ps.map((p,i)=><div key={i} style={{fontSize:11,display:"flex",justifyContent:"space-between"}}><span className="m">{p.pn} — {p.desc}</span><span className="m">x{p.qty}</span></div>)}</div>)}
        </div>}
        <div style={{marginTop:6,padding:"6px 10px",background:"var(--gn2)",borderRadius:"var(--r)",fontSize:12,color:"var(--gn)"}}><strong>Oil (on truck):</strong> {e?.oilCap} {e?.oilType}</div>
      </div>}

      <div className="ws"><h4>Work Performed</h4>
        {wo.items.map((it,i)=><div key={i} className="wk">{isO?<div className={`ck${it.done?" on":""}`} onClick={()=>tog(i)}>{it.done&&IC(iChk,14)}</div>:<div style={{width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",color:it.done?"var(--gn)":"var(--tx3)",fontSize:14}}>{it.done?"\u2713":"\u25CB"}</div>}<span style={{flex:1,textDecoration:it.done?"line-through":"none",color:it.done?"var(--tx3)":"inherit"}}>{it.text}</span></div>)}
        {isO&&<div style={{display:"flex",gap:6,marginTop:8}}><input value={newItem} onChange={ev=>setNewItem(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&addI()} placeholder="Add checklist item..." style={{flex:1,padding:"6px 10px",border:"1px solid var(--bd)",borderRadius:"var(--r)",fontSize:12,fontFamily:"'Outfit',sans-serif",background:"var(--bg)",outline:"none"}}/><button className="btn bs" onClick={addI}>{IC(iPlus,15)}</button></div>}
      </div>

      <div className="ws"><h4>Cost Breakdown</h4>
        {isO?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>{[["Labor","labor"],["Trip","trip"],["Supplies","supplies"],["Environmental","enviro"],["Parts","parts"],["Oil Sample","oilSample"],["Other","other"]].map(([l,k])=><div key={k} className="fld" style={{marginBottom:6}}><label>{l}</label><input type="number" value={wo.costs[k]||""} onChange={ev=>uc(k,ev.target.value)} style={{padding:"5px 8px",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}/></div>)}</div>
        :<>{Object.entries(wo.costs).filter(([,v])=>v>0).map(([k,v])=><div key={k} className="cr"><span style={{textTransform:"capitalize"}}>{k==="oilSample"?"Oil Sample":k==="enviro"?"Environmental":k}</span><span className="m">${Number(v).toFixed(2)}</span></div>)}</>}
        <div className="cr tot"><span>TOTAL</span><span className="m">${(isO?Object.values(wo.costs).reduce((s,v)=>s+Number(v),0):wo.total).toFixed(2)}</span></div>
      </div>

      <div className="ws"><h4>Notes</h4>
        {isO?<textarea value={wo.notes} onChange={ev=>uw("notes",ev.target.value)} placeholder="Observations, issues..." style={{width:"100%",padding:"8px 10px",border:"1px solid var(--bd)",borderRadius:"var(--r)",fontSize:13,fontFamily:"'Outfit',sans-serif",background:"var(--bg)",minHeight:50,resize:"vertical",outline:"none"}}/>:<p style={{fontSize:13,color:wo.notes?"var(--tx)":"var(--tx3)"}}>{wo.notes||"No notes"}</p>}
      </div>

      {isO&&<div className="ws" style={{background:allD?"var(--gn2)":"var(--bg)",textAlign:"center",padding:20}}>
        <button className="btn bp" style={{fontSize:14,padding:"10px 28px"}} onClick={comp}>{IC(iChk,14)} Complete Work Order</button>
        {!allD&&<p style={{fontSize:11,color:"var(--tx3)",marginTop:6}}>{wo.items.filter(x=>!x.done).length} unchecked</p>}
      </div>}
    </div>;
  };

  const renderWOs=()=>{
    const open=workOrders.filter(w=>w.status==="open");const done=[...workOrders].filter(w=>w.status==="complete").sort((a,b)=>b.date.localeCompare(a.date));
    return <><div className="card"><div className="ch"><h3>Open ({open.length})</h3></div>
      {open.length===0?<div className="empty"><p>No open work orders</p></div>:<table><thead><tr><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th></tr></thead><tbody>{open.map(w=><tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td style={{fontWeight:700,color:"var(--ac)"}}>{unit2(w.uid)?.num}</td><td>{cust(w.cid)?.name}</td><td><span className="tag tc">{w.tier}</span></td><td className="m">{w.date}</td></tr>)}</tbody></table>}
    </div>
    <div className="card"><div className="ch"><h3>Completed ({done.length})</h3></div>
      {done.length===0?<div className="empty"><p>None yet</p></div>:<table><thead><tr><th>Date</th><th>Unit</th><th>Customer</th><th>Service</th><th>Total</th></tr></thead><tbody>{done.slice(0,20).map(w=><tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td className="m">{w.date}</td><td style={{fontWeight:600}}>{unit2(w.uid)?.num}</td><td style={{color:"var(--tx2)"}}>{cust(w.cid)?.name}</td><td><span className="tag tc">{w.tier}</span></td><td className="m">${w.total?.toFixed(2)}</td></tr>)}</tbody></table>}
    </div></>;
  };

  const renderHistory=()=>{
    const all=[...workOrders].filter(w=>w.status==="complete").sort((a,b)=>b.date.localeCompare(a.date));
    return <div className="card"><div className="ch"><h3>Service History ({all.length})</h3></div>
      <table><thead><tr><th>Date</th><th>Unit</th><th>Customer</th><th>Service</th><th>Hours</th><th>Total</th><th>Tech</th></tr></thead><tbody>{all.map(w=><tr key={w.id} onClick={()=>nav("wo",w.id,"WO-"+w.id.slice(0,4))}><td className="m">{w.date}</td><td style={{fontWeight:600}}>{unit2(w.uid)?.num}</td><td style={{color:"var(--tx2)"}}>{cust(w.cid)?.name}</td><td><span className="tag tc">{w.tier}</span></td><td className="m">{w.hours||"—"}</td><td className="m">${w.total?.toFixed(2)}</td><td>{w.tech||"—"}</td></tr>)}</tbody></table>
    </div>;
  };

  const renderAi=()=><div className="aip" style={{height:"calc(100vh - 110px)"}}>
    <div className="aim">{aiMsgs.map((msg,i)=><div key={i} className={`am ${msg.r==="a"?"a":"u"}`}><div className="sn">{msg.r==="a"?"OilTrack AI":"You"}</div><div className="bb" style={{whiteSpace:"pre-wrap"}}>{msg.t}</div></div>)}
      {aiLoad&&<div className="am a"><div className="sn">OilTrack AI</div><div className="bb" style={{color:"var(--tx3)"}}>Thinking...</div></div>}
      <div ref={aiRef}/>
    </div>
    <div className="ab"><input placeholder="Ask about specs, parts, history..." value={aiIn} onChange={ev=>setAiIn(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&sendAi()}/><button className="btn bp" onClick={sendAi} disabled={aiLoad}>{IC(iSend,15)}</button></div>
  </div>;

  const renderModal=()=>{
    if(!modal)return null;
    if(modal.t==="noSpec")return <div className="mbg" onClick={()=>setModal(null)}><div className="mdl" onClick={ev=>ev.stopPropagation()}><div className="mh"><h3>No Spec</h3><button className="btn bs bg" onClick={()=>setModal(null)}>✕</button></div><div className="mb2"><p style={{fontSize:13,color:"var(--tx2)"}}>No {modal.tier} spec for <strong>{modal.en}</strong> yet. Use AI to build from invoices.</p></div><div className="mf"><button className="btn" onClick={()=>setModal(null)}>OK</button></div></div></div>;
    if(modal.t==="addCust"||modal.t==="editCust")return <CustForm key={modal.t+(modal.d?.id||"n")} init={modal.d} engines={engines} onClose={()=>setModal(null)} onSave={f=>{if(modal.t==="addCust")up("customers",p=>[...p,{...f,id:uid()}]);else up("customers",p=>p.map(c=>c.id===f.id?f:c));setModal(null)}}/>;
    if(modal.t==="addUnit"||modal.t==="editUnit")return <UnitForm key={modal.t+(modal.d?.id||"n")} init={modal.d} cid={modal.cid} engines={engines} onClose={()=>setModal(null)} onSave={f=>{if(modal.t==="addUnit")up("units",p=>[...p,{...f,id:uid(),hours:Number(f.hours)||0}]);else up("units",p=>p.map(u=>u.id===f.id?{...f,hours:Number(f.hours)||0}:u));setModal(null)}}/>;
    return null;
  };

  const menu=[{id:"dashboard",l:"Dashboard",ic:iHome},{id:"customers",l:"Customers",ic:iUsers,ct:customers.length},{id:"workorders",l:"Work Orders",ic:iClip,ct:workOrders.filter(w=>w.status==="open").length||undefined},{id:"history",l:"Service History",ic:iHist},{id:"ai",l:"AI Assistant",ic:iChat}];
  const active=["cust","unit"].includes(pg)?"customers":pg==="wo"?"workorders":pg;
  const title=pg==="cust"?trail[trail.length-1]?.lbl||"Customer":pg==="unit"?trail[trail.length-1]?.lbl||"Unit":pg==="wo"?"Work Order":menu.find(mx=>mx.id===pg)?.l||"Dashboard";
  const crumbs=trail.length>0&&<div className="crumbs"><span onClick={()=>{setTrail([]);setPg(active)}}>{active==="workorders"?"Work Orders":"Customers"}</span>{trail.map((n,i)=><span key={i} style={{display:"contents"}}><span className="sep">/</span>{i===trail.length-1?<span className="cur">{n.lbl}</span>:<span onClick={()=>goTo(i)}>{n.lbl}</span>}</span>)}</div>;
  const pages={dashboard:renderDashboard,customers:renderCustomers,cust:renderCustDetail,unit:renderUnitDetail,wo:renderWO,workorders:renderWOs,history:renderHistory,ai:renderAi};

  return <><style>{CSS}</style><div className="app">
    <div className="sb"><div className="sb-hd"><h1>OilTrack Pro</h1><p>Complete Fleet Solutions</p></div><nav className="sb-nav">{menu.map(mx=><div key={mx.id} className={`si${active===mx.id?" on":""}`} onClick={()=>{setPg(mx.id);setTrail([])}}>{IC(mx.ic)}{mx.l}{mx.ct!=null&&<span className="ct">{mx.ct}</span>}</div>)}</nav></div>
    <div className="mn"><div className="topbar">{trail.length>0&&<button className="btn bs bg" onClick={back}>{IC(iBack,16)}</button>}<h2>{title}</h2></div><div className="area">{crumbs}{(pages[pg]||renderDashboard)()}</div></div>
    {renderModal()}
  </div></>;
}
