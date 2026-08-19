// content.js — Mundo isolado (ISOLATED world)
// Responsabilidades:
//   1. Injetar o painel lateral (iframe) diretamente na página do PJe
//   2. Fazer fetch de documentos (PDF/HTML) e retransmitir para o chat.html
//   3. Intermediar mensagens de auditoria, captura e PDF entre chat.html e a página

const _contentExtAPI = typeof chrome !== 'undefined' ? chrome : browser;
const CHAT_URL = _contentExtAPI.runtime.getURL('chat.html');

// Origem segura do iframe da extensão — usada para validar e enviar mensagens
// Declarada aqui (topo do arquivo) porque _postChat é chamada antes da seção 10
const _CHAT_ORIGIN = _contentExtAPI.runtime.getURL('').replace(/\/$/, '');

// ═══════════════════════════════════════════════════════════════
// 1. INJEÇÃO DO PAINEL LATERAL
// ═══════════════════════════════════════════════════════════════

// IDs do painel — mantidos aqui pois content.js é injetado isoladamente
// (config.js é carregado apenas no iframe do chat.html)
const PANEL_ID  = 'chatje-panel';
const IFRAME_ID = 'chatje-iframe';
const TOGGLE_ID = 'chatje-toggle';

// ── Sinal de cancelamento de auditoria ────────────────────────
let _auditoriaCancelada = false;
let _auditoriaAbortCtrl = null; // AbortController ativo durante a auditoria

// ── Nome do servidor responsável (sincronizado com chat.html) ──
let _servidorNome = '';

// ── Ref. para fechar o painel a partir do roteador de mensagens ──
// criarPainel define as funções em closure; esta referência permite
// fechar o painel de fora (ex.: ✕/Esc vindos do iframe via postMessage).
let _fecharPainelExterno = null;

// Hook para ABRIR o painel na aba CAND (link "ver no Requisitos CAND" do card).
let _abrirPainelExterno = null;

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES DE ANÁLISE LOCAL (espelho das definidas em analysis.js)
// content.js é um isolated world — não tem acesso ao escopo do iframe,
// então as funções necessárias para análise de documentos HTML são
// duplicadas aqui de forma compacta.
// ═══════════════════════════════════════════════════════════════

const _normContent = s => s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

function eCertidaoNominal(nomeDoc) {
    const n = _normContent(nomeDoc);
    return /certid/.test(n) && (
        /criminal|antecedente|distribui|objeto.*pe|pe.*objeto/.test(n) ||
        /estadual|federal|eleitoral|militar/.test(n)
    );
}

function identificarTipoPeloTexto(texto) {
    if (!texto) return { tipo: null, label: null };
    const t = _normContent(texto.substring(0, 8000));
    // Certidão eproc/SEEU (TJSP) — complementar da SAJ, também 1º grau (mundo isolado)
    if ((t.includes('sistema eproc') || (t.includes('eproc') && t.includes('certidao eleitoral'))) &&
        t.includes('seeu'))
        return { tipo: 'estadual_1grau_eproc', label: 'Certidão Criminal Estadual 1º grau (eproc/SEEU)' };
    if (t.includes('certidao estadual de distribuicoes criminais') ||
        (t.includes('distribuicoes criminais') && t.includes('primeira instancia')) ||
        (t.includes('certidao estadual') && t.includes('fins exclusivamente eleitorais') && !t.includes('orgao especial')))
        return { tipo: 'estadual_1grau', label: 'Certidão Criminal Estadual 1º grau' };
    if ((t.includes('orgao especial') && t.includes('certidao negativa')) ||
        (t.includes('certidao negativa para fins eleitorais') && t.includes('tribunal de justica')))
        return { tipo: 'estadual_2grau', label: 'Certidão Criminal Estadual 2º grau' };
    // Certidão Federal Regional — TRF3 "Abrangência - Regional" (cobre 1º e 2º grau)
    // Traço opcional: _normContent remove o traço ("Abrangência - Regional" → "abrangencia regional");
    // ancora "abrangencia" antes de "regional" para não casar com "Tribunal Regional Federal".
    if (/abrangencia\s*[-–]?\s*regional/.test(t) && t.includes('certidao judicial para fins eleitorais'))
        return { tipo: 'federal_regional', label: 'Certidão Criminal Federal (Regional — 1º e 2º grau)' };
    if ((t.includes('secao judiciaria') && t.includes('fins eleitorais')) ||
        (t.includes('certidao judicial para fins eleitorais') && t.includes('secao judiciaria')))
        return { tipo: 'federal_1grau', label: 'Certidão Criminal Federal 1º grau' };
    if ((t.includes('tribunal regional federal') && t.includes('fins eleitorais')) ||
        (t.includes('certidao judicial para fins eleitorais') && t.includes('tribunal regional federal')))
        return { tipo: 'federal_2grau', label: 'Certidão Criminal Federal 2º grau' };
    if (t.includes('superior tribunal militar') ||
        (t.includes('justica militar') && t.includes('uniao') && t.includes('certidao')))
        return { tipo: 'stm', label: 'Certidão Criminal STM' };
    if (t.includes('nesta data a situacao processual e a seguinte'))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé' };
    if (t.includes('tribunal de justica militar') ||
        (t.includes('justica militar') && t.includes('estado') && t.includes('certidao')))
        return { tipo: 'tjm', label: 'Certidão Criminal TJM/JM-SP' };
    if (t.includes('superior tribunal de justica') && t.includes('certidao'))
        return { tipo: 'stj', label: 'Certidão Criminal STJ' };
    if (t.includes('supremo tribunal federal') && t.includes('certidao'))
        return { tipo: 'stf', label: 'Certidão Criminal STF' };
    if ((t.includes('certidao de objeto e pe') || t.includes('objeto e pe')) &&
        !t.includes('distribuicoes') && !t.includes('certidao negativa') &&
        !t.includes('fins eleitorais') && !t.includes('antecedentes criminais') &&
        !t.includes('primeira instancia') && !t.includes('segunda instancia'))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé (complementar)' };
    // Fallback: detecção pelo conteúdo interno (PDFs com cabeçalho de assinatura digital)
    if (t.includes('verificou constar o seguinte') ||
        (t.includes('certifica') && t.includes('situacao processual') && t.includes('processo fisico')) ||
        (t.includes('certifica') && t.includes('situacao processual') && t.includes('inquerito policial')))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé (complementar)' };
    if ((t.includes('tribunal regional eleitoral') || t.includes('tribunal superior eleitoral')) && t.includes('certidao'))
        return { tipo: 'eleitoral', label: 'Certidão Eleitoral' };
    return { tipo: null, label: null };
}

// Correspondência heurística nome×conteúdo para documentos HTML (mundo isolado).
// Retorna: null (inconclusivo) | 'presente' (verificação humana) | true | false.
// Espelha nomeCorrespondeConteudo() de domain/analysis.js.
// Comprovante de CADASTRO/PEDIDO de certidão (e-SAJ / TJSP) — não é a certidão emitida.
// Espelho compacto de domain/analysis.js (o content script é mundo isolado).
function _ePedidoDeCertidao(texto) {
    if (!texto) return false;
    const t = _normContent(texto.substring(0, 4000));
    return t.includes('cadastro de pedido de certidao')
        || t.includes('seu pedido foi cadastrado')
        || (t.includes('numero do pedido') && t.includes('data do pedido'))
        || t.includes('prazo maximo para liberacao da certidao')
        || t.includes('para posterior emissao da certidao')
        || t.includes('abrirresultadocadastro');
}

function verificaCorrespondenciaHeuristica(nome, conteudo) {
    if (!conteudo || !nome) return null;

    const nomeSemArq = nome.replace(/\([^)]+\.(pdf|html|doc|txt)[^)]*\)/gi, '').trim();
    const nomeTipo   = nomeSemArq.replace(/\([^)]+\)/g, '').replace(/\s*-\s*[Ff]im\s+\w+\s*$/i, '').trim();
    const nomeNorm   = _normContent(nomeTipo);

    // Presença já basta -> verificação humana
    if (/relatorio.*(requisito|registro)|declarac.*bens|bens.*declarac/.test(nomeNorm)) return 'presente';
    if (/peticao.*inicial|inicial.*peticao/.test(nomeNorm) ||
        /\brrc\b|requerimento.*registro|registro.*candidatura/.test(nomeNorm)) return 'presente';

    // Comprovante de cadastro/pedido de certidão (e-SAJ) -> não é a certidão emitida
    if (_ePedidoDeCertidao(conteudo)) return false;

    // Nome diz "certidão federal" mas o conteúdo não tem a expressão obrigatória -> não corresponde
    if (/federal.*(1|primeiro|2|segundo).*grau|federal.*regional|criminal.*federal|certidao.*federal/.test(nomeNorm)) {
        const { tipo } = identificarTipoPeloTexto(conteudo);
        if (!tipo) return false;
    }

    // Fallback: sobreposição de palavras-chave do nome no conteúdo (idêntico ao analysis.js)
    const textoNorm = _normContent(conteudo.substring(0, 10000));
    const stop = new Set(['de','da','do','das','dos','e','a','o','em','para','com','por','no','na','que','ou','um','uma']);
    const palavras = nomeNorm.split(/\s+/).filter(p => p.length > 3 && !stop.has(p));
    if (!palavras.length) return null;
    const acertos = palavras.filter(p => textoNorm.includes(p)).length;
    return (acertos / palavras.length) >= 0.4 ? true : false;
}

