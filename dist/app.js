const TRACKER = 'https://gtimg.github.io/QuasiRiemannTracker/';
const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg = (content, viewBox, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${esc(label)}">${content}</svg>`;
const text = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${esc(value)}</text>`;
const palette = {a:'#287a72', b:'#c86b44', ink:'#244238', muted:'#879481', grid:'#e3eadd'};
const state = {a:'openai-baseline', b:null, pending:false, dimension:null, gate:'detector', query:'', view:'matrix', fullRange:false};
let catalogue, evidence, proof, reviewed = null, syncStatus = null;
let allRecords = [], records = [], byId = new Map();
const shortLabels = {moment:'Moments',low:'LOW',high:'HIGH',detector:'Detector',geometry:'Geometry',recovery:'Recovery',verification:'Check'};
const statusText = {changed:'New',reused:'Use',retuned:'Tune',foundation:'Base',unknown:'—',verified:'✓',pending:'Wait',inherited:'Kept'};
const statusFull = {changed:'Changed estimate or construction',reused:'New use / reused ingredient',retuned:'Parameter or reserve retuning',foundation:'Framework foundation',unknown:'Distinct change not extracted',verified:'Framework verified',pending:'Pending verification',inherited:'Inherited'};

export function compareRational(a,b){
  const difference = BigInt(a.numerator)*BigInt(b.denominator)-BigInt(b.numerator)*BigInt(a.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
const theta = r => Number(r.theta.numerator)/Number(r.theta.denominator);
const gain = r => (.875-theta(r))*1e6;
const decimal = r => theta(r).toFixed(10).replace(/0+$/,'').replace(/\.$/,'');
const exact = r => `${r.theta.numerator}/${r.theta.denominator}`;
const ordered = value => Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
function isReviewed(r){
  if(r.status!=='framework-verified')return !!r.dimensions;
  const entry=reviewed?.reviewed?.[r.id];
  if(!entry)return !reviewed && !!evidence.methods[r.id];
  const fields=Object.fromEntries(reviewed.fingerprint_fields.map(key=>[key,r[key]??null]));
  return JSON.stringify(ordered(fields))===JSON.stringify(ordered(entry.reviewed_fields));
}
const enrichment = r => isReviewed(r)?evidence.methods[r.id] || r:{...r,short_name:r.title,what_changed:r.method||'New catalogue entry. Component-level evidence has not yet been reviewed.',dimensions:{},parents:r.builds_on||[],metrics:[]};
const name = r => enrichment(r).short_name || r.title;
const author = r => (r.authors || []).map(a => a.name).join(', ') || 'Source catalogue';
const cell = (r,d) => d==='verification'&&r.status==='framework-verified'?{status:'verified',text:'Listed as framework-verified by the official catalogue. Inspect its receipt for exact target scope.',sources:[{label:'Catalogue / receipt',url:r.certificate_url||r.references?.[0]?.url||TRACKER+'catalogue.json'}]}:enrichment(r).dimensions?.[d] || {status:'unknown',text:isReviewed(r)?'This component has not been extracted from the cited sources.':'This method is new or its source changed. Component annotations await review.',sources:[]};
const sourceURL = value => {try {const url = new URL(value,TRACKER); return url.protocol==='https:' ? url.href : TRACKER;}catch{return TRACKER;}};
const sourceLinks = links => [...new Map((links || []).map(s => [s.url,s])).values()].slice(0,5).map(s => `<a href="${esc(sourceURL(s.url))}" target="_blank" rel="noopener">${esc(s.label || 'Source')} ↗</a>`).join('');
const gateSources = ids => (ids || []).map(id => proof.sources[id]).filter(Boolean);
const selected = () => byId.get(state.b) || records[records.length-1];
const isProposal = r => r.status !== 'framework-verified';
const extraNote = 'Comparison footprints describe documented interventions relative to each method’s own sources; they are not scores of mathematical strength.';

function rebuildRecords(){
  allRecords = [...catalogue.records,...(evidence.pending || []).filter(p=>!catalogue.records.some(r=>r.id===p.id||(p.pr&&r.pr===p.pr)))];
  byId = new Map(allRecords.map(r => [r.id,r]));
  records = allRecords.filter(r=>state.pending || !isProposal(r));
  const best = catalogue.records.filter(r=>r.status==='framework-verified').reduce((a,b)=>compareRational(a.theta,b.theta)<0?a:b);
  if(!state.b || !records.some(r=>r.id===state.b)) state.b=best.id;
  if(!records.some(r=>r.id===state.a)) state.a='openai-baseline';
  return best;
}

function renderHeader(best){
  $('#best-theta').textContent=decimal(best);
  $('#best-name').textContent=`${name(best)} · ${author(best)}`;
  $('#method-count').textContent=catalogue.records.filter(r=>r.status==='framework-verified').length;
  $('#best-gain').textContent=gain(best).toFixed(1);
  $('#snapshot-label').textContent=`Source-reported date ${catalogue.as_of}`;
  const pending=(evidence.pending || []).filter(p=>!catalogue.records.some(r=>r.id===p.id||(p.pr&&r.pr===p.pr)));
  $('#pending-note').hidden=!pending.length;
  if(pending.length) $('#pending-note').innerHTML=`<span class="mini-proposal">PENDING</span><a href="${esc(sourceURL(pending[0].sources?.[0]?.url || `https://github.com/GTimG/QuasiRiemannTracker/pull/${pending[0].pr}`))}" target="_blank" rel="noopener">${esc(decimal(pending[0]))} proposal</a><span>Official acceptance is separate.</span>`;
  $('#provenance').textContent=`Official QRH tracker · source date ${catalogue.as_of}. Last catalogue sync ${syncStatus?.fetched_at||evidence.retrieved_at||'with this snapshot'}. GitHub Pages refreshes hourly; this page also checks for updates while open. Component annotations are reviewed separately.`;
}

function renderSelects(){
  const options=records.map(r=>`<option value="${esc(r.id)}">${esc(name(r))} · ${esc(decimal(r))}${isProposal(r)?' · PENDING':''}</option>`).join('');
  $('#method-a').innerHTML=options;$('#method-b').innerHTML=options;
  $('#method-a').value=state.a;$('#method-b').value=state.b;
}

function choose(id, dimension){
  if(!byId.has(id)) return;
  if(isProposal(byId.get(id)) && !state.pending){state.pending=true;$('#show-pending').checked=true;rebuildRecords();renderSelects();}
  state.b=id;
  if(dimension)state.dimension=dimension;
  $('#method-b').value=id;
  renderComparison();
  try{history.replaceState(null,'',`?method=${encodeURIComponent(state.b)}${state.pending?'&proposals=1':''}#compare`);}catch{}
}

