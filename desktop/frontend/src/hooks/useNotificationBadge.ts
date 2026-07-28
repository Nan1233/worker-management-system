import { useCallback, useEffect, useRef, useState } from "react";
import { getUnreadNotificationCount } from "../services/systemService";
import { isAuthRefreshInProgress, waitForSharedRefresh } from "../services/api";
const POLL_INTERVAL_MS=30000; export const NOTIFICATION_COUNT_CHANGED_EVENT="ktc:notification-count-changed";
function readCachedCount(){const v=Number(sessionStorage.getItem("ktc_unread_notifications")||0);return Number.isFinite(v)&&v>0?Math.trunc(v):0;}
export function publishNotificationCount(count:number){const n=Math.max(0,Math.trunc(Number(count)||0));sessionStorage.setItem("ktc_unread_notifications",String(n));window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_CHANGED_EVENT,{detail:n}));}
export function useNotificationBadge(){
 const [unreadCount,setUnreadCount]=useState(readCachedCount); const loading=useRef(false); const paused=useRef(false); const mounted=useRef(true);
 const refresh=useCallback(async()=>{
  if(loading.current||paused.current||!navigator.onLine||document.visibilityState!=="visible"||isAuthRefreshInProgress()||!(localStorage.getItem("accessToken")||localStorage.getItem("token")))return;
  loading.current=true; try{const count=await getUnreadNotificationCount();if(mounted.current)publishNotificationCount(count);}
  catch(error:any){if(Number(error?.response?.status)===401){paused.current=true;try{await waitForSharedRefresh();paused.current=false;const count=await getUnreadNotificationCount();if(mounted.current)publishNotificationCount(count);}catch{}}}
  finally{loading.current=false;}
 },[]);
 useEffect(()=>{mounted.current=true; const changed=(e:Event)=>setUnreadCount(Math.max(0,Math.trunc(Number((e as CustomEvent<number>).detail)||0)));
 const resume=()=>{if(navigator.onLine&&document.visibilityState==="visible"){paused.current=false;void refresh();}}; const state=(e:Event)=>{if(!(e as CustomEvent<boolean>).detail)resume();};
 window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT,changed);window.addEventListener("online",resume);window.addEventListener("ktc:connection-restored",resume);window.addEventListener("ktc:auth-refresh-state",state);document.addEventListener("visibilitychange",resume);
 void refresh();const timer=window.setInterval(()=>void refresh(),POLL_INTERVAL_MS);return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT,changed);window.removeEventListener("online",resume);window.removeEventListener("ktc:connection-restored",resume);window.removeEventListener("ktc:auth-refresh-state",state);document.removeEventListener("visibilitychange",resume);};},[refresh]);
 return{unreadCount,refreshNotifications:refresh};}
