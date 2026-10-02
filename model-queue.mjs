
export function createModelQueue(){
 const jobs=[];let running=false;
 async function drain(){if(running)return;running=true;while(jobs.length){jobs.sort((a,b)=>b.priority-a.priority);const j=jobs.shift();try{j.resolve(await j.task());}catch(e){j.reject(e);}}running=false;}
 return (task,priority=0)=>new Promise((resolve,reject)=>{jobs.push({task,priority,resolve,reject});drain();});
}
