// certidoes.js — Parsing puro de certidões estaduais (sem DOM, sem _S).
// Extraído de ui/cand.js sem alteração de lógica:
//   extrairProcessosDaCertidao — nº CNJ, classe, foro, qualificados/não-qualificados;
//   extrairDadosObjetoPe       — assunto, classe, situação e apensamento (objeto e pé).
// Carregado após domain/analysis.js, antes do bundle de UI (chat.html).

// ═════════════════════════════════════════════════════════════════════════════
// EXTRAÇÃO DE PROCESSOS DA CERTIDÃO ESTADUAL
// Extrai número CNJ, classe processual e foro de cada processo listado
// ═════════════════════════════════════════════════════════════════════════════

function extrairProcessosDaCertidao(texto, opcoesExclusao = {}) {
    if (!texto) return { qualificados: [], naoQualificados: [], dataEmissao: '' };
    // Números a excluir obrigatoriamente (ex: o próprio processo de registro de candidatura)
    const _excluidos = new Set((opcoesExclusao.excluirNumeros || []).filter(Boolean));
    // Filtra processos que não são criminais: Justiça Eleitoral (J=6, código 6.26)
    // Atenção: J=8 (TJSP) também usa comarca .26. (São Paulo) — NÃO filtrar!
    const _isProcessoCriminal = (numero) => {
        if (_excluidos.has(numero)) return false;
        // Código da Justiça Eleitoral: J=6, TT=26 → \.6\.26\. — nunca é processo criminal
        if (/\.6\.26\.\d{4}$/.test(numero)) return false;
        return true;
    };

    // ── Data de emissão ───────────────────────────────────────────────────────
    const reData = /(?:emitida?\s+em|expedida?\s+em|s[aã]o\s+paulo[,.]?\s*)(\d{1,2}[\s\/]\w+[\s\/]\d{4}|\d{2}\/\d{2}\/\d{4})/i;
    const mData  = texto.match(reData);
    const dataEmissao = mData ? mData[1].trim() : '';

    // ── Separa seção de qualificados e não qualificados ───────────────────────
    // Suporta dois formatos:
    //   TJSP clássico: "CERTIFICA ainda que [...] não qualificado"
    //   TJSP moderno:  "Não qualificado(a) — verificar homonímia" / "verificar homonimia"
    const sepNaoQual = /CERTIFICA\s+ainda\s+que[^,]*,?\s*verificou\s+CONSTAR[^,]*,?\s*n[aã]o\s+qualificado|n[aã]o\s+qualificado(?:\(a\))?\s*[—–\-]/i;
    const partes = texto.split(sepNaoQual);
    const textoQual    = partes[0] || '';
    const textoNaoQual = partes[1] || '';

    // ── Classes processuais reconhecidas ─────────────────────────────────────
    const CLASSES = [
        'Inquérito Policial',
        'Ação Penal de Competência do Júri',
        'Ação Penal',
        'Ação Civil Pública',
        'Ação de Improbidade Administrativa',
        'Ação Popular',
        'Medida Cautelar',
        'Habeas Corpus',
        'Representação Criminal',
        'Notícia de Crime',
        'Recurso em Sentido Estrito',
        'Embargos Infringentes',
    ];

    // ── Extrai campos de uma janela de texto em torno do processo ─────────────
    const extrairCampos = (janela, numero) => {
        let classe = '';
        for (const c of CLASSES) {
            if (janela.toLowerCase().includes(c.toLowerCase())) { classe = c; break; }
        }
        if (!classe) {
            const mC = janela.match(/(?:Inquérito|Ação|Medida|Habeas|Representação|Recurso|Embargos)[^:.\n]*/i);
            if (mC) classe = mC[0].trim();
        }
        const mForo    = janela.match(/Foro\s+[^–\n»]+/i);
        const _foroRaw = mForo ? mForo[0].replace(/\s+/g, ' ').trim() : '';
        const mDataE   = janela.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
        const data     = mDataE ? mDataE[1] : '';
        const mReqte   = janela.match(/(?:Reqte|Autor|Requerente|Querelante|Representante):\s*([^\n.]+)/i);
        const _reqteRaw = mReqte ? mReqte[1].trim() : '';

        // Trunca no início do boilerplate do rodapé da certidão (OCR pode colapsar linhas)
        const _reRodapeCert = /Esta\s+certid[aã]o\s+[eé]|VÁLIDA\s+SOMENTE|PEDIDO\s+N[°º]|S[aã]o\s+Paulo,\s*\d|0{6,}/i;
        const _cortaRodape  = (s) => {
            const i = s.search(_reRodapeCert);
            return i > 0 ? s.slice(0, i).trim().replace(/[.\s,]+$/, '') : s;
        };
        const foro  = _cortaRodape(_foroRaw);
        const reqte = _cortaRodape(_reqteRaw);
        return { numero, classe, foro, data, reqte };
    };

    // ── Método 1: marcadores » (TJSP clássico) ────────────────────────────────
    const extrairPorMarcador = (bloco) => {
        const entradas = [];
        const reEntrada = /»\s*([\s\S]+?)(?=»|\n\n|$)/g;
        let posOrdinal = 0;
        let m;
        while ((m = reEntrada.exec(bloco)) !== null) {
            const entrada = m[1].trim();
            const mCNJ = entrada.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
            if (!mCNJ) continue;
            if (!_isProcessoCriminal(mCNJ[1])) continue;
            posOrdinal++;
            // Tenta extrair posição explícita no texto (ex: "1ª Distribuição")
            const mPos = entrada.match(/(\d+)[ªº°]?\s*(?:distribui[çc][ãa]o|dist\.?)/i);
            const posicao = mPos ? parseInt(mPos[1], 10) : posOrdinal;
            entradas.push({ ...extrairCampos(entrada, mCNJ[1]), posicao });
        }
        return entradas;
    };

    // ── Método 2: CNJ como âncora (fallback para formatos sem ») ─────────────
    // Remove números em parênteses (referências a processos correlatos) antes de varrer
    const extrairPorCNJ = (bloco) => {
        const blocoLimpo = bloco.replace(/\([^)]*\d{7}[^)]*\)/g, ' ');
        const reCNJ = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;
        const entradas = [];
        const vistos = new Set();
        let posOrdinal = 0;
        let m;
        while ((m = reCNJ.exec(blocoLimpo)) !== null) {
            const numero = m[1];
            if (vistos.has(numero)) continue;
            vistos.add(numero);
            if (!_isProcessoCriminal(numero)) continue;
            posOrdinal++;
            // Janela de ±400 chars ao redor do número para extrair classe/foro/data/posição
            const ini    = Math.max(0, m.index - 400);
            const fim    = Math.min(blocoLimpo.length, m.index + 400);
            const janela = blocoLimpo.substring(ini, fim);
            const mPos = janela.match(/(\d+)[ªº°]?\s*(?:distribui[çc][ãa]o|dist\.?)/i);
            const posicao = mPos ? parseInt(mPos[1], 10) : posOrdinal;
            entradas.push({ ...extrairCampos(janela, numero), posicao });
        }
        return entradas;
    };

    // ── Aplica método 1; se não encontrar nada, aplica método 2 ──────────────
    const extrairEntradas = (bloco) => {
        if (!bloco) return [];
        const porMarcador = extrairPorMarcador(bloco);
        return porMarcador.length > 0 ? porMarcador : extrairPorCNJ(bloco);
    };

    return {
        qualificados:    extrairEntradas(textoQual),
        naoQualificados: extrairEntradas(textoNaoQual),
        dataEmissao,
    };
}

