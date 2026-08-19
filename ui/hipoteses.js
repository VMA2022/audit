// hipoteses.js — Sistema de "Sugestões de texto" (snippets) do Relatório CAND.
// Extraído de ui/cand.js sem alteração de lógica. Biblioteca de snippets +
// overlay do usuário (localStorage) + painel de gestão (renderPainelHipoteses).
// Depende de globais de config.js (_S, _esc) e de ui/cand.js (_ITENS_CAND).
// Carregado ANTES de ui/cand.js em chat.html.

// ── Hipóteses de texto para inserção rápida no textarea de cada item CAND ──────
// Chave = item.id; valor = array de strings para o menu de snippets.
const _SNIPPETS_CAND = {
    identidade: [
        'Após diligência, o(a) candidato(a) apresentou cópia do documento oficial de identificação, devidamente juntada(s) aos autos – ID nº',
        'Após diligência, o(a) candidato(a) não apresentou cópia do documento oficial de identificação – ID nº',
    ],
    escolaridade: [
        'Após diligência, o(a) candidato(a) apresentou prova de alfabetização, devidamente juntada(s) aos autos – ID nº',
        'Após diligência, o(a) candidato(a) não apresentou prova de alfabetização – ID nº, tendo decorrido o prazo para manifestação, conforme certidão ID nº  .',
        'Após diligência, o(a) candidato(a) apresentou documento como prova de alfabetização – ID nº  . No entanto, s.m.j, o documento apresentado não é suficiente para comprovar o preenchimento do requisito.',
    ],
    federal_1grau: [
        'Após diligência, o(a) candidato(a) apresentou a certidão, devidamente juntada(s) aos autos – ID nº',
        'Certidão em desconformidade com a Resolução – TSE nº 23.609/19.',
    ],
    federal_2grau: [
        'Após diligência, o(a) candidato(a) apresentou a certidão, devidamente juntada(s) aos autos – ID nº',
        'Certidão em desconformidade com a Resolução – TSE nº 23.609/19.',
    ],
    estadual_1grau: [
        'Após diligência, o(a) candidato(a) apresentou a certidão, devidamente juntada(s) aos autos – ID nº',
        'Certidão em desconformidade com a Resolução – TSE nº 23.609/19.',
    ],
    estadual_1grau_eproc: [
        'Após diligência, o(a) candidato(a) apresentou a certidão, devidamente juntada(s) aos autos – ID nº',
        'Certidão em desconformidade com a Resolução – TSE nº 23.609/19.',
    ],
    estadual_2grau: [
        'Após diligência, o(a) candidato(a) apresentou a certidão, devidamente juntada(s) aos autos – ID nº',
        'Certidão em desconformidade com a Resolução – TSE nº 23.609/19.',
    ],
    bens: [
        'O(A) candidato(a) declara não possuir bens, conforme informações obtidas no Sistema de Candidaturas – CAND 2026.',
        'Após diligência, o(a) candidato(a) apresentou relação atual de bens, devidamente juntada(s) aos autos – ID nº',
        'Após diligência, o(a) candidato(a) não apresentou relação atual de bens – ID nº  , tendo decorrido o prazo para manifestação, conforme certidão ID nº .',
    ],
    convencao: [
        'Candidatura escolhida em convenção conforme ata juntada aos autos do processo PJe nº {processo}.',
        'Número do processo de convenção não localizado automaticamente — preencher manualmente.',
    ],
    peticao_inicial: [
        'Petição inicial regular, subscrita nos termos da Resolução – TSE nº 23.609/19.',
        'Petição inicial juntada aos autos – ID nº {ID}.',
    ],
    rrc: [
        'RRC preenchido e assinado, em conformidade com a Resolução – TSE nº 23.609/19.',
        'RRC juntado aos autos – ID nº {ID}.',
    ],
    prerrogativa: [
        'NÃO SE APLICA — Certidão de foro por prerrogativa de função.',
        'NÃO APRESENTADO — Certidão de foro por prerrogativa de função.',
        'Certidão de foro por prerrogativa de função — NADA CONSTA.',
        'Certidão de foro por prerrogativa de função — CONSTA.',
        'Após diligência, o(a) candidato(a) apresentou a certidão de foro por prerrogativa de função, devidamente juntada(s) aos autos – ID nº {ID}.',
    ],
    desincompat: [
        'NÃO SE APLICA — Candidato sem obrigatoriedade de desincompatibilização.',
        'NÃO APRESENTADO — Prova de desincompatibilização.',
        'Prova de desincompatibilização — NADA CONSTA.',
        'Prova de desincompatibilização — CONSTA.',
        'Após diligência, o(a) candidato(a) apresentou prova de desincompatibilização, devidamente juntada(s) aos autos – ID nº {ID}.',
    ],
    divergencias: [
        'SEM DIVERGÊNCIA — cadastro eleitoral regular.',
        'COM DIVERGÊNCIA — regularizar antes do deferimento.',
        'Após diligência, o(a) candidato(a) sanou as divergências identificadas no cadastro – ID nº {ID}.',
    ],
};

