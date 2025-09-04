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
      // Show all first
      $$('.tabs .tab').forEach(b=>{ b.hidden=false; b.style.display=''; b.setAttribute('aria-hidden','false'); });
      $$('main .panel').forEach(p=>{ p.hidden=false; p.style.display=''; p.setAttribute('aria-hidden','false'); });

      if(role===ROLE_PUBLIC){
        $$('.tabs .tab').forEach(b=>{
          if(b.getAttribute('data-tab')!=='generate'){ b.hidden=true; b.style.display='none'; b.setAttribute('aria-hidden','true'); }
        });
        $$('main .panel').forEach(p=>{
          if(p.id!=='tab-generate'){ p.hidden=true; p.style.display='none'; p.setAttribute('aria-hidden','true'); }
        });
        // Select Generate
        const genBtn = $('.tabs .tab[data-tab="generate"]');
        if(genBtn){ $$('.tabs .tab').forEach(b=>b.setAttribute('aria-selected','false')); genBtn.setAttribute('aria-selected','true'); genBtn.click?.(); }
      } else {
        // Ensure something is selected
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

    // --- Ads Copy block creator (mirrors your earlier pattern) ---
    function ensureAdsCopyBlock(){
      const card = $('#preview-table')?.closest('.card') || null; if(!card) return;
      if($('#ads-copy-block')) return;
      const wrap = document.createElement('div');
      wrap.id = 'ads-copy-block';
      wrap.innerHTML = `
        <h3 style="margin-top:1rem">Ads Copy</h3>
        <div class="row gap stack-on-small" id="ads-toolbar" style="margin:.25rem 0 .5rem 0;">
          <div class="row gap wrap" aria-label="Ads actions">
            <button type="button" class="btn" id="btn-ads-copy-all" title="Copy all Ads rows (TSV)">Copy All</button>
            <button type="button" class="btn" id="btn-ads-export-csv" title="Export Ads CSV">Export CSV</button>
            <button type="button" class="btn" id="btn-ads-export-json" title="Export Ads JSON" hidden>Export JSON</button>
          </div>
        </div>
        <div class="table-wrap" id="adscopy-wrap">
          <table id="ads-table" class="table">
            <thead><tr><th>Particulars</th><th>Ads Copy</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <p class="muted small">Shortcut (Ads): <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> → Export CSV</p>
      `;
      ( $('#ads-copy-anchor') || card ).appendChild(wrap);

      // Wire toolbar (these helpers are expected in app.js; fallbacks included)
      const escapeTsv = window.escapeTsv || (v=>String(v??'').replace(/\t/g,'    ').replace(/\r?\n/g,' '));
      const escapeCsv = window.escapeCsv || (v=>{
        v = String(v??'');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
      });
      const fileName = window.fileName || ((base,ext)=>`${base}_${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`);
      const saveFile = window.saveFile || ((name, data, type)=>{
        const blob = new Blob([data], {type});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      });
      const copyText = window.copyText || (async txt=>{
        try{ await navigator.clipboard.writeText(txt); return true; }catch{return false;}
      });
      const autoLogEvent = window.autoLogEvent || (function(){});

      function collectAdsExportRows(){
        // If app.js defines a richer collector, use it:
        if(typeof window.collectAdsExportRows === 'function') return window.collectAdsExportRows();
        // Fallback: read from #ads-table
        const rows = [];
        $$('#ads-table tbody tr').forEach(tr=>{
          const tds = tr.querySelectorAll('td');
          rows.push({ 'Particulars': (tds[0]?.textContent||'').trim(), 'Ads Copy': (tds[1]?.textContent||'').trim() });
        });
        return rows;
      }

      $('#btn-ads-copy-all').addEventListener('click', async ()=>{
        const rows = collectAdsExportRows();
        const header = ['Particulars','Ads Copy'];
        const lines = [header.map(escapeTsv).join('\t')];
        rows.forEach(r=>lines.push([escapeTsv(r['Particulars']), escapeTsv(r['Ads Copy'])].join('\t')));
        const ok = await copyText(lines.join('\n'));
        autoLogEvent();
        if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
      });

      $('#btn-ads-export-csv').addEventListener('click', ()=>{
        const rows = collectAdsExportRows();
        const header = ['Particulars','Ads Copy'];
        const lines = [header.map(escapeCsv).join(',')];
        rows.forEach(r=>lines.push(header.map(h=>escapeCsv(r[h])).join(',')));
        saveFile(fileName('ads_copy','csv'), lines.join('\n'), 'text/csv');
        autoLogEvent();
      });

      $('#btn-ads-export-json').addEventListener('click', ()=>{
        const rows = collectAdsExportRows();
        saveFile(fileName('ads_copy','json'), JSON.stringify(rows, null, 2), 'application/json');
        autoLogEvent();
      });

      // Ads shortcut: Export only (you asked to remove Copy All shortcut)
      if(!window.__adsShortcutBound){
        window.__adsShortcutBound = true;
        document.addEventListener('keydown', (e)=>{
          const tag=(e.target?.tagName||'').toLowerCase();
          if(tag==='input'||tag==='textarea'||e.target?.isContentEditable) return;
          if(e.ctrlKey && e.shiftKey && e.code==='KeyE'){ e.preventDefault(); $('#btn-ads-export-csv')?.click(); }
        }, {passive:true});
      }
    }

    // Create Ads Copy section lazily when Ads Set exists
    const ready = ()=>{ if($('#preview-table')) ensureAdsCopyBlock(); };
    document.addEventListener('DOMContentLoaded', ready);
    const obs = new MutationObserver(()=>{ if($('#preview-table')) ensureAdsCopyBlock(); });
    obs.observe(document.body, {childList:true, subtree:true});

    // --- Global shortcuts: Ads Set CSV (Ctrl+E) ---
    if(!window.__adsSetShortcutBound){
      window.__adsSetShortcutBound = true;
      document.addEventListener('keydown', (e)=>{
        const tag=(e.target?.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||e.target?.isContentEditable) return;
        if(e.ctrlKey && !e.shiftKey && e.code==='KeyE'){ e.preventDefault(); $('#btn-export-csv')?.click(); }
      }, {passive:true});
    }

    // --- Client-side deterrents: right-click & common dev/view-source keys ---
    // (Bypassable; rely on server hardening for real protection.)
    document.addEventListener('contextmenu', e=>{ e.preventDefault(); }, {capture:true});
    document.addEventListener('keydown', (e)=>{
      const k = e.key?.toLowerCase();
      const combo = (mods)=>mods.every(m=>e[m]);
      // Block: Ctrl+S / Ctrl+P / Ctrl+U
      if( (e.ctrlKey && (k==='s' || k==='p' || k==='u')) ) { e.preventDefault(); e.stopPropagation(); }
      // Block: F12, Ctrl+Shift+I/J/C
      if( k==='f12' || (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(k)) ){ e.preventDefault(); e.stopPropagation(); }
      // Block: Ctrl+Shift+S (save as)
      if( e.ctrlKey && e.shiftKey && k==='s'){ e.preventDefault(); e.stopPropagation(); }
      // Block: Ctrl+O (open), Ctrl+S handled above
      if( e.ctrlKey && k==='o'){ e.preventDefault(); e.stopPropagation(); }
      // Print screen prevention is not possible reliably.
    }, {capture:true});

    document.addEventListener('dragstart', e=>e.preventDefault(), {capture:true});
    document.addEventListener('copy', e=>{ /* allow normal copy for tool use; disable if you prefer */ }, {capture:true});

    /* 
      ⚙ Server-side hardening (recommended):
      - Disable directory listing (Apache .htaccess):
          Options -Indexes
      - Set security headers (Apache):
          Header always set X-Content-Type-Options "nosniff"
          Header always set X-Frame-Options "DENY"
          Header always set Referrer-Policy "no-referrer"
          Header always set Permissions-Policy "geolocation=(), camera=(), microphone=()"
          Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
      - Ensure the site is served over HTTPS.
    */
  })();
