// Exploratory evaluations of the complete upper-range row in Gao's 15 Oct paper.
// This module does not certify a supremum or establish a new endpoint.
// Paper, Sections 3–4: https://github.com/GTimG/QuasiRiemannTracker/pull/60
// Verified source: https://github.com/GTimG/QuasiRiemannTracker/tree/3874f3e75de18ff5806dcb9519fc260e034ef0e9/submissions/gao-affine-asymmetric-20261015/src/Candidate
export const GAO_PARAMETERS=Object.freeze({
  theta:21871/25000,
  h:1989/2500,
  dMin:159/200,
  dMax:7956000001/10000000000,
  kappa:9371/12500,
  ell:3137/18750,
  x:13939/37500,
  y:17287/37500,
  Lambda:19312/4787,
  B:142100527/143610000,
});

export const GAO_DIAGNOSTIC_PROBES=Object.freeze([
  Object.freeze({label:'Affine interior',delta:.46617291,p:.5}),
  // The rectangle is closed: this old branch lies just outside its upper edge.
  Object.freeze({label:'Upper-density fallback',delta:.485000001,p:.5}),
  Object.freeze({label:'Lower-density fallback',delta:.444999999,p:.5}),
  Object.freeze({label:'Lower-amplitude fallback',delta:.46414029,p:.497499999}),
]);

export function gaoRowAt(delta,p,d=GAO_PARAMETERS.dMax){
  const {theta,h,dMin,dMax,kappa,ell,y,Lambda,B}=GAO_PARAMETERS;
  if(!Number.isFinite(delta)||delta<0||delta>3/4
      ||!Number.isFinite(p)||p<0||p>1/2
      ||!Number.isFinite(d)||d<dMin||d>dMax){
    throw new RangeError('Require 0 ≤ δ ≤ 3/4, 0 ≤ p ≤ 1/2, and dMin ≤ d ≤ dMax.');
  }
  const affine=delta>=89/200&&delta<=97/200&&p>=199/400;
  let R;
  if(affine){
    const D=3-p-4*p/Lambda;
    const a=2-4*p/Lambda;
    const c=1-2*p*B/Lambda;
    const J=(5/6-delta)*D+delta*(1-p)*a;
    R=1-delta+(5/6-delta)*delta*(1-p)*c/J;
  }else{
    const countC=2*(1-p)*(3*kappa-p)/(3*kappa*(3-p)-2*p);
    R=1-delta+delta*countC*(5/6-delta)/(2*(5/6-delta+delta*countC));
  }
  const C=(2*y-(2-B)*d)/Lambda;
  const exponent=(1+delta)/2+13*h/75-y/2-ell/2+ell*delta*p
    +d*(1/4+3*R/4-17/50)-delta*p*C/2;
  return {
    margin:theta-exponent,exponent,branch:affine?'affine':'old-fallback',R,C,
    // Partial derivatives of E with all other row inputs frozen.
    sensitivityR:3*d/4,
    sensitivityC:-delta*p/2,
  };
}