function renderEndpoint(){
  const W=1100,H=118,left=35,right=32,axisY=83;
  const plotted=records.filter(r=>state.fullRange || theta(r)<=.875);
  const min=state.fullRange?Math.min(...records.map(gain))-4000:0;
  const max=Math.max(160,...plotted.map(gain))+4;
  const x=g=>left+(g-min)/(max-min)*(W-left-right);
  let out='';
  const ticks=state.fullRange?[min, min/2,0,max]:[0,25,50,75,100,125,150];
  ticks.forEach(t=>{out+=`<line x1="${x(t)}" y1="19" x2="${x(t)}" y2="${axisY}" stroke="${palette.grid}" stroke-dasharray="2 4"/>${text(x(t),105,state.fullRange?Math.round(t).toLocaleString():t,`text-anchor="middle" fill="${palette.muted}" font-size="9"`)}`;});
  out+=`<line x1="${left}" y1="${axisY}" x2="${W-right}" y2="${axisY}" stroke="${palette.grid}"/>`;
  const bins=new Map();
  plotted.forEach(r=>{
    const px=x(gain(r)),bin=Math.round(px/24),layer=bins.get(bin)||0;bins.set(bin,layer+1);
    const py=66-(layer%4)*13,active=r.id===state.a||r.id===state.b,c=r.id===state.b?palette.b:r.id===state.a?palette.a:'#b7c6ad';
    out+=`<g class="endpoint-node" role="button" tabindex="0" data-method="${esc(r.id)}" aria-label="${esc(`${name(r)}, θ ${decimal(r)}, gain ${gain(r).toFixed(6)} millionths`)}"><title>${esc(`${name(r)}\nθ = ${decimal(r)}\n${exact(r)}${isProposal(r)?'\nPending proposal':''}`)}</title><line x1="${px}" y1="${py}" x2="${px}" y2="${axisY}" stroke="${c}" opacity=".5"/><circle cx="${px}" cy="${py}" r="${active?5:3.5}" fill="${isProposal(r)?'white':c}" stroke="${c}" stroke-width="${isProposal(r)?1.8:1}"/>${active?text(Math.min(W-right-5,Math.max(left+10,px)),py-10,(r.id===state.b?'B · ':'A · ')+decimal(r),`fill="${c}" font-size="9" text-anchor="${px>W-170?'end':px<120?'start':'middle'}"`):''}</g>`;
  });
  $('#endpoint-chart').innerHTML=svg(out,`0 0 ${W} ${H}`,'Verified endpoint improvements over seven eighths')+`<button id="range-toggle" class="chart-range-toggle">${state.fullRange?'Refinement zoom':'Full range · includes 2 wider baselines'}</button>`;
  $('#range-toggle').onclick=()=>{state.fullRange=!state.fullRange;renderEndpoint();};
  bindMethods($('#endpoint-chart'));
}

function bindMethods(container){
  container.querySelectorAll('[data-method]').forEach(el=>{
    el.addEventListener('click',e=>{if(e.target.closest('a'))return;choose(el.dataset.method,el.dataset.dimension);});
    el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===el){e.preventDefault();choose(el.dataset.method,el.dataset.dimension);}});
  });
}

