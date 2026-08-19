// render.js — Renderização de tabelas, UI genérica e Resumo Art. 27
// Depende de: config.js, analysis.js, auditoria.js

// ═════════════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO HUMANA (docs. principais)
// ═════════════════════════════════════════════════════════════════════════════

function _requerVerificacaoHumana(nomeDoc) {
    const n = _norm(nomeDoc).replace(/[^a-z0-9\s]/g, ' ');
    return /identidade|rg|cnh|passaporte|cpf/.test(n) ||
           /comprovante.*(escolaridade|diploma|historico)/.test(n) ||
           /escolaridade/.test(n);
}

function exibirFormularioHumano(humanos, todosResultados) {
    const msgs = document.getElementById('painel-auditoria');
    if (!msgs) return;

    const respostas = {};
    humanos.forEach(r => { respostas[r.id] = { status: null, complemento: '' }; });

    const container = document.createElement('div');
    container.id = 'formulario-humano';
    container.style.cssText = 'background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:14px;margin:8px 0;font-size:12px;';

    const titulo = document.createElement('div');
    titulo.style.cssText = 'font-weight:600;color:var(--accent);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.05em;margin-bottom:4px;';
    titulo.textContent = '👤 VERIFICAÇÃO HUMANA — DOCS. PRINCIPAIS';

    const subtitulo = document.createElement('div');
    subtitulo.style.cssText = 'color:var(--text-muted);font-size:11px;margin-bottom:12px;line-height:1.5;';
    subtitulo.textContent = 'Abra cada documento com "👁 ver PDF" e preencha a correspondência abaixo.';

    container.appendChild(titulo);
    container.appendChild(subtitulo);

    humanos.forEach(r => {
        const n      = _norm(r.nome);
        const eIdent = /identidade|rg|cnh|passaporte|cpf/.test(n);
        const item   = document.createElement('div');
        item.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;';

        // Cabeçalho do item com nome e botão ver PDF
        const cabecalho = document.createElement('div');
        cabecalho.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

        const nomeEl = document.createElement('div');
        nomeEl.style.cssText = 'font-size:11px;color:var(--text);font-weight:500;flex:1;';
        nomeEl.textContent = r.nome.substring(0, 80);

        cabecalho.appendChild(nomeEl);
        if (!r._ausente) {
            const btnVerPDF = document.createElement('button');
            btnVerPDF.style.cssText = 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-size:10px;padding:2px 8px;cursor:pointer;white-space:nowrap;flex-shrink:0;';
            btnVerPDF.textContent = '👁 ver PDF';
            btnVerPDF.addEventListener('click', () => visualizarPDF(r.id, r.nome, r._url || _urlsCache[r.id] || null));
            cabecalho.appendChild(btnVerPDF);
        }
        item.appendChild(cabecalho);

        const opcoes = _opcoesCorrecao();

        const radioGroup = document.createElement('div');
        radioGroup.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
        opcoes.forEach(op => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--text-muted);';
            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = `hum-${r.id}`;
            radio.value = op.valor;
            radio.style.cursor = 'pointer';
            radio.addEventListener('change', () => {
                respostas[r.id].status      = op.valor;
                respostas[r.id].complemento = op.label.replace(/^[✅❌]\s/, '');
                label.style.color           = 'var(--text)';
                item.style.borderColor      = op.valor === 'corresponde' ? 'var(--success)' : 'var(--error)';
            });
            label.appendChild(radio);
            label.appendChild(document.createTextNode(op.label));
            radioGroup.appendChild(label);
        });
        item.appendChild(radioGroup);
        container.appendChild(item);
    });

    const alerta = document.createElement('div');
    alerta.id = 'formulario-alerta';
    alerta.style.cssText = 'display:none;color:var(--error);font-size:11px;margin-bottom:8px;padding:6px 10px;background:rgba(239,68,68,0.1);border-radius:6px;border:1px solid rgba(239,68,68,0.3);';
    alerta.textContent = '⚠️ Preencha todos os itens antes de confirmar.';
    container.appendChild(alerta);

    const btnConfirmar = document.createElement('button');
    btnConfirmar.className   = 'btn-primary';
    btnConfirmar.style.cssText = 'font-size:12px;padding:8px 18px;margin-top:4px;';
    btnConfirmar.textContent = '✔ Confirmar e gerar relatório';
    btnConfirmar.addEventListener('click', () => {
        const naoPreenchidos = humanos.filter(r => !respostas[r.id].status);
        if (naoPreenchidos.length > 0) { alerta.style.display = 'block'; return; }
        alerta.style.display = 'none';
        humanos.forEach(r => {
            const resp      = respostas[r.id];
            if (!resp?.status) return;
            const resultado = todosResultados.find(res => res.id === r.id);
            if (resultado) {
                resultado.status     = resp.status;
                resultado._obsHumana = resp.complemento;
                atualizarItemAuditoria(resultado);
            } else if (r._ausente) {
                // Documento ausente da árvore: cria resultado sintético para o relatório
                todosResultados.push({
                    id:          null,
                    nome:        r.nome,
                    status:      resp.status,
                    _obsHumana:  resp.complemento,
                    _ausente:    true,
                });
            }
        });
        container.remove();
        gerarRelatorioAuditoria(todosResultados);
        // Gera checklist CAND e Resumo nas abas correspondentes
        solicitarProcessoAssociado().then(numeroAssociado => {
            renderizarChecklistCAND(todosResultados, numeroAssociado);
            renderizarResumoArt27(todosResultados, numeroAssociado);
        });
        document.getElementById('painel-auditoria').scrollTop = 999999;
    });
    container.appendChild(btnConfirmar);
    msgs.appendChild(container);
    msgs.scrollTop = msgs.scrollHeight;
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMULÁRIO DE VERIFICAÇÃO/CORREÇÃO (exibido no painel lateral do PDF)
// ═════════════════════════════════════════════════════════════════════════════

function _precisaExpansao(r) {
    return r._verificacao === 'humano'
        || r._verificacao === 'nomenclatura_errada'
        || r._verificacao === 'corresponde_nao_adequada'
        || r._verificacao === 'pessoa_errada'
        || /^nao_corresponde/.test(r.status);
}

function _criarFormularioExpansao(r, fechar) {
    const isModoVerificar = r.status === 'presente';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-width:640px;';

    // Cabeçalho + botão PDF
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    const tituloSpan = document.createElement('span');
    tituloSpan.style.cssText = 'font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.05em;';
    tituloSpan.textContent = isModoVerificar ? '👤 Verificação Humana' : '✏️ Corrigir Resultado';
    topRow.appendChild(tituloSpan);
    wrap.appendChild(topRow);

    // Opções de situação — lista unificada para todos os tipos de documento
    const opcoes = _opcoesCorrecao();

    let statusSelecionado = isModoVerificar ? null : r.status;

    const radioDiv = document.createElement('div');
    radioDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 20px;';
    opcoes.forEach(op => {
        const lbl = document.createElement('label');
        lbl.style.cssText = `display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;white-space:nowrap;color:${op.valor === r.status ? 'var(--text)' : 'var(--text-muted)'};`;
        const radio = document.createElement('input');
        radio.type    = 'radio';
        radio.name    = `exp-${r.id}`;
        radio.value   = op.valor;
        radio.checked = op.valor === r.status;
        radio.style.cursor = 'pointer';
        radio.addEventListener('change', () => {
            statusSelecionado = op.valor;
            radioDiv.querySelectorAll('label').forEach(l => l.style.color = 'var(--text-muted)');
            lbl.style.color = 'var(--text)';
        });
        lbl.appendChild(radio);
        lbl.appendChild(document.createTextNode(op.label));
        radioDiv.appendChild(lbl);
    });
    wrap.appendChild(radioDiv);

    // Campo de observação (apenas no modo corrigir)
    let obsArea = null;
    if (!isModoVerificar) {
        const obsLabel = document.createElement('div');
        obsLabel.style.cssText = 'font-size:11px;color:var(--text-muted);';
        obsLabel.textContent = 'Observação (opcional — aparecerá no relatório):';
        wrap.appendChild(obsLabel);
        obsArea = document.createElement('textarea');
        obsArea.style.cssText = 'width:100%;max-width:500px;background:var(--surface3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;min-height:48px;max-height:96px;';
        obsArea.placeholder = 'Ex.: documento rasurado, foto parcial, nome divergente…';
        obsArea.value = r._obsHumana || '';
        obsArea.addEventListener('click', (e) => e.stopPropagation());
        wrap.appendChild(obsArea);
    }

    // Alerta de validação
    const alerta = document.createElement('div');
    alerta.style.cssText = 'display:none;color:var(--error);font-size:11px;padding:4px 8px;background:rgba(239,68,68,0.1);border-radius:5px;border:1px solid rgba(239,68,68,0.3);';
    alerta.textContent = '⚠️ Selecione uma opção antes de confirmar.';
    wrap.appendChild(alerta);

    // Botões
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;';
    const btnCancelar = document.createElement('button');
    btnCancelar.textContent = 'Cancelar';
    btnCancelar.style.cssText = 'background:var(--surface3);border:1px solid var(--border);color:var(--text-muted);border-radius:6px;font-size:12px;padding:5px 14px;cursor:pointer;';
    btnCancelar.addEventListener('click', (e) => { e.stopPropagation(); fechar(); });
    btns.appendChild(btnCancelar);

    const btnSalvar = document.createElement('button');
    btnSalvar.className = 'btn-primary';
    btnSalvar.style.cssText = 'font-size:12px;padding:5px 16px;';
    btnSalvar.textContent = '💾 Salvar';
    btnSalvar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!statusSelecionado) { alerta.style.display = 'block'; return; }
        const op = opcoes.find(o => o.valor === statusSelecionado);
        const obs = (obsArea?.value.trim()) || (op?.label.replace(/^[✅❌📝👤⛔⚠️]\s/, '') || '');
        fechar();
        _aplicarResultadoVerificacao(r, opcoes, statusSelecionado, obs);
    });
    btns.appendChild(btnSalvar);
    wrap.appendChild(btns);

    return wrap;
}

