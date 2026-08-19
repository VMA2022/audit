// auditoria.js — Handlers de auditoria, processamento de PDFs e visualizador
// Depende de: config.js, analysis.js

// ═════════════════════════════════════════════════════════════════════════════
// AUDITORIA — HANDLERS DE EVENTOS
// ═════════════════════════════════════════════════════════════════════════════

function requestAuditoria() {
    // t0 do indicador "tempo por auditoria" (clique → salvar): capturado já no
    // clique para incluir o carregamento da árvore de documentos. As marcas do
    // ciclo são zeradas em handleAuditoriaStart (início efetivo, todos os modos).
    _S._auditT0 = performance.now();
    _S._auditoriaTipo = 'completa';
    _S._postParent?.({ source: 'chatje-iframe', type: 'REQUEST_AUDITORIA' });
    addSystemMessage('🔍 Iniciando auditoria dos documentos do processo...');
}

function handleAuditoriaStart(data) {
    // Início efetivo da auditoria — âncora do indicador "tempo por auditoria".
    // Rede de segurança do t0 (modos cujo clique não o fixa, ex.: seletiva/docs
    // novos) e registro do processo do t0 (a coluna Tempo mede daqui até cada
    // salvamento; a checagem de processo evita reaproveitar o t0 em outro processo).
    if (_S._auditT0 == null) _S._auditT0 = performance.now();
    _S._auditProcesso      = (typeof infoProcesso !== 'undefined' && infoProcesso) ? (infoProcesso.numero || '') : '';
    _S._auditTProcMs       = null;
    _S._auditoriaEhSeletiva = data.seletiva === true;
    if (!_S._dadosRecuperadosDoSheets && !_S._auditoriaEhSeletiva) _S._relatorioGerado = false;
    if (data.requerente) _S._auditoriaRequerente = data.requerente;
    if (data.cpf)        _S._auditoriaCPF        = data.cpf;
    removeEmptyState();

    if (data.aviso) {
        const avisoDiv = document.createElement('div');
        avisoDiv.style.cssText = 'background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 12px;font-size:12px;color:#fbbf24;margin-bottom:4px;';
        avisoDiv.textContent   = data.aviso;
        document.getElementById('painel-auditoria').appendChild(avisoDiv);
    }

    const totalLabel = data.totalReal && data.totalReal !== data.total
        ? `${data.total} de ${data.totalReal} documentos carregados`
        : `${data.total} documentos`;

    const div = document.createElement('div');
    div.id = 'auditoria-container';
    div.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;margin:4px 0;';
    div.innerHTML = `
        <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-family:'IBM Plex Mono',monospace;font-size:13px;letter-spacing:.05em;">
            ${data.titulo || '⚖ AUDITORIA DO PROCESSO'} — ${totalLabel}
        </div>
        <div id="auditoria-progresso" style="color:var(--text-muted);margin-bottom:10px;font-size:13px;">
            Verificando 0 de ${data.total} documentos...
        </div>
        <div id="ajse-strip" style="display:none;"></div>
        <div style="overflow-x:auto;">
          <table id="auditoria-lista" style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:var(--surface2);border-bottom:2px solid var(--border);">
                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:100px;">ID</th>
                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:100%;">Documento</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:160px;">Verificação</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:140px;">Conteúdo</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:160px;">Distribuição</th>
                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:200px;">Identificação do conteúdo</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:150px;">Leitura do AuditJE</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:80px;">Texto</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text-muted);font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;width:80px;">PDF</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
    `;
    const msgs = document.getElementById('painel-auditoria');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function handleAuditoriaProgresso(data) {
    const progresso = document.getElementById('auditoria-progresso');
    if (progresso) progresso.textContent = `Verificando ${data.atual} de ${data.total} documentos...`;

    const lista = document.getElementById('auditoria-lista');
    if (!lista) return;
    const tbody = lista.querySelector('tbody');
    if (!tbody) return;

    const r = data.resultado;
    const _vstyle = r._verificacao ? _verificacaoStyle(r._verificacao) : _statusStyle(r.status);
    const { icon: statusIcon, text: statusText, color: statusColor } = _vstyle;

    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    tr.style.cssText = `border-bottom:1px solid var(--border);border-left:3px solid ${statusColor};`;
    tr.innerHTML = `
        <td style="padding:8px 10px;font-family:'IBM Plex Mono',monospace;color:var(--text-muted);font-size:12px;white-space:nowrap;vertical-align:middle;">${r.id}</td>
        <td style="padding:8px 10px;color:var(--text);font-size:13px;vertical-align:middle;word-break:break-word;">${(r.nome || '').substring(0, 100)}</td>
        <td data-col="verificacao" style="padding:8px 10px;text-align:center;vertical-align:middle;white-space:nowrap;font-size:13px;">
            ${statusIcon} <span style="color:${statusColor};">${statusText}</span>
        </td>
        <td data-col="conteudo" style="padding:8px 10px;text-align:center;vertical-align:middle;font-size:12px;color:var(--text-muted);">—</td>
        <td data-col="distribuicao" style="padding:8px 10px;text-align:center;vertical-align:middle;font-size:12px;">—</td>
        <td data-col="identificacao" style="padding:8px 10px;vertical-align:middle;font-size:12px;color:var(--text-muted);">—</td>
        <td data-col="leitura-je" style="padding:8px 10px;text-align:center;vertical-align:middle;">—</td>
        <td data-col="btn-texto" style="padding:8px 10px;text-align:center;vertical-align:middle;">—</td>
        <td data-col="btn-pdf" style="padding:8px 10px;text-align:center;vertical-align:middle;">—</td>
    `;
    tbody.appendChild(tr);
    tbody.scrollTop = tbody.scrollHeight;
}

// Armazena os resultados da auditoria em andamento para uso nos modais de edição
_S._auditoriaResultados = null;
// Overrides manuais do CAND: { [item.id]: status_string }
_S._candOverrides = {};
// Textos das textareas do CAND: { [item.id]: string } — sempre o mais recente (manual ou automático)
_S._candTextos = {};
// Flag: dados carregados do Sheets — impede que nova varredura sobrescreva
_S._dadosRecuperadosDoSheets = false;
// Flag: auditoria seletiva (docs novos) — mescla em vez de substituir
_S._auditoriaEhSeletiva = false;

// ── Mutex de auditoria — evita race condition em CHATJE_AUDITORIA_FIM ────────
// Substitui o guard booleano (_auditoriaRodando) por uma fila Promise que
// garante execução serial mesmo se duas mensagens chegarem antes do primeiro await.
let _auditoriaMutexPromise = Promise.resolve();

async function handleAuditoriaFim(data) {
    // Encadeia na fila — qualquer chamada anterior precisa terminar antes desta
    let _releaseMutex;
    const _token = new Promise(res => { _releaseMutex = res; });
    const _anterior = _auditoriaMutexPromise;
    _auditoriaMutexPromise = _auditoriaMutexPromise.then(() => _token);

    await _anterior; // aguarda a execução anterior concluir

    // Guard secundário: se já concluiu por outra via, ignora
    if (_S._auditoriaRodando) { _releaseMutex(); return; }
    _S._auditoriaRodando = true;

    const _ehSeletiva = _S._auditoriaEhSeletiva;

    if (_ehSeletiva && _S._auditoriaResultados) {
        // Mescla: substitui apenas os IDs recém-auditados, preserva o restante
        const mapaAntigo = new Map(_S._auditoriaResultados.map(r => [r.id, r]));
        data.resultados.forEach(r => mapaAntigo.set(r.id, r));
        _S._auditoriaResultados = Array.from(mapaAntigo.values());
        // _candOverrides é preservado integralmente
    } else if (!_S._dadosRecuperadosDoSheets) {
        _S._auditoriaResultados = data.resultados;
        _S._candOverrides = {};
        _S._candTextos = {};
        _S._divergenciasSelecao = null;
    }

    const progresso = document.getElementById('auditoria-progresso');
    if (progresso) progresso.textContent = 'Extraindo texto dos PDFs (pode demorar para PDFs escaneados)...';

    // Obtém docIdent do card (pode já estar preenchido por handleConteudoPeticao)
    const _docIdentEl = document.getElementById('processo-info-card')?.querySelector('[data-info="docIdent"] .card-val');
    const _docIdentRequerente = _docIdentEl?.textContent?.trim() || null;

    await processarPDFsPendentes(
        data.resultados,
        _S._auditoriaRequerente,
        _S._auditoriaCPF,
        _docIdentRequerente,
        atualizarItemAuditoria   // callback — domain notifica UI sem depender dela
    );

    // ── Instrumentação de tempo: marca o fim do processamento (OCR/análise) ──
    // Loga o parcial clique→processamento (útil para medir o tempo real de
    // OCR/análise). O total clique→salvar é fechado em salvarNoSheets.
    if (_S._auditT0 != null) {
        _S._auditTProcMs = performance.now();
        const _dtProc = (_S._auditTProcMs - _S._auditT0) / 1000;
        console.log(`[AuditJE][tempo] clique → processamento concluído: ${_dtProc.toFixed(1)}s · ${data.resultados.length} doc(s)`);
    }

    // Extrai campos do card a partir do RRC/Petição Inicial presentes nos resultados.
    // Roda para todos os tipos de auditoria, pois "Processo completo" e "Certidões"
    // também incluem o RRC em data.resultados (com _textoExtraido já populado).
    {
        const normSemArq = n => _norm(n.replace(/\([^)]+\)/g, ''));
        const rrc = data.resultados.find(r =>
            /\brrc\b|requerimento.*registro|registro.*candidatura/.test(normSemArq(r.nome))
        );
        const fonteIdent = rrc
            || data.resultados.find(r => /peticao.*inicial|inicial.*peticao/.test(normSemArq(r.nome)));

        // _textoExtraido: PDFs processados por processarPDFsPendentes
        // _textoAmostra:  documentos HTML (servidos diretamente pelo PJe) — fallback necessário
        // quando o RRC é HTML, processarPDFsPendentes o filtra e _textoExtraido nunca é definido
        const _textoFonte = r => r?._textoExtraido || r?._textoAmostra || '';

        if (_textoFonte(fonteIdent)) {
            const docIdent = _extrairDocIdentificacao(_textoFonte(fonteIdent));
            if (docIdent) atualizarInfoCardCandidato({ docIdentificacao: docIdent });
        }

        // Extrai todos os campos do RRC que ainda não foram preenchidos no card
        // Usa o RRC quando disponível; cai para fonteIdent (Petição Inicial) como fallback
        const fonteRRC = rrc || fonteIdent;
        const textoRRC = _textoFonte(fonteRRC);
        if (textoRRC) {
            const card = document.getElementById('processo-info-card');
            const getVal = (info) => card?.querySelector(`[data-info="${info}"] .card-val`)?.textContent?.trim();
            const camposRRC = {};
            // cargoComissao: tenta do RRC primeiro; se não achou, tenta da Petição Inicial
            if (!getVal('cargoComissao')) {
                camposRRC.cargoComissao = _extrairCargoComissao(_textoFonte(rrc))
                    ?? _extrairCargoComissao(_textoFonte(fonteIdent));
            }
            // Demais campos: cada um verificado individualmente para não sobrescrever o que já está no card
            if (!getVal('cargo'))        camposRRC.cargo                = _extrairCargo(textoRRC);
                                         camposRRC.numero               = _extrairNumeroUrna(textoRRC);
            if (!getVal('nomeUrna'))     camposRRC.nomeUrna             = _extrairNomeUrna(textoRRC);
            if (!getVal('ocupacao'))     camposRRC.ocupacao             = _extrairOcupacao(textoRRC);
            if (!getVal('ocupacaoComp')) camposRRC.ocupacaoComplementar = _extrairOcupacaoComplementar(textoRRC);
            if (!getVal('reeleicao'))    camposRRC.reeleicao            = _extrairReeleicao(textoRRC);
            if (!getVal('cargoEletivo')) camposRRC.cargoEletivo         = _extrairCargoEletivo(textoRRC);
            if (Object.values(camposRRC).some(Boolean))
                atualizarInfoCardCandidato(camposRRC);
        }
    }

    // ── Garante botão "👁 ver" em TODOS os documentos e registra dados nos caches ──
    for (const r of data.resultados) {
        // Registra URL de documentos HTML (certidões, sentenças…)
        if (r.tipo === 'html' && r._url) {
            _registrarPDF(r.id, null, r._url);
        }
        // Registra texto de documentos HTML para o botão "📋 ver texto"
        if (r.tipo === 'html' && r._textoAmostra) {
            _registrarTexto(r.id, r._textoAmostra);
        }
        // Garante que qualquer documento sem URL registrada possa ser buscado pelo ID
        if (!_pdfsCache[r.id] && !_htmlBase64Cache[r.id] && !_urlsCache[r.id]) {
            _registrarPDF(r.id, null, null); // content.js constrói a URL pelo ID
        }
        // Re-renderiza o item para garantir que o botão apareça
        atualizarItemAuditoria(r);
    }

    // Reordena linhas da tabela na ordem lógica de análise.
    // Docs. conhecidos seguem _ordemDocumento; empates (incluindo docs. sem categoria,
    // que retornam 99) são desempatados pelo ID numérico crescente.
    const listaAud = document.getElementById('auditoria-lista');
    if (listaAud) {
        const tbodyAud = listaAud.querySelector('tbody');
        if (tbodyAud) {
            Array.from(tbodyAud.querySelectorAll('tr'))
                .sort((a, b) => {
                    const nA = a.querySelector('td:nth-child(2)')?.textContent || '';
                    const nB = b.querySelector('td:nth-child(2)')?.textContent || '';
                    const oA = _ordemDocumento(nA);
                    const oB = _ordemDocumento(nB);
                    if (oA !== oB) return oA - oB;
                    // Empate → ID numérico crescente
                    return (parseInt(a.dataset.id, 10) || 0) - (parseInt(b.dataset.id, 10) || 0);
                })
                .forEach(row => tbodyAud.appendChild(row));
        }
    }

    // Resumo final
    if (progresso) {
        const total       = data.resultados.length;
        const ok          = data.resultados.filter(r => r.status === 'corresponde').length;
        const presente    = data.resultados.filter(r => r.status === 'presente').length;
        const nok         = data.resultados.filter(r => r.status === 'nao_corresponde').length;
        const semTexto    = data.resultados.filter(r => r.status === 'pdf_sem_texto').length;
        const inconclusivo = data.resultados.filter(r => r.status === 'inconclusivo').length;
        progresso.innerHTML = `<strong>Concluído:</strong> ${total} docs — ✅ ${ok} correspondem · ❌ ${nok} não correspondem · 📋 ${presente} verif. humana · ⚠️ ${inconclusivo} inconclusivos · 📄 ${semTexto} sem texto`;
        progresso.style.cssText = 'color:var(--text);font-size:14px;margin-bottom:8px;';
    }

    _S._auditoriaRodando = false;
    _S._auditoriaEhSeletiva = false;
    _releaseMutex(); // libera o mutex para a próxima chamada na fila

    const painel = document.getElementById('painel-auditoria');
    const _preAuto = _S._preanaliseAuto === true;
    _S._preanaliseAuto = false;

    if (_ehSeletiva) {
        // Auditoria seletiva: botão atualiza CAND preservando overrides
        const btnAtualizar = document.createElement('button');
        btnAtualizar.id = 'btn-finalizar-auditoria';
        btnAtualizar.className = 'btn-primary';
        btnAtualizar.style.cssText = 'width:100%;margin-top:10px;padding:10px 0;font-size:13px;font-weight:600;letter-spacing:0.03em;background:linear-gradient(135deg,#22c55e,#16a34a);';
        btnAtualizar.textContent = '✔ Confirmar e atualizar Relatório CAND';
        btnAtualizar.addEventListener('click', () => {
            btnAtualizar.remove();
            const resultadosMesclados = _S._auditoriaResultados;
            gerarRelatorioAuditoria(resultadosMesclados);
            const numAssoc = _S._processoAssociado || '';
            renderizarResumoArt27(resultadosMesclados, numAssoc);
            renderizarChecklistCAND(resultadosMesclados, numAssoc);
            salvarNoSheets(resultadosMesclados);
            _mostrarNotificacaoSheets('✅ CAND atualizado com os novos documentos');
            // Oculta badge de docs novos (já processados)
            const btnDN = document.getElementById('btn-docs-novos');
            if (btnDN) { btnDN.style.display = 'none'; btnDN._badge?.remove(); }
            painel.scrollTop = 999999;
        });
        painel.appendChild(btnAtualizar);
    } else if (!_S._dadosRecuperadosDoSheets) {
        // Botão de finalização normal
        const btnFinalizar = document.createElement('button');
        btnFinalizar.id = 'btn-finalizar-auditoria';
        btnFinalizar.className = 'btn-primary';
        btnFinalizar.style.cssText = 'width:100%;margin-top:10px;padding:10px 0;font-size:13px;font-weight:600;letter-spacing:0.03em;';
        btnFinalizar.textContent = '✔ Finalizar auditoria e gerar relatório CAND';
        btnFinalizar.addEventListener('click', () => {
            btnFinalizar.remove();
            _S._relatorioGerado = true;
            _S._dataAuditoria = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            gerarRelatorioAuditoria(data.resultados);
            solicitarProcessoAssociado().then(numeroAssociado => {
                if (numeroAssociado) _atualizarProcessoAssociadoNoCard(numeroAssociado);
                renderizarResumoArt27(data.resultados, numeroAssociado);
                renderizarChecklistCAND(data.resultados, numeroAssociado);
                salvarNoSheets(data.resultados);
            });
            painel.scrollTop = 999999;
        });
        painel.appendChild(btnFinalizar);
        if (_preAuto) btnFinalizar.click();
    }
    // Após reordenação, posiciona na primeira linha da tabela
    const primeiraLinha = listaAud?.querySelector('tbody tr');
    if (primeiraLinha) requestAnimationFrame(() =>
        primeiraLinha.scrollIntoView({ block: 'start', behavior: 'instant' })
    );
}

