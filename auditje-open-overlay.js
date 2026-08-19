// AuditJE -- cobertura "Abrindo autos digitais" quando aberto pelo gestao.html.
// Roda em document_start para o painel do PJe nao aparecer antes do redirecionamento.
(function () {
  try {
    if ((location.hash || '').indexOf('auditje_open=') === -1) return;
    var ID = 'auditje-open-overlay';
    function montar() {
      if (document.getElementById(ID)) return;
      var root = document.documentElement || document.body;
      if (!root) return;
      var o = document.createElement('div');
      o.id = ID;
      o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#0e3a5f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;gap:14px');
      var st = document.createElement('style');
      st.textContent = '@keyframes auditjeSpin{to{transform:rotate(360deg)}}';
      var sp = document.createElement('div');
      sp.setAttribute('style', 'width:34px;height:34px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:auditjeSpin .8s linear infinite');
      var t1 = document.createElement('div');
      t1.setAttribute('style', 'font-size:16px;font-weight:600');
      t1.textContent = 'Abrindo autos digitais…';
      var t2 = document.createElement('div');
      t2.setAttribute('style', 'font-size:12px;font-weight:400;opacity:.75');
      t2.textContent = 'AuditJE';
      o.appendChild(st); o.appendChild(sp); o.appendChild(t1); o.appendChild(t2);
      root.appendChild(o);
    }
    montar();
    document.addEventListener('DOMContentLoaded', montar);
  } catch (e) {}
})();
