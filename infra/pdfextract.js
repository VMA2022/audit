// pdfextract.js — Extrator robusto: PDF.js (texto nativo) + Tesseract.js (OCR)
//
// Arquitetura: OCR executado localmente no iframe (chat.html).
// Nenhuma chamada ao background.js ou a CDN externo.
//
// Fluxo:
//   1. PDF.js tenta extrair texto nativo pagina a pagina.
//   2. Se o texto for ausente ou ilegivel (PDF escaneado / comprimido),
//      o PDF.js renderiza cada pagina em OffscreenCanvas e o
//      Tesseract.js faz OCR com modelo portugues (arquivo local).
//   3. Fallback final: extrator regex minimalista (limpaPdfString),
//      caso o PDF.js nao esteja disponivel.
//
// Dependencias em lib/:
//   pdf.min.mjs, pdf.worker.min.mjs  — PDF.js (ESM)
//   tesseract.min.js                 — Tesseract.js UMD
//   tesseract.worker.min.js          — worker interno do Tesseract
//   tesseract-core.wasm.js           — engine WASM do Tesseract
//   lang/por.traineddata             — modelo de lingua portuguesa

const _EXT_URL = (p) => {
    const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    return api ? api.runtime.getURL(p) : p;
};

// TEXTO_MIN, PAGINAS_MAX, OCR_ESCALA, TEXTO_LIMITE — definidas em config.js

// ── Instancias lazy das bibliotecas ──────────────────────────────────────────
let _pdfjsLib  = null;
let _Tesseract = null;

// ── Worker Tesseract compartilhado ────────────────────────────────────────────
// Reutilizado entre PDFs da mesma sessao de auditoria para evitar overhead de
// inicializacao do WASM (~1-2s) a cada documento.
// _ocrWorkerFalhou: true apos falha permanente — evita retentativas inuteis.
let _ocrWorker       = null;
let _ocrWorkerBusy   = false;
let _ocrWorkerFalhou = false;
let _ocrWorkerFalhas = 0;      // falhas transitorias na rodada
const _OCR_MAX_FALHAS  = 3;    // so lata (desabilita OCR na rodada) apos N falhas

async function _getOCRWorker() {
    if (_ocrWorker) return _ocrWorker;
    // Falha permanente ja registrada — nao tenta novamente
    if (_ocrWorkerFalhou) return null;
    if (_ocrWorkerBusy) {
        // Aguarda ate o worker estar pronto (max 30s)
        for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (_ocrWorker) return _ocrWorker;
            if (_ocrWorkerFalhou) return null;
        }
        return null;
    }
    _ocrWorkerBusy = true;
    try {
        const Tesseract = await _getTesseract();
        if (!Tesseract) {
            console.warn('[pdfextract] Tesseract.js nao disponivel — OCR desabilitado');
            _ocrWorkerBusy   = false;
            _ocrWorkerFalhas++;
            if (_ocrWorkerFalhas >= _OCR_MAX_FALHAS) _ocrWorkerFalhou = true;
            return null;
        }
        // Todos os paths apontam para arquivos locais da extensao.
        // workerPath:    script do worker Tesseract.
        // corePath:      engine WASM local (substitui o default do CDN).
        // langPath:      diretorio com os .traineddata de idioma.
        // workerBlobURL: false — usa new Worker(workerPath) direto em vez de
        //                criar um Blob com importScripts(), que e bloqueado
        //                pela CSP de extensoes MV3 (script-src 'self').
        _ocrWorker = await Tesseract.createWorker('por', 1, {
            workerPath    : _EXT_URL('lib/tesseract.worker.min.js'),
            langPath      : _EXT_URL('lib/lang'),
            corePath      : _EXT_URL('lib/tesseract-core.wasm.js'),
            workerBlobURL : false,
            logger        : m => {
                if (m.status === 'recognizing text') {
                    console.log('[OCR] ' + (m.progress * 100).toFixed(0) + '%');
                }
            },
        });
        _ocrWorkerFalhas = 0; // sucesso -- zera o contador de falhas
        console.log('[pdfextract] Worker Tesseract inicializado');
    } catch (e) {
        console.warn('[pdfextract] Falha ao criar worker OCR:', e && e.message ? e.message : e);
        _ocrWorker       = null;
        _ocrWorkerFalhas++;
        if (_ocrWorkerFalhas >= _OCR_MAX_FALHAS) _ocrWorkerFalhou = true;
        console.warn('[pdfextract] OCR: falha transitoria ' + _ocrWorkerFalhas + '/' + _OCR_MAX_FALHAS + (_ocrWorkerFalhou ? ' -- OCR desabilitado nesta rodada' : ' -- vai retentar no proximo doc'));
    }
    _ocrWorkerBusy = false;
    return _ocrWorker;
}

