// analysis.js — Verificação, identificação de tipo e correspondência
// Depende de: config.js

// ═════════════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO LOCAL DE CORRESPONDÊNCIA
// ═════════════════════════════════════════════════════════════════════════════

// ── Normaliza string para comparação ─────────────────────────────────────────
const _norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

// ── Verifica nome do candidato no texto do documento ─────────────────────────
function verificaNomeNoCertidao(requerente, conteudo) {
    if (!requerente || !conteudo) return { encontrado: false, detalhes: 'dados ausentes' };
    const nomeNorm   = _norm(requerente);
    const textoNorm  = _norm(conteudo.substring(0, 8000));
    if (textoNorm.includes(nomeNorm)) return { encontrado: true, detalhes: 'nome exato' };
    // Tenta por sobrenome (última palavra com mais de 3 letras)
    const partes = nomeNorm.split(' ').filter(p => p.length > 3);
    if (partes.length >= 2) {
        const primeiro = partes[0];
        const ultimo   = partes[partes.length - 1];
        if (textoNorm.includes(primeiro) && textoNorm.includes(ultimo))
            return { encontrado: true, detalhes: 'primeiro e último nome' };
    }
    return { encontrado: false, detalhes: `"${requerente}" não encontrado` };
}

// ── Verifica CPF no texto ─────────────────────────────────────────────────────
function verificaCPFNaCertidao(cpf, conteudo) {
    if (!cpf || !conteudo) return { encontrado: false, detalhes: 'CPF não informado' };
    const cpfLimpo = cpf.replace(/\D/g, '');
    // Remove quebras de linha do texto para evitar falsos negativos por OCR
    // que quebra o CPF entre linhas (ex: "698-\n14")
    const texto = conteudo.substring(0, 8000).replace(/[\r\n]+/g, ' ');

    // Aceita: com pontuação, sem pontuação, e com possível espaço entre grupos
    const re = new RegExp(
        cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,
            '$1[.\\-\\s]?$2[.\\-\\s]?$3[.\\-\\s]?$4')
    );
    if (re.test(texto)) return { encontrado: true, detalhes: 'CPF encontrado' };

    // Busca também pelos 11 dígitos consecutivos
    if (texto.includes(cpfLimpo)) return { encontrado: true, detalhes: 'CPF encontrado (sem formatação)' };

    return { encontrado: false, detalhes: `CPF ${cpf} não encontrado` };
}

// ── Verifica número do Doc. de Identidade no texto (apenas dígitos) ─────────────
function verificaDocIdentNaCertidao(docIdent, conteudo) {
    if (!docIdent || !conteudo) return { encontrado: false, detalhes: 'Doc. de identificação não informado' };
    const numeros = docIdent.replace(/\D/g, '');
    if (numeros.length < 5) return { encontrado: false, detalhes: 'Número do documento muito curto' };
    const texto = conteudo.substring(0, 8000).replace(/[\r\n]+/g, ' ');
    // Busca sem formatação (remove pontos, traços, barras e espaços)
    const textoSemForm = texto.replace(/[.\-\/\s]/g, '');
    if (textoSemForm.includes(numeros)) return { encontrado: true, detalhes: 'Doc. de identificação encontrado' };
    // Busca com possíveis separadores entre os dígitos (OCR pode inserir pontos/espaços)
    const re = new RegExp(numeros.split('').join('[.\\-\\s]?'));
    if (re.test(texto)) return { encontrado: true, detalhes: 'Doc. de identificação encontrado' };
    return { encontrado: false, detalhes: `Doc. ident. "${numeros}" não encontrado` };
}

// ── Certidão que exige verificação nominal (pelo nome do doc) ────────────────
function eCertidaoNominal(nomeDoc) {
    const n = _norm(nomeDoc);
    return /certid/.test(n) && (
        /criminal|antecedente|distribui|objeto.*pe|pe.*objeto/.test(n) ||
        /estadual|federal|eleitoral|militar/.test(n)
    );
}

// ── Versão "efetiva": combina nome do doc + tipo identificado pelo OCR ────────
// Retorna true se a certidão exige verificação nominal, independentemente de
// o nome do arquivo estar correto ou não.
// Tipos que sempre exigem verificação de identidade no conteúdo:
const _TIPOS_NOMINAIS = new Set([
    'estadual_1grau', 'estadual_1grau_eproc', 'estadual_2grau',
    'federal_1grau',  'federal_2grau',  'federal_regional',
    'stj', 'stf', 'stm', 'tjm',
    'objeto_pe', 'exec_criminal', 'eleitoral',
]);
function eCertidaoNominalEfetiva(nomeDoc, tipoIdentificado) {
    if (tipoIdentificado && _TIPOS_NOMINAIS.has(tipoIdentificado)) return true;
    return eCertidaoNominal(nomeDoc);
}

