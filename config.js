// config.js — Constantes globais da extensão AuditJE
// Carregado antes de todos os outros scripts (ver chat.html).
// Centraliza valores que antes estavam espalhados inline em pdfextract.js,
// content.js e chat.js, facilitando ajustes sem caça ao valor.

// ── OCR / Extração de PDF ─────────────────────────────────────────────────────
const TEXTO_MIN    = 80;     // chars mínimos para considerar texto nativo válido
const PAGINAS_MAX  = 15;     // limite de páginas por PDF (evita travamentos)
const OCR_ESCALA   = 2.0;    // resolução de renderização para OCR (2× = melhor qualidade)
const TEXTO_LIMITE = 15000;  // chars máximos retornados por extrairTextoPDF

// ── Auditoria ─────────────────────────────────────────────────────────────────
const DOC_TIMEOUT_MS  = 45000;  // 45 s máximo por documento na auditoria
const PROCESSO_TIMEOUT_MS = 8000; // 8 s para aguardar processo associado

// ── UI / Painel ───────────────────────────────────────────────────────────────
// Os IDs do painel/iframe/toggle vivem em content.js (mundo isolado) e não são
// referenciados pelos módulos do iframe — removidos daqui para evitar constante
// morta (auditoria técnica, item B2).

// ── Namespace de estado global ────────────────────────────────────────────
// Definido aqui (config.js carrega primeiro) para que todos os módulos que
// referenciam _S no nível superior do script (ex: auditoria.js) encontrem
// o objeto já existente, evitando ReferenceError na inicialização.
// Os valores de estado (sheetsUrl, modoAtual, etc.) são preenchidos em chat.js.
const _S = {};

// ── Helper de escape HTML (Shared Kernel) ─────────────────────────────────────
// Definição ÚNICA usada por todos os módulos do iframe (atos.js, tarefas.js,
// auditoria.js, render.js). null-safe e escapa também a aspa simples ('),
// evitando que valores ausentes virem o texto "undefined"/"null" na interface
// (auditoria técnica, item M1).
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Labels de tipo de tarefa ───────────────────────────────────────────────
// Usadas em tarefas.js, render.js e chat.js — definidas aqui para estar
// disponíveis em todos os módulos independente da ordem de carregamento.
const _TIPO_LABELS = {
    analise_docs:        '📋 Análise de Documentos',
    alteracao_cand:      '✏️ Alteração CAND',
    atualizacao_autucao: '📝 Atualização de Autuação',
};

// ── Estilo inline compartilhado para <select> dentro de painéis ──────────
// Usado em tarefas.js (filtros e redistribuição). Definido aqui para evitar
// redeclaração em módulos que carregam antes de chat.js.
const _SS = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:11px;padding:5px 8px;outline:none;font-family:"Inter",sans-serif;';

// -- Utilitarios de leitura de texto -- Shared Kernel
// Movidos de chat.js (entry point) para ca, pois sao usados em
// domain/analysis.js que carrega antes do entry point.

// Verifica se o texto extraido e legivel (proporcao de caracteres validos)
function isTextoLegivel(texto) {
    if (!texto) return false;
    const amostra  = texto.substring(0, 500);
    const legiveis = (amostra.match(/[a-zA-Z\u00C0-\u00FF0-9 .,;:!?()\-]/g) || []).length;
    return amostra.length > 0 && (legiveis / amostra.length) >= 0.55;
}

// Detecta lixo binario codificado como texto (ex: "QE QE QE QE...")
// Streams comprimidos de PDF interpretados erroneamente pelo extrator
function isTextoBinario(texto) {
    if (!texto || texto.length < 50) return false;
    // Sinal 1: texto comeca com padrao repetitivo de 1-3 letras maiusculas
    if (/^(\s*[A-Za-z]{1,3}\s+){10,}/.test(texto)) return true;
    // Sinal 2: texto longo sem nenhuma palavra real (sequencia de 5+ letras)
    const amostra = texto.substring(0, 800);
    const palavrasReais = (amostra.match(/[a-zA-Z]{5,}/g) || []).length;
    return amostra.length > 300 && palavrasReais < 2;
}
