// relatorios.js — Cruzamento de certidões e geração de relatórios do CAND.
// Extraído de ui/cand.js sem alteração de lógica:
//   cruzarComObjetoPe / _situacaoArquivada — cruzam distribuição × objeto e pé;
//   gerarTabelaDistribuicaoObjetoPe — tabela de diligências por processo;
//   gerarCertidaoRecebimento — Certidão Preliminar (Art. 11, Lei 9.504/97).
// Depende de globais de config.js, domain/certidoes.js e ui/cand.js.
// Carregado antes de ui/cand.js em chat.html.

// ── Cruza processos com certidões de objeto e pé ─────────────────────────────
function cruzarComObjetoPe(resultados) {
    // Coleta todas as certidões de objeto e pé preservando o ID do documento
    const objetosPe = resultados
        .filter(r => (r._tipoIdentificado === 'Certidão de Objeto e Pé (complementar)'
                   || r._tipoIdentificado === 'Certidão em Breve Relatório (complementar)'
                   || r._tipoDoc === 'objeto_pe') && r._textoExtraido)
        .map(r => {
            const dados = extrairDadosObjetoPe(r._textoExtraido);
            return dados ? { ...dados, docId: r.id } : null;
        })
        .filter(Boolean);

    // Tipos de documento que podem conter processos criminais distribuídos
    const _TIPOS_CERT_CRIMINAL = new Set([
        'estadual_1grau','estadual_1grau_eproc','estadual_2grau','federal_1grau','federal_2grau',
        'federal_regional','stj','stf','stm','tjm','exec_criminal',
    ]);

    // Para cada certidão criminal com CONSTA, cruza processos pelo número CNJ
    for (const r of resultados) {
        const _textoDistr = r._textoExtraido || r._textoAmostra;
        if (r._consta !== 'CONSTA' || !_textoDistr) continue;
        // Ignora documentos que não sejam certidões criminais (ex: petições do MPE,
        // RRC com nomenclatura errada, manifestações que mencionam "CONSTA" no texto)
        if (!_TIPOS_CERT_CRIMINAL.has(r._tipoDoc)) continue;

        const _numReg = infoProcesso?.numero || '';
        const { qualificados, naoQualificados } = extrairProcessosDaCertidao(_textoDistr, {
            excluirNumeros: [_numReg],
        });

        // Cruza qualificados com objeto e pé
        r._processosDetalhados = qualificados.map(p => {
            const op = objetosPe.find(o => o.numero === p.numero);
            return { ...p, objetoPe: op || null };
        });
        r._naoQualificados = naoQualificados;
    }
}

// ── Retorna true se a situação indica processo encerrado (arquivado / extinto / absolvido) ──
function _situacaoArquivada(situacao) {
    if (!situacao) return false;
    const s = situacao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /arquiv|extinc|extint|absolvid|impronunci|baixa\s+definitiv|encerrad|julgad.*definitiv|condenac.*cumprida/.test(s);
}