// ── Encerra o worker ao final de uma sessao de auditoria ─────────────────────
// Libera memoria do WASM. Na proxima auditoria um novo worker sera criado.
async function terminarWorkerOCR() {
    if (!_ocrWorker) return;
    try { await _ocrWorker.terminate(); } catch (_) {}
    _ocrWorker       = null;
    _ocrWorkerFalhou = false; // permite nova tentativa na proxima sessao
    _ocrWorkerFalhas = 0;
    console.log('[pdfextract] Worker Tesseract encerrado');
}

// ── Carrega PDF.js (ESM) de forma lazy ───────────────────────────────────────
async function _getPDFjs() {
    if (_pdfjsLib) return _pdfjsLib;
    try {
        const mod = await import(_EXT_URL('lib/pdf.min.mjs'));
        mod.GlobalWorkerOptions.workerSrc = _EXT_URL('lib/pdf.worker.min.mjs');
        _pdfjsLib = mod;
        return _pdfjsLib;
    } catch (e) {
        console.warn('[pdfextract] PDF.js nao disponivel:', e.message);
        return null;
    }
}

// ── Carrega Tesseract.js (UMD) via <script> de forma lazy ────────────────────
// import() dinamico nao funciona para bundles UMD com workers internos.
// O script ja deve estar em web_accessible_resources no manifest.
async function _getTesseract() {
    if (_Tesseract) return _Tesseract;
    return new Promise((resolve) => {
        if (window.Tesseract) { _Tesseract = window.Tesseract; resolve(_Tesseract); return; }
        const script = document.createElement('script');
        script.src = _EXT_URL('lib/tesseract.min.js');
        script.onload  = () => { _Tesseract = window.Tesseract; resolve(_Tesseract); };
        script.onerror = () => {
            console.warn('[pdfextract] Falha ao carregar tesseract.min.js');
            resolve(null);
        };
        document.head.appendChild(script);
    });
}

