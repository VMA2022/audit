// chat.js — versão OCR local (sem Gemini / sem API key)
// Toda verificação de documentos é feita localmente:
//   • PDF com texto nativo  → PDF.js extrai direto
//   • PDF escaneado         → PDF.js renderiza + Tesseract.js faz OCR
//   • HTML / texto          → verificação por palavras-chave

// ── Segurança: origens permitidas para postMessage ────────────────────────────
// chat.html roda em chrome-extension://; o parent é sempre uma das páginas do PJe.
// Usar a origem do parent em vez de '*' impede que páginas de outras origens
// recebam mensagens da extensão.
// document.referrer contém a URL da página que abriu o iframe (página do PJe).
const _PARENT_ORIGIN = (() => {
    try {
        // Tenta a origem do parent (disponível quando mesmo origin ou via referrer)
        const ref = document.referrer || '';
        if (ref) {
            const u = new URL(ref);
            return u.origin; // ex: "https://pje.tre-sp.jus.br"
        }
    } catch (_) {}
    // Fallback: qualquer origem PJe conhecida — sem wildcard
    return location.ancestorOrigins?.[0] || '*';
})();

// Auxiliar: envia mensagem ao parent (content.js) com origem explícita
function _postParent(data) {
    window.parent.postMessage(data, _PARENT_ORIGIN);
}

// ── Estado global ─────────────────────────────────────────────────────────────
// _S foi declarado em config.js (carregado primeiro).
// Aqui apenas inicializamos as propriedades com valores do localStorage.
_S._servidorResponsavel    = localStorage.getItem('chatje_servidor_responsavel') || '';
_S._sheetsUrl              = localStorage.getItem('chatje_sheets_url') || '';
_S._modoAtual              = localStorage.getItem('chatje_modo')         || '';   // 'servidor' | 'chefe'
_S._nomeServidor           = localStorage.getItem('chatje_nome_servidor') || '';
_S._tarefaAtiva            = JSON.parse(localStorage.getItem('chatje_tarefa_ativa') || 'null');
_S._concluidasNaSessao     = 0;   // contador por sessão — não persiste no localStorage

// Instrumentação de tempo por auditoria (indicador de produtividade):
// mede do clique de iniciar até CADA salvamento (1 linha por salvamento).
_S._auditT0                = null;   // performance.now() no clique de iniciar
_S._auditTProcMs           = null;   // performance.now() ao fim do processamento (OCR/análise)
_S._auditProcesso          = '';     // nº do processo do t0 atual (evita t0 de outra auditoria)

// ── Tema claro / escuro ───────────────────────────────────────────────────────
(function _initTema() {
    const tema = localStorage.getItem('chatje_tema') || 'dark';
    _aplicarTema(tema);
})();

function _aplicarTema(tema) {
    const root = document.documentElement;
    const btn  = document.getElementById('btn-tema');
    if (tema === 'light') {
        root.setAttribute('data-theme', 'light');
        if (btn) btn.textContent = '☀️';
        if (btn) btn.title = 'Alternar para modo escuro';
    } else {
        root.removeAttribute('data-theme');
        if (btn) btn.textContent = '🌙';
        if (btn) btn.title = 'Alternar para modo claro';
    }
    localStorage.setItem('chatje_tema', tema);
}

function toggleTema() {
    const temaAtual = localStorage.getItem('chatje_tema') || 'dark';
    _aplicarTema(temaAtual === 'dark' ? 'light' : 'dark');
}

// ── Utilitário: extrai texto de PDF via pdfextract.js ────────────────────────
async function extrairTextoPDF(base64) {
    if (typeof extrairTextoPDFLocal === 'function') {
        return await extrairTextoPDFLocal(base64);
    }
    console.warn('[chat] extrairTextoPDFLocal não carregado');
    return null;
}

// isTextoLegivel e isTextoBinario foram movidas para config.js (Shared Kernel)
// onde ficam disponíveis para domain/analysis.js sem depender do entry point.

// Módulos: analysis.js, auditoria.js, render.js, cand.js, tarefas.js

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════

