// tarefas.js — Módulo Tarefas (modo Servidor) e Módulo Chefe
// Depende de: config.js

// ═════════════════════════════════════════════════════════════════════════════
// MÓDULO TAREFAS — Modo Servidor
// ═════════════════════════════════════════════════════════════════════════════

// ── Helper: POST de ação para o Apps Script ──────────────────────────────────
async function _apiTarefa(payload) {
    const url = _S._sheetsUrl;
    if (!url) return null;
    try {
        const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        return await r.json().catch(() => null);
    } catch { return null; }
}

// ── Helper: GET de tarefas ────────────────────────────────────────────────────
async function _fetchTarefas(params = {}) {
    const url = _S._sheetsUrl;
    if (!url) return [];
    try {
        const qs = new URLSearchParams({ action: 'tarefas', ...params }).toString();
        const r  = await fetch(url + '?' + qs);
        const d  = await r.json().catch(() => null);
        return d?.tarefas || [];
    } catch { return []; }
}

// ── Inicializa o módulo de tarefas ────────────────────────────────────────────
function initTarefas() {
    _atualizarAbaTarefas();
    _atualizarBannerTarefaAtiva();   // restaura banner se tarefa estava ativa

    // Botão concluir no banner ativa o modal de conclusão
    document.getElementById('btn-banner-concluir')?.addEventListener('click', () => {
        _abrirModalConcluir();
    });

    // Botões do modal de conclusão
    document.getElementById('btn-concluir-cancelar')?.addEventListener('click', () => {
        document.getElementById('modal-concluir-overlay').classList.remove('visivel');
    });
    document.getElementById('btn-concluir-confirmar')?.addEventListener('click', async () => {
        const obs = document.getElementById('modal-concluir-obs').value.trim();
        await _concluirTarefaAtiva(obs);
        document.getElementById('modal-concluir-overlay').classList.remove('visivel');
    });

    // Timer do banner (atualiza a cada 30s)
    setInterval(_atualizarTimerBanner, 30000);

    // Botões do modal Nova Tarefa (Modo Chefe)
    document.getElementById('btn-nt-cancelar')?.addEventListener('click', () => {
        document.getElementById('modal-nova-tarefa-overlay').classList.remove('visivel');
    });
    document.getElementById('btn-nt-criar')?.addEventListener('click', _criarNovaTarefa);
}

// ── Atualiza painel de Tarefas conforme configuração ─────────────────────────
// Na nova navegação, a aba Tarefas é sempre visível; renderiza o painel
// quando modo e URL estão configurados.
function _atualizarAbaTarefas() {
    if (_S._modoAtual && _S._sheetsUrl) renderizarPainelTarefas();
}