function abrirVerificacaoHumanaIndividual(r) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-edicao-overlay';

    const box = document.createElement('div');
    box.className = 'modal-edicao-box';

    const titulo = document.createElement('div');
    titulo.className = 'modal-edicao-titulo';
    titulo.textContent = '👤 Verificação Humana';
    box.appendChild(titulo);

    const nome = document.createElement('div');
    nome.className = 'modal-edicao-nome';
    nome.textContent = r.nome.substring(0, 100);
    box.appendChild(nome);

    // Botão ver PDF
    if (!r._ausente) {
        const btnVerPDF = document.createElement('button');
        btnVerPDF.style.cssText = 'display:inline-block;margin-bottom:12px;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-size:11px;padding:3px 10px;cursor:pointer;';
        btnVerPDF.textContent = '👁 Ver PDF';
        btnVerPDF.addEventListener('click', () => visualizarPDF(r.id, r.nome, r._url || _urlsCache[r.id] || null));
        box.appendChild(btnVerPDF);
    }

    const opcoes = _opcoesCorrecao();

    let statusSelecionado = null;

    const radioDiv = document.createElement('div');
    radioDiv.className = 'modal-edicao-radios';
    opcoes.forEach(op => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-muted);padding:3px 0;';
        const radio = document.createElement('input');
        radio.type  = 'radio';
        radio.name  = `modal-hum-${r.id}`;
        radio.value = op.valor;
        radio.style.cursor = 'pointer';
        radio.addEventListener('change', () => {
            statusSelecionado = op.valor;
            lbl.style.color = 'var(--text)';
        });
        lbl.appendChild(radio);
        lbl.appendChild(document.createTextNode(op.label));
        radioDiv.appendChild(lbl);
    });
    box.appendChild(radioDiv);

    const alerta = document.createElement('div');
    alerta.style.cssText = 'display:none;color:var(--error);font-size:11px;margin:6px 0;padding:5px 8px;background:rgba(239,68,68,0.1);border-radius:5px;border:1px solid rgba(239,68,68,0.3);';
    alerta.textContent = '⚠️ Selecione uma opção antes de confirmar.';
    box.appendChild(alerta);

    const btns = document.createElement('div');
    btns.className = 'modal-edicao-btns';

    const btnCancelar = document.createElement('button');
    btnCancelar.className = 'btn-cancelar';
    btnCancelar.textContent = 'Cancelar';
    btnCancelar.addEventListener('click', () => overlay.remove());
    btns.appendChild(btnCancelar);

    const btnSalvar = document.createElement('button');
    btnSalvar.className = 'btn-primary';
    btnSalvar.style.cssText = 'font-size:12px;padding:7px 20px;';
    btnSalvar.textContent = '💾 Salvar';
    btnSalvar.addEventListener('click', () => {
        if (!statusSelecionado) { alerta.style.display = 'block'; return; }
        alerta.style.display = 'none';
        const op = opcoes.find(o => o.valor === statusSelecionado);
        const obs = op ? op.label.replace(/^[✅❌📝👤⛔⚠️]\s/, '') : '';
        _aplicarResultadoVerificacao(r, opcoes, statusSelecionado, obs);
        overlay.remove();
    });
    btns.appendChild(btnSalvar);
    box.appendChild(btns);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

/** Abre modal de correção para documentos com status 'nao_corresponde*'. */
function abrirCorrecaoResultado(r) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-edicao-overlay';

    const box = document.createElement('div');
    box.className = 'modal-edicao-box';

    const titulo = document.createElement('div');
    titulo.className = 'modal-edicao-titulo';
    titulo.textContent = '✏️ Corrigir Resultado';
    box.appendChild(titulo);

    const nome = document.createElement('div');
    nome.className = 'modal-edicao-nome';
    nome.textContent = r.nome.substring(0, 100);
    box.appendChild(nome);

    // Botão ver PDF
    const btnVerPDF = document.createElement('button');
    btnVerPDF.style.cssText = 'display:inline-block;margin-bottom:12px;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-size:11px;padding:3px 10px;cursor:pointer;';
    btnVerPDF.textContent = '👁 Ver PDF';
    btnVerPDF.addEventListener('click', () => visualizarPDF(r.id, r.nome, r._url || _urlsCache[r.id] || null));
    box.appendChild(btnVerPDF);

    // Selector de nova situação
    const selLabel = document.createElement('div');
    selLabel.className = 'modal-edicao-obs-label';
    selLabel.textContent = 'Nova situação:';
    box.appendChild(selLabel);

    const opcoes = _opcoesCorrecao();

    let statusSelecionado = r.status;

    const radioDiv = document.createElement('div');
    radioDiv.className = 'modal-edicao-radios';
    opcoes.forEach(op => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:3px 0;';
        lbl.style.color = op.valor === r.status ? 'var(--text)' : 'var(--text-muted)';
        const radio = document.createElement('input');
        radio.type    = 'radio';
        radio.name    = `modal-cor-${r.id}`;
        radio.value   = op.valor;
        radio.checked = op.valor === r.status;
        radio.style.cursor = 'pointer';
        radio.addEventListener('change', () => {
            statusSelecionado = op.valor;
            radioDiv.querySelectorAll('label').forEach(l => l.style.color = 'var(--text-muted)');
            lbl.style.color = 'var(--text)';
        });
        lbl.appendChild(radio);
        lbl.appendChild(document.createTextNode(op.label));
        radioDiv.appendChild(lbl);
    });
    box.appendChild(radioDiv);

    // Campo de observação
    const obsLabel = document.createElement('div');
    obsLabel.className = 'modal-edicao-obs-label';
    obsLabel.style.marginTop = '10px';
    obsLabel.textContent = 'Observação (opcional — aparecerá no relatório):';
    box.appendChild(obsLabel);

    const obsArea = document.createElement('textarea');
    obsArea.className = 'modal-edicao-obs';
    obsArea.placeholder = 'Ex.: documento rasurado, foto parcial, nome divergente…';
    obsArea.value = r._obsHumana || '';
    box.appendChild(obsArea);

    const btns = document.createElement('div');
    btns.className = 'modal-edicao-btns';

    const btnCancelar2 = document.createElement('button');
    btnCancelar2.className = 'btn-cancelar';
    btnCancelar2.textContent = 'Cancelar';
    btnCancelar2.addEventListener('click', () => overlay.remove());
    btns.appendChild(btnCancelar2);

    const btnSalvar = document.createElement('button');
    btnSalvar.className = 'btn-primary';
    btnSalvar.style.cssText = 'font-size:12px;padding:7px 20px;';
    btnSalvar.textContent = '💾 Salvar';
    btnSalvar.addEventListener('click', () => {
        const op = opcoes.find(o => o.valor === statusSelecionado);
        const obs = obsArea.value.trim() || (op?.label.replace(/^[✅❌📝👤⛔⚠️]\s/, '') || '');
        _aplicarResultadoVerificacao(r, opcoes, statusSelecionado, obs);
        overlay.remove();
    });
    btns.appendChild(btnSalvar);
    box.appendChild(btns);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ═════════════════════════════════════════════════════════════════════════════
// RELATÓRIO TSV (Google Sheets)
// ═════════════════════════════════════════════════════════════════════════════

