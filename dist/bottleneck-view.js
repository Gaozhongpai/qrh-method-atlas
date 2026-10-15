import {GAO_PARAMETERS as P,GAO_DIAGNOSTIC_PROBES,gaoRowAt} from './bottleneck-model.js?v=atlas-4';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=m=>m?Number(m.numerator)/Number(m.denominator):null;
const scientific=x=>Number(x)===0?'0':Number(x).toExponential(4).replace('e-','e−');
const linkList=rows=>(rows||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('');
const label={moment:'Moment / source budget',low:'Global LOW',high:'Final HIGH',detector:'Detector',geometry:'Geometry / reserves',recovery:'Recovery'};
const ui={dimension:'high',constraint:null,delta:.485000001,p:.5,dRatio:1000};
const COLORS=['#8b3e1b','#b96835','#cf915c','#dfb990','#edd6ba','#f6ead9'];
const color=gap=>COLORS[gap<2e-6?0:gap<5e-6?1:gap<1e-5?2:gap<2e-5?3:gap<5e-5?4:5];

// Position of a certified reserve on the shared log axis 1e-7 … 1e-2, as a percentage.
const logShare=n=>Math.max(4,Math.min(100,(Math.log10(n)+7)/5*100));
const firstSentence=t=>{const m=String(t||'').match(/^.*?[.!?](\s|$)/);return m?m[0].trim():String(t||'');};
const restAfterFirst=t=>String(t||'').slice(firstSentence(t).length).trim();

export function mountBottleneck(container,{record,profile,reviewed,onGate,onSelectMethod}){
  if(!profile||!reviewed||profile.sourceCommit!==record.source_commit){
    container.innerHTML=`<div class="bn-empty"><div class="eyebrow">QUANTITATIVE RESERVE AUDIT</div><h3>No reviewed reserve profile for this source.</h3><p>Dimension attribution does not measure numerical headroom. Missing reserve data is not zero slack.</p><button type="button" class="button" id="show-audited-bottleneck">Open Gao’s audited profile →</button></div>`;
    container.querySelector('button').onclick=()=>onSelectMethod('gao-affine-asymmetric-20261015');return;
  }
  const constraints=profile.constraints||[],dimensions=profile.dimensions||[];
  if(!dimensions.some(d=>d.id===ui.dimension))ui.dimension=dimensions[0]?.id||'high';
  container.innerHTML=`<div class="bn-heading"><div class="eyebrow">BOTTLENECKS · ${esc(record.theta.numerator)}/${esc(record.theta.denominator)}</div><h3>Where is the next improvement constrained?</h3><p>${esc(profile.headline||firstSentence(profile.assessment))}</p><details class="bn-more"><summary>Scope and caveats</summary>${profile.headline?`<p>${esc(profile.assessment)}</p>`:restAfterFirst(profile.assessment)?`<p>${esc(restAfterFirst(profile.assessment))}</p>`:''}<p>${esc(profile.scope)}</p><p>Improvement directions explain which inequalities change; a useful modification must also preserve the other source and recovery gates.</p></details></div><div class="bn-dimensions">${dimensions.map(d=>`<button type="button" data-bn-dimension="${esc(d.id)}" aria-pressed="${d.id===ui.dimension}" class="bn-dimension"><strong>${esc(label[d.id]||d.id)}</strong><span class="bn-state" data-state="${esc(d.status)}">${esc(d.label)}</span></button>`).join('')}</div><div class="bn-ledger"><div class="bn-ledger-heading"><h4 id="bn-ledger-title"></h4></div><p id="bn-ledger-summary" class="bn-ledger-summary"></p><div id="bn-constraint-list"></div><div id="bn-constraint-detail"></div></div><div class="bn-diagnostic"><div class="bn-diagnostic-heading"><div><div class="eyebrow">NUMERICAL DIAGNOSTIC · NOT A CERTIFICATE</div><h4>Inspect the upper HIGH row near detector transitions.</h4><p>δ ∈ [0.43, 0.50], p ∈ [0.49, 0.50] · dashed box: affine count, old count outside.</p></div><div class="bn-height"><label for="bn-height">Upper-range height d <output id="bn-d-output"></output></label><input id="bn-height" type="range" min="0" max="1000" step="1" value="${ui.dRatio}"><div class="range-labels"><span>0.795</span><span>0.7956000001</span></div></div></div><div class="bn-diagnostic-layout"><div><div id="bn-heatmap" class="bn-heatmap"></div><div class="bn-color-key"><span>Smaller reserve / tighter</span>${COLORS.map((c,i)=>`<span><i style="background:${c}"></i>${['<2','2–5','5–10','10–20','20–50','≥50'][i]}</span>`).join('')}<span>×10⁻⁶</span></div></div><div class="bn-probe-detail"><div class="bn-probe-fields"><label>Density δ<input id="bn-delta" type="number" min="0.43" max="0.5" step="0.000000001" value="${ui.delta}" aria-label="Exact diagnostic density delta"></label><label>Amplitude p<input id="bn-p" type="number" min="0.49" max="0.5" step="0.000000001" value="${ui.p}" aria-label="Exact diagnostic amplitude p"></label></div><div id="bn-point-readout" aria-live="polite"></div><div id="bn-probes" class="bn-probes"></div></div></div><details class="bn-more bn-frozen"><summary>How to read this diagnostic</summary><p>Colours are formula evaluations at cell centres; boundary points and one-sided fallback limits differ. Click the map, type exact values, or use the named probes. The four probes are comparisons, not a global search or a proof of the minimum.</p><p>Fixed to the admitted method: θ, h, κ*, ℓ, y, Λ, B and the detector region. Only d, δ and p vary, within the displayed source range. This view does not predict a new proved endpoint.</p></details></div><div class="bn-directions"><h4>Local improvement directions</h4>${(profile.directions||[]).map(d=>`<article><div><h5>${esc(d.title)}</h5>${d.formula?`<div class="formula">${esc(d.formula)}</div>`:''}<details class="bn-more"><summary>Why</summary><p>${esc(d.detail)}</p></details><div class="source-links">${linkList(d.sources)}</div></div><button type="button" data-bn-direction="${esc(d.gateId)}">Trace this gate →</button></article>`).join('')}</div>`;
  const $=s=>container.querySelector(s);
  function renderLedger(){
    const dim=dimensions.find(d=>d.id===ui.dimension),ids=new Set(dim?.constraintIds||[]),rows=constraints.filter(c=>ids.has(c.id));
    if(!rows.some(c=>c.id===ui.constraint))ui.constraint=rows[0]?.id;
    $('#bn-ledger-title').textContent=label[ui.dimension]||ui.dimension;
    $('#bn-ledger-summary').textContent=dim?.summary||'';
    $('#bn-constraint-list').innerHTML=rows.map(c=>`<button type="button" data-bn-constraint="${esc(c.id)}" aria-pressed="${c.id===ui.constraint}"><span>${esc(c.label)}</span><strong>${esc(c.margin?`${c.relation||'≥'} ${scientific(value(c.margin))}`:c.expression||'Not a fixed scalar')}</strong>${c.margin&&c.comparisonGroup==='final-row'?`<i class="bn-logbar" style="width:${logShare(value(c.margin)).toFixed(1)}%" title="Log scale 1e−7 … 1e−2"></i>`:''}</button>`).join('');
    const c=rows.find(c=>c.id===ui.constraint);
    $('#bn-constraint-detail').innerHTML=c?`<div class="bn-constraint-meta"><span>${esc(c.kind.replaceAll('-',' '))}</span><span>${esc(c.unit)}</span><span>Used by: ${esc((c.dimensions||[]).map(x=>label[x]||x).join(' · '))}</span></div>${c.formula?`<div class="formula">${esc(c.formula)}</div>`:''}<details class="bn-more"><summary>Details, domain and direction</summary><p>${esc(c.detail)}</p><p class="bn-domain"><strong>Domain:</strong> ${esc(c.domain)}</p><p class="bn-direction-note"><strong>Direction:</strong> ${esc(dim?.direction||'Inspect the coupled constraints before changing parameters.')}</p></details><div class="bn-constraint-actions"><div class="source-links">${linkList(c.sources)}</div><button type="button" id="bn-trace-constraint">Trace in proof map →</button></div>`:'<p>No separate scalar reserve has been extracted for this dimension.</p>';
    $('#bn-constraint-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{ui.constraint=b.dataset.bnConstraint;renderLedger();});
    if(c)$('#bn-trace-constraint').onclick=()=>onGate(c.gateId||dim.gateId);
  }
  container.querySelectorAll('[data-bn-dimension]').forEach(b=>b.onclick=()=>{ui.dimension=b.dataset.bnDimension;container.querySelectorAll('[data-bn-dimension]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderLedger();});
  container.querySelectorAll('[data-bn-direction]').forEach(b=>b.onclick=()=>onGate(b.dataset.bnDirection));
  renderLedger();
  function renderDiagnostic({draftId=null}={}){
    const d=P.dMin+(P.dMax-P.dMin)*ui.dRatio/1000,v=gaoRowAt(ui.delta,ui.p,d);
    $('#bn-d-output').textContent=d.toFixed(10);
    if(draftId!=='bn-delta')$('#bn-delta').value=ui.delta;
    if(draftId!=='bn-p')$('#bn-p').value=ui.p;
    $('#bn-point-readout').innerHTML=`<span class="bn-numeric-kind">POINT EVALUATION · APPROXIMATE</span><strong>${(v.margin*1e6).toFixed(4)} ×10⁻⁶</strong><p>θ − E at δ=${ui.delta.toFixed(9)}, p=${ui.p.toFixed(9)}</p><div class="bn-branch">${v.branch==='affine'?'Affine detector count':'Old-count fallback'}</div><small>∂E/∂R = ${v.sensitivityR.toFixed(6)} · ∂E/∂C = ${v.sensitivityC.toFixed(6)}<br>Partial derivatives hold other row inputs fixed.</small>`;
    $('#bn-probes').innerHTML=GAO_DIAGNOSTIC_PROBES.map((probe,i)=>{const q=gaoRowAt(probe.delta,probe.p,d);return `<button type="button" data-bn-probe="${i}" aria-pressed="${ui.delta===probe.delta&&ui.p===probe.p}"><span>${esc(probe.label)}</span><strong>≈ ${(q.margin*1e6).toFixed(3)} ×10⁻⁶</strong></button>`;}).join('');
    $('#bn-probes').querySelectorAll('button').forEach(b=>b.onclick=()=>{const q=GAO_DIAGNOSTIC_PROBES[Number(b.dataset.bnProbe)];ui.delta=q.delta;ui.p=q.p;renderDiagnostic();});
    const chart=$('#bn-heatmap'),W=Math.max(270,Math.round(chart.clientWidth)),H=330,L=55,R=16,T=27,B=45,x0=.43,x1=.5,y0=.49,y1=.5;
    const x=t=>L+(t-x0)/(x1-x0)*(W-L-R),y=t=>H-B-(t-y0)/(y1-y0)*(H-T-B),cols=70,rows=40;
    let marks='';
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const delta=x0+(i+.5)*(x1-x0)/cols,p=y0+(j+.5)*(y1-y0)/rows,q=gaoRowAt(delta,p,d);
      marks+=`<rect x="${x(x0+i*(x1-x0)/cols)}" y="${y(y0+(j+1)*(y1-y0)/rows)}" width="${(W-L-R)/cols+.12}" height="${(H-T-B)/rows+.12}" fill="${color(q.margin)}"/>`;
    }
    [.43,.445,.46,.475,.485,.5].forEach((t,i)=>{if(W<450&&[1,3].includes(i))return;marks+=`<text x="${x(t)}" y="${H-B+19}" text-anchor="middle" font-size="10" fill="#7d8e73">${t.toFixed(3)}</text>`;});
    [.49,.4925,.495,.4975,.5].forEach(t=>{marks+=`<text x="${L-8}" y="${y(t)+3}" text-anchor="end" font-size="10" fill="#7d8e73">${t.toFixed(4)}</text>`;});
    marks+=`<rect x="${x(.445)}" y="${y(.5)}" width="${x(.485)-x(.445)}" height="${y(.4975)-y(.5)}" fill="none" stroke="#496e8c" stroke-width="1.7" stroke-dasharray="5 4"/><text x="${x(.445)+7}" y="${y(.5)+15}" font-size="10" fill="#31546d" paint-order="stroke" stroke="#fff" stroke-width="3">Affine count region</text><circle cx="${x(ui.delta)}" cy="${y(ui.p)}" r="5" fill="#213d36" stroke="white" stroke-width="2"/><text x="${L}" y="13" font-size="10" fill="#71866a">Amplitude p</text><text x="${(W+L-R)/2}" y="${H-7}" text-anchor="middle" font-size="10" fill="#71866a">Density δ</text>`;
    chart.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Numerical upper HIGH row reserve in the density and amplitude zoom, with affine detector region outlined">${marks}</svg><div class="bn-tooltip" hidden></div>`;
    const position=event=>{const graphic=chart.querySelector('svg'),pt=graphic.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;const q=pt.matrixTransform(graphic.getScreenCTM().inverse());if(q.x<L||q.x>W-R||q.y<T||q.y>H-B)return null;return {delta:x0+(q.x-L)/(W-L-R)*(x1-x0),p:y0+(H-B-q.y)/(H-T-B)*(y1-y0)};};
    chart.onclick=event=>{const q=position(event);if(!q)return;ui.delta=Number(q.delta.toFixed(9));ui.p=Number(q.p.toFixed(9));renderDiagnostic();};
    chart.onpointermove=event=>{const q=position(event),tip=chart.querySelector('.bn-tooltip');if(!q){tip.hidden=true;return;}const point=gaoRowAt(q.delta,q.p,d);tip.hidden=false;tip.textContent=`δ ${q.delta.toFixed(6)} · p ${q.p.toFixed(6)} · ${(point.margin*1e6).toFixed(3)} ×10⁻⁶ · ${point.branch==='affine'?'affine':'fallback'}`;const box=chart.getBoundingClientRect();tip.style.left=Math.max(0,Math.min(box.width-tip.offsetWidth,event.clientX-box.left+10))+'px';tip.style.top=Math.max(0,event.clientY-box.top-40)+'px';};
    chart.onpointerleave=()=>{chart.querySelector('.bn-tooltip').hidden=true;};
  }
  $('#bn-height').oninput=e=>{ui.dRatio=Number(e.target.value);renderDiagnostic();};
  for(const [id,key,min,max] of [['bn-delta','delta',.43,.5],['bn-p','p',.49,.5]]){
    const commit=e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))ui[key]=Math.min(max,Math.max(min,n));renderDiagnostic();};
    $('#'+id).onchange=commit;
    $('#'+id).oninput=e=>{if(e.target.value!==''&&e.target.validity.valid){ui[key]=e.target.valueAsNumber;renderDiagnostic({draftId:id});}};
  }
  renderDiagnostic();
  return renderDiagnostic;
}
