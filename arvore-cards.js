/**
 * AuditJE — Fase 2: chips de semáforo por documento na árvore do PJe
 * ------------------------------------------------------------------
 * Content script (mesmo mundo isolado do content.js). Recebe os vereditos
 * por documento vindos do iframe chat.html (postMessage) e injeta um chip
 * de semáforo por documento na árvore, reconciliando a cada re-render.
 * Também sinaliza documentos NOVOS (juntados após a última auditoria) que
 * ainda não têm veredito. NÃO altera o motor, os status nem os valores gravados.
 * Marcador de versão (anti-clobber): [AuditJE arvore-cards vX.Y]
 */
(function () {
  'use strict';
  if (window.__AUDITJE_ARVORE__) return;
  window.__AUDITJE_ARVORE__ = true;

  var VERSAO = '0.24.0';
  var ATTR = 'data-auditje-chip';
  var CARD_ID = 'auditje-doc-card';

  var _vereditos = new Map();   // docId -> { id, estado, label, icone, nome, status }
  var _baseline = new Set();    // docIds já presentes na árvore no momento de uma auditoria

  var _ESTADO = {
    ok:        { emoji: '\u{1F7E2}', cor: '#1a7f37', bg: 'rgba(26,127,55,.12)',  txt: 'OK' },
    conferir:  { emoji: '\u{1F7E1}', cor: '#9a6700', bg: 'rgba(154,103,0,.14)',  txt: 'Conferir' },
    pendencia: { emoji: '\u{1F534}', cor: '#b42318', bg: 'rgba(180,35,24,.12)',  txt: 'Pendencia' },
    na:        { emoji: '\u{26AA}',  cor: '#57606a', bg: 'rgba(87,96,106,.10)',  txt: 'N/A' },
    novo:      { emoji: '\u{1F195}', cor: '#6b7280', bg: 'rgba(107,114,128,.08)', txt: 'novo', dash: true }
  };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _leadingDocId(el) {
    var t = ((el && el.textContent) || '').trim();
    var m = t.match(/^(\d{6,})\s*[-–]/);
    return m ? m[1] : null;
  }
  function _idDeUrl(u) {
    if (!u) return null;
    var m = String(u).match(/\/documento\/(?:download\/)?(\d+)/);
    return m ? m[1] : null;
  }
  function _timelineContainer() {
    return document.getElementById('divTimeLine:divEventosTimeLine')
      || document.querySelector('[id*="divEventosTimeLine"]')
      || document.querySelector('app-arvore-documento, app-timeline')
      || document.body;
  }

  // Coleta documentos nos DOIS layouts do PJe (2G JSF + 1G Angular).
  function _coletarDocs() {
    var out = [], vistos = new Set();
    function push(docId, li, anchor) {
      if (!docId || !li || vistos.has(docId)) return;
      vistos.add(docId); out.push({ docId: docId, li: li, anchor: anchor });
    }
    var jsf = document.querySelectorAll('a[id*="divTimeLine"]');
    for (var i = 0; i < jsf.length; i++) {
      var a = jsf[i];
      if (!/^\d{6,}\s*[-–]/.test((a.textContent || '').trim())) continue;
      var idJ = _leadingDocId(a) || _idDeUrl(a.getAttribute('href') || a.href);
      push(idJ, a.closest('li') || a.parentElement, a);
    }
    var ang = document.querySelectorAll('li[id^="doc_"]');
    for (var k = 0; k < ang.length; k++) {
      var li = ang[k];
      var la = li.querySelector('a') || li;
      var idAttr = (li.id.match(/(\d{5,})/) || [])[1] || null;
      var idA = _leadingDocId(li) || _leadingDocId(la)
        || _idDeUrl(la.getAttribute && la.getAttribute('href')) || idAttr;
      push(idA, li, la);
    }
    return out;
  }

  function _pintarChip(chip, v) {
    var e = _ESTADO[v.estado] || _ESTADO.conferir;
    chip.__ajV = v;
    chip.style.color = e.cor;
    chip.style.background = e.bg;
    chip.style.borderColor = e.cor + (e.dash ? '99' : '55');
    chip.style.borderStyle = e.dash ? 'dashed' : 'solid';
    chip.title = 'AuditJE — ' + e.txt + (v.label ? ': ' + v.label : '');
    chip.setAttribute('aria-label', 'AuditJE: ' + e.txt + (v.label ? ' — ' + v.label : ''));
    chip.innerHTML = '<span style="font-size:9px">' + e.emoji + '</span>' + e.txt;
  }
  function _criarChip(docId, v) {
    var chip = document.createElement('span');
    chip.setAttribute(ATTR, docId);
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    Object.assign(chip.style, {
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      font: '600 10px/1.4 -apple-system,Segoe UI,Roboto,sans-serif',
      border: '1px solid transparent', borderRadius: '10px',
      padding: '0 6px', marginLeft: '6px', cursor: 'pointer',
      verticalAlign: 'middle', userSelect: 'none', whiteSpace: 'nowrap'
    });
    _pintarChip(chip, v);
    function abrir(ev) { ev.preventDefault(); ev.stopPropagation(); _abrirCard(docId, chip); }
    chip.addEventListener('click', abrir);
    chip.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') abrir(ev); });
    return chip;
  }

  // Reconciliação idempotente por diff.
  var _agendada = false;
  function _agendar() {
    if (_agendada) return; _agendada = true;
    setTimeout(function () {
      _agendada = false;
      try { _reconciliar(); } catch (e) { console.warn('[AuditJE][fase2] reconciliar:', e); }
    }, 250);
  }
  function _reconciliar() {
    if (!_vereditos.size && !_baseline.size) return;
    var docs = _coletarDocs();
    var vivos = new Set();
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      vivos.add(d.docId);
      var v = _vereditos.get(d.docId);
      var chip = d.li.querySelector('[' + ATTR + '="' + d.docId + '"]');
      if (v) {
        if (chip) _pintarChip(chip, v); else d.li.appendChild(_criarChip(d.docId, v));
      } else if (!_baseline.has(d.docId)) {
        // documento novo (juntado após a última auditoria) e ainda sem veredito
        var vn = { estado: 'novo', label: 'Documento novo — ainda não auditado', nome: '' };
        if (chip) _pintarChip(chip, vn); else d.li.appendChild(_criarChip(d.docId, vn));
      } else if (chip) {
        chip.remove(); // presente na auditoria, sem veredito (não é requisito) → sem chip
      }
    }
    var todos = document.querySelectorAll('[' + ATTR + ']');
    for (var j = 0; j < todos.length; j++) {
      if (!vivos.has(todos[j].getAttribute(ATTR))) todos[j].remove();
    }
  }

  // Card ancorado (leitura). Para 'novo', card neutro orientando a auditoria seletiva.
  // Abre o painel do AuditJE na aba "Requisitos CAND" (art. 27) a partir do card na arvore.
  function _abrirRequisitosCand() {
    var ifr = document.getElementById('chatje-iframe');
    if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'AUDITJE_ABRIR_CAND' }, '*');
  }
  var _obsLocal = {}; // memoria local da observacao por itemId (pre-preenche o card ao reabrir)
  // Observacao nao-corretiva do card: salvar=true persiste no Sheets; false so atualiza memoria.
  function _postObs(itemId, texto, salvar) {
    var ifr = document.getElementById('chatje-iframe');
    if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'AUDITJE_OBSERVACAO', itemId: itemId, texto: texto, salvar: !!salvar }, '*');
  }
  function _postMarca(itemId, k, detalheV, corr) {
    var ifr = document.getElementById('chatje-iframe');
    if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'AUDITJE_APLICAR_MARCA', itemId: itemId, k: k, detalheV: detalheV || null, corr: corr || null }, '*');
  }
  function _btnMarca(attr, val, txt, cor) {
    return '<button ' + attr + '="' + val + '" style="flex:1;min-width:0;border:1px solid ' + cor + '55;background:' + cor + '14;color:' + cor + ';border-radius:7px;padding:4px 2px;font:600 10px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;white-space:nowrap">' + txt + '</button>';
  }
  function _htmlMarca(v) {
    var _lblOk = v.kind === 'div' ? '\u{1F7E2} Sem diverg.' : '\u{1F7E2} Sim, confere';
    var _lblCf = v.kind === 'div' ? '\u{1F7E1} Aguardando' : '\u{1F7E1} A conferir';
    var _lblPd = v.kind === 'div' ? '\u{1F534} Com diverg.' : '\u{1F534} Não confere';
    var main = '<div style="display:flex;gap:4px;margin-top:9px">'
      + _btnMarca('data-k', 'ok', _lblOk, '#1a7f37')
      + _btnMarca('data-k', 'cf', _lblCf, '#9a6700')
      + _btnMarca('data-k', 'pd', _lblPd, '#b42318')
      + (v.kind === 'pd' ? _btnMarca('data-k', 'na', '\u{26AA} N/A', '#57606a') : '')
      + '</div>';
    var det = '';
    if (v.kind === 'cert') {
      det = '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">'
        + _btnMarca('data-dv', 'corresponde_com_obj_pe', 'Consta + Obj.Pé', '#1a7f37')
        + _btnMarca('data-dv', 'consta_sem_obj_pe', 'Consta s/ Obj.Pé', '#b42318')
        + _btnMarca('data-dv', 'nao_corresponde', 'Não corresponde', '#b42318')
        + '</div>';
    }
    var corr = '<div data-corr style="display:none;margin-top:9px;border-top:1px solid #eef0f4;padding-top:8px">'
      + '<div data-corr-et style="font-size:11px;color:#8a94a6;margin-bottom:5px"></div>'
      + '<div style="font-size:10px;font-weight:700;color:#b42318;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Sua decisão prevalece sobre a automática</div>'
      + '<textarea data-corr-txt placeholder="Motivo da correção (obrigatório)" style="width:100%;box-sizing:border-box;font:12px -apple-system,Segoe UI,Roboto,sans-serif;color:#1e1b2e;border:1px solid #d0d7de;border-radius:6px;padding:5px 6px;min-height:42px;resize:vertical"></textarea>'
      + '<div style="display:flex;gap:6px;margin-top:6px">'
        + '<button data-corr-ok type="button" style="flex:1;border:1px solid #1a7f3755;background:#1a7f3714;color:#1a7f37;border-radius:7px;padding:5px 2px;font:600 11px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer">Confirmar correção</button>'
        + '<button data-corr-cancel type="button" style="border:1px solid #57606a55;background:#57606a14;color:#57606a;border-radius:7px;padding:5px 10px;font:600 11px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer">Cancelar</button>'
      + '</div>'
      + '<div data-corr-err style="display:none;font-size:11px;color:#b42318;margin-top:4px">Informe o motivo para gravar a correção.</div>'
    + '</div>';
    return main + det + corr + '<div data-fb style="font-size:11px;color:#1a7f37;margin-top:6px;min-height:13px"></div>';
  }
  function _feedbackMarca(card) {
    var fb = card.querySelector('[data-fb]');
    if (fb) fb.textContent = '✓ Marcado — o chip vai atualizar.';
    setTimeout(_fecharCard, 800);
  }
  function _wireMarca(card, v) {
    if (!v || !v.itemId) return;
    var corr = card.querySelector('[data-corr]');
    var txt = card.querySelector('[data-corr-txt]');
    var et = card.querySelector('[data-corr-et]');
    var err = card.querySelector('[data-corr-err]');
    var _pend = null;
    var _advK = { pd: 1 };
    var _advDv = { consta_sem_obj_pe: 1, nao_corresponde: 1 };
    var _rot = { pd: 'Pendência', consta_sem_obj_pe: 'Consta, sem Objeto e Pé', nao_corresponde: 'Não corresponde' };
    function _pedir(k, dv, rot) {
      _pend = { k: k, dv: dv, rot: rot };
      if (et) et.innerHTML = 'Leitura automática: <b>' + _esc(v.motivo || v.label || '—') + '</b> → sua decisão: <b style="color:#b42318">' + _esc(rot) + '</b>';
      if (err) err.style.display = 'none';
      if (corr) corr.style.display = 'block';
      if (txt) { txt.value = ''; try { txt.focus(); } catch (e) {} }
    }
    var ks = card.querySelectorAll('[data-k]');
    for (var i = 0; i < ks.length; i++) {
      ks[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var k = this.getAttribute('data-k');
        if (_advK[k]) { _pedir(k, null, _rot[k] || 'Pendência'); return; }
        _postMarca(v.itemId, k, null, null); _feedbackMarca(card);
      });
    }
    var dvs = card.querySelectorAll('[data-dv]');
    for (var j = 0; j < dvs.length; j++) {
      dvs[j].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var dv = this.getAttribute('data-dv');
        if (_advDv[dv]) { _pedir(null, dv, _rot[dv] || 'Correção'); return; }
        _postMarca(v.itemId, null, dv, null); _feedbackMarca(card);
      });
    }
    if (txt) txt.addEventListener('click', function (ev) { ev.stopPropagation(); });
    var okB = card.querySelector('[data-corr-ok]');
    if (okB) okB.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var m = txt ? txt.value.trim() : '';
      if (!m) { if (err) err.style.display = 'block'; if (txt) { try { txt.focus(); } catch (e) {} } return; }
      if (!_pend) return;
      _postMarca(v.itemId, _pend.k, _pend.dv, { motivo: m, de: (v.motivo || v.label || ''), para: _pend.rot }); _feedbackMarca(card);
    });
    var canB = card.querySelector('[data-corr-cancel]');
    if (canB) canB.addEventListener('click', function (ev) { ev.stopPropagation(); _pend = null; if (corr) corr.style.display = 'none'; });
  }
  // Detalhe dos batimentos (leitura tecnica do motor) — tema claro, expansivel.
  function _htmlBatimentos(v) {
    var rows = [];
    if (v.tipoOCR) rows.push(['Tipo (OCR)', v.tipoOCR]);
    if (v.verif)   rows.push(['Verificação', v.verif]);
    if (v.cont)    rows.push(['Conteúdo', v.cont]);
    if (v.consta)  rows.push(['Resultado', v.consta + (v.constaTotal ? ' · ' + v.constaTotal + ' processo(s)' : '')]);
    var temProc = v.processos && v.processos.length;
    if (!rows.length && !temProc && !v.detalhe) return '';
    var corpo = rows.map(function (r) {
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:1px 0"><span style="color:#57606a">' + _esc(r[0]) + '</span><b style="font:600 10.5px ui-monospace,Menlo,monospace;color:#24292f;text-align:right">' + _esc(r[1]) + '</b></div>';
    }).join('');
    if (!rows.length && v.detalhe) corpo = '<div style="color:#57606a">' + _esc(v.detalhe) + '</div>';
    var procs = temProc
      ? '<div style="margin-top:5px;padding-top:5px;border-top:1px dashed #dbe3ef;font:10px/1.7 ui-monospace,Menlo,monospace;color:#57606a">' + v.processos.map(function (p) { return _esc(p); }).join('<br>') + '</div>'
      : '';
    return '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:11px;font-weight:600;color:#1a5276;outline:none">🔎 Detalhe dos batimentos</summary>'
      + '<div style="margin-top:5px;background:#f6f8fb;border:1px solid #e6e9ef;border-radius:6px;padding:6px 8px;font-size:11px">' + corpo + procs + '</div></details>';
  }
  function _fecharCard() { var c = document.getElementById(CARD_ID); if (c) c.remove(); }
  function _cssCard() {
    if (document.getElementById('ajc-css')) return;
    var st = document.createElement('style');
    st.id = 'ajc-css';
    st.textContent = '#auditje-doc-card button,#auditje-doc-card textarea{text-transform:none!important;letter-spacing:normal!important;font-family:-apple-system,Segoe UI,Roboto,sans-serif}';
    (document.head || document.documentElement).appendChild(st);
  }
  function _reqDoc(nome) {
    var info = _ORDEM_INFO[_ordemArt27(nome || '')];
    if (!info || !info.req || info.req === 'Fora dos requisitos do art. 27') return '';
    return (info.inc ? info.inc + ' · ' : '') + info.req;
  }
  function _abrirCard(docId, anchorEl) {
    _fecharCard();
    _cssCard();
    var v = anchorEl.__ajV; if (!v) return;
    var _r27 = _reqDoc(v.nome);
    var e = _ESTADO[v.estado] || _ESTADO.conferir;
    var ehNovo = v.estado === 'novo';
    var card = document.createElement('div');
    card.id = CARD_ID;
    Object.assign(card.style, {
      position: 'fixed', zIndex: '2147483646', maxWidth: '300px', minWidth: '210px',
      background: '#fff', color: '#1e1b2e', border: '1px solid #d0d7de',
      borderLeft: '4px solid ' + e.cor, borderRadius: '10px',
      boxShadow: '0 8px 30px rgba(0,0,0,.18)', padding: '11px 13px',
      font: '13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif'
    });
    var rodape = ehNovo
      ? 'Documento novo, ainda não auditado. Rode a <b>auditoria seletiva</b> no painel do AuditJE para incluí-lo no batimento.'
      : 'A marcação grava igual ao painel do AuditJE.';
    var _marca = (!ehNovo && v.itemId && v.kind) ? _htmlMarca(v) : '';
    var _obsHtml = (!ehNovo && v.estado === 'conferir')
      ? '<div style="margin-top:9px;border-top:1px solid #eef0f4;padding-top:8px">'
        + '<label style="display:block;font-size:11px;color:#57606a;margin-bottom:4px">Observação (opcional — aparecerá no relatório)</label>'
        + '<textarea data-obs="1" rows="2" placeholder="Ex.: filiação confere, foto legível…" style="width:100%;box-sizing:border-box;font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#1e1b2e;border:1px solid #d0d7de;border-radius:6px;padding:5px 7px;resize:vertical">' + _esc(_obsLocal[v.itemId] || '') + '</textarea>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-top:5px">'
          + '<button data-obs-save="1" type="button" style="border:1px solid #1a527655;background:#1a527614;color:#1a5276;font-size:11.5px;font-weight:600;border-radius:6px;padding:4px 11px;cursor:pointer">Salvar observação</button>'
          + '<span data-obs-fb="1" style="font-size:11px;color:#1a7f37"></span>'
        + '</div>'
      + '</div>'
      : '';
    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        + '<span style="font-size:14px">' + e.emoji + '</span>'
        + '<strong style="color:' + e.cor + '">' + (ehNovo ? 'Documento novo' : e.txt) + '</strong>'
        + '<button data-x="1" aria-label="Fechar" style="margin-left:auto;border:0;background:none;cursor:pointer;font-size:15px;color:#57606a">✕</button>'
      + '</div>'
      + (!ehNovo ? '<div style="font-size:10px;color:#8a94a6;margin:-3px 0 5px">análise deste documento</div>' : '')
      + (v.nome ? '<div style="font-weight:600;margin-bottom:2px">' + _esc(v.nome) + '</div>' : '')
      + (!ehNovo ? '<div style="font:600 10px ui-monospace,Menlo,monospace;color:#94a3b8;margin-bottom:4px">Doc ' + _esc(docId) + (_r27 ? ' · ' + _esc(_r27) : '') + '</div>' : '')
      + (!ehNovo && v.estado !== 'conferir' ? '<div style="color:#57606a;font-size:12px">' + _esc(v.label || '') + '</div>' : '')
      + (!ehNovo ? '<div style="margin-top:6px"><a data-abrir="1" style="font-size:12px;font-weight:600;color:#1d4ed8;cursor:pointer;text-decoration:none">\u{1F4C4} Abrir documento ›</a></div>' : '')
      + (!ehNovo ? '<div style="margin-top:5px"><a data-cand="1" style="font-size:12px;font-weight:600;color:#1d4ed8;cursor:pointer;text-decoration:none">📋 ver no Requisitos CAND ›</a></div>' : '')
      + (!ehNovo && v.motivo && v.kind !== 'simples' ? '<div style="margin-top:5px;font-size:11px;color:#8a94a6"><b>Leitura automática:</b> ' + _esc(v.motivo) + '</div>' : '')
      + (!ehNovo && v.aviso ? '<div style="margin-top:5px;font-size:11px;color:#b42318;background:#fff4f4;border:1px solid #fecaca;border-radius:6px;padding:4px 7px">\u26A0\uFE0F ' + _esc(v.aviso) + '</div>' : '')
      + (!ehNovo ? _htmlBatimentos(v) : '')
      + (!ehNovo && v.estado === 'conferir' ? '<div style="margin-top:7px;font-size:12px;font-weight:600;color:#9a6700">\u{1F464} Este documento confere?</div>' : '')
      + (!ehNovo && v.estado !== 'conferir' && _marca ? '<div style="margin-top:9px;font-size:10px;font-weight:700;color:#8a94a6;text-transform:uppercase;letter-spacing:.4px">Sua marcação</div>' : '')
      + _marca
      + _obsHtml
      + '<div style="margin-top:8px;font-size:11px;color:#8a94a6">' + rodape + '</div>';
    document.body.appendChild(card);
    var r = anchorEl.getBoundingClientRect();
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - cw - 8));
    var top = r.bottom + 6;
    if (top + ch > window.innerHeight - 8) top = Math.max(8, r.top - ch - 6);
    card.style.left = left + 'px'; card.style.top = top + 'px';
    card.querySelector('[data-x]').addEventListener('click', _fecharCard);
    var _ab = card.querySelector('[data-abrir]'); if (_ab) _ab.addEventListener('click', function (ev) { ev.stopPropagation(); _abrirDocumento(docId); });
    var _vc = card.querySelector('[data-cand]'); if (_vc) _vc.addEventListener('click', function (ev) { ev.stopPropagation(); _abrirRequisitosCand(); });
    _wireMarca(card, v);
    var _obsTa = card.querySelector('[data-obs]');
    if (_obsTa) {
      var _obsFb = card.querySelector('[data-obs-fb]');
      var _obsBtn = card.querySelector('[data-obs-save]');
      var _obsTimer = null;
      _obsTa.addEventListener('click', function (ev) { ev.stopPropagation(); });
      _obsTa.addEventListener('input', function () {
        _obsLocal[v.itemId] = _obsTa.value.trim();
        if (_obsTimer) clearTimeout(_obsTimer);
        _obsTimer = setTimeout(function () { _postObs(v.itemId, _obsTa.value.trim(), false); }, 500);
      });
      _obsTa.addEventListener('blur', function () { if (_obsTimer) clearTimeout(_obsTimer); _postObs(v.itemId, _obsTa.value.trim(), true); });
      if (_obsBtn) _obsBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (_obsTimer) clearTimeout(_obsTimer);
        var _t = _obsTa.value.trim();
        _obsLocal[v.itemId] = _t;
        _postObs(v.itemId, _t, true);
        if (_obsFb) { _obsFb.textContent = _t ? '✓ salvo no relatório' : 'observação limpa'; setTimeout(function () { if (_obsFb) _obsFb.textContent = ''; }, 2000); }
      });
    }
    setTimeout(function () {
      function fora(ev) { if (!card.contains(ev.target)) { _fecharCard(); limpar(); } }
      function tecla(ev) { if (ev.key === 'Escape') { _fecharCard(); limpar(); } }
      function rolar() { _fecharCard(); limpar(); }
      function limpar() {
        document.removeEventListener('mousedown', fora, true);
        document.removeEventListener('keydown', tecla, true);
        window.removeEventListener('scroll', rolar, true);
      }
      document.addEventListener('mousedown', fora, true);
      document.addEventListener('keydown', tecla, true);
      window.addEventListener('scroll', rolar, true);
    }, 0);
  }

  // Canal de vereditos vindo do iframe chat.html.
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'AUDITJE_VEREDITOS_DOC' || !Array.isArray(d.vereditos)) return;
    _vereditos.clear();
    for (var i = 0; i < d.vereditos.length; i++) {
      var v = d.vereditos[i];
      if (v && v.id != null) _vereditos.set(String(v.id), v);
    }
    // Baseline: tudo que já está na árvore neste momento é "conhecido" — só o que
    // aparecer DEPOIS (sem veredito) será marcado como novo.
    var atuais = _coletarDocs();
    for (var k = 0; k < atuais.length; k++) _baseline.add(atuais[k].docId);
    _agendar();
    if (_listaEl) _montarLista();
  });

  // ── Resumo agregado no botão flutuante (#chatje-toggle) ──
  var _resumo = null;
  var BADGE_ID = 'auditje-badge';
  var POP_ID = 'auditje-resumo-pop';
  function _toggleEl() { return document.getElementById('chatje-toggle'); }
  function _atualizarBadge() {
    var tog = _toggleEl(); if (!tog || !_resumo) return;
    var n = _resumo.precisam || 0;
    var badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      Object.assign(badge.style, {
        position: 'absolute', top: '-6px', right: '-6px', minWidth: '18px', height: '18px',
        padding: '0 5px', borderRadius: '9px', color: '#fff', textAlign: 'center',
        font: '700 11px/18px -apple-system,Segoe UI,Roboto,sans-serif',
        boxShadow: '0 2px 6px rgba(0,0,0,.3)', cursor: 'pointer', border: '1px solid #fff'
      });
      badge.addEventListener('click', function (e) { e.stopPropagation(); _abrirResumo(); });
      badge.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _abrirResumo(); } });
      if (getComputedStyle(tog).position === 'static') tog.style.position = 'relative';
      tog.appendChild(badge);
    }
    if (n > 0) { badge.textContent = String(n); badge.style.background = '#b42318'; badge.title = 'AuditJE — ' + n + ' precisam de você'; }
    else { badge.textContent = '✓'; badge.style.background = '#1a7f37'; badge.title = 'AuditJE — nada pendente'; }
    badge.style.display = 'block';
  }
  function _abrirResumo() {
    var ex = document.getElementById(POP_ID); if (ex) { ex.remove(); return; }
    if (!_resumo) return;
    var tog = _toggleEl();
    var pop = document.createElement('div');
    pop.id = POP_ID;
    Object.assign(pop.style, {
      position: 'fixed', zIndex: '2147483647', width: '280px', maxHeight: '60vh', overflow: 'auto',
      background: '#fff', color: '#1e1b2e', border: '1px solid #d0d7de', borderRadius: '10px',
      boxShadow: '0 10px 34px rgba(0,0,0,.22)', padding: '13px 15px',
      font: '13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif'
    });
    var pl = _resumo.placar || { ok: 0, total: 0 };
    var na = _resumo.naoApresentados || [];
    var lista = na.length
      ? '<ul style="margin:6px 0 0;padding-left:18px;color:#b42318">' + na.map(function (t) { return '<li style="margin:2px 0">' + _esc(t) + '</li>'; }).join('') + '</ul>'
      : '<div style="color:#1a7f37;margin-top:6px">Nenhum requisito obrigatório ausente.</div>';
    pop.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<strong>Resumo — Art. 27</strong>'
        + '<button data-x="1" aria-label="Fechar" style="margin-left:auto;border:0;background:none;cursor:pointer;font-size:15px;color:#57606a">✕</button>'
      + '</div>'
      + '<div style="font-weight:700;color:' + (_resumo.pendentes ? '#b42318' : '#1a7f37') + '">' + pl.ok + ' / ' + pl.total + ' documentos obrigatórios juntados</div>'
      + '<div style="font-size:11px;color:#8a94a6;text-transform:uppercase;letter-spacing:.4px;margin-top:10px">Não apresentados (sem documento na árvore)</div>'
      + lista;
    document.body.appendChild(pop);
    var r = tog ? tog.getBoundingClientRect() : { left: window.innerWidth - 40, top: 60 };
    pop.style.left = Math.max(8, r.left - pop.offsetWidth - 10) + 'px';
    pop.style.top = Math.max(8, Math.min(r.top, window.innerHeight - pop.offsetHeight - 8)) + 'px';
    pop.querySelector('[data-x]').addEventListener('click', function () { pop.remove(); });
    setTimeout(function () {
      function fora(ev) { if (!pop.contains(ev.target) && ev.target.id !== BADGE_ID) { pop.remove(); document.removeEventListener('mousedown', fora, true); } }
      document.addEventListener('mousedown', fora, true);
    }, 0);
  }
  var PREANALISE_ID = 'auditje-preanalise';
  var _btnPre = null;
  var _preFeito = false;
  function _iniciarPreanalise() {
    var ifr = document.getElementById('chatje-iframe');
    if (!ifr || !ifr.contentWindow) return;
    ifr.contentWindow.postMessage({ type: 'AUDITJE_INICIAR_PREANALISE' }, '*');
    if (_btnPre) { _btnPre.dataset.busy = '1'; _btnPre.textContent = '\u{23F3} Analisando\u2026'; _btnPre.style.opacity = '.7'; }
  }
  function _resetPreanalise() {
    if (_btnPre) { delete _btnPre.dataset.busy; _btnPre.textContent = '\u{25B6} Pr\u00E9-an\u00E1lise'; _btnPre.style.opacity = '1'; }
  }
  function _preanaliseOk() {
    var ifr = document.getElementById('chatje-iframe');
    if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'AUDITJE_PREANALISE_OK' }, '*');
  }
  function _bloquearPreanalise() {
    _preFeito = true;
    if (!_btnPre) return;
    _btnPre.dataset.done = '1'; delete _btnPre.dataset.busy;
    _btnPre.disabled = true;
    _btnPre.textContent = '✓ Pré-análise concluída';
    _btnPre.style.opacity = '.55'; _btnPre.style.cursor = 'default';
    _btnPre.title = 'Pré-análise já realizada (execução única)';
  }
  function _garantirBotaoPreanalise() {
    var tog = _toggleEl(); if (!tog) return;
    var ex = document.getElementById(PREANALISE_ID);
    if (ex) { _btnPre = ex; if (_preFeito) _bloquearPreanalise(); return; }
    var btn = document.createElement('button');
    btn.id = PREANALISE_ID; btn.type = 'button';
    btn.textContent = '\u{25B6} Pr\u00E9-an\u00E1lise';
    btn.setAttribute('aria-label', 'AuditJE \u2014 iniciar pr\u00E9-an\u00E1lise dos documentos apresentados');
    Object.assign(btn.style, {
      order: '-1', marginBottom: '2px', padding: '6px 9px', border: '0', borderRadius: '10px',
      background: 'rgba(255,255,255,.94)', color: '#1a5276', cursor: 'pointer',
      font: '700 11px/1.1 -apple-system,Segoe UI,Roboto,sans-serif',
      boxShadow: '0 2px 6px rgba(0,0,0,.18)', whiteSpace: 'nowrap'
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (btn.dataset.busy) return; _iniciarPreanalise(); });
    tog.appendChild(btn); _btnPre = btn; if (_preFeito) _bloquearPreanalise();
  }
  // ── Fase 2: lista dos documentos na ordem do art. 27 (ao fim da Pre-analise) ──
  // Espelha _ordemDocumento de ui/cand.js (manter em sincronia).
  function _normOrd(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function _ordemArt27(nome) {
    var n = _normOrd(String(nome || '').replace(/\([^)]+\)/g, ''));
    if (/peticao.*inicial|inicial.*peticao/.test(n)) return 1;
    if (/\brrc\b|requerimento.*registro|registro.*candidatura/.test(n)) return 2;
    if (/identidade|\brg\b|\bcnh\b|passaporte/.test(n)) return 3;
    if (/escolaridade|diploma|historico.*escolar/.test(n)) return 4;
    if (/federal.*(1|primeiro).*grau|secao.*judiciaria|juizado.*federal/.test(n)) return 5;
    if (/federal.*(2|segundo).*grau|tribunal.*regional.*federal|\btrf\b/.test(n)) return 6;
    if (/estadual.*(1|primeiro).*grau/.test(n)) return 7;
    if (/estadual.*(2|segundo).*grau/.test(n)) return 8;
    if (/prerrogativa/.test(n)) return 9;
    if (/desincompat/.test(n)) return 10;
    if (/declarac.*bens|bens.*declarac/.test(n)) return 11;
    if (/relatorio.*requisito|requisito.*registro/.test(n)) return 12;
    return 99;
  }
  var _ORDEM_INFO = {
    1:  { inc: '',      req: 'Petição do pedido de registro' },
    2:  { inc: '',      req: 'Requerimento de registro (RRC)' },
    3:  { inc: 'VI',    req: 'Documento oficial de identificação' },
    4:  { inc: 'IV',    req: 'Prova de escolaridade / alfabetização' },
    5:  { inc: 'III-a', req: 'Criminal Federal 1º grau' },
    6:  { inc: 'III-a', req: 'Criminal Federal 2º grau' },
    7:  { inc: 'III-b', req: 'Criminal Estadual 1º grau' },
    8:  { inc: 'III-b', req: 'Criminal Estadual 2º grau' },
    9:  { inc: 'III-c', req: 'Foro por prerrogativa de função' },
    10: { inc: 'V',     req: 'Prova de desincompatibilização' },
    11: { inc: 'I',     req: 'Declaração de bens (CANDex)' },
    12: { inc: '',      req: 'Relatório de requisitos' },
    99: { inc: '',      req: 'Fora dos requisitos do art. 27' }
  };
  function _cssLista() {
    if (document.getElementById('ajl-css')) return;
    var st = document.createElement('style');
    st.id = 'ajl-css';
    st.textContent = [
      '#ajl-bg{position:fixed;inset:0;z-index:2147483647;background:rgba(20,30,45,.45);display:flex;align-items:center;justify-content:center}',
      '.ajl-modal{width:330px;max-width:92vw;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(20,40,70,.3);text-align:center;font:14px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:#1e2430;overflow:hidden}',
      '.ajl-ic{width:46px;height:46px;border-radius:50%;background:#dcfce7;color:#047857;display:flex;align-items:center;justify-content:center;font-size:24px;margin:20px auto 10px}',
      '.ajl-tt{font-weight:700;font-size:16px}',
      '.ajl-tx{font-size:13px;color:#57606a;margin:4px 16px 16px}',
      '.ajl-ok{background:linear-gradient(135deg,#1a5276,#2980b9);color:#fff;border:0;border-radius:9px;padding:9px 30px;font-size:13.5px;font-weight:700;cursor:pointer;margin:0 0 16px}',
      '#ajl-panel{position:sticky;top:0;z-index:60;width:auto;max-height:calc(100vh - 110px);display:flex;flex-direction:column;background:#fff;border:0;border-bottom:2px solid #cfd7e3;border-radius:0;box-shadow:0 6px 14px rgba(20,40,70,.10);overflow:hidden;font:14px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:#1e2430}',
      '.ajl-cab{background:linear-gradient(135deg,#1a5276,#2980b9);color:#fff;padding:12px 15px;flex:0 0 auto}',
      '.ajl-cab .t1{display:flex;align-items:center;gap:8px}',
      '.ajl-cab .tit{font-weight:700;font-size:15px}',
      '.ajl-cab .x{margin-left:auto;cursor:pointer;border:0;background:none;color:#fff;font-size:16px;opacity:.85}',
      '.ajl-cab .sub{font-size:12px;opacity:.9;margin-top:3px}',
      '.ajl-plac{display:flex;gap:6px;flex-wrap:wrap;padding:9px 14px;background:#f6f8fb;border-bottom:1px solid #e6e9ef;flex:0 0 auto}',
      '.ajl-pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid #dbe3ef;background:#eef2f9;color:#334155}',
      '.ajl-dot{width:8px;height:8px;border-radius:50%}',
      '.ajl-body{overflow-y:auto;flex:1 1 auto;min-height:0}',
      '.ajl-cap{padding:8px 14px 3px;font-size:10.5px;color:#8a94a6;text-transform:uppercase;letter-spacing:.5px}',
      '.ajl-list{list-style:none;margin:0;padding:0}',
      '.ajl-row{display:flex;align-items:flex-start;gap:9px;padding:9px 14px;border-left:4px solid transparent}',
      '.ajl-row + .ajl-row{border-top:1px solid #eef0f4}',
      '.ajl-row.ok{border-left-color:#10b981}.ajl-row.cf{border-left-color:#f59e0b}.ajl-row.pd{border-left-color:#ef4444}.ajl-row.na{border-left-color:#cbd5e1}',
      '.ajl-row:hover{background:#f8fafc}',
      '.ajl-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:7px;border:1px solid;margin-top:1px;white-space:nowrap;cursor:pointer}',
      '.ajl-chip.ok{background:#dcfce7;color:#047857;border-color:#a7f3d0}.ajl-chip.cf{background:#fef3c7;color:#92400e;border-color:#fde68a}.ajl-chip.pd{background:#fee2e2;color:#b91c1c;border-color:#fecaca}.ajl-chip.na{background:#eef1f6;color:#475569;border-color:#d0d7de}',
      '.ajl-meio{flex:1 1 auto;min-width:0}',
      '.ajl-nome{font-weight:600;font-size:13.5px;color:#1d4ed8;cursor:pointer;text-decoration:none;display:inline-block}',
      '.ajl-nome:hover{text-decoration:underline}',
      '.ajl-lk{font-size:10px;color:#93a3c4;margin-left:3px}',
      '.ajl-req{font-size:11.5px;color:#57606a;margin-top:1px}',
      '.ajl-inc{display:inline-block;background:#f1f5f9;color:#475569;font-weight:700;font-size:10px;padding:1px 6px;border-radius:5px;margin-right:5px}',
      '.ajl-auto{font-size:11px;color:#8a94a6;margin-top:3px}.ajl-auto b{color:#6b7280}',
      '.ajl-auto.al{color:#b91c1c}.ajl-auto.al b{color:#b91c1c}',
      '.ajl-id{flex:0 0 auto;font:600 10.5px ui-monospace,Menlo,monospace;color:#94a3b8;margin-top:2px;white-space:nowrap}',
      '.ajl-sem{border-top:1px solid #e6e9ef;background:#fcfcfd;padding:9px 14px}',
      '.ajl-sem .st{font-size:10.5px;color:#8a94a6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}',
      '.ajl-sem .sr{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:2px 0;color:#374151}',
      '.ajl-rod{padding:8px 14px;border-top:1px solid #e6e9ef;background:#f6f8fb;font-size:11px;color:#8a94a6;flex:0 0 auto;display:flex;justify-content:space-between}.ajl-rod b{color:#1a5276}',
      '.ajl-vazio{padding:20px 14px;text-align:center;color:#8a94a6;font-size:13px}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }
  var _listaEl = null;
  function _fecharLista() { _listaEl = null; var p = document.getElementById('ajl-panel'); if (p) p.remove(); }
  function _reinjetarLista() {
    if (!_listaEl || document.getElementById('ajl-panel')) return;
    var tl = _timelineContainer();
    if (tl && tl.insertBefore) tl.insertBefore(_listaEl, tl.firstChild);
  }
  function _abrirDocumento(docId) {
    var docs = _coletarDocs();
    for (var i = 0; i < docs.length; i++) {
      if (String(docs[i].docId) === String(docId) && docs[i].anchor) { docs[i].anchor.click(); return; }
    }
  }
  function _finalizarPreanalise() {
    _cssLista();
    if (document.getElementById('ajl-bg')) return;
    var bg = document.createElement('div');
    bg.id = 'ajl-bg';
    bg.innerHTML = '<div class="ajl-modal">'
      + '<div class="ajl-ic">✓</div>'
      + '<div class="ajl-tt">Pré-análise finalizada</div>'
      + '<div class="ajl-tx">Os documentos foram reordenados na ordem do art. 27.<br>Clique OK para prosseguir.</div>'
      + '<button class="ajl-ok" type="button">OK</button>'
      + '</div>';
    document.body.appendChild(bg);
    var ok = bg.querySelector('.ajl-ok');
    ok.addEventListener('click', function () { bg.remove(); _preanaliseOk(); _bloquearPreanalise(); _montarLista(); });
    try { ok.focus(); } catch (e) { /* noop */ }
  }
  function _montarLista() {
    _cssLista();
    var _scPrev = 0, _pOld = document.getElementById('ajl-panel');
    if (_pOld) { var _bOld = _pOld.querySelector('.ajl-body'); if (_bOld) _scPrev = _bOld.scrollTop; }
    _fecharLista();
    var docs = _coletarDocs();
    var itens = [];
    for (var i = 0; i < docs.length; i++) {
      var v = _vereditos.get(String(docs[i].docId));
      if (!v) continue;
      var raw = (docs[i].anchor && (docs[i].anchor.textContent || '').trim()) || v.nome || ('Doc ' + docs[i].docId);
      var nome = raw.replace(/^\d{5,}\s*[-–]\s*/, '').trim() || raw;
      itens.push({ docId: String(docs[i].docId), nome: nome, ord: _ordemArt27(nome), v: v });
    }
    itens.sort(function (a, b) { return a.ord - b.ord; });
    var c = { ok: 0, conferir: 0, pendencia: 0, na: 0 };
    itens.forEach(function (it) { if (c[it.v.estado] != null) c[it.v.estado]++; });
    var naoApres = (_resumo && _resumo.naoApresentados) ? _resumo.naoApresentados : [];
    var naoSeAplica = (_resumo && _resumo.naoSeAplica) ? _resumo.naoSeAplica : [];
    var linhas = itens.map(function (it) {
      var est = _ESTADO[it.v.estado] ? it.v.estado : 'na';
      var cls = est === 'pendencia' ? 'pd' : est === 'conferir' ? 'cf' : est === 'ok' ? 'ok' : 'na';
      var E = _ESTADO[est];
      var info = _ORDEM_INFO[it.ord] || _ORDEM_INFO[99];
      var motivo = it.v.motivo || it.v.label || '';
      return '<li class="ajl-row ' + cls + '">'
        + '<span class="ajl-chip ' + cls + '">' + E.emoji + ' ' + _esc(E.txt) + '</span>'
        + '<div class="ajl-meio">'
          + '<a class="ajl-nome" data-doc="' + _esc(it.docId) + '">' + _esc(it.nome) + '<span class="ajl-lk">↗</span></a>'
          + '<div class="ajl-req">' + (info.inc ? '<span class="ajl-inc">' + _esc(info.inc) + '</span>' : '') + _esc(info.req) + '</div>'
          + (motivo ? '<div class="ajl-auto' + (cls === 'pd' ? ' al' : '') + '"><b>Leitura automática:</b> ' + _esc(motivo) + '</div>' : '')
        + '</div>'
        + '<span class="ajl-id">ID ' + _esc(it.docId) + '</span>'
      + '</li>';
    }).join('');
    var semdoc = (naoApres.length || naoSeAplica.length)
      ? '<div class="ajl-sem"><div class="st">Requisitos sem documento na árvore</div>'
        + naoApres.map(function (t) { return '<div class="sr">' + _ESTADO.pendencia.emoji + ' ' + _esc(t) + '</div>'; }).join('')
        + naoSeAplica.map(function (t) { return '<div class="sr">' + _ESTADO.na.emoji + ' ' + _esc(t) + ' <span style="color:#8a94a6">(não se aplica)</span></div>'; }).join('')
        + '</div>'
      : '';
    var plac = '<span class="ajl-pill">' + itens.length + ' documentos</span>'
      + '<span class="ajl-pill"><span class="ajl-dot" style="background:#10b981"></span> ' + c.ok + ' OK</span>'
      + (c.conferir ? '<span class="ajl-pill"><span class="ajl-dot" style="background:#f59e0b"></span> ' + c.conferir + ' conferir</span>' : '')
      + (c.pendencia ? '<span class="ajl-pill"><span class="ajl-dot" style="background:#ef4444"></span> ' + c.pendencia + ' pendência</span>' : '')
      + (naoApres.length ? '<span class="ajl-pill">' + naoApres.length + ' não apresentado</span>' : '');
    var p = document.createElement('div');
    p.id = 'ajl-panel';
    p.innerHTML =
      '<div class="ajl-cab"><div class="t1"><span style="font-size:15px">⚖️</span>'
        + '<span class="tit">Pré-análise — ordem do art. 27</span>'
        + '<button class="x" type="button" title="Fechar">✕</button></div>'
        + '<div class="sub">Documentos ordenados pela ordem do art. 27</div></div>'
      + '<div class="ajl-plac">' + plac + '</div>'
      + '<div class="ajl-body">'
        + '<div class="ajl-cap">Ordenado pela ordem do art. 27 · Res. TSE 23.609/2019</div>'
        + (itens.length ? '<ul class="ajl-list">' + linhas + '</ul>' : '<div class="ajl-vazio">Nenhum documento auditado encontrado.</div>')
        + semdoc
      + '</div>'
      + '<div class="ajl-rod"><span>Clique no nome do documento para abri-lo</span><b>AuditJE</b></div>';
    var _tl = _timelineContainer();
    if (_tl && _tl !== document.body && _tl.insertBefore) _tl.insertBefore(p, _tl.firstChild);
    else document.body.appendChild(p);
    _listaEl = p;
    p.querySelector('.x').addEventListener('click', _fecharLista);
    var nomes = p.querySelectorAll('.ajl-nome');
    for (var j = 0; j < nomes.length; j++) {
      nomes[j].addEventListener('click', function (ev) { ev.preventDefault(); _abrirDocumento(this.getAttribute('data-doc')); });
    }
    var rows = p.querySelectorAll('.ajl-row');
    for (var q = 0; q < rows.length; q++) {
      var ch = rows[q].querySelector('.ajl-chip');
      var nm = rows[q].querySelector('.ajl-nome');
      if (!ch || !nm) continue;
      ch.setAttribute('data-doc', nm.getAttribute('data-doc'));
      ch.title = 'Ver análise / marcar';
      ch.addEventListener('click', function () { var id = this.getAttribute('data-doc'); this.__ajV = _vereditos.get(id); _abrirCard(id, this); });
    }
    var _bNew = p.querySelector('.ajl-body'); if (_bNew) _bNew.scrollTop = _scPrev;
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'AUDITJE_RESUMO_ART27') return;
    var _eraPre = !!(_btnPre && _btnPre.dataset && _btnPre.dataset.busy);
    _resumo = d; _atualizarBadge(); _resetPreanalise();
    if (_eraPre) _finalizarPreanalise();
  });
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'CHATJE_PREANALISE_BLOQUEADA') return;
    _bloquearPreanalise();
  });


  // Observa a árvore para re-injetar chips/lista quando o PJe re-renderiza.
  // Resiliente à troca do NÓ da timeline: se o PJe substituir o container,
  // o observer reconecta no container novo (re-injeção deixa de depender do intervalo).
  var _obsTL = new MutationObserver(function () { _agendar(); _reinjetarLista(); });
  var _obsAlvo = null;
  function _ensureObserver() {
    var tl = _timelineContainer();
    if (!tl || tl === document.body || tl === _obsAlvo) return;
    try { _obsTL.disconnect(); } catch (e) { /* noop */ }
    try { _obsTL.observe(tl, { childList: true, subtree: true }); _obsAlvo = tl; } catch (e) { /* noop */ }
  }
  _ensureObserver();
  // Intervalo vira rede de segurança: reataca o observer + reconcilia periodicamente.
  var LISTA_BTN_ID = 'auditje-btn-lista';
  function _garantirBotaoLista() {
    var tog = _toggleEl(); if (!tog || !_vereditos.size) return;
    if (document.getElementById(LISTA_BTN_ID)) return;
    var btn = document.createElement('button');
    btn.id = LISTA_BTN_ID; btn.type = 'button';
    btn.textContent = '📋 Lista art. 27';
    btn.setAttribute('aria-label', 'AuditJE — reabrir a lista de documentos na ordem do art. 27');
    Object.assign(btn.style, {
      order: '-1', marginBottom: '2px', padding: '6px 9px', border: '0', borderRadius: '10px',
      background: 'rgba(255,255,255,.94)', color: '#1a5276', cursor: 'pointer',
      font: '700 11px/1.1 -apple-system,Segoe UI,Roboto,sans-serif',
      boxShadow: '0 2px 6px rgba(0,0,0,.18)', whiteSpace: 'nowrap'
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); _montarLista(); });
    tog.appendChild(btn);
  }
  setInterval(function () { _ensureObserver(); _agendar(); _garantirBotaoPreanalise(); _garantirBotaoLista(); _reinjetarLista(); if (_resumo) _atualizarBadge(); }, 3000);
  _garantirBotaoPreanalise();

  console.log('[AuditJE arvore-cards v' + VERSAO + '] carregado em ' + location.href.slice(0, 70));
})();