// ── Converte base64 para Uint8Array ──────────────────────────────────────────
function _b64ToUint8(base64) {
    const raw   = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

// ── Verifica se o texto extraido e legivel (nao binario) ─────────────────────
function _eLegivel(texto) {
    if (!texto || texto.length < TEXTO_MIN) return false;
    const amostra  = texto.substring(0, 500);
    const legiveis = (amostra.match(/[a-zA-Z\xC0-\xFF0-9 .,;:!?()\-]/g) || []).length;
    return (legiveis / amostra.length) >= 0.55;
}

// ── 1. Extracao de texto nativo via PDF.js ────────────────────────────────────
// ── Remontagem de formulários em 2 colunas (RRC/RRCI e Complemento) ───────────
// O "Sistema de Candidaturas Módulo Externo" (TSE) gera RRC, RRCI e o Complemento
// em DUAS COLUNAS (rótulo | valor). O PDF.js devolve os itens em ordem de stream,
// com rótulos e valores embaralhados — e o Complemento ainda vem com a página
// ROTACIONADA. Isso quebrava os extratores "Rótulo: valor" do card (o cargo virava
// "NÚMERO", o nº de urna sumia, o documento virava o nome do candidato). A remontagem
// abaixo usa as coordenadas de VIEWPORT (que já embutem a rotação da página) para
// recompor cada linha visual, casando rótulo↔valor. Só roda nesses formulários —
// certidões e todo o resto seguem pelo caminho de extração original, inalterados.
function _ehFormularioColunarRRC(texto) {
    return /requerimento\s+de\s+registro\s+de\s+candidatura|complemento\s+de\s+requerimento\s+de\s+registro/i.test(texto);
}

function _reconstruirLinhasVisuais(itensVisuais) {
    const its = itensVisuais.filter(o => o.str && o.str.trim() !== '');
    if (!its.length) return [];
    const alturas = its.map(o => o.h || 10).sort((a, b) => a - b);
    const hMed = alturas[Math.floor(alturas.length / 2)] || 10;
    const tolY = Math.max(2, hMed * 0.6);                       // tolerância p/ "mesma linha"
    const ordenados = its.slice().sort((a, b) => a.vy - b.vy);  // topo do viewport primeiro
    const linhas = [];
    let atual = null;
    for (const o of ordenados) {
        if (!atual || Math.abs(atual.vy - o.vy) > tolY) { atual = { vy: o.vy, itens: [o] }; linhas.push(atual); }
        else atual.itens.push(o);
    }
    return linhas.map(l => {
        l.itens.sort((a, b) => a.vx - b.vx);                    // esquerda → direita
        return l.itens.map(o => o.str).join(' ').replace(/\s+/g, ' ').replace(/\s+:/g, ':').trim();
    }).filter(Boolean);
}

async function _extrairTextoNativo(pdfBytes) {
    const pdfjsLib = await _getPDFjs();
    if (!pdfjsLib) return null;
    try {
        const pdf   = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const total = Math.min(pdf.numPages, PAGINAS_MAX);
        const partes = [];
        const itensVisuaisPorPagina = [];   // p/ remontagem dos formulários colunares (RRC)

        for (let i = 1; i <= total; i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            let linhaCurrent = '';
            const linhasPagina = [];
            for (const item of content.items) {
                if (item.str) linhaCurrent += item.str;
                if (item.hasEOL) { linhasPagina.push(linhaCurrent); linhaCurrent = ''; }
            }
            if (linhaCurrent) linhasPagina.push(linhaCurrent);
            const textoPagina = linhasPagina.join('\n').replace(/[ \t]+/g, ' ').trim();
            if (textoPagina) partes.push(textoPagina);

            // Guarda os itens em coordenadas de viewport (trata rotação) p/ eventual remontagem
            try {
                const vp = page.getViewport({ scale: 1 });
                itensVisuaisPorPagina.push(
                    content.items
                        .filter(it => it.str && it.str.trim() !== '')
                        .map(it => {
                            const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
                            return { str: it.str, vx, vy, h: it.height || 10 };
                        })
                );
            } catch (_e) { itensVisuaisPorPagina.push([]); }
        }

        let resultado = partes.join('\n').trim();

        // Formulários RRC/RRCI/Complemento: remonta as colunas por coordenadas para que
        // os extratores de campo do card ("Rótulo: valor") voltem a casar rótulo↔valor.
        if (_ehFormularioColunarRRC(resultado)) {
            const recon = itensVisuaisPorPagina
                .map(_reconstruirLinhasVisuais)
                .filter(ls => ls.length)
                .map(ls => ls.join('\n'))
                .join('\n')
                .replace(/[ \t]+/g, ' ')
                .trim();
            if (recon.length >= TEXTO_MIN) resultado = recon;
        }

        return resultado.length >= TEXTO_MIN ? resultado : null;
    } catch (e) {
        console.warn('[pdfextract] Erro extracao nativa:', e.message);
        return null;
    }
}

// ── 2. OCR via Tesseract.js (fallback para PDFs escaneados) ──────────────────
// Executa inteiramente no iframe — sem chamadas ao background ou CDN externo.
// Requer worker-src 'self' blob: na CSP do manifest (extension_pages).
async function _extrairTextoOCR(pdfBytes) {
    const pdfjsLib = await _getPDFjs();
    if (!pdfjsLib) {
        console.warn('[pdfextract] OCR indisponivel — PDF.js nao carregou');
        return null;
    }

    let worker = await _getOCRWorker();
    if (!worker && !_ocrWorkerFalhou) {
        // Falha transitoria (rajada/WASM): espera e tenta 1x mais antes de desistir.
        await new Promise(r => setTimeout(r, 600));
        worker = await _getOCRWorker();
    }
    if (!worker) {
        console.warn('[pdfextract] OCR indisponivel — worker Tesseract nao disponivel');
        return null;
    }

    try {
        const pdf   = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const total = Math.min(pdf.numPages, PAGINAS_MAX);
        const partes = [];

        for (let i = 1; i <= total; i++) {
            const page     = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: OCR_ESCALA });

            const canvas = new OffscreenCanvas(
                Math.round(viewport.width),
                Math.round(viewport.height)
            );
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            const blob = await canvas.convertToBlob({ type: 'image/png' });
            const { data: { text } } = await worker.recognize(blob);
            const paginaTexto = text.trim();
            if (paginaTexto) partes.push(paginaTexto);
        }

        const resultado = partes.join('\n').replace(/[ \t]+/g, ' ').trim();
        return resultado.length >= TEXTO_MIN ? resultado : null;

    } catch (e) {
        console.warn('[pdfextract] Erro OCR:', e.message);
        return null;
    }
}

