export const executionDefaults={initialCapital:10000,riskFraction:0.01,commissionPerSide:2.5,slippageBps:5,minRR:2};
export function executionPlan(plan,options={},openingPrice=plan.entry){
 const o={...executionDefaults,...options},capital=o.capital??o.initialCapital,fee=o.commissionPerSide,slip=o.slippageBps/10000;
 if(![plan.entry,plan.stop,plan.target,openingPrice,capital,o.riskFraction,fee,slip].every(Number.isFinite)||capital<=0||o.riskFraction<=0||o.riskFraction>1||fee<0||slip<0||slip>=1)throw Error('Invalid execution settings');
 const entry=Math.max(openingPrice,plan.entry)*(1+slip),stop=plan.stop*(1-slip),target=plan.target*(1-slip),priceRisk=entry-stop;
 const qty=priceRisk>0?Math.max(0,Math.min(Math.floor((capital*o.riskFraction-2*fee)/priceRisk),Math.floor((capital-fee)/entry))):0;
 const netRisk=priceRisk*qty+2*fee,netReward=(target-entry)*qty-2*fee,rr=qty>0&&netRisk>0?netReward/netRisk:null;
 const minimumRR=Math.max(2,o.minRR),minimumTarget=qty>0?(entry+(minimumRR*netRisk+2*fee)/qty)/(1-slip):null;
 return {entry,stop,target,qty,priceRisk,netRisk:qty?netRisk:null,netReward:qty?netReward:null,rr,minimumRR,minimumTarget,commissionPerSide:fee,slippageBps:o.slippageBps,initialCapital:capital,riskFraction:o.riskFraction};
}