/* KPI card-style toggle (Bold / Clean / Soft) */
window.setCardStyle=function(v){
  var g=document.getElementById('shift-kpis'); if(g) g.setAttribute('data-cs',v);
  try{lsPut('st_cardstyle',v);}catch(_){}
  var t=document.getElementById('cardstyle-toggle');
  if(t) t.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.cs===v); });
};
(function(){
  var saved='bold'; try{ saved=lsGet('st_cardstyle')||'bold'; }catch(_){}
  if(saved==='soft') saved='bold';
  window.setCardStyle(saved);
})();