function init() {
    // Expõe _postParent via _S para que módulos UI não precisem chamar o
    // entry point diretamente — elimina violação de camada (UI → Entry Point).
    _S._postParent = _postParent;

    showChat();
    initAbas();
    _postParent({ source: 'chatje-iframe', type: 'CHATJE_SERVIDOR_READY', nome: _S._servidorResponsavel });

    document.getElementById('btn-clear')?.addEventListener('click', clearChat);
    document.getElementById('btn-tema')?.addEventListener('click', toggleTema);
    // Sincroniza ícone do botão com o tema já aplicado no carregamento
    _aplicarTema(localStorage.getItem('chatje_tema') || 'dark');

    // ── Modal de configurações ──────────────────────────────────────────
    const _overlay   = document.getElementById('modal-config-overlay');
    const _inputUrl  = document.getElementById('input-sheets-url');
    const _selectModo = document.getElementById('select-config-modo');
    const _inputNome = document.getElementById('input-config-nome');
    if (_inputUrl)   _inputUrl.value   = _S._sheetsUrl;
    if (_selectModo) _selectModo.value = _S._modoAtual;
    if (_inputNome)  _inputNome.value  = _S._nomeServidor;

    // Abre o modal automaticamente só na primeira vez (sem URL ou sem nome)
    if ((!_S._sheetsUrl || !_S._nomeServidor) && _overlay) {
        _overlay.style.display = 'flex';
        setTimeout(() => _inputNome?.focus(), 80);
    }

    document.getElementById('btn-config')?.addEventListener('click', () => {
        if (_inputUrl)   _inputUrl.value   = _S._sheetsUrl;
        if (_selectModo) _selectModo.value = _S._modoAtual;
        if (_inputNome)  _inputNome.value  = _S._nomeServidor;
        if (_overlay)    _overlay.style.display = 'flex';
    });
    document.getElementById('btn-config-cancelar')?.addEventListener('click', () => {
        if (_overlay) _overlay.style.display = 'none';
    });

    // ── Fechar o painel inteiro: botão ✕ do cabeçalho + tecla Esc ──────────
    document.getElementById('btn-fechar-painel')?.addEventListener('click', () => {
        _postParent({ source: 'chatje-iframe', type: 'CHATJE_FECHAR_PAINEL' });
    });
    function _temOverlayInternoAberto() {
        for (const el of document.body.children) {
            if (el.id && el.id.startsWith('chatje')) continue;
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') continue;
            if ((parseInt(s.zIndex, 10) || 0) < 100) continue;
            const r = el.getBoundingClientRect();
            if (r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.5) return true;
        }
        return false;
    }
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (_overlay && getComputedStyle(_overlay).display !== 'none') { _overlay.style.display = 'none'; return; }
        if (_temOverlayInternoAberto()) return;
        _postParent({ source: 'chatje-iframe', type: 'CHATJE_FECHAR_PAINEL' });
    });
    document.getElementById('btn-config-salvar')?.addEventListener('click', () => {
        _S._sheetsUrl    = (_inputUrl?.value  || '').trim();
        _S._modoAtual    = _selectModo?.value || '';
        _S._nomeServidor = (_inputNome?.value || '').trim();
        localStorage.setItem('chatje_sheets_url',    _S._sheetsUrl);
        localStorage.setItem('chatje_modo',          _S._modoAtual);
        localStorage.setItem('chatje_nome_servidor', _S._nomeServidor);
        if (_S._nomeServidor) {
            _S._servidorResponsavel = _S._nomeServidor;
            localStorage.setItem('chatje_servidor_responsavel', _S._nomeServidor);
        }
        if (_overlay) _overlay.style.display = 'none';
        _atualizarAbaTarefas();
        _mostrarNotificacaoSheets(_S._sheetsUrl ? '✅ Configurações salvas' : '⚠️ URL removida');
    });
    document.getElementById('btn-auditoria')?.addEventListener('click', requestAuditoria);
    document.getElementById('btn-auditoria-principal')?.addEventListener('click', iniciarAuditoriaPrincipal);
    document.getElementById('btn-docs-novos')?.addEventListener('click', abrirPopupDocsNovos);
    initTarefas();
}

function iniciarAuditoriaPrincipal(auto) {
    _S._preanaliseAuto = (auto === true);
    _S._auditT0 = performance.now();   // t0 do indicador de tempo (clique -> salvar)
    _S._auditoriaTipo = 'principal';
    _postParent({ source: 'chatje-iframe', type: 'REQUEST_AUDITORIA_PRINCIPAL' });
    addSystemMessage('\uD83D\uDD0D Iniciando auditoria dos documentos apresentados...');
}