// Texto pré-marcado como ★ padrão de cada item (usado quando o usuário ainda
// não escolheu um padrão na aba Hipóteses). O usuário pode trocar ou remover o ★.
// O valor deve ser idêntico a um texto do array correspondente em _SNIPPETS_CAND.
const _SNIPPETS_PADRAO = {
    convencao:       'Candidatura escolhida em convenção conforme ata juntada aos autos do processo PJe nº {processo}.',
    peticao_inicial: 'Petição inicial regular, subscrita nos termos da Resolução – TSE nº 23.609/19.',
    rrc:             'RRC preenchido e assinado, em conformidade com a Resolução – TSE nº 23.609/19.',
    prerrogativa:    'NÃO SE APLICA — Certidão de foro por prerrogativa de função.',
    desincompat:     'NÃO SE APLICA — Candidato sem obrigatoriedade de desincompatibilização.',
    divergencias:    'SEM DIVERGÊNCIA — cadastro eleitoral regular.',
};

// ── Popup de seleção de hipóteses de texto (Fase 1 — apenas seleção) ─────────
// Abre um modal com os textos sugeridos do item. "Inserir" joga o texto no
// campo de observação (via callback onInserir) e "Copiar" copia para a área de
// transferência. Cadastro/edição virão na aba "Hipóteses" (Fase 2).
function _abrirPopupHipoteses(item, textos, onInserir) {
    document.getElementById('hip-popup-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hip-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(3,8,18,.62);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'width:100%;max-width:460px;max-height:82vh;overflow:auto;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:15px;box-shadow:0 12px 40px rgba(0,0,0,.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:11px;';
    hdr.innerHTML = `<div>
        <div style="font-weight:600;font-size:14px;color:var(--text);">Sugestões de texto</div>
        <div style="font-size:11px;color:var(--text-muted);">${item.titulo} · selecione para inserir</div>
      </div>`;
    const btnX = document.createElement('button');
    btnX.type = 'button';
    btnX.setAttribute('aria-label', 'Fechar');
    btnX.textContent = '✕';
    btnX.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px;';
    hdr.appendChild(btnX);
    modal.appendChild(hdr);

    const lista = document.createElement('div');
    lista.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    (textos || []).forEach(snip => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 10px;';
        const txt = document.createElement('div');
        txt.textContent = snip;
        txt.style.cssText = 'flex:1;font-size:12px;line-height:1.5;color:var(--text);';
        const acoes = document.createElement('div');
        acoes.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
        const btnIns = document.createElement('button');
        btnIns.type = 'button';
        btnIns.textContent = '⬇ Inserir';
        btnIns.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--accent);background:var(--surface2);color:var(--accent);cursor:pointer;font-weight:600;white-space:nowrap;';
        btnIns.addEventListener('click', () => { onInserir(snip); overlay.remove(); });
        const btnCopy = document.createElement('button');
        btnCopy.type = 'button';
        btnCopy.setAttribute('aria-label', 'Copiar');
        btnCopy.textContent = '📋';
        btnCopy.style.cssText = 'font-size:12px;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
        btnCopy.addEventListener('click', () => {
            const ta = document.createElement('textarea');
            ta.value = snip; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.focus(); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
            btnCopy.textContent = ok ? '✅' : '⚠️';
            setTimeout(() => { btnCopy.textContent = '📋'; }, 1500);
        });
        acoes.appendChild(btnIns); acoes.appendChild(btnCopy);
        row.appendChild(txt); row.appendChild(acoes);
        lista.appendChild(row);
    });
    modal.appendChild(lista);

    const rod = document.createElement('div');
    rod.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);';
    const btnGerenciar = document.createElement('button');
    btnGerenciar.type = 'button';
    btnGerenciar.textContent = '⚙ Gerenciar na aba Sugestões de texto';
    btnGerenciar.style.cssText = 'font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;';
    btnGerenciar.addEventListener('click', () => {
        overlay.remove();
        if (typeof _ativarSecao === 'function') _ativarSecao('hipoteses');
    });
    const btnFechar = document.createElement('button');
    btnFechar.type = 'button';
    btnFechar.textContent = 'Fechar';
    btnFechar.style.cssText = 'font-size:12px;padding:6px 13px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;';
    rod.appendChild(btnGerenciar);
    rod.appendChild(btnFechar);
    modal.appendChild(rod);

    const fechar = () => overlay.remove();
    btnX.addEventListener('click', fechar);
    btnFechar.addEventListener('click', fechar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    document.addEventListener('keydown', function _esc(ev) {
        if (ev.key === 'Escape') { fechar(); document.removeEventListener('keydown', _esc); }
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ═════════════════════════════════════════════════════════════════════════════
// HIPÓTESES DE TEXTO — overlay (localStorage) + aba de gestão (Fase 2)
// ═════════════════════════════════════════════════════════════════════════════
// localStorage['chatje_snippets_custom'] =
//   { "<itemId>": { added:[...], hidden:[...], edited:{ "<orig>":"<novo>" } } }
// Lista efetiva de um item = padrões (_SNIPPETS_CAND) mesclados com o overlay.
const _HIP_KEY = 'chatje_snippets_custom';
let _hipItemSel = null;

function _lerOverlayHip() {
    try { return JSON.parse(localStorage.getItem(_HIP_KEY) || '{}') || {}; }
    catch (e) { return {}; }
}
function _salvarOverlayHip(ov) {
    try { localStorage.setItem(_HIP_KEY, JSON.stringify(ov)); } catch (e) {}
}
function _ovItemHip(ov, itemId) {
    if (!ov[itemId]) ov[itemId] = {};
    const o = ov[itemId];
    o.added  = o.added  || [];
    o.hidden = o.hidden || [];
    o.edited = o.edited || {};
    return o;
}

// Lista efetiva (padrões + overlay) com metadados por texto.
function _hipEfetivas(itemId) {
    const defaults = _SNIPPETS_CAND[itemId] || [];
    const ov = _lerOverlayHip()[itemId] || {};
    const edited = ov.edited || {};
    const hidden = ov.hidden || [];
    const added  = ov.added  || [];
    const out = [];
    defaults.forEach(orig => {
        out.push({
            text:    (edited[orig] != null ? edited[orig] : orig),
            active:  !hidden.includes(orig),
            source:  'default',
            id:      orig,
            editado: (edited[orig] != null),
        });
    });
    added.forEach(t => {
        out.push({ text: t, active: !hidden.includes(t), source: 'custom', id: t, editado: false });
    });
    return out;
}
// Só os textos ativos — consumido pelo popup de seleção do item.
function _hipAtivas(itemId) {
    return _hipEfetivas(itemId).filter(x => x.active).map(x => x.text);
}

// ── Mutações do overlay ──────────────────────────────────────────────────────
function _hipSetAtivo(itemId, id, ativo) {
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    o.hidden = o.hidden.filter(h => h !== id);
    if (!ativo) o.hidden.push(id);
    _salvarOverlayHip(ov);
}
function _hipAdicionar(itemId, texto) {
    texto = (texto || '').trim(); if (!texto) return;
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    if (!o.added.includes(texto)) o.added.push(texto);
    o.hidden = o.hidden.filter(h => h !== texto);
    _salvarOverlayHip(ov);
}
function _hipRemoverCustom(itemId, texto) {
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    o.added  = o.added.filter(t => t !== texto);
    o.hidden = o.hidden.filter(h => h !== texto);
    if (o.padrao === texto) delete o.padrao;
    _salvarOverlayHip(ov);
}
function _hipEditar(itemId, item, novoTexto) {
    novoTexto = (novoTexto || '').trim(); if (!novoTexto) return;
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    if (item.source === 'default') {
        if (novoTexto === item.id) delete o.edited[item.id];
        else o.edited[item.id] = novoTexto;
    } else {
        const i = o.added.indexOf(item.id);
        if (i >= 0) o.added[i] = novoTexto;
        const h = o.hidden.indexOf(item.id);
        if (h >= 0) o.hidden[h] = novoTexto;
        if (o.padrao === item.id) o.padrao = novoTexto;
    }
    _salvarOverlayHip(ov);
}
function _hipRestaurarPadrao(itemId, orig) {
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    delete o.edited[orig];
    _salvarOverlayHip(ov);
}
// Restaura os textos nativos de um item: desfaz edições e reativa os nativos
// (os textos personalizados do usuário são mantidos).
function _hipRestaurarNativosItem(itemId) {
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    const nativos = _SNIPPETS_CAND[itemId] || [];
    o.edited = {};
    o.hidden = (o.hidden || []).filter(h => !nativos.includes(h));
    _salvarOverlayHip(ov);
}

// ── Caminho B: texto padrão por item (fonte única) ───────────────────────────
// Itens de certidão criminal seguem gerados pelo código (análise OCR rica).
const _HIP_ITENS_CODIGO = new Set(['federal_1grau', 'federal_2grau', 'estadual_1grau', 'estadual_1grau_eproc', 'estadual_2grau']);

// Id do texto padrão efetivo do item: overlay do usuário, ou padrão de código,
// ou null (sentinela '__none__' = usuário removeu o padrão explicitamente).
function _hipPadraoId(itemId) {
    const ov = _lerOverlayHip()[itemId] || {};
    if (ov.padrao === '__none__') return null;
    if (ov.padrao) return ov.padrao;
    return _SNIPPETS_PADRAO[itemId] || null;
}
// Define/alterna qual texto (por id) é o padrão do item. Clicar no padrão atual remove.
function _hipSetPadrao(itemId, id) {
    const ov = _lerOverlayHip(); const o = _ovItemHip(ov, itemId);
    o.padrao = (_hipPadraoId(itemId) === id) ? '__none__' : id;
    _salvarOverlayHip(ov);
}
// Retorna o texto padrão (já com edições) do item, ou null se não houver/estiver inativo.
function _hipTextoPadrao(itemId) {
    const pid = _hipPadraoId(itemId);
    if (!pid) return null;
    const found = _hipEfetivas(itemId).find(x => x.id === pid && x.active);
    return found ? found.text : null;
}
// Substitui os marcadores {ID} e {processo} pelos valores reais.
function _injetarMarcadores(texto, resultado, processoAssociado) {
    const idNum = (resultado && resultado.id != null) ? String(resultado.id) : '';
    const proc  = processoAssociado || '';
    return String(texto).replace(/\{ID\}/gi, idNum).replace(/\{processo\}/gi, proc);
}

// ── Import / Export (JSON) ───────────────────────────────────────────────────
function _hipExportar() {
    const dados = JSON.stringify(_lerOverlayHip(), null, 2);
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'auditje-hipoteses.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}
function _hipImportar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.style.display = 'none';
    inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const obj = JSON.parse(rd.result);
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                    if (confirm('Importar substitui os textos personalizados atuais. Continuar?')) {
                        _salvarOverlayHip(obj);
                        renderPainelHipoteses();
                    }
                } else { alert('Arquivo inválido.'); }
            } catch (e) { alert('Não foi possível ler o JSON.'); }
        };
        rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(() => inp.remove(), 1000);
}