function verificaNomeNoCertidao(requerente, conteudo) {
    if (!requerente || !conteudo) return { encontrado: false, detalhes: 'dados ausentes' };
    const nomeNorm  = _normContent(requerente);
    const textoNorm = _normContent(conteudo.substring(0, 8000));
    if (textoNorm.includes(nomeNorm)) return { encontrado: true, detalhes: 'nome exato' };
    const partes = nomeNorm.split(' ').filter(p => p.length > 3);
    if (partes.length >= 2) {
        const primeiro = partes[0];
        const ultimo   = partes[partes.length - 1];
        if (textoNorm.includes(primeiro) && textoNorm.includes(ultimo))
            return { encontrado: true, detalhes: 'primeiro e último nome' };
    }
    return { encontrado: false, detalhes: `"${requerente}" não encontrado` };
}

function verificaCPFNaCertidao(cpf, conteudo) {
    if (!cpf || !conteudo) return { encontrado: false, detalhes: 'CPF não informado' };
    const cpfLimpo = cpf.replace(/\D/g, '');
    const texto = conteudo.substring(0, 8000).replace(/[\r\n]+/g, ' ');
    const re = new RegExp(
        cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,
            '$1[.\\-\\s]?$2[.\\-\\s]?$3[.\\-\\s]?$4')
    );
    if (re.test(texto)) return { encontrado: true, detalhes: 'CPF encontrado' };
    if (texto.includes(cpfLimpo)) return { encontrado: true, detalhes: 'CPF encontrado (sem formatação)' };
    return { encontrado: false, detalhes: `CPF ${cpf} não encontrado` };
}

function criarPainel() {
    if (document.getElementById(PANEL_ID)) return;

    // ── Barra flutuante de seções (arrastável) ─────────────────
    // Substitui o botão único: cada botão abre o painel direto na seção.
    const toggle = document.createElement('div');   // contêiner da barra (nome mantido p/ o resto do código)
    toggle.id = TOGGLE_ID;
    toggle.setAttribute('role', 'toolbar');
    toggle.setAttribute('aria-label', 'AuditJE — atalhos de seção');
    Object.assign(toggle.style, {
        position:       'fixed',
        right:          '12px',
        top:            '50%',
        transform:      'translateY(-50%)',
        zIndex:         '2147483646',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        padding:        '8px 7px 10px',
        background:     'linear-gradient(135deg,#1a5276,#2980b9)',
        borderRadius:   '16px',
        boxShadow:      '0 5px 16px rgba(0,0,0,0.32)',
        cursor:         'grab',
        touchAction:    'none',
        userSelect:     'none',
    });

    // dica visual de arraste
    const _grip = document.createElement('div');
    _grip.textContent = '⠿';
    _grip.setAttribute('aria-hidden', 'true');
    Object.assign(_grip.style, {
        color: 'rgba(255,255,255,.6)', fontSize: '12px', lineHeight: '.6',
        height: '8px', pointerEvents: 'none',
    });
    toggle.appendChild(_grip);

    // botões de seção (mesma ordem das abas nível-1)
    const _SECOES = [
        { secao: 'analise',         icone: '⚖',  titulo: 'Análise documental' },
    ];
    const _secBtns = {};
    _SECOES.forEach(({ secao, icone, titulo }) => {
        const b = document.createElement('button');
        b.type = 'button';
        const _icoImg = document.createElement('img');
        _icoImg.src = _contentExtAPI.runtime.getURL('public/logo-white-128.png');
        _icoImg.alt = '';
        _icoImg.setAttribute('aria-hidden', 'true');
        Object.assign(_icoImg.style, { width: '22px', height: '22px', display: 'block', pointerEvents: 'none' });
        b.appendChild(_icoImg);
        b.title = titulo;
        b.dataset.secao = secao;
        b.setAttribute('aria-label', titulo);
        Object.assign(b.style, {
            width: '38px', height: '38px', flex: 'none', border: 'none',
            borderRadius: '11px', background: 'rgba(255,255,255,.14)', color: '#fff',
            fontSize: '18px', lineHeight: '1', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s ease',
        });
        toggle.appendChild(b);
        _secBtns[secao] = b;
    });

    // ── Ponte: MapeamentoJE pede para abrir o painel do AuditJE ──
    if (!window.__AUDITJE_BRIDGE__) {
        window.__AUDITJE_BRIDGE__ = true;
        window.addEventListener('PJM_ABRIR_EXT_' + _contentExtAPI.runtime.id, function () {
            try { _abrirSecao('analise'); } catch (_) {}
        });
    }

    // ── Panel — 100% largura e altura ──────────────────────────
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
        position:   'fixed',
        top:        '0',
        left:       '0',
        width:      '100vw',
        height:     '100vh',
        zIndex:     '2147483645',
        background: '#0f1117',
        display:    'none',   // começa oculto
    });

    // ── Iframe ─────────────────────────────────────────────────
    const iframe = document.createElement('iframe');
    iframe.id  = IFRAME_ID;
    iframe.src = _contentExtAPI.runtime.getURL('chat.html');
    Object.assign(iframe.style, {
        width:  '100%',
        height: '100%',
        border: 'none',
    });

    iframe.addEventListener('load', () => {
        setTimeout(enviarInfoProcesso, 800);
    }, { once: true });

    panel.appendChild(iframe);

    // ── Estado do painel ───────────────────────────────────────
    let aberto = false;

    function abrirPainel() {
        aberto = true;
        panel.style.display = 'block';
        const chatIframe = document.getElementById(IFRAME_ID);
        if (chatIframe?.contentWindow) {
            _postChat(chatIframe, { source: 'chatje-content', type: 'CHATJE_SERVIDOR', nome: _servidorNome });
        }
        // Reenvia info do processo a cada abertura do painel (não só no load do iframe)
        enviarInfoProcesso();
        carregarTodosDocumentos();
    }

    function fecharPainel() {
        aberto = false;
        panel.style.display = 'none';
        _aplicarBotaoAtivo();
    }

    // Permite fechar o painel de fora (roteador de mensagens: ✕/Esc do iframe)
    _fecharPainelExterno = fecharPainel;

    // Permite ABRIR o painel de fora (hook do card "ver no Requisitos CAND")
    _abrirPainelExterno = function () { if (!aberto) abrirPainel(); };

    // Esc fecha o painel quando o foco está na página (fora do iframe)
    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Escape' || e.key === 'Esc') && aberto) { e.preventDefault(); fecharPainel(); }
    });

    // ── Arrastar o botão flutuante (memoriza a posição) ──────────
    let _fabDragging = false, _fabMoved = false, _fabSX = 0, _fabSY = 0, _fabOX = 0, _fabOY = 0;
    function _posicionarFab(x, y) {
        const w = toggle.offsetWidth || 54, h = toggle.offsetHeight || 54;
        x = Math.max(4, Math.min(x, window.innerWidth  - w - 4));
        y = Math.max(4, Math.min(y, window.innerHeight - h - 4));
        toggle.style.left = x + 'px';
        toggle.style.top = y + 'px';
        toggle.style.right = 'auto';
        toggle.style.bottom = 'auto';
        toggle.style.transform = 'none';
    }
    toggle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const r = toggle.getBoundingClientRect();
        _fabDragging = true; _fabMoved = false;
        _fabSX = e.clientX; _fabSY = e.clientY; _fabOX = r.left; _fabOY = r.top;
        toggle.style.cursor = 'grabbing';
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!_fabDragging) return;
        const dx = e.clientX - _fabSX, dy = e.clientY - _fabSY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _fabMoved = true;
        _posicionarFab(_fabOX + dx, _fabOY + dy);
    });
    window.addEventListener('mouseup', () => {
        if (!_fabDragging) return;
        _fabDragging = false;
        toggle.style.cursor = 'grab';
        if (_fabMoved) {
            const r = toggle.getBoundingClientRect();
            _contentExtAPI.storage?.local?.set({ auditje_fab_pos: { x: r.left, y: r.top } });
        }
    });
    // ── Estado da seção ativa + ação dos botões da barra ─────────
    let _secaoAtual = null;
    function _aplicarBotaoAtivo() {
        Object.entries(_secBtns).forEach(([s, b]) => {
            b.style.background = (aberto && _secaoAtual === s)
                ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.14)';
        });
    }
    function _abrirSecao(secao) {
        const chatIframe = document.getElementById(IFRAME_ID);
        if (aberto && _secaoAtual === secao) { fecharPainel(); _aplicarBotaoAtivo(); return; }
        if (!aberto) abrirPainel();
        _secaoAtual = secao;
        if (chatIframe?.contentWindow) {
            _postChat(chatIframe, { source: 'chatje-content', type: 'CHATJE_ABRIR_SECAO', secao });
            if (secao === 'atos') {
                _postChat(chatIframe, { source: 'chatje-content', type: 'CHATJE_ATOS_PROCESSUAIS', atos: extrairAtosProcessuais() });
            }
        }
        _aplicarBotaoAtivo();
    }
    // clique num botão de seção — ignora se foi arraste
    Object.values(_secBtns).forEach(b => {
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_fabMoved) { _fabMoved = false; return; }
            _abrirSecao(b.dataset.secao);
        });
        b.addEventListener('mouseenter', () => {
            if (!(aberto && _secaoAtual === b.dataset.secao)) b.style.background = 'rgba(255,255,255,.28)';
        });
        b.addEventListener('mouseleave', _aplicarBotaoAtivo);
    });
    // restaura a posição salva (se houver)
    _contentExtAPI.storage?.local?.get({ auditje_fab_pos: null }, (res) => {
        const p = res && res.auditje_fab_pos;
        if (p && typeof p.x === 'number') _posicionarFab(p.x, p.y);
    });

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    // ── Visibilidade do launcher: liga/desliga (popup) + presença do MapeamentoPJe ──
    // O botão flutuante do AuditJE fica oculto quando (a) a extensão está
    // desativada no popup, ou (b) o MapeamentoPJe já está injetado na página
    // (o painel abre-se via a ponte PJM_ABRIR_EXT). Evita dois launchers juntos.
    let _extAtiva = true;
    const _mapeamentoPresente = () =>
        !!document.getElementById('pjm-floating-btn') ||
        !!document.getElementById('pjm-overlay-host');
    function _atualizarVisibilidadeLauncher() {
        toggle.style.display = (_extAtiva && !_mapeamentoPresente()) ? 'flex' : 'none';
    }
    _atualizarVisibilidadeLauncher();

    _contentExtAPI.storage?.local?.get({ auditje_enabled: true }, (res) => {
        _extAtiva = res.auditje_enabled !== false;
        if (!_extAtiva) panel.style.display = 'none';
        _atualizarVisibilidadeLauncher();
    });
    _contentExtAPI.storage?.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes.auditje_enabled) return;
        _extAtiva = changes.auditje_enabled.newValue !== false;
        if (!_extAtiva && aberto) fecharPainel();
        _atualizarVisibilidadeLauncher();
    });

    // A ordem de carregamento entre extensões não é garantida: reavalia a
    // presença do MapeamentoPJe se ele for injetado/removido depois (debounce).
    let _mapCheckTimer = null;
    const _obsMapeamento = new MutationObserver(() => {
        if (_mapCheckTimer) return;
        _mapCheckTimer = setTimeout(() => { _mapCheckTimer = null; _atualizarVisibilidadeLauncher(); }, 250);
    });
    _obsMapeamento.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(_atualizarVisibilidadeLauncher, 1500);
    setTimeout(_atualizarVisibilidadeLauncher, 4000);

    // Painel começa fechado — usuário abre clicando no botão lateral
}