function renderMatrix(){
  const dims=evidence.dimensions;
  $('#method-table thead').innerHTML=`<tr><th scope="col">Method <span style="font-weight:400;color:#9ba995">/ endpoint θ</span></th>${dims.map(d=>`<th scope="col" class="${state.dimension===d.id?'cell-focused':''}"><button data-dimension="${esc(d.id)}" aria-pressed="${state.dimension===d.id}" title="${esc(d.description)}">${esc(shortLabels[d.id])}</button></th>`).join('')}</tr>`;
  const query=state.query.trim().toLowerCase();
  const filtered=records.filter(r=>(name(r)+' '+r.title+' '+author(r)+' '+decimal(r)+' '+(enrichment(r).what_changed||r.method||'')).toLowerCase().includes(query));
  $('#method-table tbody').innerHTML=filtered.length?filtered.map(r=>`<tr data-method="${esc(r.id)}" tabindex="0" role="row" aria-label="Inspect ${esc(name(r))}" class="${r.id===state.a?'selected-a ':''}${r.id===state.b?'selected-b':''}"><td><div class="method-title">${r.id===state.a?'<i class="method-dot a"></i>':''}${r.id===state.b?'<i class="method-dot b"></i>':''}${esc(name(r))}${isProposal(r)?'<span class="mini-proposal">PROPOSAL</span>':''}</div><div class="method-meta"><span class="theta">${esc(decimal(r))}</span><span>${esc(author(r)).slice(0,38)}</span></div></td>${dims.map(d=>{const c=cell(r,d.id);return `<td class="${state.dimension===d.id?'cell-focused':''}"><button class="cell-badge ${esc(c.status)}" data-method="${esc(r.id)}" data-dimension="${esc(d.id)}" aria-label="${esc(`${name(r)} — ${d.label}: ${statusFull[c.status] || c.status}. ${c.text}`)}" title="${esc(`${statusFull[c.status] || c.status}: ${c.text}`)}">${esc(statusText[c.status]||c.status)}</button></td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="8"><div class="empty-message">No methods match “${esc(state.query)}”. Try an author or endpoint.</div></td></tr>`;
  $('#matrix-count').textContent=`${filtered.length} of ${records.length} methods · ${state.pending?'proposals included':'verified catalogue only'}`;
  $('#clear-dimension').hidden=!state.dimension;
  $('#method-table thead').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.dimension=state.dimension===b.dataset.dimension?null:b.dataset.dimension;renderComparison();});
  // Row and cell handlers are separate so a cell's dimension is not overwritten by bubbling.
  $('#method-table tbody').querySelectorAll('tr[data-method]').forEach(row=>{
    row.onclick=e=>{const b=e.target.closest('button[data-dimension]');choose(row.dataset.method,b?.dataset.dimension);};
    row.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===row){e.preventDefault();choose(row.dataset.method);}};
  });
}

function renderRadar(){
  const dims=evidence.dimensions.filter(d=>d.id!=='verification'),N=dims.length,cx=150,cy=131,R=83;
  const point=(i,r)=>[cx+Math.sin(i*2*Math.PI/N)*R*r,cy-Math.cos(i*2*Math.PI/N)*R*r];
  const pts=values=>values.map((r,i)=>point(i,r).join(',')).join(' ');
  let out='';
  [.3,.65,1].forEach(radius=>out+=`<polygon points="${pts(Array(N).fill(radius))}" fill="${radius===1?'#f7f9f4':'none'}" stroke="${palette.grid}" stroke-dasharray="${radius===.65?'2 4':'none'}"/>`);
  dims.forEach((d,i)=>{const [x,y]=point(i,1),[lx,ly]=point(i,1.24);out+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${palette.grid}"/>${text(lx,ly+3,shortLabels[d.id],`fill="${palette.muted}" font-size="9" text-anchor="${i===0||i===N/2?'middle':i<N/2?'start':'end'}"`)}`;});
  [state.a,state.b].forEach((id,index)=>{
    const record=byId.get(id);if(!record)return;
    const color=index?palette.b:palette.a;
    const values=dims.map(d=>{const s=cell(record,d.id).status;return s==='unknown'?null:['changed','retuned'].includes(s)?1:s==='reused'?.65:.3;});
    const known=values.every(v=>v!==null);
    if(known) out+=`<polygon points="${pts(values)}" fill="${color}" fill-opacity=".045" stroke="${color}" stroke-width="1.5"/>`;
    values.forEach((value,i)=>{
      const [x,y]=point(i,value??.64),next=values[(i+1)%N];
      if(!known&&value!==null&&next!==null){const [nx,ny]=point((i+1)%N,next);out+=`<line x1="${x}" y1="${y}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="1.5"/>`;}
      if(value===null)out+=text(x+(index?4:-4),y+(index?6:-4),'?',`text-anchor="middle" fill="${color}" font-size="11"`);
      else out+=`<circle cx="${x}" cy="${y}" r="${index?3:2.5}" fill="${index?color:'white'}" stroke="${color}" stroke-width="1.3"><title>${esc(name(record)+': '+dims[i].label+' — '+statusFull[cell(record,dims[i].id).status])}</title></circle>`;
    });
  });
  $('#radar-chart').innerHTML=svg(out,'0 0 300 265','Categorical method footprint: intervention versus inherited context; unknown dimensions omitted');
  $('#radar-legend').innerHTML=[state.a,state.b].map((id,i)=>`<div><i class="method-dot ${i?'b':'a'}"></i><span>${i?'B':'A'} · ${esc(name(byId.get(id)))}</span></div>`).join('');
}