// ── Atualiza linha já renderizada na tabela ───────────────────────────────────
function atualizarItemAuditoria(r) {
    const lista = document.getElementById('auditoria-lista');
    if (!lista) return;
    const tr = lista.querySelector('[data-id="' + r.id + '"]');
    if (!tr) return;

    const { icon, text, color } = _statusStyle(r.status);
    const _borderColor = r._verificacao ? _verificacaoStyle(r._verificacao).color : color;

    // Atualiza borda esquerda
    tr.style.borderLeftColor = _borderColor;

    // ── Coluna: Verificação ───────────────────────────────────────────────────
    const tdVerif = tr.querySelector('[data-col="verificacao"]');
    if (tdVerif) {
        const vs = r._verificacao ? _verificacaoStyle(r._verificacao) : { icon, text, color };
        tdVerif.innerHTML = `${vs.icon} <span style="color:${vs.color};font-size:13px;">${vs.text}</span>`;
        if (r._avisoNome) {
            tdVerif.innerHTML += `<div style="font-size:11px;color:var(--warning);margin-top:3px;white-space:normal;">${_esc(r._avisoNome)}</div>`;
        }
    }

    // ── Coluna: Conteúdo ──────────────────────────────────────────────────────
    const tdConteudo = tr.querySelector('[data-col="conteudo"]');
    if (tdConteudo) {
        const cs = r._conteudo ? _conteudoStyle(r._conteudo) : null;
        if (cs) {
            tdConteudo.innerHTML = `${cs.icon} <span style="color:${cs.color};font-size:12px;">${cs.text}</span>`;
            if (r._avisoConteudo) {
                tdConteudo.innerHTML += `<div style="font-size:11px;color:var(--warning);margin-top:3px;white-space:normal;">${_esc(r._avisoConteudo)}</div>`;
            }
            if (r._notaQualif) {
                tdConteudo.innerHTML += `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;white-space:normal;">${_esc(r._notaQualif)}</div>`;
            }
        } else {
            tdConteudo.textContent = '—';
            tdConteudo.style.color = 'var(--text-muted)';
        }
    }

    // ── Coluna: Distribuição (NADA CONSTA / CONSTA + números) ────────────────
    const tdDist = tr.querySelector('[data-col="distribuicao"]');
    if (tdDist) {
        if (r._consta === 'NADA CONSTA') {
            tdDist.innerHTML = `<span style="color:var(--success);font-size:12px;font-weight:700;">✔ NADA CONSTA</span>`;
        } else if (r._consta === 'CONSTA') {
            const total = r._constaTotal ? ` · ${r._constaTotal} proc.` : '';
            tdDist.innerHTML = `<span style="color:var(--error);font-size:12px;font-weight:700;">⚠ CONSTA${total}</span>`;
            if (r._constaProcessos && r._constaProcessos.length > 0) {
                const nums = r._constaProcessos.slice(0, 3).map(_esc).join('<br>');
                const resto = r._constaProcessos.length > 3 ? `<br><em>+${r._constaProcessos.length - 3} outros</em>` : '';
                tdDist.innerHTML += `<div style="font-size:11px;color:var(--error);margin-top:3px;white-space:normal;text-align:left;">${nums}${resto}</div>`;
            }
        } else {
            tdDist.textContent = '—';
            tdDist.style.color = 'var(--text-muted)';
        }
    }

    // ── Coluna: Identificação do conteúdo (tipo OCR) ──────────────────────────
    const tdIdent = tr.querySelector('[data-col="identificacao"]');
    if (tdIdent) {
        if (r._tipoIdentificado && r._tipoIdentificado !== 'dispensado') {
            tdIdent.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">🔍 ${_esc(r._tipoIdentificado)}</span>`;
        } else {
            tdIdent.textContent = '—';
        }
    }

    // ── Coluna: Visualização Texto ────────────────────────────────────────────
    const tdTexto = tr.querySelector('[data-col="btn-texto"]');
    if (tdTexto) {
        tdTexto.innerHTML = '';
        if (r._textoExtraido) {
            const btn = document.createElement('button');
            btn.textContent = '📋';
            btn.title = 'Ver texto extraído';
            btn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;font-size:16px;padding:4px 10px;cursor:pointer;';
            btn.addEventListener('click', () => exibirTextoExtraido(r.id));
            tdTexto.appendChild(btn);
        } else if (r.status === 'presente' && r.tipo === 'humano') {
            // Identidade e escolaridade são verificadas visualmente — sem texto extraível
            const span = document.createElement('span');
            span.title = 'Documento visual — verifique pelo PDF';
            span.style.cssText = 'font-size:11px;color:var(--text-muted);';
            span.textContent = 'imagem';
            tdTexto.appendChild(span);
        }
    }

    // ── Coluna: Visualização PDF ──────────────────────────────────────────────
    const tdPDF = tr.querySelector('[data-col="btn-pdf"]');
    if (tdPDF) {
        tdPDF.innerHTML = '';
        const btn = document.createElement('button');
        btn.textContent = '👁';
        btn.title = 'Visualizar PDF';
        btn.style.cssText = 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:6px;font-size:16px;padding:4px 10px;cursor:pointer;';
        const urlDoc = r._url || _urlsCache[r.id] || null;
        btn.addEventListener('click', () => visualizarPDF(r.id, r.nome, urlDoc));
        tdPDF.appendChild(btn);
    }
    try { _preencherLeituraJE(tr, r); } catch (e) { /* noop */ }
}