// Aguarda o body estar disponível e injeta
function iniciarPainel() {
    if (document.body) {
        criarPainel();
    } else {
        document.addEventListener('DOMContentLoaded', criarPainel, { once: true });
    }
}

iniciarPainel();

// -- Frente B: abrir os autos a partir do gestao.html (hash na URL) --
function _auditjeOverlayErro(msg) {
    try {
        var o = document.getElementById('auditje-open-overlay');
        if (!o) return;
        o.textContent = '';
        var box = document.createElement('div');
        box.setAttribute('style', 'max-width:420px;text-align:center;padding:0 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif');
        var a = document.createElement('div'); a.setAttribute('style','font-size:15px;font-weight:600;margin-bottom:6px'); a.textContent = 'AuditJE';
        var b = document.createElement('div'); b.setAttribute('style','font-size:13px;font-weight:400;opacity:.9'); b.textContent = msg;
        box.appendChild(a); box.appendChild(b); o.appendChild(box);
        setTimeout(function () { try { o.remove(); } catch (e) {} }, 3500);
    } catch (e) {}
}
async function _auditjeAbrirPorHash() {
    const _rmOverlay = () => { try { const o = document.getElementById('auditje-open-overlay'); if (o) o.remove(); } catch (e) {} };
    try {
        const h = location.hash || '';
        if (h.indexOf('auditje_open=') === -1) return;
        const params = new URLSearchParams(h.slice(1));
        const idp = params.get('auditje_open');
        if (!idp) { _rmOverlay(); return; }
        const atual = new URLSearchParams(location.search).get('idProcesso');
        if (atual && atual === idp) { _rmOverlay(); return; }
        const resp = await fetch(location.origin + '/pje/seam/resource/rest/pje-legacy/painelUsuario/gerarChaveAcessoProcesso/' + encodeURIComponent(idp), { credentials: 'include' });
        const ca = (await resp.text()).trim();
        if (!/^[a-f0-9]{100,}$/i.test(ca)) { console.warn('[AuditJE] ca invalida ao abrir idProcesso', idp); _auditjeOverlayErro('Nao foi possivel abrir os autos. Verifique se voce esta logado no PJe.'); return; }
        location.assign(location.origin + '/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=' + encodeURIComponent(idp) + '&ca=' + encodeURIComponent(ca));
    } catch (e) { console.warn('[AuditJE] _auditjeAbrirPorHash erro:', e); _auditjeOverlayErro('Erro ao abrir os autos.'); }
}
_auditjeAbrirPorHash();

// ═══════════════════════════════════════════════════════════════
// 2. UTILITÁRIOS DE LOCALIZAÇÃO
// ═══════════════════════════════════════════════════════════════

function getChatIframe() {
    return document.getElementById(IFRAME_ID);
}

function extrairNumeroProcesso() {
    const titulo = document.title || '';
    const match = titulo.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    if (match) {
        console.log('[AuditJE] número extraído do título:', match[1]);
        return match[1];
    }
    const el = document.querySelector('.numero-processo, [id*="numeroProcesso"], h1');
    const fromEl = el?.textContent?.trim()?.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/)?.[1] || null;
    console.log('[AuditJE] extrairNumeroProcesso — título:', JSON.stringify(titulo), '| elemento:', el?.id || el?.className || null, '| resultado:', fromEl);
    return fromEl;
}

function extrairDadosRequerente() {
    const poloAtivo = document.getElementById('poloAtivo');
    if (!poloAtivo) {
        console.log('[AuditJE] extrairDadosRequerente — #poloAtivo não encontrado');
        return { nome: null, cpf: null };
    }
    const texto = poloAtivo.textContent
        .replace(/^\s*Polo\s+ativo\s*/i, '')
        .replace(/\s+/g, ' ').trim();
    const matchReq = texto.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]+?)\s*-\s*CPF:\s*([\d]{3}\.[\d]{3}\.[\d]{3}-[\d]{2})\s*\(REQUERENTE\)/i);
    if (matchReq) {
        console.log('[AuditJE] requerente (REQUERENTE):', matchReq[1].trim());
        return { nome: matchReq[1].trim(), cpf: matchReq[2].trim() };
    }
    const matchFirst = texto.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{3,}?)\s*-\s*CPF:\s*([\d]{3}\.[\d]{3}\.[\d]{3}-[\d]{2})/i);
    if (matchFirst) {
        console.log('[AuditJE] requerente (primeiro match):', matchFirst[1].trim());
        return { nome: matchFirst[1].trim(), cpf: matchFirst[2].trim() };
    }
    console.log('[AuditJE] extrairDadosRequerente — texto do polo ativo:', texto.substring(0, 200));
    return { nome: null, cpf: null };
}

function enviarInfoProcesso(tentativa = 0) {
    const chatIframe = getChatIframe();
    if (!chatIframe) {
        console.log('[AuditJE] enviarInfoProcesso — iframe não encontrado (tentativa', tentativa, ')');
        return;
    }
    const numero = extrairNumeroProcesso();
    const { nome, cpf } = extrairDadosRequerente();

    console.log('[AuditJE] enviarInfoProcesso tentativa', tentativa, '— numero:', numero, '| nome:', nome);

    // Se ainda não há dados (página pode não ter terminado de renderizar),
    // tenta novamente até 6 vezes em intervalos crescentes (500ms, 1s, 2s, 3s, 4s, 5s)
    if (!numero && !nome) {
        if (tentativa < 6) {
            const delay = tentativa === 0 ? 500 : tentativa * 1000;
            console.log('[AuditJE] sem dados ainda — retry em', delay, 'ms');
            setTimeout(() => enviarInfoProcesso(tentativa + 1), delay);
        } else {
            console.warn('[AuditJE] enviarInfoProcesso — dados não encontrados após 6 tentativas');
        }
        return;
    }

    const processoAssociado = extrairProcessoAssociado();
    const idProcesso = new URLSearchParams(location.search).get('idProcesso') || '';
    console.log('[AuditJE] enviando CHATJE_INFO_PROCESSO:', { numero, nome, cpf, idProcesso, processoAssociado });
    _postChat(chatIframe, {
        type: 'CHATJE_INFO_PROCESSO',
        numero,
        idProcesso,
        requerente: nome,
        cpf,
        processoAssociado: processoAssociado || null
    });

    // Não pré-clica a aba Associados no load — evita navegar o usuário para fora de "Autos".
    // A captura é feita sob demanda ao clicar "Finalizar auditoria".
}

// ═══════════════════════════════════════════════════════════════
// 3. UTILITÁRIOS DE EXTRAÇÃO DE DOCUMENTOS
// ═══════════════════════════════════════════════════════════════

function extraiIdDocumento(src) {
    if (!src) return null;
    let m = src.match(/\/documento\/(?:download\/)?(\d+)/);
    if (m) return m[1];
    m = src.match(/\/documento\/(\d+)/);
    if (m) return m[1];
    return null;
}

function extraiNomeDocumento(docId) {
    if (docId) {
        const todos = [...document.querySelectorAll('a[id*="detalheDocumento:j_id"]')];
        for (const a of todos) {
            const texto = a.textContent?.trim() || '';
            const match = texto.match(/^(\d{6,})\s*-\s*(.+)$/);
            if (match && match[1] === docId) return match[2].trim().substring(0, 150);
        }
        try {
            const xpath = document.evaluate(
                `//span[contains(text(), '${docId}')]`,
                document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
            );
            for (let i = 0; i < xpath.snapshotLength; i++) {
                const span = xpath.snapshotItem(i);
                const li = span.closest('li');
                if (li) {
                    const texto = li.textContent?.trim();
                    if (texto && !texto.includes('function') && !texto.includes('{')) {
                        const nome = texto.replace(docId, '').replace(/^\s*-\s*/, '').trim();
                        if (nome.length > 2) return nome.substring(0, 150);
                    }
                }
                const linkA = span.closest('a');
                if (linkA) {
                    const texto = linkA.textContent?.trim();
                    if (texto && !texto.includes('function'))
                        return texto.replace(docId, '').replace(/^\s*-\s*/, '').trim().substring(0, 150);
                }
            }
        } catch (e) {}
    }
    const matTitle = document.querySelector('mat-card-title');
    if (matTitle?.textContent?.trim()) {
        const t = matTitle.textContent.trim();
        if (!t.includes('function') && !t.includes('<') && t.length > 2) return t.substring(0, 120);
    }
    const pageTitle = document.title?.split('-')[0]?.trim();
    if (pageTitle && pageTitle.length > 2) return pageTitle.substring(0, 120);
    return 'Documento PJe';
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
    });
}

