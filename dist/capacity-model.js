// Length gates for one worked example, not a certificate of the complete theorem.
// Sources: Cycle25 (B0.5); Cycle61 Theorem 2.2 and its fixed-width local box.
export const CAPACITY_EXAMPLE=Object.freeze({
  Lambda:19312/4787,
  B:14200/14361-1/100000,
  mMin:.41,mMax:.44,zMin:.034,zMax:.04,
});
const EPS=1e-12;

export function capacityAt(m,kappa){
  if(!Number.isFinite(m)||!Number.isFinite(kappa)||kappa<=0)throw new RangeError('Finite lengths and positive κ are required.');
  const {Lambda,B,mMin,mMax,zMin,zMax}=CAPACITY_EXAMPLE;
  const affine=(B-2*m)/Lambda;
  const inPlainWindow=m>=mMin-EPS&&m<=mMax+EPS;
  return {
    standard:(1-2*m)/(6*kappa),affine,Lambda,B,
    allowedAffine:inPlainWindow&&affine>=zMin-EPS?Math.min(zMax,Math.max(zMin,affine)):null,
    betaPremise:(1+kappa)/2,
  };
}

export function capacityPoint(m,kappa,z){
  if(!Number.isFinite(z))throw new RangeError('A finite prime length is required.');
  const v=capacityAt(m,kappa),{mMin,mMax,zMin,zMax}=CAPACITY_EXAMPLE;
  const affineWindow=m>=mMin-EPS&&m<=mMax+EPS&&z>=zMin-EPS&&z<=zMax+EPS;
  const affineInequality=2*m+v.Lambda*z<=v.B+EPS;
  return {
    ...v,
    standardFits:z>=0&&2*m+6*kappa*z<=1+EPS,
    affineWindow,affineInequality,affineFits:affineWindow&&affineInequality,
  };
}