// ═════════════════════════════════════════════════════════════════════════════
// MOTOR DE IDENTIFICAÇÃO DE TIPO PELO CONTEÚDO DO TEXTO
// Retorna { tipo, label } identificados no texto extraído do PDF.
// Usa strings características únicas de cada tipo de certidão.
// ═════════════════════════════════════════════════════════════════════════════
function identificarTipoPeloTexto(texto) {
    if (!texto) return { tipo: null, label: null };
    const t = _norm(texto.substring(0, 8000));

    // Certidao CIVEL -- distribuicoes civeis: reconhecida, porem NAO adequada ao
    // requisito CRIMINAL (ex.: PATRICIA MODESTO). Precede as regras criminais para
    // nunca ser confundida com 1o grau -- marcador "civeis" (civel) != "civis
    // publicas" (criminal SAJ). Aqui: distribuicoes/acoes CIVEIS, familia, sucessoes,
    // execucoes fiscais.
    if (t.includes('distribuicoes civeis') ||
        (t.includes('acoes civeis') && (t.includes('familia e sucessoes') || t.includes('execucoes fiscais') || t.includes('certidao estadual'))))
        return { tipo: 'civel_inadequada', label: 'Certidão cível — não adequada ao requisito criminal' };

    // ── Regras ordenadas do mais específico para o mais genérico ──

    // Certidão Estadual 1º grau NOVA (SAJ) — já ABRANGE execuções criminais.
    // Deve preceder exec_criminal: a nova certidão do TJSP/SAJ menciona "execuções
    // criminais" (parte da cobertura combinada), mas é a certidão de 1º grau ADEQUADA
    // (distribuições de ações civis/criminais + execuções, sistema SAJ). É complementada
    // pela certidão eproc/SEEU (abaixo) — são DUAS certidões de 1º grau obrigatórias.
    if (t.includes('certidao estadual de distribuicoes criminais') &&
        (t.includes('sistema saj') || t.includes('esaj.tjsp')) &&
        (t.includes('acoes civis publicas') || t.includes('improbidade')))
        return { tipo: 'estadual_1grau', label: 'Certidão Criminal Estadual 1º grau (SAJ)' };

    // Certidão Eleitoral eproc/SEEU (TJSP) — complementar da SAJ, também 1º grau.
    // Ancora na COBERTURA PRÓPRIA ("sistema eproc"/"seeu"), não na mera menção que a
    // certidão SAJ faz ao complemento. Deve preceder exec_criminal (o texto tem "SEEU").
    if ((t.includes('sistema eproc') || (t.includes('eproc') && t.includes('certidao eleitoral'))) &&
        t.includes('seeu'))
        return { tipo: 'estadual_1grau_eproc', label: 'Certidão Criminal Estadual 1º grau (eproc/SEEU)' };

    // Execução Criminal — TJSP distribuição de execuções criminais
    // DEVE preceder estadual_1grau: o título "CERTIDÃO ESTADUAL DE DISTRIBUIÇÕES CRIMINAIS"
    // é compartilhado entre a certidão de distribuições comum e a de execuções criminais.
    // Marcador exclusivo: "distribuições de EXECUÇÕES CRIMINAIS" OU "feitos de Execuções Criminais"
    // no contexto do TJSP. Exige marcadores de distribuição/abrangência para evitar falso
    // positivo em certidões de outros tribunais que mencionam "execução criminal" no corpo.
    if ((t.includes('execucoes criminais') || t.includes('execucao criminal')) &&
        (t.includes('distribuicoes de execucoes') || t.includes('feitos de execucoes') ||
         t.includes('registros de distribuicoes de execucoes') ||
         (t.includes('execucoes criminais') && t.includes('tribunal de justica') && t.includes('certidao'))))
        return { tipo: 'exec_criminal', label: 'Execução Criminal (complementar)' };

    // Certidão Estadual 1º grau — TJSP 1ª instância
    // Exclui explicitamente execuções criminais (já capturadas acima)
    if ((t.includes('certidao estadual de distribuicoes criminais') && !t.includes('execucoes criminais')) ||
        (t.includes('distribuicoes criminais') && t.includes('primeira instancia')) ||
        (t.includes('certidao estadual') && t.includes('fins exclusivamente eleitorais') && !t.includes('orgao especial') && !t.includes('execucoes criminais')))
        return { tipo: 'estadual_1grau', label: 'Certidão Criminal Estadual 1º grau' };

    // Certidão Estadual 2º grau — TJSP Órgão Especial
    if ((t.includes('orgao especial') && t.includes('certidao negativa')) ||
        (t.includes('certidao negativa para fins eleitorais') && t.includes('tribunal de justica')) ||
        (t.includes('segunda instancia') && t.includes('tribunal de justica') && t.includes('criminal')))
        return { tipo: 'estadual_2grau', label: 'Certidão Criminal Estadual 2º grau' };

    // Certidão Federal Regional — TRF3 "Abrangência - Regional" (cobre 1º e 2º grau)
    // Deve ser verificada ANTES das regras de 1º e 2º grau para evitar classificação parcial.
    // O traço é OPCIONAL: _norm remove o traço ("Abrangência - Regional" → "abrangencia regional"),
    // então exigir o traço literal fazia a certidão regional cair (erroneamente) em federal_1grau.
    // Mesmo assim é preciso: includes('regional') sozinho não basta — "Tribunal Regional Federal"
    // também contém "regional"; por isso ancora em "abrangencia" imediatamente antes de "regional".
    if (/abrangencia\s*[-–]?\s*regional/.test(t) && t.includes('certidao judicial para fins eleitorais'))
        return { tipo: 'federal_regional', label: 'Certidão Criminal Federal (Regional — 1º e 2º grau)' };

    // Certidão Federal 1º grau — JFSP / Seção Judiciária
    // Exige obrigatoriamente "certidao judicial para fins eleitorais" + "secao judiciaria"
    if (t.includes('certidao judicial para fins eleitorais') && t.includes('secao judiciaria'))
        return { tipo: 'federal_1grau', label: 'Certidão Criminal Federal 1º grau' };

    // Certidão Federal 2º grau — TRF3
    // Exige obrigatoriamente "certidao judicial para fins eleitorais" + "tribunal regional federal"
    // A distinção de 2º grau é feita pela ausência de "secao judiciaria" (já capturado acima)
    if (t.includes('certidao judicial para fins eleitorais') && t.includes('tribunal regional federal'))
        return { tipo: 'federal_2grau', label: 'Certidão Criminal Federal 2º grau' };

    // Certidão Militar — STM (Superior Tribunal Militar)
    // Verificado ANTES de STF/STJ para evitar falso-positivo quando o corpo do texto
    // menciona STF/STJ por referência (ex: processo remetido ao STF)
    if (t.includes('superior tribunal militar') ||
        (t.includes('justica militar') && t.includes('uniao') && t.includes('certidao')))
        return { tipo: 'stm', label: 'Certidão Criminal STM (Militar Federal)' };

    // TJM — Certidão de Objeto e Pé: marcador exclusivo desta instância.
    // Deve preceder o check geral de TJM porque o rodapé da certidão contém
    // "Tribunal de Justiça Militar", fazendo-a cair no tipo tjm sem esta regra.
    if (t.includes('nesta data a situacao processual e a seguinte'))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé (complementar)' };

    // Certidão Militar — TJM-SP / JM-SP (Justiça Militar Estadual)
    if (t.includes('tribunal de justica militar') ||
        (t.includes('justica militar') && (t.includes('estado') || t.includes('sao paulo')) && t.includes('certidao')))
        return { tipo: 'tjm', label: 'Certidão Criminal TJM/JM-SP (Militar Estadual)' };

    // Certidão STJ
    var _cab = t.substring(0, 900);
    if (_cab.includes('superior tribunal de justica') && t.includes('certidao'))
        return { tipo: 'stj', label: 'Certidão Criminal STJ' };

    // Certidão STF
    if (_cab.includes('supremo tribunal federal') && t.includes('certidao'))
        return { tipo: 'stf', label: 'Certidão Criminal STF' };


    // Execução Criminal — certidão de distribuição de execuções criminais
    // Identificada quando o texto do documento menciona "execuções criminais" ou
    // "execução criminal" no contexto de distribuição. Deve ser verificada ANTES
    // das regras genéricas de objeto_pe para evitar classificação incorreta.
    if (t.includes('execucoes criminais') || t.includes('execucao criminal'))
        return { tipo: 'exec_criminal', label: 'Execução Criminal (complementar)' };

    // Certidão em Breve Relatório — emitida por vara/foro sobre processo específico
    // Detectada pelo TÍTULO do documento ("CERTIDÃO EM BREVE RELATÓRIO" ou "BREVE RELATÓRIO")
    // Não confundir com referência no rodapé de certidão de distribuições ("breve relatório dos processos")
    if (t.includes('certidao em breve relat') ||
        (t.includes('breve relatorio') && t.includes('certifica') && t.includes('constar a distribuicao')))
        return { tipo: 'objeto_pe', label: 'Certidão em Breve Relatório (complementar)' };

    // Certidão de Objeto e Pé — apenas quando é o tipo principal do documento,
    // não quando é mera referência no corpo de outra certidão criminal
    if ((t.includes('certidao de objeto e pe') || t.includes('objeto e pe')) &&
        !t.includes('distribuicoes') && !t.includes('certidao negativa') &&
        !t.includes('fins eleitorais') && !t.includes('antecedentes criminais') &&
        !t.includes('primeira instancia') && !t.includes('segunda instancia'))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé (complementar)' };

    // Certidão de Objeto e Pé — detecção pelo conteúdo interno quando o título não aparece
    // (PDFs do TJSP com assinatura digital começam pelo cabeçalho de autenticidade,
    //  não pelo título — "verificou constar o seguinte" é a frase característica)
    if (t.includes('verificou constar o seguinte') ||
        (t.includes('certifica') && t.includes('situacao processual') && t.includes('processo fisico')) ||
        (t.includes('certifica') && t.includes('situacao processual') && t.includes('inquerito policial')))
        return { tipo: 'objeto_pe', label: 'Certidão de Objeto e Pé (complementar)' };

    // Certidão Eleitoral — TRE / TSE
    if ((t.includes('tribunal regional eleitoral') || t.includes('tribunal superior eleitoral')) && t.includes('certidao'))
        return { tipo: 'eleitoral', label: 'Certidão Eleitoral' };

    // RRC/RRCI e Complemento (Sistema de Candidaturas): detectar ANTES de escolaridade/
    // bens/etc. — o corpo do RRC traz "grau de instrução", "declaração de bens" e afins,
    // que dariam falso positivo nesses tipos (o RRC caía como 'escolaridade').
    if (t.includes('requerimento de registro de candidatura') ||
        t.includes('complemento de requerimento de registro'))
        return { tipo: 'rrc', label: 'Requerimento de Registro de Candidatura' };

    // Comprovante de escolaridade
    if (t.includes('diploma') || t.includes('historico escolar') || t.includes('certificado de conclusao') ||
        t.includes('grau de instrucao') || t.includes('bacharel') || t.includes('licenciatura'))
        return { tipo: 'escolaridade', label: 'Comprovante de Escolaridade' };

    // Declaração de bens
    if ((t.includes('declaracao de bens') || t.includes('relacao de bens')) && t.includes('patrimonio'))
        return { tipo: 'bens', label: 'Declaração de Bens' };

    // Proposta de governo
    if (t.includes('proposta de governo') || t.includes('plano de governo') || t.includes('programa de governo'))
        return { tipo: 'proposta_governo', label: 'Proposta de Governo' };

    // Desincompatibilização
    if (t.includes('desincompatibilizacao') || t.includes('desincompatibilizou') || t.includes('desincompatibilizando') ||
        (t.includes('exonerado') && t.includes('cargo')) || t.includes('afastamento para candidatura'))
        return { tipo: 'desincompat', label: 'Comprovante de Desincompatibilização' };

    // Requerimento de Registro de Candidatura
    if (t.includes('requerimento de registro de candidatura') || t.includes('registro de candidatura') ||
        t.includes('dados do candidato') || t.includes('cadastro eleitoral'))
        return { tipo: 'rrc', label: 'Requerimento de Registro de Candidatura' };

    return { tipo: null, label: null };
}