// ── Gera tabela de cruzamento Distribuição × Objeto e Pé ─────────────────────
function gerarTabelaDistribuicaoObjetoPe(resultados) {
    // Garante que _processosDetalhados está preenchido independente da ordem de chamada
    cruzarComObjetoPe(resultados);

    // Certidões de distribuição com CONSTA.
    // Exclui documentos com "Situação Processual:" — marcador exclusivo de
    // certidões de objeto e pé / breve relatório, independente de como foram
    // classificados no PJe.
    // Inclui mesmo sem _processosDetalhados: quando processos individuais não puderam
    // ser extraídos, ainda exibe a tabela com o que estiver disponível (_constaProcessos
    // ou total), pois as certidões de objeto e pé podem ser juntadas futuramente.
    const certidoesConsta = resultados.filter(r =>
        r._consta === 'CONSTA'
        && !/Situa[cç][aã]o\s+Processual/i.test(r._textoExtraido || r._textoAmostra || '')
    );
    if (certidoesConsta.length === 0) return null;

    // Mapa de dados do objeto e pé pelo número do processo CNJ, com ID do documento
    const objetosPeMap = new Map();
    for (const r of resultados) {
        const isObjPe = r._tipoIdentificado === 'Certidão de Objeto e Pé (complementar)'
            || r._tipoIdentificado === 'Certidão em Breve Relatório (complementar)'
            || r._tipoDoc === 'objeto_pe';
        if (isObjPe && r._textoExtraido) {
            const dados = extrairDadosObjetoPe(r._textoExtraido);
            if (dados) objetosPeMap.set(dados.numero, { ...dados, docId: r.id });
        }
    }

    // Labels e ordem de exibição por tipo de certidão
    const _LABEL_TIPO = {
        estadual_1grau:    'Certidão Criminal — Justiça Estadual 1º grau (SAJ)',
        estadual_1grau_eproc: 'Certidão Criminal — Justiça Estadual 1º grau (eproc/SEEU)',
        exec_criminal:     'Certidão Criminal — Justiça Estadual 1º grau (Execução Criminal — complementar)',
        estadual_2grau:    'Certidão Criminal — Justiça Estadual 2º grau',
        federal_1grau:     'Certidão Criminal — Justiça Federal 1º grau',
        federal_2grau:      'Certidão Criminal — Justiça Federal 2º grau',
        federal_regional:   'Certidão Criminal Federal (Regional — 1º e 2º grau)',
        foro_prerrogativa: 'Certidão — Foro por Prerrogativa de Função',
        stj:               'Certidão Criminal — STJ',
        stf:               'Certidão Criminal — STF',
        stm:               'Certidão Criminal — STM (Militar Federal)',
        tjm:               'Certidão Criminal — TJM/JM-SP (Militar Estadual)',
    };
    // exec_criminal aparece logo após estadual_1grau (mesma instância, tipo complementar)
    const _ORDEM = ['estadual_1grau','estadual_1grau_eproc','exec_criminal','estadual_2grau','federal_1grau','federal_2grau',
                    'federal_regional','foro_prerrogativa','stj','stf','stm','tjm'];

    // Agrupa processos por tipo de certidão de distribuição
    const gruposMap = new Map();
    // Por tipo: rastreia números CNJ já adicionados para deduplicação entre certidões
    // (auditoria complementar pode trazer nova certidão com os mesmos processos)
    // Regra: se o processo já está na tabela COM objeto e pé encontrado, não substitui;
    // se estava "Não localizada" e agora temos o objeto e pé, atualiza.
    const _numerosAdicionados = new Map(); // tipo → Set de números CNJ já inseridos
    for (const certidao of certidoesConsta) {
        const tipo = certidao._tipoDoc || 'outro';
        if (!gruposMap.has(tipo)) {
            gruposMap.set(tipo, { rows: [], naoQualificados: [] });
            _numerosAdicionados.set(tipo, new Set());
        }
        const grupo = gruposMap.get(tipo);
        const _vistos = _numerosAdicionados.get(tipo);

        if (certidao._processosDetalhados?.length > 0) {
            for (const proc of certidao._processosDetalhados) {
                const ano = proc.numero.match(/\d{7}-\d{2}\.(\d{4})\./)?.[1] || '';
                const op  = proc.objetoPe
                    ? { ...proc.objetoPe, docId: proc.objetoPe.docId }
                    : objetosPeMap.get(proc.numero) || null;
                const situacao = op?.situacao || '';

                let idOpPrincipal = '-', situacaoPrinc = '-', necessidade = 'NÃO';

                if (!op) {
                    necessidade = 'SIM (Documento faltante)';
                } else if (op.isApensado) {
                    const opPrinc = op.processoApenso ? objetosPeMap.get(op.processoApenso) : null;
                    idOpPrincipal = op.processoApenso ? (opPrinc?.docId ? `ID ${opPrinc.docId}` : op.processoApenso) : 'Principal não identificado';
                    situacaoPrinc = opPrinc?.situacao || 'Certidão do principal não localizada';
                    necessidade   = opPrinc
                        ? (_situacaoArquivada(opPrinc.situacao) ? 'NÃO' : 'SIM (Verificar principal)')
                        : 'SIM (Falta certidão do principal)';
                } else if (_situacaoArquivada(situacao)) {
                    necessidade = 'NÃO';
                } else if (situacao) {
                    necessidade = 'SIM (Verificar situação)';
                } else {
                    necessidade = 'SIM (Situação não identificada)';
                }

                const _novaRow = {
                    ano,
                    posicao:        proc.posicao ? `${proc.posicao}º` : '-',
                    numero:         proc.numero,
                    classeDistr:    proc.classe || '-',
                    idObjetoPe:     op ? (op.docId ? `ID ${op.docId}` : 'Localizada s/ ID') : 'Não localizada',
                    docIdObjetoPe:  op?.docId || null,
                    classeOp:       op?.classe || '-',
                    situacao:       situacao || (op ? '-' : 'Citado na certidão'),
                    idOpPrincipal,
                    situacaoPrinc,
                    necessidade,
                };
                // Deduplicação: se o número já existe na tabela, atualiza a linha existente
                // quando a nova linha tiver objeto e pé encontrado (substitui "Não localizada")
                const _idxExist = grupo.rows.findIndex(r => r.numero === proc.numero);
                if (_idxExist === -1) {
                    grupo.rows.push(_novaRow);
                    _vistos.add(proc.numero);
                } else if (op && !grupo.rows[_idxExist].docIdObjetoPe) {
                    // Havia "Não localizada" — agora temos o objeto e pé: atualiza
                    grupo.rows[_idxExist] = _novaRow;
                }
                // Se o existente já tem objeto e pé, descarta a linha duplicada
            }

            if (certidao._naoQualificados?.length > 0) {
                for (const p of certidao._naoQualificados) {
                    const op = objetosPeMap.get(p.numero) || null;
                    const situacao = op?.situacao || '';
                    let necessidade;
                    if (!op)                               necessidade = 'SIM (Documento faltante)';
                    else if (_situacaoArquivada(situacao)) necessidade = 'NÃO';
                    else if (situacao)                     necessidade = 'SIM (Verificar situação)';
                    else                                   necessidade = 'SIM (Situação não identificada)';
                    grupo.naoQualificados.push({
                        ...p,
                        idObjetoPe:    op ? (op.docId ? `ID ${op.docId}` : 'Localizada s/ ID') : 'Não localizada',
                        docIdObjetoPe: op?.docId || null,
                        situacao:      situacao || (op ? '-' : 'Citado na certidão'),
                        necessidade,
                    });
                }
            }
        } else {
            // Distribuição indica CONSTA mas detalhes de processo não foram extraídos.
            // Usa _constaProcessos (números CNJ extraídos por identificarConsta) como fallback,
            // pois as certidões de objeto e pé poderão ser juntadas futuramente.
            const processosBasicos = certidao._constaProcessos || [];
            const totalCertidao    = certidao._constaTotal || 0;

            if (processosBasicos.length > 0) {
                for (const num of processosBasicos) {
                    const op = objetosPeMap.get(num) || null;
                    const situacao = op?.situacao || '';
                    let necessidade;
                    if (!op)                               necessidade = 'SIM (Documento faltante)';
                    else if (_situacaoArquivada(situacao)) necessidade = 'NÃO';
                    else if (situacao)                     necessidade = 'SIM (Verificar situação)';
                    else                                   necessidade = 'SIM (Situação não identificada)';
                    grupo.rows.push({
                        ano:           num.match(/\d{7}-\d{2}\.(\d{4})\./)?.[1] || '',
                        posicao:       '-',
                        numero:        num,
                        classeDistr:   '-',
                        idObjetoPe:    op ? (op.docId ? `ID ${op.docId}` : 'Localizada s/ ID') : 'Não localizada',
                        docIdObjetoPe: op?.docId || null,
                        classeOp:      op?.classe || '-',
                        situacao:      situacao || (op ? '-' : 'Aguardando certidão'),
                        idOpPrincipal: '-',
                        situacaoPrinc: '-',
                        necessidade,
                    });
                }
                const extraCount = totalCertidao - processosBasicos.length;
                if (extraCount > 0) {
                    grupo.rows.push({
                        ano: '', posicao: '-',
                        numero:        `+${extraCount} processo(s) — ver certidão`,
                        classeDistr:   '-', idObjetoPe: 'Não localizada', docIdObjetoPe: null,
                        classeOp:      '-', situacao:   '-', idOpPrincipal: '-', situacaoPrinc: '-',
                        necessidade:   'SIM (Documento faltante)',
                    });
                }
            } else {
                // Nem números CNJ disponíveis — exibe resumo textual ou total
                const numExib = certidao._constaResumo
                    || (totalCertidao > 0 ? `${totalCertidao} processo(s)` : 'processos não identificados');
                grupo.rows.push({
                    ano: '', posicao: '-',
                    numero:        numExib,
                    classeDistr:   '-', idObjetoPe: 'Não localizada', docIdObjetoPe: null,
                    classeOp:      '-', situacao:   '-', idOpPrincipal: '-', situacaoPrinc: '-',
                    necessidade:   'SIM (Documento faltante)',
                });
            }
        }
    }

    // Monta array de grupos na ordem definida + tipos extras
    const _tsvCols = ['Ano','Posição na Distr.','Número do Processo','Classe Processual (Distribuição)',
        'ID (Objeto e Pé)','Classe Processual (Objeto e Pé)','Situação',
        'ID (Objeto e Pé) — Processo Principal','Situação Principal','Necessidade de Diligência'];
    const _buildTsv = (rows) => {
        const linhas = [_tsvCols.join('\t')];
        for (const r of rows)
            linhas.push([r.ano,r.posicao,r.numero,r.classeDistr,r.idObjetoPe,r.classeOp,
                r.situacao,r.idOpPrincipal,r.situacaoPrinc,r.necessidade].join('\t'));
        return linhas.join('\n');
    };
    const _sortRows = (rows) => rows.sort((a, b) => {
        const c = (a.ano || '').localeCompare(b.ano || '');
        return c !== 0 ? c : (parseInt(a.posicao) || 0) - (parseInt(b.posicao) || 0);
    });

    const tiposOrdenados = [..._ORDEM, ...[...gruposMap.keys()].filter(t => !_ORDEM.includes(t))];
    const grupos = [];
    for (const tipo of tiposOrdenados) {
        if (!gruposMap.has(tipo)) continue;
        const g = gruposMap.get(tipo);
        if (g.rows.length === 0) continue;
        _sortRows(g.rows);
        grupos.push({ tipo, label: _LABEL_TIPO[tipo] || tipo, rows: g.rows, tsv: _buildTsv(g.rows), naoQualificados: g.naoQualificados });
    }

    const total = grupos.reduce((s, g) => s + g.rows.length, 0);
    if (grupos.length === 0) return null;
    return { grupos, total };
}

