(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const ROLE_PUBLIC='public', ROLE_ADMIN='admin';

  // --- Role Gate / Hashing ---
  const gateEl = $('#gate'), passEl = $('#gate-pass'), enterBtn = $('#gate-enter'), errEl = $('#gate-error');
  async function sha256hex(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function applyRoleView(role){
    $$('.tabs .tab').forEach(b=>{ b.hidden=false; b.style.display=''; b.setAttribute('aria-hidden','false'); });
    $$('main .panel').forEach(p=>{ p.hidden=false; p.style.display=''; p.setAttribute('aria-hidden','false'); });

    if(role===ROLE_PUBLIC){
      $$('.tabs .tab').forEach(b=>{
        if(b.getAttribute('data-tab')!=='generate'){ b.hidden=true; b.style.display='none'; b.setAttribute('aria-hidden','true'); }
      });
      $$('main .panel').forEach(p=>{
        if(p.id!=='tab-generate'){ p.hidden=true; p.style.display='none'; p.setAttribute('aria-hidden','true'); }
      });
      const genBtn = $('.tabs .tab[data-tab="generate"]');
      if(genBtn){ $$('.tabs .tab').forEach(b=>b.setAttribute('aria-selected','false')); genBtn.setAttribute('aria-selected','true'); genBtn.click?.(); }
    } else {
      const selected = $('.tabs .tab[aria-selected="true"]') || $$('.tabs .tab').find(b=>!b.hidden);
      selected?.click?.();
    }
  }
  function unlock(role){
    sessionStorage.setItem('kg_role', role);
    gateEl.style.display='none'; gateEl.setAttribute('aria-hidden','true');
    applyRoleView(role);
  }
  $('#lock')?.addEventListener('click', ()=>{ sessionStorage.removeItem('kg_role'); location.reload(); });
  enterBtn?.addEventListener('click', async ()=>{
    try{
      errEl.hidden=true;
      const role = $('#gate-role-admin')?.checked ? ROLE_ADMIN : ROLE_PUBLIC;
      const pwd = (passEl.value||'').trim(); if(!pwd){ errEl.textContent='Please enter password.'; errEl.hidden=false; return; }
      const hex = await sha256hex(pwd);
      const target = (role===ROLE_ADMIN) ? window.KG_ADMIN_HASH : window.KG_PUBLIC_HASH;
      if(hex===target){ unlock(role); } else { errEl.textContent='Incorrect password. Try again.'; errEl.hidden=false; }
    } catch(e){ console.error(e); errEl.textContent='Something went wrong. Please try again.'; errEl.hidden=false; }
  });
  passEl?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); $('#gate-enter')?.click(); }});
  (function restore(){ const r=sessionStorage.getItem('kg_role'); if(r===ROLE_PUBLIC||r===ROLE_ADMIN){ gateEl.style.display='none'; gateEl.setAttribute('aria-hidden','true'); applyRoleView(r); } })();

  // --- Legacy creator guard (NO-OP if new combined tables exist) ---
  function ensureNoLegacyBlock(){
    const hasNewCombined =
      $('#ads-head-table') || $('#ads-desc-table') || $('#card-ads-head') || $('#card-ads-desc');
    if (hasNewCombined) {
      const legacy = $('#ads-copy-block'); // very old id
      if (legacy) { legacy.style.display='none'; legacy.setAttribute('aria-hidden','true'); }
      return;
    }
    // If neither new nor split nor legacy present, do nothing (app.js renders).
  }
  const ready = ()=>{ if($('#preview-table')) ensureNoLegacyBlock(); };
  document.addEventListener('DOMContentLoaded', ready);
  const obs = new MutationObserver(()=>{ if($('#preview-table')) ensureNoLegacyBlock(); });
  obs.observe(document.body, {childList:true, subtree:true});

  // --- Global shortcuts pass-through (match app.js IDs) ---
  if(!window.__globalShortcutsBound){
    window.__globalShortcutsBound = true;
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target?.tagName||'').toLowerCase();
      if(tag==='input'||tag==='textarea'||e.target?.isContentEditable) return;

      if(e.ctrlKey && !e.shiftKey && !e.altKey && e.code==='KeyE'){ e.preventDefault(); $('#btn-export-csv')?.click(); return; }
      if(e.ctrlKey && e.shiftKey && !e.altKey && e.code==='KeyE'){ e.preventDefault(); $('#btn-ads-head-export-csv')?.click(); return; }
      if(e.ctrlKey && e.altKey && e.code==='KeyE'){ e.preventDefault(); $('#btn-ads-desc-export-csv')?.click(); return; }
    }, {passive:true});
  }

  // --- Client-side deterrents (bypassable) ---
  document.addEventListener('contextmenu', e=>{ e.preventDefault(); }, {capture:true});
  document.addEventListener('keydown', (e)=>{
    const k = e.key?.toLowerCase();
    if( (e.ctrlKey && (k==='s' || k==='p' || k==='u')) ) { e.preventDefault(); e.stopPropagation(); }
    if( k==='f12' || (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(k)) ){ e.preventDefault(); e.stopPropagation(); }
    if( e.ctrlKey && e.shiftKey && k==='s'){ e.preventDefault(); e.stopPropagation(); }
    if( e.ctrlKey && k==='o'){ e.preventDefault(); e.stopPropagation(); }
  }, {capture:true});

  document.addEventListener('dragstart', e=>e.preventDefault(), {capture:true});
})();