async function extraiTextoBlob(blob) {
    const tipo = blob.type || '';
    if (tipo.includes('pdf')) {
        const base64 = await blobToBase64(blob);
        return { tipo: 'pdf', conteudo: base64 };
    }
    const charset = tipo.match(/charset=([\w-]+)/i)?.[1] || 'utf-8';
    const buffer = await blob.arrayBuffer();
    const texto = new TextDecoder(charset).decode(buffer);
    const div = document.createElement('div');
    div.innerHTML = texto;
    return { tipo: 'html', conteudo: (div.innerText || texto).substring(0, 50000) };
}

// ═══════════════════════════════════════════════════════════════
// 4. CAPTURA DO DOCUMENTO VISÍVEL
// ═══════════════════════════════════════════════════════════════

async function captureAndSendDocument() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;

    let content = null;
    let name = 'Documento PJe';
    let mimeType = 'text/plain';
    let docId = null;

    // PJe 1G: DIV docHtml ou iframe interno
    const docHtmlDiv = document.getElementById('detalheDocumento:docHtml');
    if (docHtmlDiv) {
        const iframe = docHtmlDiv.querySelector('iframe');
        if (iframe?.src && !iframe.src.includes('chrome-extension')) {
            docId = extraiIdDocumento(iframe.src);
            name = extraiNomeDocumento(docId);
            if (docId) name = `[ID: ${docId}] ${name}`;
            try {
                const res = await fetch(iframe.src, { credentials: 'include' });
                const blob = await res.blob();
                const { tipo, conteudo } = await extraiTextoBlob(blob);
                content = conteudo;
                mimeType = tipo === 'pdf' ? 'application/pdf' : 'text/plain';
            } catch (e) {
                console.warn('AuditJE: erro fetch docHtml iframe:', e.message);
            }
        }
        if (!content) {
            const texto = docHtmlDiv.innerText?.trim();
            if (texto && texto.length > 50) {
                content = texto.substring(0, 50000);
                mimeType = 'text/plain';
            }
        }
    }

    // PJe 2G: iframe frameHtml
    if (!content) {
        const frameHtml = document.getElementById('frameHtml');
        if (frameHtml?.src && !frameHtml.src.includes('chrome-extension')) {
            docId = extraiIdDocumento(frameHtml.src);
            name = extraiNomeDocumento(docId);
            if (docId) name = `[ID: ${docId}] ${name}`;
            try {
                const iframeDoc = frameHtml.contentDocument || frameHtml.contentWindow?.document;
                if (iframeDoc?.body) {
                    const texto = iframeDoc.body.innerText?.trim();
                    if (texto && texto.length > 50) { content = texto.substring(0, 50000); mimeType = 'text/plain'; }
                }
            } catch (e) {}
            if (!content) {
                try {
                    const res = await fetch(frameHtml.src, { credentials: 'include' });
                    const blob = await res.blob();
                    const { tipo, conteudo } = await extraiTextoBlob(blob);
                    content = conteudo;
                    mimeType = tipo === 'pdf' ? 'application/pdf' : 'text/plain';
                } catch (e) { console.warn('AuditJE: erro fetch frameHtml:', e.message); }
            }
        }
    }

    // PDF: iframe frameBinario
    if (!content) {
        const frameBinario = document.getElementById('frameBinario');
        if (frameBinario?.src && !frameBinario.src.includes('chrome-extension')) {
            docId = extraiIdDocumento(frameBinario.src);
            name = extraiNomeDocumento(docId);
            if (docId) name = `[ID: ${docId}] ${name}`;
            try {
                const res = await fetch(frameBinario.src, { credentials: 'include' });
                const blob = await res.blob();
                content = await blobToBase64(blob);
                mimeType = 'application/pdf';
            } catch (e) { console.warn('AuditJE: erro fetch frameBinario:', e.message); }
        }
    }

    // Qualquer iframe com URL de documento
    if (!content) {
        const iframes = [...document.querySelectorAll(`iframe:not(#${IFRAME_ID})`)];
        for (const f of iframes) {
            if (!f.src || f.src.includes('chrome-extension') || f.src.includes('spacer')) continue;
            const id = extraiIdDocumento(f.src);
            if (!id) continue;
            docId = id;
            name = `[ID: ${docId}] ${extraiNomeDocumento(docId)}`;
            try {
                const res = await fetch(f.src, { credentials: 'include' });
                const blob = await res.blob();
                const { tipo, conteudo } = await extraiTextoBlob(blob);
                content = conteudo;
                mimeType = tipo === 'pdf' ? 'application/pdf' : 'text/plain';
                break;
            } catch (e) {}
        }
    }

    if (!content) {
        _postChat(chatIframe, {
            type: 'CHATJE_DOCUMENT',
            error: 'Nenhum documento visível encontrado. Abra um documento no PJe e tente novamente.'
        });
        return;
    }

    _postChat(chatIframe, { type: 'CHATJE_DOCUMENT', content, name, mimeType });
}

// ═══════════════════════════════════════════════════════════════
// 5. MAPEAMENTO DE DOCUMENTOS DO PROCESSO
// ═══════════════════════════════════════════════════════════════

function getLinksDocumentos() {
    return [...document.querySelectorAll('a[id*="divTimeLine"]')].filter(a =>
        a.textContent.trim().match(/^\d{6,}\s*-/)
    );
}

function getTimelineContainer() {
    return document.getElementById('divTimeLine:divEventosTimeLine') ||
           document.querySelector('[id*="divEventosTimeLine"]');
}

async function aguardarContainer(timeoutMs = 8000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
        const c = getTimelineContainer();
        if (c) return c;
        await new Promise(r => setTimeout(r, 300));
    }
    return null;
}

async function garantirTodosDocumentosCarregados(onProgresso) {
    // Espera a árvore de documentos ficar ociosa (Opção B: MutationObserver).
    // O relógio de quietude só reinicia quando a CONTAGEM de documentos cresce —
    // imune a ruído de DOM não relacionado (spinners, animações, re-render) que
    // antes reinseria nós e nunca deixava a árvore ficar ociosa. Encerra quando
    // não surge documento novo por QUIETUDE_MS, ou no teto de segurança.
    const container = getTimelineContainer();

    // Segurança-degradante: sem container ou sem MutationObserver → scroll antigo.
    if (!container || typeof MutationObserver === 'undefined') {
        return _garantirDocsPorScroll(onProgresso);
    }

    const TEMPO_MAX_MS       = 12000; // teto de segurança (pior caso)
    const QUIETUDE_MS        = 1800;  // sem documento NOVO por este tempo → árvore ociosa
    const INTERVALO_NUDGE_MS = 300;   // periodicidade do empurrão de scroll
    const inicio = Date.now();

    return new Promise(resolve => {
        let ultimoCount     = getLinksDocumentos().length;
        let ultimaAtividade = Date.now();
        let resolvido       = false;

        // Só conta como "atividade" o surgimento de um documento novo (a contagem
        // cresceu). Ignora inserções de nós não relacionadas a documentos, que de
        // outro modo manteriam a árvore eternamente "ativa" até o teto de tempo.
        function registrarSeCresceu() {
            const c = getLinksDocumentos().length;
            if (c > ultimoCount) {
                ultimoCount     = c;
                ultimaAtividade = Date.now();
            }
            return c;
        }

        // MutationObserver → reação imediata quando um documento é inserido.
        const observer = new MutationObserver(() => { registrarSeCresceu(); });
        observer.observe(container, { childList: true, subtree: true });

        // Empurra o scroll para acionar o lazy-load do PJe.
        const nudge = setInterval(() => {
            container.scrollTop = container.scrollHeight;
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
            window.scrollTo(0, document.body.scrollHeight);
        }, INTERVALO_NUDGE_MS);

        // Avalia as condições de parada.
        const checar = setInterval(() => {
            const agora = Date.now();
            const count = registrarSeCresceu();

            if (onProgresso) {
                const pct = Math.min(90, Math.round(((agora - inicio) / TEMPO_MAX_MS) * 100));
                onProgresso(count, pct);
            }

            const ocioso   = count > 0 && (agora - ultimaAtividade) >= QUIETUDE_MS;
            const estourou = (agora - inicio) >= TEMPO_MAX_MS;
            if (ocioso || estourou) finalizar(estourou);
        }, 150);

        function finalizar(porTimeout) {
            if (resolvido) return;
            resolvido = true;
            clearInterval(nudge);
            clearInterval(checar);
            observer.disconnect();
            const total = getLinksDocumentos().length;
            console.log(`AuditJE: ${total} documentos disponíveis na timeline` +
                        (porTimeout ? ' (teto de tempo atingido)' : ' (árvore ociosa)'));
            resolve();
        }
    });
}

// Força o carregamento via scroll cego (fallback preservado, comportamento
// idêntico ao anterior). Usado quando não há container/MutationObserver.
async function _garantirDocsPorScroll(onProgresso) {
    const container = getTimelineContainer();
    let anterior = -1;
    let semMudanca = 0;
    const maxTentativas = 40; // até ~16s de tentativas com scroll

    for (let i = 0; i < maxTentativas; i++) {
        if (container) {
            container.scrollTop = container.scrollHeight;
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 400));

        const atual = getLinksDocumentos().length;
        if (onProgresso && i % 2 === 0) {
            const pct = Math.min(90, Math.round((i / maxTentativas) * 100));
            onProgresso(atual, pct);
        }
        if (atual > 0 && atual === anterior) {
            semMudanca++;
            if (semMudanca >= 4) break;
        } else {
            semMudanca = 0;
        }
        anterior = atual;
    }
    console.log(`AuditJE: ${getLinksDocumentos().length} documentos disponíveis na timeline`);
}