// ── Renderiza o painel de tarefas conforme o modo ────────────────────────────
async function renderizarPainelTarefas() {
    const cont = document.getElementById('tarefas-content');
    if (!cont) return;

    // ── Cabeçalho de boas-vindas (sempre visível) ─────────────────────────────
    const nome = _S._nomeServidor || _S._servidorResponsavel || '';
    const primeiroNome = nome ? nome.trim().split(/\s+/)[0] : '';
    const saudacao = primeiroNome
        ? `Olá, ${primeiroNome}!`
        : 'Olá!';

    cont.innerHTML = `
    <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border-soft);">
        <div style="font-size:16px;font-weight:700;color:var(--text);letter-spacing:-0.01em;">
            ${saudacao}
        </div>
    </div>
    <div id="tarefas-corpo"></div>`;

    const corpo = document.getElementById('tarefas-corpo');

    if (!_S._sheetsUrl || !_S._modoAtual) {
        corpo.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;padding:24px 20px;gap:10px;color:var(--text-muted);text-align:center;">
            <div style="font-size:32px;">⚙</div>
            <p style="font-size:12px;line-height:1.6;">Configure a URL do Apps Script e o Modo<br>nas Configurações (⚙) para ver suas tarefas.</p></div>`;
        return;
    }

    if (_S._modoAtual === 'chefe') {
        return _renderizarChefe();
    }

    // ── Modo Servidor — Dashboard ──────────────────────────────────────────────
    corpo.innerHTML = `
    <div id="dashboard-skeleton" style="color:var(--text-muted);font-size:12px;padding:10px 0;">⏳ Carregando...</div>`;

    await _carregarDashboardServidor();
}

// ── Dashboard do servidor: métricas + últimas auditorias ─────────────────────
async function _carregarDashboardServidor() {
    const corpo = document.getElementById('tarefas-corpo');
    if (!corpo) return;

    const tarefas = await _fetchTarefas({ servidor: (_S._nomeServidor || '').toLowerCase() });

    const pendentes   = tarefas.filter(t => t.status === 'pendente' || t.status === 'em_andamento');
    const concluidasHoje = tarefas.filter(t => {
        if (t.status !== 'concluida') return false;
        // conta só as concluídas com data de hoje
        if (!t.finalizado_em) return false;
        const hoje = new Date().toLocaleDateString('pt-BR');
        return t.finalizado_em.startsWith(hoje.split('/')[0] + '/' + hoje.split('/')[1] + '/' + hoje.split('/')[2].substring(0,4));
    });
    // Usa o maior valor entre: contagem real do Sheets (hoje) e contagem da sessão
    const concluidasCount = Math.max(concluidasHoje.length, _S._concluidasNaSessao || 0);

    // ── Totais por tipo (todas as tarefas do servidor, qualquer status) ──────────
    const _contTipo = tipo => tarefas.filter(t => t.tipo === tipo).length;
    const totalAnaliseDocs      = _contTipo('analise_docs');
    const totalAlteracaoCand    = _contTipo('alteracao_cand');
    const totalAtualizacaoAut   = _contTipo('atualizacao_autucao');
    const totalNotificacao      = _contTipo('notificacao');
    const totalRecurso          = _contTipo('recurso');

    // ── Últimas auditorias: concluídas hoje, mais recentes primeiro ──────────────
    const _hojeStr = new Date().toLocaleDateString('pt-BR'); // dd/mm/aaaa
    const ultimasAuditorias = tarefas
        .filter(t => {
            if (t.status !== 'concluida' || !t.finalizado_em) return false;
            const m = t.finalizado_em.match(/(\d{2}\/\d{2}\/\d{4})/);
            return m ? m[1] === _hojeStr : false;
        })
        .slice(-5).reverse();

    // ── Monta HTML da lista de pendentes (com botão Iniciar) ─────────────────
    const _renderPendentesHTML = () => {
        if (!pendentes.length) return `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0;">Nenhuma tarefa pendente.</div>`;
        return pendentes.map(t => {
            const dataCriacao = (() => {
                if (!t.criado_em) return '';
                const m = t.criado_em.match(/(\d{2}\/\d{2}\/\d{4})/);
                return m ? m[1] : '';
            })();
            const tipoLabel   = _TIPO_LABELS[t.tipo] || t.tipo || '';
            const isAndamento = t.status === 'em_andamento';
            const pillClr     = isAndamento ? '#4f7cff' : '#f59e0b';
            const pillTxt     = isAndamento ? 'AND.'    : 'PND.';
            const processoEsc = _esc(t.processo || '—');
            const idEsc       = _esc(t.id || '');
            return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
                <span style="width:6px;height:6px;border-radius:50%;background:${pillClr};opacity:.8;flex-shrink:0;"></span>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:3px;margin-bottom:2px;">
                        <span style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${processoEsc}">${processoEsc}</span>
                        <button data-processo="${processoEsc}" title="Copiar" class="btn-copiar-processo"
                            style="background:none;border:none;cursor:pointer;padding:0 1px;font-size:11px;color:var(--text-muted);line-height:1;flex-shrink:0;opacity:.6;"
                            onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.6'">📋</button>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                        <span style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(t.candidato || '—')}</span>
                        ${dataCriacao ? `<span style="font-size:10px;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;flex-shrink:0;opacity:.7;">· ${dataCriacao}</span>` : ''}
                    </div>
                    <div style="margin-top:2px;">
                        <span style="font-size:9px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${pillClr};padding:1px 5px;border-radius:3px;background:${pillClr}1a;border:1px solid ${pillClr}44;">${_esc(tipoLabel)}</span>
                    </div>
                </div>
                ${!isAndamento
                    ? `<button class="btn-iniciar-dashboard" data-id="${idEsc}"
                        style="background:var(--accent-dim);border:1px solid rgba(35,86,168,0.35);color:var(--accent);padding:4px 9px;border-radius:var(--radius-sm);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;flex-shrink:0;transition:background .15s;">▶ Iniciar</button>`
                    : `<button class="btn-concluir-dashboard" data-id="${idEsc}"
                        style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35);color:#22c55e;padding:4px 9px;border-radius:var(--radius-sm);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;flex-shrink:0;transition:background .15s;">✅ Concluir</button>`
                }
            </div>`;
        }).join('');
    };

    // ── Monta HTML das últimas auditorias ─────────────────────────────────────
    const _renderAuditoriasHTML = () => {
        if (!ultimasAuditorias.length) return `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0;">Nenhuma auditoria registrada ainda.</div>`;
        return ultimasAuditorias.map(t => {
            const tipoLabel = _TIPO_LABELS[t.tipo] || t.tipo || 'CONCLUÍDA';
            const dataFin   = (() => {
                if (!t.finalizado_em) return '';
                const m = t.finalizado_em.match(/(\d{2}\/\d{2}\/\d{4})/);
                return m ? m[1] : '';
            })();
            return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-soft);">
                <span style="width:6px;height:6px;border-radius:50%;background:var(--success);flex-shrink:0;"></span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--text-muted);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(t.processo || '—')}${dataFin ? ` · ${dataFin}` : ''}</div>
                    <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(t.candidato || '—')}</div>
                </div>
                <span style="font-size:9px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--text-muted);letter-spacing:.05em;white-space:nowrap;flex-shrink:0;">${_esc(tipoLabel)}</span>
            </div>`;
        }).join('');
    };

    // ── Layout 2 colunas ──────────────────────────────────────────────────────
    corpo.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.08em;">Dashboard</div>
        <button class="btn-tarefas-atualizar" id="btn-tarefas-atualizar" style="padding:2px 10px;font-size:11px;">🔄 Atualizar</button>
    </div>

    <!-- Faixa: totais por tipo -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px;">
        <div style="background:rgba(35,86,168,0.13);border:1px solid rgba(35,86,168,0.25);border-radius:var(--radius);padding:10px 12px 10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:600;color:#6b8fc7;letter-spacing:.02em;">Análise de Documentos</div>
                <span style="font-size:14px;line-height:1;">📋</span>
            </div>
            <div style="font-size:26px;font-weight:700;color:#7aaef5;line-height:1;margin-bottom:5px;">${String(totalAnaliseDocs).padStart(2,'0')}</div>
            <div style="font-size:9px;color:#6b8fc7;">Total de tarefas</div>
        </div>
        <div style="background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.22);border-radius:var(--radius);padding:10px 12px 10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:600;color:#4a9e6b;letter-spacing:.02em;">Alteração CAND</div>
                <span style="font-size:14px;line-height:1;">✏️</span>
            </div>
            <div style="font-size:26px;font-weight:700;color:#4ade80;line-height:1;margin-bottom:5px;">${String(totalAlteracaoCand).padStart(2,'0')}</div>
            <div style="font-size:9px;color:#4a9e6b;">Total de tarefas</div>
        </div>
        <div style="background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.22);border-radius:var(--radius);padding:10px 12px 10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:600;color:#a07c2a;letter-spacing:.02em;">Atual. de Autuação</div>
                <span style="font-size:14px;line-height:1;">📝</span>
            </div>
            <div style="font-size:26px;font-weight:700;color:#fbbf24;line-height:1;margin-bottom:5px;">${String(totalAtualizacaoAut).padStart(2,'0')}</div>
            <div style="font-size:9px;color:#a07c2a;">Total de tarefas</div>
        </div>
        <div style="background:rgba(168,85,247,0.10);border:1px solid rgba(168,85,247,0.22);border-radius:var(--radius);padding:10px 12px 10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:600;color:#8b5cf6;letter-spacing:.02em;">Notificações</div>
                <span style="font-size:14px;line-height:1;">🔔</span>
            </div>
            <div style="font-size:26px;font-weight:700;color:#c084fc;line-height:1;margin-bottom:5px;">${String(totalNotificacao).padStart(2,'0')}</div>
            <div style="font-size:9px;color:#8b5cf6;">Total de tarefas</div>
        </div>
        <div style="background:rgba(239,68,68,0.09);border:1px solid rgba(239,68,68,0.20);border-radius:var(--radius);padding:10px 12px 10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:600;color:#9b4444;letter-spacing:.02em;">Recursos</div>
                <span style="font-size:14px;line-height:1;">⚖️</span>
            </div>
            <div style="font-size:26px;font-weight:700;color:#f87171;line-height:1;margin-bottom:5px;">${String(totalRecurso).padStart(2,'0')}</div>
            <div style="font-size:9px;color:#9b4444;">Total de tarefas</div>
        </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;">

        <!-- COLUNA ESQUERDA: card + lista pendentes -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <!-- Card: Atribuídas a Mim -->
            <div style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);border-radius:var(--radius);padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Atribuídas</div>
                <div style="font-size:28px;font-weight:700;color:#f59e0b;line-height:1;margin-bottom:2px;">${pendentes.length}</div>
                
            </div>
            <!-- Lista de pendentes com scroll -->
            <div style="background:var(--surface2);border:1px solid var(--border-soft);border-radius:var(--radius);padding:4px 10px;max-height:150px;overflow-y:auto;" id="lista-pendentes-scroll">
                ${_renderPendentesHTML()}
            </div>
        </div>

        <!-- COLUNA DIREITA: card + últimas auditorias -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <!-- Card: Concluídas Hoje -->
            <div style="background:rgba(34,197,94,0.09);border:1px solid rgba(34,197,94,0.30);border-radius:var(--radius);padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Concluídas Hoje</div>
                <div style="font-size:28px;font-weight:700;color:var(--success);line-height:1;">${concluidasCount}</div>
            </div>
            <!-- Últimas Auditorias com scroll -->
            <div style="background:var(--surface2);border:1px solid var(--border-soft);border-radius:var(--radius);padding:4px 10px;max-height:150px;overflow-y:auto;" id="lista-auditorias-scroll">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.07em;padding:6px 0 4px;border-bottom:1px solid var(--border-soft);margin-bottom:2px;">Últimas Auditorias</div>
                ${_renderAuditoriasHTML()}
            </div>
        </div>

    </div>`;

    // Banner oculto enquanto o dashboard está visível (botão Concluir já aparece na lista)
    if (_S._tarefaAtiva) {
        document.getElementById('banner-tarefa-ativa')?.classList.remove('visivel');
    }

    // ── Listeners ─────────────────────────────────────────────────────────────
    document.getElementById('btn-tarefas-atualizar')?.addEventListener('click', () => {
        _carregarDashboardServidor();
    });

    // Botões ▶ Iniciar direto no dashboard
    corpo.querySelectorAll('.btn-iniciar-dashboard').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const tarefa = pendentes.find(t => String(t.id) === String(id));
            if (tarefa) await _iniciarTarefa(tarefa);
        });
    });

    // Botões ✅ Concluir direto no dashboard (tarefas em_andamento)
    corpo.querySelectorAll('.btn-concluir-dashboard').forEach(btn => {
        btn.addEventListener('click', () => {
            // Sempre atualiza _S._tarefaAtiva para a tarefa clicada
            const id = btn.dataset.id;
            const tarefa = pendentes.find(t => String(t.id) === String(id));
            if (tarefa) {
                _S._tarefaAtiva = { ...tarefa, iniciadoEm: _S._tarefaAtiva?.iniciadoEm || Date.now() };
            }
            _abrirModalConcluir();
        });
    });

    // Copiar número do processo
    corpo.querySelectorAll('.btn-copiar-processo').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = btn.dataset.processo || '';
            if (!num) return;
            navigator.clipboard.writeText(num).then(() => {
                const orig = btn.textContent;
                btn.textContent = '✅';
                setTimeout(() => { btn.textContent = orig; }, 1200);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = num;
                ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                const orig = btn.textContent;
                btn.textContent = '✅';
                setTimeout(() => { btn.textContent = orig; }, 1200);
            });
        });
    });
}