// ── 3. Fallback: extrator regex minimalista (sem dependencias) ────────────────
function _extrairTextoRegex(base64) {
    try {
        const raw     = atob(base64);
        const bytes   = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const content = new TextDecoder('latin1').decode(bytes);
        const textos  = [];

        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match;
        while ((match = streamRegex.exec(content)) !== null) {
            const stream = match[1];
            let m;

            const tjRegex = /\(([^)\\]{1,500}(?:\\.[^)\\]{0,500})*)\)\s*Tj/g;
            while ((m = tjRegex.exec(stream)) !== null) {
                const txt = limpaPdfString(m[1]);
                if (txt.trim()) textos.push(txt);
            }

            const tjArrRegex = /\[([\s\S]{1,3000}?)\]\s*TJ/g;
            while ((m = tjArrRegex.exec(stream)) !== null) {
                const partsRegex = /\(([^)\\]{0,300}(?:\\.[^)\\]{0,300})*)\)/g;
                let part; let linha = '';
                while ((part = partsRegex.exec(m[1])) !== null) linha += limpaPdfString(part[1]);
                if (linha.trim()) textos.push(linha);
            }

            const apoRegex = /\(([^)\\]{1,500}(?:\\.[^)\\]{0,500})*)\)\s*'/g;
            while ((m = apoRegex.exec(stream)) !== null) {
                const txt = limpaPdfString(m[1]);
                if (txt.trim()) textos.push(txt);
            }
        }

        if (!textos.length) return null;
        const resultado = textos.join(' ').replace(/\s+/g, ' ').trim().substring(0, TEXTO_LIMITE);
        return resultado.length > 20 ? resultado : null;
    } catch (e) {
        console.warn('[pdfextract] Erro regex fallback:', e.message);
        return null;
    }
}