// Força o carregamento de todos os documentos e notifica o chat
async function carregarTodosDocumentos() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;

    const antes = getLinksDocumentos().length;

    // Sinaliza início do carregamento
    _postChat(chatIframe, {
        type: 'CHATJE_DOCS_CARREGANDO',
        encontrados: antes,
        progresso: 0,
    });

    await garantirTodosDocumentosCarregados((encontrados, progresso) => {
        _postChat(chatIframe, {
            type: 'CHATJE_DOCS_CARREGANDO',
            encontrados,
            progresso,
        });
    });

    const depois = getLinksDocumentos().length;
    _postChat(chatIframe, {
        type: 'CHATJE_DOCS_CARREGADOS',
        total:    depois,
        novos:    depois - antes,
    });
}

function contarTotalDocumentos() {
    return getLinksDocumentos().length;
}

function mapearDocumentosProcesso() {
    const docs = [];
    const seen = new Set();

    // PJe 1G (JSF/Seam) — timeline
    getLinksDocumentos().forEach(a => {
        const texto = a.textContent?.trim().replace(/\s+/g, ' ') || '';
        const matchTexto = texto.match(/^(\d{6,})\s*-\s*(.+)$/);
        if (!matchTexto) return;
        const id = matchTexto[1];
        const nome = matchTexto[2].trim();
        if (seen.has(id)) return;
        seen.add(id);
        const urlDownload = `${window.location.origin}/pje/seam/resource/rest/pje-legacy/documento/download/${id}`;
        docs.push({ id, nome, link: a, href: '', urlDownload, idBin: null });
    });

    if (docs.length > 0) return docs;

    // PJe 2G (Angular) — fallback
    const seletoresAngular = [
        'app-arvore-documento li[id^="doc_"] a',
        'app-timeline li[id^="doc_"] a',
        '.tl-item-container a[href*="documento"]',
        'li[id^="doc_"] a'
    ];
    for (const sel of seletoresAngular) {
        document.querySelectorAll(sel).forEach(a => {
            const liEl = a.closest('li[id^="doc_"]') || a.closest('li');
            const idLi = liEl?.id?.match(/^doc_([a-zA-Z0-9]+)$/)?.[1] || null;
            const href = a.href || '';
            const idNumerico = extraiIdDocumento(href);
            const id = idNumerico || idLi;
            if (!id || seen.has(id)) return;
            seen.add(id);
            const nome = a.textContent?.trim().replace(/\s+/g, ' ') || 'Documento';
            const urlDownload = `${window.location.origin}/pje/seam/resource/rest/pje-legacy/documento/download/${id}`;
            docs.push({ id, nome, link: a, href, urlDownload, idBin: null });
        });
        if (docs.length > 0) break;
    }

    return docs;
}


// ═══════════════════════════════════════════════════════════════
// 7. AUDITORIA COMPLETA
// ═══════════════════════════════════════════════════════════════

async function auditarProcesso() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;
    await garantirTodosDocumentosCarregados();
    const todos = mapearDocumentosProcesso();
    if (todos.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhum documento encontrado na árvore do processo.'
        });
        return;
    }
    const { nome: requerente, cpf: cpfRequerente } = extrairDadosRequerente();
    const totalProcesso = contarTotalDocumentos();
    _postChat(chatIframe, {
        type: 'CHATJE_AUDITORIA_START',
        total: todos.length, totalReal: totalProcesso,
        requerente, cpf: cpfRequerente,
        aviso: null,
        titulo: 'AUDITORIA — PROCESSO COMPLETO'
    });
    // Envia conteúdo do RRC/Petição Inicial em background para popular o card
    await processarListaAuditoria(todos, chatIframe, requerente, cpfRequerente);
}

// ═══════════════════════════════════════════════════════════════
// 8. AUDITORIA DE DOCUMENTOS PRINCIPAIS
// ═══════════════════════════════════════════════════════════════

async function auditarDocumentosPrincipais() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;
    await garantirTodosDocumentosCarregados();
    const todos = mapearDocumentosProcesso();
    if (todos.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhum documento encontrado na árvore do processo.'
        });
        return;
    }
    const norm = s => s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Diagnóstico: exibe todos os nomes normalizados no console
    console.log('[AuditJE] Documentos na árvore:', todos.map(d => `"${d.nome}"`).join(' | '));

    const _eRRC = n =>
        /\brrc\b/.test(n) ||
        /requerimento.*registro/.test(n) ||
        /registro.*candidatura/.test(n) ||
        /formulario.*registro.*candidatura/.test(n);

    const _ePeticaoInicial = n =>
        /peticao.*inicial|inicial.*peticao/.test(n);

    const _eRelatorioRequisitos = n =>
        /relatorio.*requisito|requisito.*registro|relatorio.*registro/.test(n);

    // Exclui petições intermediárias (habilitação, outras, avulsas), mas NÃO a petição inicial nem o RRC
    // Também exclui o Relatório de requisitos para registro — ele delimita o intervalo mas não é auditado
    const tiposExcluidos = d => {
        const n = norm(d.nome.replace(/\([^)]+\)/g, '').trim());
        if (_ePeticaoInicial(n)) return false;      // INCLUI petição inicial
        if (_eRRC(n)) return false;                 // INCLUI RRC / Registro de Candidatura
        if (_eRelatorioRequisitos(n)) return true;  // EXCLUI Relatório de requisitos para registro
        if (/^peticao(?!\s+inicial)/.test(n)) return true; // exclui demais petições
        return false;
    };

    const idxPeticao = todos.findIndex(d =>
        _ePeticaoInicial(norm(d.nome.replace(/\([^)]+\)/g, '')))
    );
    // RRC pode estar antes ou depois da Petição Inicial na lista
    const idxRRC = todos.findIndex(d =>
        _eRRC(norm(d.nome.replace(/\([^)]+\)/g, '')))
    );
    console.log(`[AuditJE] idxPeticao=${idxPeticao} (${todos[idxPeticao]?.nome ?? 'não encontrado'}), idxRRC=${idxRRC} (${todos[idxRRC]?.nome ?? 'não encontrado'})`);
    let idxRelatorio = -1;
    for (let i = todos.length - 1; i >= 0; i--) {
        if (/relatorio.*requisito|requisito.*registro/i.test(norm(todos[i].nome))) {
            idxRelatorio = i;
            break;
        }
    }

    // Determina o intervalo: do relatório à petição/RRC mais distante
    const idxFim = Math.max(idxPeticao, idxRRC);
    let docs;
    if (idxRelatorio >= 0 && idxFim >= 0) {
        const start = Math.min(idxRelatorio, idxFim);
        const end   = Math.max(idxRelatorio, idxFim);
        docs = todos.slice(start, end + 1).filter(d => !tiposExcluidos(d));
    } else if (idxRelatorio >= 0) {
        docs = todos.slice(idxRelatorio).filter(d => !tiposExcluidos(d));
    } else if (idxFim >= 0) {
        docs = todos.slice(0, idxFim + 1).filter(d => !tiposExcluidos(d));
    } else {
        docs = todos.filter(d => !tiposExcluidos(d));
    }
    if (docs.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhum documento principal encontrado.'
        });
        return;
    }
    const { nome: requerente, cpf: cpfRequerente } = extrairDadosRequerente();
    const totalProcesso = contarTotalDocumentos();
    _postChat(chatIframe, {
        type: 'CHATJE_AUDITORIA_START',
        total: docs.length, totalReal: totalProcesso,
        requerente, cpf: cpfRequerente,
        aviso: null,
        titulo: 'AUDITORIA — DOCUMENTOS PRINCIPAIS'
    });

    await processarListaAuditoria(docs, chatIframe, requerente, cpfRequerente);
}

// ── Helper: busca RRC e Petição Inicial e envia CHATJE_CONTEUDO_PETICAO ────────
// Usado por todos os modos de auditoria para garantir que o card do processo
// seja preenchido (cargo em comissão, doc. de identidade, nome para urna, etc.).
function _enviarConteudoParaCard(todos, chatIframe) {
    const norm = s => s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const normSemArq = n => norm(n.replace(/\([^)]+\)/g, ''));

    const idxPeticao = todos.findIndex(d => /peticao.*inicial|inicial.*peticao/.test(normSemArq(d.nome)));
    const idxRRC     = todos.findIndex(d =>
        /\brrc\b|requerimento.*registro|registro.*candidatura/.test(normSemArq(d.nome))
    );

    const docsParaCard = [];
    if (idxPeticao >= 0) docsParaCard.push(todos[idxPeticao]);
    if (idxRRC >= 0 && idxRRC !== idxPeticao) docsParaCard.push(todos[idxRRC]);

    for (const docCard of docsParaCard) {
        (async () => {
            try {
                const urlFetch = docCard.urlDownload ||
                    `${window.location.origin}/pje/seam/resource/rest/pje-legacy/documento/download/${docCard.id}`;
                const res = await fetch(urlFetch, { credentials: 'include' });
                if (!res.ok || res.status === 204) return;
                const blob = await res.blob();
                const resultado = await extraiTextoBlob(blob);
                if (resultado) {
                    _postChat(chatIframe, {
                        type: 'CHATJE_CONTEUDO_PETICAO',
                        tipo:     resultado.tipo,
                        conteudo: resultado.conteudo,
                    });
                }
            } catch (e) {
                console.warn('AuditJE: erro ao buscar doc para card:', e.message);
            }
        })();
    }
}

// ═══════════════════════════════════════════════════════════════
// 9. AUDITORIA FILTRADA — CERTIDÕES E DOCS. ESPECÍFICOS
// Exibe apenas: certidões criminais, comprovante de escolaridade,
// desincompatibilização e identidade.
// ═══════════════════════════════════════════════════════════════