function renderDetail(){
  const r=selected(),e=enrichment(r),d=state.dimension || ['high','moment','detector','geometry'].find(id=>['changed','reused','retuned'].includes(cell(r,id).status)) || 'verification';
  const dimension=evidence.dimensions.find(x=>x.id===d),c=cell(r,d);
  const metrics=(e.metrics||[]).filter(m=>!state.dimension||m.dimension===state.dimension).slice(0,3);
  const verified=r.status==='framework-verified';
  const proofChange=isReviewed(r)?proof.perMethod[r.id]?.changes?.filter(x=>gateDimension(x.nodeId)===d) || []:[];
  const links=[...(c.sources||[]),...(e.sources||[]),...(r.references||[])];
  $('#method-detail').innerHTML=`<div><div class="eyebrow">SELECTED METHOD B · ${verified?'CATALOGUE VERIFIED':'PENDING PROPOSAL'}</div><div class="detail-title"><h3>${esc(name(r))}</h3></div><div class="detail-boundary">θ = ${esc(decimal(r))} <span style="font-size:9px;color:#97a18d">· ${esc(exact(r))}</span></div><div class="detail-summary">${esc(e.what_changed||r.method||r.title)}</div><div class="source-links">${sourceLinks(links)}</div>${r.exact_bound?`<div class="small-copy" style="margin-top:10px">Source exact boundary: ${esc(r.exact_bound)}. The rational coordinate is the catalogue’s certified rendering value.</div>`:''}</div><div class="detail-right"><h4>${esc(dimension.label)} <span class="cell-badge ${esc(c.status)}" style="margin-left:7px">${esc(statusText[c.status]||c.status)}</span></h4><p class="dimension-explanation">${esc(c.text)}</p><a class="inline-help" href="#dimension-${esc(d)}">What does this dimension mean? ↗</a>${proofChange.map(p=>`<p class="small-copy" style="margin-top:9px">${esc(p.detail)}</p>`).join('')}<div class="metric-list">${metrics.map(m=>`<div class="metric"><span>${esc(m.label)}</span><span class="value">${esc(m.value)}</span><small>${esc(m.scope||'')}</small></div>`).join('')}</div>${d==='verification'?`<p class="small-copy" style="margin-top:12px">${esc(r.verification_note||e.source_status_note||'Inspect the linked receipt for the exact target family, statement, source commit and kernel checks.')}</p>`:''}</div>`;
}

function renderLineage(){
  const r=selected(),e=enrichment(r),parents=(e.parents||r.builds_on||[]).map(id=>byId.get(id)).filter(Boolean);
  const children=allRecords.filter(c=>(enrichment(c).parents||c.builds_on||[]).includes(r.id));
  const card=(c,current=false)=>`<button class="lineage-card ${current?'current':''}" data-method="${esc(c.id)}">${esc(name(c))}<small>θ ${esc(decimal(c))}${isProposal(c)?' · pending':''}</small></button>`;
  $('#lineage-view').innerHTML=`<div class="eyebrow" style="margin-bottom:22px">DECLARED PROOF DEPENDENCIES</div><div class="lineage-columns"><div class="lineage-col"><h4>Inputs / predecessors</h4>${parents.length?parents.map(p=>card(p)).join(''):'<p class="small-copy">No predecessor extracted.</p>'}</div><div class="lineage-arrow" aria-hidden="true">→</div><div class="lineage-col"><h4>Selected method</h4>${card(r,true)}</div><div class="lineage-arrow" aria-hidden="true">→</div><div class="lineage-col"><h4>Used by</h4>${children.length?children.map(c=>card(c)).join(''):'<p class="small-copy">No downstream method in this snapshot.</p>'}</div></div><p class="lineage-note">Edges come from the catalogue’s <code>builds_on</code> field or an explicitly cited predecessor. A later endpoint is not automatically a direct dependency. Clicking a proposal enables the proposal view.</p><div class="source-links">${sourceLinks((e.parent_edges||[]).flatMap(p=>p.sources||[]))}</div>`;
  bindMethods($('#lineage-view'));
}