// ── Listeners de mensagens do content.js ─────────────────────────────────────

// ── Ciclo automático da tarefa de Pré-análise (execução única por processo) ──
_S._preAnaliseTarefaId = _S._preAnaliseTarefaId || null;
_S._preAnalise = {
  _post: function (p) { var u = _S._sheetsUrl; if (!u) return Promise.resolve(null); return fetch(u, { method: 'POST', body: JSON.stringify(p) }).then(function (r) { return r.json().catch(function () { return null; }); }).catch(function () { return null; }); },
  _get: function (qs) { var u = _S._sheetsUrl; if (!u) return Promise.resolve(null); return fetch(u + qs).then(function (r) { return r.json().catch(function () { return null; }); }).catch(function () { return null; }); },
  verificar: function (processo) {
    if (!processo) return Promise.resolve({ blocked: false, id: null });
    return this._get('?action=tarefas&processo=' + encodeURIComponent(processo)).then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.tarefas)) return { blocked: false, id: null };
      var pre = d.tarefas.filter(function (t) { return String(t.processo) === String(processo) && (t.subtipo || '') === 'pre_analise' && (t.status || '').toLowerCase() !== 'cancelada'; });
      var conc = pre.filter(function (t) { return (t.status || '').toLowerCase() === 'concluida'; })[0];
      if (conc) return { blocked: true, id: conc.id, servidor: conc.servidor_atribuido || '' };
      return { blocked: false, id: (pre[0] ? pre[0].id : null) };
    });
  },
  criar: function () {
    var proc = (typeof infoProcesso !== 'undefined' && infoProcesso && infoProcesso.numero) || '';
    if (!proc) return Promise.resolve(null);
    var card = document.getElementById('processo-info-card');
    var cel = card && card.querySelector('[data-info="cargo"] .card-val');
    var cargo = (_S._cardCampos && _S._cardCampos.cargo) || (cel && cel.textContent ? cel.textContent.trim() : '') || (_S._cardCamposSheets && _S._cardCamposSheets.cargo) || '';
    var cand = (typeof infoProcesso !== 'undefined' && infoProcesso && infoProcesso.requerente) || '';
    return this._post({ action: 'criar_tarefa', processo: proc, candidato: cand, cargo: cargo, tipo: 'analise_docs', subtipo: 'pre_analise', servidor_atribuido: (_S._servidorResponsavel || ''), criado_por: 'extensão (pré-análise)' }).then(function (r) { return (r && r.id) ? r.id : null; });
  },
  concluir: function (id) {
    if (!id) return Promise.resolve(null);
    var card = document.getElementById('processo-info-card');
    var cel = card && card.querySelector('[data-info="cargo"] .card-val');
    var cargo = (_S._cardCampos && _S._cardCampos.cargo) || (cel && cel.textContent ? cel.textContent.trim() : '') || (_S._cardCamposSheets && _S._cardCamposSheets.cargo) || '';
    return this._post({ action: 'finalizar_tarefa', id: id, cargo: cargo, obs: 'Pré-análise concluída (OK)' });
  }
};