// ── Aba "Hipóteses" — master-detail ──────────────────────────────────────────
function renderPainelHipoteses() {
    const painel = document.getElementById('painel-hipoteses');
    if (!painel) return;
    if (!_hipItemSel) _hipItemSel = 'identidade';
    painel.innerHTML = '';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;';
    top.innerHTML = `<div>
        <div style="font-weight:700;font-size:14px;color:var(--text);">Gerenciar sugestões de texto</div>
        <div style="font-size:11px;color:var(--text-muted);">Ative, edite ou crie textos por item — reflete no popup do item no relatório CAND.</div>
      </div>`;
    const acTop = document.createElement('div');
    acTop.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
    const btnImp = document.createElement('button');
    btnImp.type = 'button'; btnImp.textContent = '⬆ Importar';
    btnImp.style.cssText = 'font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
    btnImp.addEventListener('click', _hipImportar);
    const btnExp = document.createElement('button');
    btnExp.type = 'button'; btnExp.textContent = '⬇ Exportar';
    btnExp.style.cssText = 'font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
    btnExp.addEventListener('click', _hipExportar);
    acTop.appendChild(btnImp); acTop.appendChild(btnExp);
    top.appendChild(acTop);
    painel.appendChild(top);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:320px 1fr;gap:10px;align-items:start;';

    // Coluna esquerda: itens do CAND
    const lista = document.createElement('div');
    lista.style.cssText = 'border:1px solid var(--border);border-radius:8px;overflow:hidden;';
    _ITENS_CAND.forEach(it => {
        const n = _hipAtivas(it.id).length;
        const sel = (it.id === _hipItemSel);
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:6px 8px;cursor:pointer;font-size:11px;font-family:'IBM Plex Mono',monospace;border-left:2px solid ${sel ? 'var(--accent)' : 'transparent'};background:${sel ? 'var(--accent-dim,rgba(56,189,248,.12))' : 'transparent'};color:${sel ? 'var(--text)' : 'var(--text-muted)'};`;
        const tit = document.createElement('span');
        tit.textContent = it.titulo;
        tit.style.cssText = 'white-space:normal;line-height:1.35;word-break:break-word;';
        const cnt = document.createElement('span');
        cnt.textContent = String(n);
        cnt.style.cssText = `flex-shrink:0;color:${n > 0 ? 'var(--accent)' : 'var(--text-muted)'};`;
        row.appendChild(tit); row.appendChild(cnt);
        row.addEventListener('click', () => { _hipItemSel = it.id; renderPainelHipoteses(); });
        lista.appendChild(row);
    });
    grid.appendChild(lista);

    // Coluna direita: detalhe do item selecionado
    const det = document.createElement('div');
    det.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:10px;';
    const itemSel = _ITENS_CAND.find(i => i.id === _hipItemSel) || _ITENS_CAND[0];
    const efetivas = _hipEfetivas(itemSel.id);
    const titDet = document.createElement('div');
    titDet.style.cssText = 'font-weight:600;font-size:13px;color:var(--text);margin-bottom:2px;';
    titDet.textContent = itemSel.titulo;
    det.appendChild(titDet);
    const subDet = document.createElement('div');
    subDet.style.cssText = 'font-size:10px;color:var(--text-muted);margin-bottom:9px;';
    subDet.textContent = `${efetivas.filter(x => x.active).length} ativo(s) de ${efetivas.length} — só os ativos aparecem no popup do item`;
    det.appendChild(subDet);

    if (efetivas.length === 0) {
        const vazio = document.createElement('div');
        vazio.style.cssText = 'font-size:11px;color:var(--text-muted);padding:4px 0 8px;';
        vazio.textContent = 'Nenhum texto ainda. Crie um abaixo.';
        det.appendChild(vazio);
    }

    efetivas.forEach(ef => {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:flex-start;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:8px 9px;margin-bottom:6px;opacity:${ef.active ? '1' : '.55'};`;
        const tgl = document.createElement('button');
        tgl.type = 'button';
        tgl.setAttribute('aria-label', ef.active ? 'Desativar' : 'Ativar');
        tgl.textContent = ef.active ? '✓' : '';
        tgl.style.cssText = `flex-shrink:0;width:18px;height:18px;border-radius:4px;cursor:pointer;border:1px solid ${ef.active ? 'var(--accent)' : 'var(--border)'};background:${ef.active ? 'var(--accent-dim,rgba(56,189,248,.18))' : 'transparent'};color:var(--accent);font-size:12px;line-height:1;`;
        tgl.addEventListener('click', () => { _hipSetAtivo(itemSel.id, ef.id, !ef.active); renderPainelHipoteses(); });
        // Botão ★ — define este texto como padrão do item (Caminho B).
        // Não aparece em certidões criminais (essas seguem geradas pelo código).
        let btnStar = null;
        if (!_HIP_ITENS_CODIGO.has(itemSel.id)) {
            const _ehPadrao = _hipPadraoId(itemSel.id) === ef.id;
            btnStar = document.createElement('button');
            btnStar.type = 'button';
            btnStar.textContent = _ehPadrao ? '★' : '☆';
            btnStar.title = _ehPadrao ? 'Texto padrão do item (clique para remover)' : 'Definir como texto padrão do item';
            btnStar.setAttribute('aria-label', btnStar.title);
            btnStar.style.cssText = `flex-shrink:0;background:none;border:none;cursor:pointer;font-size:14px;line-height:1.2;padding:0 2px;color:${_ehPadrao ? '#f5b301' : 'var(--text-muted)'};`;
            btnStar.addEventListener('click', () => { _hipSetPadrao(itemSel.id, ef.id); renderPainelHipoteses(); });
        }
        const txt = document.createElement('div');
        txt.style.cssText = 'flex:1;font-size:11.5px;line-height:1.45;color:var(--text);';
        txt.textContent = ef.text;
        const tag = document.createElement('span');
        tag.textContent = ef.source === 'custom' ? ' meu' : (ef.editado ? ' nativo · editado' : ' nativo');
        tag.style.cssText = `font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;margin-left:4px;color:${(ef.source === 'custom' || ef.editado) ? 'var(--accent)' : 'var(--text-muted)'};`;
        txt.appendChild(tag);
        // Indica o texto nativo (original) quando um item nativo foi editado
        if (ef.source === 'default' && ef.editado) {
            const nat = document.createElement('div');
            nat.style.cssText = 'margin-top:5px;padding:4px 7px;background:var(--surface2);border-left:2px solid var(--border);border-radius:0 4px 4px 0;font-size:10px;color:var(--text-muted);line-height:1.4;';
            const natL = document.createElement('span');
            natL.style.cssText = 'text-transform:uppercase;letter-spacing:.04em;font-size:8.5px;';
            natL.textContent = 'Texto nativo';
            const natT = document.createElement('div');
            natT.textContent = ef.id;
            nat.appendChild(natL); nat.appendChild(natT);
            txt.appendChild(nat);
        }
        const ac = document.createElement('div');
        ac.style.cssText = 'display:flex;gap:3px;flex-shrink:0;';
        const btnEd = document.createElement('button');
        btnEd.type = 'button'; btnEd.textContent = '✏'; btnEd.setAttribute('aria-label', 'Editar');
        btnEd.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
        btnEd.addEventListener('click', () => _hipEditarInline(row, itemSel.id, ef));
        ac.appendChild(btnEd);
        if (ef.source === 'default' && ef.editado) {
            const btnRe = document.createElement('button');
            btnRe.type = 'button'; btnRe.textContent = '↺'; btnRe.title = 'Restaurar nativo'; btnRe.setAttribute('aria-label', 'Restaurar nativo');
            btnRe.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
            btnRe.addEventListener('click', () => { _hipRestaurarPadrao(itemSel.id, ef.id); renderPainelHipoteses(); });
            ac.appendChild(btnRe);
        }
        if (ef.source === 'custom') {
            const btnRm = document.createElement('button');
            btnRm.type = 'button'; btnRm.textContent = '🗑'; btnRm.setAttribute('aria-label', 'Remover');
            btnRm.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--danger,#e5534b);cursor:pointer;';
            btnRm.addEventListener('click', () => { if (confirm('Remover este texto?')) { _hipRemoverCustom(itemSel.id, ef.id); renderPainelHipoteses(); } });
            ac.appendChild(btnRm);
        }
        row.appendChild(tgl); if (btnStar) row.appendChild(btnStar); row.appendChild(txt); row.appendChild(ac);
        det.appendChild(row);
    });

    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
    const ta = document.createElement('textarea');
    ta.rows = 2; ta.placeholder = 'Escrever um novo texto para este item…';
    ta.style.cssText = 'flex:1;font-size:11.5px;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);resize:vertical;font-family:inherit;';
    const btnAdd = document.createElement('button');
    btnAdd.type = 'button'; btnAdd.textContent = '＋ Adicionar';
    btnAdd.style.cssText = 'font-size:11.5px;padding:6px 11px;border-radius:6px;border:1px solid var(--accent);background:var(--surface2);color:var(--accent);cursor:pointer;font-weight:600;white-space:nowrap;align-self:flex-start;';
    btnAdd.addEventListener('click', () => { if (ta.value.trim()) { _hipAdicionar(itemSel.id, ta.value); renderPainelHipoteses(); } });
    addWrap.appendChild(ta); addWrap.appendChild(btnAdd);
    det.appendChild(addWrap);

    const resetWrap = document.createElement('div');
    resetWrap.style.cssText = 'margin-top:8px;text-align:right;';
    const btnReset = document.createElement('button');
    btnReset.type = 'button';
    btnReset.textContent = '↺ Restaurar textos nativos deste item';
    btnReset.style.cssText = 'font-size:10.5px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;';
    btnReset.addEventListener('click', () => {
        if (confirm('Restaurar os textos nativos deste item? Isso desfaz edições e reativa os nativos (seus textos são mantidos).')) {
            _hipRestaurarNativosItem(itemSel.id);
            renderPainelHipoteses();
        }
    });
    resetWrap.appendChild(btnReset);
    det.appendChild(resetWrap);

    grid.appendChild(det);
    painel.appendChild(grid);
}