// ── Mapa de textos extraídos por ID (para acesso no modal) ────────────────────
const _textosExtraidos = {};
// Mapa de PDFs base64 por ID (cache para o visualizador)
const _pdfsCache = {};
// Mapa de HTML base64 por ID (cache para o visualizador HTML)
const _htmlBase64Cache = {};
// Mapa de URLs por ID (para busca via content.js)
const _urlsCache = {};

function _registrarTexto(id, texto) {
    if (texto) _textosExtraidos[id] = texto;
}

function _registrarPDF(id, base64, url) {
    if (base64) _pdfsCache[id] = base64;
    if (url) _urlsCache[id] = url;
}

// ── Constrói a lista de documentos para navegação respeitando a ordem da tabela ─
// Lê os IDs das linhas da tabela (já reordenada por _ordemDocumento) e os mapeia
// de volta para os objetos de resultado. Inclui TODOS os documentos, inclusive
// os de verificação humana (identidade, escolaridade, etc.).
function _buildListaNavegacao() {
    if (!_S._auditoriaResultados) return [];
    const tbody = document.querySelector('#auditoria-lista tbody');
    if (tbody) {
        const idsOrdenados = Array.from(tbody.querySelectorAll('tr'))
            .map(tr => tr.dataset.id).filter(Boolean);
        const mapaRes = new Map(_S._auditoriaResultados.map(r => [r.id, r]));
        const ordenados = idsOrdenados.map(id => mapaRes.get(id)).filter(Boolean);
        if (ordenados.length > 0) return ordenados;
    }
    // Fallback: ordena pelo nome quando a tabela ainda não existe.
    // Empates (docs. sem categoria) são desempatados pelo ID numérico crescente.
    return [..._S._auditoriaResultados]
        .sort((a, b) => {
            const oA = _ordemDocumento(a.nome);
            const oB = _ordemDocumento(b.nome);
            if (oA !== oB) return oA - oB;
            return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
        });
}