function _eFiltradoCertidoes(nomeDoc) {
    const n = nomeDoc.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Certidões criminais de qualquer jurisdição
    if (/certid/.test(n) && (
        /criminal|antecedente|distribui|objeto.*pe|pe.*objeto/.test(n) ||
        /estadual|federal|trabalhist|eleitoral|militar|stj|stf|stm|tjm|trf|jf/.test(n)
    )) return true;

    // Comprovante de escolaridade / diploma
    if (/escolaridade|diploma|historico.*escolar|grau.*instrucao|certificado.*conclus/.test(n)) return true;

    // Desincompatibilização
    if (/desincompat/.test(n)) return true;

    // Identidade (RG, CNH, passaporte, CPF)
    if (/^identidade|^rg\b|^cnh\b|^passaporte|documento.*identidade|identidade.*civil/.test(n)) return true;

    return false;
}

async function auditarCertidoes() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;
    await garantirTodosDocumentosCarregados();
    const todos = mapearDocumentosProcesso();
    if (todos.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhum documento encontrado na árvore do processo.'
        });
        return;
    }

    // Filtra apenas os tipos relevantes
    const docs = todos.filter(d => _eFiltradoCertidoes(
        d.nome.replace(/\([^)]+\)/g, '').replace(/\s*-\s*[Ff]im\s+\w+\s*$/i, '').trim()
    ));

    if (docs.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhuma certidão criminal, comprovante de escolaridade, desincompatibilização ou identidade encontrada na árvore do processo.'
        });
        return;
    }

    const { nome: requerente, cpf: cpfRequerente } = extrairDadosRequerente();
    const totalProcesso = contarTotalDocumentos();
    _postChat(chatIframe, {
        type: 'CHATJE_AUDITORIA_START',
        total: docs.length, totalReal: totalProcesso,
        requerente, cpf: cpfRequerente,
        aviso: docs.length < totalProcesso
            ? `Exibindo ${docs.length} de ${totalProcesso} documentos (filtro: certidões, escolaridade, desincompatibilização e identidade)`
            : null,
        titulo: 'AUDITORIA — CERTIDÕES E DOCS. ESPECÍFICOS'
    });
    // Envia conteúdo do RRC/Petição Inicial em background para popular o card
    _enviarConteudoParaCard(todos, chatIframe);
    await processarListaAuditoria(docs, chatIframe, requerente, cpfRequerente);
}

async function listarDocumentosParaChat() {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;
    await garantirTodosDocumentosCarregados();
    const docs = mapearDocumentosProcesso().map(d => ({ id: d.id, nome: d.nome }));
    _postChat(chatIframe, { type: 'CHATJE_LISTA_DOCS', docs });
}

async function auditarSeletivo(ids) {
    const chatIframe = getChatIframe();
    if (!chatIframe) return;
    await garantirTodosDocumentosCarregados();
    const todos = mapearDocumentosProcesso();
    const selecionados = todos.filter(d => ids.includes(d.id));
    if (selecionados.length === 0) {
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA',
            error: 'Nenhum documento selecionado encontrado na árvore do processo.'
        });
        return;
    }
    const { nome: requerente, cpf: cpfRequerente } = extrairDadosRequerente();
    _postChat(chatIframe, {
        type: 'CHATJE_AUDITORIA_START',
        total: selecionados.length,
        totalReal: todos.length,
        requerente,
        cpf: cpfRequerente,
        aviso: `Auditando ${selecionados.length} documento(s) novo(s) selecionado(s) — dados anteriores serão preservados`,
        titulo: 'AUDITORIA — DOCUMENTOS NOVOS',
        seletiva: true
    });
    _enviarConteudoParaCard(todos, chatIframe);
    await processarListaAuditoria(selecionados, chatIframe, requerente, cpfRequerente);
}

function aguardarIframeDetalhe(idEsperado, timeoutMs = 8000) {
    return new Promise(resolve => {
        const inicio = Date.now();
        const check = () => {
            const docDiv = document.getElementById('detalheDocumento:docHtml');
            const iframes = docDiv ? [...docDiv.querySelectorAll('iframe')] : [];
            const todos = [
                ...iframes,
                document.getElementById('frameHtml'),
                document.getElementById('frameBinario')
            ].filter(Boolean);
            for (const f of todos) {
                const src = f.src || '';
                if (src && !src.includes('chrome-extension') && !src.includes('about:blank') && src.includes(idEsperado)) {
                    return resolve(src);
                }
            }
            if (Date.now() - inicio > timeoutMs) return resolve(null);
            setTimeout(check, 300);
        };
        setTimeout(check, 500);
    });
}

// ═══════════════════════════════════════════════════════════════
// 10. PROCESSAMENTO PRINCIPAL DA LISTA DE AUDITORIA
// ═══════════════════════════════════════════════════════════════

// Timeout por documento — valor canônico em config.js; replicado aqui pois
// content.js não tem acesso ao escopo do iframe
const DOC_TIMEOUT_MS = 45000;