const gateDimension=id=>({inverse:'moment',plain:'moment',amplitude:'detector',detector:'detector',low:'low',high:'high',principal:'geometry',geometry:'geometry',recovery:'recovery'})[id]||'geometry';
function gateChange(nodeId){return isReviewed(selected())?proof.perMethod[selected().id]?.changes?.find(c=>c.nodeId===nodeId):undefined;}
const conciseNode={inverse:'Inverse moment',plain:'Plain + prime moment',amplitude:'Prime amplitude',detector:'Witness → row count',low:'LOW contribution',high:'HIGH numerator',principal:'Principal + other gates',geometry:'Geometry + endpoint',recovery:'Recovery + verification'};
function renderProofMap(){
  const lanes=[['Analytic inputs',['inverse','plain','amplitude']],['Estimate consumers',['detector','low','high']],['Global compatibility',['principal','geometry']],['The full theorem',['recovery']]];
  $('#proof-map').innerHTML=`<svg aria-hidden="true"><defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#c3d1bc" stroke-width="1"/></marker></defs><g id="proof-edges"></g></svg>`+lanes.map(([title,ids],i)=>`<div class="proof-lane"><span class="lane-label">${i+1}. ${esc(title.toUpperCase())}</span>${ids.map(id=>{const node=proof.nodes.find(n=>n.id===id),change=gateChange(id);return `<button class="proof-node ${state.gate===id?'active ':''}${change?'contribution':''}" data-gate="${id}" aria-pressed="${state.gate===id}"><strong>${esc(conciseNode[id]||node.label)}</strong><span>${esc(node.description.split('.')[0]).slice(0,72)}</span>${change?`<span class="node-tag">${esc(change.kind.replaceAll('-',' '))}</span>`:''}</button>`;}).join('')}${i===3?`<div class="endpoint-gate"><span>${isProposal(selected())?'PROPOSED ENDPOINT':'CATALOGUE ENDPOINT'}</span><strong>${esc(decimal(selected()))}</strong></div>`:''}</div>`).join('');
  $('#proof-map').querySelectorAll('[data-gate]').forEach(b=>b.onclick=()=>{state.gate=b.dataset.gate;state.dimension=gateDimension(state.gate);renderComparison();});
  $('#graph-subtitle').textContent=`${name(selected())}: highlighted gates have a specifically documented contribution. Click a gate for its domain and checks.`;
  requestAnimationFrame(drawProofEdges);
  renderGateDetail();
}
function drawProofEdges(){
  const container=$('#proof-map'),group=$('#proof-edges');if(!group)return;
  const box=container.getBoundingClientRect(),small=innerWidth<=640;
  group.innerHTML=proof.edges.map(edge=>{
    const a=container.querySelector(`[data-gate="${edge.from}"]`),b=container.querySelector(`[data-gate="${edge.to}"]`);if(!a||!b)return '';
    const p=a.getBoundingClientRect(),q=b.getBoundingClientRect();
    const x1=p.right-box.left,y1=p.top+p.height/2-box.top,x2=q.left-box.left,y2=q.top+q.height/2-box.top;
    if(small&&x2<x1) return '';
    const dx=Math.max(12,Math.abs(x2-x1)*.45);
    return `<path d="M${x1},${y1}C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}" fill="none" stroke="#d6e0cf" stroke-width="1" marker-end="url(#arrowhead)"><title>${esc(edge.label)}</title></path>`;
  }).join('');
}
function readableFormula(f){
  const known={
    'inverse-marked':'r + 2z ≤ 1 − c₁;   2r + 8z ≤ 3 − c₂',
    'inverse-long':'eᵢ(r) = max{1, (1 + 5r)/6}',
    'plain-capacity':'n₁ + n₂ + 6κz ≤ M  ⇒  energy ≲ Zᴹ⁺ᵋ Hⱼ',
    'cycle61-affine':'n₁ + n₂ + Λz ≤ B; Λ = 19312/4787; B = 14200/14361 − 10⁻⁵',
    'prime-amplitude':'0 ≤ gᵢ ≤ δ/2;   q = δp;   0 ≤ p ≤ 1/2',
    'slot-selection':'∏ᵢ∈ᴵ |Qᵤ,ᵢ|² ≥ U^(2qz − δ maxᵢ zᵢ − o(1))',
    'witness-lines':'Aᵢ = 1 − q − (δ − q)r;   Aₚ = 1 − q/(3κ) − 2(δ − q/(3κ))m',
    'cycle25-count':'Cκ(p) = 2(1−p)(1−p/(3κ)) / (3−p−2p/(3κ));   Rκ = 1−δ + δCκ(5/6−δ) / [2(5/6−δ+δCκ)]',
    'detector-affine-capacity':'zₚ: (1 − 2m)/(6κ)  →  (B − 2m)/Λ',
    'low-subsets':'−v + max(5ℓ − 1 + v, 0)/8 ≤ 0  (0 ≤ v ≤ ℓ ≤ 1/5)',
    'gex-low':'ℓ = 1/6 + p  ⇒  E_LOW = 3/16 − p/4',
    'weighted-numerator':'Σᵤ |Nᵤ| ≲ Y⁻¹ᐟ² Z^[ℓ(z₀−1/2)+ℓq] U^[1/4+3R/4−qzₐ/2+ε] Hⱼ',
    'cycle61-source-capacity':'zₐ(t) = (B − 2n)/Λ;   n = 1 − y/d + t',
    'saturated-geometry':'x + y = 1 − ℓ;   h = 1 + ℓ − x;   b = y − x;   C(s) = s − (4 + b)/6',
    'geometry-crossing':'θ = 11/12 − ℓ/4',
    'cycle25-quartic':'927ℓ⁴ − 3135ℓ³ + 2433ℓ² + 275ℓ − 100 = 0;   1/6 ≤ ℓ ≤ 1/5',
  };
  return known[f.id] || f.tex.replaceAll('\\','');
}
function renderGateDetail(){
  const node=proof.nodes.find(n=>n.id===state.gate)||proof.nodes[0],change=gateChange(node.id),r=selected();
  let formulas=node.formulas || [];
  if(change?.formulaIds?.length) formulas=formulas.filter(f=>change.formulaIds.includes(f.id));
  // Display at most two representative formulas; all exact formulas remain in the evidence download.
  formulas=formulas.slice(0,2);
  const linkedSources=[...(node.sourceIds||[]),...formulas.flatMap(f=>f.sourceIds||[]),...(change?.sourceIds||[])];
  $('#gate-detail').innerHTML=`<div class="eyebrow">PROOF GATE · ${esc(shortLabels[gateDimension(node.id)])}</div><h3>${esc(node.label)}</h3><p class="gate-description">${esc(node.description)}</p>${change?`<div class="gate-notice"><strong>${esc(name(r))} · ${esc(change.kind.replaceAll('-',' '))}</strong><br>${esc(change.detail)}</div>`:`<div class="gate-notice">Representative framework contract. A method-specific change for ${esc(name(r))} has not been extracted at this gate.</div>`}${formulas.map(f=>`<div class="formula" title="${esc(f.tex)}">${esc(readableFormula(f))}</div><p class="formula-context"><strong>Domain.</strong> ${esc(f.domain)}</p><p class="formula-context" style="margin-top:7px">${esc(f.scope)}</p>`).join('')}${!formulas.length?`<p class="small-copy" style="margin-top:13px">${esc(node.formulaStatus || 'The required checks are method-specific.')}</p>`:''}<ul class="gate-checks">${node.requiredChecks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><div class="source-links">${sourceLinks(gateSources(linkedSources))}</div>`;
}