function gerarRelatorioAuditoria(resultados) {
    if (!resultados || !resultados.length) return;

    const statusLabel = {
        'presente'             : 'Verificação humana',
        'corresponde'          : 'Corresponde',
        'nao_corresponde'      : 'Não corresponde',
        'nao_corresponde_nome' : 'Não corresponde (nome/CPF)',
        'inconclusivo'         : 'Inconclusivo',
        'pdf_sem_texto'        : 'PDF sem texto (verificar manualmente)',
        'sem_conteudo'         : 'Sem conteúdo',
        'erro'                 : 'Erro',
        'nao_apresentado'                     : 'Não apresentado',
        'nao_corresponde_incompleto'          : 'Não corresponde — incompleto',
        'nao_corresponde_ilegivel'            : 'Não corresponde — ilegível',
        'nao_corresponde_incompleto_ilegivel' : 'Não corresponde — incompleto e ilegível',
        'nomenclatura_errada'           : 'Nomenclatura errada — completo',
        'nomenclatura_errada_incompleto': 'Nomenclatura errada — incompleto',
        'nomenclatura_errada_ilegivel'  : 'Nomenclatura errada — ilegível',
        'corresponde_nao_adequada'                    : 'Corresponde — Não adequada',
        'corresponde_nao_adequada_incompleto'         : 'Corresponde — Não adequada — incompleto',
        'corresponde_nao_adequada_ilegivel'           : 'Corresponde — Não adequada — ilegível',
        'corresponde_nao_adequada_incompleto_ilegivel': 'Corresponde — Não adequada — incompleto e ilegível',
    };

    const esc = s => (s || '').replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');

    // Linha de metadados do processo (cabeçalho informativo)
    const metaCols = [];
    if (infoProcesso?.numero)        metaCols.push(`Processo: ${infoProcesso.numero}`);
    if (infoProcesso?.requerente)    metaCols.push(`Candidato: ${infoProcesso.requerente}`);
    if (infoProcesso?.cpf)           metaCols.push(`CPF: ${infoProcesso.cpf}`);
    const numAssoc = infoProcesso?.processoAssociado || _S._processoAssociado;
    if (numAssoc)                    metaCols.push(`Processo associado: ${numAssoc}`);

    const linhas = [];
    if (metaCols.length) { linhas.push(metaCols.join('\t')); linhas.push(''); }
    linhas.push(['ID', 'Documento', 'Tipo identificado no PDF', 'Consta', 'Total processos', 'Números de processo', 'Status', 'Observação', 'Texto extraído (OCR)'].join('\t'));
    for (const r of resultados) {
        let status = statusLabel[r.status] || r.status;
        if (r._verificacaoHumana) status += ' (verificação humana)';
        const tipo      = esc(r._tipoIdentificado || '');
        const consta    = esc(r._consta || '');
        const total     = r._constaTotal ? String(r._constaTotal) : '';
        const numeros   = esc(r._constaResumo || '');
        const obs       = esc([r._avisoNome, r._avisoConteudo, r._notaQualif, r._obsHumana].filter(Boolean).join('; ') || '');
        // Texto extraído — truncado em 3000 chars para não explodir a planilha
        const textoOCR  = esc((r._textoExtraido || '').substring(0, 3000));
        linhas.push([esc(r.id), esc(r.nome), tipo, consta, total, numeros, esc(status), obs, textoOCR].join('\t'));
    }
    const tsv = linhas.join('\n');

    const msgs = document.getElementById('painel-auditoria');
    if (!msgs) return;

    const container = document.createElement('div');
    container.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin:8px 0;font-size:12px;';

    const titulo = document.createElement('div');
    titulo.style.cssText = 'font-weight:600;color:var(--accent);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.05em;margin-bottom:10px;';
    titulo.textContent = '📊 RELATÓRIO — PRONTO PARA COLAR NO GOOGLE SHEETS';

    const instrucao = document.createElement('div');
    instrucao.style.cssText = 'color:var(--text-muted);font-size:11px;margin-bottom:8px;line-height:1.5;';
    instrucao.innerHTML = 'Clique em <strong style="color:var(--text)">Copiar relatório</strong>, abra o Google Sheets e cole com <kbd style="background:var(--surface2);padding:1px 5px;border-radius:3px;border:1px solid var(--border)">Ctrl+V</kbd>.';

    const pre = document.createElement('pre');
    pre.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px;overflow-x:auto;font-family:"IBM Plex Mono",monospace;font-size:10px;line-height:1.6;color:var(--text);max-height:180px;overflow-y:auto;white-space:pre;margin-bottom:10px;';
    pre.textContent = tsv;

    const btnCopiar = document.createElement('button');
    btnCopiar.className   = 'btn-primary';
    btnCopiar.style.cssText = 'font-size:12px;padding:7px 16px;';
    btnCopiar.textContent = '📋 Copiar relatório';
    btnCopiar.onclick = () => {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
        if (ok) {
            btnCopiar.textContent = '✅ Copiado!';
            setTimeout(() => { btnCopiar.textContent = '📋 Copiar relatório'; }, 2500);
        } else {
            btnCopiar.textContent = '⚠️ Selecione o texto acima e Ctrl+C';
            setTimeout(() => { btnCopiar.textContent = '📋 Copiar relatório'; }, 4000);
        }
    };

    container.appendChild(titulo);
    container.appendChild(instrucao);
    container.appendChild(pre);
    container.appendChild(btnCopiar);
    msgs.appendChild(container);
    msgs.scrollTop = msgs.scrollHeight;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTRAÇÃO DE DADOS — PETIÇÃO INICIAL E RRC
// ═════════════════════════════════════════════════════════════════════════════

function _extrairCargo(texto) {
    const padroes = [
        /cargo\s*[:\-–]\s*([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\n,;:]{2,40})/i,
        /candidat[ao]\s+ao\s+cargo\s+de\s+([^\n,;:.]{3,40})/i,
        /para\s+o\s+cargo\s+de\s+([^\n,;:.]{3,40})/i,
        /registro\s+de\s+candidatura\s+(?:ao\s+cargo\s+de\s+)?([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\n,;:]{2,30})/i,
    ];
    for (const re of padroes) {
        const m = texto.match(re);
        if (m) {
            let val = m[1].trim().replace(/\s+/g, ' ');
            // Remove campos que possam ter sido capturados junto (OCR numa linha só)
            val = val.replace(/\s+n[úu]mero\b.*/i, '').trim();
            val = val.replace(/\s+nome\s+(?:para\s+)?urna.*/i, '').trim();
            val = val.replace(/\s+n[°º\.]\s*de\s+urna.*/i, '').trim();
            val = val.replace(/\s+documento\s+de\s+identifica[çc].*/i, '').trim();
            val = val.replace(/\s+doc(?:umento)?\s*[:\-–].*/i, '').trim();
            // Guarda anti-lixo: se capturou um rótulo do próprio formulário (ex.: 2 colunas
            // sem remontagem), não é o cargo — tenta o próximo padrão em vez de aceitar.
            if (/^(n[úu]mero|partido|documento|t[íi]tulo|nome|ocupa[çc][ãa]o|identifica)\b/i.test(val)) continue;
            return val.toUpperCase().substring(0, 40);
        }
    }
    return null;
}

function _extrairNomeUrna(texto) {
    const padroes = [
        /nome\s+(?:para\s+)?(?:a\s+)?urna\s*[:\-–]\s*([^\n:]{3,60})/i,
        /nome\s+de\s+urna\s*[:\-–]\s*([^\n:]{3,60})/i,
    ];
    for (const re of padroes) {
        const m = texto.match(re);
        if (m) {
            let val = m[1].trim().replace(/\s+/g, ' ');
            // Para antes de campos que seguem imediatamente no PDF
            val = val.replace(/\s+nome\s+fon[eé]tico.*/i, '').trim();
            val = val.replace(/\s+nome\s+social.*/i, '').trim();
            val = val.replace(/\s+filia[çc][ãa]o.*/i, '').trim();
            val = val.replace(/\s+data\s+de\s+nasc.*/i, '').trim();
            val = val.replace(/\s+n[úu]mero\b.*/i, '').trim();
            val = val.replace(/\s+cargo\b.*/i, '').trim();
            val = val.replace(/\s+partido\b.*/i, '').trim();
            return val.substring(0, 50);
        }
    }
    return null;
}

function _extrairNumeroUrna(texto) {
    if (!texto) return null;
    // 1) Rótulos explícitos de urna/candidato (mais seguros)
    const padroes = [
        /n[úu]mero\s+de\s+urna[:\s]+(\d{2,6})/i,
        /n[°º.]\s*de\s+urna[:\s]+(\d{2,6})/i,
        /urna[:\s]*n[°º.]?\s*(\d{2,6})/i,
        /n[úu]mero\s+(?:do\s+candidato\s*)[:\s]+(\d{4,6})\b/i,
        /\bnumero\s+urna\s*[:\-–]\s*(\d{2,6})/i,
    ];
    for (const re of padroes) {
        const m = texto.match(re);
        if (m) return m[1].trim();
    }
    // 2) Fallback p/ RRC: "Número:" isolado, ANCORADO à seção do candidato/urna
    //    (janela ao redor de "nome para urna"/"urna"/"candidato") para não
    //    confundir com nº de documento, processo ou protocolo.
    const ancoras = [/nome\s+(?:para|de|na)\s+urna/i, /\burna\b/i, /candidat[oa]/i];
    for (const a of ancoras) {
        const am = a.exec(texto);
        if (!am) continue;
        const ini = Math.max(0, am.index - 140);
        const janela = texto.slice(ini, am.index + 220);
        const m = janela.match(/n[úu]mero\s*[:\-–]\s*(\d{2,6})\b/i);
        if (m) return m[1].trim();
    }
    return null;
}

function _extrairOcupacao(texto) {
    const padroes = [
        /ocupa[çc][ãa]o\s+principal\s*[:\-–]\s*([^\n]{3,80})/i,
        /profiss[ãa]o[:\-–]\s*([^\n]{3,80})/i,
        /ocupa[çc][ãa]o\s*[:\-–]\s*([^\n]{3,80})/i,
    ];
    for (const re of padroes) {
        const m = texto.match(re);
        if (m) {
            let val = m[1].trim().replace(/\s+/g, ' ');
            // Corta antes de campos adjacentes que possam ter sido incluídos na captura
            val = val.replace(/\s+ocupa[çc][ãa]o\s+complementar.*/i, '').trim();
            val = val.replace(/\s+concorrendo\s+a\s+reelei.*/i, '').trim();
            val = val.replace(/\s+cargo\s+eletivo.*/i, '').trim();
            // Guarda anti-lixo: não aceitar um rótulo capturado como ocupação (ex.: "Qual
            // cargo eletivo que ocupa:" grudado após "Ocupação:" no layout 2 colunas).
            if (/^(qual|cargo|n[úu]mero|partido|documento|t[íi]tulo|nome)\b/i.test(val)) continue;
            return val.substring(0, 80);
        }
    }
    return null;
}

function _extrairOcupacaoComplementar(texto) {
    const m = texto.match(/ocupa[çc][ãa]o\s+complementar\s*[:\-–]\s*([^\n]{3,80})/i);
    if (!m) return null;
    let val = m[1].trim().replace(/\s+/g, ' ');
    val = val.replace(/\s+concorrendo\s+a\s+reelei.*/i, '').trim();
    // Corta o rótulo seguinte que às vezes cola junto ("... Qual cargo eletivo que ocupa: ...")
    val = val.replace(/\s+(?:qual\s+)?cargo\s+eletivo.*/i, '').trim();
    return val.substring(0, 80);
}

function _extrairReeleicao(texto) {
    // Cobre: "Concorrendo a reeleição para o mesmo cargo: Não"
    //        "Concorrendo a reeleição para o mesmo cargo\nNão"
    //        "Concorrendo a reeleição: Sim"  (sem "para o mesmo cargo")
    const m = texto.match(
        /concorrendo\s+a\s+reelei[çc][ãa]o[^\n]{0,60}?\s*[:\-–]?\s*\n?\s*(sim|n[ãa]o)\b/i
    );
    if (!m) return null;
    return /^sim/i.test(m[1]) ? 'Sim' : 'Não';
}

function _extrairCargoEletivo(texto) {
    // Usa [^\n:] para parar no próximo campo (que tem ":")
    const m = texto.match(/cargo\s+eletivo\s+(?:que\s+ocupa)?\s*[:\-–]\s*([^\n:]{3,40})/i);
    if (!m) return null;
    let val = m[1].trim().replace(/\s+/g, ' ');
    // Corta antes de texto explicativo que segue no PDF (ex: "O(A) candidato(a)...")
    val = val.replace(/\s+o\s*\([aA]\)\s+candidat.*/i, '').trim();
    val = val.replace(/\s+o\s+candidato.*/i, '').trim();
    val = val.replace(/\s+a\s+candidata.*/i, '').trim();
    // Forma "A(o) candidata(o) é de nacionalidade..." (início da declaração colado no RRC)
    val = val.replace(/\s+[ao]\s*\([oaOA]\)\s*candidat.*/i, '').trim();
    val = val.replace(/\s+[eé]\s+de\s+naci.*/i, '').trim();
    val = val.replace(/\s+concorrendo.*/i, '').trim();
    val = val.replace(/\s+ocupa[çc][ãa]o.*/i, '').trim();
    val = val.replace(/\s+partido\b.*/i, '').trim();
    val = val.replace(/\s+n[úu]mero\b.*/i, '').trim();
    // Remove texto entre parênteses que não faz parte do cargo
    val = val.replace(/\s*\([^)]{5,}\)/g, '').trim();
    return val.substring(0, 40);
}