// ═════════════════════════════════════════════════════════════════════════════
// IDENTIFICAÇÃO DE "NADA CONSTA" / "CONSTA" + EXTRAÇÃO DE PROCESSOS
//
// Retorna objeto:
// {
//   consta      : 'NADA CONSTA' | 'CONSTA' | '',
//   total       : número de processos encontrados (0 se NADA CONSTA),
//   processos   : array com os números CNJ extraídos,
//   resumo      : string formatada para o relatório
// }
// ═════════════════════════════════════════════════════════════════════════════
function identificarConsta(texto) {
    const vazio = { consta: '', total: 0, processos: [], resumo: '' };
    if (!texto) return vazio;

    const t     = texto.substring(0, 20000);
    const tNorm = _norm(t); // sem acentos, minúsculas

    // ── 1. Extrai números de processo no formato CNJ ──────────────────────────
    // Formato: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos)
    // Remove parênteses com números antes de extrair: números em parênteses são referências
    // a processos correlatos/origem (ex: "0001-IP (0002-correlato)"), não processos principais
    // Remove também asteriscos — OCR do TJSP usa "*" como separador de campo entre dados
    const tSemParenteses = t
        .replace(/\([^)]*\d{7}[^)]*\)/g, ' ')
        .replace(/\*+/g, ' ');
    // Lookbehind/lookahead para evitar capturar dígitos dentro de números maiores
    const reCNJ = /(?<![0-9])(\d{7})[-.\s]?(\d{2})[-.\s]?(\d{4})[-.\s]?(\d)[-.\s]?(\d{2})[-.\s]?(\d{4})(?![0-9])/g;
    const numerosEncontrados = [];
    let m;
    while ((m = reCNJ.exec(tSemParenteses)) !== null) {
        const digits = m[1]+m[2]+m[3]+m[4]+m[5]+m[6];
        if (digits.length === 20) {
            const fmt = `${m[1]}-${m[2]}.${m[3]}.${m[4]}.${m[5]}.${m[6]}`;
            if (!numerosEncontrados.includes(fmt)) numerosEncontrados.push(fmt);
        }
    }

    // ── 2. Extrai Inquéritos Policiais ────────────────────────────────────────
    // Ex: IP nº 123/2024, I.P. 0001/2023-DPF
    const reIP = /\b(?:i\.?\s*p\.?|inquerito\s+policial)\s*[n°º.#]*\s*(\d{1,6}[\/-]\d{2,4}(?:[-\/]\w+)?)/gi;
    const ipsEncontrados = [];
    while ((m = reIP.exec(t)) !== null) {
        const ip = `IP ${m[1].trim()}`;
        if (!ipsEncontrados.includes(ip)) ipsEncontrados.push(ip);
    }

    const todosNumeros = [...numerosEncontrados, ...ipsEncontrados];

    // ── 3. Contagem explícita no texto ────────────────────────────────────────
    // Ex: "constam 3 processos", "foram encontradas 2 distribuições"
    // Exige que o número venha ANTES da palavra processo/registro
    // e não seja parte de frases de rodapé/boilerplate
    const reContagem = /\b(constam|encontrados?|h[aá])\s+(\d+)\s*(processos?|registros?|distribui[cç][oõ]es?|ocorr[eê]ncias?)\b/i;
    const matchContagem = t.match(reContagem);
    const contagemExplicita = matchContagem ? parseInt(matchContagem[2], 10) : null;

    // ── 4. Detecta NADA CONSTA ────────────────────────────────────────────────
    // Padrões negativos — expressões que indicam ausência de processos
    // Inclui variações reais encontradas nas certidões dos tribunais brasileiros
    const nadaConstaPatterns = [
        // Expressões literais mais comuns
        /n[aã]o\s+const[ao]m?\b/i,           // "NÃO CONSTA", "NÃO CONSTAM", "não consta"
        /nada\s+consta/i,                      // "NADA CONSTA"
        /nada\s+constar/i,                     // "NADA CONSTAR" — TJSP Estadual 1º grau
        /verificou\s+nada\s+constar/i,         // "verificou NADA CONSTAR" — TJSP exato
        /n[aã]o\s+constam\s+registros/i,
        /n[aã]o\s+constam\s+processos/i,
        /n[aã]o\s+foram\s+encontrados/i,
        /n[aã]o\s+h[aá]\s+(registros?|processos?|ocorr[eê]ncias?)/i,
        /n[aã]o\s+existem\s+(registros?|processos?)/i,
        // Expressões de certidão negativa
        /certid[aã]o\s+negativa/i,
        /negativa\s+para\s+fins\s+eleitorais/i,
        /negativa\s+de\s+(antecedentes|distribui[cç][aã]o|ocorr[eê]ncia)/i,
        // Expressões de inexistência
        /inex[íi]st[eê]ncia\s+de\s+(registros?|ocorr[eê]ncias?|distribui[cç][oõ]es?)/i,
        /aus[eê]ncia\s+de\s+(registro|processo|ocorr[eê]ncia)/i,
        /sem\s+(registros?|ocorr[eê]ncias?|distribui[cç][oõ]es?|antecedentes)/i,
        /nenhum\s+(registro|processo|ocorr[eê]ncia|antecedente)/i,
        // Expressões específicas de certidões federais (TRF3/JFSP)
        /n[aã]o\s+constam.*processos.*potencial.*inelegibilidade/i,
        /n[aã]o\s+constam.*inelegibilidade/i,
        // Expressões específicas de certidões estaduais (TJSP)
        /n[aã]o\s+h[aá]\s+distribui[cç][aã]o/i,
        /distribui[cç][oõ]es?\s+criminais.*negativa/i,
        /nada\s+h[aá]\s+em\s+seu\s+desfavor/i,
        // Certidão considera-se negativa (TJSP — homônimos não qualificados)
        /certid[aã]o.*considera[-\s]se\s+negativa/i,
    ];

    // ── 5. Detecta CONSTA ─────────────────────────────────────────────────────
    // Padrões positivos — expressões que indicam existência de processos
    // IMPORTANTE: não testar "consta" genérico — evitar falso positivo com "NÃO CONSTA"
    const constaPositivoPatterns = [
        /\bconstam\s+(?!.*n[aã]o\s+constam)(\d+|os\s+seguintes|processos)/i,
        /foram\s+encontrados\s+(?!zero|\d*\s*0\b)/i,
        /h[aá]\s+(registros?|processos?|ocorr[eê]ncias?|distribui[cç][oõ]es?)\s+(?!negativa)/i,
        /existem\s+(registros?|processos?|ocorr[eê]ncias?)/i,
        /certid[aã]o\s+positiva/i,
        /processo\s+[n°º#.]\s*\d/i,
        /\bconstam\s+as\s+seguintes/i,
        /\bconstam\s+os\s+seguintes/i,
        /distribui[cç][aã]o\s+criminal.*consta(?!\s+negativa)/i,
        // TJSP Estadual 1º grau — "verificou CONSTAR contra" (certidão positiva qualificada)
        /verificou\s+constar\s+contra/i,
        // TJSP — "as seguintes distribuições" (seção de processos encontrados)
        /as\s+seguintes\s+distribui[cç][oõ]es/i,
        // Apontamentos reais — TJSP usa "São apontados" quando há processos
        // MAS só é positivo se NÃO vier seguido de boilerplate explicativo
        /s[aã]o\s+apontados?\s+(?!inqu[eé]ritos\s+e\s+a[cç][oõ]es\s+penais\s+em\s+tramita[cç][aã]o)/i,
    ];

    // "verificou CONSTAR contra" indica certidão positiva qualificada — TJSP Estadual
    // Se essa frase aparece, o documento é CONSTA independentemente de outros padrões negativos
    // que possam aparecer na seção de não qualificados ou no rodapé.
    const _temVerificouConstarContra = /verificou\s+constar\s+contra/i.test(t);

    const eNadaConsta = !_temVerificouConstarContra && nadaConstaPatterns.some(re => re.test(t));

    // Verifica positivo — mas só conta se NÃO houver "não" antes do "consta"
    const temPositivoExplicito = constaPositivoPatterns.some(re => re.test(t));

    // Números CNJ encontrados são sempre sinal de CONSTA
    // (exceto se estiverem apenas no cabeçalho da certidão — número da própria certidão)
    // Filtra números que parecem ser o número da certidão (formato diferente: 2024/000...)
    const numerosProcesso = numerosEncontrados.filter(n => {
        // Número CNJ válido: ano entre 1970 e ano atual+1
        const anoMatch = n.match(/\.(\d{4})\./);
        if (!anoMatch) return false;
        const ano = parseInt(anoMatch[1]);
        if (ano < 1970 || ano > new Date().getFullYear() + 1) return false;
        // Exclui processos da Justiça Eleitoral (J=6, TT=26) — nunca são processos
        // criminais; aparecem em petições do MPE e manifestações juntadas nos autos.
        // Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO — J=6 é Eleitoral, J=8 é Estadual.
        // Regex: \.6\.26\. (apenas J=6, não J=8 que é TJSP)
        if (/\.6\.26\.\d{4}$/.test(n)) return false;
        return true;
    });
    const temNumerosProcesso = numerosProcesso.length > 0 || ipsEncontrados.length > 0;
    const todosNumerosValidos = [...numerosProcesso, ...ipsEncontrados];

    // ── 6. Decisão final ──────────────────────────────────────────────────────
    let constaVal = '';

    if (eNadaConsta && !temNumerosProcesso && !temPositivoExplicito) {
        // Claramente negativo
        constaVal = 'NADA CONSTA';
    } else if (eNadaConsta && (temNumerosProcesso || temPositivoExplicito)) {
        // Conflito: tem negativo E positivo — provavelmente certidão mista
        // (ex: algumas seções com NADA CONSTA e outras com CONSTA)
        constaVal = 'CONSTA';
    } else if (temNumerosProcesso || temPositivoExplicito) {
        constaVal = 'CONSTA';
    }
    // Se nenhum padrão casou, retorna vazio (inconclusivo)

    // ── 7. Monta resultado ────────────────────────────────────────────────────
    if (constaVal === 'NADA CONSTA') {
        return { consta: 'NADA CONSTA', total: 0, processos: [], resumo: 'nenhum' };
    }

    if (constaVal === 'CONSTA') {
        const totalCalculado = contagemExplicita && contagemExplicita > todosNumerosValidos.length
            ? contagemExplicita
            : todosNumerosValidos.length;

        const ate5  = todosNumerosValidos.slice(0, 5);
        const resto = totalCalculado - ate5.length;
        let resumo  = '';
        if (ate5.length > 0) {
            resumo = ate5.join(' | ');
            if (resto > 0) resumo += ` e outros ${resto}`;
        } else if (totalCalculado > 0) {
            resumo = `${totalCalculado} processo(s) — números não extraídos`;
        } else {
            resumo = 'processo(s) encontrado(s) — quantidade não identificada';
        }

        return { consta: 'CONSTA', total: totalCalculado, processos: todosNumerosValidos, resumo };
    }

    return vazio;
}

// ── Mapeia tipo identificado no texto → categoria esperada pelo nome do doc ──
// Retorna true (corresponde), false (não corresponde) ou null (inconclusivo)
function verificarTipoContraNome(tipoIdentificado, nomeNorm) {
    if (!tipoIdentificado) return null;

    const regras = {
        estadual_1grau:    [/estadual.*(1|primeiro).*grau/, /certidao.*estadual/],
        // eproc/SEEU: 2a certidao de 1o grau (complementar da SAJ), mesmo nome de arquivo.
        // Sem esta entrada, verificarTipoContraNome retornava null -> corresponde=null ->
        // Inconclusivo, mesmo com "para fins eleitorais" e data valida. (Bug corrigido 2026-07.)
        estadual_1grau_eproc: [/estadual.*(1|primeiro).*grau/, /certidao.*estadual/],
        estadual_2grau:    [/estadual.*(2|segundo).*grau/],
        federal_1grau:     [/federal.*(1|primeiro).*grau/, /certidao.*federal/],
        federal_2grau:     [/federal.*(2|segundo).*grau/],
        // Certidão Regional TRF3 cobre 1º e 2º grau — aceita qualquer nome federal
        federal_regional:  [/federal.*(1|primeiro).*grau/, /federal.*(2|segundo).*grau/, /certidao.*federal/, /criminal.*federal/],
        stj:               [/\bstj\b/, /superior.*tribunal.*justica/],
        stf:               [/\bstf\b/, /supremo.*tribunal/],
        stm:               [/\bstm\b/, /militar.*uniao/, /justica.*militar.*uniao/],
        tjm:               [/\btjm\b/, /militar.*estadual/, /militar.*sao paulo/],
        // Objeto e Pé e Breve Relatório são documentos complementares às certidões criminais.
        // Na prática, cartórios os cadastram no PJe com nomenclatura da certidão principal
        // (ex: "Certidão criminal da Justiça Estadual de 1º grau"). Por isso aceitamos
        // qualquer nome que contenha "certidao" ou "criminal" como correspondente válido.
        objeto_pe:         [/objeto.*pe|pe.*objeto/, /complementar/, /breve.*relat/, /certidao/, /criminal/, /estadual/, /federal/],
        // Execução Criminal é expedida exclusivamente pela Justiça Estadual de 1º grau.
        // Aceita nomes de 1º grau ou genéricos; rejeita explicitamente nomes de 2º grau.
        // A rejeição é tratada abaixo (bloco especial exec_criminal), não nesta lista.
        exec_criminal:     [/execucao.*criminal|criminal.*execucao/, /execucao/, /complementar/, /certidao.*estadual/, /estadual.*1|estadual.*primeiro/, /criminal/],
        eleitoral:         [/eleitoral/],
        escolaridade:      [/escolaridade/, /diploma/, /historico/],
        bens:              [/declarac.*bens|bens.*declarac/],
        proposta_governo:  [/proposta.*governo|plano.*governo/],
        desincompat:       [/desincompat/],
        rrc:               [/requerimento|registro.*candidatura|rrc|peticao.*inicial/],
    };

    const padroes = regras[tipoIdentificado];
    if (!padroes) return null;

    // Execução Criminal: expedida exclusivamente pela Justiça Estadual de 1º grau.
    // Rejeita nomes que indiquem 2º grau ou Justiça Federal → nomenclatura_errada.
    if (tipoIdentificado === 'exec_criminal') {
        const naoAdeq = /2.*grau|segundo.*grau|2.*instancia|segundo.*instancia|federal/;
        if (naoAdeq.test(nomeNorm)) return false;
    }

    // Verifica se o nome do documento contém algum dos padrões esperados
    return padroes.some(re => re.test(nomeNorm));
}

// ── Correspondência principal — combina identificação de tipo + palavras-chave ─
// Validade eleitoral obrigatoria (Res. TSE 23.609/2019, art. 27).
// Regra do Braulio (2026-07): certidoes ESTADUAIS (1o/2o grau) do TJSP so
// correspondem se forem "para fins eleitorais". Exige POSITIVAMENTE a
// finalidade eleitoral e BARRA a negacao explicita ("nao vale para fins
// eleitorais"). Recebe texto JA normalizado por _norm (minusculo, sem acento).
function _negaValidadeEleitoral(t) {
    return t.includes('nao vale para fins eleitorais')
        || t.includes('nao serve para fins eleitorais')
        || t.includes('nao e valida para fins eleitorais')
        || t.includes('nao valida para fins eleitorais')
        || t.includes('nao tem validade para fins eleitorais')
        || t.includes('nao possui validade para fins eleitorais')
        || t.includes('sem validade para fins eleitorais');
}
function _temValidadeEleitoral(t) {
    if (!t) return false;
    if (_negaValidadeEleitoral(t)) return false;
    return t.includes('fins eleitorais')
        || t.includes('fins exclusivamente eleitorais')
        || t.includes('finalidade eleitoral')
        || t.includes('certidao eleitoral');
}

// Corte temporal das certidoes (regra do Braulio, 2026-07): so aceitar
// certidoes criminais emitidas a partir de 07/2026. _dataEmissao pega a data
// de emissao como a MAIS RECENTE data plausivel do documento, ignorando datas
// de validade/vigencia (futuras) -- a emissao e sempre o evento mais recente;
// nascimento e datas de processo sao anteriores e nao afetam o maximo. Sem
// data confiavel -> null (NAO barra, para evitar falso negativo).
const _TIPOS_CERTIDAO_CRIMINAL = new Set([
    'estadual_1grau', 'estadual_1grau_eproc', 'estadual_2grau',
    'federal_1grau', 'federal_2grau', 'federal_regional',
    'stm', 'tjm', 'stj', 'stf', 'objeto_pe', 'exec_criminal'
]);
const _CORTE_ANO = 2026, _CORTE_MES = 7; // 01/07/2026
const _MESES_PT = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};
function _fmtData(dt) {
    const dd = (dt.d < 10 ? '0' : '') + dt.d;
    const mm = (dt.m < 10 ? '0' : '') + dt.m;
    return dd + '/' + mm + '/' + dt.y;
}
function _maisRecente(a, b) {
    if (a.y !== b.y) return a.y > b.y;
    if (a.m !== b.m) return a.m > b.m;
    return a.d > b.d;
}
function _dataEmissao(raw) {
    if (!raw) return null;
    const src = raw.substring(0, 20000);
    let best = null;
    const reN = /([0-9]{2})[/]([0-9]{2})[/]([0-9]{4})/g;
    let m;
    while ((m = reN.exec(src)) !== null) {
        const d = +m[1], mo = +m[2], y = +m[3];
        if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2030) continue;
        const pre = _norm(src.substring(Math.max(0, m.index - 45), m.index));
        if (pre.includes('valid') || pre.includes('vigenci') || pre.includes('venciment')) continue;
        const cur = { y: y, m: mo, d: d };
        if (!best || _maisRecente(cur, best)) best = cur;
    }
    const n = _norm(src);
    const reT = /([0-9]{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de ([0-9]{4})/g;
    while ((m = reT.exec(n)) !== null) {
        const y = +m[3];
        if (y < 1900 || y > 2030) continue;
        const pre = n.substring(Math.max(0, m.index - 30), m.index);
        if (pre.includes('valid') || pre.includes('vigenci') || pre.includes('venciment')) continue;
        const cur = { y: y, m: _MESES_PT[m[2]], d: +m[1] };
        if (!best || _maisRecente(cur, best)) best = cur;
    }
    return best;
}
function _certidaoAntesDoCorte(raw) {
    const dt = _dataEmissao(raw);
    if (!dt) return null;
    if (dt.y < _CORTE_ANO || (dt.y === _CORTE_ANO && dt.m < _CORTE_MES)) return dt;
    return null;
}

// Completude da qualificacao (eproc/SEEU): os campos variam -- RG, nome da mae
// e nome do pai nem sempre constam (BRAULIO tem tudo; JOAO so mae). Regra do
// Braulio (2026-07): NAO reprovar por falta de RG (CPF+nome ja identificam);
// apenas INDICAR o que falta (completude confirma a pessoa e afasta homonimo).
// Retorna { reprova, nota }. Nos demais tipos, RG segue exigido (reprova).
function _completudeQualif(tipo_, docIdentEncontrado, texto) {
    if (tipo_ !== 'estadual_1grau_eproc') return { reprova: !docIdentEncontrado, nota: '' };
    const t = _norm((texto || '').substring(0, 15000));
    const falta = [];
    if (!docIdentEncontrado) falta.push('RG');
    if (!(t.includes('nome da mae') || t.includes('filiacao') || t.includes('genitora'))) falta.push('nome da mãe');
    if (!(t.includes('nome do pai') || t.includes('filiacao'))) falta.push('nome do pai');
    const nota = falta.length ? ('sem ' + falta.join(', ') + ' — identificação por CPF+nome') : '';
    return { reprova: false, nota: nota };
}

function nomeCorrespondeConteudo(nome, conteudo) {
    if (!conteudo || !nome) return { corresponde: null, tipoIdentificado: null, labelTipo: null };

    // Limpa o nome do documento
    const nomeSemArq = nome.replace(/\([^)]+\.(pdf|html|doc|txt)[^)]*\)/gi, '').trim();
    const nomeTipo   = nomeSemArq.replace(/\([^)]+\)/g, '').replace(/\s*-\s*[Ff]im\s+\w+\s*$/i, '').trim();
    const nomeNorm   = _norm(nomeTipo);

    // Documentos que dispensam verificação de conteúdo (presença já é suficiente)
    if (/relatorio.*(requisito|registro)|declarac.*bens|bens.*declarac/.test(nomeNorm))
        return { corresponde: true, tipoIdentificado: 'dispensado', labelTipo: 'Verificação humana' };

    // Petição Inicial e RRC contêm campos de escolaridade, bens e outros dados do candidato
    // que disparam falsos positivos na identificação de tipo — verificar apenas presença
    if (/peticao.*inicial|inicial.*peticao/.test(nomeNorm) ||
        /\brrc\b|requerimento.*registro|registro.*candidatura/.test(nomeNorm))
        return { corresponde: true, tipoIdentificado: 'presente', labelTipo: null };

    // ── 1. Identifica o tipo real pelo conteúdo do texto ──
    const { tipo: tipoId, label: labelTipo } = identificarTipoPeloTexto(conteudo);

    // ── 2. Se identificou um tipo, compara com o nome do documento ──
    if (tipoId) {
        // Certidao civel: reconhecida, porem NUNCA adequada ao requisito criminal.
        // Retorna direto (nao depende do nome) -- decisao trata como Corresponde - Nao adequada.
        if (tipoId === 'civel_inadequada') {
            return { corresponde: false, tipoIdentificado: 'civel_inadequada', labelTipo };
        }
        const bate = verificarTipoContraNome(tipoId, nomeNorm);
        // Validade eleitoral nas ESTADUAIS (1o/2o grau) -- regra do Braulio (2026-07).
        // Nome bate, mas se a certidao estadual nao e "para fins eleitorais", NAO corresponde.
        if (bate && (tipoId === 'estadual_1grau' || tipoId === 'estadual_1grau_eproc' || tipoId === 'estadual_2grau')) {
            const _tv = _norm(conteudo.substring(0, 15000));
            if (!_temValidadeEleitoral(_tv)) {
                const _lbl = _negaValidadeEleitoral(_tv)
                    ? (labelTipo || 'Certidão estadual') + ' — traz "não vale para fins eleitorais"'
                    : (labelTipo || 'Certidão estadual') + ' — sem "para fins eleitorais"';
                return { corresponde: false, tipoIdentificado: 'estadual_invalida', labelTipo: _lbl };
            }
        }
        // Corte temporal (regra do Braulio 2026-07): so certidoes CRIMINAIS emitidas
        // a partir de 07/2026. So barra quando ha data de emissao confiavel < corte.
        if (bate && _TIPOS_CERTIDAO_CRIMINAL.has(tipoId)) {
            const _dt = _certidaoAntesDoCorte(conteudo);
            if (_dt) {
                return { corresponde: false, tipoIdentificado: 'certidao_antiga',
                         labelTipo: (labelTipo || 'Certidão') + ' — emitida em ' + _fmtData(_dt) + ' (anterior a 07/2026)' };
            }
        }
        return { corresponde: bate, tipoIdentificado: tipoId, labelTipo };
    }

    // ── 3. Certidões federais exigem "certidao judicial para fins eleitorais" ──
    // Se o nome indica certidão federal (1º grau, 2º grau ou regional) mas o OCR
    // não identificou o tipo, significa que o texto não contém a expressão obrigatória.
    // Documentos como "CERTIDÃO JUDICIAL CRIMINAL NEGATIVA" não são válidos para fins
    // eleitorais e devem ser considerados "Não corresponde".
    // Retorna tipoIdentificado: 'federal_invalida' para que o bloco de decisão em
    // processarPDFsPendentes (else if tipoIdentificado) chame _runIdentityCheck
    // com 'nomenclatura_errada', resultando em status nao_corresponde via _derivarStatus.
    if (/federal.*(1|primeiro|2|segundo).*grau|federal.*regional|criminal.*federal|certidao.*federal/i.test(nomeNorm)) {
        return { corresponde: false, tipoIdentificado: 'federal_invalida', labelTipo: 'Certidão federal sem "para fins eleitorais"' };
    }

    // ── 4. Fallback: verificação genérica por palavras-chave do nome ──
    const textoNorm = _norm(conteudo.substring(0, 10000));
    const stop      = new Set(['de','da','do','das','dos','e','a','o','em','para','com','por','no','na','que','ou','um','uma']);
    const palavras  = nomeNorm.split(' ').filter(p => p.length > 3 && !stop.has(p));
    if (!palavras.length) return { corresponde: null, tipoIdentificado: null, labelTipo: null };
    const acertos = palavras.filter(p => textoNorm.includes(p)).length;
    const ratio   = acertos / palavras.length;
    return { corresponde: ratio >= 0.4 ? true : false, tipoIdentificado: null, labelTipo: null };
}