export function capacityAt(m,kappa){const Lambda=19312/4787,B=14200/14361-1/100000,affine=(B-2*m)/Lambda;return {standard:(1-2*m)/(6*kappa),affine,allowedAffine:m>=.41&&m<=.44&&affine>=.034?Math.min(.04,affine):null,Lambda,B};}
function renderCapacity(){
  const m=Number($('#plain-length').value),kappa=Number($('#kappa-value').value),v=capacityAt(m,kappa);
  $('#plain-value').textContent=`m = ${m.toFixed(5)}`;$('#kappa-display').textContent=`κ = ${kappa.toFixed(4)}`;
  $('#standard-capacity').textContent=v.standard.toFixed(6);$('#affine-capacity').textContent=v.allowedAffine===null?'Outside local gate':v.allowedAffine.toFixed(6);
  const delta=(v.allowedAffine??v.affine)-v.standard;$('#capacity-difference').textContent=`${delta>=0?'+':''}${delta.toFixed(6)}`;
  const within=v.allowedAffine!==null;
  $('#capacity-validity').textContent=!within?'No affine capacity in the required local z window at this slice.':v.affine>.04?'The raw affine boundary exceeds 0.04, so the local upper gate caps admissible capacity at 0.04.':'The affine boundary is inside its local length window at this slice. Both individual plain lengths equal m.';
  const W=650,H=330,L=60,R=28,T=26,B=49,x0=.405,x1=.445,y0=.028,y1=.047;
  const x=t=>L+(t-x0)/(x1-x0)*(W-L-R),y=t=>H-B-(t-y0)/(y1-y0)*(H-T-B);
  let out=`<defs><clipPath id="capacity-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
  out+=`<rect x="${x(.41)}" y="${y(.04)}" width="${x(.44)-x(.41)}" height="${y(.034)-y(.04)}" fill="#fdfbf7" stroke="#ebd6be" stroke-dasharray="4 4"/>`;
  const allowed=[];
  for(let i=0;i<=160;i++){const xx=.41+.03*i/160,c=capacityAt(xx,kappa);if(c.allowedAffine!==null)allowed.push([x(xx),y(c.allowedAffine)]);}
  if(allowed.length)out+=`<polygon points="${[[allowed[0][0],y(.034)],...allowed,[allowed[allowed.length-1][0],y(.034)]].map(p=>p.join(',')).join(' ')}" fill="#f5d9b9" fill-opacity=".4"/>`;
  [.03,.034,.038,.042,.046].forEach(t=>{out+=`<line x1="${L}" y1="${y(t)}" x2="${W-R}" y2="${y(t)}" stroke="${palette.grid}" stroke-dasharray="2 4"/>${text(L-10,y(t)+3,t.toFixed(3),`fill="${palette.muted}" text-anchor="end" font-size="9"`)}`;});
  [.41,.42,.43,.44].forEach(t=>{out+=`<line x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${H-B}" stroke="${palette.grid}" stroke-dasharray="2 4"/>${text(x(t),H-B+18,t.toFixed(2),`fill="${palette.muted}" text-anchor="middle" font-size="9"`)}`;});
  const standardPoints=[],affinePoints=[];
  for(let i=0;i<=150;i++){const xx=x0+(x1-x0)*i/150,c=capacityAt(xx,kappa);standardPoints.push([x(xx),y(c.standard)]);affinePoints.push([x(xx),y(c.affine)]);}
  const path=points=>points.map(([xx,yy],i)=>`${i?'L':'M'}${xx.toFixed(3)},${yy.toFixed(3)}`).join('');
  const local=affinePoints.filter((_,i)=>{const xx=x0+(x1-x0)*i/150,c=capacityAt(xx,kappa);return xx>=.41&&xx<=.44&&c.affine>=.034&&c.affine<=.04;});
  out+=`<g clip-path="url(#capacity-clip)"><path d="${path(affinePoints)}" fill="none" stroke="${palette.b}" stroke-width="1" stroke-dasharray="4 4" opacity=".4"/><path d="${path(standardPoints)}" fill="none" stroke="${palette.a}" stroke-width="2"/><path d="${path(local)}" fill="none" stroke="${palette.b}" stroke-width="2.5"/><line x1="${x(m)}" y1="${T}" x2="${x(m)}" y2="${H-B}" stroke="#98ac8f" stroke-dasharray="3 4"/><circle cx="${x(m)}" cy="${y(v.standard)}" r="4" fill="white" stroke="${palette.a}" stroke-width="2"/><circle cx="${x(m)}" cy="${y(v.allowedAffine??v.affine)}" r="4" fill="${within?palette.b:'white'}" stroke="${palette.b}" stroke-width="2"/></g>`;
  out+=text(L,T-12,'Prime length z',`fill="${palette.muted}" font-size="9"`)+text((W+L-R)/2,H-8,'Equal plain length m = n₁ = n₂',`fill="${palette.muted}" font-size="10" text-anchor="middle"`);
  out+=text(x(.412),y(.0394),'LOCAL LENGTH WINDOW',`fill="#bc956b" font-size="8" letter-spacing="1"`);
  $('#capacity-chart').innerHTML=svg(out,`0 0 ${W} ${H}`,'Admissible prime length against equal plain length, including the local affine domain');
}