// ── Carrega e renderiza as tarefas do servidor logado (lista detalhada) ──────
async function _carregarTarefasServidor() {
    const lista = document.getElementById('tarefas-lista');
    if (!lista) return;
    lista.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:10px 0;">⏳ Carregando...</div>`;

    const tarefas = await _fetchTarefas({ servidor: _S._nomeServidor.toLowerCase() });

    if (!tarefas.length) {
        lista.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:10px 0;text-align:center;">
            Nenhuma tarefa atribuída a você no momento.</div>`;
        return;
    }

    const pendentes    = tarefas.filter(t => t.status === 'pendente');
    const emAndamento  = tarefas.filter(t => t.status === 'em_andamento');
    const concluidas   = tarefas.filter(t => t.status === 'concluida' || t.status === 'cancelada').slice(-5);

    lista.innerHTML = '';

    if (emAndamento.length) {
        lista.appendChild(_secaoTarefas('EM ANDAMENTO', emAndamento, true));
    }
    if (pendentes.length) {
        lista.appendChild(_secaoTarefas(`PENDENTES (${pendentes.length})`, pendentes, false));
    }
    if (concluidas.length) {
        lista.appendChild(_secaoTarefas('RECENTES', concluidas, false));
    }
}

// ── Constrói seção com lista de cards ────────────────────────────────────────
function _secaoTarefas(titulo, tarefas, isAtiva) {
    const sec = document.createElement('div');
    sec.style.cssText = 'margin-bottom:14px;';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-muted);font-family:"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border-soft);';
    hdr.textContent = titulo;
    sec.appendChild(hdr);

    for (const t of tarefas) {
        sec.appendChild(_cardTarefa(t, isAtiva));
    }
    return sec;
}

// ── Constrói card individual de tarefa ────────────────────────────────────────
function _cardTarefa(t, isAtiva) {
    const div = document.createElement('div');
    div.className = 'tarefa-card' + (isAtiva ? ' ativa' : '');
    div.style.marginBottom = '6px';

    const statusLabel = { pendente: 'PENDENTE', em_andamento: 'ANDAMENTO', concluida: 'CONCLUÍDA', cancelada: 'CANCELADA' };
    const tipoLabel   = _TIPO_LABELS[t.tipo] || t.tipo;

    div.innerHTML = `
        <div class="tarefa-card-body">
            <div class="tarefa-card-tipo">${tipoLabel}</div>
            <div class="tarefa-card-processo">${t.processo || '—'}</div>
            <div class="tarefa-card-candidato">${t.candidato || '—'}</div>
            <div class="tarefa-card-cargo">${t.cargo || '—'}</div>
            ${t.iniciado_em ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Iniciada: ${t.iniciado_em}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="tarefa-card-status ${t.status}">${statusLabel[t.status] || t.status}</span>
            ${t.status === 'pendente' ? `<button class="btn-iniciar-tarefa" data-id="${t.id}">▶ Iniciar</button>` : ''}
        </div>`;

    const btnIniciar = div.querySelector('.btn-iniciar-tarefa');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => _iniciarTarefa(t));
    }

    return div;
}

// ── Inicia uma tarefa: marca em_andamento no Sheets e ativa o banner ─────────
async function _iniciarTarefa(tarefa) {
    _mostrarNotificacaoSheets('⏳ Iniciando tarefa...');
    const res = await _apiTarefa({ action: 'iniciar_tarefa', id: tarefa.id });
    if (!res?.ok) {
        _mostrarNotificacaoSheets('⚠️ Erro ao iniciar tarefa.');
        return;
    }
    _S._tarefaAtiva = { ...tarefa, iniciadoEm: Date.now() };
    localStorage.setItem('chatje_tarefa_ativa', JSON.stringify(_S._tarefaAtiva));
    _atualizarBannerTarefaAtiva();
    _mostrarNotificacaoSheets('▶ Tarefa iniciada');
    // Recarrega a view correta conforme o painel ativo
    if (document.getElementById('tarefas-corpo')) {
        await _carregarDashboardServidor();
    } else {
        await _carregarTarefasServidor();
    }
}

// ── Abre modal de conclusão ───────────────────────────────────────────────────
function _abrirModalConcluir() {
    if (!_S._tarefaAtiva) return;
    const t = _S._tarefaAtiva;
    document.getElementById('modal-concluir-descricao').textContent =
        `${_TIPO_LABELS[t.tipo] || t.tipo} · ${t.processo || ''} · ${t.candidato || ''}`;
    document.getElementById('modal-concluir-obs').value = '';
    document.getElementById('modal-concluir-overlay').classList.add('visivel');
}

// ── Conclui a tarefa ativa no Sheets e remove o banner ───────────────────────
async function _concluirTarefaAtiva(obs) {
    const t = _S._tarefaAtiva;
    if (!t) return;
    _mostrarNotificacaoSheets('⏳ Concluindo tarefa...');
    const res = await _apiTarefa({ action: 'finalizar_tarefa', id: t.id, obs });
    if (!res?.ok) {
        _mostrarNotificacaoSheets('⚠️ Erro ao concluir tarefa.');
        return;
    }
    _S._tarefaAtiva = null;
    _S._concluidasNaSessao = (_S._concluidasNaSessao || 0) + 1;
    localStorage.removeItem('chatje_tarefa_ativa');
    document.getElementById('banner-tarefa-ativa').classList.remove('visivel');
    _mostrarNotificacaoSheets('✅ Tarefa concluída');

    // Recarrega dashboard se o painel de tarefas estiver visível
    if (document.getElementById('painel-tarefas')?.classList.contains('ativo')) {
        await _carregarDashboardServidor();
    }
}

// ── Atualiza o banner de tarefa ativa ────────────────────────────────────────
function _atualizarBannerTarefaAtiva() {
    const banner = document.getElementById('banner-tarefa-ativa');
    if (!banner) return;
    const t = _S._tarefaAtiva;
    if (!t) {
        banner.classList.remove('visivel');
        return;
    }
    document.getElementById('banner-tarefa-tipo').textContent = _TIPO_LABELS[t.tipo] || t.tipo;
    document.getElementById('banner-tarefa-info').textContent =
        `${t.processo || ''} · ${t.candidato || ''} · ${t.cargo || ''}`;
    _atualizarTimerBanner();
    banner.classList.add('visivel');
}

// ── Atualiza somente o timer do banner ───────────────────────────────────────
function _atualizarTimerBanner() {
    const el = document.getElementById('banner-tarefa-timer');
    if (!el || !_S._tarefaAtiva?.iniciadoEm) return;
    const min = Math.floor((Date.now() - _S._tarefaAtiva.iniciadoEm) / 60000);
    el.textContent = min < 1 ? 'há menos de 1 min' : `há ${min} min`;
}

// ═════════════════════════════════════════════════════════════════════════════
// MÓDULO CHEFE
// ═════════════════════════════════════════════════════════════════════════════

// ── Utilitários gerais ────────────────────────────────────────────────────────
// _esc agora é definido uma única vez em config.js (Shared Kernel) — auditoria: M1.

function _parseBrDate(str) {
    if (!str) return null;
    const m = str.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]));
}

function _hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `${r},${g},${b}`;
}

function _metrica(val, label, cor) {
    return `<div style="background:rgba(${_hexToRgb(cor)},0.08);border:1px solid rgba(${_hexToRgb(cor)},0.2);border-radius:6px;padding:6px 10px;min-width:68px;text-align:center;">
        <div style="font-size:15px;font-weight:700;color:${cor};font-family:'IBM Plex Mono',monospace;">${val}</div>
        <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:1px;">${label}</div>
    </div>`;
}

async function _fetchGestao() {
    const url = _S._sheetsUrl;
    if (!url) return [];
    try {
        const r = await fetch(url + '?action=gestao');
        const d = await r.json().catch(() => null);
        return d?.gestao || [];
    } catch { return []; }
}

// ── Estilo inline reutilizável para selects (Chefe) ──────────────────────────

// ── Renderiza o painel Chefe com sub-abas ────────────────────────────────────
async function _renderizarChefe() {
    // Escreve no #tarefas-corpo (abaixo do cabeçalho de boas-vindas)
    const corpo = document.getElementById('tarefas-corpo') || document.getElementById('tarefas-content');
    if (!corpo) return;

    corpo.innerHTML = `
    <div id="chefe-subtabs" style="display:flex;gap:2px;border-bottom:1px solid var(--border-soft);margin-bottom:12px;">
        <div class="chefe-stab ativa" data-chefe-painel="tarefas">📋 Tarefas</div>
        <div class="chefe-stab" data-chefe-painel="desempenho">📈 Desempenho</div>
        <div class="chefe-stab" data-chefe-painel="dashboard">🗂 Dashboard</div>
    </div>
    <div id="chefe-painel-tarefas" class="chefe-painel ativo"></div>
    <div id="chefe-painel-desempenho" class="chefe-painel"></div>
    <div id="chefe-painel-dashboard" class="chefe-painel"></div>`;

    corpo.querySelectorAll('.chefe-stab').forEach(stab => {
        stab.addEventListener('click', () => {
            const nome = stab.dataset.chefePainel;
            corpo.querySelectorAll('.chefe-stab').forEach(s => s.classList.remove('ativa'));
            stab.classList.add('ativa');
            corpo.querySelectorAll('.chefe-painel').forEach(p => p.classList.remove('ativo'));
            document.getElementById('chefe-painel-' + nome)?.classList.add('ativo');
            _renderizarChefePainel(nome);
        });
    });

    await _renderizarChefePainel('tarefas');
}

async function _renderizarChefePainel(nome) {
    if (nome === 'tarefas')    return _renderizarChefeTarefas();
    if (nome === 'desempenho') return _renderizarChefeDesempenho();
    if (nome === 'dashboard')  return _renderizarChefeDashboard();
}

// ── Sub-aba: Tarefas ─────────────────────────────────────────────────────────
let _chefeTarefasTodas = [];

async function _renderizarChefeTarefas() {
    const cont = document.getElementById('chefe-painel-tarefas');
    if (!cont) return;
    cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">⏳ Carregando...</div>`;

    _chefeTarefasTodas = await _fetchTarefas();
    const servidores = [...new Set(_chefeTarefasTodas.map(t => t.servidor_atribuido).filter(Boolean))].sort();

    cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <select id="chefe-filtro-status" style="${_SS}">
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
        </select>
        <select id="chefe-filtro-servidor" style="${_SS}">
            <option value="">Todos os servidores</option>
            ${servidores.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`).join('')}
        </select>
        <button class="btn-tarefas-atualizar" id="btn-chefe-atualizar">🔄</button>
        <div style="flex:1;"></div>
        <button class="btn-primary" id="btn-nova-tarefa" style="padding:6px 14px;font-size:12px;">+ Nova</button>
    </div>
    <div id="chefe-tarefas-lista"></div>`;

    const renderFiltradas = () => {
        const fStatus   = document.getElementById('chefe-filtro-status')?.value  || '';
        const fServidor = document.getElementById('chefe-filtro-servidor')?.value || '';
        const filtradas = _chefeTarefasTodas.filter(t =>
            (!fStatus   || t.status             === fStatus) &&
            (!fServidor || t.servidor_atribuido === fServidor)
        );
        _renderizarListaChefe(filtradas, servidores);
    };

    document.getElementById('chefe-filtro-status')?.addEventListener('change', renderFiltradas);
    document.getElementById('chefe-filtro-servidor')?.addEventListener('change', renderFiltradas);
    document.getElementById('btn-chefe-atualizar')?.addEventListener('click', () => _renderizarChefeTarefas());
    document.getElementById('btn-nova-tarefa')?.addEventListener('click', () => _abrirModalNovaTarefa(servidores));

    renderFiltradas();
}

function _renderizarListaChefe(tarefas, servidores) {
    const cont = document.getElementById('chefe-tarefas-lista');
    if (!cont) return;
    if (!tarefas.length) {
        cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">Nenhuma tarefa encontrada.</div>`;
        return;
    }
    cont.innerHTML = '';
    for (const t of tarefas) cont.appendChild(_cardTarefaChefe(t, servidores));
}

function _cardTarefaChefe(t, servidores) {
    const div = document.createElement('div');
    div.className = 'tarefa-card';
    div.style.marginBottom = '6px';

    const sLabel = { pendente:'PENDENTE', em_andamento:'ANDAMENTO', concluida:'CONCLUÍDA', cancelada:'CANCELADA' };
    const isCancelable = t.status === 'pendente' || t.status === 'em_andamento';

    div.innerHTML = `
        <div class="tarefa-card-body">
            <div class="tarefa-card-tipo">${_TIPO_LABELS[t.tipo] || _esc(t.tipo)}</div>
            <div class="tarefa-card-processo">${_esc(t.processo) || '—'}</div>
            <div class="tarefa-card-candidato">${_esc(t.candidato) || '—'}</div>
            <div class="tarefa-card-cargo">${_esc(t.cargo) || '—'}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
                👤 ${_esc(t.servidor_atribuido) || '—'}
                ${t.criado_em    ? ` · Criado: ${_esc(t.criado_em)}` : ''}
                ${t.iniciado_em  ? ` · Iniciado: ${_esc(t.iniciado_em)}` : ''}
                ${t.finalizado_em? ` · Finalizado: ${_esc(t.finalizado_em)}` : ''}
            </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
            <span class="tarefa-card-status ${t.status}">${sLabel[t.status] || t.status}</span>
            ${isCancelable ? `<button class="btn-chefe-redistribuir btn-tarefas-atualizar" data-id="${_esc(t.id)}" style="font-size:10px;padding:3px 8px;">↕ Redistribuir</button>` : ''}
            ${isCancelable ? `<button class="btn-chefe-cancelar btn-tarefas-atualizar" data-id="${_esc(t.id)}" style="font-size:10px;padding:3px 8px;color:var(--error);border-color:rgba(239,68,68,0.3);">✕ Cancelar</button>` : ''}
        </div>`;

    div.querySelector('.btn-chefe-redistribuir')?.addEventListener('click', () => _abrirRedistribuir(div, t, servidores));
    div.querySelector('.btn-chefe-cancelar')?.addEventListener('click', () => _cancelarTarefa(t));

    return div;
}

function _abrirRedistribuir(cardDiv, t, servidores) {
    const actionsDiv = cardDiv.querySelector('[style*="flex-direction:column"]');
    if (!actionsDiv) return;
    actionsDiv.innerHTML = `
        <select id="redistribuir-select" style="${_SS}max-width:130px;">
            ${servidores.map(s => `<option value="${_esc(s)}" ${s === t.servidor_atribuido ? 'selected' : ''}>${_esc(s)}</option>`).join('')}
        </select>
        <input id="redistribuir-input" type="text" list="nt-servidores-list" placeholder="Ou digite..."
            style="width:130px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:11px;padding:4px 8px;outline:none;font-family:'Inter',sans-serif;">
        <button class="btn-iniciar-tarefa" id="btn-redistribuir-ok" style="font-size:10px;padding:3px 8px;">✓ OK</button>
        <button class="btn-tarefas-atualizar" id="btn-redistribuir-cancel" style="font-size:10px;padding:3px 8px;">✕</button>`;

    document.getElementById('btn-redistribuir-cancel')?.addEventListener('click', () => _renderizarChefeTarefas());
    document.getElementById('btn-redistribuir-ok')?.addEventListener('click', async () => {
        const novoServidor = (document.getElementById('redistribuir-input')?.value.trim()
            || document.getElementById('redistribuir-select')?.value || '').trim();
        if (!novoServidor) return;
        _mostrarNotificacaoSheets('⏳ Redistribuindo...');
        const res = await _apiTarefa({ action: 'atualizar_tarefa', id: t.id, servidor_atribuido: novoServidor });
        if (res?.ok) {
            _mostrarNotificacaoSheets('✅ Tarefa redistribuída');
        } else {
            _mostrarNotificacaoSheets('⚠️ Erro ao redistribuir');
        }
        _renderizarChefeTarefas();
    });
}

async function _cancelarTarefa(t) {
    const label = _TIPO_LABELS[t.tipo] || t.tipo;
    const candidato = t.candidato || t.processo || '';
    // Confirmação via modal inline — substitui confirm() nativo que pode ser bloqueado em iframes
    const confirmado = await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px;">Cancelar tarefa</div>
                <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Cancelar <strong>${_esc(label)}</strong> para <strong>${_esc(candidato)}</strong>?</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="_cc_nao" style="padding:6px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;">Não</button>
                    <button id="_cc_sim" style="padding:6px 16px;border-radius:8px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#_cc_sim').addEventListener('click', () => { overlay.remove(); resolve(true);  });
        overlay.querySelector('#_cc_nao').addEventListener('click', () => { overlay.remove(); resolve(false); });
    });
    if (!confirmado) return;
    _mostrarNotificacaoSheets('⏳ Cancelando...');
    const res = await _apiTarefa({ action: 'cancelar_tarefa', id: t.id });
    if (res?.ok) {
        _mostrarNotificacaoSheets('✅ Tarefa cancelada');
        _renderizarChefeTarefas();
    } else {
        _mostrarNotificacaoSheets('⚠️ Erro ao cancelar');
    }
}

// ── Sub-aba: Desempenho ───────────────────────────────────────────────────────
async function _renderizarChefeDesempenho() {
    const cont = document.getElementById('chefe-painel-desempenho');
    if (!cont) return;
    cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">⏳ Calculando...</div>`;

    const tarefas = await _fetchTarefas();

    const stats = {};
    for (const t of tarefas) {
        const srv = t.servidor_atribuido || '(sem atribuição)';
        if (!stats[srv]) stats[srv] = { nome: srv, total: 0, pendente: 0, em_andamento: 0, concluida: 0, cancelada: 0, tempos: [] };
        stats[srv].total++;
        if (stats[srv][t.status] !== undefined) stats[srv][t.status]++;
        if (t.status === 'concluida' && t.iniciado_em && t.finalizado_em) {
            const dtI = _parseBrDate(t.iniciado_em);
            const dtF = _parseBrDate(t.finalizado_em);
            if (dtI && dtF && dtF > dtI) stats[srv].tempos.push((dtF - dtI) / 60000);
        }
    }

    const lista = Object.values(stats).sort((a, b) => b.concluida - a.concluida);

    if (!lista.length) {
        cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">Nenhuma tarefa registrada ainda.</div>`;
        return;
    }

    cont.innerHTML = `<div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;">Atualizado: ${new Date().toLocaleTimeString('pt-BR')}</div>`;

    for (const s of lista) {
        const avgMin = s.tempos.length ? Math.round(s.tempos.reduce((a,b)=>a+b,0)/s.tempos.length) : null;
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;';
        card.innerHTML = `
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">${_esc(s.nome)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${_metrica(s.total,       'Total',       '#4f7cff')}
                ${_metrica(s.concluida,   'Concluídas',  '#22c55e')}
                ${_metrica(s.em_andamento,'Andamento',   '#7c5cfc')}
                ${_metrica(s.pendente,    'Pendentes',   '#f59e0b')}
                ${s.cancelada ? _metrica(s.cancelada, 'Canceladas', '#6b7280') : ''}
                ${avgMin !== null ? _metrica(avgMin + ' min', 'Tempo médio', '#06b6d4') : ''}
            </div>`;
        cont.appendChild(card);
    }
}

// ── Sub-aba: Dashboard ────────────────────────────────────────────────────────
async function _renderizarChefeDashboard() {
    const cont = document.getElementById('chefe-painel-dashboard');
    if (!cont) return;
    cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">⏳ Carregando...</div>`;

    const [tarefas, gestaoRows] = await Promise.all([_fetchTarefas(), _fetchGestao()]);

    const gestaoMap = {};
    for (const g of gestaoRows) gestaoMap[g.processo] = g;

    const porProcesso = {};
    for (const t of tarefas) {
        if (!t.processo) continue;
        if (!porProcesso[t.processo]) {
            porProcesso[t.processo] = { processo: t.processo, candidato: t.candidato, cargo: t.cargo, tarefas: [] };
        }
        porProcesso[t.processo].tarefas.push(t);
    }

    const processos = Object.values(porProcesso);
    if (!processos.length) {
        cont.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">Nenhum processo com tarefas cadastradas.</div>`;
        return;
    }

    // Sort: em_andamento first, then pendente, then others
    processos.sort((a, b) => {
        const score = p => p.tarefas.some(t => t.status === 'em_andamento') ? 2
            : p.tarefas.some(t => t.status === 'pendente') ? 1 : 0;
        return score(b) - score(a);
    });

    cont.innerHTML = '';
    for (const p of processos) {
        cont.appendChild(_cardDashboard(p, gestaoMap[p.processo] || null));
    }
}

function _cardDashboard(p, g) {
    const sc = { pendente: 0, em_andamento: 0, concluida: 0, cancelada: 0 };
    for (const t of p.tarefas) if (sc[t.status] !== undefined) sc[t.status]++;
    const ativas = p.tarefas.filter(t => t.status === 'em_andamento');

    const pill = (n, label, bg, fg) => n
        ? `<span style="background:${bg};border:1px solid ${fg}33;color:${fg};font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;font-family:'IBM Plex Mono',monospace;">${n} ${label}</span>`
        : '';

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;';
    card.innerHTML = `
        <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text-muted);margin-bottom:2px;">${_esc(p.processo)}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">
            ${_esc(p.candidato) || '—'}
            <span style="font-size:11px;font-weight:400;color:var(--text-muted);">· ${_esc(p.cargo) || '—'}</span>
        </div>
        ${g ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">
            📁 ${_esc(g.docs_total)||'?'} docs · ✅ ${_esc(g.ok)||'0'} OK · ⚠️ ${_esc(g.ressalvas)||'0'} ressalvas · 🔔 ${_esc(g.dilig_qtd)||'0'} dilig. · ${_esc(g.data)||''}
        </div>` : ''}
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:${ativas.length?'8px':'0'};">
            ${pill(sc.em_andamento,'ANDAMENTO','rgba(79,124,255,0.10)','#4f7cff')}
            ${pill(sc.pendente,   'PENDENTE',  'rgba(245,158,11,0.10)','#f59e0b')}
            ${pill(sc.concluida,  'CONCLUÍDA', 'rgba(34,197,94,0.08)', '#22c55e')}
            ${pill(sc.cancelada,  'CANCELADA', 'rgba(107,114,128,0.08)','#6b7280')}
        </div>
        ${ativas.map(t => `<div style="font-size:10px;color:var(--text-soft);padding:4px 0;border-top:1px solid var(--border-soft);">
            🔄 <strong>${_esc(t.servidor_atribuido)}</strong> — ${_TIPO_LABELS[t.tipo] || _esc(t.tipo)}
            ${t.iniciado_em ? `<span style="color:var(--text-muted);"> · ${_esc(t.iniciado_em)}</span>` : ''}
        </div>`).join('')}`;
    return card;
}

// ── Nova Tarefa modal ─────────────────────────────────────────────────────────
function _abrirModalNovaTarefa(servidores) {
    const dl = document.getElementById('nt-servidores-list');
    if (dl) dl.innerHTML = servidores.map(s => `<option value="${_esc(s)}">`).join('');
    ['nt-processo','nt-candidato','nt-cargo','nt-servidor','nt-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tipoEl = document.getElementById('nt-tipo');
    if (tipoEl) tipoEl.value = 'analise_docs';
    document.getElementById('modal-nova-tarefa-overlay').classList.add('visivel');
    setTimeout(() => document.getElementById('nt-processo')?.focus(), 80);
}

async function _criarNovaTarefa() {
    const processo  = document.getElementById('nt-processo')?.value.trim()  || '';
    const candidato = document.getElementById('nt-candidato')?.value.trim() || '';
    const cargo     = document.getElementById('nt-cargo')?.value.trim()     || '';
    const tipo      = document.getElementById('nt-tipo')?.value             || 'analise_docs';
    const servidor  = document.getElementById('nt-servidor')?.value.trim() || '';
    const obs       = document.getElementById('nt-obs')?.value.trim()      || '';

    if (!processo || !servidor) {
        _mostrarNotificacaoSheets('⚠️ Processo e Servidor são obrigatórios.');
        return;
    }

    _mostrarNotificacaoSheets('⏳ Criando tarefa…');
    const res = await _apiTarefa({
        action:             'criar_tarefa',
        processo,
        candidato,
        cargo,
        tipo,
        servidor_atribuido: servidor,
        criado_por:         _S._nomeServidor || _S._servidorResponsavel || '',
        obs,
    });
    if (!res?.ok) {
        _mostrarNotificacaoSheets('⚠️ Erro ao criar tarefa: ' + (res?.error || 'sem resposta'));
        return;
    }
    document.getElementById('modal-nova-tarefa-overlay').classList.remove('visivel');
    _mostrarNotificacaoSheets('✅ Tarefa criada com sucesso!');
    renderizarPainelTarefas();
}

// ── Solicita número do processo associado ao content.js ──────────────
function solicitarProcessoAssociado() {
    return new Promise(resolve => {
        const timeout = setTimeout(() => resolve(null), 8000);
        const handler = (e) => {
            // Valida origem antes de processar
            if (_PARENT_ORIGIN !== '*' && e.origin !== _PARENT_ORIGIN) return;
            if (e.data?.type === 'CHATJE_PROCESSO_ASSOCIADO') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve(e.data.numero || null);
            }
        };
        window.addEventListener('message', handler);
        _S._postParent?.({ source: 'chatje-iframe', type: 'REQUEST_PROCESSO_ASSOCIADO' });
    });
}