function _extrairCargoComissao(texto) {
    if (!texto) return null;
    // Normaliza quebras de linha e espaços extras (OCR pode quebrar a frase em múltiplas linhas)
    const textoNorm = texto.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    // Padrão completo: "não ocupou nos últimos 6 meses cargo em comissão ou função comissionada"
    const m = textoNorm.match(/(n[ãa]o\s+)?ocupou\s+nos\s+[úu]ltimos\s+6\s+meses\s+cargo\s+em\s+comiss[ãa]o\s+ou\s+fun[çc][ãa]o\s+comissionada/i);
    if (m) return m[1] ? 'NÃO' : 'SIM';
    // Padrão alternativo (OCR pode ter omitido parte da frase)
    const m2 = textoNorm.match(/(n[ãa]o\s+)?ocupou[^.]{0,100}cargo\s+em\s+comiss[ãa]o/i);
    if (m2) return m2[1] ? 'NÃO' : 'SIM';
    return null;
}

function _extrairDocIdentificacao(texto) {
    if (!texto) return null;

    // Padrão DRAP eletrônico TRE: campos Tipo + Número em linhas separadas
    // Ex: "Tipo de Documento: RG\nNúmero: 12.345.678\nÓrgão: SSP\nUF: SP"
    const mTipoNum = texto.match(
        /tipo\s*(?:de\s*(?:documento|identidade|identifica[çc][ãa]o))?\s*[:\-–]\s*(RG|CNH|PASSAPORTE|RNE|RNM)[^\n]{0,40}\n[^\n]*?n[úu]mero\s*[:\-–]\s*([0-9][0-9.\s\/\-]{3,20}[0-9])/i
    );
    if (mTipoNum) {
        const tipo = mTipoNum[1].trim().toUpperCase();
        const num  = mTipoNum[2].trim().replace(/\s+/g, '');
        // Tenta capturar órgão emissor e UF
        const mOrg = texto.match(/[oó]rg[ãa]o\s*(?:emissor|expedidor)?\s*[:\-–]\s*([A-Z]{2,10})/i);
        const mUF  = texto.match(/\bUF\s*(?:de\s*expedi[çc][ãa]o)?\s*[:\-–]\s*([A-Z]{2})\b/i);
        let val = `${tipo} ${num}`;
        if (mOrg) val += ` ${mOrg[1].trim()}`;
        if (mUF)  val += `/${mUF[1].trim()}`;
        return val.substring(0, 50);
    }

    const padroes = [
        /documento\s+de\s+identifica[çc][ãa]o\s*[:\-–]\s*([^\n]{3,80})/i,
        /documento\s+de\s+identidade\s*[:\-–]\s*([^\n]{3,80})/i,
        /c[eé]dula\s+de\s+identidade\s*[:\-–]\s*([^\n]{3,80})/i,
        /carteira\s+de\s+identidade\s*[:\-–]\s*([^\n]{3,80})/i,
        /identidade\s+n[°º.]?\s*[:\-–]?\s*([0-9][0-9.\s\/\-]{3,18}[0-9](?:\s+[A-Z]{2,10}(?:\/[A-Z]{2})?)?)/i,
        /\bRG\s*n[°º.]?\s*[:\-–]\s*([0-9][0-9.\-\/]{4,18}(?:\s+[A-Z]{2,10}(?:\/[A-Z]{2})?)?)/i,
        /\bRG\s*[:\-–]\s*([0-9][0-9.\-\/]{4,18}(?:\s+[A-Z]{2,10}(?:\/[A-Z]{2})?)?)/i,
        /\bCNH\s*[:\-–]\s*([0-9]{7,12})/i,
    ];

    for (const re of padroes) {
        const m = texto.match(re);
        if (m) {
            let val = m[1].trim().replace(/\s+/g, ' ');
            val = val.replace(/\s+cpf\s*[:\-–].*/i, '').trim();
            val = val.replace(/\s+endere[çc].*/i, '').trim();
            val = val.replace(/\s+comit[êe].*/i, '').trim();
            val = val.replace(/\s+filia[çc][ãa]o.*/i, '').trim();
            val = val.replace(/\s+data\s+de\s+nasc.*/i, '').trim();
            val = val.replace(/\s+naturalidad.*/i, '').trim();
            val = val.replace(/\s+o[rg]g[aã].*/i, '').trim();
            // Guarda anti-lixo: o documento de identificação tem de conter dígitos; sem
            // nenhum, a captura é um nome (layout 2 colunas sem remontagem) — descarta.
            if (!/\d/.test(val)) continue;
            return val.substring(0, 50);
        }
    }

    console.log('[AuditJE] _extrairDocIdentificacao: nenhum padrão bateu. Trecho:', texto.substring(0, 500));
    return null;
}

