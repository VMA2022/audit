// cand.js — Checklist CAND, certidão e relatório Art. 27
// Depende de: config.js, analysis.js, render.js

// ═════════════════════════════════════════════════════════════════════════════
// RESUMO ART. 27 — DOCUMENTAÇÃO EXIGIDA PARA REGISTRO DE CANDIDATURA
// Resolução TSE nº 23.609/2019
// ═════════════════════════════════════════════════════════════════════════════
function renderizarResumoArt27(resultados, processoAssociado) {
    resultados = _resultadosComOverrides(resultados);
    const painel = document.getElementById('painel-resumo');
    if (!painel) return;
    painel.innerHTML = '';

    // ── Busca resultado da auditoria para um tipo/padrão de nome ─────────────
    const buscar = (tipo, nomeRe) => {
        if (!tipo && nomeRe)
            return resultados.find(r => nomeRe.test(_norm(r.nome)) && r.status !== 'erro') || null;
        if (tipo === 'peticao_inicial')
            return resultados.find(r => /peticao.*inicial|inicial.*peticao/.test(_norm(r.nome)) && r.status !== 'erro') || null;
        if (tipo === 'rrc')
            return resultados.find(r => /\brrc\b|requerimento.*registro|registro.*candidatura/.test(_norm(r.nome.replace(/\([^)]+\)/g, ''))) && r.status !== 'erro') || null;
        if (tipo === 'identidade') {
            const _todos = resultados.filter(r => /identidade|rg\b|cnh\b|passaporte/i.test(r.nome) && r.status !== 'erro');
            if (_todos.length === 0) return null;
            return _todos.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);
        }
        if (tipo === 'bens')
            return resultados.find(r => /declarac.*bens|bens.*declarac/i.test(_norm(r.nome)) && r.status !== 'erro') || null;
        if (tipo === 'foro_prerrogativa')
            return resultados.find(r => /prerrogativa/i.test(r.nome) && r.status !== 'erro') || null;
        if (tipo === 'divergencias')
            return resultados.find(r => /divergencia/i.test(_norm(r.nome)) && r.status !== 'erro') || null;
        // Tipos identificados por OCR
        // federal_regional (TRF3 Abrangência) cobre tanto 1º quanto 2º grau federal
        // exec_criminal é expedida pela Justiça Estadual de 1º grau — aparece no slot estadual_1grau
        const _tiposEquiv = (t) => {
            if (t === 'federal_1grau' || t === 'federal_2grau') return [t, 'federal_regional'];
            if (t === 'estadual_1grau') return [t, 'exec_criminal'];
            return [t];
        };
        // Retorna o mais recente (maior ID) entre os candidatos — evita retornar
        // um documento antigo com status desatualizado quando há múltiplos do mesmo tipo
        const _maisRecente = (arr) => arr.length === 0 ? null
            : arr.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);

        let r = _maisRecente(resultados.filter(x => _tiposEquiv(tipo).includes(x._tipoDoc) && x.status !== 'erro'));
        if (!r) {
            r = _maisRecente(resultados.filter(x => {
                // exec_criminal juntado sob nome de 2º grau → aparece no slot estadual_2grau via fallback
                const _tipoPermitido = _tiposEquiv(tipo).includes(x._tipoDoc) ||
                    (tipo === 'estadual_2grau' && x._tipoDoc === 'exec_criminal');
                if (x._tipoDoc && !_tipoPermitido) return false;
                const n = _norm(x.nome);
                if (tipo === 'estadual_1grau') return /estadual.*(1|primeiro).*grau/.test(n);
                if (tipo === 'estadual_2grau') return /estadual.*(2|segundo).*grau/.test(n);
                if (tipo === 'federal_1grau')    return /federal.*(1|primeiro).*grau/.test(n);
                if (tipo === 'federal_2grau')    return /federal.*(2|segundo).*grau/.test(n);
                // federal_regional (TRF3 Abrangência Regional) cobre 1º e 2º grau
                if (tipo === 'federal_regional') return /federal|trf|regional/.test(n);
                if (tipo === 'desincompat')      return /desincompat/.test(n);
                if (tipo === 'escolaridade')   return /escolaridade|diploma/.test(n);
                return false;
            }));
        }
        return r || null;
    };

    // ── Classifica status de cada resultado ──────────────────────────────────
    const classificar = (r) => {
        if (!r) return { cls: 'pendente', icone: '❌', label: 'Não juntado' };
        switch (r.status) {
            case 'dispensado':                      return { cls: 'nao-aplica', icone: '⚪', label: 'Dispensado / não se aplica' };
            case 'nao_apresentado':                 return { cls: 'pendente',   icone: '❌', label: 'Não apresentado' };
            case 'nao_corresponde':                 return { cls: 'pendente',   icone: '❌', label: 'Não corresponde ao tipo esperado' };
            case 'nao_corresponde_ilegivel':        return { cls: 'ressalva',   icone: '⚠️', label: 'Juntado — ilegível, verificar' };
            case 'pdf_sem_texto':                   return { cls: 'ressalva',   icone: '⚠️', label: 'PDF sem texto — verificar manualmente' };
            case 'inconclusivo':                    return { cls: 'ressalva',   icone: '⚠️', label: 'Inconclusivo — verificar' };
            case 'corresponde_incompleto':          return { cls: 'ressalva',   icone: '⚠️', label: 'Juntado — incompleto' };
            case 'corresponde_ilegivel':            return { cls: 'ressalva',   icone: '⚠️', label: 'Juntado — ilegível' };
            case 'corresponde_incompleto_ilegivel': return { cls: 'ressalva',   icone: '⚠️', label: 'Juntado — incompleto e ilegível' };
            case 'nomenclatura_errada':            return { cls: 'ok',       icone: '📝', label: 'Juntado (nomenclatura errada no PJe)' };
            case 'nomenclatura_errada_incompleto': return { cls: 'ressalva', icone: '📝', label: 'Juntado — nomenclatura errada e incompleto' };
            case 'nomenclatura_errada_ilegivel':   return { cls: 'ressalva', icone: '📝', label: 'Juntado — nomenclatura errada e ilegível' };
            case 'corresponde_nao_adequada':
            case 'corresponde_nao_adequada_incompleto':
            case 'corresponde_nao_adequada_ilegivel':
            case 'corresponde_nao_adequada_incompleto_ilegivel':
                                                    return { cls: 'pendente',   icone: '⚠️', label: 'Execução Criminal — doc. não adequado' };
            case 'corresponde':
            case 'presente':                        return { cls: 'ok',         icone: '✅', label: 'Juntado' };
            default:                                return { cls: 'ressalva',   icone: '⚠️', label: 'Verificar' };
        }
    };

    // ── Fase 2: emite vereditos por documento para os chips na árvore ──
    try {
        const _clsEstado = { 'ok': 'ok', 'ressalva': 'conferir', 'pendente': 'pendencia', 'nao-aplica': 'na' };
        const _labelOv = { 'corresponde': 'Nada consta', 'corresponde_com_obj_pe': 'Consta + Objeto e Pé', 'consta_sem_obj_pe': 'Consta, sem Objeto e Pé', 'nao_corresponde': 'Não corresponde', 'nao_apresentado': 'Não apresentado', 'nada_consta': 'Nada consta', 'consta': 'Consta', 'nao_aplica': 'Não se aplica' };
        const _CERT2 = new Set(['federal_1grau','federal_2grau','federal_regional','estadual_1grau','estadual_1grau_eproc','estadual_2grau']);
        const _docItem = {};
        for (const _it2 of _ITENS_CAND) {
            if (!_it2.tipo) continue;
            for (const _rr2 of _todosResultadosMesmoTipo(_it2, resultados)) {
                if (_rr2 && _rr2.id != null && _docItem[String(_rr2.id)] == null) _docItem[String(_rr2.id)] = _it2;
            }
        }
        const _vDoc = (resultados || [])
            .filter(r => r && r.id != null)
            .map(r => {
                const c = classificar(r);
                const _lbl = (r._candOv && _labelOv[r._candOv]) ? _labelOv[r._candOv] : c.label;
                const _it = _docItem[String(r.id)];
                let _kind = null;
                if (_it) {
                    if (_it.id === 'prerrogativa' || _it.id === 'desincompat') _kind = 'pd';
                    else if (_CERT2.has(_it.tipo)) _kind = 'cert';
                    else if (_it.id === 'divergencias') _kind = 'div';
                    else if (_it.id === 'identidade' || _it.id === 'escolaridade' || _it.id === 'bens') _kind = 'simples';
                }
                let _estado = _clsEstado[c.cls] || 'conferir';
                let _lblF = (_kind === 'simples' || _kind === 'div') ? c.label : _lbl;
                if (_kind === 'cert' && !r._candOv) { _estado = 'conferir'; _lblF = 'OCR / aguardando conferência'; }
                if (_kind === 'simples' && _it.id !== 'bens' && !r._candOv) { _estado = 'conferir'; _lblF = 'Aguardando conferência'; }
                if (_kind === 'div' && (!_S._divergenciasSelecao || _S._divergenciasSelecao === 'aguardando')) { _estado = 'conferir'; _lblF = 'Aguardando conferência'; }
                const _auto = (r._statusOriginal != null) ? r._statusOriginal : r.status;
                let _motivo = classificar({ status: _auto }).label;
                if (_kind === 'cert' && r._consta === 'CONSTA') _motivo = 'CONSTA' + (r._constaTotal ? ' \u2014 ' + r._constaTotal + ' processo(s)' : '');
                else if (_kind === 'cert' && r._consta === 'NADA CONSTA') _motivo = 'Nada consta';
                const _aviso = [r._avisoNome, r._avisoConteudo].filter(Boolean).join(' \u00b7 ');
                const _det = (_kind === 'cert' && r._consta === 'CONSTA' && r._constaResumo) ? ('Processos: ' + (r._constaTotal || '?') + ' \u2014 ' + r._constaResumo) : '';
                return { id: String(r.id), estado: _estado, label: _lblF, icone: c.icone, nome: r.nome || '', status: r.status || '', itemId: _it ? _it.id : null, kind: _kind, motivo: _motivo, aviso: _aviso, detalhe: _det, tipoOCR: r._tipoDoc || r._tipoIdentificado || '', verif: r._verificacao || '', cont: r._conteudo || '', consta: r._consta || '', constaTotal: r._constaTotal || 0, processos: (Array.isArray(r._constaProcessos) ? r._constaProcessos.slice(0, 15) : []) };
            });
        window.parent.postMessage({ source: 'auditje-chat', type: 'AUDITJE_VEREDITOS_DOC', vereditos: _vDoc }, '*');
    } catch (_e) { console.warn('[AuditJE][fase2] emitir vereditos:', _e); }

    // ── Lê info do candidato ──────────────────────────────────────────────────
    const card        = document.getElementById('processo-info-card');
    const cardVal     = (key) => card?.querySelector(`[data-info="${key}"] .card-val`)?.textContent?.trim() || '';
    const nomeCand    = cardVal('requerente') || infoProcesso?.requerente || '';
    const cargo       = (_S._cardCampos && _S._cardCampos.cargo) || cardVal('cargo') || '';
    const cargoNorm   = _norm(cargo);
    const exigePropostas = /presidente|governador|prefeito/.test(cargoNorm);

    // ── Definição dos incisos do Art. 27 ─────────────────────────────────────
    const INCISOS = [
        { inciso: 'I',     titulo: 'Relação de bens (CANDex)',                              tipo: 'bens',             obrig: true },
        { inciso: 'II',    titulo: 'Fotografia recente',                                    tipo: '__foto__',         obrig: true },
        { inciso: 'III-a', titulo: 'Certidão criminal — Justiça Federal 1º grau',           tipo: 'federal_1grau',    obrig: true },
        { inciso: 'III-a', titulo: 'Certidão criminal — Justiça Federal 2º grau',           tipo: 'federal_2grau',    obrig: true },
        { inciso: 'III-b', titulo: 'Certidão criminal — Justiça Estadual 1º grau (SAJ)',    tipo: 'estadual_1grau',      obrig: true },
        { inciso: 'III-b', titulo: 'Certidão criminal — Justiça Estadual 1º grau (eproc/SEEU)', tipo: 'estadual_1grau_eproc', obrig: true },
        { inciso: 'III-b', titulo: 'Certidão criminal — Justiça Estadual 2º grau',          tipo: 'estadual_2grau',   obrig: true },
        { inciso: 'III-c', titulo: 'Certidão — foro por prerrogativa de função',            tipo: 'foro_prerrogativa',obrig: false, cond: 'quando o candidato gozar de foro por prerrogativa' },
        { inciso: 'IV',    titulo: 'Prova de alfabetização',                                tipo: 'escolaridade',     obrig: true },
        { inciso: 'V',     titulo: 'Prova de desincompatibilização',                        tipo: 'desincompat',      obrig: false, cond: 'quando for o caso' },
        { inciso: 'VI',    titulo: 'Documento oficial de identificação',                    tipo: 'identidade',       obrig: true },
        { inciso: 'VII',   titulo: 'Propostas da candidata ou do candidato',                tipo: '__propostas__',    obrig: false, cond: 'presidente, governador e prefeito', aplicavel: exigePropostas },
    ];

    const PROC = [
        { titulo: 'Petição Inicial',                             tipo: 'peticao_inicial', nomeRe: null },
        { titulo: 'Requerimento de Registro de Candidatura (RRC)', tipo: 'rrc',           nomeRe: null },
        { titulo: 'Escolha em convenção',                        tipo: null,              nomeRe: /convencao|ata.*convencao/ },
        { titulo: 'Inexistência de divergências do cadastro',    tipo: 'divergencias',    nomeRe: null },
    ];

    // ── Calcula contadores ────────────────────────────────────────────────────
    let obrigTotal = 0, obrigOk = 0, pendentes = 0;
    for (const item of INCISOS) {
        if (item.tipo === '__foto__') continue; // não auditado
        // Itens com seletor manual (prerrogativa/desincompat): usa seletor para calcular status
        // Mapeia item.tipo → item.id (seletor usa item.id como chave)
        const _itemIdPorTipoC = { foro_prerrogativa: 'prerrogativa', desincompat: 'desincompat' };
        const _candItemIdC = _itemIdPorTipoC[item.tipo];
        const _selPDc = _candItemIdC ? ((_S._candSeletoresPD || {})[_candItemIdC]) : undefined;
        const _textoSalvoPDc = _candItemIdC ? ((_S._candTextos || {})[_candItemIdC] || '') : '';
        const _autoNaoAplicaC = item.tipo === 'desincompat' && !_candidatoNecessitaDesincompat();
        const _textoNaoAplicaC = /^n[ãa]o\s+se\s+aplica/i.test(_textoSalvoPDc);
        if (_autoNaoAplicaC || _selPDc === 'nao_aplica' || _textoNaoAplicaC) continue;
        if (_selPDc === 'nao_apresentado') { obrigTotal++; pendentes++; continue; }
        if (_selPDc === 'nada_consta' || _selPDc === 'consta') { obrigTotal++; obrigOk++; continue; }
        const r = buscar(item.tipo, null);
        const st = classificar(r);
        const aplica = item.obrig || (item.aplicavel !== undefined ? item.aplicavel : (r && r.status !== 'dispensado'));
        if (!aplica) continue;
        obrigTotal++;
        if (st.cls === 'ok') obrigOk++;
        else pendentes++;
    }
    // ── Fase 2: emite o resumo agregado (placar art.27 + não apresentados) ──
    try {
        const _naoApres = [];
        const _naoSeAplica = [];
        for (const _it of INCISOS) {
            if (_it.tipo === '__foto__') continue;
            const _rr = buscar(_it.tipo, null);
            const _aplica = _it.obrig || (_it.aplicavel !== undefined ? _it.aplicavel : (_rr && _rr.status !== 'dispensado'));
            if (_aplica && (!_rr || _rr.status === 'nao_apresentado')) _naoApres.push(_it.titulo);
            else if (!_aplica && _it.cond) _naoSeAplica.push(_it.titulo);
        }
        window.parent.postMessage({ source: 'auditje-chat', type: 'AUDITJE_RESUMO_ART27', placar: { ok: obrigOk, total: obrigTotal }, pendentes: pendentes, precisam: Math.max(0, obrigTotal - obrigOk), naoApresentados: _naoApres, naoSeAplica: _naoSeAplica }, '*');
    } catch (_e2) { console.warn('[AuditJE][fase2] emitir resumo:', _e2); }

    // ── Cria linha visual ─────────────────────────────────────────────────────
    const criarLinha = (inciso, titulo, st, nota) => {
        const cores = {
            ok:       { bg: 'rgba(34,197,94,0.06)',  borda: 'var(--success)',  txt: 'var(--success)'  },
            pendente: { bg: 'rgba(239,68,68,0.08)',  borda: 'var(--error)',    txt: 'var(--error)'    },
            ressalva: { bg: 'rgba(234,179,8,0.07)',  borda: 'var(--warning)',  txt: 'var(--warning)'  },
            'nao-aplica': { bg: 'transparent',        borda: 'var(--border)',  txt: 'var(--text-muted)'},
            sistema:  { bg: 'rgba(99,102,241,0.06)', borda: '#818cf8',         txt: '#818cf8'         },
        };
        const c = cores[st.cls] || cores['nao-aplica'];
        const div = document.createElement('div');
        div.style.cssText = `display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:6px;background:${c.bg};border-left:3px solid ${c.borda};`;
        div.innerHTML = `
            <span style="font-size:14px;flex-shrink:0;margin-top:1px;">${st.icone}</span>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;">
                    ${inciso ? `<span style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.05em;flex-shrink:0;">${inciso}</span>` : ''}
                    <span style="font-size:13px;color:var(--text);">${titulo}</span>
                </div>
                <div style="font-size:11px;color:${c.txt};margin-top:2px;">${st.label}${nota ? ` · ${nota}` : ''}</div>
            </div>`;
        return div;
    };

    // ── Monta layout ──────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    // Barra de resumo — largura total, acima dos cards
    const corBar = pendentes === 0 ? 'var(--success)' : pendentes <= 2 ? 'var(--warning)' : 'var(--error)';
    const bar = document.createElement('div');
    bar.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:3px;';
    bar.innerHTML = `
        <div style="font-size:13px;font-weight:700;color:${corBar};">${obrigOk} / ${obrigTotal} documentos obrigatórios juntados</div>
        ${pendentes > 0 ? `<div style="font-size:12px;color:var(--error);">❌ ${pendentes} pendente${pendentes > 1 ? 's' : ''} — verificar antes de decidir</div>` : '<div style="font-size:12px;color:var(--success);">✅ Documentação obrigatória completa</div>'}
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Fotografia (inciso II) não inclusa — conferir no sistema CANDex</div>`;
    wrap.appendChild(bar);

    // ── 3 cards lado a lado (Flexbox row) ────────────────────────────────────
    const cardsRow = document.createElement('div');
    cardsRow.style.cssText = 'display:flex;flex-direction:row;gap:10px;align-items:flex-start;';

    const _cardStyle = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--surface2);';
    const _hdrStyle  = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);padding-bottom:6px;border-bottom:1px solid var(--border);margin-bottom:2px;';

    // Card 1 — Documentos Exigidos (Art. 27)
    const cardArt = document.createElement('div');
    cardArt.style.cssText = _cardStyle;
    const h1 = document.createElement('div');
    h1.style.cssText = _hdrStyle;
    h1.textContent = 'Documentos Exigidos';
    cardArt.appendChild(h1);
    for (const item of INCISOS) {
        let st, nota = '';
        if (item.tipo === '__foto__') {
            st = { cls: 'sistema', icone: '📷', label: 'Verificar no sistema CANDex' };
        } else if (item.tipo === '__propostas__') {
            if (exigePropostas) {
                const r = resultados.find(x => /proposta/i.test(_norm(x.nome)) && x.status !== 'erro') || null;
                st = classificar(r);
            } else {
                st = { cls: 'nao-aplica', icone: '⚪', label: 'Não obrigatório para este cargo' };
                nota = item.cond;
            }
        } else {
            const r = buscar(item.tipo, null);
            // Itens controlados pelo seletor manual (prerrogativa e desincompat)
            // O seletor é guardado por item.id — atenção: 'prerrogativa' ≠ 'foro_prerrogativa'
            // Mapeia item.tipo → item.id para buscar o seletor correto
            const _itemIdPorTipo = { foro_prerrogativa: 'prerrogativa', desincompat: 'desincompat' };
            const _candItemId = _itemIdPorTipo[item.tipo];
            const _selPD = _candItemId ? ((_S._candSeletoresPD || {})[_candItemId]) : undefined;
            // Fallback via texto salvo no textarea (cobre auto-gerado sem seletor explícito)
            const _textoSalvoPD = _candItemId ? ((_S._candTextos || {})[_candItemId] || '') : '';
            const _autoNaoAplica = item.tipo === 'desincompat' && !_candidatoNecessitaDesincompat();
            const _textoNaoAplica = /^n[ãa]o\s+se\s+aplica/i.test(_textoSalvoPD);
            if (_autoNaoAplica || _selPD === 'nao_aplica' || _textoNaoAplica) {
                st = { cls: 'nao-aplica', icone: '⚪', label: 'Não se aplica' };
            } else if (_selPD === 'nao_apresentado') {
                st = { cls: 'pendente', icone: '❌', label: 'Não apresentado' };
            } else if (_selPD === 'nada_consta') {
                st = { cls: 'ok', icone: '✅', label: 'Juntado' };
            } else if (_selPD === 'consta') {
                st = { cls: 'ok', icone: '✅', label: 'Juntado' };
            } else if (!item.obrig) {
                if (r && r.status !== 'dispensado') {
                    st = classificar(r);
                } else if (r?.status === 'dispensado') {
                    st = { cls: 'nao-aplica', icone: '⚪', label: 'Dispensado / não se aplica' };
                } else {
                    st = { cls: 'nao-aplica', icone: '⚪', label: 'Não apresentado' };
                    nota = item.cond;
                }
            } else {
                st = classificar(r);
            }
        }
        cardArt.appendChild(criarLinha(item.inciso, item.titulo, st, nota));
    }
    cardsRow.appendChild(cardArt);

    // Card 2 — Documentos do Processo
    const cardProc = document.createElement('div');
    cardProc.style.cssText = _cardStyle;
    const h2 = document.createElement('div');
    h2.style.cssText = _hdrStyle;
    h2.textContent = 'Documentos do Processo';
    cardProc.appendChild(h2);
    for (const item of PROC) {
        let r, stOverride = null;
        if (item.titulo === 'Escolha em convenção') {
            const assoc = processoAssociado || _S._processoAssociado || _checklistProcessoAssociado;
            r = assoc ? { status: 'presente' } : buscar(item.tipo, item.nomeRe);
        } else if (item.tipo === 'divergencias') {
            const _sel = _S._divergenciasSelecao;
            if (_sel === 'sem')      stOverride = { cls: 'ok',      icone: '✅', label: 'Sem divergência' };
            else if (_sel === 'com') stOverride = { cls: 'pendente', icone: '❌', label: 'Com divergência — regularizar' };
            else                     stOverride = { cls: 'pendente', icone: '⏳', label: 'Aguardando certidão' };
            r = buscar(item.tipo, item.nomeRe);
        } else {
            r = buscar(item.tipo, item.nomeRe);
        }
        cardProc.appendChild(criarLinha('', item.titulo, stOverride || classificar(r), ''));
    }
    cardsRow.appendChild(cardProc);

    // Card 3 — Certidão de Recebimento
    const cardCert = document.createElement('div');
    cardCert.style.cssText = _cardStyle;
    const h3 = document.createElement('div');
    h3.style.cssText = _hdrStyle;
    h3.textContent = 'Certidão de Recebimento';
    cardCert.appendChild(h3);

    const descCert = document.createElement('div');
    descCert.style.cssText = 'font-size:11px;color:var(--text-muted);line-height:1.6;margin-bottom:10px;';
    descCert.textContent = 'Certidão preliminar de verificação de documentos — Art. 11, Lei nº 9.504/1997.';
    cardCert.appendChild(descCert);

    const btnAbrirCert = document.createElement('button');
    btnAbrirCert.textContent = '📄 Gerar e visualizar';
    btnAbrirCert.style.cssText = 'display:block;width:100%;padding:8px;background:var(--accent);border:none;border-radius:6px;font-size:12px;font-weight:600;color:#fff;cursor:pointer;letter-spacing:0.02em;';
    cardCert.appendChild(btnAbrirCert);
    cardsRow.appendChild(cardCert);

    wrap.appendChild(cardsRow);

    // ── Barra de ações ────────────────────────────────────────────────────────
    const acoesBarra = document.createElement('div');
    acoesBarra.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const _btnAcao = (texto, title) => {
        const b = document.createElement('button');
        b.textContent = texto;
        b.title = title;
        b.style.cssText = 'flex:1;min-width:180px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;letter-spacing:0.02em;';
        return b;
    };

    const btnRelGestao   = _btnAcao('📊 Exportar Gestão (TSV)', 'Relatório de gestão para o chefe da equipe em formato TSV');
    const btnRelSituacao = _btnAcao('📋 Situação Processual', 'Relatório completo de situação dos processos distribuídos');
    acoesBarra.appendChild(btnRelGestao);
    acoesBarra.appendChild(btnRelSituacao);
    wrap.appendChild(acoesBarra);

    painel.appendChild(wrap);

    // ── Captura textos para salvar no Sheets ──────────────────────────────────
    {
        const _srv2   = _S._servidorResponsavel || '';
        const _dataR2 = _S._dataAuditoria || new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const _cargo2 = cargo;
        const _cand2  = nomeCand;
        const _num2   = infoProcesso?.numero || '';

        // Gestão TSV
        // IMPORTANTE: usa _resultadosComOverrides para que correções manuais
        // do servidor (overrides no checklist CAND) sejam refletidas no Sheets
        // e no dashboard — e não apenas na renderização visual da tela.
        const _resOv2 = _resultadosComOverrides(resultados);
        const _tabG2 = gerarTabelaDistribuicaoObjetoPe(_resOv2);
        _S._relGestaoTSV = _gerarTSVGestao(resultados, { data: _dataR2, servidor: _srv2, processo: _num2, candidato: _cand2, cargo: _cargo2 });

        // Situação Processual
        const _selDiv2 = _S._divergenciasSelecao;
        let _sit2 = `RELATÓRIO DE SITUAÇÃO PROCESSUAL\n${'─'.repeat(60)}\n\n`;
        _sit2 += `Processo: ${_num2}\n`;
        _sit2 += `Candidato(a): ${_cand2}\n`;
        _sit2 += `Cargo: ${_cargo2}\n`;
        if (_srv2) _sit2 += `Servidor: ${_srv2}\n`;
        _sit2 += `Data: ${_dataR2}\n\n`;
        _sit2 += `${'─'.repeat(60)}\nCADASTRO ELEITORAL\n`;
        if (_selDiv2 === 'sem')       _sit2 += `Status: SEM DIVERGÊNCIA — cadastro regular\n`;
        else if (_selDiv2 === 'com')  _sit2 += `Status: COM DIVERGÊNCIA — regularização necessária\n`;
        else                          _sit2 += `Status: Aguardando certidão de inexistência de divergências\n`;
        _sit2 += '\n';
        if (_tabG2 && _tabG2.total > 0) {
            for (const g of _tabG2.grupos) {
                _sit2 += `${'─'.repeat(60)}\n${g.label} (${g.rows.length})\n\n`;
                for (const r of g.rows) {
                    const nec = (_S._diligenciaOverrides || {})[r.numero] || r.necessidade;
                    _sit2 += `  ${r.posicao}. ${r.numero}\n`;
                    _sit2 += `     Classe: ${r.classeDistr || '—'}\n`;
                    if (r.situacao && r.situacao !== '—') _sit2 += `     Situação: ${r.situacao}\n`;
                    if (r.idObjetoPe && r.idObjetoPe !== '-') _sit2 += `     Objeto e Pé: ${r.idObjetoPe}\n`;
                    _sit2 += `     Diligência: ${nec}\n\n`;
                }
                if (g.naoQualificados?.length > 0) {
                    _sit2 += `  NÃO QUALIFICADOS — verificar homonímia (${g.naoQualificados.length}):\n\n`;
                    for (const p of g.naoQualificados) {
                        const nec = (_S._diligenciaOverrides || {})[p.numero] || p.necessidade || 'SIM (Situação não identificada)';
                        _sit2 += `  ⬜ ${p.numero}\n`;
                        _sit2 += `     Classe: ${p.classe || '—'}\n`;
                        if (p.foro) _sit2 += `     Foro: ${p.foro}\n`;
                        if (p.situacao && p.situacao !== '—') _sit2 += `     Situação: ${p.situacao}\n`;
                        if (p.idObjetoPe && p.idObjetoPe !== 'Não localizada') _sit2 += `     Objeto e Pé: ${p.idObjetoPe}\n`;
                        _sit2 += `     Diligência: ${nec}\n\n`;
                    }
                }
            }
        } else {
            _sit2 += `${'─'.repeat(60)}\nNenhuma certidão positiva identificada.\n\n`;
        }
        _sit2 += `${'─'.repeat(60)}\nSTATUS DAS CERTIDÕES EXIGIDAS\n\n`;
        for (const item of INCISOS) {
            if (item.tipo === '__foto__' || item.tipo === '__propostas__') continue;
            const r = buscar(item.tipo, null);
            const st = classificar(r);
            _sit2 += `  • ${item.titulo}\n    ${st.icone} ${st.label}\n`;
        }
        _S._relSituacaoTexto = _sit2;
    }

    // ── Relatório de Gestão (TSV) ─────────────────────────────────────────────
    btnRelGestao.addEventListener('click', () => {
        const card2     = document.getElementById('processo-info-card');
        const _cv       = (k) => card2?.querySelector(`[data-info="${k}"] .card-val`)?.textContent?.trim() || '';
        const _srv      = _S._servidorResponsavel || '';
        const _dataR    = _S._dataAuditoria || new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const _numProc2 = infoProcesso?.numero || '';
        const _cand     = _cv('requerente') || infoProcesso?.requerente || '';
        const _cargo    = (_S._cardCampos && _S._cardCampos.cargo) || _cv('cargo') || '';

        const tsv = _gerarTSVGestao(resultados, { data: _dataR, servidor: _srv, processo: _numProc2, candidato: _cand, cargo: _cargo });

        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.focus(); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
        btnRelGestao.textContent = ok ? '✅ Copiado!' : '⚠️ Falhou';
        setTimeout(() => { btnRelGestao.textContent = '📊 Exportar Gestão (TSV)'; }, 2500);
    });

    // ── Modal de Situação Processual ──────────────────────────────────────────
    btnRelSituacao.addEventListener('click', () => {
        document.getElementById('chatje-situacao-modal')?.remove();

        const _tabelaSit = gerarTabelaDistribuicaoObjetoPe(resultados);
        const _selDiv    = _S._divergenciasSelecao;

        let conteudo = `RELATÓRIO DE SITUAÇÃO PROCESSUAL\n${'─'.repeat(60)}\n\n`;
        const card3  = document.getElementById('processo-info-card');
        const _cv3   = (k) => card3?.querySelector(`[data-info="${k}"] .card-val`)?.textContent?.trim() || '';
        conteudo += `Processo: ${infoProcesso?.numero || ''}\n`;
        conteudo += `Candidato(a): ${_cv3('requerente') || infoProcesso?.requerente || ''}\n`;
        conteudo += `Cargo: ${_cv3('cargo') || ''}\n`;
        const _srvSit = _S._servidorResponsavel || '';
        if (_srvSit) conteudo += `Servidor: ${_srvSit}\n`;
        conteudo += `Data: ${_S._dataAuditoria || new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}\n\n`;

        // Cadastro eleitoral
        conteudo += `${'─'.repeat(60)}\n`;
        conteudo += `CADASTRO ELEITORAL\n`;
        if (_selDiv === 'sem') conteudo += `Status: SEM DIVERGÊNCIA — cadastro regular\n`;
        else if (_selDiv === 'com') conteudo += `Status: COM DIVERGÊNCIA — regularização necessária\n`;
        else conteudo += `Status: Aguardando certidão de inexistência de divergências\n`;
        conteudo += '\n';

        // Processos distribuídos
        if (_tabelaSit && _tabelaSit.total > 0) {
            for (const g of _tabelaSit.grupos) {
                conteudo += `${'─'.repeat(60)}\n`;
                conteudo += `${g.label} (${g.rows.length})\n\n`;
                for (const r of g.rows) {
                    const nec = (_S._diligenciaOverrides || {})[r.numero] || r.necessidade;
                    conteudo += `  ${r.posicao}. ${r.numero}\n`;
                    conteudo += `     Classe: ${r.classeDistr || '—'}\n`;
                    if (r.situacao && r.situacao !== '—' && r.situacao !== '-') conteudo += `     Situação: ${r.situacao}\n`;
                    if (r.idObjetoPe && r.idObjetoPe !== '-') conteudo += `     Objeto e Pé: ${r.idObjetoPe}\n`;
                    if (r.idOpPrincipal && r.idOpPrincipal !== '-') {
                        const sitP = (r.situacaoPrinc && r.situacaoPrinc !== '-') ? ` — ${r.situacaoPrinc}` : '';
                        conteudo += `     ↳ Principal: ${r.idOpPrincipal}${sitP}\n`;
                    }
                    conteudo += `     Diligência: ${nec}\n\n`;
                }
            }
        } else {
            conteudo += `${'─'.repeat(60)}\n`;
            conteudo += `Nenhuma certidão positiva identificada.\n\n`;
        }

        // Status das certidões exigidas
        conteudo += `${'─'.repeat(60)}\n`;
        conteudo += `STATUS DAS CERTIDÕES EXIGIDAS\n\n`;
        for (const item of INCISOS) {
            if (item.tipo === '__foto__' || item.tipo === '__propostas__') continue;
            const r = buscar(item.tipo, null);
            const st = classificar(r);
            conteudo += `  • ${item.titulo}\n    ${st.icone} ${st.label}\n`;
        }

        // Modal
        const overlay2 = document.createElement('div');
        overlay2.id = 'chatje-situacao-modal';
        overlay2.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';

        const modal2 = document.createElement('div');
        modal2.style.cssText = 'background:var(--surface,#1e1e2e);border:1px solid var(--border);border-radius:10px;width:min(740px,92vw);max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;';

        const mHdr2 = document.createElement('div');
        mHdr2.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
        mHdr2.innerHTML = `<span style="font-weight:700;font-size:13px;color:var(--text);">📋 Relatório de Situação Processual</span>`;

        const mAcoes2 = document.createElement('div');
        mAcoes2.style.cssText = 'display:flex;gap:8px;align-items:center;';

        const btnCopiar2 = document.createElement('button');
        btnCopiar2.textContent = '📋 Copiar';
        btnCopiar2.style.cssText = 'font-size:11px;padding:4px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer;';

        const btnFechar2 = document.createElement('button');
        btnFechar2.textContent = '✕';
        btnFechar2.style.cssText = 'font-size:13px;padding:3px 9px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);cursor:pointer;';

        mAcoes2.appendChild(btnCopiar2);
        mAcoes2.appendChild(btnFechar2);
        mHdr2.appendChild(mAcoes2);

        const mBody2 = document.createElement('div');
        mBody2.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px;';

        const pre2 = document.createElement('pre');
        pre2.style.cssText = 'font-family:"IBM Plex Mono",monospace;font-size:10px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word;margin:0;';
        pre2.textContent = conteudo;

        mBody2.appendChild(pre2);
        modal2.appendChild(mHdr2);
        modal2.appendChild(mBody2);
        overlay2.appendChild(modal2);
        document.body.appendChild(overlay2);

        const fechar2 = () => overlay2.remove();
        btnFechar2.addEventListener('click', fechar2);
        overlay2.addEventListener('click', (e) => { if (e.target === overlay2) fechar2(); });
        document.addEventListener('keydown', function escH2(e) {
            if (e.key === 'Escape') { fechar2(); document.removeEventListener('keydown', escH2); }
        });
        btnCopiar2.addEventListener('click', () => {
            const ta2 = document.createElement('textarea');
            ta2.value = pre2.textContent;
            ta2.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta2); ta2.focus(); ta2.select();
            let ok2 = false;
            try { ok2 = document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta2);
            btnCopiar2.textContent = ok2 ? '✅ Copiado!' : '⚠️ Falhou';
            setTimeout(() => { btnCopiar2.textContent = '📋 Copiar'; }, 2500);
        });
    });

    // ── Modal da Certidão de Recebimento ──────────────────────────────────────
    // Técnicas: overlay (position:fixed;inset:0), dismiss on backdrop click, Escape key
    btnAbrirCert.addEventListener('click', () => {
        document.getElementById('chatje-cert-modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'chatje-cert-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = [
            'background:var(--surface,#1e1e2e);border:1px solid var(--border);border-radius:10px;',
            'width:min(740px,92vw);max-height:85vh;display:flex;flex-direction:column;',
            'box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;',
        ].join('');

        const modalHdr = document.createElement('div');
        modalHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
        modalHdr.innerHTML = `<span style="font-weight:700;font-size:13px;color:var(--text);">📄 Certidão Preliminar de Verificação de Documentos</span>`;

        const modalAcoes = document.createElement('div');
        modalAcoes.style.cssText = 'display:flex;gap:8px;align-items:center;';

        const btnCopiarModal = document.createElement('button');
        btnCopiarModal.textContent = '📋 Copiar';
        btnCopiarModal.style.cssText = 'font-size:11px;padding:4px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer;';

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.style.cssText = 'font-size:13px;padding:3px 9px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);cursor:pointer;';

        modalAcoes.appendChild(btnCopiarModal);
        modalAcoes.appendChild(btnFechar);
        modalHdr.appendChild(modalAcoes);

        const modalBody = document.createElement('div');
        modalBody.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px;';

        const certPre = document.createElement('pre');
        certPre.style.cssText = 'font-family:"IBM Plex Mono",monospace;font-size:10px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word;margin:0;';
        certPre.textContent = gerarCertidaoRecebimento(resultados);

        modalBody.appendChild(certPre);
        modal.appendChild(modalHdr);
        modal.appendChild(modalBody);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const fechar = () => overlay.remove();
        btnFechar.addEventListener('click', fechar);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', escHandler); }
        });

        btnCopiarModal.addEventListener('click', () => {
            const ta = document.createElement('textarea');
            ta.value = certPre.textContent;
            ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.focus(); ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
            btnCopiarModal.textContent = ok ? '✅ Copiado!' : '⚠️ Falhou';
            setTimeout(() => { btnCopiarModal.textContent = '📋 Copiar'; }, 2500);
        });
    });

    notificarAbaResumo(pendentes);
}


// ═════════════════════════════════════════════════════════════════════════════
// GERAÇÃO DO CHECKLIST CAND
// ═════════════════════════════════════════════════════════════════════════════

// Estado global do checklist
let _checklistResultados = null;
let _checklistProcessoAssociado = null;

// Mapa tipo → resultados da auditoria
const _TIPOS_CAND = {
    estadual_1grau : 'Certidão criminal — Justiça Estadual 1º grau (SAJ)',
    estadual_1grau_eproc : 'Certidão criminal — Justiça Estadual 1º grau (eproc/SEEU)',
    estadual_2grau : 'Certidão criminal — Justiça Estadual 2º grau',
    federal_1grau   : 'Certidão criminal — Justiça Federal 1º grau',
    federal_2grau   : 'Certidão criminal — Justiça Federal 2º grau',
    federal_regional: 'Certidão Criminal Federal (Regional — 1º e 2º grau)',
    stj            : 'Certidão criminal — STJ',
    stf            : 'Certidão criminal — STF',
    stm            : 'Certidão criminal — STM (Militar Federal)',
    tjm            : 'Certidão criminal — TJM/JM-SP (Militar Estadual)',
    objeto_pe      : 'Certidão de Objeto e Pé',
    desincompat    : 'Desincompatibilização',
    escolaridade   : 'Comprovante de Escolaridade',
};

// 13 itens do relatório analítico — na ordem lógica de análise
const _ITENS_CAND = [
    { id: 'convencao',       titulo: '1. Escolha em convenção',                               tipo: null },
    { id: 'peticao_inicial', titulo: '2. Petição Inicial',                                    tipo: 'peticao_inicial' },
    { id: 'rrc',             titulo: '3. Requerimento de Registro de Candidatura (RRC)',       tipo: 'rrc' },
    { id: 'identidade',      titulo: '4. Documento oficial de identificação',                  tipo: 'identidade' },
    { id: 'escolaridade',    titulo: '5. Comprovante de escolaridade',                         tipo: 'escolaridade' },
    { id: 'federal_1grau',   titulo: '6. Certidão criminal — Justiça Federal 1º grau',        tipo: 'federal_1grau' },
    { id: 'federal_2grau',   titulo: '7. Certidão criminal — Justiça Federal 2º grau',        tipo: 'federal_2grau' },
    { id: 'estadual_1grau',       titulo: '8. Certidão criminal — Justiça Estadual 1º grau (SAJ)',       tipo: 'estadual_1grau' },
    { id: 'estadual_1grau_eproc', titulo: '8b. Certidão criminal — Justiça Estadual 1º grau (eproc/SEEU)', tipo: 'estadual_1grau_eproc' },
    { id: 'estadual_2grau',  titulo: '9. Certidão criminal — Justiça Estadual 2º grau',       tipo: 'estadual_2grau' },
    { id: 'prerrogativa',    titulo: '10. Certidão de foro por prerrogativa de função',       tipo: 'foro_prerrogativa' },
    { id: 'desincompat',     titulo: '11. Prova de desincompatibilização',                    tipo: 'desincompat' },
    { id: 'bens',            titulo: '12. Declaração de bens / CANDEX',                       tipo: 'bens' },
    { id: 'divergencias',    titulo: '13. Inexistência de Divergências do Cadastro',          tipo: 'divergencias' },
];

// ── Retorna todos os resultados do mesmo tipo de um item CAND ────────────────
function _todosResultadosMesmoTipo(item, resultados) {
    if (!item.tipo) return [];
    const s = r => r.status !== 'erro';
    if (item.tipo === 'identidade')
        return resultados.filter(r => /identidade|\brg\b|\bcnh\b|passaporte/i.test(r.nome) && s(r));
    if (item.tipo === 'escolaridade')
        return resultados.filter(r => /escolaridade|diploma/i.test(_norm(r.nome)) && s(r));
    if (item.tipo === 'foro_prerrogativa')
        return resultados.filter(r => /prerrogativa/i.test(r.nome) && s(r));
    if (item.tipo === 'desincompat')
        return resultados.filter(r => (r._tipoDoc === 'desincompat' || /desincompat/i.test(_norm(r.nome))) && s(r));
    // Certidões identificadas pelo OCR
    const _tiposCert = ['estadual_1grau','estadual_1grau_eproc','estadual_2grau','federal_1grau','federal_2grau','federal_regional','stm','tjm','stj','stf','objeto_pe','eleitoral'];
    if (_tiposCert.includes(item.tipo)) {
        let _equiv = [item.tipo];
        if (item.tipo === 'federal_1grau' || item.tipo === 'federal_2grau') _equiv = [item.tipo, 'federal_regional'];
        // exec_criminal é expedida pela Justiça Estadual de 1º grau — aparece no slot estadual_1grau
        if (item.tipo === 'estadual_1grau') _equiv = [item.tipo, 'exec_criminal'];
        return resultados.filter(r => _equiv.includes(r._tipoDoc) && s(r));
    }
    return [];
}

// ── Gera texto acumulado quando o mesmo tipo é juntado mais de uma vez ────────
const _MSG_EXEC_CRIMINAL_ACUM =
    '⚠️ O candidato deve apresentar as DUAS certidões de distribuição criminal de 1º grau ' +
    'para fins eleitorais: a do sistema SAJ (Portal e-SAJ do TJSP) e a complementar dos ' +
    'sistemas eproc e SEEU.';

function _gerarTextoAcumulado(docs) {
    const linhas = docs
        .slice().sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0))
        .map(r => {
            const _pid   = r.id ? `ID ${r.id}` : '';
            const _pnome = r.nome.replace(/\([^)]+\)/g, '').trim();
            let _pres = '';
            // Execução Criminal — marca explicitamente como não adequada
            if (r._tipoDoc === 'exec_criminal' || r.status?.startsWith('corresponde_nao_adequada')) {
                const consta = r._consta === 'NADA CONSTA' ? 'NADA CONSTA' : r._consta === 'CONSTA' ? 'CONSTA' : '';
                _pres = 'Execução Criminal (complementar) — Não adequada' + (consta ? ' — ' + consta : '');
            } else if (r._consta === 'NADA CONSTA')       _pres = 'NADA CONSTA';
            else if (r._consta === 'CONSTA')              _pres = 'CONSTA';
            else if (r.status === 'corresponde' ||
                     r.status === 'presente')             _pres = 'Documento presente';
            else if (r.status === 'corresponde_incompleto')  _pres = '⚠️ Incompleto';
            else if (r.status === 'corresponde_ilegivel')    _pres = '⚠️ Ilegível';
            else if (r.status === 'nomenclatura_errada')     _pres = 'Nomenclatura errada no PJe';
            else if (r.status === 'nao_apresentado')         _pres = 'Não apresentado';
            else                                             _pres = r.status || '';
            return [_pid, _pnome, _pres].filter(Boolean).join(' — ');
        });

    // Se qualquer documento acumulado for exec_criminal, appenda orientação ao final
    const temExecCriminal = docs.some(r => r._tipoDoc === 'exec_criminal' || r.status?.startsWith('corresponde_nao_adequada'));
    if (temExecCriminal) linhas.push(_MSG_EXEC_CRIMINAL_ACUM);

    return linhas.join('\n');
}

function gerarTextoCAND(item, resultado, processoAssociado) {
    // ── Caminho B: texto padrão definido na aba Hipóteses (fonte única) ──────
    // Usa o padrão do item (injetando {ID}/{processo}), exceto: certidões
    // criminais (código), quando um seletor manual está ativo (override), ou
    // quando o documento não foi apresentado. Sem padrão definido → fallback.
    if (!_HIP_ITENS_CODIGO.has(item.id)) {
        const _selMan = ((item.id === 'prerrogativa' || item.id === 'desincompat') && (_S._candSeletoresPD || {})[item.id])
                     || (item.id === 'divergencias' && _S._divergenciasSelecao);
        const _naoApres = resultado && resultado.status === 'nao_apresentado';
        if (!_selMan && !_naoApres) {
            const _pad = _hipTextoPadrao(item.id);
            if (_pad) return _injetarMarcadores(_pad, resultado, processoAssociado);
        }
    }

    // Item 1 — Convenção: número do processo associado
    if (item.id === 'convencao') {
        if (processoAssociado) return `Candidatura escolhida em convenção conforme ata juntada aos autos do processo PJe nº ${processoAssociado}.`;
        return 'Número do processo de convenção não localizado automaticamente — preencher manualmente.';
    }

    // Desincompatibilização — candidato civil não tem essa obrigação
    if (item.id === 'desincompat' && !_candidatoNecessitaDesincompat()) {
        return 'NÃO SE APLICA — Candidato sem obrigatoriedade de desincompatibilização.';
    }

    // ── Itens 10 e 11: texto controlado pelo seletor manual ──────────────────
    if (item.id === 'prerrogativa' || item.id === 'desincompat') {
        const _selPD = (_S._candSeletoresPD || {})[item.id];
        const _tituloItem = item.id === 'prerrogativa'
            ? 'Certidão de foro por prerrogativa de função'
            : 'Prova de desincompatibilização';
        if (_selPD === 'nao_aplica')       return `NÃO SE APLICA — ${_tituloItem}.`;
        if (_selPD === 'nao_apresentado')  return `NÃO APRESENTADO — ${_tituloItem}.`;
        if (_selPD === 'nada_consta')      return `${_tituloItem} — NADA CONSTA.`;
        if (_selPD === 'consta')           return `${_tituloItem} — CONSTA.`;
        // Sem seleção: gera texto automático se houver resultado na árvore
    }

    // Divergências: texto controlado pela seleção manual (independe de resultado na árvore)
    if (item.id === 'divergencias') {
        const _id = resultado?.id ? `ID ${resultado.id} — ` : '';
        const _sel = _S._divergenciasSelecao;
        if (_sel === 'sem') return `${_id}SEM DIVERGÊNCIA — cadastro eleitoral regular.`;
        if (_sel === 'com') return `${_id}COM DIVERGÊNCIA — regularizar antes do deferimento.`;
        if (resultado) return `${_id}Certidão localizada na árvore — selecionar o resultado acima.`;
        return 'Certidão ainda não juntada — selecionar o resultado quando disponível.';
    }

    if (!resultado) {
        return '';
    }

    // Acumulação: quando o mesmo tipo de documento é juntado mais de uma vez
    // (ex: nova certidão após notificação), lista todos sem substituir o anterior.
    if (_checklistResultados) {
        const _todosDoTipo = _todosResultadosMesmoTipo(item, _checklistResultados);
        if (_todosDoTipo.length > 1) {
            return _gerarTextoAcumulado(_todosDoTipo);
        }
    }

    const id    = resultado.id ? `ID ${resultado.id} — ` : '';
    const idNum = resultado.id ? `ID nº ${resultado.id}` : '';

    // Nota de erro de juntada: documento identificado pelo OCR como tipo diferente do slot
    const _tipoDocReal = resultado._tipoDoc && resultado._tipoDoc !== 'presente' && resultado._tipoDoc !== 'dispensado';
    const notaJuntada = (_tipoDocReal && resultado._tipoDoc !== item.tipo)
        ? `\n⚠️ Atenção: juntado como "${resultado.nome.replace(/\([^)]+\)/g, '').trim()}" — verificar erro de juntada pelo peticionante.`
        : '';

    // Não apresentado
    if (resultado.status === 'nao_apresentado') {
        return 'Não consta dos autos.';
    }

    // Execução Criminal — mensagens por grau
    // 1º grau: Certidão de Distribuição de Ações Criminais (modelo no site do TJSP)
    // 2º grau: Certidão de Distribuição de Segunda Instância (Portal e-SAJ do TJSP)
    const _MSG_EXEC_CRIMINAL =
        '⚠️ O candidato deve apresentar a Certidão de Distribuição de Ações Criminais, ' +
        'selecionando o modelo correspondente no site do TJSP (www.tjsp.jus.br).';
    const _MSG_EXEC_CRIMINAL_2GRAU =
        '⚠️ O candidato deve apresentar a Certidão de Distribuição de Segunda Instância ' +
        'para Fins Eleitorais, solicitada via Portal e-SAJ do TJSP.';

    if (resultado.status === 'corresponde_nao_adequada') {
        const consta = resultado._consta === 'NADA CONSTA' ? ' NADA CONSTA.' : resultado._consta === 'CONSTA' ? ' CONSTA.' : '';
        return `${id}Execução Criminal (complementar) — documento não adequado ao requisito.${consta}\n${_MSG_EXEC_CRIMINAL}`;
    }
    if (resultado.status === 'corresponde_nao_adequada_incompleto') {
        const aviso = resultado._avisoConteudo ? `\n⚠️ ${resultado._avisoConteudo}.` : '';
        return `${id}Execução Criminal (complementar) — documento não adequado ao requisito.${aviso}\n${_MSG_EXEC_CRIMINAL}`;
    }
    if (resultado.status === 'corresponde_nao_adequada_ilegivel') {
        return `${id}Execução Criminal (complementar) — documento não adequado ao requisito — ilegível.\n${_MSG_EXEC_CRIMINAL}`;
    }
    if (resultado.status === 'corresponde_nao_adequada_incompleto_ilegivel') {
        return `${id}Execução Criminal (complementar) — documento não adequado ao requisito — incompleto e ilegível.\n${_MSG_EXEC_CRIMINAL}`;
    }

    // Nomenclatura errada com exec_criminal: juntada sob nome de 2º grau (item 9)
    // Usa mensagem específica do 2º grau — certidão e canal de solicitação são diferentes.
    if ((resultado.status === 'nomenclatura_errada' || resultado.status === 'nomenclatura_errada_incompleto') &&
        resultado._tipoDoc === 'exec_criminal') {
        const consta = resultado._consta === 'NADA CONSTA' ? ' NADA CONSTA.' : resultado._consta === 'CONSTA' ? ' CONSTA.' : '';
        const _msg = item.id === 'estadual_2grau' ? _MSG_EXEC_CRIMINAL_2GRAU : _MSG_EXEC_CRIMINAL;
        return `${id}Execução Criminal (complementar) — juntada com nomenclatura incorreta no PJe.${consta}\n${_msg}`;
    }

    // Nomenclatura errada — documento presente mas juntado sob nome incorreto no PJe
    if (resultado.status === 'nomenclatura_errada') {
        const consta = resultado._consta === 'NADA CONSTA' ? ' NADA CONSTA.'
                     : resultado._consta === 'CONSTA' ? ' CONSTA.' : '';
        return `${id}Documento juntado com nomenclatura incorreta no PJe.${consta}\n📝 ${resultado._avisoNome || 'Verificar nome do arquivo no sistema.'}`;
    }
    if (resultado.status === 'nomenclatura_errada_incompleto') {
        const avisoIncompleto = resultado._avisoConteudo || resultado._avisoNome || 'Verificar nome do arquivo e campo de identidade.';
        return `${id}Documento juntado com nomenclatura incorreta no PJe — campo de identificação ausente.\n📝 ${avisoIncompleto}`;
    }
    if (resultado.status === 'nomenclatura_errada_ilegivel') {
        return `${id}Documento juntado com nomenclatura incorreta no PJe — ilegível. Solicitar nova via.`;
    }

    // Documentos de verificação humana (identidade, escolaridade, relação de bens, petição inicial, RRC)
    if (resultado.status === 'corresponde' || resultado.status === 'presente') {
        if (item.id === 'rrc' || item.id === 'peticao_inicial') {
            return `RRC - ${idNum}.${notaJuntada}`;
        }
        if (item.id === 'identidade' || item.id === 'escolaridade' || item.id === 'bens') {
            return `${idNum}.${notaJuntada}`;
        }
    }

    // Corresponde com ressalvas (incompleto / ilegível)
    // Sempre exibe _consta quando disponível, combinado com o aviso de inconsistência.
    {
        const _prefixoConsta = () => {
            if (resultado._consta === 'NADA CONSTA') return 'NADA CONSTA. ';
            if (resultado._consta === 'CONSTA') return 'CONSTA. ';
            return '';
        };
        if (resultado.status === 'corresponde_incompleto') {
            const aviso = resultado._avisoConteudo || 'campo de identificação incompleto';
            return `${id}${_prefixoConsta()}⚠️ ${aviso} — verificar manualmente.${notaJuntada}`;
        }
        if (resultado.status === 'corresponde_ilegivel') {
            return `${id}${_prefixoConsta()}⚠️ Documento ilegível — verificar manualmente.${notaJuntada}`;
        }
        if (resultado.status === 'corresponde_incompleto_ilegivel') {
            const aviso = resultado._avisoConteudo || 'campo de identificação incompleto';
            return `${id}${_prefixoConsta()}⚠️ ${aviso}; documento ilegível — verificar manualmente.${notaJuntada}`;
        }
    }

    // Certidões com NADA CONSTA (data exibida no card, não no textarea)
    if (resultado._consta === 'NADA CONSTA') {
        return `${id}NADA CONSTA.${notaJuntada}`;
    }

    // Certidões com CONSTA
    if (resultado._consta === 'CONSTA') {
        // Cabeçalho padrão formal: certidão positiva com análise de condenação
        let texto = `Certidão positiva emitida para fins eleitorais juntada aos autos contendo informações acerca do objeto da ação e o pé em que se encontra - ${idNum}. Da análise da(s) certidão/certidões, verifica-se que não houve condenação com trânsito em julgado ou condenação por Órgão Colegiado.`;
        if (resultado._processosDetalhados && resultado._processosDetalhados.length > 0) {
            const linhas = resultado._processosDetalhados.map(p => {
                const obj  = p.objetoPe ? `(${p.objetoPe.assunto || 'objeto não informado'})` : '(certidão de objeto e pé não juntada)';
                const res  = p.objetoPe ? `(${p.objetoPe.situacao || 'resultado não informado'})` : '';
                const info = [p.classe, p.foro, p.data ? 'Data: ' + p.data : ''].filter(Boolean).join(' – ');
                return `${p.numero}: (${info}); ${obj}; ${res}`;
            });
            texto += '\n' + linhas.join('\n');
        } else if (resultado._constaProcessos?.length > 0) {
            texto += '\nProcessos: ' + resultado._constaProcessos.join(' | ');
        }

        // Seção de não qualificados
        if (resultado._naoQualificados?.length > 0) {
            texto += '\n\nNão qualificado(a) — verificar homonímia:\n';
            texto += resultado._naoQualificados.map(p =>
                `${p.numero}: (${[p.classe, p.foro].filter(Boolean).join(' – ')})`
            ).join('\n');
        }
        return texto + notaJuntada;
    }

    // Sem dados de conteúdo
    if (resultado.status === 'nao_corresponde') {
        return `${id}Documento não corresponde ao tipo esperado. ${resultado._avisoNome || ''}${notaJuntada}`;
    }
    if (resultado.status === 'pdf_sem_texto') {
        return `${id}PDF sem texto extraível. Verificar manualmente.`;
    }
    // Códigos internos gerados por _inferirStatusDeCandTexto — converte de volta para texto legível
    if (resultado.status === 'dispensado')  return `${id}Não se aplica.`;
    if (resultado.status === 'inconclusivo') return `${id}Inconclusivo — verificar manualmente.`;

    return `${id}— sem OCR`;
}

function _extrairDataEmissao(texto) {
    if (!texto) return '';

    const _meses = {
        janeiro:1, fevereiro:2, marco:3, abril:4, maio:5, junho:6,
        julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
    };

    const _toData = (raw) => {
        if (!raw) return '';
        const t = raw.trim();
        // Por extenso: "10 de abril de 2026"
        const mExt = t.match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
        if (mExt) {
            const mes = _meses[_norm(mExt[2])];
            return mes ? `${mExt[1].padStart(2,'0')}/${String(mes).padStart(2,'0')}/${mExt[3]}` : '';
        }
        // Numérica: dd/mm/aaaa ou dd.mm.aaaa
        const mNum = t.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
        if (mNum) return `${mNum[1].padStart(2,'0')}/${mNum[2].padStart(2,'0')}/${mNum[3]}`;
        return '';
    };

    const _dp = '(\\d{1,2}\\s+de\\s+\\w+\\s+de\\s+\\d{4}|\\d{1,2}[\\/\\.]\\d{1,2}[\\/\\.]\\d{4})';
    const padroesContexto = [
        // "emitida/expedida/gerada em DD..."
        new RegExp(`(?:emitid[ao]?\\s+em|expedid[ao]?\\s+em|gerad[ao]?\\s+em)\\s+${_dp}`, 'i'),
        // "às HH:MM do dia DD/MM/AAAA"
        new RegExp(`(?:d[ao]\\s+dia|às?\\s+\\d{2}:\\d{2}(?::\\d{2})?\\s+(?:hora?s?\\s+)?d[ao]\\s+dia)\\s+${_dp}`, 'i'),
        // "Data de emissão: DD..." / "Data: DD..."
        new RegExp(`(?:data\\s+de\\s+emiss[aã]o|data\\s+de\\s+expedi[cç][aã]o|data)[:\\s]+${_dp}`, 'i'),
        // "São Paulo, DD..." / "Brasília, DD..."
        new RegExp(`(?:S[aã]o\\s+Paulo|Bras[íi]lia|Rio\\s+de\\s+Janeiro|Curitiba|Campinas|Bel[eé]m|Fortaleza|Salvador|Recife|Mana[ou]s)[,.]?\\s+${_dp}`, 'i'),
        // "em DD de mês de AAAA" — contextual sem cidade
        new RegExp(`\\bem\\s+(\\d{1,2}\\s+de\\s+\\w+\\s+de\\s+\\d{4})`, 'i'),
    ];

    for (const re of padroesContexto) {
        const m = texto.match(re);
        if (m) {
            const d = _toData(m[1].trim());
            if (d) return d;
        }
    }

    // Fallback: última ocorrência de dd/mm/aaaa no documento (certidões têm a data de emissão no final)
    const reNumFallback = /(\d{2})\/(\d{2})\/(\d{4})/g;
    let ultima = null;
    const trecho = texto.slice(-4000); // evita datas pessoais do início
    let mFb;
    while ((mFb = reNumFallback.exec(trecho)) !== null) {
        const ano = parseInt(mFb[3], 10);
        const mes = parseInt(mFb[2], 10);
        const dia = parseInt(mFb[1], 10);
        if (ano >= 2020 && ano <= 2030 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
            ultima = `${mFb[1]}/${mFb[2]}/${mFb[3]}`;
        }
    }
    return ultima || '';
}

// Retorna true se o candidato é militar ou servidor público (exige desincompatibilização)
function _candidatoNecessitaDesincompat() {
    const card = document.getElementById('processo-info-card');
    const ocup = card?.querySelector('[data-info="ocupacao"] .card-val')?.textContent?.trim() || '';
    if (!ocup) return true; // sem dados → conservador: assume que precisa
    const n = _norm(ocup);
    return /militar|policial|bombeiro|guarda.*munic|marinha|exercito|aeronautica|forca.*aerea/.test(n) ||
           /servidor|func.*pub|serv.*pub|agente.*pub/.test(n) ||
           /delegado|promotor|procurador|magistrado|\bjuiz\b|desembargador/.test(n) ||
           /auditor|fiscal.*fed|fiscal.*est|tecnico.*trib|analista.*trib/.test(n);
}

// Prioridade de exibição na tabela de auditoria (menor = primeiro)
function _ordemDocumento(nome) {
    const n = _norm((nome || '').replace(/\([^)]+\)/g, ''));
    if (/peticao.*inicial|inicial.*peticao/.test(n))                              return 1;
    if (/\brrc\b|requerimento.*registro|registro.*candidatura/.test(n))           return 2;
    if (/identidade|rg\b|cnh\b|passaporte/.test(n))                              return 3;
    if (/escolaridade|diploma|historico.*escolar/.test(n))                        return 4;
    if (/federal.*(1|primeiro).*grau|secao.*judiciaria|juizado.*federal/.test(n)) return 5;
    if (/federal.*(2|segundo).*grau|tribunal.*regional.*federal|\btrf\b/.test(n)) return 6;
    if (/estadual.*(1|primeiro).*grau/.test(n))                                   return 7;
    if (/estadual.*(2|segundo).*grau/.test(n))                                    return 8;
    if (/prerrogativa/.test(n))                                                   return 9;
    if (/desincompat/.test(n))                                                    return 10;
    if (/declarac.*bens|bens.*declarac/.test(n))                                  return 11;
    if (/relatorio.*requisito|requisito.*registro/.test(n))                       return 12;
    return 99;
}

function _statusCandItem(resultado, itemId) {
    if (itemId === 'convencao')    return _checklistProcessoAssociado ? 'ok' : 'pendente';
    // Divergências: presente se o documento foi encontrado na árvore, pendente caso contrário
    if (itemId === 'divergencias') {
        const _sel = _S._divergenciasSelecao;
        if (_sel === 'sem') return 'ok';
        if (_sel === 'com') return 'nok';
        return resultado ? 'ok' : 'pendente';
    }
    if (itemId === 'desincompat' && !_candidatoNecessitaDesincompat()) return 'nao_aplica';

    // Itens 10 e 11: badge controlado pelo seletor manual quando definido
    if (itemId === 'prerrogativa' || itemId === 'desincompat') {
        const _selPD = (_S._candSeletoresPD || {})[itemId];
        if (_selPD === 'nao_aplica')       return 'nao_aplica';
        if (_selPD === 'nao_apresentado')  return 'nao_apresentado';
        if (_selPD === 'nada_consta')      return 'ok';
        if (_selPD === 'consta')           return 'ok';
    }

    // Overrides manuais de certidão: ignoram lógica automática de exec_criminal
    const _ovCert = (_S._candOverrides || {})[itemId];
    if (_ovCert === 'corresponde_com_obj_pe') return 'ok';
    if (_ovCert === 'consta_sem_obj_pe')      return 'nok';

    if (!resultado) return 'pendente';
    if (resultado.status === 'dispensado') return 'nao_aplica';
    // Acumulação: se qualquer documento do mesmo slot for exec_criminal → nok
    // (o resultado retornado por _encontrarResultadoCAND pode ser o mais recente,
    //  que pode ter status diferente — ex: nomenclatura_errada — enquanto o mais
    //  antigo é exec_criminal)
    if (itemId === 'estadual_1grau' && _checklistResultados) {
        const _item8 = _ITENS_CAND.find(i => i.id === 'estadual_1grau');
        if (_item8) {
            const _todos8 = _todosResultadosMesmoTipo(_item8, _checklistResultados);
            if (_todos8.some(r => r._tipoDoc === 'exec_criminal' || r.status?.startsWith('corresponde_nao_adequada')))
                return 'nok';
        }
    }
    // nomenclatura_errada: conteúdo presente, apenas nome no PJe está errado
    if (resultado.status === 'nomenclatura_errada')            return 'ok';
    if (resultado.status === 'nomenclatura_errada_incompleto') return 'humano';
    if (resultado.status === 'nomenclatura_errada_ilegivel')   return 'humano';
    if (resultado.status === 'corresponde')                        return 'ok';
    if (resultado.status === 'corresponde_incompleto')             return 'humano';
    if (resultado.status === 'corresponde_ilegivel')               return 'humano';
    if (resultado.status === 'corresponde_incompleto_ilegivel')    return 'humano';
    // Execução Criminal: conteúdo identificado mas documento não adequado ao requisito
    if (resultado.status === 'corresponde_nao_adequada')                    return 'nok';
    if (resultado.status === 'corresponde_nao_adequada_incompleto')         return 'nok';
    if (resultado.status === 'corresponde_nao_adequada_ilegivel')           return 'nok';
    if (resultado.status === 'corresponde_nao_adequada_incompleto_ilegivel') return 'nok';
    if (resultado.status === 'presente')         return itemId === 'identidade' || itemId === 'escolaridade' ? 'humano' : 'ok';
    if (resultado.status === 'nao_apresentado')  return 'nao_apresentado';
    if (resultado.status.startsWith('nao_'))     return 'nok';
    return 'pendente';
}

function _labelStatus(s) {
    return {
        ok:             '🟢 OK',
        nok:            '🔴 Pendência',
        humano:         '🟡 Conferir',
        pendente:       '🟡 Conferir',
        nao_apresentado:'🔴 Pendência',
        nao_aplica:     '⚪ N/A',
    }[s] || s;
}


// ── Localiza o resultado da auditoria correspondente a um item do CAND ────────
// Lógica centralizada — usada tanto no checklist quanto na certidão de recebimento.
function _encontrarResultadoCAND(item, resultados) {
    if (!item.tipo) return null;
    if (item.tipo === 'peticao_inicial')
        return resultados.find(r =>
            /peticao.*inicial|inicial.*peticao/i.test(_norm(r.nome)) && r.status !== 'erro'
        ) || null;
    if (item.tipo === 'rrc')
        return resultados.find(r =>
            /\brrc\b|requerimento.*registro|registro.*candidatura/.test(_norm(r.nome.replace(/\([^)]+\)/g, ''))) && r.status !== 'erro'
        ) || null;
    if (item.tipo === 'identidade') {
        // Retorna o documento de identidade mais recente (maior ID numérico na árvore)
        // \brg\b e \bcnh\b com word boundary para evitar falso positivo em nomes de arquivo
        // como "CNHISRAELNANTES..." (comprovante de escolaridade nomeado com CNH no início)
        const todos = resultados.filter(r =>
            /identidade|\brg\b|\bcnh\b|passaporte/i.test(r.nome) && r.status !== 'erro'
        );
        if (todos.length === 0) return null;
        return todos.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);
    }
    if (item.tipo === 'bens')
        return resultados.find(r =>
            /declarac.*bens|bens.*declarac/i.test(_norm(r.nome)) && r.status !== 'erro'
        ) || null;
    if (item.tipo === 'foro_prerrogativa') {
        const _todos = resultados.filter(r => /prerrogativa/i.test(r.nome) && r.status !== 'erro');
        if (_todos.length === 0) return null;
        return _todos.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);
    }
    // PRIMARY — tipo identificado pelo OCR; retorna o mais recente quando há múltiplos
    // federal_regional (TRF3 Abrangência Regional) satisfaz federal_1grau e federal_2grau
    // exec_criminal é expedida pela Justiça Estadual de 1º grau — satisfaz o slot estadual_1grau
    const _equivCAND = (t) => {
        if (t === 'federal_1grau' || t === 'federal_2grau') return [t, 'federal_regional'];
        if (t === 'estadual_1grau') return [t, 'exec_criminal'];
        return [t];
    };
    const _primary = resultados.filter(r => _equivCAND(item.tipo).includes(r._tipoDoc) && r.status !== 'erro');
    if (_primary.length > 0)
        return _primary.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);
    // FALLBACK — nome na árvore do PJe; retorna o mais recente quando há múltiplos
    const _fallback = resultados.filter(r => {
        // exec_criminal juntado sob nome de 2º grau → aparece no slot estadual_2grau via fallback
        // (a rejeição pelo nome já foi feita em verificarTipoContraNome → status nomenclatura_errada)
        const _tipoPermitido = _equivCAND(item.tipo).includes(r._tipoDoc) ||
            (item.tipo === 'estadual_2grau' && r._tipoDoc === 'exec_criminal');
        if (r._tipoDoc && !_tipoPermitido) return false;
        const n = _norm(r.nome);
        if (item.tipo === 'estadual_1grau') return /estadual.*(1|primeiro).*grau/.test(n);
        if (item.tipo === 'estadual_2grau') return /estadual.*(2|segundo).*grau/.test(n);
        if (item.tipo === 'federal_1grau')  return /federal.*(1|primeiro).*grau|federal|trf/.test(n);
        if (item.tipo === 'federal_2grau')  return /federal.*(2|segundo).*grau|federal|trf/.test(n);
        if (item.tipo === 'desincompat')    return /desincompat/.test(n);
        if (item.tipo === 'escolaridade')   return /escolaridade|diploma/.test(n);
        if (item.tipo === 'rrc')            return /\brrc\b|requerimento.*registro|registro.*candidatura/.test(n);
        return false;
    });
    if (_fallback.length === 0) return null;
    return _fallback.reduce((a, b) => (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a);
}

// ── Calcula validade de certidão (regra: 90 dias a partir da emissão) ─────────
function _calcularValidadeCertidao(dataEmissao) {
    if (!dataEmissao) return null;
    const partes = dataEmissao.split('/').map(Number);
    if (partes.length !== 3 || partes.some(isNaN)) return null;
    const [dia, mes, ano] = partes;
    const emissao = new Date(ano, mes - 1, dia);
    if (isNaN(emissao.getTime())) return null;
    const vencimento = new Date(emissao);
    vencimento.setDate(vencimento.getDate() + 90);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diasRestantes = Math.ceil((vencimento - hoje) / 86400000);
    const status = diasRestantes < 0 ? 'expirada' : 'valida';
    return {
        status,
        diasRestantes,
        dataVencimento: vencimento.toLocaleDateString('pt-BR'),
    };
}

// ── Infere status a partir do texto digitado no textarea do CAND ──────────────
// Mescla o texto salvo do CAND com o novo, sem duplicar linhas de documentos
// cujo "ID <n>" ja consta no salvo. Puro (testado em tests/cand.test.mjs).
function _mesclarTextoCandPorId(textoSalvo, textoObs) {
    if (!textoObs || !textoObs.trim()) return textoSalvo;
    if (!textoSalvo) return textoObs;
    const _ids = new Set([...textoSalvo.matchAll(/\bID\s+(\d+)/g)].map(m => m[1]));
    const _novas = textoObs.split('\n').filter(function (linha) {
        const mId = linha.match(/\bID\s+(\d+)/);
        if (!mId) return false;
        return !_ids.has(mId[1]);
    });
    return _novas.length > 0 ? textoSalvo + '\n' + _novas.join('\n') : textoSalvo;
}

function _inferirStatusDeCandTexto(texto) {
    const t = (texto || '').trim();
    if (/^n[ãa]o\s+se\s+aplica/i.test(t)) return 'dispensado';
    if (/^n[ãa]o\s+apresentado/i.test(t)) return 'nao_apresentado';
    if (/\bnada\s+consta\b/i.test(t)) return 'corresponde';
    if (/\bconsta\b(?!\s+data|\s+em)/i.test(t)) return 'corresponde_incompleto';
    return null;
}

// ── Aplica overrides manuais do CAND a uma cópia dos resultados ───────────────
// ── Fase 2: aplica a marcação do CAND vinda do card na árvore (mesmo efeito dos seletores do painel) ──
function aplicarMarcaCandExterno(itemId, k, detalheV, corr) {
    try {
        const item = _ITENS_CAND.find(i => i.id === itemId);
        if (!item) return;
        _S._candOverrides     = _S._candOverrides     || {};
        _S._candOverridesAuto = _S._candOverridesAuto || {};
        _S._candSeletoresPD   = _S._candSeletoresPD   || {};
        const _CERT = new Set(['federal_1grau','federal_2grau','federal_regional','estadual_1grau','estadual_1grau_eproc','estadual_2grau']);
        if (item.id === 'divergencias') {
            _S._divergenciasSelecao = k === 'ok' ? 'sem' : k === 'pd' ? 'com' : 'aguardando';
        } else if (item.id === 'prerrogativa' || item.id === 'desincompat') {
            _S._candSeletoresPD[item.id] = k === 'ok' ? 'nada_consta' : k === 'cf' ? 'consta' : k === 'pd' ? 'nao_apresentado' : 'nao_aplica';
        } else if (_CERT.has(item.tipo)) {
            if (detalheV) { _S._candOverrides[item.id] = detalheV; }
            else {
                const v = k === 'ok' ? 'corresponde' : k === 'pd' ? 'nao_apresentado' : null;
                if (v) _S._candOverrides[item.id] = v; else delete _S._candOverrides[item.id];
            }
            delete _S._candOverridesAuto[item.id];
        } else {
            const v = k === 'ok' ? 'corresponde' : k === 'pd' ? 'nao_apresentado' : null;
            if (v) _S._candOverrides[item.id] = v; else delete _S._candOverrides[item.id];
            delete _S._candOverridesAuto[item.id];
        }
        const _ovVal = detalheV || (k === 'pd' ? 'nao_apresentado' : null);
        const _motivo = (corr && corr.motivo) ? corr.motivo : null;
        _S._candMarcaMotivo = _S._candMarcaMotivo || {};
        if (_motivo) _S._candMarcaMotivo[item.id] = _motivo; else delete _S._candMarcaMotivo[item.id];
        if (_motivo) {
            _S._trilhaAuditoria = _S._trilhaAuditoria || [];
            _S._trilhaAuditoria.push({ item: item.id, titulo: item.titulo || '', de: corr.de || '', para: corr.para || '', motivo: _motivo, quem: _S._servidorResponsavel || _S._nomeServidor || '', quando: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) });
            try {
                const _obs = "Ajuste do servidor: era '" + (corr.de || '?') + "', agora '" + (corr.para || '?') + "'. Motivo: " + _motivo;
                const _rs = (typeof _todosResultadosMesmoTipo === 'function' && _S._auditoriaResultados) ? _todosResultadosMesmoTipo(item, _S._auditoriaResultados) : [];
                for (const _r of _rs) { if (_r) { _r._statusOriginal = _r._statusOriginal || _r.status; _r._obsHumana = _obs; _r._verificacaoHumana = true; if (_ovVal) _r.status = _ovVal; } }
            } catch (_e3) { /* noop */ }
        }
        const _pa = (typeof _checklistProcessoAssociado !== 'undefined' && _checklistProcessoAssociado != null) ? _checklistProcessoAssociado : (_S._processoAssociado || '');
        if (_checklistResultados) renderizarChecklistCAND(_checklistResultados, _pa);
        if (_S._auditoriaResultados) {
            renderizarResumoArt27(_S._auditoriaResultados, _pa);
            salvarNoSheets(_S._auditoriaResultados);
        }
    } catch (e) { console.warn('[AuditJE][fase2] aplicarMarcaCandExterno:', e); }
}
function aplicarObservacaoCandExterno(itemId, texto, salvar) {
    try {
        const item = _ITENS_CAND.find(i => i.id === itemId);
        if (!item) return;
        const _txt = (texto || '').trim();
        const _rs = (typeof _todosResultadosMesmoTipo === 'function' && _S._auditoriaResultados) ? _todosResultadosMesmoTipo(item, _S._auditoriaResultados) : [];
        for (const _r of _rs) { if (_r) { _r._obsHumana = _txt; } }
        if (salvar && _S._auditoriaResultados && typeof salvarNoSheets === 'function') salvarNoSheets(_S._auditoriaResultados);
    } catch (e) { console.warn('[AuditJE][fase2] aplicarObservacaoCandExterno:', e); }
}
if (!window.__AUDITJE_MARCA_LISTENER__) {
    window.__AUDITJE_MARCA_LISTENER__ = true;
    window.addEventListener('message', function (_ev) {
        const _d = _ev.data;
        if (!_d) return;
        if (_d.type === 'AUDITJE_APLICAR_MARCA') { aplicarMarcaCandExterno(_d.itemId, _d.k, _d.detalheV, _d.corr); return; }
        if (_d.type === 'AUDITJE_OBSERVACAO') { aplicarObservacaoCandExterno(_d.itemId, _d.texto, _d.salvar); return; }
    });
}

function _resultadosComOverrides(resultados) {
    const overrides = _S._candOverrides;
    if (!overrides || !Object.keys(overrides).length) return resultados;
    const copia = resultados.map(r => Object.assign({}, r));
    for (const [itemId, novoStatus] of Object.entries(overrides)) {
        if (!novoStatus) continue;
        const item = _ITENS_CAND.find(i => i.id === itemId);
        if (!item) continue;
        // Normaliza valores semânticos para status OCR efetivos no TSV/Resumo
        const _statusEfetivo = novoStatus === 'corresponde_com_obj_pe' ? 'corresponde'
                             : novoStatus === 'consta_sem_obj_pe'      ? 'nao_corresponde'
                             : novoStatus;
        // Sobrescreve TODOS os documentos do mesmo slot (item pode ter múltiplos na árvore)
        // para evitar que documentos mais antigos do mesmo tipo permaneçam com status original
        const _eAutoInferido = !!(_S._candOverridesAuto || {})[itemId];
        const _todosDoSlot = _todosResultadosMesmoTipo(item, copia);
        if (_todosDoSlot.length > 0) {
            _todosDoSlot.forEach(r => {
                r._statusOriginal = r._statusOriginal || r.status; // preserva para filtros
                r._overrideAuto   = _eAutoInferido;                // true = inferido do textarea
                r.status = _statusEfetivo;
                r._candOv = novoStatus;
            });
        } else {
            // Documento nunca juntado: injeta entrada sintética para que Resumo e
            // ausentesForaArvore na Certidão reflitam o override manual do CAND.
            copia.push({ nome: item.titulo, _tipoDoc: item.tipo, status: _statusEfetivo, _override: true });
        }
    }
    return copia;
}

// ── Renderiza o painel CAND ───────────────────────────────────────────────────
function renderizarChecklistCAND(resultados, processoAssociado) {
    // Textos: regra única — o mais recente sempre prevalece (manual ou automático).
    // textoObs gerado agora sobrescreve qualquer texto anterior.
    // Se textoObs estiver vazio (item sem documento), preserva o último salvo.

    _checklistResultados        = resultados;           // guarda originais para re-renders pós-edição
    _checklistProcessoAssociado = processoAssociado;

    // Aplica overrides manuais para renderização (badge + texto de cada item)
    const resultadosRender = _resultadosComOverrides(resultados);

    // Cruza com objeto e pé antes de renderizar
    cruzarComObjetoPe(resultados);

    const painel = document.getElementById('painel-cand');
    if (!painel) return;
    painel.innerHTML = '';

    // Cabeçalho do checklist
    const cabecalho = document.createElement('div');
    cabecalho.style.cssText = 'padding:14px 16px 8px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);margin-bottom:12px;';
    const _cabTitulo = document.createElement('span');
    _cabTitulo.style.cssText = 'font-weight:700;font-size:14px;color:var(--accent);font-family:"IBM Plex Mono",monospace;letter-spacing:.05em;';
    _cabTitulo.textContent = '📋 RELATÓRIO ANALÍTICO — CAND';
    cabecalho.appendChild(_cabTitulo);

    // Botão salvar + status
    const _cabDir = document.createElement('div');
    _cabDir.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
    const _statusSalvar = document.createElement('span');
    _statusSalvar.id = 'cand-status-salvar';
    _statusSalvar.style.cssText = 'font-size:10px;color:var(--text-muted);font-family:"IBM Plex Mono",monospace;';
    const _btnSalvar = document.createElement('button');
    _btnSalvar.id = 'cand-btn-salvar';
    _btnSalvar.style.cssText = 'background:var(--accent);border:none;color:#fff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:5px;cursor:pointer;';
    _btnSalvar.textContent = '💾 Salvar';
    _btnSalvar.addEventListener('click', () => {
        if (!_S._auditoriaResultados) return;
        _statusSalvar.textContent = '⏳ Salvando...';
        salvarNoSheets(_S._auditoriaResultados).then(() => {
            _statusSalvar.textContent = '✅ Salvo';
            setTimeout(() => { _statusSalvar.textContent = ''; }, 3000);
        }).catch(() => {
            _statusSalvar.textContent = '⚠️ Erro ao salvar';
        });
    });
    _cabDir.appendChild(_statusSalvar);
    _cabDir.appendChild(_btnSalvar);
    cabecalho.appendChild(_cabDir);
    painel.appendChild(cabecalho);

    // ── Legenda dos 4 estados + resumo de ações (Fase 1: semáforo) ─────────
    {
        const _legenda = document.createElement('div');
        _legenda.className = 'cnd-legenda';
        _legenda.style.cssText = 'padding:0 16px;';
        _legenda.innerHTML =
            '<span class="cnd-sf ok">🟢 OK</span>' +
            '<span class="cnd-sf cf">🟡 Conferir</span>' +
            '<span class="cnd-sf pd">🔴 Pendência</span>' +
            '<span class="cnd-sf na">⚪ Não se aplica</span>';
        painel.appendChild(_legenda);

        // Conta os estados dos itens (snapshot na renderização)
        let _nOk = 0, _nCf = 0, _nPd = 0, _nNa = 0;
        for (const _it of _ITENS_CAND) {
            const _s = _statusCandItem(_encontrarResultadoCAND(_it, resultadosRender), _it.id);
            if (_s === 'ok') _nOk++;
            else if (_s === 'nok' || _s === 'nao_apresentado') _nPd++;
            else if (_s === 'nao_aplica') _nNa++;
            else _nCf++;
        }
        const _nAcao = _nCf + _nPd;
        const _resumo = document.createElement('div');
        _resumo.className = 'cnd-resumo';
        _resumo.style.cssText = 'margin:0 16px 12px;';
        _resumo.innerHTML =
            `<span class="n">${_nAcao}</span>` +
            `<span class="txt"><b>${_nAcao === 1 ? 'item precisa' : 'itens precisam'} de você</b>` +
            (_nAcao ? ` — ${_nCf} conferir · ${_nPd} pendência` : ' — tudo em ordem') +
            `<span class="sub">de ${_ITENS_CAND.length} itens: ${_nOk} OK · ${_nNa} não se aplicam</span></span>`;
        painel.appendChild(_resumo);
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:0 16px 24px;';
    painel.appendChild(wrap);

    // Duas colunas de flex — fluxo coluna por coluna (itens 0..metade-1 à esq, restante à dir)
    const _colLeft  = document.createElement('div');
    _colLeft.style.cssText  = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;';
    const _colRight = document.createElement('div');
    _colRight.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;';
    wrap.appendChild(_colLeft);
    wrap.appendChild(_colRight);
    const _metade = Math.ceil(_ITENS_CAND.length / 2);

    // Pré-computa tabela de distribuição × objeto e pé e indexa por tipo
    const _tabelaDistrPre = gerarTabelaDistribuicaoObjetoPe(resultadosRender);
    const _gruposPorTipo  = new Map();
    if (_tabelaDistrPre?.grupos) _tabelaDistrPre.grupos.forEach(g => _gruposPorTipo.set(g.tipo, g));

    // Helpers compartilhados para semáforo e cores de diligência
    const _corDilH  = (v) => v === 'NÃO' ? 'var(--success,#22c55e)' : v.includes('Verificar') ? '#f59e0b' : 'var(--error,#ef4444)';
    const _bgDilH   = (v) => v === 'NÃO' ? 'rgba(34,197,94,0.08)'   : v.includes('Verificar') ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
    const _semDilH  = (v) => v === 'NÃO' ? '🟢' : v.includes('Verificar') ? '🟡' : '🔴';
    const _OPCOES_D = ['NÃO','SIM (Verificar situação)','SIM (Documento faltante)','SIM (Verificar principal)','SIM (Situação não identificada)'];

    for (let _idx = 0; _idx < _ITENS_CAND.length; _idx++) {
    const item = _ITENS_CAND[_idx];
        const resultado = _encontrarResultadoCAND(item, resultadosRender);
        const status    = _statusCandItem(resultado, item.id);
        const textoObs = gerarTextoCAND(item, resultado, processoAssociado);

        const div = document.createElement('div');
        div.className = 'cand-item';

        const header = document.createElement('div');
        header.className = 'cand-item-header';
        header.innerHTML = `
            <span class="cand-chevron">▶</span>
            <span class="cand-item-titulo">${item.titulo}</span>
            <span class="cand-item-status ${status}">${_labelStatus(status)}</span>
        `;
        header.addEventListener('click', () => {
            const jaAberto = div.classList.contains('expandido');
            // Fecha todos os outros (accordion verdadeiro)
            wrap.querySelectorAll('.cand-item.expandido').forEach(el => el.classList.remove('expandido'));
            // Abre este se estava fechado
            if (!jaAberto) div.classList.add('expandido');
        });

        const body = document.createElement('div');
        body.className = 'cand-item-body';

        const label = document.createElement('div');
        label.className = 'cand-obs-label';
        label.textContent = 'Observação para o CAND';

        const textarea = document.createElement('textarea');
        textarea.className = 'cand-obs-texto';
        textarea.dataset.item = item.id;
        // Texto do textarea: regra —
        //   • Preservar todas as linhas existentes (manual ou automático anterior)
        //   • Acrescentar apenas linhas de IDs ainda não presentes no texto salvo
        //   • Se o ID já aparece no texto salvo: ignora — não substitui, não duplica
        //   • Sem novo texto: mantém o que havia
        _S._candTextos = _S._candTextos || {};
        const _textoSalvo = _S._candTextos[item.id] || '';
        // Mescla texto salvo + novo sem duplicar por ID (ver _mesclarTextoCandPorId + tests/cand.test.mjs).
        const _textoFinal = _mesclarTextoCandPorId(_textoSalvo, textoObs);
        _S._candTextos[item.id] = _textoFinal;
        textarea.value = _textoFinal;
        textarea.rows  = (_textoFinal || '').split('\n').length + 1;

        // ── Seletor especial: Inexistência de Divergências do Cadastro ──────────
        let _divSeletor = null;
        if (item.id === 'divergencias') {
            _divSeletor = _seletorSemaforo({
                aplicaNA: false,
                captions: { ok: 'sem divergência', cf: 'aguardando', pd: 'com divergência' },
                acao: { cf: 'Aguardando a integração com o Cadastro — conferir após a atualização.', pd: 'Com divergência no cadastro — regularizar antes do deferimento.' },
                estadoAtual: () => {
                    const s = _S._divergenciasSelecao || 'aguardando';
                    return s === 'sem' ? 'ok' : s === 'com' ? 'pd' : 'cf';
                },
                aplicar: (k) => {
                    _S._divergenciasSelecao = k === 'ok' ? 'sem' : k === 'pd' ? 'com' : 'aguardando';
                    const _t = gerarTextoCAND(item, resultado, processoAssociado);
                    textarea.value = _t;
                    textarea.rows  = _t.split('\n').length + 1;
                    const _badge = header.querySelector('.cand-item-status');
                    const _st = _S._divergenciasSelecao === 'sem' ? 'ok' : _S._divergenciasSelecao === 'com' ? 'nok' : 'pendente';
                    if (_badge) { _badge.className = `cand-item-status ${_st}`; _badge.textContent = _labelStatus(_st); }
                },
            });
        }

        // ── Seletor especial: Documento de identidade e Comprovante de escolaridade ──
        if (item.id === 'identidade' || item.id === 'escolaridade') {
            _divSeletor = _seletorSemaforo({
                aplicaNA: false,
                captions: { ok: 'verificado', cf: 'verificação humana', pd: 'não apresentado' },
                acao: { cf: 'Verificação humana pendente — conferir o documento.', pd: 'Documento não apresentado — diligenciar.' },
                estadoAtual: () => {
                    const ov = (_S._candOverrides || {})[item.id];
                    return ov === 'corresponde' ? 'ok' : ov === 'nao_apresentado' ? 'pd' : 'cf';
                },
                aplicar: (k) => {
                    _S._candOverrides = _S._candOverrides || {};
                    const v = k === 'ok' ? 'corresponde' : k === 'pd' ? 'nao_apresentado' : null;
                    if (v) _S._candOverrides[item.id] = v;
                    else   delete _S._candOverrides[item.id];
                    const _badge = header.querySelector('.cand-item-status');
                    if (_badge) {
                        const _st = v === 'corresponde' ? 'ok' : v === 'nao_apresentado' ? 'nao_apresentado' : 'humano';
                        _badge.className  = `cand-item-status ${_st}`;
                        _badge.textContent = _labelStatus(_st);
                    }
                },
            });
        }

        // ── Seletor especial: Foro por Prerrogativa (item 10) e Desincompatibilização (item 11) ──
        if (item.id === 'prerrogativa' || item.id === 'desincompat') {
            _divSeletor = _seletorSemaforo({
                aplicaNA: true,
                captions: { ok: 'nada consta', cf: 'consta', pd: 'não apresentado', na: 'não exigido' },
                acao: { cf: 'Consta — conferir a situação processual.', pd: 'Documento não apresentado — diligenciar/exigir.' },
                estadoAtual: () => {
                    const s = (_S._candSeletoresPD || {})[item.id];
                    if (!s) return (item.id === 'desincompat' && !_candidatoNecessitaDesincompat()) ? 'na' : null;
                    return s === 'nada_consta' ? 'ok' : s === 'consta' ? 'cf' : s === 'nao_apresentado' ? 'pd' : s === 'nao_aplica' ? 'na' : null;
                },
                aplicar: (k) => {
                    _S._candSeletoresPD = _S._candSeletoresPD || {};
                    const v = k === 'ok' ? 'nada_consta' : k === 'cf' ? 'consta' : k === 'pd' ? 'nao_apresentado' : 'nao_aplica';
                    _S._candSeletoresPD[item.id] = v;
                    const _t = gerarTextoCAND(item, resultado, processoAssociado);
                    textarea.value = _t;
                    textarea.rows  = _t.split('\n').length + 1;
                    const _badge = header.querySelector('.cand-item-status');
                    const _st = v === 'nao_aplica' ? 'nao_aplica' : v === 'nao_apresentado' ? 'nao_apresentado' : 'ok';
                    if (_badge) { _badge.className = `cand-item-status ${_st}`; _badge.textContent = _labelStatus(_st); }
                },
            });
        }

        // ── Seletor especial: Certidões criminais (itens com tipo de certidão) ──
        const _TIPOS_CERT_SELETOR = new Set(['federal_1grau','federal_2grau','federal_regional','estadual_1grau','estadual_1grau_eproc','estadual_2grau']);
        if (_TIPOS_CERT_SELETOR.has(item.tipo)) {
            const _repintaBadgeCert = () => {
                const _badge = header.querySelector('.cand-item-status');
                if (!_badge) return;
                const val = (_S._candOverrides || {})[item.id];
                let _st;
                if (!val)                                                          _st = _statusCandItem(resultado, item.id);
                else if (val === 'corresponde' || val === 'corresponde_com_obj_pe') _st = 'ok';
                else if (val === 'consta_sem_obj_pe' || val === 'nao_corresponde')  _st = 'nok';
                else if (val === 'nao_apresentado')                                _st = 'nao_apresentado';
                else                                                               _st = 'pendente';
                _badge.className  = `cand-item-status ${_st}`;
                _badge.textContent = _labelStatus(_st);
            };
            _divSeletor = _seletorSemaforo({
                aplicaNA: false,
                captions: { ok: 'nada consta', cf: 'OCR / aguardando', pd: 'não apresentado' },
                acao: { cf: 'Aguardando análise (OCR) — conferir o conteúdo da certidão.', pd: 'Conferir os processos e cruzar com a Certidão de Objeto e Pé; se faltar, diligenciar.' },
                estadoAtual: () => {
                    const ov = (_S._candOverrides || {})[item.id];
                    if (ov == null) return 'cf';
                    if (ov === 'corresponde' || ov === 'corresponde_com_obj_pe') return 'ok';
                    return 'pd';
                },
                aplicar: (k) => {
                    _S._candOverrides     = _S._candOverrides     || {};
                    _S._candOverridesAuto = _S._candOverridesAuto || {};
                    const v = k === 'ok' ? 'corresponde' : k === 'pd' ? 'nao_apresentado' : null;
                    if (v) _S._candOverrides[item.id] = v;
                    else   delete _S._candOverrides[item.id];
                    delete _S._candOverridesAuto[item.id];
                    _repintaBadgeCert();
                },
                detalhe: {
                    label: 'Se constar, detalhe:',
                    visivelEm: ['ok', 'cf', 'pd'],
                    opcoes: [
                        { v: 'corresponde_com_obj_pe', lbl: 'Consta + Objeto e Pé ✅' },
                        { v: 'consta_sem_obj_pe',      lbl: 'Consta, sem Objeto e Pé' },
                        { v: 'nao_corresponde',        lbl: 'Não corresponde' },
                    ],
                    valorAtual: () => (_S._candOverrides || {})[item.id],
                    aplicar: (v) => {
                        _S._candOverrides     = _S._candOverrides     || {};
                        _S._candOverridesAuto = _S._candOverridesAuto || {};
                        _S._candOverrides[item.id] = v;
                        delete _S._candOverridesAuto[item.id];
                        _repintaBadgeCert();
                    },
                },
            });
        }

        // Listener unificado: atualiza badge ao editar qualquer textarea do CAND
        {
            const badge = header.querySelector('.cand-item-status');
            const _textoVazioConvencao = (item.id === 'convencao') ? gerarTextoCAND(item, null, null) : null;
            if (badge) {
                const _atualizarBadge = () => {
                    // Divergências e certidões com seletor: badge controlado pelo seletor, não pelo textarea
                    if (item.id === 'divergencias') return;
                    if (_TIPOS_CERT_SELETOR.has(item.tipo) && (_S._candOverrides || {})[item.id]) return;
                    const val = textarea.value.trim();
                    // "NÃO SE APLICA" → badge nao_aplica (qualquer item)
                    if (/^n[ãa]o\s+se\s+aplica/i.test(val)) {
                        badge.className = 'cand-item-status nao_aplica';
                        badge.textContent = _labelStatus('nao_aplica');
                        return;
                    }
                    // "NÃO APRESENTADO" → badge nao_apresentado
                    if (/^n[ãa]o\s+apresentado/i.test(val)) {
                        badge.className = 'cand-item-status nao_apresentado';
                        badge.textContent = _labelStatus('nao_apresentado');
                        return;
                    }
                    // Convenção: presente se diferente do texto padrão "preencher manualmente"
                    if (item.id === 'convencao') {
                        const novo = val && val !== _textoVazioConvencao ? 'ok' : 'pendente';
                        badge.className = `cand-item-status ${novo}`;
                        badge.textContent = _labelStatus(novo);
                        return;
                    }
                    // Demais itens: "NADA CONSTA" → ok; "CONSTA" → nok; vazio → pendente
                    if (/\bnada\s+consta\b/i.test(val)) {
                        badge.className = 'cand-item-status ok';
                        badge.textContent = _labelStatus('ok');
                        return;
                    }
                    if (/\bconsta\b(?!\s+data|\s+em)/i.test(val)) {
                        badge.className = 'cand-item-status nok';
                        badge.textContent = _labelStatus('nok');
                        return;
                    }
                    // Demais itens: não altera badge (status vem da auditoria e é refletido ao renderizar)
                };
                textarea.addEventListener('input', _atualizarBadge);
                // Avalia imediatamente ao renderizar (cobre itens já preenchidos)
                _atualizarBadge();
            }
        }

        // Sincroniza Resumo/Certidão após edição manual (debounce 600ms)
        textarea.addEventListener('input', () => {
            // Persiste o texto (manual ou via seletor) — é sempre o mais recente
            _S._candTextos = _S._candTextos || {};
            if (textarea.value.trim()) _S._candTextos[item.id] = textarea.value;
            else delete _S._candTextos[item.id];

            clearTimeout(textarea._candSyncTimer);
            textarea._candSyncTimer = setTimeout(() => {
                _S._candOverrides     = _S._candOverrides     || {};
                _S._candOverridesAuto = _S._candOverridesAuto || {};
                const st = _inferirStatusDeCandTexto(textarea.value);
                if (st) {
                    _S._candOverrides[item.id]     = st;
                    _S._candOverridesAuto[item.id] = true;  // inferido do textarea, não seletor
                } else {
                    delete _S._candOverrides[item.id];
                    delete _S._candOverridesAuto[item.id];
                }
                if (_S._auditoriaResultados)
                    renderizarResumoArt27(_S._auditoriaResultados, _checklistProcessoAssociado);
            }, 600);
            // Salva no Sheets após edição (debounce 2s)
            clearTimeout(textarea._sheetsSaveTimer);
            textarea._sheetsSaveTimer = setTimeout(() => {
                if (_S._auditoriaResultados) salvarNoSheets(_S._auditoriaResultados);
            }, 2000);
        });

        const btnCopiar = document.createElement('button');
        btnCopiar.className = 'cand-copiar';
        btnCopiar.textContent = '📋 Copiar';
        btnCopiar.addEventListener('click', () => {
            const ta = document.createElement('textarea');
            ta.value = textarea.value;
            ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
            btnCopiar.textContent = ok ? '✅ Copiado!' : '⚠️ Falhou';
            setTimeout(() => { btnCopiar.textContent = '📋 Copiar'; }, 2500);
        });

        // Regenera a observação a partir do texto gerado (padrão do Caminho B para
        // itens no escopo, ou texto automático), com {ID}/{processo} preenchidos.
        const btnRegenerar = document.createElement('button');
        btnRegenerar.type = 'button';
        btnRegenerar.className = 'cand-copiar';
        btnRegenerar.textContent = '🔄 Regenerar';
        btnRegenerar.title = 'Substitui a observação pelo texto padrão/gerado do item (com {ID}/{processo} preenchidos)';
        btnRegenerar.style.cssText = 'margin-left:6px;';
        btnRegenerar.addEventListener('click', () => {
            const _novo = gerarTextoCAND(item, resultado, processoAssociado);
            if (!_novo || !_novo.trim()) return;
            const _atualTxt = (textarea.value || '').trim();
            if (_atualTxt && _atualTxt !== _novo.trim() &&
                !confirm('Substituir a observação atual pelo texto padrão/gerado do item?')) return;
            textarea.value = _novo;
            textarea.rows  = _novo.split('\n').length + 1;
            _S._candTextos = _S._candTextos || {};
            _S._candTextos[item.id] = _novo;
            textarea.dispatchEvent(new Event('input'));
        });

        // Meta bar: CONSTA/NADA CONSTA + data de emissão (apenas para certidões com OCR)
        const _TIPOS_CERTIDAO_META = new Set(['federal_1grau','federal_2grau','federal_regional','estadual_1grau','estadual_1grau_eproc','estadual_2grau','foro_prerrogativa','desincompat']);
        let metaRow = null;
        if (_TIPOS_CERTIDAO_META.has(item.tipo)) {
            metaRow = document.createElement('div');
            metaRow.className = 'cand-item-meta';

            const constaVal = resultado?._consta || '';
            const constaBadge = document.createElement('span');
            const constaCls = constaVal === 'NADA CONSTA' ? 'nada-consta' : constaVal === 'CONSTA' ? 'consta' : 'indefinido';
            constaBadge.className = `cand-consta-badge ${constaCls}`;
            constaBadge.textContent = constaVal || '— sem OCR';
            metaRow.appendChild(constaBadge);

            const dataEmissao = resultado ? _extrairDataEmissao(resultado._textoExtraido || '') : '';
            if (dataEmissao) {
                const dataSpan = document.createElement('span');
                dataSpan.className = 'cand-data-emissao';
                dataSpan.textContent = `📅 ${dataEmissao}`;
                metaRow.appendChild(dataSpan);

                const validade = _calcularValidadeCertidao(dataEmissao);
                if (validade) {
                    const vBadge = document.createElement('span');
                    vBadge.className = `cand-validade-badge ${validade.status}`;
                    if (validade.status === 'valida' || validade.status === 'expirando') {
                        vBadge.textContent = `VÁLIDA até ${validade.dataVencimento}`;
                    } else {
                        vBadge.textContent = `VALIDADE EXPIRADA em ${validade.dataVencimento}`;
                    }
                    metaRow.appendChild(vBadge);
                }
            }
        }

        if (_divSeletor) body.appendChild(_divSeletor);
        body.appendChild(label);
        body.appendChild(textarea);
        body.appendChild(btnCopiar);
        body.appendChild(btnRegenerar);

        // ── Hipóteses de texto — botão que abre popup de seleção ─────────────
        // Fase 2: consome a lista efetiva (padrões + overlay), apenas os ativos.
        const _snippetsItem = _hipAtivas(item.id);
        if (_snippetsItem && _snippetsItem.length > 0) {
            const _divSnippets = document.createElement('div');
            _divSnippets.style.cssText = 'margin-top:5px;';

            const _btnAbrirHip = document.createElement('button');
            _btnAbrirHip.type = 'button';
            _btnAbrirHip.textContent = `⚡ Sugestões de texto (${_snippetsItem.length})`;
            _btnAbrirHip.title = 'Abrir os textos sugeridos para este item';
            _btnAbrirHip.style.cssText = 'font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--accent);background:var(--surface2);color:var(--accent);font-weight:600;';

            // Insere o texto escolhido no campo de observação, substituindo os
            // marcadores {ID}/{processo} pelos valores reais (mesma injeção do auto-preenchimento).
            const _inserirHip = (snip) => {
                const _texto = _injetarMarcadores(snip, resultado, processoAssociado);
                const _atual = textarea.value.trim();
                textarea.value = _atual ? _atual + '\n' + _texto : _texto;
                textarea.rows  = textarea.value.split('\n').length + 1;
                _S._candTextos = _S._candTextos || {};
                _S._candTextos[item.id] = textarea.value;
                textarea.dispatchEvent(new Event('input'));
            };

            // Abre o popup com os textos já com {ID}/{processo} substituídos (preview = o que será inserido).
            _btnAbrirHip.addEventListener('click', () => {
                const _preview = _snippetsItem.map(t => _injetarMarcadores(t, resultado, processoAssociado));
                _abrirPopupHipoteses(item, _preview, _inserirHip);
            });

            _divSnippets.appendChild(_btnAbrirHip);
            body.appendChild(_divSnippets);
        }

        // ── Cruzamento distribuição × objeto e pé — inline ───────────────────
        // Exibido SOMENTE nos itens de certidão criminal/eleitoral.
        // Itens como RRC, Petição Inicial, Identidade etc. nunca devem exibir esta seção.
        const _TIPOS_DIST_VALIDOS = new Set([
            'estadual_1grau','estadual_1grau_eproc','exec_criminal','estadual_2grau',
            'federal_1grau','federal_2grau','federal_regional',
            'foro_prerrogativa','stj','stf','stm','tjm','eleitoral'
        ]);
        // Chave de busca: prefere o _tipoDoc real do documento (cobre casos como
        // TJM classificado como 'tjm' mas ocupando o slot 'foro_prerrogativa').
        const _chaveGrupo = (resultado?._tipoDoc && _gruposPorTipo.has(resultado._tipoDoc))
            ? resultado._tipoDoc
            : item.tipo;
        if (_TIPOS_DIST_VALIDOS.has(_chaveGrupo) && _gruposPorTipo.has(_chaveGrupo)) {
            const _gi = _gruposPorTipo.get(_chaveGrupo);

            const _sepInline = document.createElement('div');
            _sepInline.style.cssText = 'border-top:1px solid var(--border);margin:10px 0 8px;';
            body.appendChild(_sepInline);

            const _titInline = document.createElement('div');
            _titInline.style.cssText = 'font-weight:700;font-size:12px;color:var(--accent);font-family:"IBM Plex Mono",monospace;letter-spacing:.04em;margin-bottom:6px;';
            _titInline.textContent = `📊 DISTRIBUIÇÃO × OBJETO E PÉ — ${_gi.rows.length} processo(s)`;
            body.appendChild(_titInline);

            // Contador + botões de exportação (TSV por tabela + "Exportar tudo")
            const _ovrsI = _S._diligenciaOverrides || {};
            const _nSimI = _gi.rows.filter(r => (_ovrsI[r.numero] || r.necessidade).startsWith('SIM')).length;
            const _nNaoI = _gi.rows.filter(r => (_ovrsI[r.numero] || r.necessidade) === 'NÃO').length;

            // Helpers de exportação reutilizados pelos 3 botões (Distribuição, Homonímia, Tudo)
            const _tsvDistI = () => {
                const _o = _S._diligenciaOverrides || {};
                return ['Nº CNJ\tClasse (Distr.)\tObj. e Pé\tSituação\tDiligência',
                    ..._gi.rows.map(rr => [rr.numero, rr.classeDistr, rr.idObjetoPe,
                        rr.situacao || '-', _o[rr.numero] || rr.necessidade].join('\t'))
                ].join('\n');
            };
            const _tsvHomonI = () => {
                const _o = _S._diligenciaOverrides || {};
                const _nq = _gi.naoQualificados || [];
                if (!_nq.length) return '';
                return ['Nº CNJ\tClasse\tObj. e Pé\tSituação\tDiligência',
                    ..._nq.map(p => [p.numero, p.classe || '-', p.idObjetoPe || 'Não localizada',
                        p.situacao || '-', _o[p.numero] || p.necessidade || 'SIM (Situação não identificada)'].join('\t'))
                ].join('\n');
            };
            const _copiaTSVI = (texto, btn, label) => {
                const ta = document.createElement('textarea');
                ta.value = texto; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
                document.body.appendChild(ta); ta.focus(); ta.select();
                let ok = false; try { ok = document.execCommand('copy'); } catch(e) {}
                document.body.removeChild(ta);
                btn.textContent = ok ? '✅ Copiado!' : '⚠️ Falhou';
                setTimeout(() => { btn.textContent = label; }, 2500);
            };

            const _hdrI  = document.createElement('div');
            _hdrI.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;';
            const _cntI  = document.createElement('span');
            _cntI.style.cssText = 'color:var(--text-muted);font-size:12px;';
            _cntI.textContent = `${_gi.rows.length} processo(s) — ${_nSimI} com diligência · ${_nNaoI} sem diligência`;
            const _btnsWrapI = document.createElement('div');
            _btnsWrapI.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
            const _btnTsvI = document.createElement('button');
            _btnTsvI.className = 'cand-copiar';
            _btnTsvI.textContent = '📋 Exportar TSV';
            _btnTsvI.title = 'Copiar a tabela Distribuição × Objeto e Pé (TSV)';
            _btnTsvI.style.cssText = 'font-size:11px;padding:3px 8px;';
            _btnTsvI.addEventListener('click', () => _copiaTSVI(_tsvDistI(), _btnTsvI, '📋 Exportar TSV'));
            const _btnTudoI = document.createElement('button');
            _btnTudoI.className = 'cand-copiar';
            _btnTudoI.textContent = '📦 Exportar tudo';
            _btnTudoI.title = 'Copiar Distribuição + Não qualificados (homonímia) num só TSV';
            _btnTudoI.style.cssText = 'font-size:11px;padding:3px 8px;';
            _btnTudoI.addEventListener('click', () => {
                const _h = _tsvHomonI();
                const _txt = 'DISTRIBUIÇÃO × OBJETO E PÉ\n' + _tsvDistI()
                    + (_h ? '\n\nNÃO QUALIFICADOS — verificar homonímia\n' + _h : '');
                _copiaTSVI(_txt, _btnTudoI, '📦 Exportar tudo');
            });
            _btnsWrapI.appendChild(_btnTsvI); _btnsWrapI.appendChild(_btnTudoI);
            _hdrI.appendChild(_cntI); _hdrI.appendChild(_btnsWrapI);
            body.appendChild(_hdrI);

            // Tabela
            const _twI = document.createElement('div');
            _twI.style.cssText = 'overflow-x:auto;border:1px solid var(--border);border-radius:6px;';
            const _tblI = document.createElement('table');
            _tblI.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;font-family:"IBM Plex Mono",monospace;';
            const _theadI = document.createElement('thead');
            _theadI.innerHTML = `<tr style="background:var(--surface2);border-bottom:2px solid var(--border);">
                <th style="padding:5px 8px;text-align:center;color:var(--text-muted);white-space:nowrap;">#</th>
                <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Nº CNJ</th>
                <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Classe</th>
                <th style="padding:5px 8px;text-align:center;color:var(--text-muted);white-space:nowrap;">Obj. e Pé</th>
                <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Situação</th>
                <th style="padding:5px 8px;text-align:center;color:var(--text-muted);white-space:nowrap;">Diligência</th>
            </tr>`;
            _tblI.appendChild(_theadI);

            const _tbodyI = document.createElement('tbody');
            _gi.rows.forEach(rr => {
                const _ovrR = (_ovrsI)[rr.numero];
                const _necR = _ovrR || rr.necessidade;
                const _isApR = /apensad/i.test(rr.situacao);
                const _sitR  = _isApR && rr.idOpPrincipal !== '-'
                    ? `${rr.situacao} → ${rr.idOpPrincipal} (${rr.situacaoPrinc})`
                    : (rr.situacao || '—');

                const trR = document.createElement('tr');
                trR.style.cssText = `background:${_bgDilH(_necR)};border-bottom:1px solid var(--border);`;
                trR.innerHTML = `
                    <td style="padding:5px 8px;text-align:center;color:var(--text-muted);">${rr.posicao}</td>
                    <td style="padding:5px 8px;white-space:nowrap;color:var(--text);">${rr.numero}</td>
                    <td style="padding:5px 8px;color:var(--text);">${rr.classeDistr}</td>
                    <td style="padding:5px 8px;text-align:center;white-space:nowrap;color:var(--text);">${rr.idObjetoPe}</td>
                    <td style="padding:5px 8px;color:var(--text);">${_sitR}</td>
                `;

                // Botão 👁 Ver certidão de objeto e pé
                const _tdVer = document.createElement('td');
                _tdVer.style.cssText = 'padding:3px 6px;white-space:nowrap;';
                if (rr.docIdObjetoPe) {
                    const _btnVer = document.createElement('button');
                    _btnVer.style.cssText = 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-size:11px;padding:2px 7px;cursor:pointer;margin-right:4px;';
                    _btnVer.textContent = '👁 Ver';
                    _btnVer.addEventListener('click', () => visualizarPDF(rr.docIdObjetoPe, 'Certidão de Objeto e Pé', _urlsCache[rr.docIdObjetoPe] || null));
                    _tdVer.appendChild(_btnVer);
                }

                // Seletor diligência
                const _semR = document.createElement('span');
                _semR.textContent = _semDilH(_necR) + ' ';
                const _selR = document.createElement('select');
                _selR.style.cssText = 'font-size:11px;font-family:"IBM Plex Mono",monospace;font-weight:600;border-radius:4px;border:1px solid var(--border);background:#111827;color:#f1f5f9;cursor:pointer;padding:2px;max-width:170px;';
                [...new Set([..._OPCOES_D, rr.necessidade])].forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt; o.textContent = opt;
                    o.style.cssText = 'background:#111827;color:#f1f5f9;';
                    if (opt === _necR) o.selected = true;
                    _selR.appendChild(o);
                });
                _selR.addEventListener('change', () => {
                    _S._diligenciaOverrides = _S._diligenciaOverrides || {};
                    _S._diligenciaOverrides[rr.numero] = _selR.value;
                    trR.style.background = _bgDilH(_selR.value);
                    _semR.textContent    = _semDilH(_selR.value) + ' ';
                    if (_S._auditoriaResultados) {
                        renderizarResumoArt27(_S._auditoriaResultados, _S._processoAssociado || '');
                        clearTimeout(_S._diligSaveTimer);
                        _S._diligSaveTimer = setTimeout(() => {
                            if (_S._auditoriaResultados) salvarNoSheets(_S._auditoriaResultados);
                        }, 2000);
                    }
                });
                _tdVer.appendChild(_semR);
                _tdVer.appendChild(_selR);
                trR.appendChild(_tdVer);
                _tbodyI.appendChild(trR);
            });
            _tblI.appendChild(_tbodyI);
            _twI.appendChild(_tblI);
            body.appendChild(_twI);

            // Não qualificados
            if (_gi.naoQualificados?.length > 0) {
                const _nqDivI = document.createElement('div');
                _nqDivI.style.cssText = 'margin-top:6px;border:1px solid var(--border);border-radius:6px;overflow:hidden;';
                const _nqTitI = document.createElement('div');
                _nqTitI.style.cssText = 'background:rgba(148,163,184,0.12);padding:5px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;';
                const _nqTitTxt = document.createElement('span');
                _nqTitTxt.style.cssText = 'font-weight:700;font-size:12px;color:var(--text-muted);font-family:"IBM Plex Mono",monospace;';
                _nqTitTxt.textContent = `⬜ NÃO QUALIFICADOS — verificar homonímia (${_gi.naoQualificados.length})`;
                const _btnNqTsv = document.createElement('button');
                _btnNqTsv.className = 'cand-copiar';
                _btnNqTsv.textContent = '📋 Exportar TSV';
                _btnNqTsv.title = 'Copiar a tabela de não qualificados (homonímia) em TSV';
                _btnNqTsv.style.cssText = 'font-size:11px;padding:2px 8px;flex-shrink:0;';
                _btnNqTsv.addEventListener('click', () => _copiaTSVI(_tsvHomonI(), _btnNqTsv, '📋 Exportar TSV'));
                _nqTitI.appendChild(_nqTitTxt); _nqTitI.appendChild(_btnNqTsv);
                _nqDivI.appendChild(_nqTitI);
                const _nqWrapI = document.createElement('div');
                _nqWrapI.style.cssText = 'overflow-x:auto;';
                const _nqTblI = document.createElement('table');
                _nqTblI.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;font-family:"IBM Plex Mono",monospace;';
                _nqTblI.innerHTML = `<thead><tr style="background:var(--surface2);border-bottom:2px solid var(--border);">
                    <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Nº CNJ</th>
                    <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Classe</th>
                    <th style="padding:5px 8px;text-align:center;color:var(--text-muted);white-space:nowrap;">Obj. e Pé</th>
                    <th style="padding:5px 8px;text-align:left;color:var(--text-muted);white-space:nowrap;">Situação</th>
                    <th style="padding:5px 8px;text-align:center;color:var(--text-muted);white-space:nowrap;">Diligência</th>
                </tr></thead>`;
                const _nqBodyI = document.createElement('tbody');
                _gi.naoQualificados.forEach(p => {
                    const _nqOvr  = (_ovrsI)[p.numero];
                    const _nqNec  = _nqOvr || p.necessidade || 'SIM (Situação não identificada)';
                    const trNq = document.createElement('tr');
                    trNq.style.cssText = `background:${_bgDilH(_nqNec)};border-bottom:1px solid var(--border);`;
                    trNq.innerHTML = `
                        <td style="padding:5px 8px;white-space:nowrap;color:var(--text);">${p.numero}</td>
                        <td style="padding:5px 8px;color:var(--text);">${p.classe || '—'}</td>
                        <td style="padding:5px 8px;text-align:center;white-space:nowrap;color:var(--text);">${p.idObjetoPe || 'Não localizada'}</td>
                        <td style="padding:5px 8px;color:var(--text);">${p.situacao || '—'}</td>
                    `;
                    const _nqTdDil = document.createElement('td');
                    _nqTdDil.style.cssText = 'padding:3px 6px;white-space:nowrap;text-align:center;';
                    if (p.docIdObjetoPe) {
                        const _nqBtnVer = document.createElement('button');
                        _nqBtnVer.style.cssText = 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-size:11px;padding:2px 7px;cursor:pointer;margin-right:4px;';
                        _nqBtnVer.textContent = '👁 Ver';
                        _nqBtnVer.addEventListener('click', () => visualizarPDF(p.docIdObjetoPe, 'Certidão de Objeto e Pé', _urlsCache[p.docIdObjetoPe] || null));
                        _nqTdDil.appendChild(_nqBtnVer);
                    }
                    const _nqSemI = document.createElement('span');
                    _nqSemI.textContent = _semDilH(_nqNec) + ' ';
                    const _nqSelI = document.createElement('select');
                    _nqSelI.style.cssText = 'font-size:11px;font-family:"IBM Plex Mono",monospace;font-weight:600;border-radius:4px;border:1px solid var(--border);background:#111827;color:#f1f5f9;cursor:pointer;padding:2px;max-width:170px;';
                    [...new Set([..._OPCOES_D, p.necessidade || 'SIM (Situação não identificada)'])].forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt; o.textContent = opt;
                        o.style.cssText = 'background:#111827;color:#f1f5f9;';
                        if (opt === _nqNec) o.selected = true;
                        _nqSelI.appendChild(o);
                    });
                    _nqSelI.addEventListener('change', () => {
                        _S._diligenciaOverrides = _S._diligenciaOverrides || {};
                        _S._diligenciaOverrides[p.numero] = _nqSelI.value;
                        trNq.style.background = _bgDilH(_nqSelI.value);
                        _nqSemI.textContent   = _semDilH(_nqSelI.value) + ' ';
                        if (_S._auditoriaResultados) {
                            renderizarResumoArt27(_S._auditoriaResultados, _S._processoAssociado || '');
                            clearTimeout(_S._diligSaveTimer);
                            _S._diligSaveTimer = setTimeout(() => {
                                if (_S._auditoriaResultados) salvarNoSheets(_S._auditoriaResultados);
                            }, 2000);
                        }
                    });
                    _nqTdDil.appendChild(_nqSemI);
                    _nqTdDil.appendChild(_nqSelI);
                    trNq.appendChild(_nqTdDil);
                    _nqBodyI.appendChild(trNq);
                });
                _nqTblI.appendChild(_nqBodyI);
                _nqWrapI.appendChild(_nqTblI);
                _nqDivI.appendChild(_nqWrapI);
                body.appendChild(_nqDivI);
            }
        }

        div.appendChild(header);
        if (metaRow) div.appendChild(metaRow);
        div.appendChild(body);

        // Auto-expande itens que precisam de atenção
        const _deveExpandir = status === 'nok'
            || status === 'pendente'
            || status === 'nao_apresentado'
            || resultado?._consta === 'CONSTA';
        if (_deveExpandir) div.classList.add('expandido');

        (_idx < _metade ? _colLeft : _colRight).appendChild(div);
    }

    notificarAbaCand(resultados);
}


// _seletorSemaforo — controle único de 4 estados (🟢 OK · 🟡 Conferir · 🔴 Pendência · ⚪ N/A)
// do Relatório CAND (Fase 1). cfg = { captions:{ok,cf,pd,na}, aplicaNA:bool,
//   estadoAtual():'ok'|'cf'|'pd'|'na'|null, aplicar(estadoKey) }. Grava os MESMOS valores
// internos de hoje (via cfg.aplicar); sincroniza o Resumo (300ms) e o Sheets (2s).
function _seletorSemaforo(cfg) {
    const _defs = [
        { k: 'ok', dot: '🟢', lbl: 'OK' },
        { k: 'cf', dot: '🟡', lbl: 'Conferir' },
        { k: 'pd', dot: '🔴', lbl: 'Pendência' },
        { k: 'na', dot: '⚪', lbl: 'N/A' },
    ];
    const ctl = document.createElement('div');
    ctl.className = 'cnd-segctl';
    let detrow = null, acaoEl = null;
    const _marcarBase = () => {
        const at = cfg.estadoAtual && cfg.estadoAtual();
        ctl.querySelectorAll('.cnd-segbtn').forEach(b => b.classList.toggle('sel', b.dataset.k === at));
        if (detrow && cfg.detalhe) {
            const vis = (cfg.detalhe.visivelEm || ['cf', 'pd']).includes(at);
            detrow.style.display = vis ? 'block' : 'none';
        }
    };
    const _marcarDet = () => {
        if (!detrow || !cfg.detalhe) return;
        const dv = cfg.detalhe.valorAtual && cfg.detalhe.valorAtual();
        detrow.querySelectorAll('.db').forEach(b => b.classList.toggle('on', b.dataset.v === dv));
    };
    const _atualizarAcao = () => {
        if (!acaoEl) return;
        const at = cfg.estadoAtual && cfg.estadoAtual();
        const txt = cfg.acao && cfg.acao[at];
        if ((at === 'cf' || at === 'pd') && txt) {
            acaoEl.className = 'cnd-acao ' + at;
            acaoEl.textContent = '→ ' + txt;
            acaoEl.style.display = '';
        } else {
            acaoEl.style.display = 'none';
        }
    };
    const _apos = () => {
        _marcarBase();
        _marcarDet();
        _atualizarAcao();
        clearTimeout(ctl._syncTimer);
        ctl._syncTimer = setTimeout(() => { if (_S._auditoriaResultados) renderizarResumoArt27(_S._auditoriaResultados, _checklistProcessoAssociado); }, 300);
        clearTimeout(ctl._sheetsTimer);
        ctl._sheetsTimer = setTimeout(() => { if (_S._auditoriaResultados) salvarNoSheets(_S._auditoriaResultados); }, 2000);
    };
    _defs.forEach(({ k, dot, lbl }) => {
        if (k === 'na' && !cfg.aplicaNA) return;
        const btn = document.createElement('div');
        btn.className = 'cnd-segbtn ' + k;
        btn.dataset.k = k;
        const cap = (cfg.captions && cfg.captions[k]) || '';
        btn.innerHTML = `<span class="t">${dot} ${lbl}</span><span class="cap">${_esc(cap)}</span>`;
        btn.addEventListener('click', () => { cfg.aplicar(k); _apos(); });
        ctl.appendChild(btn);
    });
    if (cfg.detalhe) {
        detrow = document.createElement('div');
        detrow.className = 'cnd-detrow';
        const dl = document.createElement('div');
        dl.className = 'dl';
        dl.textContent = cfg.detalhe.label || 'Detalhe:';
        detrow.appendChild(dl);
        const dbtns = document.createElement('div');
        dbtns.className = 'dbtns';
        (cfg.detalhe.opcoes || []).forEach(({ v, lbl }) => {
            const db = document.createElement('span');
            db.className = 'db';
            db.dataset.v = v;
            db.textContent = lbl;
            db.addEventListener('click', () => { cfg.detalhe.aplicar(v); _apos(); });
            dbtns.appendChild(db);
        });
        detrow.appendChild(dbtns);
    }
    if (cfg.acao) {
        acaoEl = document.createElement('div');
        acaoEl.className = 'cnd-acao';
    }
    _marcarBase();
    _marcarDet();
    _atualizarAcao();
    if (detrow || acaoEl) {
        const wrap = document.createElement('div');
        wrap.appendChild(ctl);
        if (detrow) wrap.appendChild(detrow);
        if (acaoEl) wrap.appendChild(acaoEl);
        return wrap;
    }
    return ctl;
}