// ── Gera modelo de certidão de recebimento / verificação preliminar ───────────
function gerarCertidaoRecebimento(resultados) {
    resultados = _resultadosComOverrides(resultados);
    const card = document.getElementById('processo-info-card');
    const requerente = card?.querySelector('[data-info="requerente"] .card-val')?.textContent?.trim() || '______________________';
    const cpf        = card?.querySelector('[data-info="cpf"] .card-val')?.textContent?.trim() || '______________________';
    const cargo      = card?.querySelector('[data-info="cargo"] .card-val')?.textContent?.trim() || '';
    const numProc    = infoProcesso?.numero || '______________________';
    const assocNum   = infoProcesso?.processoAssociado || _S._processoAssociado || '';

    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Apresentados sem ressalvas (verificação completa e positiva)
    const presentes = resultados.filter(r =>
        r.status === 'presente' || r.status === 'corresponde' || r.status === 'nomenclatura_errada'
    );
    // Apresentados com ressalvas ⚠️ (incompleto, ilegível, ou nomenclatura errada com conteúdo incompleto/ilegível)
    const ressalvas = resultados.filter(r =>
        r.status?.startsWith('corresponde_')
        || r.status === 'nomenclatura_errada_incompleto'
        || r.status === 'nomenclatura_errada_ilegivel'
    );
    // Ausentes com resultado na árvore (marcados como nao_apresentado durante auditoria)
    const ausentesNaArvore = resultados.filter(r => r.status === 'nao_apresentado');
    const pendentes = resultados.filter(r => {
        // Certidões de Objeto e Pé / Breve Relatório são documentos complementares —
        // avaliadas via tabela de Distribuição × Objeto e Pé, não como pendência individual.
        if (r._tipoDoc === 'objeto_pe') return false;
        return r.status === 'nao_corresponde'
            || r.status === 'nao_corresponde_nome'
            || r.status === 'nao_corresponde_incompleto'
            || r.status === 'nao_corresponde_ilegivel'
            || r.status === 'nao_corresponde_incompleto_ilegivel'
            || r.status === 'pdf_sem_texto'
            || r.status === 'inconclusivo';
    });

    // Itens obrigatórios do CAND que não têm nenhum resultado na árvore do PJe
    // (documentos que sequer foram juntados — não aparecem nem como nao_apresentado)
    // Só lista ausentes quando a auditoria foi "completa" ou "principal":
    // em modos filtrados (ex: 'certidoes') os demais itens simplesmente não foram auditados.
    const _tipoAuditoria = _S._auditoriaTipo || 'completa';
    const ausentesForaArvore = (_tipoAuditoria === 'completa' || _tipoAuditoria === 'principal')
        ? _ITENS_CAND
            .filter(item => {
                if (['convencao', 'divergencias'].includes(item.id)) return false;
                // Desincompat: não se aplica se candidato não necessita OU se o seletor/texto indica isso
                if (item.id === 'desincompat' || item.id === 'prerrogativa') {
                    const _selPD2 = (_S._candSeletoresPD || {})[item.id];
                    if (_selPD2 === 'nao_aplica') return false;
                    // Verifica também o texto salvo no textarea — auto-gerado ou manual
                    const _textoSalvo2 = (_S._candTextos || {})[item.id] || '';
                    if (/^n[ãa]o\s+se\s+aplica/i.test(_textoSalvo2)) return false;
                }
                if (item.id === 'desincompat' && !_candidatoNecessitaDesincompat()) return false;
                // Se o usuário marcou "— N/A" (nao_aplica) via seletor manual, não listar como ausente
                const _selPD = (_S._candSeletoresPD || {})[item.id];
                if (_selPD === 'nao_aplica') return false;
                return _encontrarResultadoCAND(item, resultados) === null;
            })
            .map(item => ({
                nome: item.titulo.replace(/^\d+\.\s*/, ''),
                id: null,
                status: 'nao_apresentado',
            }))
        : [];

    const todosAusentes = [...ausentesNaArvore, ...ausentesForaArvore];

    const fmtDoc = r => {
        const nome = (r.nome || '').replace(/\([^)]+\)/g, '').trim();
        const id = r.id ? ` (ID ${r.id})` : '';
        return `  • ${nome}${id}`;
    };

    const linhaAssoc = assocNum ? `\nProcesso associado: ${assocNum}` : '';

    const _modoLabel = {
        completa:  'Processo completo',
        principal: 'Documentos apresentados',
        certidoes: 'Certidões e docs. específicos',
    }[_tipoAuditoria] || _tipoAuditoria;

    const _servidor  = _S._servidorResponsavel || '';
    const _dataAud   = _S._dataAuditoria || hoje;

    let texto = `CERTIDÃO PRELIMINAR DE VERIFICAÇÃO DE DOCUMENTOS\n`;
    texto += `${'─'.repeat(60)}\n\n`;
    texto += `Processo: ${numProc}${linhaAssoc}\n`;
    texto += `Candidato(a): ${requerente}\n`;
    texto += `CPF: ${cpf}\n`;
    if (cargo) texto += `Cargo pretendido: ${cargo}\n`;
    texto += `Escopo da auditoria: ${_modoLabel}\n`;
    if (_servidor) texto += `Servidor responsável: ${_servidor}\n`;
    texto += `Data da auditoria: ${_dataAud}\n`;
    texto += `\nCertifico, para os fins do art. 11 da Lei nº 9.504/1997, que foram verificados `;
    texto += `os seguintes documentos no presente feito em ${hoje}:\n\n`;

    const fmtDocObs = r => {
        // _avisoNome    = detalhe da verificação (nome não encontrado; tipo nomenclatura)
        // _avisoConteudo = detalhe do conteúdo (CPF / doc. ident. ausentes)
        // _obsHumana    = label do dropdown ou texto digitado pelo usuário
        // Combina avisos automáticos; se obs manual for longa (> 60 chars), usa só ela
        const partsAuto = [r._avisoNome, r._avisoConteudo, r._notaQualif].filter(Boolean).join('; ');
        const obsManual = r._obsHumana || '';
        const obs = (obsManual && obsManual.length > 60)
            ? obsManual
            : (partsAuto || obsManual);
        return fmtDoc(r) + (obs ? ` — ${obs}` : '');
    };

    if (presentes.length > 0) {
        texto += `DOCUMENTOS APRESENTADOS (${presentes.length}):\n`;
        texto += presentes.map(fmtDoc).join('\n') + '\n\n';
    }

    if (ressalvas.length > 0) {
        texto += `DOCUMENTOS APRESENTADOS COM RESSALVAS (${ressalvas.length}):\n`;
        texto += ressalvas.map(fmtDocObs).join('\n') + '\n\n';
    }

    if (todosAusentes.length > 0) {
        texto += `DOCUMENTOS NÃO APRESENTADOS (${todosAusentes.length}):\n`;
        texto += todosAusentes.map(fmtDoc).join('\n') + '\n\n';
    }

    if (pendentes.length > 0) {
        texto += `DOCUMENTOS COM PENDÊNCIA / VERIFICAÇÃO NECESSÁRIA (${pendentes.length}):\n`;
        texto += pendentes.map(fmtDocObs).join('\n') + '\n\n';
    }

    const totalApresentados = presentes.length + ressalvas.length;
    texto += `${'─'.repeat(60)}\n`;
    texto += `Total de documentos na árvore: ${resultados.length}\n`;
    texto += `Apresentados: ${totalApresentados} (${presentes.length} sem ressalvas, ${ressalvas.length} com ressalvas)`;
    texto += `  |  Não apresentados: ${todosAusentes.length}  |  Pendentes: ${pendentes.length}\n`;

    // ── Cadastro eleitoral — divergências ─────────────────────────────────────
    {
        const _selDiv = _S._divergenciasSelecao;
        if (_selDiv === 'sem') {
            texto += `\n${'─'.repeat(60)}\n`;
            texto += `CADASTRO ELEITORAL — INEXISTÊNCIA DE DIVERGÊNCIAS\n`;
            texto += `Certidão de Inexistência de Divergências do Cadastro juntada aos autos.\n`;
            texto += `Resultado: SEM DIVERGÊNCIA — cadastro eleitoral regular.\n`;
        } else if (_selDiv === 'com') {
            texto += `\n${'─'.repeat(60)}\n`;
            texto += `CADASTRO ELEITORAL — DIVERGÊNCIA IDENTIFICADA\n`;
            texto += `Certidão de Inexistência de Divergências do Cadastro juntada aos autos.\n`;
            texto += `Resultado: COM DIVERGÊNCIA — regularização necessária antes do deferimento.\n`;
        }
    }

    // ── Análise prévia: Distribuição × Objeto e Pé ───────────────────────────
    const _tabelaDistr = gerarTabelaDistribuicaoObjetoPe(resultados);
    if (_tabelaDistr && _tabelaDistr.total > 0) {
        const _ovrsDistr = _S._diligenciaOverrides || {};
        const _necFn = (num, nec) => _ovrsDistr[num] || nec || 'SIM (Situação não identificada)';
        const _nSimDistr = _tabelaDistr.grupos.reduce((acc, g) =>
            acc + g.rows.filter(r => _necFn(r.numero, r.necessidade).startsWith('SIM')).length
                + (g.naoQualificados || []).filter(p => _necFn(p.numero, p.necessidade).startsWith('SIM')).length, 0);
        const _nNaoDistr = _tabelaDistr.grupos.reduce((acc, g) =>
            acc + g.rows.filter(r => _necFn(r.numero, r.necessidade) === 'NÃO').length
                + (g.naoQualificados || []).filter(p => _necFn(p.numero, p.necessidade) === 'NÃO').length, 0);

        // Helper: pad/trunca para largura fixa (fonte monoespaçada no <pre>)
        const _p = (s, n) => { const t = String(s ?? ''); return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length); };

        // Larguras das colunas (situação fora da linha principal — sem truncamento)
        const W = { pos: 4, cnj: 27, classe: 33, op: 18 };
        const _larguraTotal = W.pos + 1 + W.cnj + 1 + W.classe + 1 + W.op + 1 + 32;
        const _linha = '─'.repeat(_larguraTotal);
        const _hdr   = _p('#',         W.pos)    + ' ' +
                       _p('Nº CNJ',    W.cnj)    + ' ' +
                       _p('Classe',    W.classe) + ' ' +
                       _p('Obj. e Pé', W.op)     + ' ' +
                       'Diligência';
        const _indent = ' '.repeat(W.pos + 1);

        texto += `\n${'─'.repeat(60)}\n`;
        texto += `ANÁLISE PRÉVIA — CERTIDÕES POSITIVAS (DISTRIBUIÇÃO × OBJETO E PÉ)\n`;
        texto += `${_tabelaDistr.total} processo(s) — ${_nSimDistr} com diligência pendente · ${_nNaoDistr} sem diligência\n`;

        for (const grupo of _tabelaDistr.grupos) {
            texto += `\n${grupo.label} (${grupo.rows.length}):\n`;
            texto += _hdr + '\n' + _linha + '\n';

            for (const r of grupo.rows) {
                const _necCert = (_S._diligenciaOverrides || {})[r.numero] || r.necessidade;
                // Linha principal: #, CNJ, Classe, Obj. e Pé, Diligência
                texto += _p(r.posicao,     W.pos)    + ' ' +
                         _p(r.numero,      W.cnj)    + ' ' +
                         _p(r.classeDistr, W.classe) + ' ' +
                         _p(r.idObjetoPe,  W.op)     + ' ' +
                         _necCert + '\n';
                // Situação: linha de continuação (sem truncamento)
                const sit = (r.situacao && r.situacao !== '—' && r.situacao !== '-') ? r.situacao : '';
                if (sit) texto += _indent + 'Situação: ' + sit + '\n';
                // Processo principal (apensados)
                if (r.idOpPrincipal && r.idOpPrincipal !== '-') {
                    const sitPrinc = (r.situacaoPrinc && r.situacaoPrinc !== '-') ? ` — ${r.situacaoPrinc}` : '';
                    texto += _indent + '↳ Principal: ' + r.idOpPrincipal + sitPrinc + '\n';
                }
            }
            texto += _linha + '\n';

            // Não qualificados por grupo
            if (grupo.naoQualificados && grupo.naoQualificados.length > 0) {
                const _linhaNQ = '─'.repeat(W.cnj + 1 + W.classe + 1 + W.op + 1 + 32);
                const _hdrNQ   = _p('Nº CNJ', W.cnj) + ' ' + _p('Classe', W.classe) + ' ' + _p('Obj. e Pé', W.op) + ' ' + 'Diligência';
                texto += `\n  NÃO QUALIFICADOS — verificar homonímia (${grupo.naoQualificados.length}):\n`;
                texto += _hdrNQ + '\n' + _linhaNQ + '\n';
                for (const p of grupo.naoQualificados) {
                    const _necNQ = (_S._diligenciaOverrides || {})[p.numero] || p.necessidade || 'SIM (Situação não identificada)';
                    texto += _p(p.numero, W.cnj) + ' ' + _p(p.classe || '—', W.classe) + ' ' + _p(p.idObjetoPe || 'Não localizada', W.op) + ' ' + _necNQ + '\n';
                    if (p.situacao && p.situacao !== '—' && p.situacao !== '-') texto += _indent + 'Situação: ' + p.situacao + '\n';
                }
                texto += _linhaNQ + '\n';
            }
        }
        texto += '\n';
    }

    //texto += `\nLocal e data: ______________________, ${hoje}\n`;
    //texto += `\nServidor responsável: ______________________________\n`;
    //texto += `Matrícula: ____________  Cargo: ____________________`;

    return texto;
}