async function processarListaAuditoria(docs, chatIframe, requerente = null, cpfRequerente = null) {
    const resultados = [];
    _auditoriaCancelada = false; // Reseta ao iniciar
    _auditoriaAbortCtrl = new AbortController();
    const _signal = _auditoriaAbortCtrl.signal;

    for (const doc of docs) {
        // ── Cancelamento ─────────────────────────────────────
        if (_auditoriaCancelada) {
            console.log('AuditJE: auditoria cancelada pelo usuário');
            _postChat(chatIframe, { type: 'CHATJE_AUDITORIA_CANCELADA' });
            return;
        }

        const resultado = { id: doc.id, nome: doc.nome, status: 'erro', tipo: '-', base64: null };

        const tipoNorm = doc.nome.replace(/\([^)]+\)/g, '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
        const _isDocParaCard = /\brrc\b|requerimento.*registro|registro.*candidatura|peticao.*inicial|inicial.*peticao/.test(tipoNorm);

        // Atos processuais — não são documentos obrigatórios do CAND
        // Classificados como "outros" / "dispensado": sem OCR, sem pendência, sem diligência
        const _eAtoProc = (() => {
            const n = tipoNorm; // já normalizado e sem parênteses
            if (/peticao.*inicial|inicial.*peticao|rrc|requerimento.*registro|registro.*candidatura/.test(n)) return false;
            const _ATOS = ['peticao', 'procuracao', 'cota', 'sentenca', 'intimacao'];
            const primeiraPalavra = n.split(' ')[0];
            return _ATOS.includes(primeiraPalavra);
        })();
        if (_eAtoProc) {
            resultado.status           = 'dispensado';
            resultado.tipoIdentificado = 'outros';
            resultado._verificacao     = 'outros';
            resultado.labelTipo        = 'Ato processual';
            resultado.tipo             = 'outros';
            resultados.push(resultado);
            _postChat(chatIframe, {
                type: 'CHATJE_AUDITORIA_PROGRESSO',
                atual: resultados.length, total: docs.length,
                resultado: { id: resultado.id, nome: resultado.nome, status: resultado.status,
                             tipo: resultado.tipo, tipoIdentificado: 'outros', _verificacao: 'outros', labelTipo: 'Ato processual' }
            });
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        if (/^identidade|^comprovante.*(escolaridade|titulo)|^titulo.*eleitoral|relatorio.*(requisito|registro)|declarac.*bens|bens.*declarac/.test(tipoNorm)) {
            resultado.status = 'presente';
            resultado.tipo = 'humano';
            resultados.push(resultado);
            _postChat(chatIframe, {
                type: 'CHATJE_AUDITORIA_PROGRESSO',
                atual: resultados.length, total: docs.length,
                resultado: { id: resultado.id, nome: resultado.nome, status: resultado.status, tipo: resultado.tipo }
            });
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        // ── Timeout por documento ─────────────────────────────
        let _docTimeoutId;
        const _docTimeoutPromise = new Promise((_, reject) => {
            _docTimeoutId = setTimeout(() => reject(Object.assign(new Error('doc_timeout'), { name: 'DocTimeoutError' })), DOC_TIMEOUT_MS);
        });

        try {
            await Promise.race([
                (async () => {
            let urlFetch = null;

            if (doc.link && doc.link.id?.includes('divTimeLine')) {
                doc.link.click();
                urlFetch = await aguardarIframeDetalhe(doc.id);
            }

            if (!urlFetch) {
                urlFetch = doc.urlDownload ||
                    `${window.location.origin}/pje/seam/resource/rest/pje-legacy/documento/download/${doc.id}`;
            }

            const res = await fetch(urlFetch, { credentials: 'include', signal: _signal });

            if (res.ok && res.status !== 204) {
                const blob = await res.blob();
                if (blob.size > 100) {
                    const { tipo, conteudo } = await extraiTextoBlob(blob);
                    resultado.tipo = tipo;
                    if (tipo === 'pdf') {
                        resultado.status = 'pdf_pendente';
                        resultado.base64 = conteudo;
                        resultado._url = urlFetch;
                    } else {
                        resultado._url = urlFetch; // preserva URL para que o visualizador HTML possa buscar
                        const corresponde = verificaCorrespondenciaHeuristica(doc.nome, conteudo);
                        resultado._textoAmostra = conteudo.substring(0, _isDocParaCard ? 50000 : 5000);
                        console.log(`[AuditJE][content-html] "${doc.nome}" | tipo blob: ${tipo} | corresponde: ${corresponde} | amostra: "${conteudo.substring(0,120).replace(/\n/g,' ')}"`);

                        if (corresponde === null) {
                            resultado._verificacao = 'inconclusivo';
                            resultado._conteudo    = null;
                            console.warn(`[AuditJE][content-html] "${doc.nome}" → inconclusivo (corresponde=null)`);
                        } else if (corresponde === 'presente') {
                            resultado._verificacao = 'humano';
                            resultado._conteudo    = null;
                        } else if (corresponde) {
                            if (requerente && eCertidaoNominal(doc.nome)) {
                                // Identifica tipo pelo conteúdo para enriquecer o aviso
                                const { tipo: tipoHtml, label: labelHtml } = identificarTipoPeloTexto(conteudo);
                                console.log(`[AuditJE][content-html] "${doc.nome}" | tipo OCR: ${tipoHtml} (${labelHtml}) | requerente: "${requerente}"`);
                                const resNome = verificaNomeNoCertidao(requerente, conteudo);
                                const resCPF  = cpfRequerente
                                    ? verificaCPFNaCertidao(cpfRequerente, conteudo)
                                    : { encontrado: true, detalhes: 'CPF não informado' };
                                resultado._nomeEncontrado   = resNome.encontrado;
                                resultado._cpfEncontrado    = resCPF.encontrado;
                                resultado._tipoIdentificado = labelHtml || tipoHtml || '';
                                if (!resNome.encontrado) {
                                    resultado._verificacao = 'pessoa_errada';
                                    resultado._conteudo    = 'completo';
                                    resultado._avisoNome   = `nome "${requerente}" não encontrado — ${resNome.detalhes}`;
                                } else if (!resCPF.encontrado) {
                                    resultado._verificacao   = 'corresponde';
                                    resultado._conteudo      = 'incompleto';
                                    resultado._avisoConteudo = `CPF "${cpfRequerente}" não encontrado — ${resCPF.detalhes}`;
                                } else {
                                    resultado._verificacao = 'corresponde';
                                    resultado._conteudo    = 'completo';
                                    if (resNome.detalhes.includes('tipográfico'))
                                        resultado._avisoNome = `⚠️ ${resNome.detalhes}`;
                                }
                            } else {
                                resultado._verificacao = 'corresponde';
                                resultado._conteudo    = 'completo';
                            }
                        } else {
                            // HTML: sem OCR de tipo → inconclusivo (não conseguimos identificar nomenclatura_errada)
                            console.warn(`[AuditJE][content-html] "${doc.nome}" → inconclusivo (corresponde=false, sem tipo identificado)`);
                            resultado._verificacao = 'inconclusivo';
                            resultado._conteudo    = null;
                        }

                        // Deriva status legado para compatibilidade (postMessage usa status)
                        resultado.status = resultado._verificacao === 'humano'        ? 'presente'
                                         : resultado._verificacao === 'corresponde'   ? 'corresponde'
                                         : resultado._verificacao === 'pessoa_errada' ? 'nao_corresponde_nome'
                                         : 'inconclusivo';
                        console.log(`[AuditJE][content-html] "${doc.nome}" → status: ${resultado.status} | _verificacao: ${resultado._verificacao} | _conteudo: ${resultado._conteudo} | avisoNome: ${resultado._avisoNome ?? ''} | avisoConteudo: ${resultado._avisoConteudo ?? ''}`);
                    }
                } else {
                    resultado.status = 'sem_conteudo';
                }
            } else {
                resultado.status = 'sem_conteudo';
            }
                })(),
                _docTimeoutPromise,
            ]);
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('AuditJE: fetch cancelado para doc', doc.id);
                clearTimeout(_docTimeoutId);
                break; // sai do loop imediatamente
            }
            if (e.name === 'DocTimeoutError') {
                resultado.status = 'timeout';
                console.warn('AuditJE: timeout ao auditar doc', doc.id, `(${DOC_TIMEOUT_MS / 1000}s)`);
            } else {
                resultado.status = 'erro';
                console.warn('AuditJE: erro ao auditar doc', doc.id, e.message);
            }
        } finally {
            clearTimeout(_docTimeoutId);
        }

        resultados.push(resultado);
        if (_isDocParaCard && (resultado.base64 || resultado._textoAmostra)) {
            _postChat(chatIframe, {
                type: 'CHATJE_CONTEUDO_PETICAO',
                tipo:     resultado.tipo,
                conteudo: resultado.tipo === 'pdf' ? resultado.base64 : resultado._textoAmostra,
            });
        }
        _postChat(chatIframe, {
            type: 'CHATJE_AUDITORIA_PROGRESSO',
            atual: resultados.length, total: docs.length,
            resultado: { id: resultado.id, nome: resultado.nome, status: resultado.status, tipo: resultado.tipo }
        });
        await new Promise(r => setTimeout(r, 300));
    }

    // Libera o worker Tesseract após a auditoria (evita manter WASM na memória)
    if (typeof terminarWorkerOCR === 'function') terminarWorkerOCR();

    _postChat(chatIframe, { type: 'CHATJE_AUDITORIA_FIM', resultados });
}

// ═══════════════════════════════════════════════════════════════
// 11. LISTENERS DE MENSAGENS DO CHAT.HTML
// ═══════════════════════════════════════════════════════════════

// Auxiliar: envia mensagem ao iframe com origem explícita (nunca '*')
function _postChat(chatIframe, data) {
    chatIframe?.contentWindow?.postMessage(data, _CHAT_ORIGIN);
}

// Auxiliar: tenta fetch de uma URL e envia o base64 resultante ao chat.html.
// Retorna true se conseguiu, false caso contrário.
async function _tentarFetchPDF(fetchUrl, id, chatIframe, signal) {
    try {
        const res = await fetch(fetchUrl, { credentials: 'include', signal });
        if (!res.ok || res.status === 204) return false;
        const blob = await res.blob();
        if (blob.size < 100) return false;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                _postChat(chatIframe, {
                    type: 'CHATJE_PDF_BASE64', id,
                    base64: reader.result.split(',')[1],
                    mimeType: blob.type || 'application/octet-stream'
                });
                resolve(true);
            };
            reader.onerror = () => resolve(false);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        if (e.name !== 'AbortError') console.warn('[AuditJE] _tentarFetchPDF erro:', e.message);
        return false;
    }
}

