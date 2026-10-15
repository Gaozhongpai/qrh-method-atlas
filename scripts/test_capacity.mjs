import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityAt,capacityPoint,CAPACITY_EXAMPLE as c} from '../dist/capacity-model.js';

test('default test point distinguishes the two length inequalities',()=>{
  const p=capacityPoint(.41825,.75,.0375);
  assert.equal(p.standardFits,false);
  assert.equal(p.affineFits,true);
  assert.ok(Math.abs(p.standard-.0363333333333333)<1e-12);
  // Independently reduced rational at m=1673/4000.
  assert.ok(Math.abs(p.allowedAffine-218687989/5793600000)<1e-12);
});
test('changing κ changes the standard premise and leaves the affine gate fixed',()=>{
  const p=capacityPoint(.41825,.7,.0375),q=capacityPoint(.41825,.75,.0375);
  assert.equal(p.standardFits,true);
  assert.equal(p.betaPremise,.85);
  assert.equal(q.betaPremise,.875);
  assert.equal(p.allowedAffine,q.allowedAffine);
});
test('a raw affine boundary above the local box is capped at z=.04',()=>{
  assert.ok(capacityAt(.41,.75).affine>.04);
  assert.equal(capacityAt(.41,.75).allowedAffine,.04);
  const p=capacityPoint(.41,.7,.041);
  assert.equal(p.standardFits,true);
  assert.equal(p.affineInequality,true);
  assert.equal(p.affineWindow,false);
  assert.equal(p.affineFits,false);
});
test('no local capacity is returned when the raw boundary falls below z=.034',()=>{
  const p=capacityPoint(.426,.75,.034);
  assert.equal(p.allowedAffine,null);
  assert.equal(p.affineWindow,true);
  assert.equal(p.affineFits,false);
  assert.equal(capacityAt(.44,.75).allowedAffine,null);
});
test('the plain-length window is enforced independently of the inequality',()=>{
  const p=capacityPoint(.405,.75,.036);
  assert.equal(p.affineInequality,true);
  assert.equal(p.affineWindow,false);
  assert.equal(p.allowedAffine,null);
});
test('inclusive local endpoints are computed before rounding',()=>{
  const capStart=(c.B-c.Lambda*.04)/2,capEnd=(c.B-c.Lambda*.034)/2;
  assert.equal(capacityAt(capStart,.75).allowedAffine,.04);
  assert.ok(Math.abs(capacityAt(capEnd,.75).allowedAffine-.034)<1e-12);
  assert.equal(capacityPoint(capEnd,.75,.034).affineFits,true);
  assert.equal(capacityAt(capEnd+1e-7,.75).allowedAffine,null);
  const raw=capacityAt(.41825,.75).affine;
  assert.equal(capacityPoint(.41825,.75,raw).affineFits,true);
  assert.equal(capacityPoint(.41825,.75,raw+1e-7).affineFits,false);
});
test('nonfinite inputs and nonpositive κ cannot produce plotted capacities',()=>{
  assert.throws(()=>capacityAt(NaN,.75),RangeError);
  assert.throws(()=>capacityAt(.42,0),RangeError);
  assert.throws(()=>capacityPoint(.42,.75,Infinity),RangeError);
});