// Atualiza o card de informações do processo com dados extraídos da petição/RRC.
// Todos os placeholders já existem no HTML gerado por handleInfoProcesso;
// aqui apenas preenchemos o span.card-val e tornamos o elemento visível.
function atualizarInfoCardCandidato(campos) {
    const card = document.getElementById('processo-info-card');
    if (!card) return;
    card.style.display = 'block';

    // Atualiza o span.card-val de um placeholder data-info existente e torna a célula visível.
    // Se html for falsy, renderiza valor vazio em itálico.
    const set = (id, html, forceShow) => {
        const el = card.querySelector(`[data-info="${id}"]`);
        if (!el) return;
        const valSpan = el.querySelector('.card-val');
        if (valSpan) {
            if (html) {
                valSpan.className = 'card-val';
                valSpan.innerHTML = html;
            } else {
                valSpan.className = 'card-val empty';
                valSpan.innerHTML = '—';
            }
        }
        if (html || forceShow) el.style.display = '';
    };

    if (campos.cargo)
        set('cargo', `<strong style="color:var(--accent)">${campos.cargo}</strong>`);

    if (campos.nomeUrna)
        set('nomeUrna', campos.nomeUrna);

    if (campos.numeroUrna)
        set('numeroUrna', `<span style="font-family:var(--font-mono);color:var(--accent);font-weight:600">${campos.numeroUrna}</span>`);

    if (campos.ocupacao) {
        set('ocupacao', campos.ocupacao);
        const n = _norm(campos.ocupacao);
        const eDesincompat = /militar|policia|bombeiro|exercito|marinha|aeronautica|forca\s*aerea|forcas\s*arm|servidor|funciona.*public|administrac.*public|publico\s*civil/.test(n);
        let aviso = card.querySelector('[data-info="desincompat"]');
        if (eDesincompat) {
            if (!aviso) {
                aviso = document.createElement('div');
                aviso.dataset.info = 'desincompat';
                aviso.textContent = '⚠️ VERIFICAR PRAZO DE DESINCOMPATIBILIZAÇÃO';
                const cardBody = card.querySelector('.card-body');
                (cardBody || card).appendChild(aviso);
            }
        } else if (aviso) {
            aviso.remove();
        }
    }

    if (campos.ocupacaoComplementar)
        set('ocupacaoComp', campos.ocupacaoComplementar);

    if (campos.reeleicao) {
        // Extrai texto puro (remove tags HTML caso venha de restore do Sheets)
        const _tmpDiv = document.createElement('div');
        _tmpDiv.innerHTML = campos.reeleicao;
        const reeleicaoTxt = (_tmpDiv.textContent || '').replace(/^[↩×✓⚠\s×]+/u, '').trim() || campos.reeleicao;
        const eSim = /^sim$/i.test(reeleicaoTxt);
        const badgeClass = eSim ? 'badge-neutral' : 'badge-success';
        const icon = eSim ? '↩' : '×';
        set('reeleicao',
            `<span class="card-badge ${badgeClass}">${icon} ${eSim ? 'Sim' : 'Não'}</span>`
        );
    }

    if (campos.cargoEletivo)
        set('cargoEletivo', campos.cargoEletivo);

    if (campos.docIdentificacao)
        set('docIdent', campos.docIdentificacao);

    if (campos.cargoComissao) {
        // Extrai texto puro — remove tags HTML caso venha de restore do Sheets com badge embutido
        const _tmpDiv2 = document.createElement('div');
        _tmpDiv2.innerHTML = campos.cargoComissao;
        const rawVal = (_tmpDiv2.textContent || '').replace(/^[\u2714\u26a0\ufe0f\u2713\u2714\s]+/u, '').trim() || campos.cargoComissao;
        const eSim  = /^sim$/i.test(rawVal);
        // Badge: SIM → warning (risco), NÃO → success (ok)
        const badgeClass = eSim ? 'badge-warning' : 'badge-success';
        const icon = eSim ? '\u26a0' : '\u2713';
        set('cargoComissao',
            `<span class="card-badge ${badgeClass}">${icon} ${eSim ? 'SIM' : 'NÃO'}</span>`
            + (eSim ? '<div style="font-size:var(--fs-xs);color:var(--warning);margin-top:3px;">Exige comprovante de desvincul.</div>' : '')
        );
    }
}

// Processa o conteúdo da petição inicial / RRC recebido do content.js.
// Usa palavras-chave do conteúdo para identificar o tipo de documento.
async function handleConteudoPeticao(data) {
    let texto = null;
    if (data.tipo === 'html') {
        texto = data.conteudo;
    } else if (data.tipo === 'pdf' && data.conteudo) {
        texto = await extrairTextoPDF(data.conteudo);
    }
    if (!texto) return;

    // Identificação por palavras-chave de conteúdo
    const isPeticaoInicial = /pedido coletivo|subscrito no respectivo drap|registro da candidatura/i.test(texto);
    const isRRC = /informa[çc][õo]es\s+de\s+candidatura/i.test(texto);

    const campos = {};

    // Petição Inicial: cargo, número, nome urna, ocupação, reeleição, cargo eletivo
    if (isPeticaoInicial || !isRRC) {
        campos.cargo               = _extrairCargo(texto);
        campos.numeroUrna          = _extrairNumeroUrna(texto);
        campos.nomeUrna            = _extrairNomeUrna(texto);
        campos.ocupacao            = _extrairOcupacao(texto);
        campos.ocupacaoComplementar= _extrairOcupacaoComplementar(texto);
        campos.reeleicao           = _extrairReeleicao(texto);
        campos.cargoEletivo        = _extrairCargoEletivo(texto);
    }

    // cargoComissao: sempre extraído de qualquer documento (a frase é única o suficiente)
    campos.cargoComissao = _extrairCargoComissao(texto);

    // RRC: documento de identificação e campos de candidatura
    if (isRRC || !isPeticaoInicial) {
        campos.docIdentificacao = _extrairDocIdentificacao(texto);
        // Preenche campos de candidatura somente se ainda não foram definidos pela petição
        if (!campos.cargo) {
            campos.cargo               = _extrairCargo(texto);
            campos.numeroUrna          = _extrairNumeroUrna(texto);
            campos.nomeUrna            = _extrairNomeUrna(texto);
            campos.ocupacao            = _extrairOcupacao(texto);
            campos.ocupacaoComplementar= _extrairOcupacaoComplementar(texto);
            campos.reeleicao           = _extrairReeleicao(texto);
            campos.cargoEletivo        = _extrairCargoEletivo(texto);
        }
    }

    // Guarda os campos extraidos (cargo etc.) como dado — o save nao depende do DOM do painel
    _S._cardCampos = _S._cardCampos || {};
    for (const _k in campos) { if (campos[_k]) _S._cardCampos[_k] = campos[_k]; }
    if (Object.values(campos).some(Boolean))
        atualizarInfoCardCandidato(campos);
}

// ═════════════════════════════════════════════════════════════════════════════
// INFO DO PROCESSO
// ═════════════════════════════════════════════════════════════════════════════

let infoProcesso = null;

// Atualiza no card o número do processo associado (pode ser chamado depois do carregamento)
function _atualizarProcessoAssociadoNoCard(numero) {
    if (!numero) return;
    _S._processoAssociado = numero;
    if (infoProcesso) infoProcesso.processoAssociado = numero;
    const card = document.getElementById('processo-info-card');
    if (!card) return;
    const el = card.querySelector('[data-info="processoAssociado"]');
    if (el) {
        el.querySelector('.card-val').textContent = numero;
        el.style.display = '';
    }
}