// Edição inline de um texto (padrão ou custom) dentro da linha.
function _hipEditarInline(row, itemId, ef) {
    row.innerHTML = '';
    row.style.display = 'block';
    if (ef.source === 'default') {
        const nat = document.createElement('div');
        nat.style.cssText = 'padding:4px 7px;background:var(--surface2);border-left:2px solid var(--border);border-radius:0 4px 4px 0;font-size:10px;color:var(--text-muted);line-height:1.4;margin-bottom:6px;';
        const natL = document.createElement('span');
        natL.style.cssText = 'text-transform:uppercase;letter-spacing:.04em;font-size:8.5px;';
        natL.textContent = 'Texto nativo (referência)';
        const natT = document.createElement('div');
        natT.textContent = ef.id;
        nat.appendChild(natL); nat.appendChild(natT);
        row.appendChild(nat);
    }
    const ta = document.createElement('textarea');
    ta.value = ef.text; ta.rows = 3;
    ta.style.cssText = 'width:100%;box-sizing:border-box;font-size:11.5px;padding:7px 9px;border-radius:6px;border:1px solid var(--accent);background:var(--surface);color:var(--text);resize:vertical;font-family:inherit;';
    const ac = document.createElement('div');
    ac.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-top:6px;';
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button'; btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = 'font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;';
    btnCancel.addEventListener('click', renderPainelHipoteses);
    const btnSave = document.createElement('button');
    btnSave.type = 'button'; btnSave.textContent = 'Salvar';
    btnSave.style.cssText = 'font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--accent);background:var(--surface2);color:var(--accent);cursor:pointer;font-weight:600;';
    btnSave.addEventListener('click', () => { _hipEditar(itemId, ef, ta.value); renderPainelHipoteses(); });
    ac.appendChild(btnCancel); ac.appendChild(btnSave);
    row.appendChild(ta); row.appendChild(ac);
    ta.focus();
}
