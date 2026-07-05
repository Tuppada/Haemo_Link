import React, { useState, useEffect, useRef, useCallback } from "react";
import "./styles.css";
import { apiClient, getAuthToken, setAuthToken } from "./apiClient.js";
import {
  BLOOD_TYPES,
  ORGANS,
  COMPATIBILITY,
  HOSPITAL_GRAPH,
  DAY_MS,
  formatISODate,
  getToday,
  checkEligibility,
  expireUnits,
  matchRequest,
  normalizeMatches,
  DEFAULT_TARGET_UNITS,
  getTargetUnits,
  buildStockVsTarget,
} from "./utils.js";


async function callClaude(messages, system) {
  const apiMessages = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  try {
    const data = await apiClient.chat(null, system, apiMessages);
    return data.reply || data.text || "Unable to get response.";
  } catch (e) {
    return e.message?.includes("Failed to fetch")
      ? "AI assistant cannot reach the backend. Ensure Spring Boot is running on port 8080."
      : "AI assistant is temporarily unavailable. You can still use SOS and blood requests.";
  }
}

const BT_COLORS={"A+":"#E74C3C","A-":"#C0392B","B+":"#2563EB","B-":"#1D4ED8","AB+":"#7C3AED","AB-":"#6D28D9","O+":"#059669","O-":"#047857"};
const Badge=({cls,children})=><span className={`badge ${cls}`}>{children}</span>;
const urgBadge=u=>{const m={Critical:<Badge cls="b-red">🔴 {u}</Badge>,High:<Badge cls="b-amber">🟠 {u}</Badge>,Medium:<Badge cls="b-blue">🟡 {u}</Badge>,Low:<Badge cls="b-green">🟢 {u}</Badge>};return m[u]||<Badge cls="b-slate">{u}</Badge>;};
const stBadge=s=>{const m={Available:<Badge cls="b-green">{s}</Badge>,Reserved:<Badge cls="b-blue">{s}</Badge>,Expired:<Badge cls="b-slate">{s}</Badge>,Pending:<Badge cls="b-amber">{s}</Badge>,Fulfilled:<Badge cls="b-green">{s}</Badge>,Active:<Badge cls="b-green">{s}</Badge>};return m[s]||<Badge cls="b-slate">{s}</Badge>;};
const BT=({t})=><span style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:BT_COLORS[t]||"#C0392B",fontWeight:600}}>{t}</span>;
const MetricTile=({label,value,caption,color})=><div className="metric-tile"><div className="metric-kicker">{label}</div><div className="metric-value" style={{color:color||"var(--g900)"}}>{value}</div><div className="metric-caption">{caption}</div></div>;
const RouteResultCard=({route})=><div className="route-card"><div><div className="route-name">{route.hospital.name}</div><div className="route-meta">{route.hospital.location} · {route.distance} km</div></div><div className="route-badge">{route.total} unit{route.total>1?"s":""}</div></div>;
const DataCard=({title,meta,children})=><div className="data-card fade-up"><div className="data-title">{title}</div>{meta&&<div className="data-meta">{meta}</div>}{children}</div>;
const NODE_POS={h1:{x:160,y:80},h2:{x:310,y:50},h3:{x:400,y:155},h4:{x:185,y:195},h5:{x:315,y:195}};
const EDGES=Object.entries(HOSPITAL_GRAPH).flatMap(([a,nb])=>Object.entries(nb).filter(([b])=>a<b).map(([b,w])=>({a,b,w})));
function NetworkGraph({db,highlight,path=[]}){
  return(
    <svg width="100%" viewBox="0 0 520 260">
      <defs><linearGradient id="rS" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fb7185"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient></defs>
      {EDGES.map(({a,b,w})=>{
        const pa=NODE_POS[a],pb=NODE_POS[b];
        const isP=path.length>1&&path.some((n,i)=>path[i+1]&&((n===a&&path[i+1]===b)||(n===b&&path[i+1]===a)));
        return(<g key={a+b}><line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={isP?"url(#rS)":"rgba(148,163,184,.3)"} strokeWidth={isP?3:1.5} strokeDasharray={isP?"none":"4 3"}/><text x={(pa.x+pb.x)/2} y={(pa.y+pb.y)/2-5} textAnchor="middle" fontSize="10" fill={isP?"#7C3AED":"#94A3B8"} fontWeight={isP?700:400}>{w}km</text></g>);
      })}
      {db.hospitals.map(h=>{
        const p=NODE_POS[h.id];if(!p)return null;
        const isHL=h.id===highlight,isP=path.includes(h.id);
        return(<g key={h.id}>{(isHL||isP)&&<circle cx={p.x} cy={p.y} r={24} fill={isHL?"rgba(231,76,60,.15)":"rgba(124,58,237,.15)"}/>}<circle cx={p.x} cy={p.y} r={16} fill={isHL?"var(--red2)":isP?"var(--purple)":"white"} stroke={isHL?"var(--red)":isP?"var(--purple)":"rgba(148,163,184,.5)"} strokeWidth={isHL||isP?2:1.5}/><text x={p.x} y={p.y+4} textAnchor="middle" fontSize="9" fontWeight="700" fill={isHL||isP?"white":"var(--slate)"}>{h.id.toUpperCase()}</text><text x={p.x} y={p.y+28} textAnchor="middle" fontSize="9.5" fill="var(--g600)" fontWeight="500">{h.name.split(" ")[0]}</text></g>);
      })}
    </svg>
  );
}
function InvChart({db,hospId}){
  const inv=expireUnits(db.inventory);
  const counts=BLOOD_TYPES.map(bt=>({bt,n:inv.filter(u=>u.status==="Available"&&u.bloodType===bt&&(!hospId||u.hospitalId===hospId)).length}));
  const max=Math.max(...counts.map(c=>c.n),1);
  return(<div className="bar-chart">{counts.map(({bt,n})=>(<div key={bt} className="bar-col"><div className="bar-n" style={{color:BT_COLORS[bt]}}>{n}</div><div className="bar" style={{height:`${(n/max)*80}px`,background:BT_COLORS[bt]||"var(--red)",opacity:.85}}/><div className="bar-lbl" style={{color:BT_COLORS[bt]}}>{bt}</div></div>))}</div>);
}
function AIAssistant({db,user,donorBloodType}){
  const [msgs,setMsgs]=useState([{role:"assistant",content:"Hello! I'm HaemoLink AI. Ask me about blood compatibility, inventory, donor eligibility, or organ donation."}]);
  const [inp,setInp]=useState("");
  const [loading,setLoading]=useState(false);
  const scrollRef=useRef(null);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[msgs,loading]);
  const inv=expireUnits(db.inventory);
  const system=`You are HaemoLink AI, a blood bank assistant for India. User: ${user.name} (${user.role}). Inventory: ${BLOOD_TYPES.map(bt=>`${bt}:${inv.filter(u=>u.bloodType===bt&&u.status==="Available").length}`).join(", ")}. Critical requests: ${db.requests.filter(r=>r.urgency==="Critical"&&r.status==="Pending").length}. Organ donors: ${(db.organDonors||[]).length}. ${donorBloodType?`User blood type: ${donorBloodType}.`:""}. Give concise, accurate answers about blood banking, organ donation, compatibility.`;
  const send=async()=>{
    if(!inp.trim()||loading)return;
    const userMsg={role:"user",content:inp.trim()};
    const next=[...msgs,userMsg];
    setMsgs(next);setInp("");setLoading(true);
    const reply=await callClaude(next.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content})),system);
    setMsgs(p=>[...p,{role:"assistant",content:reply}]);
    setLoading(false);
  };
  const suggestions=user.role==="donor"?["What to eat before donating?","Can I donate on medication?","What organs can I donate?","56-day rule explained?"]:["O- compatibility chart?","Universal donor type?","Organ donation compatibility?","Low stock protocols?"];
  return(
    <div className="card">
      <div className="card-t">🤖 HaemoLink AI <span style={{fontSize:11,color:"var(--slate)",fontWeight:400,marginLeft:"auto"}}>Powered by Claude</span></div>
      <div className="chat-wrap">
        <div className="chat-msgs" ref={scrollRef}>
          {msgs.map((m,i)=><div key={i} className={`chat-msg ${m.role==="user"?"chat-user":"chat-ai"}`}>{m.content}</div>)}
          {loading&&<div className="chat-loading">{[0,1,2].map(i=><div key={i} className="chat-dot"/>)}</div>}
        </div>
        <div className="chat-row">
          <input className="chat-inp" value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about blood banking or organ donation…"/>
          <button className="btn btn-navy btn-sm" onClick={send} disabled={loading||!inp.trim()}>Send</button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
        {suggestions.map(q=><button key={q} onClick={()=>setInp(q)} style={{fontSize:11,padding:"4px 10px",border:"1px solid var(--g200)",borderRadius:20,background:"var(--g50)",cursor:"pointer",color:"var(--slate)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{q}</button>)}
      </div>
    </div>
  );
}
function SOSModal({db,user,onClose}){
  const [bloodType,setBloodType]=useState("");
  const [qty,setQty]=useState("1");
  const [result,setResult]=useState(null);
  const [searching,setSearching]=useState(false);
  const [sosHospId,setSosHospId]=useState(user.hospitalId||db.hospitals[0]?.id||"h1");
  const [error,setError]=useState(null);
  const inv=expireUnits(db.inventory);
  const hospId=user.hospitalId||sosHospId;
  const networkAvail=inv.filter(u=>u.status==="Available").length;
  const doSOS=async()=>{
    if(!bloodType)return;
    setSearching(true);
    setError(null);
    const quantity=Math.max(1,parseInt(qty,10)||1);
    try{
      const local=matchRequest(inv,bloodType,quantity,hospId);
      const nearby=normalizeMatches(await apiClient.matches({hospitalId:hospId,bloodType,quantity}));
      setResult({local,nearby,bloodType,qty:quantity,networkAvail});
    }catch(e){
      setError(e.message||"Network search failed.");
      setResult({local:matchRequest(inv,bloodType,quantity,hospId),nearby:[],bloodType,qty:quantity,networkAvail,failed:true});
    }
    setSearching(false);
  };
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{borderTop:"4px solid var(--red)"}}>
        <div className="modal-t" style={{color:"var(--red)"}}>🚨 SOS Emergency Blood Search <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="alert a-red"><span className="blink">🔴</span><div><strong>Emergency Mode Active</strong> — Scanning entire hospital network via Dijkstra routing</div></div>
        {!result?(
          <>
            {!user.hospitalId&&(
              <div className="fgrp"><label className="flbl">Requesting hospital (routing origin)</label>
                <select className="fsel" value={sosHospId} onChange={e=>setSosHospId(e.target.value)}>
                  {db.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
            {networkAvail===0&&<div className="alert a-amber" style={{marginBottom:12}}>⚠️ No non-expired blood units in the network. Restart the backend after updating seed data, or add inventory via Admin → Inventory.</div>}
            <div className="fgrp"><label className="flbl">Blood Type Needed</label>
              <select className="fsel" value={bloodType} onChange={e=>setBloodType(e.target.value)}>
                <option value="">Select blood type…</option>
                {BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}
              </select>
            </div>
            {bloodType&&<div className="alert a-blue">Compatible types: <strong>{COMPATIBILITY[bloodType]?.join(", ")}</strong></div>}
            <div className="fgrp"><label className="flbl">Units Needed</label><input className="finp" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></div>
            <button className="btn btn-red btn-full" onClick={doSOS} disabled={!bloodType||searching} style={{fontSize:15,padding:14}}>{searching?"🔍 Scanning Network…":"🚨 ACTIVATE SOS SEARCH"}</button>
          </>
        ):(
          <div>
            {result.local.canFulfill
              ?<div className="alert a-green">✅ <div><strong>Local stock available!</strong> {result.local.total} compatible unit(s) found at your hospital. No rerouting needed.</div></div>
              :<div className="alert a-amber">⚠️ <div>Local stock insufficient ({result.local.total}/{result.qty} units). Showing nearest hospitals…</div></div>
            }
            {!result.local.canFulfill&&(
              <div className="route-shell" style={{marginTop:12}}>
                <div className="eyebrow" style={{color:"white",background:"rgba(255,255,255,.15)"}}>Dijkstra Result</div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,color:"white",margin:"8px 0"}}>Nearest {result.bloodType}-compatible hospitals</div>
                {result.nearby.length===0
                  ?<div className="route-card"><div><div className="route-name">No network match found</div><div className="route-meta">{result.networkAvail===0?"All units may be expired — restart backend or add fresh inventory.":`No hospital has ${result.qty} compatible unit(s) available. Try a lower quantity or different type.`}{error?` (${error})`:""}</div></div></div>
                  :result.nearby.map(r=><RouteResultCard key={r.hospital.id} route={r}/>)
                }
              </div>
            )}
            <button className="btn btn-ghost btn-full" style={{marginTop:14}} onClick={()=>setResult(null)}>← Search Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
function DonorRegisterForm({onRegister,onSwitchLogin}){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({name:"",email:"",password:"",confirm:"",bloodType:"",phone:"",dob:"",address:"",lastDonation:"",emergencyContact:"",agree:false});
  const [err,setErr]=useState("");
  const [screening,setScreening]=useState(null);
  const [sLoading,setSLoading]=useState(false);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));
  const elig=form.lastDonation?checkEligibility(form.lastDonation):{eligible:true};
  const next=async()=>{
    setErr("");
    if(step===1){
      if(!form.name||!form.email||!form.password||!form.confirm){setErr("All fields required.");return;}
      if(form.password!==form.confirm){setErr("Passwords do not match.");return;}
      if(form.password.length<6){setErr("Password must be at least 6 characters.");return;}
      setStep(2);
    } else if(step===2){
      if(!form.bloodType||!form.phone||!form.dob){setErr("Blood type, phone and DOB required.");return;}
      setSLoading(true);
      try{
        const reply=await callClaude([{role:"user",content:`Assess blood donor eligibility: Name: ${form.name}, Blood type: ${form.bloodType}, DOB: ${form.dob}, Last donation: ${form.lastDonation||"Never"}. Give a brief 2-3 sentence assessment.`}],"You are a medical screening assistant for a blood bank in India. Be concise, accurate, and encouraging.");
        setScreening(reply);
      }catch{setScreening("AI screening unavailable. Registration will proceed with manual review.");}
      setSLoading(false);setStep(3);
    } else if(step===3){
      if(!form.agree){setErr("Please accept consent to proceed.");return;}
      onRegister(form);
    }
  };
  const steps=["Account","Medical Info","Review"];
  return(
    <div>
      <div className="step-bar">
        {steps.map((s,i)=>{const n=i+1,done=step>n,active=step===n;return(<div key={s} style={{display:"flex",alignItems:"center",gap:6}}><div className="step-circle" style={{background:done||active?"var(--red)":"var(--g200)",color:done||active?"white":"var(--slate)"}}>{done?"✓":n}</div>{i<steps.length-1&&<div className="step-line" style={{background:done?"var(--red)":"var(--g200)"}}/>}</div>);})}
        <span style={{fontSize:12,color:"var(--slate)",marginLeft:6}}>{steps[step-1]}</span>
      </div>
      {step===1&&(<><div className="fgrp"><label className="flbl">Full Name</label><input className="finp" value={form.name} onChange={set("name")} placeholder="Your full legal name"/></div><div className="fgrp"><label className="flbl">Email</label><input className="finp" type="email" value={form.email} onChange={set("email")} placeholder="you@email.com"/></div><div className="fgrp"><label className="flbl">Password</label><input className="finp" type="password" value={form.password} onChange={set("password")} placeholder="Min 6 characters"/></div><div className="fgrp"><label className="flbl">Confirm Password</label><input className="finp" type="password" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password"/></div></>)}
      {step===2&&(<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div><div className="fgrp"><label className="flbl">Phone</label><input className="finp" value={form.phone} onChange={set("phone")} placeholder="10-digit mobile"/></div><div className="fgrp"><label className="flbl">Date of Birth</label><input className="finp" type="date" value={form.dob} onChange={set("dob")}/></div><div className="fgrp"><label className="flbl">Last Donation</label><input className="finp" type="date" value={form.lastDonation} onChange={set("lastDonation")}/></div></div><div className="fgrp"><label className="flbl">Address / City</label><input className="finp" value={form.address} onChange={set("address")} placeholder="e.g. Koramangala, Bengaluru"/></div><div className="fgrp"><label className="flbl">Emergency Contact</label><input className="finp" value={form.emergencyContact} onChange={set("emergencyContact")} placeholder="Emergency phone"/></div>{form.lastDonation&&<div className={`alert ${elig.eligible?"a-green":"a-amber"}`}>{elig.eligible?`✓ Eligible — ${elig.daysPassed} days since last donation`:`⏳ ${elig.daysLeft} more days needed`}</div>}</>)}
      {step===3&&(<>{sLoading?<div className="alert a-blue">🤖 Running AI pre-screening…</div>:screening&&<div style={{background:"var(--g50)",border:"1px solid var(--g200)",borderRadius:10,padding:14,marginBottom:14}}><div style={{fontWeight:700,fontSize:13,color:"var(--navy)",marginBottom:6}}>🤖 AI Pre-Screening</div><div style={{fontSize:13,lineHeight:1.7,color:"var(--g600)"}}>{screening}</div></div>}<div style={{background:"var(--g50)",border:"1px solid var(--g200)",borderRadius:10,padding:14,marginBottom:14,fontSize:13}}><div style={{fontWeight:700,color:"var(--navy)",marginBottom:8}}>Summary</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,color:"var(--g600)"}}><div>Name: <strong>{form.name}</strong></div><div>Blood Type: <strong style={{color:"var(--red)"}}>{form.bloodType}</strong></div><div>Phone: <strong>{form.phone}</strong></div><div>Location: <strong>{form.address||"Not provided"}</strong></div></div></div><label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:13,color:"var(--g600)",cursor:"pointer",marginBottom:14,lineHeight:1.6}}><input type="checkbox" checked={form.agree} onChange={set("agree")} style={{marginTop:3,flexShrink:0}}/>I confirm all information is accurate and consent to be contacted for blood donation.</label></>)}
      {err&&<div className="alert a-red" style={{marginBottom:10}}>{err}</div>}
      <div style={{display:"flex",gap:8}}>
        {step>1&&<button className="btn btn-ghost" onClick={()=>setStep(s=>s-1)} style={{flex:1,justifyContent:"center"}}>← Back</button>}
        <button className="btn btn-red" onClick={next} disabled={sLoading} style={{flex:2,justifyContent:"center"}}>{sLoading?"Running AI Screening…":step===3?"Complete Registration →":step===2?"Next: AI Screening →":"Continue →"}</button>
      </div>
      <div style={{textAlign:"center",marginTop:14,fontSize:12,color:"var(--slate)"}}>Already registered? <span onClick={onSwitchLogin} style={{color:"var(--red)",cursor:"pointer",fontWeight:600}}>Sign in here</span></div>
    </div>
  );
}
function LoginPage({onLogin,onRegister}){
  const [tab,setTab]=useState("login");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const login=async()=>{
    setLoading(true);setErr("");
    try{
      const u=await apiClient.login(email,pass);
      onLogin(u);
    }catch(e){
      setErr(e.message||"Invalid email or password. Use demo credentials below.");
    }
    setLoading(false);
  };
  return(
    <div className="login-wrap">
      <div className="login-left">
        <div className="left-content">
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}>
            <div style={{width:40,height:40,background:"var(--red2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"white"}}>H</div>
            <div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,color:"white"}}>HaemoLink</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:1.5,textTransform:"uppercase"}}>Emergency Blood Grid</div></div>
          </div>
          <div className="left-h">Every drop counts.<br/>Every second matters.</div>
          <div className="left-p">A centralized platform connecting hospitals, managing blood inventory in real-time, and routing emergency requests using graph algorithms and AI.</div>
          {[["🩸","Real-time Inventory","Auto-expiry checks, FEFO allocation, blood type tracking"],["🗺","Emergency Routing","Dijkstra's algorithm finds nearest available blood source"],["🫀","Organ Donor Registry","Register and match organ donors to recipients"],["🚨","SOS Mode","One-click emergency scan of the entire hospital network"],["🤖","AI-Powered","Claude answers compatibility and protocol queries in real-time"]].map(([icon,title,desc])=>(
            <div key={title} className="feat-item"><div className="feat-icon">{icon}</div><div className="feat-text"><strong>{title}</strong>{desc}</div></div>
          ))}
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="login-mark">H</div>
          <div className="login-h1">{tab==="login"?"Welcome back":"Join HaemoLink"}</div>
          <div className="login-sub">{tab==="login"?"Sign in to your account":"Register as a volunteer blood donor"}</div>
          <div className="login-tabs">{[["login","Sign In"],["register","Register as Donor"]].map(([k,l])=><button key={k} className={`login-tab ${tab===k?"on":""}`} onClick={()=>{setTab(k);setErr("");}}>{l}</button>)}</div>
          {tab==="login"?(
            <>
              <div className="fgrp"><label className="flbl">Email</label><input className="finp" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"/></div>
              <div className="fgrp"><label className="flbl">Password</label><input className="finp" type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••"/></div>
              {err&&<div className="alert a-red">{err}</div>}
              <button className="btn btn-red btn-full" onClick={login} disabled={loading}>{loading?"Signing in…":"Sign In →"}</button>
              <div className="demo-box"><strong>Demo accounts:</strong><br/>🔐 Admin: admin@hemolink.in / admin123<br/>🏥 Manipal: manipal@hemolink.in / Manipal@123<br/>🏥 Fortis: fortis@hemolink.in / Fortis@123<br/>🏥 Apollo: apollo@hemolink.in / Apollo@123<br/>🏥 AIIMS: aiims@hemolink.in / AIIMS@123<br/>👤 Or register a new donor account above →</div>
            </>
          ):<DonorRegisterForm onRegister={onRegister} onSwitchLogin={()=>setTab("login")}/>}
        </div>
      </div>
    </div>
  );
}
function OrganRegistry({db,refresh,user}){
  const [search,setSearch]=useState("");
  const [filterOrgan,setFilterOrgan]=useState("");
  const [filterBT,setFilterBT]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({name:"",bloodType:"",phone:"",organs:[],hospitalId:"",notes:""});
  const [saving,setSaving]=useState(false);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const organDonors=db.organDonors||[];
  const toggleOrgan=o=>setForm(p=>({...p,organs:p.organs.includes(o)?p.organs.filter(x=>x!==o):[...p.organs,o]}));
  const addOrganDonor=async()=>{
    if(!form.name||!form.bloodType||!form.phone||form.organs.length===0||saving)return;
    setSaving(true);
    try{
      await apiClient.createOrganDonor({
        name:form.name,bloodType:form.bloodType,phone:form.phone,organs:form.organs,
        hospitalId:form.hospitalId||(user.hospitalId||"h1"),notes:form.notes||null,
      });
      await refresh();
      setModal(false);setForm({name:"",bloodType:"",phone:"",organs:[],hospitalId:"",notes:""});
    }catch(e){alert(e.message||"Failed to register organ donor.");}
    setSaving(false);
  };
  const filtered=organDonors.filter(d=>{
    const q=search.toLowerCase();
    return(!q||d.name.toLowerCase().includes(q)||d.phone.includes(q)||d.bloodType.toLowerCase().includes(q))&&(!filterOrgan||d.organs.includes(filterOrgan))&&(!filterBT||d.bloodType===filterBT);
  });
  const ORGAN_ICONS={Kidney:"🫘",Liver:"🟤",Heart:"❤️",Lungs:"🫁",Pancreas:"🟡",Cornea:"👁","Bone Marrow":"🦴","Small Intestine":"🔵"};
  return(
    <div>
      <div className="sh"><div className="sh-title">🫀 Organ Donor Registry ({organDonors.length})</div><button className="btn btn-red" onClick={()=>setModal(true)}>+ Register Organ Donor</button></div>
      <div className="alert a-purple" style={{marginBottom:20}}>🫀 <div><strong>Organ Donation Registry</strong> — Donors pledge specific organs. Blood type compatibility is used to match donors with recipients. One donor can save up to 8 lives.</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginBottom:20}}>
        {ORGANS.map(o=><div key={o} onClick={()=>setFilterOrgan(filterOrgan===o?"":o)} style={{padding:"12px 10px",borderRadius:18,background:filterOrgan===o?"var(--purple-bg)":"white",border:`1.5px solid ${filterOrgan===o?"var(--purple)":"var(--g200)"}`,cursor:"pointer",boxShadow:"var(--sh)",textAlign:"center",transition:".15s"}}><div style={{fontSize:20,marginBottom:4}}>{ORGAN_ICONS[o]||"🔵"}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:600,color:filterOrgan===o?"var(--purple)":"var(--g800)"}}>{o}</div><div style={{fontSize:10,color:"var(--slate)",marginTop:2}}>{organDonors.filter(d=>d.organs.includes(o)).length} donor{organDonors.filter(d=>d.organs.includes(o)).length!==1?"s":""}</div></div>)}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        <div className="search-wrap" style={{flex:2,minWidth:200}}><span className="search-icon">🔍</span><input className="finp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, blood type…"/></div>
        <select className="fsel" style={{flex:1,minWidth:140}} value={filterBT} onChange={e=>setFilterBT(e.target.value)}><option value="">All Blood Types</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select>
        {(search||filterOrgan||filterBT)&&<button className="btn btn-ghost" onClick={()=>{setSearch("");setFilterOrgan("");setFilterBT("");}}>Clear ✕</button>}
      </div>
      {filterOrgan&&<div className="alert a-purple" style={{marginBottom:14}}>Showing donors pledged for: <strong>{filterOrgan}</strong></div>}
      <div className="organ-grid" style={{marginBottom:20}}>
        {filtered.map(d=>{
          const hosp=db.hospitals.find(h=>h.id===d.hospitalId);
          return(<div key={d.id} className="organ-card fade-up"><div className="split" style={{marginBottom:10}}><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,color:"var(--g900)",fontWeight:700}}>{d.name}</div><Badge cls="b-purple">{d.bloodType}</Badge></div><div style={{fontSize:12,color:"var(--slate)",marginBottom:4}}>📞 {d.phone}</div><div style={{fontSize:12,color:"var(--slate)",marginBottom:4}}>🏥 {hosp?.name||"Not linked"}</div><div style={{fontSize:12,color:"var(--slate)",marginBottom:8}}>📅 {d.registeredAt}</div>{d.notes&&<div style={{fontSize:12,color:"var(--g600)",fontStyle:"italic",marginBottom:8}}>"{d.notes}"</div>}<div className="organ-chips">{d.organs.map(o=><span key={o} className="organ-chip">{o}</span>)}</div></div>);
        })}
        {filtered.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:40,color:"var(--slate)"}}><div style={{fontSize:32,marginBottom:8}}>🫀</div><div style={{fontSize:16,marginBottom:4}}>No organ donors found</div><div style={{fontSize:13}}>Try adjusting filters or register a new donor.</div></div>}
      </div>
      <div className="card" style={{marginBottom:16}}><div className="card-t">All Organ Donors</div><div className="tw"><table><thead><tr><th>Name</th><th>Blood Type</th><th>Phone</th><th>Organs Pledged</th><th>Hospital</th><th>Registered</th><th>Status</th></tr></thead><tbody>{filtered.map(d=>{const hosp=db.hospitals.find(h=>h.id===d.hospitalId);return(<tr key={d.id}><td style={{fontWeight:600}}>{d.name}</td><td><BT t={d.bloodType}/></td><td style={{fontFamily:"monospace",fontSize:12,color:"var(--blue)"}}>{d.phone}</td><td><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{d.organs.map(o=><span key={o} className="organ-chip">{o}</span>)}</div></td><td style={{fontSize:12}}>{hosp?.name||"—"}</td><td style={{fontSize:12,color:"var(--slate)"}}>{d.registeredAt}</td><td><Badge cls="b-purple">{d.status}</Badge></td></tr>);})}</tbody></table></div></div>
      <div className="card"><div className="card-t">🔬 Blood Type Compatibility for Organ Donation</div><div style={{fontSize:13,color:"var(--slate)",marginBottom:16,lineHeight:1.7}}>Organ transplants require strict blood type compatibility. The table below shows which donor types can donate to which recipients.</div><div className="compat-grid">{BLOOD_TYPES.map(bt=><div key={bt} className="compat-card"><div className="compat-type" style={{color:BT_COLORS[bt]}}>{bt} <span style={{fontSize:12,color:"var(--slate)",fontFamily:"sans-serif",fontWeight:400}}>→</span></div><div className="compat-chips">{BLOOD_TYPES.filter(r=>COMPATIBILITY[r]?.includes(bt)).map(r=><span key={r} className="compat-chip" style={{background:BT_COLORS[r]+"22",color:BT_COLORS[r]}}>{r}</span>)}</div></div>)}</div></div>
      {modal&&(<div className="overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}><div className="modal"><div className="modal-t">🫀 Register Organ Donor <button className="btn btn-ghost btn-sm" onClick={()=>setModal(false)}>✕</button></div><div className="alert a-purple">Registering as an organ donor is voluntary. All information is confidential and used solely for medical coordination.</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div className="fgrp"><label className="flbl">Full Name</label><input className="finp" value={form.name} onChange={set("name")} placeholder="Full name"/></div><div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div><div className="fgrp"><label className="flbl">Phone</label><input className="finp" value={form.phone} onChange={set("phone")} placeholder="10-digit"/></div><div className="fgrp"><label className="flbl">Hospital</label><select className="fsel" value={form.hospitalId} onChange={set("hospitalId")}><option value="">Select…</option>{db.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></div></div><div className="fgrp"><label className="flbl">Organs to Pledge</label><div style={{display:"flex",flexWrap:"wrap",gap:8,padding:12,background:"var(--g50)",borderRadius:12,border:"1px solid var(--g200)"}}>{ORGANS.map(o=><button key={o} type="button" onClick={()=>toggleOrgan(o)} className={`btn btn-sm ${form.organs.includes(o)?"btn-purple":"btn-ghost"}`}>{o}</button>)}</div>{form.organs.length===0&&<div style={{fontSize:11,color:"var(--slate)",marginTop:4}}>Select at least one organ</div>}</div><div className="fgrp"><label className="flbl">Notes (optional)</label><input className="finp" value={form.notes} onChange={set("notes")} placeholder="e.g. No prior surgeries, non-smoker"/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-red" onClick={addOrganDonor} disabled={!form.name||!form.bloodType||!form.phone||form.organs.length===0||saving}>{saving?"Saving…":"Register Donor"}</button></div></div></div>)}
    </div>
  );
}
function AdminDash({db,refresh,user}){
  const [tab,setTab]=useState("overview");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [emg,setEmg]=useState(null);
  const [donorSearch,setDonorSearch]=useState("");
  const [hospSearch,setHospSearch]=useState("");
  const [capacityHospId, setCapacityHospId] = useState(db.hospitals[0]?.id || "");
  const [saving,setSaving]=useState(false);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const inv=expireUnits(db.inventory);
  const totalAvail=inv.filter(u=>u.status==="Available").length;
  const expSoon=inv.filter(u=>{const d=(new Date(u.expiryDate)-getToday())/DAY_MS;return d>=0&&d<=7&&u.status==="Available";}).length;
  const critPending=db.requests.filter(r=>r.urgency==="Critical"&&r.status==="Pending").length;
  const eligDonors=db.donors.filter(d=>d.medicalClearance&&checkEligibility(d.lastDonation).eligible).length;

  const addDonor=async()=>{
    const{name,bloodType,phone,email,dob,address,lastDonation,emergencyContact}=form;
    if(!name||!bloodType||!phone||!email||saving)return;
    setSaving(true);
    try{
      await apiClient.createDonor({name,bloodType,phone,email,dob,address,lastDonation,emergencyContact});
      await refresh();setModal(null);setForm({});
    }catch(e){alert(e.message||"Failed to add donor.");}
    setSaving(false);
  };
  const addInv=async()=>{
    const{bloodType,collectionDate,expiryDate,hospitalId}=form;
    if(!bloodType||!collectionDate||!expiryDate||!hospitalId||saving)return;
    setSaving(true);
    try{
      await apiClient.createInventory({bloodType,collectionDate,expiryDate,hospitalId});
      await refresh();setModal(null);setForm({});
    }catch(e){alert(e.message||"Failed to add inventory.");}
    setSaving(false);
  };
  const addReq=async()=>{
    const{bloodType,quantity,urgency,hospitalId,notes}=form;
    if(!bloodType||!quantity||!urgency||!hospitalId||saving)return;
    setSaving(true);
    try{
      const qty=parseInt(quantity);
      const response=await apiClient.createRequest({hospitalId,bloodType,quantity:qty,urgency,notes:notes||null});
      await refresh();
      if(!response.fulfilledLocally){
        setEmg({req:response.request,nearby:normalizeMatches(response.nearby)});
      }
      setModal(null);setForm({});
    }catch(e){alert(e.message||"Failed to submit request.");}
    setSaving(false);
  };
  const fulfillReq=async reqId=>{
    try{
      await apiClient.fulfillRequest(reqId);
      await refresh();setEmg(null);
    }catch(e){
      const req=db.requests.find(r=>r.id===reqId);
      if(req)setEmg({req,nearby:normalizeMatches(await apiClient.matches({hospitalId:req.hospitalId,bloodType:req.bloodType,quantity:req.quantity}))});
      else alert(e.message||"Failed to fulfill request.");
    }
  };
  const toggleClearance=async donorId=>{
    try{await apiClient.toggleClearance(donorId);await refresh();}
    catch(e){alert(e.message||"Failed to update clearance.");}
  };

  const overview=(
    <div>
      {critPending>0&&<div className="alert a-red"><span className="blink">🔴</span><div><strong>{critPending} critical request{critPending>1?"s":""} pending</strong></div></div>}
      {expSoon>0&&<div className="alert a-amber">⚠️ <div><strong>{expSoon} unit{expSoon>1?"s":""} expiring within 7 days</strong></div></div>}
      <div className="g4" style={{marginBottom:18}}>
        {[{lbl:"Available Units",val:totalAvail,sub:"Across all hospitals",col:"var(--green)"},{lbl:"Total Donors",val:db.donors.length,sub:`${eligDonors} eligible now`,col:"var(--navy)"},{lbl:"Organ Donors",val:(db.organDonors||[]).length,sub:"Pledges registered",col:"var(--purple)"},{lbl:"Pending Requests",val:db.requests.filter(r=>r.status==="Pending").length,sub:`${critPending} critical`,col:"var(--amber)"}].map(s=>(
          <div key={s.lbl} className="stat"><div className="stat-lbl">{s.lbl}</div><div className="stat-val" style={{color:s.col}}>{s.val}</div><div className="stat-sub">{s.sub}</div></div>
        ))}
      </div>
      <div className="g2" style={{marginBottom:16}}>
        <div className="card"><div className="card-t">📊 Blood Inventory by Type</div><InvChart db={db}/></div>
        <div className="card"><div className="card-t">🗺 Hospital Network (Dijkstra Graph)</div><NetworkGraph db={db} highlight={null}/><div style={{fontSize:11,color:"var(--slate)",marginTop:4}}>Edges = distance (km) · Dijkstra finds shortest path</div></div>
      </div>
      <div className="soft-grid" style={{marginBottom:16}}>
        {db.hospitals.map(h=>{const av=inv.filter(u=>u.hospitalId===h.id&&u.status==="Available").length,pe=db.requests.filter(r=>r.hospitalId===h.id&&r.status==="Pending").length;return(<DataCard key={h.id} title={h.name} meta={`${h.location} · ${h.contact}`}><div className="pill-row"><Badge cls={av>3?"b-green":av>0?"b-amber":"b-red"}>{av} units</Badge>{pe>0?<Badge cls="b-amber">{pe} pending</Badge>:<Badge cls="b-slate">No pending</Badge>}</div></DataCard>);})}
      </div>
      <div className="g2"><div className="card"><div className="card-t">📋 Activity Log</div><div className="tl">{db.activityLog.slice(0,8).map(l=><div key={l.id} className="tl-item"><div className="tl-dot" style={{background:l.type==="success"?"var(--green)":l.type==="alert"?"var(--red)":"var(--blue)"}}/><div><div className="tl-t">{l.msg}</div><div className="tl-d">{l.time}</div></div></div>)}</div></div><AIAssistant db={db} user={user}/></div>
    </div>
  );

  const donorsTab=(
    <div>
      <div className="sh"><div className="sh-title">Donor Registry ({db.donors.length})</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div className="search-wrap"><span className="search-icon">🔍</span><input className="finp" style={{width:260,paddingLeft:36}} placeholder="Search name, email, phone, blood type…" value={donorSearch} onChange={e=>setDonorSearch(e.target.value)}/></div>
          <button className="btn btn-red" onClick={()=>{setModal("donor");setForm({});}}>+ Add Donor</button>
        </div>
      </div>
      {donorSearch&&<div className="alert a-blue" style={{marginBottom:12}}>{db.donors.filter(d=>{const q=donorSearch.toLowerCase();return d.name.toLowerCase().includes(q)||d.email.toLowerCase().includes(q)||d.phone.includes(q)||d.bloodType.toLowerCase().includes(q)||(d.address||"").toLowerCase().includes(q);}).length} results for "{donorSearch}"</div>}
      <div className="card"><div className="tw"><table><thead><tr><th>Name</th><th>Blood Type</th><th>Email</th><th>Phone</th><th>Address</th><th>Last Donation</th><th>Eligibility</th><th>Clearance</th></tr></thead><tbody>
        {db.donors.filter(d=>{const q=donorSearch.toLowerCase();return!q||d.name.toLowerCase().includes(q)||d.email.toLowerCase().includes(q)||d.phone.includes(q)||d.bloodType.toLowerCase().includes(q)||(d.address||"").toLowerCase().includes(q);}).map(d=>{
          const el=checkEligibility(d.lastDonation);
          return(<tr key={d.id}><td style={{fontWeight:600}}>{d.name}{d.userId&&<span style={{fontSize:10,marginLeft:6,color:"var(--blue)"}}>●self-reg</span>}</td><td><BT t={d.bloodType}/></td><td style={{fontSize:12,color:"var(--blue)"}}>{d.email}</td><td style={{fontFamily:"monospace",fontSize:12}}>{d.phone}</td><td style={{fontSize:12,color:"var(--slate)"}}>{d.address||"—"}</td><td style={{fontSize:12,color:"var(--slate)"}}>{d.lastDonation||"Never"}</td><td>{el.eligible?<Badge cls="b-green">✓ Eligible</Badge>:<Badge cls="b-amber">{el.daysLeft}d left</Badge>}</td><td><button onClick={()=>toggleClearance(d.id)} className={`btn btn-sm ${d.medicalClearance?"btn-green":"btn-danger"}`}>{d.medicalClearance?"✓ Cleared":"✗ Hold"}</button></td></tr>);
        })}
      </tbody></table></div></div>
    </div>
  );

  const inventoryTab=(
    <div>
      <div className="sh"><div className="sh-title">Blood Inventory ({inv.filter(u=>u.status==="Available").length} available)</div><button className="btn btn-red" onClick={()=>{setModal("inv");setForm({});}}>+ Add Unit</button></div>
      <div className="inventory-stack" style={{marginBottom:16}}>
        {inv.filter(u=>u.status==="Available").slice(0,8).map(u=>{const dl=Math.ceil((new Date(u.expiryDate)-getToday())/DAY_MS),hosp=db.hospitals.find(h=>h.id===u.hospitalId);return(<div key={u.id} className="unit-card fade-up"><div className="split"><div className="unit-id">{u.id.toUpperCase()}</div>{stBadge(u.status)}</div><div className="unit-type" style={{color:BT_COLORS[u.bloodType]}}>{u.bloodType}</div><div className="unit-meta"><div>{hosp?.name||"Unknown"}</div><div>Expires: {u.expiryDate}</div><div style={{color:dl<=7?"var(--red)":"inherit"}}>{dl<=7?`⚠ ${dl}d left!`:`${dl}d left`}</div></div></div>);})}
      </div>
      <div className="card"><div className="tw"><table><thead><tr><th>Unit ID</th><th>Type</th><th>Hospital</th><th>Collected</th><th>Expires</th><th>Status</th><th>Days Left</th></tr></thead><tbody>
        {inv.map(u=>{const dl=Math.ceil((new Date(u.expiryDate)-getToday())/DAY_MS),hosp=db.hospitals.find(h=>h.id===u.hospitalId);return(<tr key={u.id}><td style={{fontFamily:"monospace",fontSize:11}}>{u.id.toUpperCase()}</td><td><BT t={u.bloodType}/></td><td style={{fontSize:12}}>{hosp?.name?.split(" ")[0]||"—"}</td><td style={{fontSize:12,color:"var(--slate)"}}>{u.collectionDate}</td><td style={{fontSize:12,color:"var(--slate)"}}>{u.expiryDate}</td><td>{stBadge(u.status)}</td><td>{u.status==="Expired"?<span style={{color:"var(--slate)",fontSize:12}}>—</span>:dl<=7?<span style={{color:"var(--red)",fontWeight:700,fontSize:12}}>{dl}d ⚠</span>:<span style={{fontSize:12,color:"var(--slate)"}}>{dl}d</span>}</td></tr>);})}</tbody></table></div></div>
    </div>
  );

  const requestsTab=(
    <div>
      <div className="sh"><div className="sh-title">Blood Requests</div><button className="btn btn-red" onClick={()=>{setModal("req");setForm({});}}>+ New Request</button></div>
      {emg&&(<div className="emg" style={{marginBottom:16}}><div className="emg-t"><span className="blink">🚨</span> Emergency Routing — Insufficient local stock</div><NetworkGraph db={db} highlight={emg.req.hospitalId}/><div style={{fontSize:13,marginBottom:10,color:"var(--red)"}}>Dijkstra scanning for {emg.req.bloodType}-compatible blood…</div>{emg.nearby.length===0?<div className="alert a-red">No hospital has sufficient compatible blood.</div>:emg.nearby.map(r=><div key={r.hospital.id} className="alert a-green" style={{marginBottom:6,alignItems:"center"}}>🏥 <div><strong>{r.hospital.name}</strong> ({r.hospital.location}) — <strong>{r.distance}km</strong> — {r.total} units</div><button className="btn btn-sm btn-green" style={{marginLeft:"auto"}} onClick={()=>setEmg(null)}>Initiate Transfer</button></div>)}<button className="btn btn-sm btn-ghost" style={{marginTop:8}} onClick={()=>setEmg(null)}>Dismiss</button></div>)}
      <div className="request-board" style={{marginBottom:16}}>
        {["Pending","Fulfilled"].map(status=>(
          <div key={status} className="lane"><div className="lane-head"><span>{status==="Pending"?"Active Queue":"Resolved"}</span><Badge cls={status==="Pending"?"b-amber":"b-green"}>{db.requests.filter(r=>r.status===status).length}</Badge></div>
          <div className="lane-stack">{db.requests.filter(r=>r.status===status).slice(0,5).map(r=>{const hosp=db.hospitals.find(h=>h.id===r.hospitalId),can=matchRequest(inv,r.bloodType,r.quantity,r.hospitalId).canFulfill;return(<div key={r.id} className="request-card fade-up"><div className="split" style={{marginBottom:8}}><strong>{hosp?.name||r.hospitalId}</strong>{urgBadge(r.urgency)}</div><div className="data-meta">{r.quantity} unit(s) of {r.bloodType} · {r.createdAt}</div>{r.notes&&<div style={{fontSize:11,color:"var(--slate)",marginTop:4,fontStyle:"italic"}}>{r.notes}</div>}<div className="pill-row">{stBadge(r.status)}{status==="Pending"&&<Badge cls={can?"b-green":"b-red"}>{can?"Ready locally":"Needs reroute"}</Badge>}</div>{status==="Pending"&&<button className={`btn btn-sm ${can?"btn-green":"btn-danger"}`} style={{marginTop:10,width:"100%",justifyContent:"center"}} onClick={()=>fulfillReq(r.id)}>{can?"✓ Fulfill":"🚨 Reroute"}</button>}</div>);})}</div>
          </div>
        ))}
      </div>
      <div className="card"><div className="tw"><table><thead><tr><th>Hospital</th><th>Type</th><th>Qty</th><th>Urgency</th><th>Status</th><th>Notes</th><th>Date</th><th>Action</th></tr></thead><tbody>{db.requests.map(r=>{const hosp=db.hospitals.find(h=>h.id===r.hospitalId),can=matchRequest(inv,r.bloodType,r.quantity,r.hospitalId).canFulfill;return(<tr key={r.id}><td style={{fontSize:12,fontWeight:600}}>{hosp?.name}</td><td><BT t={r.bloodType}/></td><td>{r.quantity}</td><td>{urgBadge(r.urgency)}</td><td>{stBadge(r.status)}</td><td style={{fontSize:11,color:"var(--slate)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.notes||"—"}</td><td style={{fontSize:12,color:"var(--slate)"}}>{r.createdAt}</td><td>{r.status==="Pending"&&<button className={`btn btn-sm ${can?"btn-green":"btn-danger"}`} onClick={()=>fulfillReq(r.id)}>{can?"✓ Fulfill":"🚨 Reroute"}</button>}</td></tr>);})}</tbody></table></div></div>
    </div>
  );

  const hospitalsTab=(
    <div>
      <div className="sh"><div className="sh-title">Hospital Network</div><div className="search-wrap"><span className="search-icon">🔍</span><input className="finp" style={{width:260,paddingLeft:36}} placeholder="Search name or location…" value={hospSearch} onChange={e=>setHospSearch(e.target.value)}/></div></div>
      {hospSearch&&<div className="alert a-blue" style={{marginBottom:12}}>{db.hospitals.filter(h=>h.name.toLowerCase().includes(hospSearch.toLowerCase())||h.location.toLowerCase().includes(hospSearch.toLowerCase())).length} results for "{hospSearch}"</div>}
      <div className="card" style={{marginBottom:16}}><div className="card-t">Network Graph</div><NetworkGraph db={db} highlight={null}/></div>
      <div className="soft-grid" style={{marginBottom:16}}>
        {db.hospitals.filter(h=>!hospSearch||h.name.toLowerCase().includes(hospSearch.toLowerCase())||h.location.toLowerCase().includes(hospSearch.toLowerCase())).map(h=>{
          const av=inv.filter(u=>u.hospitalId===h.id&&u.status==="Available").length,pe=db.requests.filter(r=>r.hospitalId===h.id&&r.status==="Pending").length;
          const byType=BLOOD_TYPES.filter(bt=>inv.some(u=>u.hospitalId===h.id&&u.bloodType===bt&&u.status==="Available"));
          return(<DataCard key={h.id} title={h.name} meta={`${h.location} · ${h.phone}`}><div className="pill-row"><Badge cls={av>3?"b-green":av>0?"b-amber":"b-red"}>{av} units</Badge>{pe>0?<Badge cls="b-amber">{pe} pending</Badge>:<Badge cls="b-slate">No pending</Badge>}</div>{byType.length>0&&<div style={{marginTop:8,fontSize:11,color:"var(--slate)"}}>Has: {byType.join(", ")}</div>}</DataCard>);
        })}
      </div>
      <div className="card"><div className="tw"><table><thead><tr><th>Hospital</th><th>Location</th><th>Contact</th><th>Phone</th><th>Available</th><th>Pending</th><th>Blood Types in Stock</th></tr></thead><tbody>
        {db.hospitals.filter(h=>!hospSearch||h.name.toLowerCase().includes(hospSearch.toLowerCase())||h.location.toLowerCase().includes(hospSearch.toLowerCase())).map(h=>{
          const av=inv.filter(u=>u.hospitalId===h.id&&u.status==="Available").length,pe=db.requests.filter(r=>r.hospitalId===h.id&&r.status==="Pending").length;
          const byType=BLOOD_TYPES.filter(bt=>inv.some(u=>u.hospitalId===h.id&&u.bloodType===bt&&u.status==="Available"));
          return(<tr key={h.id}><td style={{fontWeight:600}}>{h.name}</td><td style={{fontSize:12,color:"var(--slate)"}}>{h.location}</td><td style={{fontSize:12}}>{h.contact}</td><td style={{fontFamily:"monospace",fontSize:11}}>{h.phone}</td><td><Badge cls={av>3?"b-green":av>0?"b-amber":"b-red"}>{av}</Badge></td><td>{pe>0?<Badge cls="b-amber">{pe}</Badge>:<Badge cls="b-slate">0</Badge>}</td><td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{byType.map(bt=><span key={bt} style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:BT_COLORS[bt]+"22",color:BT_COLORS[bt],fontWeight:700}}>{bt}</span>)}</div></td></tr>);
        })}
      </tbody></table></div></div>
    </div>
  );

  const capacityTab=(
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="fgrp">
          <label className="flbl">Hospital</label>
          <select className="fsel" value={capacityHospId} onChange={e => setCapacityHospId(e.target.value)}>
            {db.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>
      {capacityHospId && <BloodCapacitySettings db={db} hospitalId={capacityHospId} refresh={refresh}/>}
    </div>
  );
  const tabMap={overview,donors:donorsTab,inventory:inventoryTab,requests:requestsTab,hospitals:hospitalsTab,capacity:capacityTab,organs:<OrganRegistry db={db} refresh={refresh} user={user}/>};
  return(
    <div className="main">
      <div className="tabs">{[["overview","📊 Overview"],["donors","👤 Donors"],["inventory","🩸 Inventory"],["requests","📋 Requests"],["hospitals","🏥 Hospitals"],["capacity","🎯 Capacity"],["organs","🫀 Organ Registry"]].map(([k,l])=><button key={k} className={`tab ${tab===k?"on":""}`} onClick={()=>setTab(k)}>{l}</button>)}</div>
      {tabMap[tab]}
      {modal&&(<div className="overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}><div className="modal"><div className="modal-t">{modal==="donor"?"Register Donor":modal==="inv"?"Add Blood Unit":"New Request"}<button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button></div>
        {modal==="donor"&&(<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[["name","Full Name","text","Full name"],["email","Email","email","donor@email.com"],["phone","Phone","text","10-digit"],["dob","Date of Birth","date",""],["address","Address","text","City, State"],["emergencyContact","Emergency Contact","text","Phone"]].map(([k,l,t,ph])=><div key={k} className="fgrp"><label className="flbl">{l}</label><input className="finp" type={t} value={form[k]||""} onChange={set(k)} placeholder={ph}/></div>)}<div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType||""} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div><div className="fgrp"><label className="flbl">Last Donation</label><input className="finp" type="date" value={form.lastDonation||""} onChange={set("lastDonation")}/></div></div>{form.lastDonation&&(()=>{const e=checkEligibility(form.lastDonation);return<div className={`alert ${e.eligible?"a-green":"a-amber"}`}>{e.eligible?`✓ Eligible (${e.daysPassed} days)`:`⏳ ${e.daysLeft} days until eligible`}</div>;})()}<div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-red" onClick={addDonor}>Register</button></div></>)}
        {modal==="inv"&&(<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType||""} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div><div className="fgrp"><label className="flbl">Hospital</label><select className="fsel" value={form.hospitalId||""} onChange={set("hospitalId")}><option value="">Select…</option>{db.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></div><div className="fgrp"><label className="flbl">Collection Date</label><input className="finp" type="date" value={form.collectionDate||""} onChange={set("collectionDate")}/></div><div className="fgrp"><label className="flbl">Expiry Date</label><input className="finp" type="date" value={form.expiryDate||""} onChange={set("expiryDate")}/></div></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-red" onClick={addInv}>Add Unit</button></div></>)}
        {modal==="req"&&(<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div className="fgrp"><label className="flbl">Hospital</label><select className="fsel" value={form.hospitalId||""} onChange={set("hospitalId")}><option value="">Select…</option>{db.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></div><div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType||""} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div><div className="fgrp"><label className="flbl">Quantity</label><input className="finp" type="number" min="1" value={form.quantity||""} onChange={set("quantity")} placeholder="Units needed"/></div><div className="fgrp"><label className="flbl">Urgency</label><select className="fsel" value={form.urgency||""} onChange={set("urgency")}><option value="">Select…</option>{["Critical","High","Medium","Low"].map(u=><option key={u} value={u}>{u}</option>)}</select></div></div><div className="fgrp"><label className="flbl">Clinical Notes</label><input className="finp" value={form.notes||""} onChange={set("notes")} placeholder="e.g. Trauma patient"/></div>{form.bloodType&&<div className="alert a-blue" style={{marginBottom:10}}>Compatible: {COMPATIBILITY[form.bloodType]?.join(", ")}</div>}<div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-red" onClick={addReq}>Submit</button></div></>)}
      </div></div>)}
    </div>
  );
}
function HospitalDash({db,refresh,user}){
  const [tab,setTab]=useState("dashboard");
  const [form,setForm]=useState({});
  const [result,setResult]=useState(null);
  const [donorSearch,setDonorSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const inv=expireUnits(db.inventory);
  const myAvail=inv.filter(u=>u.hospitalId===user.hospitalId&&u.status==="Available");
  const myReqs=db.requests.filter(r=>r.hospitalId===user.hospitalId);
  const addInv=async()=>{
    const{bloodType,collectionDate,expiryDate}=form;
    if(!bloodType||!collectionDate||!expiryDate||saving)return;
    setSaving(true);
    try{
      await apiClient.createInventory({bloodType,collectionDate,expiryDate,hospitalId:user.hospitalId});
      await refresh();
      setForm({});
      alert("Blood unit added to your hospital stock.");
    }catch(e){alert(e.message||"Failed to add inventory.");}
    setSaving(false);
  };
  const submitReq=async()=>{
    const{bloodType,quantity,urgency,notes}=form;
    if(!bloodType||!quantity||!urgency||saving)return;
    setSaving(true);
    try{
      const qty=parseInt(quantity);
      const response=await apiClient.createRequest({hospitalId:user.hospitalId,bloodType,quantity:qty,urgency,notes:notes||null});
      await refresh();
      setResult(response.fulfilledLocally
        ?{type:"local",qty,bloodType}
        :{type:"network",nearby:normalizeMatches(response.nearby),bloodType,qty});
      setForm({});
    }catch(e){alert(e.message||"Failed to submit request.");}
    setSaving(false);
  };
  const dash=(
    <div>
      {result&&(<div className={`alert ${result.type==="local"?"a-green":"a-blue"}`} style={{marginBottom:16,alignItems:"flex-start"}}>{result.type==="local"?`✅ Fulfilled immediately — ${result.qty} unit(s) of ${result.bloodType} reserved from local stock`:(<div style={{width:"100%"}}><div style={{fontWeight:700,marginBottom:8}}>🗺 Dijkstra routing: nearest hospitals</div>{result.nearby.length===0?<div>No hospital has sufficient compatible stock.</div>:result.nearby.map(r=><div key={r.hospital.id} style={{marginBottom:4}}>🏥 <strong>{r.hospital.name}</strong> — {r.distance}km — {r.total} units</div>)}<button className="btn btn-sm btn-ghost" style={{marginTop:8}} onClick={()=>setResult(null)}>Dismiss</button></div>)}</div>)}
      <div className="g3" style={{marginBottom:16}}>
        <div className="stat"><div className="stat-lbl">Available Stock</div><div className="stat-val" style={{color:"var(--green)"}}>{myAvail.length}</div><div className="stat-sub">Units at my hospital</div></div>
        <div className="stat"><div className="stat-lbl">My Requests</div><div className="stat-val" style={{color:"var(--navy)"}}>{myReqs.length}</div><div className="stat-sub">{myReqs.filter(r=>r.status==="Pending").length} pending</div></div>
        <div className="stat"><div className="stat-lbl">Network</div><div className="stat-val" style={{color:"var(--blue)"}}>{db.hospitals.length}</div><div className="stat-sub">Connected hospitals</div></div>
      </div>
      <div className="g2" style={{marginBottom:16}}>
        <div className="card"><div className="card-t">🩸 My Blood Stock</div><InvChart db={db} hospId={user.hospitalId}/></div>
        <div className="card"><div className="card-t">📋 My Recent Requests</div><div className="tw"><table><thead><tr><th>Type</th><th>Qty</th><th>Urgency</th><th>Status</th><th>Date</th></tr></thead><tbody>{myReqs.slice(0,5).map(r=><tr key={r.id}><td><BT t={r.bloodType}/></td><td>{r.quantity}</td><td>{urgBadge(r.urgency)}</td><td>{stBadge(r.status)}</td><td style={{fontSize:12,color:"var(--slate)"}}>{r.createdAt}</td></tr>)}</tbody></table></div></div>
      </div>
    </div>
  );
  const requestTab=(
    <div>
      <div className="sh"><div className="sh-title">Request Blood</div></div>
      <div className="request-layout">
        <div className="stack">
          <div className="card"><div className="card-t">🩸 Submit New Request</div>
            <div className="fgrp"><label className="flbl">Blood Type Needed</label><select className="fsel" value={form.bloodType||""} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div>
            {form.bloodType&&<div className="alert a-blue" style={{marginBottom:12}}>Compatible types: <strong>{COMPATIBILITY[form.bloodType]?.join(", ")}</strong></div>}
            <div className="fgrp"><label className="flbl">Quantity</label><input className="finp" type="number" min="1" value={form.quantity||""} onChange={set("quantity")} placeholder="Units required"/></div>
            <div className="fgrp"><label className="flbl">Urgency</label><select className="fsel" value={form.urgency||""} onChange={set("urgency")}><option value="">Select…</option>{[["Critical","🔴 Critical — Within hours"],["High","🟠 High — Within 24h"],["Medium","🟡 Medium — Within 48h"],["Low","🟢 Low — Elective"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            <div className="fgrp"><label className="flbl">Clinical Notes</label><input className="finp" value={form.notes||""} onChange={set("notes")} placeholder="Optional"/></div>
            <button className="btn btn-red btn-full" onClick={submitReq} disabled={!form.bloodType||!form.quantity||!form.urgency||saving}>{saving?"Submitting…":"Submit Request"}</button>
          </div>
          {result&&result.type==="network"&&<div className="route-shell"><div className="eyebrow" style={{color:"white",background:"rgba(255,255,255,.15)"}}>Dijkstra Result</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,color:"white",margin:"8px 0"}}>Nearest {result.bloodType}-compatible hospitals</div>{result.nearby.length===0?<div className="route-card"><div><div className="route-name">No match found</div></div></div>:result.nearby.map(r=><div key={r.hospital.id} className="route-card"><div><div className="route-name">{r.hospital.name}</div><div className="route-meta">{r.hospital.location} · {r.distance}km</div></div><div className="route-badge">{r.total} units</div></div>)}</div>}
        </div>
        <div className="card"><div className="card-t">🗺 Smart Routing Logic</div>
          <div className="logic-list">{[["var(--green)","1","Local First","Checks your hospital's stock using blood compatibility graph."],["var(--blue)","2","FEFO Matching","Oldest-expiry units allocated first to reduce wastage."],["var(--amber)","3","Dijkstra Search","If local stock insufficient, finds nearest compatible hospital."],["var(--red)","4","Emergency Alert","Critical requests trigger network-wide notifications."]].map(([c,n,t,d])=><div key={n} className="logic-item"><div className="logic-num" style={{background:c}}>{n}</div><div style={{fontSize:13,color:"var(--slate)"}}><strong style={{color:"var(--g800)"}}>{t}:</strong> {d}</div></div>)}</div>
          <NetworkGraph db={db} highlight={user.hospitalId}/>
        </div>
      </div>
    </div>
  );
  const inventoryTab=(
    <div>
      <div className="sh"><div className="sh-title">My Blood Inventory ({myAvail.length} available)</div></div>
      <div className="card" style={{marginBottom:16}}>
        <div className="card-t">➕ Add Blood Unit</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div className="fgrp"><label className="flbl">Blood Type</label><select className="fsel" value={form.bloodType||""} onChange={set("bloodType")}><option value="">Select…</option>{BLOOD_TYPES.map(bt=><option key={bt} value={bt}>{bt}</option>)}</select></div>
          <div className="fgrp"><label className="flbl">Collection Date</label><input className="finp" type="date" value={form.collectionDate||""} onChange={set("collectionDate")}/></div>
          <div className="fgrp"><label className="flbl">Expiry Date</label><input className="finp" type="date" value={form.expiryDate||""} onChange={set("expiryDate")}/></div>
        </div>
        <button className="btn btn-red" style={{marginTop:12}} onClick={addInv} disabled={saving||!form.bloodType||!form.collectionDate||!form.expiryDate}>{saving?"Saving…":"Add Unit"}</button>
      </div>
      <div className="card"><div className="tw"><table><thead><tr><th>Unit</th><th>Type</th><th>Collected</th><th>Expires</th><th>Status</th></tr></thead><tbody>
        {inv.filter(u=>u.hospitalId===user.hospitalId).map(u=>{
          const dl=Math.ceil((new Date(u.expiryDate)-getToday())/DAY_MS);
          return(<tr key={u.id}><td style={{fontFamily:"monospace",fontSize:11}}>{u.id.toUpperCase()}</td><td><BT t={u.bloodType}/></td><td style={{fontSize:12,color:"var(--slate)"}}>{u.collectionDate}</td><td style={{fontSize:12,color:"var(--slate)"}}>{u.expiryDate}</td><td>{stBadge(u.status)}{u.status==="Available"&&dl<=7&&<span style={{color:"var(--red)",fontSize:11,marginLeft:6}}>{dl}d left</span>}</td></tr>);
        })}
      </tbody></table></div></div>
    </div>
  );
  const donorsTab=(
    <div>
      <div className="sh"><div className="sh-title">Volunteer Donor Directory</div><div className="search-wrap"><span className="search-icon">🔍</span><input className="finp" style={{width:260,paddingLeft:36}} placeholder="Search name, phone, blood type…" value={donorSearch} onChange={e=>setDonorSearch(e.target.value)}/></div></div>
      {donorSearch&&<div className="alert a-blue" style={{marginBottom:12}}>{db.donors.filter(d=>{const q=donorSearch.toLowerCase();return d.name.toLowerCase().includes(q)||d.phone.includes(q)||d.bloodType.toLowerCase().includes(q);}).length} results</div>}
      <div className="card"><div className="tw"><table><thead><tr><th>Name</th><th>Blood Type</th><th>Phone</th><th>Address</th><th>Last Donation</th><th>Eligibility</th><th>Clearance</th></tr></thead><tbody>
        {db.donors.filter(d=>{const q=donorSearch.toLowerCase();return!q||d.name.toLowerCase().includes(q)||d.phone.includes(q)||d.bloodType.toLowerCase().includes(q)||(d.address||"").toLowerCase().includes(q);}).map(d=>{
          const el=checkEligibility(d.lastDonation);
          return(<tr key={d.id}><td style={{fontWeight:600}}>{d.name}</td><td><BT t={d.bloodType}/></td><td style={{fontFamily:"monospace",fontSize:12,color:"var(--blue)"}}>{d.phone}</td><td style={{fontSize:12,color:"var(--slate)"}}>{d.address||"—"}</td><td style={{fontSize:12,color:"var(--slate)"}}>{d.lastDonation||"Never"}</td><td>{el.eligible?<Badge cls="b-green">✓ Ready</Badge>:<Badge cls="b-slate">{el.daysLeft}d</Badge>}</td><td>{d.medicalClearance?<Badge cls="b-green">Cleared</Badge>:<Badge cls="b-red">Hold</Badge>}</td></tr>);
        })}
      </tbody></table></div></div>
    </div>
  );
  return(
    <div className="main">
      <div className="tabs">{[["dashboard","🏥 Dashboard"],["inventory","🩸 Inventory"],["request","📋 Request Blood"],["capacity","🎯 Capacity"],["donors","👥 Donors"]].map(([k,l])=><button key={k} className={`tab ${tab===k?"on":""}`} onClick={()=>setTab(k)}>{l}</button>)}</div>
      {{dashboard:dash,inventory:inventoryTab,request:requestTab,capacity:<BloodCapacitySettings db={db} hospitalId={user.hospitalId} refresh={refresh}/>,donors:donorsTab}[tab]}
    </div>
  );
}
function DonorPortal({db,refresh,user}){
  const donor=db.donors.find(d=>d.userId===user.id);
  const elig=checkEligibility(donor?.lastDonation);
  const myPledge=(db.organDonors||[]).find(od=>od.donorId===user.id||od.donorId===donor?.id);
  const [showForm,setShowForm]=useState(false);
  const [oForm,setOForm]=useState({organs:[],notes:""});
  const [saving,setSaving]=useState(false);
  const toggle=o=>setOForm(p=>({...p,organs:p.organs.includes(o)?p.organs.filter(x=>x!==o):[...p.organs,o]}));
  const pledge=async()=>{
    if(oForm.organs.length===0||!donor||saving)return;
    setSaving(true);
    try{
      await apiClient.createOrganDonor({
        donorId:donor.id,name:donor.name,bloodType:donor.bloodType,phone:donor.phone,
        organs:oForm.organs,notes:oForm.notes||null,
      });
      await refresh();setShowForm(false);
    }catch(e){alert(e.message||"Failed to register organ pledge.");}
    setSaving(false);
  };
  const [dTab,setDTab]=useState("profile");
  return(
    <div className="main">
      <div className="tabs">{[["profile","🩸 My Profile"],["schedule","📅 Schedule"]].map(([k,l])=><button key={k} className={`tab ${dTab===k?"on":""}`} onClick={()=>setDTab(k)}>{l}</button>)}</div>
      {dTab==="schedule"&&<DonationScheduler db={db} refresh={refresh} user={user} donor={donor}/>}
      {dTab==="profile"&&<div>
      <div style={{marginBottom:20}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:"var(--navy)",marginBottom:4}}>Welcome, {user.name}</div><div style={{fontSize:13,color:"var(--slate)"}}>Your donor portal — every donation saves up to 3 lives</div></div>
      <div className="g2" style={{marginBottom:16}}>
        <div className="card"><div className="card-t">🩸 My Donor Profile</div>
          {donor?(<div>
            <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:16,padding:14,background:"var(--g50)",borderRadius:10}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:BT_COLORS[donor.bloodType]||"var(--red)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:20,color:"white",flexShrink:0}}>{donor.bloodType}</div>
              <div><div style={{fontWeight:700,fontSize:16}}>{donor.name}</div><div style={{fontSize:12,color:"var(--slate)"}}>{donor.phone} · {donor.address||"Location not set"}</div></div>
            </div>
            {[["Blood Type",donor.bloodType],["Date of Birth",donor.dob||"Not set"],["Last Donation",donor.lastDonation||"Never donated"],["Medical Clearance",donor.medicalClearance?"✓ Cleared":"On Hold"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--g100)",fontSize:13}}><span style={{color:"var(--slate)"}}>{k}</span><span style={{fontWeight:600}}>{v}</span></div>)}
            <div style={{marginTop:16,padding:14,background:donor.medicalClearance&&elig.eligible?"var(--green-bg)":"var(--amber-bg)",borderRadius:10,border:`1px solid ${donor.medicalClearance&&elig.eligible?"#99f6e4":"#fcd34d"}`}}>
              <div style={{fontWeight:700,fontSize:14,color:donor.medicalClearance&&elig.eligible?"var(--green)":"var(--amber)",marginBottom:4}}>{donor.medicalClearance&&elig.eligible?"✓ You are eligible to donate today!":"⏳ Medical review pending"}</div>
              <div style={{fontSize:13,color:"var(--g600)"}}>{donor.medicalClearance&&elig.eligible?`${elig.daysPassed} days since last donation. Thank you!`:donor.medicalClearance?`${elig.daysLeft} days remaining (56-day safety rule).`:"Please visit the hospital for screening tests. Status remains On Hold until medical clearance is approved."}</div>
            </div>
          </div>):<div className="alert a-amber">Your donor profile is pending admin linkage.</div>}
        </div>
        <div className="card"><div className="card-t">🫀 Organ Donor Status</div>
          {myPledge?(<div><div className="alert a-purple">✅ You are a registered organ donor. Thank you for your pledge.</div><div style={{fontWeight:600,marginBottom:10}}>Pledged organs:</div><div className="organ-chips" style={{marginBottom:12}}>{myPledge.organs.map(o=><span key={o} className="organ-chip">{o}</span>)}</div><div style={{fontSize:12,color:"var(--slate)"}}>Registered: {myPledge.registeredAt}</div></div>)
          :(<div><div style={{textAlign:"center",padding:"16px 0 8px"}}><div style={{fontSize:44,marginBottom:8}}>🫀</div><div style={{fontSize:16,fontWeight:700,color:"var(--navy)",marginBottom:6}}>Become an Organ Donor</div><div style={{fontSize:13,color:"var(--slate)",lineHeight:1.7,marginBottom:16}}>One organ donor can save up to 8 lives. Pledge your organs and give the gift of life.</div></div>
            {!showForm?<button className="btn btn-red btn-full" onClick={()=>setShowForm(true)}>🫀 Register as Organ Donor</button>
            :<div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{ORGANS.map(o=><button key={o} type="button" onClick={()=>toggle(o)} className={`btn btn-sm ${oForm.organs.includes(o)?"btn-purple":"btn-ghost"}`}>{o}</button>)}</div><div className="fgrp"><label className="flbl">Notes</label><input className="finp" value={oForm.notes} onChange={e=>setOForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. No prior surgeries"/></div><div style={{display:"flex",gap:8}}><button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-red" style={{flex:2,justifyContent:"center"}} onClick={pledge} disabled={oForm.organs.length===0||saving}>{saving?"Saving…":"Confirm Pledge"}</button></div></div>}
          </div>)}
        </div>
      </div>
      <div className="card" style={{marginBottom:16}}><div className="card-t">📊 Why Donate?</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
          {[["🩸","Blood Donation","Save up to 3 lives per donation"],["🫀","Organ Donation","Save up to 8 lives as organ donor"],["❤️","Regular Donor","56-day intervals for full recovery"],["🏥","Network Need",`${db.requests.filter(r=>r.status==="Pending").length} active requests now`]].map(([icon,t,d])=><div key={t} style={{padding:14,borderRadius:16,background:"var(--g50)",border:"1px solid var(--g200)",textAlign:"center"}}><div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{fontWeight:700,fontSize:13,color:"var(--navy)",marginBottom:4}}>{t}</div><div style={{fontSize:11,color:"var(--slate)"}}>{d}</div></div>)}
        </div>
      </div>
      <AIAssistant db={db} user={user} donorBloodType={donor?.bloodType}/>
    </div>}
    </div>
  );
}
// ─────────────────────────────────────────────
// DONATION SCHEDULER
// ─────────────────────────────────────────────
function DonationScheduler({db, refresh, user, donor}){
  const appointments = (db.appointments || []).filter(a => a.userId === user.id);
  const [form, setForm] = useState({date:"", hospital:"", type:"Blood", notes:""});
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(p=>({...p, [k]: e.target.value}));
  const elig = checkEligibility(donor?.lastDonation);
  const book = async () => {
    if(!form.date || !form.hospital || saving) return;
    setSaving(true);
    try {
      await apiClient.createAppointment({
        userId: user.id,
        hospitalId: form.hospital,
        donationType: form.type,
        appointmentDate: form.date,
        notes: form.notes || null,
      });
      await refresh();
      setMsg({type:"green", text:`✅ Appointment booked at ${db.hospitals.find(h=>h.id===form.hospital)?.name} on ${form.date}`});
      setForm({date:"", hospital:"", type:"Blood", notes:""});
      setTimeout(() => setMsg(null), 4000);
    } catch(e) {
      setMsg({type:"red", text: e.message || "Failed to book appointment."});
    }
    setSaving(false);
  };
  const cancel = async id => {
    try {
      await apiClient.cancelAppointment(id, user.id);
      await refresh();
    } catch(e) {
      alert(e.message || "Failed to cancel appointment.");
    }
  };
  const minDate = elig.eligible ? formatISODate(new Date(Date.now() + DAY_MS)) : formatISODate(new Date(Date.now() + elig.daysLeft * DAY_MS + DAY_MS));
  return (
    <div>
      <div className="sh"><div className="sh-title">📅 Donation Scheduler</div></div>
      {!elig.eligible && <div className="alert a-amber" style={{marginBottom:16}}>⏳ You become eligible to donate in <strong>{elig.daysLeft} days</strong>. You can still book a future appointment.</div>}
      {msg && <div className={`alert a-${msg.type}`} style={{marginBottom:16}}>{msg.text}</div>}
      <div className="g2" style={{alignItems:"start"}}>
        <div className="card">
          <div className="card-t">📅 Book Appointment</div>
          <div className="fgrp"><label className="flbl">Donation Type</label>
            <select className="fsel" value={form.type} onChange={set("type")}>
              <option value="Blood">🩸 Blood Donation</option>
              <option value="Platelet">🧪 Platelet Donation</option>
              <option value="Plasma">💧 Plasma Donation</option>
            </select>
          </div>
          <div className="fgrp"><label className="flbl">Preferred Hospital</label>
            <select className="fsel" value={form.hospital} onChange={set("hospital")}>
              <option value="">Select hospital…</option>
              {db.hospitals.map(h=><option key={h.id} value={h.id}>{h.name} — {h.location}</option>)}
            </select>
          </div>
          <div className="fgrp"><label className="flbl">Date</label>
            <input className="finp" type="date" min={minDate} value={form.date} onChange={set("date")}/>
          </div>
          <div className="fgrp"><label className="flbl">Notes (optional)</label>
            <input className="finp" value={form.notes} onChange={set("notes")} placeholder="Any health info or questions…"/>
          </div>
          <button className="btn btn-red btn-full" onClick={book} disabled={!form.date||!form.hospital||saving}>{saving?"Booking…":"Book Appointment"}</button>
        </div>
        <div className="card">
          <div className="card-t">📋 My Appointments ({appointments.length})</div>
          {appointments.length === 0
            ? <div style={{textAlign:"center",padding:30,color:"var(--slate)"}}><div style={{fontSize:32,marginBottom:8}}>📅</div><div>No appointments yet.</div></div>
            : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {appointments.map(a=>{
                  const hosp = db.hospitals.find(h=>h.id===a.hospitalId);
                  const isPast = new Date(a.appointmentDate) < getToday();
                  return(
                    <div key={a.id} style={{padding:14,borderRadius:16,background:isPast?"var(--g50)":"var(--green-bg)",border:`1px solid ${isPast?"var(--g200)":"#99f6e4"}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"var(--g900)",marginBottom:3}}>{a.donationType} Donation</div>
                        <div style={{fontSize:12,color:"var(--slate)"}}>📅 {a.appointmentDate} · 🏥 {hosp?.name}</div>
                        {a.notes && <div style={{fontSize:11,color:"var(--slate)",fontStyle:"italic",marginTop:3}}>"{a.notes}"</div>}
                        <div style={{marginTop:6}}><Badge cls={isPast?"b-slate":"b-green"}>{isPast?"Completed":"Scheduled"}</Badge></div>
                      </div>
                      {!isPast && <button className="btn btn-danger btn-sm" onClick={()=>cancel(a.id)}>Cancel</button>}
                    </div>
                  );
                })}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HOSPITAL BLOOD CAPACITY TARGETS
// ─────────────────────────────────────────────
function BloodCapacitySettings({db, hospitalId, refresh}) {
  const hospId = hospitalId;
  const [targets, setTargets] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next = {};
    BLOOD_TYPES.forEach(bt => {
      next[bt] = getTargetUnits(db.bloodCapacities, hospId, bt);
    });
    setTargets(next);
    setSaved(false);
  }, [db.bloodCapacities, hospId]);

  const stock = buildStockVsTarget(db, hospId);
  const hosp = db.hospitals.find(h => h.id === hospId);

  const save = async () => {
    if (!hospId || saving) return;
    setSaving(true);
    try {
      const capacities = BLOOD_TYPES.map(bt => ({
        bloodType: bt,
        targetUnits: Math.max(1, parseInt(targets[bt], 10) || DEFAULT_TARGET_UNITS),
      }));
      await apiClient.saveHospitalCapacity(hospId, capacities);
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert(e.message || "Failed to save capacity targets.");
    }
    setSaving(false);
  };

  return (
    <div className="card" style={{marginBottom:16}}>
      <div className="card-t">🎯 Blood Capacity Targets {hosp ? <span style={{fontSize:12,color:"var(--slate)",fontWeight:400,marginLeft:8}}>{hosp.name}</span> : null}</div>
      <p style={{fontSize:12,color:"var(--slate)",marginBottom:14,lineHeight:1.6}}>
        Set how many units of each blood type your hospital should keep on hand. The shortage predictor compares current stock to these targets.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {BLOOD_TYPES.map(bt => {
          const row = stock.find(s => s.bt === bt);
          const count = row?.count ?? 0;
          const target = parseInt(targets[bt], 10) || DEFAULT_TARGET_UNITS;
          const pct = target > 0 ? Math.round((count / target) * 100) : 100;
          const status = pct < 50 ? "critical" : pct < 100 ? "low" : "ok";
          return (
            <div key={bt} style={{padding:10,borderRadius:12,border:`1px solid ${status==="critical"?"#fca5a5":status==="low"?"#fcd34d":"#99f6e4"}`,background:status==="critical"?"var(--red-bg)":status==="low"?"var(--amber-bg)":"var(--green-bg)"}}>
              <div style={{fontWeight:700,color:BT_COLORS[bt],marginBottom:6}}>{bt}</div>
              <div className="fgrp" style={{marginBottom:6}}>
                <label className="flbl" style={{fontSize:10}}>Target units</label>
                <input className="finp" type="number" min="1" value={targets[bt] ?? ""} onChange={e => setTargets(p => ({...p, [bt]: e.target.value}))}/>
              </div>
              <div style={{fontSize:11,color:"var(--slate)"}}>In stock: <strong>{count}</strong> / {target}</div>
              <div style={{fontSize:10,marginTop:4,fontWeight:600,color:status==="critical"?"var(--red)":status==="low"?"var(--amber)":"var(--green)"}}>
                {pct}% of target
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-red" onClick={save} disabled={saving || !hospId}>
        {saving ? "Saving…" : saved ? "✓ Saved" : "Save capacity targets"}
      </button>
    </div>
  );
}

export default function App(){
  const [db,setDb]=useState(null);
  const [user,setUser]=useState(null);
  const [showSOS,setShowSOS]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);

  const refresh=useCallback(async()=>{
    const state=await apiClient.getState();
    setDb({...state, organDonors: state.organDonors||[], appointments: state.appointments||[], bloodCapacities: state.bloodCapacities||[]});
    return state;
  },[]);

  useEffect(()=>{
    if(getAuthToken()){
      apiClient.me()
        .then(u=>{setUser(u);return refresh();})
        .catch(e=>{setAuthToken(null);setError(e.message||"Could not connect to backend. Start Spring Boot on port 8080.");})
        .finally(()=>setLoading(false));
    }else{
      setLoading(false);
    }
  },[refresh]);

  const handleLogin=useCallback(async u=>{
    setUser(u);
    try{await refresh();}catch{}
  },[refresh]);
  const handleRegister=useCallback(async form=>{
    try{
      const u=await apiClient.registerDonor({
        name:form.name,email:form.email,password:form.password,bloodType:form.bloodType,
        phone:form.phone,dob:form.dob,address:form.address||null,lastDonation:form.lastDonation||null,
        emergencyContact:form.emergencyContact||null,
      });
      await refresh();
      setUser(u);
    }catch(e){
      alert(e.message||"Registration failed. Email may already be registered.");
    }
  },[refresh]);
  const handleLogout=useCallback(()=>{setAuthToken(null);setUser(null);setDb(null);},[]);

  if(loading&&!user)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--navy)"}}>Loading HaemoLink…</div>);
  if(!user&&!getAuthToken())return(<LoginPage onLogin={handleLogin} onRegister={handleRegister}/>);
  if(!user&&getAuthToken())return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--navy)"}}>Restoring session…</div>);
  if(!db)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}><div><div style={{fontSize:18,fontWeight:700,color:"var(--red)",marginBottom:8}}>Backend unavailable</div><div style={{color:"var(--slate)",marginBottom:16}}>{error||"Start the backend with: mvn spring-boot:run"}</div><button className="btn btn-red" onClick={()=>refresh().catch(()=>{})}>Retry</button></div></div>);

  const hosp=user.role==="hospital"?db.hospitals.find(h=>h.id===user.hospitalId):null;
  const avatarBg=user.role==="admin"?"var(--red)":user.role==="hospital"?"var(--blue)":"var(--green)";
  const initials=user.name?user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase():"U";
  const roleLabel=user.role==="admin"?"System Admin":user.role==="hospital"?hosp?.location:"Donor";
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <header className="hdr">
        <div className="hdr-logo"><div className="hdr-logomark">H</div><div><div className="hdr-name">HaemoLink</div><div className="hdr-tag">Emergency Blood Grid</div></div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}><div className="pulse"/><span style={{fontSize:11,color:"rgba(255,255,255,.45)",letterSpacing:1,textTransform:"uppercase"}}>{roleLabel}</span></div>
        <div className="hdr-user" onClick={handleLogout} title="Click to sign out"><div className="avatar" style={{background:avatarBg,color:"white"}}>{initials}</div><span style={{fontSize:13,color:"rgba(255,255,255,.9)"}}>{user.name}</span><span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>↗</span></div>
      </header>
      {user.role==="admin"&&<AdminDash db={db} refresh={refresh} user={user}/>}
      {user.role==="hospital"&&<HospitalDash db={db} refresh={refresh} user={{...user,name:hosp?.name||user.name}}/>}
      {user.role==="donor"&&<DonorPortal db={db} refresh={refresh} user={user}/>}
      <button className="sos-btn" onClick={()=>setShowSOS(true)} title="Emergency SOS Blood Search"><span style={{fontSize:18}}>🚨</span><span>SOS</span></button>
      {showSOS&&<SOSModal db={db} user={user} onClose={()=>setShowSOS(false)}/>}
    </div>  );
}