function handleInfoProcesso(data) {
    console.log('[AuditJE] handleInfoProcesso recebido:', data);

    // Se o número do processo mudou, reseta o estado da sessão anterior
    const numeroAnterior = infoProcesso?.numero;
    if (data.numero && data.numero !== numeroAnterior) {
        _S._relatorioGerado          = false;
        _S._auditoriaResultados      = null;
        _S._dadosRecuperadosDoSheets = false;
        _S._cardCampos = null; _S._cardCamposSheets         = null;
    }

    infoProcesso = data;
    if (data.processoAssociado) _S._processoAssociado = data.processoAssociado;

    // Tenta recuperar auditoria anterior do Google Sheets
    if (data.numero && _S._sheetsUrl && !_S._relatorioGerado) {
        recuperarDoSheets(data.numero).then(salvo => {
            if (!salvo) return;
            _S._auditoriaResultados          = salvo.resultados;
            _S._candOverrides                = salvo.candOverrides        || {};
            _S._candSeletoresPD              = salvo.candSeletoresPD      || {};
            _S._candTextos                   = salvo.candTextos           || {};
            _S._divergenciasSelecao          = salvo.divergenciasSelecao  || null;
            _S._diligenciaOverrides          = salvo.diligenciaOverrides  || {};
            _S._relatorioGerado              = true;
            _S._dadosRecuperadosDoSheets     = true;
            _S._dataAuditoria       = _normalizarDataAuditoria(salvo.data);
            _S._auditoriaTipo       = salvo.tipo;
            if (salvo.processoAssociado) {
                _S._processoAssociado = salvo.processoAssociado;
                _atualizarProcessoAssociadoNoCard(salvo.processoAssociado);
            }
            gerarRelatorioAuditoria(salvo.resultados);
            renderizarChecklistCAND(salvo.resultados, salvo.processoAssociado || '');
            renderizarResumoArt27(salvo.resultados, salvo.processoAssociado || '');
            _mostrarBannerRecuperado(salvo);
            // Guarda cardCampos permanentemente para reaplicar em toda reconstrução do card
            if (salvo.cardCampos && Object.values(salvo.cardCampos).some(Boolean))
                _S._cardCamposSheets = salvo.cardCampos;
            _ativarBotaoDocsNovos();
            // Navega para a aba CAND para mostrar os dados recuperados
            const abaCAND = document.querySelector('[data-painel="cand"]');
            if (abaCAND) abaCAND.click();
        });
    }
    const card = document.getElementById('processo-info-card');
    if (!card) return;

    const assocNum = data.processoAssociado || _S._processoAssociado || '';

    // SVG icons (16×16) para cada campo
    const _ico = {
        processo:  `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="1" width="10" height="14" rx="1.5"/><line x1="6" y1="5" x2="10" y2="5"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="11" x2="8" y2="11"/></svg>`,
        pessoa:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
        id:        `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="14" height="9" rx="1.5"/><circle cx="5" cy="8.5" r="1.5"/><line x1="8" y1="7" x2="13" y2="7"/><line x1="8" y1="10" x2="11" y2="10"/></svg>`,
        cargo:     `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><rect x="1" y="4" width="14" height="10" rx="1.5"/><line x1="1" y1="9" x2="15" y2="9"/></svg>`,
        urna:      `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1 L15 5 L15 11 L8 15 L1 11 L1 5 Z"/><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/></svg>`,
        ocup:      `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="12" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`,
        comissao:  `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><polyline points="8,4 8,8 11,10"/></svg>`,
        reeleicao: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 1 0 6-6"/><polyline points="2,4 2,8 6,8"/></svg>`,
        eletivo:   `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="8,1 10,6 15,6 11,9.5 12.5,15 8,12 3.5,15 5,9.5 1,6 6,6"/></svg>`,
    };

    // Monta header com número do processo + botão copiar
    const headerHtml = data.numero ? `
    <div class="card-header">
      <div class="card-header-num">
        ${_ico.processo}
        <span id="card-num-text">⚖ ${data.numero}</span>
        <button class="btn-copy-num" id="btn-copy-processo" title="Copiar número">📋</button>
      </div>
      <div data-info="processoAssociado" class="card-header-assoc" style="${assocNum ? '' : 'display:none'}">
        <span>Proc. assoc.:</span>
        <span class="card-val">${assocNum}</span>
      </div>
    </div>` : '';

    // Linha 1: Requerente | CPF | Doc. identif. | Cargo | Nome p/ urna
    // Linha 2: Cargo em comissão | Ocupação | Ocup. complementar | Reeleição | Cargo eletivo
    const emptyHtml = `<span class="card-val empty">—</span>`;

    card.innerHTML = headerHtml + `
    <div class="card-body">
      <!-- ── Linha 1 ── -->
      <div class="card-row">
        <div data-info="requerente" class="card-cell flex-2">
          <span class="card-label">${_ico.pessoa} Requerente</span>
          <span class="card-val">${data.requerente
            ? `<strong>${data.requerente}</strong>`
            : `<span class="card-val empty">—</span>`
          }</span>
        </div>
        <div data-info="cpf" class="card-cell flex-1">
          <span class="card-label">${_ico.id} CPF</span>
          <span class="card-val" style="font-family:var(--font-mono)">${data.cpf || emptyHtml}</span>
        </div>
        <div data-info="docIdent" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.id} Doc. de identificação</span>
          <span class="card-val" style="font-family:var(--font-mono)"></span>
        </div>
        <div data-info="cargo" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.cargo} Cargo</span>
          <span class="card-val"></span>
        </div>
        <div data-info="nomeUrna" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.urna} Nome para urna</span>
          <span class="card-val"></span>
        </div>
      </div>
      <!-- ── Linha 2: CargoComissão(1) | Ocupação(2) | OcupComp(1) | Reeleição(1) | CargoEletivo(1) ── -->
      <div class="card-row">
        <div data-info="cargoComissao" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.comissao} Cargo em comissão</span>
          <span class="card-val"></span>
        </div>
        <div data-info="ocupacao" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.ocup} Ocupação</span>
          <span class="card-val"></span>
        </div>
        <div data-info="ocupacaoComp" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.ocup} Ocup. complementar</span>
          <span class="card-val"></span>
        </div>
        <div data-info="reeleicao" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.reeleicao} Reeleição</span>
          <span class="card-val"></span>
        </div>
        <div data-info="cargoEletivo" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.eletivo} Cargo eletivo</span>
          <span class="card-val"></span>
        </div>
        <div data-info="numeroUrna" class="card-cell flex-1" style="display:none">
          <span class="card-label">${_ico.urna} Número de urna</span>
          <span class="card-val"></span>
        </div>
      </div>
    </div>
    `;
    card.style.display = 'block';

    // Reaplica campos do Sheets sempre que o card for reconstruído
    // (cobre tanto a chegada async na primeira vez quanto reaberturas subsequentes)
    if (_S._cardCamposSheets) {
        atualizarInfoCardCandidato(_S._cardCamposSheets);
    }

    // Botão copiar número do processo
    const btnCopy = card.querySelector('#btn-copy-processo');
    if (btnCopy && data.numero) {
        btnCopy.addEventListener('click', (e) => {
            e.stopPropagation();
            const ta = document.createElement('textarea');
            ta.value = data.numero;
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { document.execCommand('copy'); } catch(err) {}
            document.body.removeChild(ta);
            btnCopy.textContent = '✅';
            setTimeout(() => { btnCopy.textContent = '📋'; }, 1800);
        });
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI — HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function showChat() {
    // Compatibilidade — nesta versão o chat-area não existe mais,
    // o #messages está diretamente no body
}

function clearChat() {
    _S._postParent?.({ source: 'chatje-iframe', type: 'CANCEL_AUDITORIA' });
    _S._auditoriaRodando = false;
    document.getElementById('painel-auditoria').innerHTML = `
        <div id="empty-state">
          <div class="icon">⚖</div>
          <h3>AuditJE — Apoio à Análise Documental</h3>
          <p>Selecione um tipo de auditoria acima para iniciar a verificação dos documentos do processo.</p>
          <p style="margin-top:8px;font-size:11px;line-height:1.9;">
            🏛️ <strong style="color:var(--text)">Certidões</strong> — recomendado para registro de candidatura<br>
            📋 <strong style="color:var(--text)">Docs. apresentados</strong> — documentos apresentados pelo candidato<br>
            🔎 <strong style="color:var(--text)">Processo completo</strong> — todos os documentos
          </p>
        </div>`;
    if (infoProcesso) handleInfoProcesso(infoProcesso);
}

function mostrarCarregandoDocs(encontrados, progresso) {
    const painel = document.getElementById('painel-auditoria');
    let el = document.getElementById('loading-docs');
    if (!el) {
        // Oculta o empty-state enquanto carrega
        const empty = document.getElementById('empty-state');
        if (empty) empty.style.display = 'none';
        el = document.createElement('div');
        el.id = 'loading-docs';
        el.innerHTML = `
          <div class="ld-titulo">Carregando documentos do processo</div>
          <div class="ld-subtitulo">Aguarde, os documentos estão sendo identificados<br>na timeline do PJe</div>
          <div class="ld-track"><div class="ld-fill" id="ld-fill" style="width:0%"></div></div>`;
        painel.insertBefore(el, painel.firstChild);
    }
    const fill = document.getElementById('ld-fill');
    if (fill) fill.style.width = `${progresso}%`;
}

function removerCarregandoDocs() {
    const el = document.getElementById('loading-docs');
    if (el) el.remove();
    const empty = document.getElementById('empty-state');
    if (empty) empty.style.display = '';
}

function exibirAvisoScroll() {
    const aviso = document.createElement('div');
    aviso.id = 'aviso-scroll';
    aviso.style.cssText = 'background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:10px 13px;font-size:11px;line-height:1.7;color:var(--warning,#f59e0b);margin-bottom:6px;';
    aviso.innerHTML = '<strong>⚠️ Para auditar todos os documentos:</strong><br>Role a lista de documentos até o fim antes de iniciar a auditoria, para que o PJe carregue todos no painel lateral.';
    const msgs  = document.getElementById('painel-auditoria');
    const empty = document.getElementById('empty-state');
    if (empty) msgs.insertBefore(aviso, empty);
    else       msgs.insertBefore(aviso, msgs.firstChild);
}

function removeEmptyState() {
    const empty = document.getElementById('empty-state');
    if (empty) empty.remove();
}

function addSystemMessage(text) {
    removeEmptyState();
    const msgs = document.getElementById('painel-auditoria');
    const div  = document.createElement('div');
    div.style.cssText = 'font-size:13px;color:var(--text-muted);text-align:center;padding:6px 0;';
    div.textContent   = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO GOOGLE SHEETS
// ═════════════════════════════════════════════════════════════════════════════

function _atualizarDataTSV(tsv) {
    if (!tsv) return tsv;
    const linhas = tsv.split('\n');
    if (linhas.length < 2) return tsv;
    const vals = linhas[1].split('\t');
    vals[0] = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    linhas[1] = vals.join('\t');
    return linhas.join('\n');
}

function _normalizarDataAuditoria(val) {
    if (!val) return '';
    const s = String(val);
    // Já está no formato pt-BR ("21/04/2026, 16:05") — mantém
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
    // Qualquer outro formato reconhecível pelo Date() (ISO, Date.toString, etc.) — converte
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    return s;
}

async function salvarNoSheets(resultados) {
    const url = _S._sheetsUrl;
    if (!url) {
        console.warn('[AuditJE] salvarNoSheets: _sheetsUrl não definida — save abortado.');
        return;
    }

    // ── Tempo da auditoria (indicador): início (clique) → ESTE salvamento ─────
    // Cada salvamento grava o tempo decorrido do clique de iniciar até agora —
    // valores distintos e crescentes ao longo da auditoria (1 linha por
    // salvamento). O t0 é zerado só no início de uma nova auditoria
    // (handleAuditoriaStart); a checagem de processo evita reaproveitar um t0
    // de outra auditoria caso o processo tenha mudado sem nova auditoria.
    let _tempoSeg = '';
    if (_S._auditT0 != null && (!_S._auditProcesso || _S._auditProcesso === (infoProcesso?.numero || ''))) {
        const _fim      = performance.now();
        const _totalSeg = (_fim - _S._auditT0) / 1000;
        _tempoSeg = Math.round(_totalSeg * 10) / 10;
        const _procSeg = _S._auditTProcMs != null ? (_fim - _S._auditTProcMs) / 1000 : null;
        console.log(`[AuditJE][tempo] clique → salvar: ${_totalSeg.toFixed(1)}s`
            + (_procSeg != null ? ` · desde o processamento: ${_procSeg.toFixed(1)}s` : ''));
    }

    const card = document.getElementById('processo-info-card');
    const _cv  = (k) => card?.querySelector(`[data-info="${k}"] .card-val`)?.textContent?.trim() || '';
    const payload = {
        processo:          infoProcesso?.numero || '',
        candidato:         infoProcesso?.requerente || '',
        cargo:             (_S._cardCampos && _S._cardCampos.cargo) || _cv('cargo') || (_S._cardCamposSheets && _S._cardCamposSheets.cargo) || '',
        servidor:          _S._servidorResponsavel || '',
        data:              new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        tipo:              _S._auditoriaTipo || '',
        tempoSegundos:     _tempoSeg,
        processoAssociado: _S._processoAssociado || infoProcesso?.processoAssociado || '',
        trilhaAuditoria:   _S._trilhaAuditoria || [],
        // Remove _textoExtraido e base64 para não estourar o limite de células do Sheets
        resultados: resultados.map(r => {
            // Deriva mae/pai/RG do texto ANTES de remover _textoExtraido, para que
            // sobrevivam a reabertura pelo Sheets (aqui so removemos _textoExtraido/
            // _textoAmostra/base64; os campos novos vao no ...rest e sao persistidos).
            if (r._textoExtraido) {
                if (typeof _qlExtrairFiliacao === 'function') {
                    const _filP = _qlExtrairFiliacao(r._textoExtraido);
                    if (_filP.mae && !r._maeExtraida) r._maeExtraida = _filP.mae;
                    if (_filP.pai && !r._paiExtraida) r._paiExtraida = _filP.pai;
                }
                if (typeof _extrairDocIdentificacao === 'function' && !r._rgExtraido) {
                    const _rgP = _extrairDocIdentificacao(r._textoExtraido);
                    if (_rgP) r._rgExtraido = _rgP;
                }
            }
            const { _textoExtraido, _textoAmostra, base64, ...rest } = r;
            return rest;
        }),
        candOverrides:        _S._candOverrides        || {},
        candSeletoresPD:      _S._candSeletoresPD      || {},
        candTextos:           _S._candTextos           || {},
        divergenciasSelecao:  _S._divergenciasSelecao  || null,
        diligenciaOverrides:  _S._diligenciaOverrides  || {},
        cardCampos: {
            cargo:               (_S._cardCampos && _S._cardCampos.cargo) || _cv('cargo') || (_S._cardCamposSheets && _S._cardCamposSheets.cargo) || '',
            nomeUrna:            _cv('nomeUrna'),
            ocupacao:            _cv('ocupacao'),
            ocupacaoComplementar:_cv('ocupacaoComp'),
            reeleicao:           _cv('reeleicao'),
            cargoEletivo:        _cv('cargoEletivo'),
            docIdentificacao:    _cv('docIdent'),
            cargoComissao:       _cv('cargoComissao'),
            numeroUrna:          _cv('numeroUrna'),
        },
        relatorioGestao:    _atualizarDataTSV(_S._relGestaoTSV || ''),
        situacaoProcessual: _S._relSituacaoTexto || '',
        infoProcesso,
    };
    if (!payload.processo) {
        console.warn('[AuditJE] salvarNoSheets: "processo" vazio — save abortado.');
        return;
    }
    try {
        const _resp = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const _json = await _resp.json().catch(() => null);
        if (_json?.error) {
            console.error('[AuditJE] salvarNoSheets: erro do Apps Script:', _json.error);
            _mostrarNotificacaoSheets('⚠️ Sheets: ' + _json.error);
        } else {
            _mostrarNotificacaoSheets('✅ Salvo no Google Sheets');
        }
    } catch (e) {
        console.error('[AuditJE] salvarNoSheets: erro no fetch:', e);
        _mostrarNotificacaoSheets('⚠️ Erro ao salvar no Sheets: ' + e.message);
    }
}

async function recuperarDoSheets(numeroProcesso) {
    const url = _S._sheetsUrl;
    if (!url || !numeroProcesso) return null;
    try {
        const resp = await fetch(url + '?processo=' + encodeURIComponent(numeroProcesso));
        const data = await resp.json();
        return data?.found ? data : null;
    } catch {
        return null;
    }
}

function _mostrarNotificacaoSheets(msg) {
    let el = document.getElementById('notif-sheets');
    if (!el) {
        el = document.createElement('div');
        el.id = 'notif-sheets';
        Object.assign(el.style, {
            position: 'fixed', bottom: '16px', right: '16px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '8px 14px',
            fontSize: '12px', color: 'var(--text)',
            zIndex: '9998', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            transition: 'opacity 0.3s',
        });
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

function _mostrarBannerRecuperado(dados) {
    document.getElementById('banner-recuperado')?.remove();
    const painel = document.getElementById('painel-cand');
    if (!painel) return;
    const banner = document.createElement('div');
    banner.id = 'banner-recuperado';
    banner.style.cssText = 'margin:12px 16px 0;padding:10px 14px;background:rgba(79,124,255,0.1);border:1px solid rgba(79,124,255,0.3);border-radius:var(--radius-sm);font-size:11px;color:var(--text-soft);line-height:1.6;';
    banner.innerHTML = `🔄 <strong style="color:var(--accent)">Dados recuperados do Google Sheets</strong><br>
        Auditoria realizada por <strong>${dados.servidor || '(não informado)'}</strong> em <strong>${dados.data || ''}</strong>
        ${dados.tipo ? ' · Tipo: ' + dados.tipo : ''}`;
    // Insere após o cabeçalho (primeiro filho)
    const cabecalho = painel.firstChild;
    if (cabecalho?.nextSibling) {
        painel.insertBefore(banner, cabecalho.nextSibling);
    } else {
        painel.appendChild(banner);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCS NOVOS — popup de seleção e auditoria complementar
// ═════════════════════════════════════════════════════════════════════════════

function abrirPopupDocsNovos() {
    // Solicita a lista atual de documentos da árvore do PJe
    _S._postParent?.({ source: 'chatje-iframe', type: 'REQUEST_LISTA_DOCS' });
    // Mostra loading enquanto aguarda resposta
    _mostrarNotificacaoSheets('⏳ Carregando lista de documentos...');
}

function _handleListaDocs(docsArvore) {
    const idsAnalisados = new Set((_S._auditoriaResultados || []).map(r => String(r.id)));
    const mapaAnalisados = new Map((_S._auditoriaResultados || []).map(r => [String(r.id), r]));

    const novos     = docsArvore.filter(d => !idsAnalisados.has(String(d.id)));
    const anteriores = docsArvore.filter(d =>  idsAnalisados.has(String(d.id)));

    // Atualiza visibilidade do botão
    const btnDN = document.getElementById('btn-docs-novos');
    if (btnDN) {
        btnDN.style.display = '';
        // Badge com contagem de novos
        let badge = btnDN._badge;
        if (!badge) {
            badge = document.createElement('span');
            badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;background:var(--error);color:#fff;border-radius:99px;font-size:10px;font-weight:700;min-width:16px;height:16px;padding:0 4px;margin-left:4px;';
            btnDN.appendChild(badge);
            btnDN._badge = badge;
        }
        badge.textContent = novos.length;
        badge.style.display = novos.length > 0 ? '' : 'none';
    }

    // Monta o popup
    const anterior = document.getElementById('popup-docs-novos');
    if (anterior) anterior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'popup-docs-novos';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);width:100%;max-width:620px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;';

    // Cabeçalho
    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    header.innerHTML = `<span style="font-weight:700;font-size:14px;color:var(--accent);font-family:'IBM Plex Mono',monospace;">📄 Documentos do Processo</span>`;
    const btnFechar = document.createElement('button');
    btnFechar.textContent = '✕';
    btnFechar.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:4px;';
    btnFechar.addEventListener('click', () => overlay.remove());
    header.appendChild(btnFechar);
    modal.appendChild(header);

    // Corpo com scroll
    const corpo = document.createElement('div');
    corpo.style.cssText = 'overflow-y:auto;flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:16px;';

    // ── Seção: Não analisados
    const selecionados = new Set();
    if (novos.length > 0) {
        const secNovos = document.createElement('div');
        const tituloNovos = document.createElement('div');
        tituloNovos.style.cssText = 'font-weight:700;font-size:12px;color:var(--warning);margin-bottom:8px;font-family:"IBM Plex Mono",monospace;letter-spacing:.04em;';
        tituloNovos.textContent = `🆕 NÃO ANALISADOS (${novos.length})`;
        secNovos.appendChild(tituloNovos);

        novos.forEach(d => {
            const linha = document.createElement('label');
            linha.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:7px 10px;border-radius:var(--radius-sm);border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.06);cursor:pointer;margin-bottom:5px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = d.id;
            cb.style.cssText = 'margin-top:2px;accent-color:var(--warning);flex-shrink:0;';
            cb.addEventListener('change', () => {
                if (cb.checked) selecionados.add(d.id);
                else selecionados.delete(d.id);
                btnAuditar.disabled = selecionados.size === 0;
                btnAuditar.style.opacity = selecionados.size === 0 ? '0.5' : '1';
            });
            const texto = document.createElement('span');
            texto.style.cssText = 'font-size:12px;color:var(--text);line-height:1.4;';
            texto.innerHTML = `<span style="color:var(--text-muted);font-family:'IBM Plex Mono',monospace;font-size:11px;">${_esc(d.id)}</span> — ${_esc(d.nome)}`;
            linha.appendChild(cb);
            linha.appendChild(texto);
            secNovos.appendChild(linha);
        });
        corpo.appendChild(secNovos);
    } else {
        const semNovos = document.createElement('div');
        semNovos.style.cssText = 'padding:12px;text-align:center;color:var(--success);font-size:13px;border:1px solid rgba(34,197,94,0.2);border-radius:var(--radius-sm);background:rgba(34,197,94,0.06);';
        semNovos.textContent = '✅ Todos os documentos da árvore já foram analisados.';
        corpo.appendChild(semNovos);
    }

    // ── Seção: Já analisados
    if (anteriores.length > 0) {
        const secAnt = document.createElement('div');
        const tituloAnt = document.createElement('div');
        tituloAnt.style.cssText = 'font-weight:700;font-size:12px;color:var(--text-muted);margin-bottom:8px;font-family:"IBM Plex Mono",monospace;letter-spacing:.04em;';
        tituloAnt.textContent = `✅ JÁ ANALISADOS (${anteriores.length})`;
        secAnt.appendChild(tituloAnt);

        anteriores.forEach(d => {
            const res = mapaAnalisados.get(String(d.id));
            const { icon, text, color } = res ? _statusStyle(res.status) : { icon: '—', text: '—', color: 'var(--text-muted)' };
            const linha = document.createElement('div');
            linha.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-soft);background:var(--surface2);margin-bottom:4px;';
            linha.innerHTML = `
                <span style="font-size:12px;flex:1;color:var(--text-soft);line-height:1.4;">
                    <span style="color:var(--text-muted);font-family:'IBM Plex Mono',monospace;font-size:11px;">${_esc(d.id)}</span> — ${_esc(d.nome)}
                </span>
                <span style="font-size:11px;color:${color};white-space:nowrap;flex-shrink:0;">${icon} ${_esc(text)}</span>
            `;
            secAnt.appendChild(linha);
        });
        corpo.appendChild(secAnt);
    }

    modal.appendChild(corpo);

    // Rodapé com botão
    const rodape = document.createElement('div');
    rodape.style.cssText = 'padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:8px;';

    const btnAuditar = document.createElement('button');
    btnAuditar.className = 'btn-primary';
    btnAuditar.style.cssText = 'flex:1;padding:9px 0;font-size:13px;font-weight:600;opacity:0.5;';
    btnAuditar.textContent = '🔍 Auditar selecionados';
    btnAuditar.disabled = true;
    btnAuditar.addEventListener('click', () => {
        if (selecionados.size === 0) return;
        overlay.remove();
        const ids = Array.from(selecionados);
        addSystemMessage(`🆕 Iniciando auditoria complementar de ${ids.length} documento(s) novo(s)...`);
        _S._postParent?.({ source: 'chatje-iframe', type: 'REQUEST_AUDITORIA_SELETIVA', ids });
        // Garante que a aba Auditoria fique visível
        document.querySelector('[data-painel="auditoria"]')?.click();
    });

    const btnCancelar = document.createElement('button');
    btnCancelar.style.cssText = 'padding:9px 16px;font-size:13px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);cursor:pointer;';
    btnCancelar.textContent = 'Fechar';
    btnCancelar.addEventListener('click', () => overlay.remove());

    rodape.appendChild(btnAuditar);
    rodape.appendChild(btnCancelar);
    modal.appendChild(rodape);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// Exibe o botão "Docs. novos" quando dados são recuperados do Sheets
// (indica que há uma auditoria anterior e pode haver docs novos)
function _ativarBotaoDocsNovos() {
    const btn = document.getElementById('btn-docs-novos');
    if (btn) btn.style.display = '';
}

// ═════════════════════════════════════════════════════════════════════════════
// SISTEMA DE ABAS
// ═════════════════════════════════════════════════════════════════════════════

// ── Helpers internos de navegação ────────────────────────────────────────────

// Ativa uma sub-aba de Análise documental (verificacao | cand | resumo)
function _ativarSubAba(subpainel) {
    // Level-2 tabs
    document.querySelectorAll('.aba-l2').forEach(a => a.classList.remove('ativa'));
    document.querySelector(`.aba-l2[data-subpainel="${subpainel}"]`)?.classList.add('ativa');
    // Sub-painéis (auditoria, cand, resumo) dentro de #painel-analise
    document.querySelectorAll('#painel-analise .painel').forEach(p => p.classList.remove('ativo'));
    document.getElementById('painel-' + subpainel)?.classList.add('ativo');
    // Toolbar só visível em Verificação
    if (subpainel === 'qualificacao' && typeof renderizarQualificacao === 'function') renderizarQualificacao();
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.style.display = subpainel === 'auditoria' ? 'flex' : 'none';
}

// Ativa uma seção de nível 1 (analise | hipoteses) e, opcionalmente, sub-aba
function _ativarSecao(secao, subpainel) {
    // Level-1 tabs
    document.querySelectorAll('.aba-l1').forEach(a => a.classList.remove('ativa'));
    document.querySelector(`.aba-l1[data-secao="${secao}"]`)?.classList.add('ativa');
    // Level-2 nav bar: visível apenas em "analise"
    const navL2 = document.getElementById('nav-l2');
    if (navL2) navL2.classList.toggle('visivel', secao === 'analise');
    // Painéis de nível 1
    const painelAnalise       = document.getElementById('painel-analise');
    const painelHipoteses     = document.getElementById('painel-hipoteses');
    if (painelAnalise)        painelAnalise.classList.toggle('ativo',        secao === 'analise');
    if (painelHipoteses)      painelHipoteses.classList.toggle('ativo',      secao === 'hipoteses');
    if (secao === 'analise') {
        _ativarSubAba(subpainel || 'auditoria');
    }
    if (secao === 'hipoteses' && typeof renderPainelHipoteses === 'function') {
        renderPainelHipoteses();
    }
    // Banner de tarefa ativa: sempre visível nas abas (não há mais aba Tarefas)
    const banner = document.getElementById('banner-tarefa-ativa');
    if (banner && _S?._tarefaAtiva) {
        banner.classList.add('visivel');
    }
}

function initAbas() {
    // Level-1: Tarefas / Análise documental
    const _abasL1 = document.querySelectorAll('.aba-l1');
    _abasL1.forEach(aba => {
        const ativar = () => {
            const secao = aba.dataset.secao;
            // a11y: reflete a aba ativa no aria-selected (auditoria: M5)
            _abasL1.forEach(a => a.setAttribute('aria-selected', a === aba ? 'true' : 'false'));
            _ativarSecao(secao);
        };
        aba.addEventListener('click', ativar);
        // teclado: Enter/Espaço ativam a aba (auditoria: M5)
        aba.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativar(); }
        });
    });
    // Level-2: Verificação / Requisitos CAND / Resumo
    const _abasL2 = document.querySelectorAll('.aba-l2');
    _abasL2.forEach(aba => {
        const ativar = () => {
            _abasL2.forEach(a => a.setAttribute('aria-selected', a === aba ? 'true' : 'false'));
            _ativarSubAba(aba.dataset.subpainel);
        };
        aba.addEventListener('click', ativar);
        aba.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativar(); }
        });
    });
}