// ── Comprovante de CADASTRO/PEDIDO de certidão (e-SAJ / TJSP) ──────────────────
// NÃO é a certidão emitida: é o recibo de que o pedido foi cadastrado ("Prazo máximo
// para liberação da Certidão"). Traz apenas o NOME do modelo pedido (ex.: "Certidão
// Negativa para Fins Eleitorais"), o que enganava o batimento por nome (fallback de
// 40%) e o identificarConsta (NADA CONSTA falso). Detecta por marcadores exclusivos
// do recibo, que a certidão emitida nunca contém.
function _ePedidoDeCertidao(texto) {
    if (!texto) return false;
    const t = _norm(texto.substring(0, 4000));
    return t.includes('cadastro de pedido de certidao')
        || t.includes('seu pedido foi cadastrado')
        || (t.includes('numero do pedido') && t.includes('data do pedido'))
        || t.includes('prazo maximo para liberacao da certidao')
        || t.includes('para posterior emissao da certidao')
        || t.includes('abrirresultadocadastro');
}

// ---- E-mail / resposta automatica do TJSP (nao e a certidao emitida) ----------
// O candidato as vezes anexa o e-mail do protocolo ("RESPOSTA AUTOMATICA" da 2a
// instancia, avisando prazo de 5 dias uteis) no lugar da certidao. Esse e-mail
// menciona "segunda instancia"/"tribunal de justica"/"criminal" e caia em
// estadual_2grau. A certidao EMITIDA traz o ATO ("CERTIFICO/CERTIFICAMOS ... NADA
// CONSTAR"); o e-mail so fala SOBRE a certidao. Detecta o e-mail e exige AUSENCIA
// do ato -- um PDF que contenha o e-mail E a certidao anexada nao e barrado.
function _eEmailSemCertidao(texto) {
    if (!texto) return false;
    const t = _norm(texto.substring(0, 6000));
    const eEmail = t.includes('resposta automatica')
        || t.includes('forwarded message')
        || t.includes('mensagem encaminhada')
        || t.includes('o remetente desta mensagem e responsavel')
        || (t.includes('assunto:') && t.includes('para:') && t.includes('de:'))
        || (t.includes('subject:') && t.includes('to:') && t.includes('date:'));
    if (!eEmail) return false;
    const temAtoCertidao = t.includes('certifico')
        || t.includes('certificamos')
        || t.includes('nada consta')
        || t.includes('verificamos nada')
        || t.includes('certidao numero')
        || t.includes('certidao no ');
    return !temAtoCertidao;
}