// ── Extrai dados da certidão de objeto e pé ───────────────────────────────────
function extrairDadosObjetoPe(texto) {
    if (!texto) return null;

    // Busca o primeiro número CNJ que não seja da Justiça Eleitoral (J=6, código 6.26)
    // Petições do MPE juntadas nos autos contêm o número do processo de registro
    // de candidatura (6.26) — que não é um processo criminal e deve ser ignorado.
    // Atenção: J=8 (TJSP) também usa código .26. (comarca de São Paulo) — não filtrar!
    const reCNJ = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;
    let mCNJ = null;
    let m;
    while ((m = reCNJ.exec(texto)) !== null) {
        if (!/\.6\.26\.\d{4}$/.test(m[1])) { mCNJ = m; break; }
    }
    if (!mCNJ) return null;

    // Assunto
    const mAssunto = texto.match(/Assunto:\s*([^\n.]+)/i);
    const assunto  = mAssunto ? mAssunto[1].trim() : '';

    // Classe
    const mClasse = texto.match(/Classe:\s*([^\n.]+)/i);
    const classe  = mClasse ? mClasse[1].trim() : '';

    // Situação processual — dois formatos possíveis:
    // Padrão: "Situação Processual:\n[texto]"
    // TJM:    "NESTA DATA A SITUAÇÃO PROCESSUAL É A SEGUINTE:\n[texto]"
    const mSituacao = texto.match(/NESTA\s+DATA\s+A\s+SITUA[CÇ][AÃ]O\s+PROCESSUAL\s+[EÉ]\s+A\s+SEGUINTE:\s*\n?\s*([^\n]+)/i)
                   || texto.match(/Situa[cç][aã]o\s+Processual[:\s]*\n?\s*([^\n]+)/i);
    const _situacaoRaw = mSituacao ? mSituacao[1].trim() : '';
    // Trunca no início de boilerplate de rodapé (OCR pode colapsar linhas)
    const _reRodape = /\s*(?:NADA\s+MAIS\b|O\s+referido\s+[eé]\s+verdade|Esta\s+certid[aã]o\s+[eé]\s+fornecida|Caber[aá]\s+ao\s+requerente|DOCUMENTO\s+ASSINADO|S[aã]o\s+Paulo,\s*\d|TODO\s+O\s+REFERIDO)/i;
    const _mRodape  = _situacaoRaw.search(_reRodape);
    const situacao  = _mRodape > 0 ? _situacaoRaw.slice(0, _mRodape).trim() : _situacaoRaw;

    // Última movimentação relevante (linha antes do marcador de situação)
    const blocoHistorico = texto.split(/(?:NESTA\s+DATA\s+A\s+)?Situa[cç][aã]o\s+Processual/i)[0] || '';
    const linhasHist = blocoHistorico.split('\n')
        .map(l => l.trim()).filter(l => l.match(/^\d{2}\/\d{2}\/\d{4}/));
    const ultimaMov = linhasHist[linhasHist.length - 1] || '';

    // Apensamento — detecta "Autos Apensados" e extrai o número do processo principal
    const isApensado = /autos\s+apensados?|apensado[s]?\s+ao\b/i.test(situacao + ' ' + texto);
    let processoApenso = null;
    if (isApensado) {
        const mAp = texto.match(/apensad[oa][s]?\s+ao\s+(?:n[°º.]?\s*)?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i)
            || texto.match(/apensad[oa][s]?\s+ao\s+(?:n[°º.]?\s*)?([\d\.\-\/]{8,25})/i);
        if (mAp) processoApenso = mAp[1].trim();
    }

    return { numero: mCNJ[1], assunto, classe, situacao, ultimaMov, isApensado, processoApenso };
}