function ativarAbaCand() {
    _ativarSecao('analise', 'cand');
}

function ativarAbaResumo() {
    _ativarSecao('analise', 'resumo');
}

// ── Adiciona/atualiza badge de notificação na aba CAND ───────────────────────
// Exibe contagem de itens pendentes/não-correspondentes; "✓" quando tudo ok.
function notificarAbaCand(resultados) {
    const aba = document.getElementById('aba-l2-cand') || document.getElementById('aba-cand');
    if (!aba) return;
    let badge = aba.querySelector('.aba-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'aba-badge';
        aba.appendChild(badge);
    }
    if (resultados) {
        const pendentes = resultados.filter(r =>
            r.status && (r.status.startsWith('nao_') || r.status === 'pendente'
                || r.status === 'pdf_sem_texto' || r.status === 'inconclusivo')
            // "Pessoa errada": documento de terceiro, não é pendência acionável
            && r.status !== 'nao_corresponde_nome'
            && r._verificacao !== 'pessoa_errada'
        ).length;
        badge.textContent = pendentes > 0 ? String(pendentes) : '✓';
        badge.style.background = pendentes > 0 ? 'var(--warning)' : 'var(--accent)';
    } else {
        badge.textContent = '✓';
        badge.style.background = '';
    }
}

// ── Adiciona/atualiza badge de notificação na aba Resumo ─────────────────────
function notificarAbaResumo(pendentes) {
    const aba = document.getElementById('aba-l2-resumo') || document.getElementById('aba-resumo');
    if (!aba) return;
    let badge = aba.querySelector('.aba-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'aba-badge';
        aba.appendChild(badge);
    }
    if (typeof pendentes === 'number' && pendentes > 0) {
        badge.textContent = String(pendentes);
        badge.style.background = 'var(--warning)';
    } else {
        badge.textContent = '\u2714';
        badge.style.background = '';
    }
}

// _aplicarResultadoVerificacao — miolo comum dos formulários de verificação/correção:
// aplica a opção escolhida ao resultado, marca verificação humana, atualiza a linha da
// tabela e regenera os relatórios (só se o servidor já clicou em "Finalizar auditoria").
function _aplicarResultadoVerificacao(r, opcoes, statusSelecionado, obsHumana) {
    const op = opcoes.find(o => o.valor === statusSelecionado);
    if (op && op._verificacao !== undefined) {
        r._verificacao = op._verificacao;
        r._conteudo    = op._conteudo;
        r.status       = _derivarStatus(r);
    } else {
        r.status = statusSelecionado;
    }
    r._obsHumana         = obsHumana;
    r._verificacaoHumana = true;
    atualizarItemAuditoria(r);
    if (_S._auditoriaResultados) {
        _S._relatorioGerado = true;
        gerarRelatorioAuditoria(_S._auditoriaResultados);
        solicitarProcessoAssociado().then(num => {
            renderizarChecklistCAND(_S._auditoriaResultados, num);
            renderizarResumoArt27(_S._auditoriaResultados, num);
            salvarNoSheets(_S._auditoriaResultados);
        });
    }
}