// _gerarTSVGestao — fonte única do TSV do Relatório de Gestão (para Sheets e clipboard).
// Comportamento canônico = versão salva no dashboard: conta sem_conteudo/erro como
// pendentes e usa os rótulos detalhados. cab = { data, servidor, processo, candidato, cargo }.
function _gerarTSVGestao(resultados, cab) {
    // Mapa de status originais (antes de qualquer override) para filtros de diligência
    const _statusOriginalMap = new Map(resultados.map(r => [r.id, r.status]));
    const _resOv = _resultadosComOverrides(resultados);
    const _ress = _resOv.filter(r => (r.status?.startsWith('corresponde_') && !r.status?.startsWith('corresponde_nao_adequada')) || r.status === 'nomenclatura_errada_incompleto' || r.status === 'nomenclatura_errada_ilegivel');
    const _ok   = _resOv.filter(r => r.status === 'corresponde' || r.status === 'presente' || r.status === 'nomenclatura_errada');
    const _pend = _resOv.filter(r => ['nao_corresponde','nao_corresponde_nome','nao_corresponde_incompleto','nao_corresponde_ilegivel','nao_corresponde_incompleto_ilegivel','pdf_sem_texto','inconclusivo','nao_apresentado','sem_conteudo','erro','corresponde_nao_adequada','corresponde_nao_adequada_incompleto','corresponde_nao_adequada_ilegivel','corresponde_nao_adequada_incompleto_ilegivel'].includes(r.status));
    const _tabG = gerarTabelaDistribuicaoObjetoPe(_resOv);
    const _motivoLabel = {
        'nao_apresentado':                     'Não apresentado',
        'nao_corresponde':                     'Não corresponde',
        'nao_corresponde_nome':                'Não corresponde (nome/CPF)',
        'nao_corresponde_incompleto':          'Não corresponde — incompleto',
        'nao_corresponde_ilegivel':            'Não corresponde — ilegível',
        'nao_corresponde_incompleto_ilegivel': 'Não corresponde — incompleto e ilegível',
        'pdf_sem_texto':                       'PDF sem texto',
        'inconclusivo':                        'Inconclusivo',
        'sem_conteudo':                        'Sem conteúdo — verificar documento',
        'erro':                                'Erro no download — reverificar',
        'corresponde_incompleto':              'Juntado — incompleto',
        'corresponde_ilegivel':                'Juntado — ilegível',
        'corresponde_incompleto_ilegivel':     'Juntado — incompleto e ilegível',
        'nomenclatura_errada_incompleto':      'Nomenclatura errada — incompleto',
        'nomenclatura_errada_ilegivel':        'Nomenclatura errada — ilegível',
        'corresponde_nao_adequada':                     'Execução Criminal — apresentar Certidão de Distribuição de Ações Criminais (TJSP)',
        'corresponde_nao_adequada_incompleto':          'Execução Criminal — apresentar Certidão de Distribuição de Ações Criminais (TJSP) — incompleto',
        'corresponde_nao_adequada_ilegivel':            'Execução Criminal — apresentar Certidão de Distribuição de Ações Criminais (TJSP) — ilegível',
        'corresponde_nao_adequada_incompleto_ilegivel': 'Execução Criminal — apresentar Certidão de Distribuição de Ações Criminais (TJSP) — incompleto/ilegível',
    };
    const _dilig = [];
    // 1. Documentos pendentes — "Pessoa errada" nunca gera diligência.
    const _isPessoaErrada = (r) =>
        r.status === 'nao_corresponde_nome' ||
        r._statusOCR === 'nao_corresponde_nome' ||
        r._verificacao === 'pessoa_errada' ||
        _statusOriginalMap.get(r.id) === 'nao_corresponde_nome';
    for (const r of _pend)
        if (!_isPessoaErrada(r))
            _dilig.push(`${r.nome} — ${_motivoLabel[r.status] || r.status}`);
    // 2. Documentos com ressalvas (exceto objeto_pe — avaliados via tabela de distribuição)
    for (const r of _ress)
        if (r._tipoDoc !== 'objeto_pe')
            _dilig.push(`${r.nome} — ${_motivoLabel[r.status] || r.status}`);
    // 3. Processos criminais com diligência necessária (qualificados e não qualificados)
    if (_tabG?.grupos)
        for (const g of _tabG.grupos) {
            for (const r of g.rows) {
                const nec = (_S._diligenciaOverrides || {})[r.numero] || r.necessidade;
                if (nec.startsWith('SIM')) _dilig.push(`${r.numero} — ${nec}`);
            }
            for (const p of (g.naoQualificados || [])) {
                const nec = (_S._diligenciaOverrides || {})[p.numero] || p.necessidade || 'SIM (Situação não identificada)';
                if (nec.startsWith('SIM')) _dilig.push(`${p.numero} — ${nec} (não qualificado)`);
            }
        }
    // 4. Divergência do cadastro eleitoral identificada
    if (_S._divergenciasSelecao === 'com')
        _dilig.push('Certidão de Inexistência de Divergências — COM DIVERGÊNCIA — regularização necessária');
    // 5. Obrigatorios do art. 27 ausentes da arvore (nem juntados) -> diligencia.
    //    Espelha o calculo de ausentesForaArvore da certidao preliminar: os
    //    requisitos que se aplicam e nao tem resultado na arvore (itens em
    //    vermelho de "Requisitos sem documento na arvore"). Nao altera
    //    Docs total/OK/Pendentes — entra so como diligencia (decisao do servidor).
    const _tipoAudG = _S._auditoriaTipo || 'completa';
    if (_tipoAudG === 'completa' || _tipoAudG === 'principal') {
        for (const _itC of _ITENS_CAND) {
            if (['convencao', 'divergencias'].includes(_itC.id)) continue;
            if (_itC.id === 'desincompat' || _itC.id === 'prerrogativa') {
                if (((_S._candSeletoresPD || {})[_itC.id]) === 'nao_aplica') continue;
                if (/^n[ãa]o\s+se\s+aplica/i.test((_S._candTextos || {})[_itC.id] || '')) continue;
            }
            if (_itC.id === 'desincompat' && !_candidatoNecessitaDesincompat()) continue;
            if (((_S._candSeletoresPD || {})[_itC.id]) === 'nao_aplica') continue;
            if (_encontrarResultadoCAND(_itC, resultados) !== null) continue;
            var _nomeItemG = _itC.titulo.replace(/^\d+[a-z]?\.\s*/, '');
            _dilig.push(_nomeItemG + ' — documento obrigatório não apresentado (juntar/intimar)');
        }
    }
    const _pendDet = _pend.map(r => r.nome || r.id).join(' | ');
    // Total auditável: exclui atos processuais/manifestações (status dispensado ou tipo outros)
    const _totalAuditavel = _resOv.filter(r => r.status !== 'dispensado' && r.tipo !== 'outros').length;
    const cols = ['Data/Hora','Servidor','Processo','Candidato','Cargo','Docs (total)','Juntados OK','Com ressalvas','Pendentes','Pendentes (detalhe)','Diligências (qtd)','Diligências (detalhe)'];
    const vals = [cab.data, cab.servidor, cab.processo, cab.candidato, cab.cargo, _totalAuditavel, _ok.length, _ress.length, _pend.length, _pendDet, _dilig.length, _dilig.join(' | ')];
    return cols.join('\t') + '\n' + vals.join('\t');
}
