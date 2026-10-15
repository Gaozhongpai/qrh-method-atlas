import test from 'node:test';
import assert from 'node:assert/strict';
import {GAO_PARAMETERS as g,GAO_DIAGNOSTIC_PROBES,gaoRowAt} from '../dist/bottleneck-model.js';

const close=(actual,expected,tolerance=2e-14)=>assert.ok(
  Math.abs(actual-expected)<tolerance,`${actual} should be within ${tolerance} of ${expected}`,
);

test('published parameters retain the paid intercept and endpoint coupling',()=>{
  assert.equal(g.theta,.874840);
  assert.equal(g.h,.7956);
  assert.equal(g.dMin,.795);
  assert.equal(g.dMax,.7956000001);
  close(g.kappa,2*g.theta-1);
  close(g.ell,11/3-4*g.theta);
  close(g.x,1+g.ell-g.h);
  close(g.y,g.h-2*g.ell);
  close(g.B,14200/14361+7/10000);
  assert.ok(Object.isFrozen(g));
});

test('affine and fallback samples agree with independent exact-rational reductions',()=>{
  // Fractions are obtained directly from the paper's rational row formula.
  const affine=gaoRowAt(47/100,1/2);
  close(affine.margin,8.142611840794787e-6);
  close(affine.R,.58957363402098);
  close(affine.C,.02925217078619175);
  assert.equal(affine.branch,'affine');
  const fallback=gaoRowAt(49/100,1/2);
  close(fallback.margin,4.469593546192345e-5);
  close(fallback.R,.5701947851272252);
  assert.equal(fallback.branch,'old-fallback');
  close(gaoRowAt(0,0).margin,38979999901/1500000000000);
});

test('all edges of the affine rectangle are closed',()=>{
  for(const delta of [89/200,97/200]){
    for(const p of [199/400,1/2])assert.equal(gaoRowAt(delta,p).branch,'affine');
  }
  close(gaoRowAt(97/200,1/2).margin,7.202727839200538e-5);
  close(gaoRowAt(89/200,199/400).margin,.00015491011242943874);
});

test('one-sided fallback limits are not mistaken for affine boundary evaluations',()=>{
  assert.equal(gaoRowAt(.445-1e-9,.5).branch,'old-fallback');
  assert.equal(gaoRowAt(.485+1e-9,.5).branch,'old-fallback');
  assert.equal(gaoRowAt(.47,.4975-1e-9).branch,'old-fallback');
  assert.equal(gaoRowAt(.47,.4975+1e-9).branch,'affine');
  const at=gaoRowAt(.485,.5),outside=gaoRowAt(.485+1e-9,.5);
  assert.ok(outside.margin>2.4e-6&&outside.margin<2.6e-6);
  assert.ok(at.margin-outside.margin>6e-5);
});

test('upper-range d endpoints are accepted and physical capacity decreases with d',()=>{
  const lower=gaoRowAt(.47,.5,g.dMin),upper=gaoRowAt(.47,.5,g.dMax);
  assert.ok(lower.C>upper.C);
  assert.ok(lower.margin>upper.margin);
  close(upper.sensitivityR,3*g.dMax/4);
  close(lower.sensitivityR,3*g.dMin/4);
});

test('reported local derivatives match independent perturbations of the row inputs',()=>{
  const delta=.47,p=.5,d=g.dMax,row=gaoRowAt(delta,p,d),eps=1e-6;
  const evaluate=(R,C)=>(1+delta)/2+13*g.h/75-g.y/2-g.ell/2+g.ell*delta*p
    +d*(1/4+3*R/4-17/50)-delta*p*C/2;
  close(row.exponent,evaluate(row.R,row.C));
  close((evaluate(row.R+eps,row.C)-evaluate(row.R-eps,row.C))/(2*eps),row.sensitivityR,2e-10);
  close((evaluate(row.R,row.C+eps)-evaluate(row.R,row.C-eps))/(2*eps),row.sensitivityC,2e-10);
  assert.ok(row.sensitivityR>0);
  assert.ok(row.sensitivityC<0);
});

test('nonfinite and out-of-domain inputs cannot produce plotted values',()=>{
  for(const [delta,p,d] of [
    [NaN,.5,g.h],[Infinity,.5,g.h],[-1e-12,.5,g.h],[.75+1e-12,.5,g.h],
    [.47,NaN,g.h],[.47,-1e-12,g.h],[.47,.5+1e-12,g.h],
    [.47,.5,Infinity],[.47,.5,g.dMin-1e-12],[.47,.5,g.dMax+1e-12],
  ])assert.throws(()=>gaoRowAt(delta,p,d),RangeError);
  assert.doesNotThrow(()=>gaoRowAt(.75,.5,g.dMax));
});

test('named probes use the intended one-sided branches without claiming maxima',()=>{
  for(const probe of GAO_DIAGNOSTIC_PROBES){
    const row=gaoRowAt(probe.delta,probe.p);
    assert.equal(row.branch,probe.label==='Affine interior'?'affine':'old-fallback');
    assert.ok(row.margin>0);
  }
});