// ── Solicita documento ao content.js e abre o visualizador adequado ──────────
// Funciona tanto para PDFs quanto para documentos HTML (certidões, sentenças…).
async function visualizarPDF(id, nome, url) {
    // Cache hit — PDF
    if (_pdfsCache[id]) {
        _abrirVisualizadorPDF(id, nome, _pdfsCache[id]);
        return;
    }
    // Cache hit — HTML
    if (_htmlBase64Cache[id]) {
        _abrirVisualizadorHTML(id, nome, _htmlBase64Cache[id]);
        return;
    }

    // Solicita ao content.js — passa a URL se disponível, senão o content.js
    // constrói automaticamente a partir do ID
    _S._postParent?.({
        source: 'chatje-iframe',
        type: 'REQUEST_PDF_BASE64',
        id,
        url: url || _urlsCache[id] || null
    });

    // Aguarda resposta (timeout 20s) — recebe base64 + mimeType
    const resp = await new Promise((resolve) => {
        const handler = (e) => {
            if (_PARENT_ORIGIN !== '*' && e.origin !== _PARENT_ORIGIN) return;
            if (e.data?.type === 'CHATJE_PDF_BASE64' && e.data.id === id) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve({ base64: e.data.base64, mimeType: e.data.mimeType || '' });
            }
        };
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve({ base64: null, mimeType: '' });
        }, 20000);
        window.addEventListener('message', handler);
    });

    if (!resp?.base64) {
        addSystemMessage(`⚠️ Não foi possível carregar o documento ${id}.`);
        return;
    }

    const { base64, mimeType } = resp;
    // Detecta HTML pelo mimeType devolvido pelo content.js
    const isHTML = mimeType.includes('html') || mimeType.includes('text/plain');

    if (isHTML) {
        _htmlBase64Cache[id] = base64;
        _abrirVisualizadorHTML(id, nome, base64);
    } else {
        _pdfsCache[id] = base64;
        _abrirVisualizadorPDF(id, nome, base64);
    }
}

