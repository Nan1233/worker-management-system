type Entry<T>={promise:Promise<T>;expiresAt:number};
const cache=new Map<string,Entry<unknown>>();
const keyOf=(processId:number,machine:string,product:string,workDate?:string)=>JSON.stringify([processId,machine.trim().toUpperCase(),product.trim(),workDate||""]);
export function getCachedResolvedProductStandard<T>(processId:number,machine:string,product:string,loader:()=>Promise<T>,workDate?:string):Promise<T>{
 const key=keyOf(processId,machine,product,workDate), now=Date.now(), hit=cache.get(key) as Entry<T>|undefined;
 if(hit && hit.expiresAt>now) return hit.promise;
 const promise=Promise.resolve().then(loader).catch(e=>{if(cache.get(key)?.promise===promise)cache.delete(key);throw e;});
 cache.set(key,{promise,expiresAt:now+5*60_000}); return promise;
}
export function clearProductStandardRequestCache():void { cache.clear(); }