function renderComparison(){renderMatrix();renderRadar();renderDetail();renderLineage();renderProofMap();renderEndpoint();}
function notice(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,6500);}
function download(file,contents,type){const u=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=u;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function exportCSV(){
  const dimensions=evidence.dimensions;
  const rows=[['Method','Author','Status','Theta numerator','Theta denominator','Decimal coordinate',...dimensions.flatMap(d=>[d.label+' state',d.label+' evidence'])]];
  records.forEach(r=>rows.push([name(r),author(r),r.status,r.theta.numerator,r.theta.denominator,decimal(r),...dimensions.flatMap(d=>{const c=cell(r,d.id);return [c.status,c.text];})]));
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  download('qrh-method-comparison.csv',rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
async function refresh({silent=false}={}){
  const button=$('#refresh-data');button.disabled=true;
  try{
    const response=await fetch(TRACKER+'catalogue.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const fresh=await response.json();if(!Array.isArray(fresh.records)||!fresh.records.every(r=>r.id&&r.theta?.numerator&&r.theta?.denominator))throw new Error('Unexpected catalogue format');
    catalogue=fresh;syncStatus={...syncStatus,fetched_at:new Date().toISOString()};renderHeader(rebuildRecords());renderSelects();renderComparison();
    if(!silent)notice('Catalogue refreshed. New or changed sources show “not extracted” until their component annotations are reviewed.');
  }catch{if(!silent)notice('The live catalogue could not be reached. The included source snapshot remains available.');}
  finally{button.disabled=false;}
}
function bindControls(){
  const guide=$('#dimension-dialog'),guideScroll=guide.querySelector('.guide-scroll');
  let guideOpener=null,guideReturnHash='',guidePagePosition={x:0,y:0},restoreGuideFocus=true;
  const isGuideHash=hash=>hash==='#dimensions'||(hash.startsWith('#dimension-')&&document.getElementById(hash.slice(1))?.classList.contains('dimension-card'));
  const openGuide=(hash,trigger=null)=>{
    if(!isGuideHash(hash))return;
    if(!guide.open){
      guideOpener=trigger||document.activeElement;
      guideReturnHash=isGuideHash(location.hash)?'#compare':location.hash;
      guidePagePosition={x:scrollX,y:scrollY};restoreGuideFocus=true;
      document.documentElement.classList.add('guide-open');guide.showModal();
      $('#guide-close').focus({preventScroll:true});
    }
    const id=hash.startsWith('#dimension-')?hash.slice('#dimension-'.length):null;
    guide.querySelectorAll('.dimension-card').forEach(card=>card.open=card.id===`dimension-${id}`);
    guide.querySelectorAll('[data-guide-card]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guideCard===id)));
    requestAnimationFrame(()=>{
      const card=id?document.getElementById(`dimension-${id}`):null;
      const top=card?card.getBoundingClientRect().top-guideScroll.getBoundingClientRect().top+guideScroll.scrollTop-12:0;
      guideScroll.scrollTo({top:Math.max(0,top),behavior:'instant'});
      const button=guide.querySelector(`[data-guide-card="${id}"]`),nav=guide.querySelector('.guide-nav');
      if(button)nav.scrollTo({left:Math.max(0,button.offsetLeft-nav.offsetLeft-16),behavior:'instant'});
    });
  };
  const closeGuide=(navigate=false)=>{restoreGuideFocus=!navigate;guide.close();};
  $('#guide-close').onclick=()=>closeGuide();
  guide.addEventListener('close',()=>{
    document.documentElement.classList.remove('guide-open');
    if(isGuideHash(location.hash))history.replaceState(null,'',location.pathname+location.search+guideReturnHash);
    if(restoreGuideFocus)requestAnimationFrame(()=>{
      window.scrollTo({left:guidePagePosition.x,top:guidePagePosition.y,behavior:'instant'});
      const opener=guideOpener?.isConnected&&guideOpener!==document.body?guideOpener:$('#open-dimension-guide');
      opener.focus({preventScroll:true});
    });
  });
  guide.addEventListener('click',event=>{
    if(event.target!==guide)return;
    const box=guide.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeGuide();
  });
  guide.querySelectorAll('[data-guide-card]').forEach(button=>button.onclick=()=>openGuide(`#dimension-${button.dataset.guideCard}`));
  guide.querySelectorAll('.dimension-card').forEach(card=>card.addEventListener('toggle',()=>{
    guide.querySelector(`[data-guide-card="${card.id.slice('dimension-'.length)}"]`).setAttribute('aria-pressed',String(card.open));
  }));
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a[href^="#"]');if(!link)return;
    if(isGuideHash(link.hash)){event.preventDefault();openGuide(link.hash,link);}
    else if(guide.open&&guide.contains(link))closeGuide(true);
  });
  addEventListener('hashchange',()=>{if(isGuideHash(location.hash))openGuide(location.hash);else if(guide.open)closeGuide(true);});
  openGuide(location.hash);
  $('#method-a').onchange=e=>{state.a=e.target.value;renderComparison();};
  $('#method-b').onchange=e=>choose(e.target.value);
  $('#show-pending').onchange=e=>{state.pending=e.target.checked;rebuildRecords();renderSelects();renderComparison();};
  $('#method-search').oninput=e=>{state.query=e.target.value;renderMatrix();};
  $('#clear-dimension').onclick=()=>{state.dimension=null;renderComparison();};
  for(const view of ['matrix','lineage'])$('#'+view+'-tab').onclick=()=>{
    state.view=view;for(const v of ['matrix','lineage']){$('#'+v+'-view').hidden=v!==view;$('#'+v+'-tab').classList.toggle('active',v===view);$('#'+v+'-tab').setAttribute('aria-pressed',String(v===view));}
  };
  $('#plain-length').oninput=renderCapacity;$('#kappa-value').oninput=renderCapacity;
  $('#export-csv').onclick=exportCSV;
  $('#export-json').onclick=()=>download('qrh-atlas-evidence.json',JSON.stringify({catalogue,evidence,proof},null,2),'application/json');
  $('#refresh-data').onclick=refresh;
  addEventListener('resize',drawProofEdges);
}

async function init(){
  try{
    [catalogue,evidence,proof]=await Promise.all(['catalogue','method-evidence','proof-dimensions'].map(async file=>{const r=await fetch(`data/${file}.json`);if(!r.ok)throw new Error(`Missing ${file}`);return r.json();}));
    [reviewed,syncStatus]=await Promise.all(['reviewed-sources','sync-status'].map(async file=>{try{const r=await fetch(`data/${file}.json`);return r.ok?await r.json():null;}catch{return null;}}));
    const params=new URLSearchParams(location.search);state.pending=params.get('proposals')==='1';state.b=params.get('method');$('#show-pending').checked=state.pending;
    renderHeader(rebuildRecords());renderSelects();bindControls();renderComparison();renderCapacity();
    document.documentElement.dataset.ready='true';
    window.qrhAtlas={state,capacityAt,compareRational,get records(){return records;},get catalogue(){return catalogue;}};
    refresh({silent:true});
    setInterval(()=>{if(document.visibilityState==='visible')refresh({silent:true});},300000);
  }catch(error){$('#snapshot-label').textContent='Source data could not be loaded.';notice('Unable to load the atlas source data. Please reload the page.');console.error(error);}
}
init();