// ── Modal visualizador de PDF usando PDF.js ───────────────────────────────────
// Renderiza todas as páginas empilhadas. Se o documento precisar de
// verificação/correção, exibe o formulário à direita do PDF.
async function _abrirVisualizadorPDF(id, nome, base64) {
    const anterior = document.getElementById('modal-pdf');
    if (anterior) anterior.remove();

    // Guarda a linha da tabela deste documento para reposicionar ao fechar
    const _trDoc = document.querySelector(`#auditoria-lista [data-id="${id}"]`);

    // Resultado associado a este documento (pode ser null)
    const r = _S._auditoriaResultados?.find(x => x.id === id) || null;
    // Formulário sempre disponível quando há resultado de auditoria (independente do status)
    const temFormulario = r !== null;

    const overlay = document.createElement('div');
    overlay.id = 'modal-pdf';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.85);
        display: flex; flex-direction: column;
        padding: 12px; gap: 8px;
    `;

    // ── Barra de identificação do requerente ───────────────────────────
    const _idBar = _barraIdentificacaoRequerente();
    if (_idBar) overlay.appendChild(_idBar);

    // ── Cabeçalho (nome do doc + rotação + páginas + fechar) ───────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    const titulo = document.createElement('span');
    titulo.style.cssText = 'font-size:11px;font-weight:600;color:#e2e8f0;font-family:"IBM Plex Mono",monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titulo.textContent = `📄 ${nome || id}`;

    const paginaInfo = document.createElement('span');
    paginaInfo.style.cssText = 'color:#94a3b8;font-size:11px;font-family:"IBM Plex Mono",monospace;white-space:nowrap;flex-shrink:0;';
    paginaInfo.textContent = 'Carregando…';

    // Botões de zoom
    const _btnStyle = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:8px;font-size:14px;padding:8px 14px;cursor:pointer;flex-shrink:0;font-weight:600;';
    const btnZoomMenos = document.createElement('button');
    btnZoomMenos.textContent = '− Zoom';
    btnZoomMenos.title = 'Diminuir zoom';
    btnZoomMenos.style.cssText = _btnStyle;

    const btnZoomMais = document.createElement('button');
    btnZoomMais.textContent = '+ Zoom';
    btnZoomMais.title = 'Aumentar zoom';
    btnZoomMais.style.cssText = _btnStyle;

    // Navegação entre documentos — usa a ordem da tabela (já reordenada)
    // e inclui TODOS os documentos, inclusive os de verificação humana
    const { btnAnterior, btnProximo, btnFechar } = _navegacaoVisualizador(id, overlay, _trDoc);

    const btnRotacionar = document.createElement('button');
    btnRotacionar.textContent = '↻ Girar';
    btnRotacionar.title = 'Girar 90° no sentido horário';
    btnRotacionar.style.cssText = _btnStyle;

    header.appendChild(titulo);
    header.appendChild(btnZoomMenos);
    header.appendChild(paginaInfo);
    header.appendChild(btnZoomMais);
    header.appendChild(btnAnterior);
    header.appendChild(btnProximo);
    header.appendChild(btnRotacionar);
    header.appendChild(btnFechar);

    // ── Corpo: PDF + formulário lateral ────────────────────────────────
    const corpo = document.createElement('div');
    corpo.style.cssText = `display:flex;flex:1;gap:12px;min-height:0;`;

    const pagesContainer = document.createElement('div');
    pagesContainer.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:8px;background:#1e2335;border-radius:8px;padding:12px 8px;min-width:0;';
    corpo.appendChild(pagesContainer);

    if (temFormulario) corpo.appendChild(_colunaFormularioVerificacao(r, overlay));

    overlay.appendChild(header);
    overlay.appendChild(corpo);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // ── Carrega e renderiza ────────────────────────────────────────────
    let rotacao = 0;    // 0 | 90 | 180 | 270
    let zoomFactor = 1.0; // fator de zoom aplicado sobre a escala base

    try {
        const pdfjsLib = await _getPDFjsParaVisualizador();
        if (!pdfjsLib) { paginaInfo.textContent = '⚠️ PDF.js não disponível'; return; }

        const pdfBytes = _b64ToUint8Array(base64);
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        paginaInfo.textContent = `${pdf.numPages} página${pdf.numPages !== 1 ? 's' : ''}`;

        // renderizarTodas declarada aqui para ter acesso a `pdf` via closure
        const renderizarTodas = async () => {
            pagesContainer.innerHTML = '';
            const largura = pagesContainer.clientWidth - 24;
            for (let num = 1; num <= pdf.numPages; num++) {
                const page  = await pdf.getPage(num);
                const vp0   = page.getViewport({ scale: 1, rotation: rotacao });
                const escalaBase = Math.min(largura / vp0.width, 1.2);
                const escala = escalaBase * zoomFactor;
                const vp    = page.getViewport({ scale: escala, rotation: rotacao });

                const canvas = document.createElement('canvas');
                canvas.width  = vp.width;
                canvas.height = vp.height;
                canvas.style.cssText = 'max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.5);border-radius:2px;flex-shrink:0;';

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                pagesContainer.appendChild(canvas);
            }
        };

        const _reRenderizar = async (btnBloqueado, txtOriginal, txtCarregando) => {
            btnBloqueado.disabled = true;
            btnBloqueado.textContent = txtCarregando;
            await renderizarTodas();
            btnBloqueado.disabled = false;
            btnBloqueado.textContent = txtOriginal;
        };

        btnRotacionar.addEventListener('click', async () => {
            rotacao = (rotacao + 90) % 360;
            await _reRenderizar(btnRotacionar, '↻ Girar', '…');
        });

        btnZoomMais.addEventListener('click', async () => {
            zoomFactor = Math.min(zoomFactor + 0.25, 4.0);
            await _reRenderizar(btnZoomMais, '+ Zoom', '…');
        });

        btnZoomMenos.addEventListener('click', async () => {
            zoomFactor = Math.max(zoomFactor - 0.25, 0.25);
            await _reRenderizar(btnZoomMenos, '− Zoom', '…');
        });

        await renderizarTodas();

    } catch (e) {
        paginaInfo.textContent = '⚠️ Erro ao renderizar PDF';
        console.warn('[visualizador] Erro PDF.js:', e.message);
    }
}

// ── Modal visualizador de documento HTML ─────────────────────────────────────
// Exibe certidões, sentenças e outros documentos servidos como HTML pelo PJe.
function _abrirVisualizadorHTML(id, nome, htmlBase64) {
    const anterior = document.getElementById('modal-pdf');
    if (anterior) anterior.remove();

    const _trDoc = document.querySelector(`#auditoria-lista [data-id="${id}"]`);
    const r = _S._auditoriaResultados?.find(x => x.id === id) || null;
    const temFormulario = r !== null;

    const overlay = document.createElement('div');
    overlay.id = 'modal-pdf';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.85);
        display: flex; flex-direction: column;
        padding: 12px; gap: 8px;
    `;

    // ── Barra de identificação do requerente ──────────────────────────────
    const _idBar = _barraIdentificacaoRequerente();
    if (_idBar) overlay.appendChild(_idBar);

    // ── Cabeçalho ─────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    const _btnStyle = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:8px;font-size:14px;padding:8px 14px;cursor:pointer;flex-shrink:0;font-weight:600;';

    const titulo = document.createElement('span');
    titulo.style.cssText = 'font-size:11px;font-weight:600;color:#e2e8f0;font-family:"IBM Plex Mono",monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titulo.textContent = `🌐 ${nome || id}`;

    // Navegação — mesma lógica do visualizador PDF
    const { btnAnterior, btnProximo, btnFechar } = _navegacaoVisualizador(id, overlay, _trDoc);

    header.appendChild(titulo);
    header.appendChild(btnAnterior);
    header.appendChild(btnProximo);
    header.appendChild(btnFechar);

    // ── Corpo: iframe HTML + formulário lateral ───────────────────────────
    const corpo = document.createElement('div');
    corpo.style.cssText = 'display:flex;flex:1;gap:12px;min-height:0;';

    const iframeWrap = document.createElement('div');
    iframeWrap.style.cssText = 'flex:1;overflow:hidden;border-radius:8px;background:#ffffff;min-width:0;';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');

    try {
        // Decodifica base64 → HTML com detecção de charset
        const raw = atob(htmlBase64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        // Detecta charset declarado no HTML (ex: charset=iso-8859-1)
        const sniff = raw.substring(0, 2000);
        const csMatch = sniff.match(/charset=["']?([\w-]+)/i);
        const charset = csMatch?.[1] || 'utf-8';
        const htmlText = new TextDecoder(charset).decode(bytes);
        iframe.srcdoc = htmlText;
    } catch (e) {
        iframe.srcdoc = '<p style="font-family:sans-serif;padding:20px;color:red">Erro ao decodificar documento HTML.</p>';
    }

    iframeWrap.appendChild(iframe);
    corpo.appendChild(iframeWrap);

    if (temFormulario) corpo.appendChild(_colunaFormularioVerificacao(r, overlay));

    overlay.appendChild(header);
    overlay.appendChild(corpo);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Reutiliza a instância do PDF.js já carregada pelo pdfextract.js
async function _getPDFjsParaVisualizador() {
    // _getPDFjs já está definido no pdfextract.js e retorna a instância lazy
    if (typeof _getPDFjs === 'function') return await _getPDFjs();
    return null;
}

// Converte base64 para Uint8Array (reutiliza se disponível no pdfextract.js)
function _b64ToUint8Array(base64) {
    if (typeof _b64ToUint8 === 'function') return _b64ToUint8(base64);
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

// ── Modal de visualização do texto extraído ───────────────────────────────────
function exibirTextoExtraido(id) {
    const texto = _textosExtraidos[id];
    if (!texto) { addSystemMessage('⚠️ Texto não disponível para este documento.'); return; }

    // Remove modal anterior se existir
    const anterior = document.getElementById('modal-texto');
    if (anterior) anterior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-texto';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        width: 100%; max-width: 560px;
        max-height: 80vh;
        display: flex; flex-direction: column;
        overflow: hidden;
    `;

    // Cabeçalho
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0;';

    const headerTitle = document.createElement('span');
    headerTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--accent);font-family:"IBM Plex Mono",monospace;';
    headerTitle.textContent = `📋 TEXTO EXTRAÍDO — ${id}`;

    const btnFechar = document.createElement('button');
    btnFechar.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 4px;';
    btnFechar.textContent = '✕';
    btnFechar.addEventListener('click', () => overlay.remove());

    header.appendChild(headerTitle);
    header.appendChild(btnFechar);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface2);';

    const info = document.createElement('span');
    info.style.cssText = 'font-size:10px;color:var(--text-muted);flex:1;';
    info.textContent = `${texto.length} caracteres extraídos`;

    const btnCopiar = document.createElement('button');
    btnCopiar.style.cssText = 'background:var(--accent);border:none;color:white;border-radius:6px;font-size:11px;padding:4px 10px;cursor:pointer;';
    btnCopiar.textContent = '📋 Copiar texto';
    btnCopiar.addEventListener('click', () => {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
        btnCopiar.textContent = ok ? '✅ Copiado!' : '⚠️ Falhou';
        setTimeout(() => { btnCopiar.textContent = '📋 Copiar texto'; }, 2500);
    });

    toolbar.appendChild(info);
    toolbar.appendChild(btnCopiar);

    // Área de texto
    const pre = document.createElement('pre');
    pre.style.cssText = `
        flex: 1; overflow-y: auto; margin: 0;
        padding: 14px; font-family: 'IBM Plex Mono', monospace;
        font-size: 11px; line-height: 1.7; color: var(--text);
        white-space: pre-wrap; word-break: break-word;
        background: var(--bg);
    `;
    pre.textContent = texto;

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(pre);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Fecha ao clicar fora do modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ── Lista unificada de opções para formulários de correção/verificação ──────────
// ── Saúde da extração: marcar equívoco de leitura do AuditJE (por documento) ──
// Feature aditiva (HANDOFF_SAUDE_EXTRACAO). Ortogonal ao resultado: NÃO altera status/veredito.
function _garantirCssSaude() {
    if (document.getElementById('ajse-css')) return;
    var st = document.createElement('style');
    st.id = 'ajse-css';
    st.textContent = [
        '.ajse-ok{font-size:11px;color:#6ee7b7;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer}',
        '.ajse-ok .d{width:7px;height:7px;border-radius:50%;background:#34d399}',
        '.ajse-flag{font-size:10.5px;font-weight:600;color:#9fb0cc;background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 9px;cursor:pointer;white-space:nowrap}',
        '.ajse-flag:hover{border-color:#f87171;color:#fca5a5}',
        '.ajse-flag.on{border-color:#f87171;color:#fca5a5;background:#3a1620}',
        '.ajse-rep{background:var(--surface2);border:1px solid #3a1620;border-left:3px solid #f87171;border-radius:8px;padding:11px 13px;margin:2px 0}',
        '.ajse-rep .h{font-size:11.5px;font-weight:700;color:#fca5a5;margin-bottom:8px}',
        '.ajse-rep .lbl{font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin:8px 0 5px}',
        '.ajse-cats{display:flex;gap:6px;flex-wrap:wrap}',
        '.ajse-cat{font-size:10.5px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer}',
        '.ajse-cat.on{border-color:#fbbf24;background:#2c2410;color:#fcd34d;font-weight:700}',
        '.ajse-rep .grid{display:flex;gap:10px;margin-top:9px;flex-wrap:wrap}',
        '.ajse-rep .fld{flex:1;min-width:180px}',
        '.ajse-rep input{width:100%;background:#0c1526;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11.5px;padding:6px 8px;box-sizing:border-box}',
        '.ajse-rep .act{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}',
        '.ajse-rep .save{font-size:11px;font-weight:700;color:#1a0f00;background:#fbbf24;border:0;border-radius:6px;padding:6px 14px;cursor:pointer}',
        '.ajse-rep .cancel{font-size:11px;color:var(--text-muted);background:transparent;border:1px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer}',
        '.ajse-rep .tr{font-size:10px;color:var(--text-muted)}',
        '.ajse-strip{display:flex;align-items:center;gap:14px;padding:9px 12px;margin-bottom:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;flex-wrap:wrap}',
        '.ajse-strip .n{font-size:20px;font-weight:800;color:var(--text);line-height:1}',
        '.ajse-strip .u{font-size:10.5px;color:var(--text-muted);line-height:1.2}',
        '.ajse-strip .chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text)}',
        '.ajse-strip .chip .d{width:7px;height:7px;border-radius:50%}'
    ].join('');
    document.head.appendChild(st);
}
function _categoriasEquivoco() {
    return [
        { k: 'tipo_errado',         t: 'Tipo do documento errado' },
        { k: 'resultado_errado',    t: 'Resultado (consta/nada consta)' },
        { k: 'dado_nao_lido',       t: 'Dado não lido (CPF/nome/filiação)' },
        { k: 'legibilidade_errada', t: 'Legibilidade mal avaliada' },
        { k: 'nao_reconhecido',     t: 'Documento não reconhecido' }
    ];
}
function _atualizarStripSaude() {
    var el = document.getElementById('ajse-strip');
    if (!el) return;
    var res = (typeof _S !== 'undefined' && _S._auditoriaResultados) || [];
    var total = res.length;
    if (!total) { el.style.display = 'none'; return; }
    var equiv = 0;
    for (var i = 0; i < res.length; i++) if (res[i] && res[i]._equivocoLeitura) equiv++;
    var conf = total - equiv;
    el.style.display = 'flex';
    el.innerHTML =
        '<span class="n">' + conf + '/' + total + '</span>'
      + '<span class="u">leituras<br>confirmadas</span>'
      + '<span class="chip"><span class="d" style="background:#34d399"></span>' + conf + ' confirmadas</span>'
      + '<span class="chip"><span class="d" style="background:#f87171"></span>' + equiv + (equiv === 1 ? ' equívoco reportado' : ' equívocos reportados') + '</span>'
      + '<span style="flex:1"></span>'
      + '<span class="u" style="max-width:280px">Marque quando o AuditJE leu/classificou errado (não é o mérito do documento). Alimenta a Saúde da extração.</span>';
}
function _preencherLeituraJE(tr, r) {
    _garantirCssSaude();
    var td = tr.querySelector('[data-col="leitura-je"]');
    if (!td) return;
    td.innerHTML = '';
    if (r._equivocoLeitura) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ajse-flag on';
        btn.textContent = '⚑ leitura errada';
        btn.title = 'Equívoco de leitura reportado — clique para revisar';
        btn.addEventListener('click', function () { _reportarEquivocoLeitura(r, tr); });
        td.appendChild(btn);
    } else {
        var ok = document.createElement('span');
        ok.className = 'ajse-ok';
        ok.innerHTML = '<span class="d"></span>leitura confirmada';
        ok.title = 'A ferramenta leu certo. Clique para reportar um equívoco de leitura.';
        ok.addEventListener('click', function () { _reportarEquivocoLeitura(r, tr); });
        td.appendChild(ok);
    }
    try { _atualizarStripSaude(); } catch (e) { /* noop */ }
}
function _reportarEquivocoLeitura(r, tr) {
    _garantirCssSaude();
    var jaAberto = document.getElementById('ajse-rep-' + r.id);
    if (jaAberto) { jaAberto.remove(); return; }
    var cats = _categoriasEquivoco();
    var atual = r._equivocoLeitura || {};
    var selecionada = atual.categoria || '';
    var repTr = document.createElement('tr');
    repTr.id = 'ajse-rep-' + r.id;
    var td = document.createElement('td');
    td.colSpan = 9;
    td.style.cssText = 'padding:0 10px 8px;border-bottom:1px solid var(--border);';
    var btnRemover = r._equivocoLeitura ? '<button class="cancel ajse-limpar" type="button">Remover equívoco</button>' : '';
    td.innerHTML =
        '<div class="ajse-rep">'
      +   '<div class="h">⚑ Reportar equívoco de leitura do AuditJE</div>'
      +   '<div class="lbl">O que a ferramenta errou?</div>'
      +   '<div class="ajse-cats"></div>'
      +   '<div class="grid">'
      +     '<div class="fld"><div class="lbl" style="margin-top:0">Valor correto (opcional)</div><input class="ajse-val" type="text"></div>'
      +     '<div class="fld"><div class="lbl" style="margin-top:0">Observação (opcional)</div><input class="ajse-obs" type="text" placeholder="ex.: OCR não pegou o cabeçalho da certidão"></div>'
      +   '</div>'
      +   '<div class="act">'
      +     '<button class="save" type="button">Registrar equívoco</button>'
      +     '<button class="cancel" type="button">Cancelar</button>'
      +     btnRemover
      +     '<span class="tr">↳ vai para a trilha (quem · quando · categoria · valor correto) e conta na Saúde da extração</span>'
      +   '</div>'
      + '</div>';
    repTr.appendChild(td);
    tr.insertAdjacentElement('afterend', repTr);
    var catsEl = td.querySelector('.ajse-cats');
    for (var i = 0; i < cats.length; i++) {
        (function (c) {
            var chip = document.createElement('span');
            chip.className = 'ajse-cat' + (c.k === selecionada ? ' on' : '');
            chip.textContent = c.t;
            chip.setAttribute('data-k', c.k);
            chip.addEventListener('click', function () {
                selecionada = c.k;
                var all = catsEl.querySelectorAll('.ajse-cat');
                for (var j = 0; j < all.length; j++) all[j].classList.toggle('on', all[j].getAttribute('data-k') === selecionada);
            });
            catsEl.appendChild(chip);
        })(cats[i]);
    }
    var valEl = td.querySelector('.ajse-val');
    var obsEl = td.querySelector('.ajse-obs');
    if (atual.valorCorreto) valEl.value = atual.valorCorreto;
    if (atual.obs) obsEl.value = atual.obs;
    td.querySelector('.cancel').addEventListener('click', function () { repTr.remove(); });
    var limpar = td.querySelector('.ajse-limpar');
    if (limpar) limpar.addEventListener('click', function () {
        delete r._equivocoLeitura;
        _persistirSaude();
        repTr.remove();
        _preencherLeituraJE(tr, r);
    });
    td.querySelector('.save').addEventListener('click', function () {
        if (!selecionada) { catsEl.style.outline = '1px solid #f87171'; catsEl.style.outlineOffset = '3px'; return; }
        r._equivocoLeitura = {
            categoria: selecionada,
            valorCorreto: (valEl.value || '').trim(),
            obs: (obsEl.value || '').trim(),
            servidor: (typeof _S !== 'undefined' && _S._servidorResponsavel) || '',
            ts: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        };
        _persistirSaude();
        repTr.remove();
        _preencherLeituraJE(tr, r);
    });
}
function _persistirSaude() {
    try {
        if (typeof _S !== 'undefined' && _S._auditoriaResultados && typeof salvarNoSheets === 'function') salvarNoSheets(_S._auditoriaResultados);
    } catch (e) { /* noop */ }
}
function _opcoesVerificacao() {
    return [
        { valor: 'corresponde',         label: '✅ Corresponde' },
        { valor: 'nomenclatura_errada', label: '📝 Nomenclatura errada no PJe' },
        { valor: 'pessoa_errada',       label: '❌ Pessoa errada / homonímia' },
        { valor: 'humano',              label: '👤 Verificação humana necessária' },
        { valor: 'nao_apresentado',     label: '⛔ Não apresentado' },
        { valor: 'inconclusivo',        label: '⚠️ Inconclusivo' },
    ];
}

