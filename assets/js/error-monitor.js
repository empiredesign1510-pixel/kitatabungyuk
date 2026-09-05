/* Privacy-preserving local diagnostics for KITA TABUNG */
(() => {
  'use strict';
  const KEY='KITA_TABUNG_DIAGNOSTICS_V2';
  const MAX=40;
  const clean=(value,max=500)=>String(value||'').replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?/g, match=>match.split('?')[0]).replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
  const load=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value:[];}catch{return[];}};
  const save=list=>{try{localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));}catch{}};
  const code=()=>`KT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  function capture(error,area='runtime'){
    const message=clean(error?.message||error||'Unknown error',300); if(!message)return null;
    const entry={code:code(),at:new Date().toISOString(),area:clean(area,60),message,path:location.pathname,ua:clean(navigator.userAgent,180),version:window.KITA_TABUNG_VERSION||'pre-v15'};
    const list=load(); list.unshift(entry); save(list); return entry.code;
  }
  window.addEventListener('error',event=>capture(event.error||event.message,'window-error'));
  window.addEventListener('unhandledrejection',event=>capture(event.reason,'unhandled-rejection'));
  window.KTDiagnostics={capture,list:load,clear(){localStorage.removeItem(KEY);},exportText(){return load().map(x=>`${x.code} | ${x.at} | ${x.area} | ${x.message} | ${x.path} | ${x.version}`).join('\n');}};
})();
