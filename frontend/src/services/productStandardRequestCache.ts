type Entry<T>={promise:Promise<T>;expiresAt:number};
const cache=new Map<string,Entry<unknown>>();
const keyOf=(processId:number,machine:string,product:string,workDate?:string)=>[processId,machine.trim().toUpperCase(),product.trim(),workDate||""].join("|");
export function getCachedResolvedProductStandard<T>(processId:number,machine:string,product:string,loader:()=>Promise<T>,workDate?:string):Promise<T>{
 const key=keyOf(processId,machine,product,workDate), now=Date.now(), hit=cache.get(key) as Entry<T>|undefined;
 if(hit && hit.expiresAt>now) return hit.promise;
 const promise=loader().catch(e=>{cache.delete(key);throw e;});
 cache.set(key,{promise,expiresAt:now+5*60_000}); return promise;
}
export function clearProductStandardRequestCache():void { cache.clear(); }
