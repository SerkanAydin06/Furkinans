(() => {
  'use strict';
  const KEY='furkinans_pwa_v1', $=id=>document.getElementById(id);
  let timer=0, deleteId='', openCard=null;
  const data=()=>{try{const d=JSON.parse(localStorage.getItem(KEY)||'{}');d.records=Array.isArray(d.records)?d.records:[];return d}catch(_){return{records:[]}}};
  const save=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const today=()=>{const n=new Date(),l=new Date(n.getTime()-n.getTimezoneOffset()*60000);return l.toISOString().slice(0,10)};
  const overdue=r=>!r.paid&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.date||''))&&String(r.date)<today();
  const state=r=>r.paid?{label:'Ödendi',tone:'paid',icon:'✓',rank:2}:overdue(r)?{label:'Gecikti',tone:'overdue',icon:'!',rank:0}:{label:'Bekliyor',tone:'pending',icon:'◔',rank:1};
  const fmt=v=>{const [y,m,d]=String(v||'').split('-');return y&&m&&d?`${d}.${m}.${y}`:(v||'—')};
  const esc=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const sorted=rs=>[...rs].sort((a,b)=>{const sa=state(a),sb=state(b);return sa.rank-sb.rank||String(a.date).localeCompare(String(b.date))||String(a.account_name||'').localeCompare(String(b.account_name||''),'tr')});

  function sourceRow(id){
    const cards=[...document.querySelectorAll('#recordsList .pro-record')];
    const card=cards.find(c=>String(c.dataset.recordId)===String(id));
    if(card){const row=card.querySelector('.record-row');if(row)return row}
    const rs=[...document.querySelectorAll('#recordsList>.record-row')];
    const src=[...data().records].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.account_name||'').localeCompare(String(b.account_name||''),'tr'));
    const i=src.findIndex(r=>String(r.id)===String(id));
    return i>=0?rs[i]:null;
  }

  function toggle(id){const d=data(),i=d.records.findIndex(r=>String(r.id)===String(id));if(i<0)return;const p=!d.records[i].paid;d.records[i]={...d.records[i],paid:p,paid_at:p?new Date().toISOString():''};save(d);location.reload()}

  function modal(){
    if($('matchDelete'))return;
    const o=document.createElement('div');o.id='matchDelete';o.className='match-delete hidden';o.innerHTML=`<div class="match-delete-sheet"><div class="match-delete-icon"><svg viewBox="0 0 24 24"><path d="M8 9v8M12 9v8M16 9v8M5 6h14M9 6V4h6v2M7 6l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div><div><span class="eyebrow">KAYDI SİL</span><h3 id="matchDeleteTitle">Kayıt silinsin mi?</h3><p>Bu kayıt ve hatırlatmaları kalıcı olarak silinecek.</p></div><div class="match-delete-actions"><button id="matchCancel">Vazgeç</button><button id="matchApprove">Sil</button></div></div>`;
    document.body.appendChild(o);$('matchCancel').onclick=closeModal;$('matchApprove').onclick=()=>{if(!deleteId)return;const d=data();d.records=d.records.filter(r=>String(r.id)!==deleteId);save(d);location.reload()};o.onclick=e=>{if(e.target===o)closeModal()};
  }
  function askDelete(id){const r=data().records.find(x=>String(x.id)===String(id));if(!r)return;deleteId=String(id);$('matchDeleteTitle').textContent=`“${r.account_name||'Kayıt'}” silinsin mi?`;$('matchDelete').classList.remove('hidden')}
  function closeModal(){deleteId='';$('matchDelete')?.classList.add('hidden');closeSwipe()}
  function setX(card,x,anim=true){const shell=card.querySelector('.match-shell');shell.style.transition=anim?'transform .2s cubic-bezier(.22,.8,.3,1)':'none';shell.style.transform=`translate3d(${x}px,0,0)`;card.dataset.x=String(x)}
  function closeSwipe(except=null){if(openCard&&openCard!==except){openCard.classList.remove('open');setX(openCard,0);openCard=null}}
  function setOpen(card,on){if(on){closeSwipe(card);openCard=card}else if(openCard===card)openCard=null;card.classList.toggle('open',on);setX(card,on?-106:0)}
  function swipe(card,id){
    let sx=0,sy=0,start=0,pid=null,drag=false,h=false,moved=false;
    card.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||e.target.closest('.match-state,.match-delete-btn'))return;sx=e.clientX;sy=e.clientY;start=card.classList.contains('open')?-106:0;pid=e.pointerId;drag=true;h=false;moved=false;card.classList.add('drag');try{card.setPointerCapture(pid)}catch(_){}});
    card.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==pid)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(!h){if(Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)*1.1)h=true;else if(Math.abs(dy)>11){drag=false;card.classList.remove('drag');return}else return}moved|=Math.abs(dx)>10;setX(card,Math.max(-106,Math.min(0,start+dx)),false);if(e.cancelable)e.preventDefault()});
    const end=()=>{if(!drag)return;drag=false;card.classList.remove('drag');setOpen(card,Number(card.dataset.x||0)<-45);if(moved){card.dataset.guard='1';setTimeout(()=>delete card.dataset.guard,300)}};
    card.addEventListener('pointerup',end);card.addEventListener('pointercancel',end);
    card.querySelector('.match-delete-btn').onclick=e=>{e.stopPropagation();askDelete(id)};
  }

  function card(r){
    const s=state(r),a=document.createElement('article');a.className=`match-card ${s.tone}`;a.dataset.id=String(r.id);
    a.innerHTML=`<div class="match-delete-rail"><button class="match-delete-btn" type="button"><svg viewBox="0 0 24 24"><path d="M8 9v8M12 9v8M16 9v8M5 6h14M9 6V4h6v2M7 6l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Sil</span></button></div><div class="match-shell"><div class="match-content" role="button" tabindex="0"><div class="match-head"><div><span class="match-kicker">HESAP</span><strong class="match-title">${esc(r.account_name||'—')}</strong></div><button class="match-state ${s.tone}" type="button"><span class="match-state-icon">${s.icon}</span><span>${s.label}</span><b>›</b></button></div><div class="match-info"><div><span class="match-mini-icon">▣</span><small>Tarih Türü</small><strong>${r.date_type==='statement'?'Hesap Kesim':'Son Ödeme'}</strong></div><div><span class="match-mini-icon">□</span><small>Tarih</small><strong>${fmt(r.date)}</strong></div><div><span class="match-mini-icon">▤</span><small>Açıklama</small><strong>${esc(r.description||'Açıklama girilmedi')}</strong></div></div>${r.paid&&r.paid_at?`<div class="match-paid">✓ Ödeme tarihi: ${fmt(String(r.paid_at).slice(0,10))}</div>`:''}<div class="match-hint">ⓘ &nbsp;Kaydı sola kaydırarak silme onayını açabilirsin.</div></div></div>`;
    a.querySelector('.match-state').onclick=e=>{e.stopPropagation();toggle(r.id)};
    const open=()=>{if(a.dataset.guard==='1')return;if(a.classList.contains('open'))return setOpen(a,false);sourceRow(r.id)?.click()};
    const content=a.querySelector('.match-content');content.onclick=e=>{if(!e.target.closest('.match-state'))open()};content.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('.match-state')){e.preventDefault();open()}};
    swipe(a,r.id);return a;
  }

  function dashboard(){
    const mark=document.querySelector('.brand-mark');if(mark)mark.textContent='F';
    const d=document.querySelector('.pro-dashboard');if(!d)return;
    const stats=[...d.querySelectorAll('.pro-stat')],icons=['▤','◷','✓','!'];stats.forEach((x,i)=>{if(!x.querySelector('.match-stat-icon')){const s=document.createElement('span');s.className='match-stat-icon';s.textContent=icons[i];x.prepend(s)}});
  }

  function render(){
    const old=$('recordsList');if(!old)return;
    let list=$('matchRecordsList');if(!list){list=document.createElement('div');list.id='matchRecordsList';list.className='match-list';old.insertAdjacentElement('afterend',list)}
    list.replaceChildren();sorted(data().records).forEach(r=>list.appendChild(card(r)));$('emptyState')?.classList.toggle('hidden',data().records.length!==0);dashboard();
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(render,30)}
  function init(){modal();render();const old=$('recordsList');if(old)new MutationObserver(schedule).observe(old,{childList:true,subtree:true});document.addEventListener('click',e=>{if(!e.target.closest('.match-card'))closeSwipe()});window.addEventListener('focus',schedule)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