// ═════════════════════════════════════════════════════════════════════════════
// PROCESSAMENTO DE PDFs NA AUDITORIA
// ═════════════════════════════════════════════════════════════════════════════

async function processarPDFsPendentes(resultados, requerente, cpfRequerente, docIdentRequerente, onItemAtualizado) {
    // onItemAtualizado(r) — callback opcional injetado por ui/auditoria.js
    // Elimina dependência do Domain para a camada UI (DDD: Domain não conhece UI)
    const _notificar = typeof onItemAtualizado === 'function' ? onItemAtualizado : () => {};
    const pendentes = resultados.filter(r => {
        if (r.status !== 'pdf_pendente' || !(r.base64 || r._url)) return false;
        // Identidade/RG/escolaridade/título: verificação humana — não analisa conteúdo
        // MAS preserva a URL para que o botão "👁 ver PDF" funcione
        const tipoNorm = r.nome.replace(/\([^)]+\)/g, '').trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
        if (/^identidade|^comprovante.*(escolaridade|titulo)|^titulo.*eleitoral|relatorio.*(requisito|registro)|declarac.*bens|bens.*declarac/.test(tipoNorm)) {
            r.status = 'presente';
            // Preserva _url e registra no cache para o visualizador
            if (r._url) _registrarPDF(r.id, null, r._url);
            if (r.base64) {
                _registrarPDF(r.id, r.base64, r._url);
                r.base64 = null; // libera memória mas mantém a URL
            }
            _notificar(r);
            return false;
        }
        return true;
    });

    for (const r of pendentes) {
        try {
            // Busca base64 pela URL caso não tenha chegado
            if (!r.base64 && r._url) {
                try {
                    const res = await fetch(r._url, { credentials: 'include' });
                    if (res.ok) {
                        const blob   = await res.blob();
                        const reader = new FileReader();
                        r.base64     = await new Promise((resolve, reject) => {
                            reader.onload  = () => resolve(reader.result.split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                } catch (e) { console.warn('[auditoria] Erro ao buscar PDF:', e.message); }
            }

            if (!r.base64) { r.status = 'sem_conteudo'; _notificar(r); continue; }

            // Atualiza status para mostrar que está extraindo
            r.status = 'pdf_pendente';
            _notificar(r);

            // Extrai texto (nativo → OCR → regex)
            const texto = await Promise.race([
                extrairTextoPDF(r.base64),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))
            ]).catch(e => { console.warn('[auditoria] Timeout/erro PDF:', e.message); return null; });

            const textoValido = texto && texto.length >= 10 && isTextoLegivel(texto);
            console.log(`[AuditJE][análise] "${r.nome}" | texto extraído: ${texto?.length ?? 0} chars | válido: ${textoValido}`);

            if (!textoValido) {
                r._verificacao   = 'inconclusivo';
                r._conteudo      = 'sem_texto';
                r._textoExtraido = texto || '';
                console.warn(`[AuditJE][análise] "${r.nome}" → sem texto válido (${texto?.length ?? 0} chars, legível: ${texto ? isTextoLegivel(texto) : 'n/a'})`);
            } else if (isTextoBinario(texto)) {
                r._verificacao   = 'inconclusivo';
                r._conteudo      = 'ilegivel';
                r._textoExtraido = texto;
                console.warn(`[AuditJE][análise] "${r.nome}" → texto binário/ilegível`);
            } else if (_eEmailSemCertidao(texto)) {
                // E-mail/resposta automatica do TJSP no lugar da certidao emitida.
                // Nao roda identificarConsta/identificarTipo (evita falso positivo de
                // "2o grau" por citar "segunda instancia + tribunal de justica + criminal").
                r._textoExtraido    = texto;
                r._tipoIdentificado = 'E-mail / resposta automática (não é a certidão)';
                r._tipoDoc          = null;
                r._verificacao      = 'nao_corresponde';
                r._conteudo         = 'completo';
                r._avisoNome        = 'O documento apresentado é um e-mail/resposta automática do TJSP, não a certidão emitida — anexar a certidão de 2º grau emitida';
                console.warn('[AuditJE] e-mail/resposta automatica ignorado (nao e a certidao): ' + r.nome);
            } else if (_ePedidoDeCertidao(texto)) {
                // Comprovante de CADASTRO/PEDIDO de certidão (e-SAJ) — não é a certidão emitida.
                // Marca nao_corresponde e NÃO roda identificarConsta (o nome do "Modelo" — ex.:
                // "Certidão Negativa para Fins Eleitorais" — geraria um NADA CONSTA falso).
                r._textoExtraido    = texto;
                r._tipoIdentificado = 'Comprovante de pedido de certidão (e-SAJ)';
                r._tipoDoc          = null;
                r._verificacao      = 'nao_corresponde';
                r._conteudo         = 'completo';
                r._avisoNome        = 'É o comprovante de cadastro do pedido da certidão (e-SAJ), não a certidão emitida — anexar a certidão emitida';
                console.warn(`[AuditJE][análise] "${r.nome}" → comprovante de PEDIDO de certidão (não é a certidão emitida)`);
            } else {
                r._textoExtraido = texto;

                const { corresponde, tipoIdentificado, labelTipo } = nomeCorrespondeConteudo(r.nome, texto);
                console.log(`[AuditJE][análise] "${r.nome}" | tipo OCR: ${tipoIdentificado ?? 'null'} (${labelTipo ?? 'sem label'}) | corresponde: ${corresponde} | amostra: "${texto.substring(0,120).replace(/\n/g,' ')}"`);

                r._tipoIdentificado = labelTipo || tipoIdentificado || '';
                r._tipoDoc = tipoIdentificado || null;

                const resultConsta  = identificarConsta(texto);
                r._consta           = resultConsta.consta;
                r._constaTotal      = resultConsta.total;
                r._constaProcessos  = resultConsta.processos;
                r._constaResumo     = resultConsta.resumo;
                console.log(`[AuditJE][análise] "${r.nome}" | consta: "${resultConsta.consta}" | processos: ${resultConsta.total} | resumo: ${resultConsta.resumo}`);

                // ── Sub-rotina: verifica identidade nominal e define _verificacao + _conteudo ──
                //
                // Separação de responsabilidades:
                //   _avisoNome    → detalhe da VERIFICAÇÃO (nome não encontrado; tipo nomenclatura)
                //   _avisoConteudo → detalhe do CONTEÚDO (CPF / doc. ident. ausentes no PDF)
                //
                // Hierarquia de decisão:
                //   1. Nome não encontrado → pessoa_errada (não é possível confirmar identidade)
                //   2. Nome encontrado, mas CPF e/ou doc. ident. ausentes → verificacaoBase + incompleto
                //      (identidade confirmada, dados faltantes no documento)
                //   3. Todos encontrados → verificacaoBase + completo
                const _runIdentityCheck = (verificacaoBase) => {
                    // Aviso de verificação para nomenclatura errada ou documento não adequado
                    if ((verificacaoBase === 'nomenclatura_errada' || verificacaoBase === 'corresponde_nao_adequada') && labelTipo) {
                        r._avisoNome = `tipo identificado: "${labelTipo}"`;
                    }

                    const deveChecar = requerente && eCertidaoNominalEfetiva(r.nome, tipoIdentificado);
                    console.log(`[AuditJE][identidade] "${r.nome}" | deveChecar: ${deveChecar} | requerente: "${requerente}" | tipoId: ${tipoIdentificado}`);
                    if (!deveChecar) {
                        r._verificacao = verificacaoBase;
                        r._conteudo    = 'completo';
                        return;
                    }
                    const resNome = verificaNomeNoCertidao(requerente, texto);
                    const tipo_ = tipoIdentificado || r._tipoDoc || '';
                    const resCPF  = cpfRequerente
                        ? verificaCPFNaCertidao(cpfRequerente, texto)
                        : { encontrado: true, detalhes: '' };
                    const eVerificaDocIdent = tipo_ === 'estadual_1grau' || tipo_ === 'estadual_1grau_eproc' || tipo_ === 'estadual_2grau'
                                           || tipo_ === 'objeto_pe'  || tipo_ === 'exec_criminal';
                    const resDocIdent = eVerificaDocIdent && docIdentRequerente
                        ? verificaDocIdentNaCertidao(docIdentRequerente, texto)
                        : { encontrado: true, detalhes: '' };

                    if (!resNome.encontrado) {
                        r._verificacao = 'pessoa_errada';
                        r._conteudo    = 'completo';
                        r._avisoNome   = 'nome "' + requerente + '" nao encontrado -- ' + resNome.detalhes;
                    } else {
                        r._verificacao = verificacaoBase;
                        const faltantes = [];
                        if (!resCPF.encontrado)      faltantes.push('CPF "' + cpfRequerente + '" nao encontrado');
                        const _cq = _completudeQualif(tipo_, resDocIdent.encontrado, texto);
                        if (_cq.reprova) faltantes.push(resDocIdent.detalhes);
                        if (_cq.nota) r._notaQualif = _cq.nota;
                        if (faltantes.length > 0) {
                            r._conteudo      = 'incompleto';
                            r._avisoConteudo = faltantes.join('; ');
                        } else {
                            r._conteudo = 'completo';
                        }
                    }
                };

                if (corresponde === null) {
                    r._verificacao = 'inconclusivo';
                    r._conteudo    = null;
                } else if (corresponde) {
                    // Execução Criminal: conteúdo identificado, mas documento não é adequado
                    // para suprir o requisito de certidão de distribuições criminais.
                    if (tipoIdentificado === 'exec_criminal') {
                        _runIdentityCheck('corresponde_nao_adequada');
                    } else {
                        _runIdentityCheck('corresponde');
                    }
                } else if (tipoIdentificado === 'federal_invalida' || tipoIdentificado === 'estadual_invalida' || tipoIdentificado === 'certidao_antiga') {
                    // Certidão federal sem "certidao judicial para fins eleitorais" — não válida
                    // para fins eleitorais. Marca como nao_corresponde diretamente, sem
                    // verificação de identidade (o problema é o tipo do documento, não o nome).
                    r._verificacao = 'nao_corresponde';
                    r._conteudo    = 'completo';
                    r._avisoNome   = labelTipo || 'Certidão federal sem "para fins eleitorais"';
                } else if (tipoIdentificado === 'civel_inadequada') {
                    // Certidao civel -- reconhecida, porem NAO adequada ao requisito
                    // criminal. Mesma UX do exec_criminal (Corresponde - Nao adequada),
                    // sem checagem de identidade (o problema e o dominio, nao a pessoa).
                    r._verificacao = 'corresponde_nao_adequada';
                    r._conteudo    = 'completo';
                    r._avisoNome   = labelTipo || 'Certidão cível — não adequada ao requisito criminal';
                } else if (tipoIdentificado) {
                    // Nome do arquivo não corresponde ao conteúdo, mas OCR identificou o tipo.
                    // Trata como nomenclatura errada — faz verificação de identidade normalmente.
                    _runIdentityCheck('nomenclatura_errada');
                } else {
                    r._verificacao = 'inconclusivo';
                    r._conteudo    = null;
                }
            }

            // Deriva o status legado
            r.status = _derivarStatus(r);
            // Preserva o status gerado pelo OCR — imutável, nunca sobrescrito por overrides manuais
            // Usado pelos filtros de diligência para identificar "Pessoa errada" mesmo após correções
            if (!r._statusOCR) r._statusOCR = r.status;
        } catch (e) {
            console.warn('[auditoria] Erro ao processar PDF:', r.id, e.message);
            r.status = 'pdf_sem_texto';
        }

        r.base64 = null;
        if (r._textoExtraido) _registrarTexto(r.id, r._textoExtraido);
        if (r._url) _registrarPDF(r.id, null, r._url);
        _notificar(r);  // V4: callback -- domain nao chama UI diretamente

        await new Promise(res => setTimeout(res, 200));
    }
}