// Dispatcher único — substitui os três addEventListener anteriores.
// Valida event.origin antes de processar qualquer mensagem.
window.addEventListener('message', async (event) => {
    // Rejeita mensagens de origens que não sejam o próprio iframe da extensão
    if (!event.origin.startsWith(_CHAT_ORIGIN)) return;
    if (event.data?.source !== 'chatje-iframe') return;

    const chatIframe = getChatIframe();
    const { type } = event.data;

    switch (type) {
        case 'CHATJE_ABRIR_PAINEL':
            _abrirPainelExterno?.();
            break;

        case 'CHATJE_FECHAR_PAINEL':
            _fecharPainelExterno?.();
            break;

        case 'REQUEST_DOCUMENT':
            captureAndSendDocument();
            break;

        case 'REQUEST_AUDITORIA':
            auditarProcesso();
            break;

        case 'REQUEST_AUDITORIA_PRINCIPAL':
            auditarDocumentosPrincipais();
            break;

        case 'REQUEST_AUDITORIA_CERTIDOES':
            auditarCertidoes();
            break;

        case 'CANCEL_AUDITORIA':
            _auditoriaCancelada = true;
            _auditoriaAbortCtrl?.abort();
            if (typeof terminarWorkerOCR === 'function') terminarWorkerOCR();
            break;

        case 'REQUEST_CARREGAR_DOCS':
            carregarTodosDocumentos();
            break;

        case 'CHATJE_SERVIDOR_READY':
            // O iframe avisa que carregou e manda o nome salvo no seu localStorage
            if (event.data.nome) _servidorNome = event.data.nome;
            // Re-envia INFO_PROCESSO imediatamente — garante que chegue após o
            // listener do iframe estar registrado (evita race condition no load)
            enviarInfoProcesso();
            break;

        case 'REQUEST_LISTA_DOCS':
            listarDocumentosParaChat();
            break;

        case 'REQUEST_AUDITORIA_SELETIVA':
            auditarSeletivo(event.data.ids || []);
            break;

        case 'REQUEST_PDF_BASE64': {
            if (!chatIframe) break;
            const { id, url } = event.data;

            // Tentativa 1: URL fornecida pelo chat.js ou URL padrão de download
            const defaultUrl = url ||
                `${window.location.origin}/pje/seam/resource/rest/pje-legacy/documento/download/${id}`;
            const _pdfSignal = _auditoriaAbortCtrl?.signal;
            if (await _tentarFetchPDF(defaultUrl, id, chatIframe, _pdfSignal)) break;

            // Tentativa 2: clicar no link da timeline e aguardar o iframe carregar
            // (necessário para docs que a auditoria marca como "presente" sem fetch)
            try {
                const linkDoc = getLinksDocumentos().find(a =>
                    (a.textContent?.trim() || '').startsWith(id)
                );
                if (linkDoc) {
                    linkDoc.click();
                    const iframeSrc = await aguardarIframeDetalhe(id, 8000);
                    if (iframeSrc && await _tentarFetchPDF(iframeSrc, id, chatIframe, _pdfSignal)) break;
                }
            } catch (e) {
                console.warn('AuditJE: erro ao tentar fallback via timeline para doc', id, e.message);
            }

            // Falhou em todas as tentativas
            _postChat(chatIframe, { type: 'CHATJE_PDF_BASE64', id, base64: null });
            break;
        }

        case 'REQUEST_PROCESSO_ASSOCIADO': {
            if (!chatIframe) break;
            // Captura direto da pagina (campo "Processo referencia"), sem navegar para a aba Associados
            const numero = extrairProcessoReferencia() || extrairProcessoAssociado();
            _postChat(chatIframe, { type: 'CHATJE_PROCESSO_ASSOCIADO', numero: numero || null });
            break;
        }

        case 'REQUEST_ATOS_PROCESSUAIS': {
            if (!chatIframe) break;
            const atos = extrairAtosProcessuais();
            _postChat(chatIframe, { type: 'CHATJE_ATOS_PROCESSUAIS', atos });
            break;
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// 12. CAPTURA DO PROCESSO ASSOCIADO (Ata de Convenção)
// ═══════════════════════════════════════════════════════════════

function _textoEl(el) {
    // textContent é mais confiável que innerText em content scripts
    return (el?.textContent || el?.innerText || '').trim();
}

function extrairProcessoReferencia() {
    // Captura o "Processo referencia" (o associado) do proprio cabecalho, sem navegar.
    const numAtual = (extrairNumeroProcesso() || '').replace(/\D/g, '');
    const scopeSel = ['#divProcesso', '#main-content', '#conteudo', 'form[id*="processo"]'];
    const scope = scopeSel.map(sel => document.querySelector(sel)).find(Boolean) || document.body;
    const txt = (_textoEl(scope) || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
    const m = txt.match(/referencia[:\s]*?(\d{20})/i)
           || txt.match(/referencia[:\s]*?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i);
    if (!m) return null;
    let cnj = m[1];
    if (/^\d{20}$/.test(cnj)) cnj = cnj.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6');
    if (cnj.replace(/\D/g, '') === numAtual) return null;
    console.log('[AuditJE] processo referencia (pagina) ->', cnj);
    return cnj;
}

function extrairProcessoAssociado() {
    // Número do processo ATUAL — excluir para não capturar o próprio processo como associado
    const numAtual = extrairNumeroProcesso() || '';
    const vistos   = new Set([numAtual].filter(Boolean));
    const result   = [];
    const reCNJ    = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/;
    const reTipos  = /(RCand|DRAP|AIJE|AIME|RCED|REspe|RO|PET|MC|MS|Rcand|Registro)\s+(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;

    // ── 1. Links dentro de qualquer tabela de associados ─────────────────────
    // j_id7418 é sufixo JSF dinâmico — removido para não depender da sessão
    const links = document.querySelectorAll([
        'a[id*="associadosTable"]',
        '#divAssociado a',
        '#ajaxDivAssociados a',
        '#divProcessosAssociados a',
    ].join(', '));

    links.forEach(a => {
        const txt = _textoEl(a);
        if (txt.length < 10) return;
        const m = txt.match(reCNJ);
        if (m && !vistos.has(m[1])) { vistos.add(m[1]); result.push(m[1]); }
    });
    console.log('[AuditJE] associado – links:', links.length, '→', result[0] || 'nenhum');
    if (result.length > 0) return result[0];

    // ── 2. Texto dos containers de associados ─────────────────────────────────
    const sels = [
        '#divAssociado', '#ajaxDivAssociados', '#divProcessosAssociados',
        '[id*="associados"]', '.rich-tabpanel-content',
    ];
    for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const txt = _textoEl(el);
        let m; reTipos.lastIndex = 0;
        while ((m = reTipos.exec(txt)) !== null) {
            if (!vistos.has(m[2])) { vistos.add(m[2]); result.push(m[2]); }
        }
        if (result.length > 0) {
            console.log('[AuditJE] associado – container', sel, '→', result[0]);
            return result[0];
        }
    }

    // ── 3. Fallback: varre <a> dentro de containers de abas/painel do PJe ─────
    // Restrito a áreas que tipicamente exibem processos associados,
    // evitando falsos positivos de números CNJ em menus, cabeçalhos e rodapés.
    const _CONTAINERS_ABA = [
        '#main-content', '#conteudo', '#divProcesso',
        '.rich-tabpanel', '.rf-tab-cont',
        '[id*="tabPanel"]', '[id*="TabPanel"]',
        'form[id*="processo"]',
    ];
    const _scopeEl = _CONTAINERS_ABA.map(s => document.querySelector(s)).find(Boolean) || null;
    const _linkScope = _scopeEl || document; // usa document só se não achou container
    _linkScope.querySelectorAll('a').forEach(a => {
        const txt = _textoEl(a);
        const m = txt.match(reCNJ);
        if (m && !vistos.has(m[1]) && txt.length > 10) {
            vistos.add(m[1]); result.push(m[1]);
        }
    });
    if (result.length > 0) {
        console.log('[AuditJE] associado – fallback <a> em container →', result[0]);
        return result[0];
    }

    // ── 4. Último recurso: varre apenas o container principal (não o body inteiro) ──
    // Limita a busca ao painel de conteúdo do processo para evitar números CNJ
    // de outros processos listados em menus laterais ou histórico de navegação.
    const _bodyScope = _scopeEl;
    if (!_bodyScope)    if (!_bodyScope) {
        console.log('[AuditJE] associado – nenhum container encontrado, desistindo');
        return null;
    }
    const bodyTxt = _textoEl(_bodyScope);
    reTipos.lastIndex = 0;
    let mBody;
    while ((mBody = reTipos.exec(bodyTxt)) !== null) {
        if (!vistos.has(mBody[2])) {
            console.log('[AuditJE] associado – container regex →', mBody[2]);
            return mBody[2];
        }
    }
    return null;
}

// ─── Documentos excluídos dos Atos Processuais ──────────────────────────────
// São os mesmos analisados na aba de Análise documental (auditoria CAND):
// certidões criminais, escolaridade, identidade, declaração de bens,
// Petição Inicial e RRC.
function _eExcluidoAtos(nomeDoc) {
    const n = (nomeDoc || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Certidões criminais (todos os tipos da auditoria CAND)
    if (/certid/.test(n) && (
        /criminal|antecedente|distribui|objeto.*pe|pe.*objeto/.test(n) ||
        /estadual|federal|trabalhist|eleitoral|militar|stj|stf|stm|tjm|trf|\bjf\b/.test(n)
    )) return true;

    // Comprovante de escolaridade / diploma
    if (/escolaridade|diploma|historico.*escolar|grau.*instrucao|certificado.*conclus/.test(n)) return true;

    // Identidade (RG, CNH, passaporte, doc de identidade)
    if (/^identidade|^rg\b|^cnh\b|^passaporte|documento.*identidade|identidade.*civil/.test(n)) return true;

    // Declaração de bens
    if (/declaracao.*bens|bens.*declaracao/.test(n)) return true;

    // Petição Inicial
    if (/peticao.*inicial|inicial.*peticao/.test(n)) return true;

    // RRC (Requerimento de Registro de Candidatura)
    if (/^rrc\b|requerimento.*registro.*candidatura|registro.*candidatura/.test(n)) return true;

    // Desincompatibilização (já analisada na auditoria)
    if (/desincompat/.test(n)) return true;

    return false;
}

// ═══════════════════════════════════════════════════════════════
// 13. CAPTURA DE ATOS PROCESSUAIS

// ═══════════════════════════════════════════════════════════════

function extrairAtosProcessuais() {
    const atos = [];
    const vistos = new Set();

    // ── 1. Movimentos da timeline (PJe 1G — divTimeLine) ────────────────────
    // Cada evento na timeline tem um <tr> com célula de data e célula de descrição
    const containerTimeline = getTimelineContainer();
    if (containerTimeline) {
        // Estrutura típica: tr > td.data + td.descricao ou similares
        containerTimeline.querySelectorAll('tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 2) return;

            // Tenta encontrar célula de data (contém dd/mm/yyyy)
            let dataTxt = '';
            let descTxt = '';
            tds.forEach(td => {
                const txt = (td.textContent || '').trim();
                if (!dataTxt && /\d{2}\/\d{2}\/\d{4}/.test(txt)) {
                    dataTxt = txt.match(/\d{2}\/\d{2}\/\d{4}/)[0];
                } else if (!descTxt && txt.length > 3 && !/^\d{2}\/\d{2}\/\d{4}$/.test(txt)) {
                    descTxt = txt;
                }
            });

            if (!descTxt) return;
            const chave = `${dataTxt}|${descTxt}`;
            if (vistos.has(chave)) return;
            vistos.add(chave);

            atos.push({ nome: descTxt, data: dataTxt, fonte: 'timeline' });
        });
    }

    // ── 2. Movimentos via seletores de evento genéricos (PJe 1G e 2G) ───────
    if (atos.length === 0) {
        const seletoresEvento = [
            '[id*="divTimeLine"] tr',
            '.timeline-event',
            '.tl-item',
            '.tl-item-container',
            'app-timeline .timeline-item',
        ];
        for (const sel of seletoresEvento) {
            document.querySelectorAll(sel).forEach(el => {
                const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt || txt.length < 5) return;

                const mData = txt.match(/(\d{2}\/\d{2}\/\d{4})/);
                const dataTxt = mData ? mData[1] : '';

                // Remove a data do texto da descrição
                const descTxt = txt.replace(/\d{2}\/\d{2}\/\d{4}(\s+\d{2}:\d{2})?/, '').trim();
                if (!descTxt || descTxt.length < 3) return;

                const chave = `${dataTxt}|${descTxt}`;
                if (vistos.has(chave)) return;
                vistos.add(chave);

                atos.push({ nome: descTxt, data: dataTxt, fonte: 'timeline-gen' });
            });
            if (atos.length > 0) break;
        }
    }

    // ── 3. Documentos da árvore (excluindo os da auditoria CAND) ────────────
    // Exclui: certidões criminais, escolaridade, identidade, declaração de bens,
    // Petição Inicial e RRC — esses já são analisados na aba de Análise documental.
    const docs = mapearDocumentosProcesso();
    docs.forEach(doc => {
        const chave = `doc|${doc.id}`;
        if (vistos.has(chave)) return;
        if (_eExcluidoAtos(doc.nome)) return;
        vistos.add(chave);

        atos.push({
            nome: doc.nome,
            data: '',
            tipo: 'documento',
            origem: 'arvore'
        });
    });

    // Ordena: com data primeiro (mais recente), sem data no final
    atos.sort((a, b) => {
        if (a.data && b.data) return b.data.localeCompare(a.data);
        if (a.data) return -1;
        if (b.data) return 1;
        return 0;
    });

    return atos;
}