function _opcoesConteudo() {
    return [
        { valor: 'completo',            label: '✅ Completo e legível' },
        { valor: 'incompleto',          label: '⚠️ Incompleto (campo ausente)' },
        { valor: 'ilegivel',            label: '⚠️ Ilegível' },
        { valor: 'incompleto_ilegivel', label: '⚠️ Incompleto e ilegível' },
        { valor: 'sem_texto',           label: '📄 Sem texto extraível' },
    ];
}

// Keep _opcoesCorrecao() as legacy alias returning combined options for backwards compat
function _opcoesCorrecao() {
    return [
        { valor: 'corresponde',                         label: '✅ Corresponde — completo e legível',    _verificacao: 'corresponde',         _conteudo: 'completo'            },
        { valor: 'corresponde_incompleto',              label: '✅ Corresponde — incompleto',            _verificacao: 'corresponde',         _conteudo: 'incompleto'           },
        { valor: 'corresponde_ilegivel',                label: '✅ Corresponde — ilegível',             _verificacao: 'corresponde',         _conteudo: 'ilegivel'             },
        { valor: 'corresponde_incompleto_ilegivel',     label: '✅ Corresponde — incompleto e ilegível', _verificacao: 'corresponde',         _conteudo: 'incompleto_ilegivel'  },
        { valor: 'nomenclatura_errada',                 label: '📝 Nomenclatura errada — completo',     _verificacao: 'nomenclatura_errada', _conteudo: 'completo'            },
        { valor: 'nomenclatura_errada_incompleto',      label: '📝 Nomenclatura errada — incompleto',   _verificacao: 'nomenclatura_errada', _conteudo: 'incompleto'           },
        { valor: 'nomenclatura_errada_ilegivel',        label: '📝 Nomenclatura errada — ilegível',    _verificacao: 'nomenclatura_errada', _conteudo: 'ilegivel'             },
        { valor: 'pessoa_errada',                       label: '❌ Pessoa errada — documento de outro',  _verificacao: 'pessoa_errada',       _conteudo: 'completo'            },
        { valor: 'pessoa_errada_ilegivel',              label: '❌ Pessoa errada — ilegível',           _verificacao: 'pessoa_errada',       _conteudo: 'ilegivel'             },
        { valor: 'nao_apresentado',                     label: '⛔ Não apresentado',                    _verificacao: 'nao_apresentado',     _conteudo: null                  },
    ];
}