// ── Normalizacao do texto extraido (nativo ou OCR) ────────────────────────────
function limparTextoOCR(texto) {
    if (!texto) return texto;

    let t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Desfaz hifenizacao de final de linha
    t = t.replace(/([a-zA-Z\xC0-\xFF\d])-\n([a-zA-Z\xC0-\xFF\d])/g, '$1-$2');

    // Colapsa multiplas linhas em branco -> separador de paragrafo
    t = t.replace(/\n{3,}/g, '\n\n');

    // Une linhas consecutivas do mesmo paragrafo (preserva \n\n como separador)
    t = t.replace(/\n\n/g, '§§');
    t = t.replace(/([^\n])\n([^\n])/g, '$1 $2');
    t = t.replace(/§§/g, '\n\n');

    // Remove espacos multiplos por linha
    t = t.split('\n').map(function(l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n');

    // Corrige espacos em torno de pontuacao e separadores numericos
    t = t.replace(/([.,:;!?])\s+([.,:;!?])/g, '$1$2');
    t = t.replace(/(\d)-\s+(\d)/g, '$1-$2');
    t = t.replace(/(\d)\.\s+(\d)/g, '$1.$2');
    t = t.replace(/\s+([.,:;])/g, '$1');

    return t.trim();
}

// ── Ponto de entrada principal ────────────────────────────────────────────────
async function extrairTextoPDFLocal(base64) {
    // Cache de OCR: se este documento (mesmo conteudo) ja foi extraido, devolve o texto
    // guardado, evitando reprocessar PDF.js/Tesseract em reauditorias ou ao reabrir o
    // painel. Degrada em silencio se o cache nao estiver disponivel.
    let _ocrHash = null;
    if (typeof ocrCacheHash === 'function') {
        try {
            _ocrHash = await ocrCacheHash(base64);
            if (_ocrHash) {
                const _ocrCached = await ocrCacheGet(_ocrHash);
                if (_ocrCached != null) {
                    console.log('[pdfextract] cache HIT (' + _ocrCached.length + ' chars)');
                    return _ocrCached;
                }
            }
        } catch (e) {
            console.warn('[pdfextract] cache OCR indisponivel:', e && e.message ? e.message : e);
        }
    }
    const _ocrTexto = await _extrairTextoPDFLocalRaw(base64);
    if (_ocrHash && _ocrTexto != null && typeof ocrCacheSet === 'function') {
        try { await ocrCacheSet(_ocrHash, _ocrTexto); } catch (_) { /* noop */ }
    }
    return _ocrTexto;
}

// Extracao propriamente dita: PDF.js (texto nativo) -> Tesseract OCR -> regex.
async function _extrairTextoPDFLocalRaw(base64) {
    if (!base64) return null;

    // PDF.js transfere (detach) o ArrayBuffer do Uint8Array ao processar o PDF,
    // tornando-o inutilizavel para chamadas subsequentes.
    // _b64ToUint8 e chamado duas vezes de forma independente para garantir
    // que cada etapa receba um buffer proprio, evitando o erro
    // "ArrayBuffer at index 0 is already detached".

    // 1. Tenta extracao nativa (rapida, sem OCR)
    const textoNativo = await _extrairTextoNativo(_b64ToUint8(base64));
    if (_eLegivel(textoNativo)) {
        console.log('[pdfextract] Texto nativo OK (' + textoNativo.length + ' chars)');
        return limparTextoOCR(textoNativo).substring(0, TEXTO_LIMITE);
    }

    // 2. PDF escaneado — tenta OCR local (novo buffer independente)
    console.log('[pdfextract] Texto nativo ausente/ilegivel — iniciando OCR...');
    const textoOCR = await _extrairTextoOCR(_b64ToUint8(base64));
    if (_eLegivel(textoOCR)) {
        console.log('[pdfextract] OCR OK (' + textoOCR.length + ' chars)');
        return limparTextoOCR(textoOCR).substring(0, TEXTO_LIMITE);
    }

    // 3. Ultimo recurso: regex simples
    console.log('[pdfextract] OCR falhou — usando extrator regex');
    const textoRegex = _extrairTextoRegex(base64);
    if (textoRegex) {
        console.log('[pdfextract] Regex OK (' + textoRegex.length + ' chars)');
        return limparTextoOCR(textoRegex).substring(0, TEXTO_LIMITE);
    }

    console.warn('[pdfextract] Nenhum metodo extraiu texto deste PDF');
    return null;
}

// ── Limpeza de strings PDF (usada pelo fallback regex) ────────────────────────
function limpaPdfString(str) {
    return str
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\\\/g, '')
        .replace(/\\(\d{3})/g, function(_, oct) {
            const code = parseInt(oct, 8);
            return code > 31 ? String.fromCharCode(code) : ' ';
        })
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