window.addEventListener('message', (e) => {
    // Valida origem: aceita apenas mensagens do parent (página do PJe)
    // _PARENT_ORIGIN é resolvido no topo do arquivo a partir de document.referrer
    if (_PARENT_ORIGIN !== '*' && e.origin !== _PARENT_ORIGIN) return;
    if (e.data?.type === 'AUDITJE_INICIAR_PREANALISE') {
        var _proc = (typeof infoProcesso !== 'undefined' && infoProcesso && infoProcesso.numero) || '';
        _S._preAnalise.verificar(_proc).then(function (res) {
            if (res.blocked) {
                addSystemMessage('⚠️ Pré-análise já realizada para este processo' + (res.servidor ? (' por ' + res.servidor) : '') + '. Execução única — não será repetida.');
                _postParent({ source: 'chatje-iframe', type: 'CHATJE_PREANALISE_BLOQUEADA' });
                return;
            }
            if (res.id) { _S._preAnaliseTarefaId = res.id; }
            else { _S._preAnalise.criar().then(function (id) { _S._preAnaliseTarefaId = id; }); }
            iniciarAuditoriaPrincipal(true);
        });
        return;
    }
    if (e.data?.type === 'AUDITJE_PREANALISE_OK') { _S._preAnalise.concluir(_S._preAnaliseTarefaId); _S._preAnaliseTarefaId = null; return; }
    if (e.data?.type === 'AUDITJE_ABRIR_CAND') {
        _postParent({ source: 'chatje-iframe', type: 'CHATJE_ABRIR_PAINEL' });
        const _goCand = function () { if (typeof ativarAbaCand === 'function') ativarAbaCand(); };
        _goCand(); setTimeout(_goCand, 60);
        return;
    }
    if (e.data?.type === 'CHATJE_AUDITORIA_START')      handleAuditoriaStart(e.data);
    if (e.data?.type === 'CHATJE_AUDITORIA_PROGRESSO')  handleAuditoriaProgresso(e.data);
    if (e.data?.type === 'CHATJE_AUDITORIA_FIM')        handleAuditoriaFim(e.data);
    if (e.data?.type === 'CHATJE_AUDITORIA' && e.data.error) addSystemMessage('⚠️ ' + e.data.error);
    if (e.data?.type === 'CHATJE_AUDITORIA_CANCELADA') {
        _S._auditoriaRodando = false;
        const p = document.getElementById('auditoria-progresso');
        if (p) { p.textContent = '⛔ Auditoria interrompida.'; p.style.color = 'var(--warning)'; }
    }
    if (e.data?.type === 'CHATJE_AUDITORIA_PROGRESSO_MSG') {
        const p = document.getElementById('auditoria-progresso');
        if (p) p.textContent = e.data.msg;
        else addSystemMessage(e.data.msg);
    }
    if (e.data?.type === 'CHATJE_CONTEUDO_PETICAO') handleConteudoPeticao(e.data);
    if (e.data?.type === 'CHATJE_DOCS_CARREGANDO') {
        mostrarCarregandoDocs(e.data.encontrados || 0, e.data.progresso || 0);
    }
    if (e.data?.type === 'CHATJE_DOCS_CARREGADOS') {
        removerCarregandoDocs();
        const { total } = e.data;
        const aviso = document.getElementById('aviso-scroll');
        if (aviso) aviso.remove();
        const counter = document.getElementById('docs-count');
        if (counter) counter.textContent = `📄 ${total} doc${total !== 1 ? 's' : ''}`;
    }
    if (e.data?.type === 'CHATJE_INFO_PROCESSO') {
        handleInfoProcesso(e.data);
        setTimeout(() => {
            if (!document.getElementById('aviso-scroll')) exibirAvisoScroll();
        }, 100);
    }
    if (e.data?.type === 'CHATJE_SERVIDOR') {
        const nome = (e.data.nome || '').trim();
        // Só atualiza se veio um nome válido — evita apagar o que está salvo no localStorage
        if (nome) {
            _S._servidorResponsavel = nome;
            _S._nomeServidor = nome;
            localStorage.setItem('chatje_servidor_responsavel', nome);
            localStorage.setItem('chatje_nome_servidor', nome);
        }
    }
    if (e.data?.type === 'CHATJE_LISTA_DOCS') {
        _handleListaDocs(e.data.docs || []);
    }
    if (e.data?.type === 'CHATJE_ATOS_PROCESSUAIS') {
        if (typeof renderizarPainelAtos === 'function') {
            renderizarPainelAtos(e.data.atos || []);
        }
    }
    // Atalho externo (barra de seções injetada pelo content.js) → ativa a seção de nível-1
    if (e.data?.type === 'CHATJE_ABRIR_SECAO') {
        if (typeof _ativarSecao === 'function') _ativarSecao(e.data.secao);
    }
    // Pedido do content.js para exibir o modal de configuração quando o nome
    // do servidor ainda não foi preenchido (substitui o prompt() nativo).
    // Só abre o modal se de fato faltar URL ou nome — evita reabrir após salvar.
    if (e.data?.type === 'CHATJE_PEDIR_NOME') {
        const jaConfigurado = _S._sheetsUrl && _S._nomeServidor;
        if (!jaConfigurado) {
            const overlay = document.getElementById('modal-config-overlay');
            if (overlay) {
                const inputNome = document.getElementById('input-config-nome');
                if (inputNome) inputNome.value = _S._nomeServidor || '';
                overlay.style.display = 'flex';
                // Foca no campo nome para facilitar o preenchimento imediato
                setTimeout(() => inputNome?.focus(), 80);
            }
        }
    }
});

init();