// ── Deriva o status legado a partir dos novos campos _verificacao + _conteudo ──
function _derivarStatus(r) {
    const v = r._verificacao;
    const c = r._conteudo;
    if (!v) return r.status || 'erro';
    if (v === 'humano')         return 'presente';
    if (v === 'sem_conteudo')   return 'sem_conteudo';
    if (v === 'erro')           return 'erro';
    if (v === 'nao_apresentado') return 'nao_apresentado';
    if (v === 'inconclusivo') {
        if (c === 'sem_texto') return 'pdf_sem_texto';
        if (c === 'ilegivel')  return 'nao_corresponde_ilegivel';
        return 'inconclusivo';
    }
    if (v === 'pessoa_errada') {
        if (c === 'ilegivel')            return 'nao_corresponde_ilegivel';
        if (c === 'incompleto')          return 'nao_corresponde_incompleto';
        if (c === 'incompleto_ilegivel') return 'nao_corresponde_incompleto_ilegivel';
        return 'nao_corresponde';
    }
    if (v === 'nomenclatura_errada') {
        if (c === 'sem_texto') return 'pdf_sem_texto';
        if (c === 'ilegivel')  return 'nomenclatura_errada_ilegivel';
        if (c === 'incompleto') return 'nomenclatura_errada_incompleto';
        return 'nomenclatura_errada';
    }
    if (v === 'corresponde_nao_adequada') {
        if (c === 'sem_texto')           return 'pdf_sem_texto';
        if (c === 'ilegivel')            return 'corresponde_nao_adequada_ilegivel';
        if (c === 'incompleto')          return 'corresponde_nao_adequada_incompleto';
        if (c === 'incompleto_ilegivel') return 'corresponde_nao_adequada_incompleto_ilegivel';
        return 'corresponde_nao_adequada';
    }
    // nao_corresponde direto (ex: certidão federal sem "para fins eleitorais")
    if (v === 'nao_corresponde') return 'nao_corresponde';
    // corresponde
    if (c === 'sem_texto')            return 'pdf_sem_texto';
    if (c === 'ilegivel')             return 'corresponde_ilegivel';
    if (c === 'incompleto')           return 'corresponde_incompleto';
    if (c === 'incompleto_ilegivel')  return 'corresponde_incompleto_ilegivel';
    return 'corresponde';
}

// ── Retorna style para a coluna Verificação ───────────────────────────────────
function _verificacaoStyle(v) {
    const map = {
        corresponde:              { icon: '✅', text: 'Corresponde',              color: 'var(--success)'   },
        corresponde_nao_adequada: { icon: '⚠️', text: 'Corresponde - Não adequada', color: 'var(--warning)'   },
        nomenclatura_errada:      { icon: '📝', text: 'Nomenclatura errada',        color: 'var(--warning)'   },
        pessoa_errada:            { icon: '❌', text: 'Pessoa errada',               color: 'var(--error)'     },
        humano:              { icon: '👤', text: 'Verificação humana',     color: 'var(--accent)'    },
        inconclusivo:        { icon: '⚠️', text: 'Inconclusivo',           color: 'var(--warning)'   },
        sem_conteudo:        { icon: '📭', text: 'Sem conteúdo',           color: 'var(--text-muted)'},
        erro:                { icon: '🚫', text: 'Erro',                   color: 'var(--error)'     },
        nao_apresentado:     { icon: '⛔', text: 'Não apresentado',        color: 'var(--error)'     },
    };
    return map[v] || { icon: '❓', text: v || '—', color: 'var(--text-muted)' };
}

// ── Retorna style para a coluna Conteúdo ─────────────────────────────────────
function _conteudoStyle(c) {
    const map = {
        completo:            { icon: '✅', text: 'Completo e legível',     color: 'var(--success)'   },
        incompleto:          { icon: '⚠️', text: 'Incompleto',             color: 'var(--warning)'   },
        ilegivel:            { icon: '⚠️', text: 'Ilegível',              color: 'var(--warning)'   },
        incompleto_ilegivel: { icon: '⚠️', text: 'Incompleto e ilegível', color: 'var(--warning)'   },
        sem_texto:           { icon: '📄', text: 'Sem texto',              color: 'var(--text-muted)'},
    };
    return map[c] || null;
}

// eCertidaoNominalEfetiva está definida em domain/analysis.js (Shared Kernel do iframe).
// Removida daqui para eliminar duplicata — a versão do domain já está no escopo global.

// ── Mapeamento de status para ícone/texto/cor ─────────────────────────────────
function _statusStyle(status) {
    const icon  = {
        presente:'📋', corresponde:'✅', nao_corresponde:'❌', nao_apresentado:'⛔',
        inconclusivo:'⚠️', pdf_sem_texto:'📄', pdf_pendente:'⏳', sem_conteudo:'📭', erro:'🚫',
        corresponde_incompleto:'⚠️', corresponde_ilegivel:'⚠️', corresponde_incompleto_ilegivel:'⚠️',
        nao_corresponde_incompleto:'❌', nao_corresponde_ilegivel:'❌', nao_corresponde_incompleto_ilegivel:'❌',
        nomenclatura_errada:'📝', nomenclatura_errada_incompleto:'📝', nomenclatura_errada_ilegivel:'📝',
        corresponde_nao_adequada:'⚠️', corresponde_nao_adequada_incompleto:'⚠️', corresponde_nao_adequada_ilegivel:'⚠️', corresponde_nao_adequada_incompleto_ilegivel:'⚠️',
        timeout:'⏱️', dispensado:'—',
    }[status] || '❓';
    const text  = {
        presente:'presente (verif. humana)',
        corresponde:'corresponde — completo e legível',
        corresponde_incompleto:'corresponde — incompleto',
        corresponde_ilegivel:'corresponde — ilegível',
        corresponde_incompleto_ilegivel:'corresponde — incompleto e ilegível',
        nao_corresponde:'não corresponde — completo e legível',
        nao_corresponde_incompleto:'não corresponde — incompleto',
        nao_corresponde_ilegivel:'não corresponde — ilegível',
        nao_corresponde_incompleto_ilegivel:'não corresponde — incompleto e ilegível',
        nao_apresentado:'não apresentado',
        inconclusivo:'inconclusivo', pdf_sem_texto:'PDF sem texto (verif. manual)',
        pdf_pendente:'extraindo texto...', sem_conteudo:'sem conteúdo', erro:'erro',
        timeout:'tempo esgotado (verificar manualmente)', dispensado:'dispensado',
        nomenclatura_errada:'nomenclatura errada — completo e legível',
        nomenclatura_errada_incompleto:'nomenclatura errada — incompleto',
        nomenclatura_errada_ilegivel:'nomenclatura errada — ilegível',
        corresponde_nao_adequada:'Corresponde — Não adequada',
        corresponde_nao_adequada_incompleto:'Corresponde — Não adequada — incompleto',
        corresponde_nao_adequada_ilegivel:'Corresponde — Não adequada — ilegível',
        corresponde_nao_adequada_incompleto_ilegivel:'Corresponde — Não adequada — incompleto e ilegível',
    }[status] || status;
    const color = {
        presente:'var(--accent)',
        corresponde:'var(--success)',
        corresponde_incompleto:'var(--warning)', corresponde_ilegivel:'var(--warning)', corresponde_incompleto_ilegivel:'var(--warning)',
        nao_corresponde:'var(--error)', nao_corresponde_incompleto:'var(--error)',
        nao_corresponde_ilegivel:'var(--error)', nao_corresponde_incompleto_ilegivel:'var(--error)',
        nao_apresentado:'var(--error)',
        inconclusivo:'var(--warning)', pdf_sem_texto:'var(--text-muted)',
        pdf_pendente:'var(--warning)', sem_conteudo:'var(--text-muted)', erro:'var(--error)',
        timeout:'var(--warning)', dispensado:'var(--text-muted)',
        nomenclatura_errada:'var(--warning)', nomenclatura_errada_incompleto:'var(--warning)', nomenclatura_errada_ilegivel:'var(--warning)',
        corresponde_nao_adequada:'var(--warning)', corresponde_nao_adequada_incompleto:'var(--warning)', corresponde_nao_adequada_ilegivel:'var(--warning)', corresponde_nao_adequada_incompleto_ilegivel:'var(--warning)',
    }[status] || 'var(--text-muted)';
    return { icon, text, color };
}


// _barraIdentificacaoRequerente — barra Requerente/CPF/Doc. de identificação,
// compartilhada pelos visualizadores de PDF e HTML. Retorna o elemento ou null.
function _barraIdentificacaoRequerente() {
    if (!(infoProcesso?.requerente || infoProcesso?.cpf)) return null;
    const infoBar = document.createElement('div');
    infoBar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:24px;flex-shrink:0;background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px;padding:8px 16px;flex-wrap:wrap;';
    const addInfo = (label, value) => {
        if (!value) return;
        const wrap = document.createElement('span');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
        wrap.innerHTML = `<span style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#4a5a7a;">${label}</span>`
                       + `<span style="font-size:15px;font-weight:700;color:#e2e8f0;letter-spacing:0.01em;">${value}</span>`;
        infoBar.appendChild(wrap);
    };
    addInfo('Requerente', infoProcesso.requerente);
    addInfo('CPF', infoProcesso.cpf);
    const docIdentEl = document.getElementById('processo-info-card')?.querySelector('[data-info="docIdent"] .card-val');
    addInfo('Doc. de identificação', docIdentEl?.textContent?.trim() || null);
    return infoBar;
}

// _navegacaoVisualizador — botões ◀ Anterior / Próximo ▶ / ✕ Fechar compartilhados
// pelos visualizadores de PDF e HTML (mesma lógica: reabre via visualizarPDF, que
// roteia por mime). Retorna { btnAnterior, btnProximo, btnFechar }.
function _navegacaoVisualizador(id, overlay, trDoc) {
    const _btnStyle = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:8px;font-size:14px;padding:8px 14px;cursor:pointer;flex-shrink:0;font-weight:600;';
    const lista = _buildListaNavegacao();
    const idx = lista.findIndex(x => x.id === id);
    const btnAnterior = document.createElement('button');
    btnAnterior.textContent = '◀ Anterior';
    btnAnterior.title = 'Documento anterior';
    btnAnterior.style.cssText = _btnStyle;
    btnAnterior.style.opacity = idx <= 0 ? '0.3' : '1';
    btnAnterior.disabled = idx <= 0;
    const btnProximo = document.createElement('button');
    btnProximo.textContent = 'Próximo ▶';
    btnProximo.title = 'Próximo documento';
    btnProximo.style.cssText = _btnStyle;
    btnProximo.style.opacity = idx < 0 || idx >= lista.length - 1 ? '0.3' : '1';
    btnProximo.disabled = idx < 0 || idx >= lista.length - 1;
    const _navegar = (novoIdx) => {
        if (novoIdx < 0 || novoIdx >= lista.length) return;
        const doc = lista[novoIdx];
        overlay.remove();
        visualizarPDF(doc.id, doc.nome, doc._url || _urlsCache[doc.id] || null);
    };
    btnAnterior.addEventListener('click', () => _navegar(idx - 1));
    btnProximo.addEventListener('click', () => _navegar(idx + 1));
    const btnFechar = document.createElement('button');
    btnFechar.textContent = '✕ Fechar';
    btnFechar.style.cssText = 'background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;border-radius:8px;font-size:14px;padding:8px 18px;cursor:pointer;flex-shrink:0;font-weight:600;';
    btnFechar.addEventListener('click', () => {
        overlay.remove();
        if (trDoc) requestAnimationFrame(() =>
            trDoc.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        );
    });
    return { btnAnterior, btnProximo, btnFechar };
}

// _colunaFormularioVerificacao — coluna lateral (280px) com o formulário de
// verificação/correção, compartilhada pelos visualizadores de PDF e HTML.
function _colunaFormularioVerificacao(r, overlay) {
    const formCol = document.createElement('div');
    formCol.style.cssText = 'width:280px;flex-shrink:0;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:6px;';
    formCol.appendChild(_criarFormularioExpansao(r, () => overlay.remove()));
    return formCol;
}
