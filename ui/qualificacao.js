// ── Qualificação: batimento de identidade (nome/CPF/RG/filiação) ──────────────
// Feature aditiva (HANDOFF_QUALIFICACAO). NÃO altera o motor nem os status
// gravados. Cruza os dados de identificação de CADA documento contra a
// referência (PJe polo ativo + petição): extrai o valor real quando existe no
// texto e compara. "Não bate" apenas sinaliza — a decisão é do servidor.
// Reaproveita verifica*NaCertidao() e _extrairDocIdentificacao() do motor.

function _qlEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _qlDig(s) { return String(s || '').replace(/[^0-9]/g, ''); }
function _qlExtrairCPF(texto) {
    if (!texto) return '';
    var m = String(texto).match(/[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}/);
    if (!m) return '';
    var d = m[0].replace(/[^0-9]/g, '');
    if (d.length !== 11) return '';
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}

function _qlLimpaNome(v) {
    return String(v || '').replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim();
}
// Extrai o NOME de mae/pai que consta no documento (certidao eproc/SEEU e RRC trazem
// "Nome da mae:" / "Nome do pai:"). Trabalha no texto ORIGINAL (preserva acentos e a
// caixa do nome); tolera "mae"/"mãe". Sem match -> string vazia (cai no consta/falta).
function _qlExtrairFiliacao(texto) {
    var out = { mae: '', pai: '' };
    if (!texto) return out;
    var s = String(texto);
    var mMae = s.match(/nome\s+da\s+m[ãa]e\s*:?\s*([A-Za-zÀ-ÿ][^\n]{1,58}?)(?=\s*(?:nome\s+do\s+pai|filia|data\s+de\s+nasc|nacionalidade|estado\s+civil|sexo|\bcpf\b|\brg\b|identidade|[oó]rg[ãa]o|pa[ií]s|munic|endere|natural|\n|$))/i);
    var mPai = s.match(/nome\s+do\s+pai\s*:?\s*([A-Za-zÀ-ÿ][^\n]{1,58}?)(?=\s*(?:nome\s+da\s+m[ãa]e|filia|data\s+de\s+nasc|nacionalidade|estado\s+civil|sexo|\bcpf\b|\brg\b|identidade|[oó]rg[ãa]o|pa[ií]s|munic|endere|natural|\n|$))/i);
    if (mMae) out.mae = _qlLimpaNome(mMae[1]);
    if (mPai) out.pai = _qlLimpaNome(mPai[1]);
    // Formato 2o grau (Orgao Especial / Segunda Instancia): "filho(a) de PAI e MAE"
    // (nao ha rotulos "Nome da mae/pai"). Convencao PAI primeiro, MAE depois -- separa
    // pela ULTIMA " e " (tolera sobrenome do pai com "e", ex.: "Costa e Silva").
    if (!out.mae && !out.pai) {
        var mFil = s.match(/\bfilh[oa]\s+de\s+([A-Za-zÀ-ÿ][^\n]*?)(?=\s*,|\s+portador|\s+cpf|\s+rg\b|\s*\.|\n|$)/i);
        if (mFil) {
            var full = _qlLimpaNome(mFil[1]);
            var idxE = full.toLowerCase().lastIndexOf(' e ');
            if (idxE > 0) {
                out.pai = _qlLimpaNome(full.slice(0, idxE));
                out.mae = _qlLimpaNome(full.slice(idxE + 3));
            }
        }
    }
    return out;
}

function _garantirCssQualif() {
    if (document.getElementById('qualif-css')) return;
    var st = document.createElement('style');
    st.id = 'qualif-css';
    st.textContent = [
        '#painel-qualificacao{padding:12px;overflow:auto}',
        '.ql-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}',
        '.ql-tt{font-size:13.5px;font-weight:700;color:var(--text)}',
        '.ql-ts{font-size:11px;color:var(--text-muted);margin-top:2px;max-width:680px;line-height:1.4}',
        '.ql-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--text-muted);align-items:center;margin-left:auto}',
        '.ql-leg span{display:inline-flex;align-items:center;gap:5px}',
        '.ql-leg i{width:9px;height:9px;border-radius:3px;display:inline-block}',
        '.ql-tblwrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px}',
        '.ql-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:840px}',
        '.ql-tbl th{position:sticky;top:0;background:var(--surface2);color:var(--text-muted);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.03em;text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap}',
        '.ql-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}',
        '.ql-org .nm{font-weight:600;color:var(--text);font-size:12px}',
        '.ql-org .id{font-family:monospace;font-size:9.5px;color:var(--text-muted);margin-top:1px}',
        '.ql-refrow{background:var(--accent-dim)}',
        '.ql-refrow .rtag{display:inline-block;font-size:9px;font-weight:700;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:1px 5px;margin-top:3px}',
        '.ql-rlab{font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px}',
        '.ql-rlab.man{color:#fcd34d}',
        '.ql-refv{font-weight:700;color:var(--text);font-size:12px}',
        '.ql-st{display:inline-flex;align-items:center;gap:6px}',
        '.ql-dot{width:8px;height:8px;border-radius:50%;flex:none}',
        '.ql-ok{color:#6ee7b7} .ql-ok .ql-dot{background:#34d399}',
        '.ql-pd{color:#fca5a5} .ql-pd .ql-dot{background:#f87171}',
        '.ql-y{color:#fcd34d} .ql-y .ql-dot{background:#fbbf24}',
        '.ql-mut{color:var(--text-muted)}',
        '.ql-mono{font-family:monospace}',
        '.ql-empty{color:var(--text-muted);font-size:12px;text-align:center;padding:28px}'
    ].join('');
    document.head.appendChild(st);
}

function _qualifDocIdentRef() {
    var card = document.getElementById('processo-info-card');
    var el = card && card.querySelector('[data-info="docIdent"] .card-val');
    return (el && el.textContent) ? el.textContent.trim() : '';
}
function _qualifTipoRelevante(r) {
    var t = (String(r._tipoDoc || '') + ' ' + String(r._tipoIdentificado || '')).toLowerCase();
    return /federal|estadual|militar|objeto_pe|objeto e p|breve relat|exec_criminal|rrc|peticao|eproc|criminal/.test(t);
}
function _qualifIncluir(r, refCpf) {
    if (_qualifTipoRelevante(r)) return true;
    var texto = r._textoExtraido || '';
    return !!(texto && refCpf && typeof verificaCPFNaCertidao === 'function' && verificaCPFNaCertidao(refCpf, texto).encontrado);
}
function _qualifEhRRC(r) {
    var t = String(r._tipoIdentificado || r._tipoDoc || '').toLowerCase();
    if (/rrc|peticao/.test(t)) return true;
    return /rrc|petiç|requerimento de registro/i.test(r.nome || '');
}
function _qualifCel(status, valor, mono) {
    if (status === 'mut') return '<td class="ql-mut">—</td>';
    var cls = status === 'ok' ? 'ql-ok' : (status === 'pd' ? 'ql-pd' : 'ql-y');
    var txt = valor || (status === 'ok' ? 'confere' : (status === 'pd' ? 'não bate' : 'não localizado'));
    return '<td' + (mono ? ' class="ql-mono"' : '') + '><span class="ql-st ' + cls + '"><span class="ql-dot"></span>' + _qlEsc(txt) + '</span></td>';
}

// Batimento por documento: extrai o valor real quando há texto; senão cai nos
// sinais que o motor já gravou (_verificacao/_avisoConteudo), que sobrevivem à
// recuperação do Sheets.
function _qualifBatimentoDoc(r, refNome, refCpf, refRg) {
    var texto = r._textoExtraido || '';
    var temTexto = !!texto;
    var ehRRC = _qualifEhRRC(r);
    var out = { nome: { st: 'y', val: '' }, cpf: { st: 'y', val: '' }, rg: { st: 'mut', val: '' }, mae: { st: 'mut', val: '' }, pai: { st: 'mut', val: '' } };

    // NOME (presença do nome de referência)
    if (ehRRC) { out.nome = { st: 'ok', val: refNome }; }
    else if (temTexto && typeof verificaNomeNoCertidao === 'function') {
        out.nome = verificaNomeNoCertidao(refNome, texto).encontrado
            ? { st: 'ok', val: refNome }
            : { st: 'pd', val: 'não bate — conferir (homônimo?)' };
    } else {
        out.nome = (r._verificacao === 'pessoa_errada')
            ? { st: 'pd', val: 'não bate — conferir (homônimo?)' }
            : { st: 'ok', val: refNome };
    }

    // CPF (valor real extraído; compara com a referência)
    var cpfDoc = _qlExtrairCPF(texto);
    if (ehRRC) { out.cpf = { st: 'ok', val: refCpf }; }
    else if (temTexto && typeof verificaCPFNaCertidao === 'function' && verificaCPFNaCertidao(refCpf, texto).encontrado) {
        out.cpf = { st: 'ok', val: refCpf };
    } else if (cpfDoc) {
        out.cpf = (_qlDig(cpfDoc) === _qlDig(refCpf)) ? { st: 'ok', val: cpfDoc } : { st: 'pd', val: cpfDoc + ' (difere)' };
    } else if (!temTexto) {
        out.cpf = (/cpf/i.test(String(r._avisoConteudo || ''))) ? { st: 'y', val: 'não localizado' } : { st: 'ok', val: refCpf };
    } else {
        out.cpf = { st: 'y', val: 'não localizado' };
    }

    // RG (valor real; só nos documentos onde costuma constar)
    var rgDoc = (temTexto && typeof _extrairDocIdentificacao === 'function') ? (_extrairDocIdentificacao(texto) || '') : '';
    if (!rgDoc && r._rgExtraido) rgDoc = r._rgExtraido; // persistido (sobrevive ao reload do Sheets)
    if (rgDoc) {
        out.rg = (refRg && _qlDig(rgDoc) && _qlDig(rgDoc) === _qlDig(refRg)) ? { st: 'ok', val: rgDoc }
               : (refRg ? { st: 'pd', val: rgDoc + ' (difere)' } : { st: 'ok', val: rgDoc });
    } else if (temTexto && refRg && typeof verificaDocIdentNaCertidao === 'function' && verificaDocIdentNaCertidao(refRg, texto).encontrado) {
        out.rg = { st: 'ok', val: refRg };
    } else {
        out.rg = { st: 'mut', val: '' };
    }
    // Filiacao (mae/pai): exibe o NOME extraido -- do texto da rodada OU do valor
    // persistido no Sheets (_maeExtraida/_paiExtraida); senao indica consta/falta.
    var _filMae = '', _filPai = '';
    if (temTexto && typeof _qlExtrairFiliacao === 'function') {
        var _fil = _qlExtrairFiliacao(texto);
        _filMae = _fil.mae; _filPai = _fil.pai;
    }
    if (!_filMae && r._maeExtraida) _filMae = r._maeExtraida;
    if (!_filPai && r._paiExtraida) _filPai = r._paiExtraida;
    if (temTexto) {
        var _tf = (typeof _norm === 'function') ? _norm(texto) : String(texto).toLowerCase();
        var _tmae = _tf.indexOf('nome da mae') >= 0 || _tf.indexOf('genitora') >= 0 || _tf.indexOf('filiacao') >= 0 || _tf.indexOf('filho de') >= 0 || _tf.indexOf('filha de') >= 0;
        var _tpai = _tf.indexOf('nome do pai') >= 0 || _tf.indexOf('filiacao') >= 0 || _tf.indexOf('filho de') >= 0 || _tf.indexOf('filha de') >= 0;
        out.mae = _filMae ? { st: 'ok', val: _filMae } : (_tmae ? { st: 'ok', val: 'consta' } : { st: 'y', val: 'não localizado' });
        out.pai = _filPai ? { st: 'ok', val: _filPai } : (_tpai ? { st: 'ok', val: 'consta' } : { st: 'y', val: 'não localizado' });
    } else {
        out.mae = _filMae ? { st: 'ok', val: _filMae } : { st: 'mut', val: '' };
        out.pai = _filPai ? { st: 'ok', val: _filPai } : { st: 'mut', val: '' };
    }
    return out;
}

function renderizarQualificacao() {
    var painel = document.getElementById('painel-qualificacao');
    if (!painel) return;
    _garantirCssQualif();
    var res = (typeof _S !== 'undefined' && _S._auditoriaResultados) || [];
    if (!res.length) {
        painel.innerHTML = '<div class="ql-empty">A Qualificação é preenchida ao final da auditoria — ela cruza os dados de identificação (nome/CPF/RG/filiação) dos documentos contra a referência.</div>';
        return;
    }
    var refNome = (typeof _S !== 'undefined' && _S._auditoriaRequerente) || '';
    var refCpf  = (typeof _S !== 'undefined' && _S._auditoriaCPF) || '';
    var refRg   = _qualifDocIdentRef();
    var origens = [];
    for (var i = 0; i < res.length; i++) {
        if (res[i] && _qualifIncluir(res[i], refCpf)) origens.push(res[i]);
    }
    var legenda = '<div class="ql-leg">'
        + '<span><i style="background:#34d399"></i> bate</span>'
        + '<span><i style="background:#f87171"></i> não bate → diligência</span>'
        + '<span><i style="background:#fbbf24"></i> não localizado</span>'
        + '</div>';
    var thead = '<tr><th>Origem do dado extraído</th><th>Nome extraído</th><th>CPF extraído</th><th>RG extraído</th><th>Nome da mãe</th><th>Nome do pai</th></tr>';
    var refRow = '<tr class="ql-refrow">'
        + '<td class="ql-org"><div class="nm">⭐ Referência do candidato</div><span class="rtag">PJe (POLO ATIVO) + PETIÇÃO</span></td>'
        + '<td><div class="ql-rlab">do PJe</div><span class="ql-refv">' + _qlEsc(refNome || '—') + '</span></td>'
        + '<td><div class="ql-rlab">do PJe</div><span class="ql-refv ql-mono">' + _qlEsc(refCpf || '—') + '</span></td>'
        + '<td><div class="ql-rlab">da petição</div><span class="ql-refv ql-mono">' + _qlEsc(refRg || '—') + '</span></td>'
        + '<td><div class="ql-rlab man">você informa</div><span class="ql-mut">a preencher</span></td>'
        + '<td><div class="ql-rlab man">você informa</div><span class="ql-mut">a preencher</span></td>'
        + '</tr>';
    var rows = '';
    for (var j = 0; j < origens.length; j++) {
        var r = origens[j];
        var b = _qualifBatimentoDoc(r, refNome, refCpf, refRg);
        var label = r._tipoIdentificado || r._tipoDoc || 'Documento';
        rows += '<tr>'
            + '<td class="ql-org"><div class="nm">' + _qlEsc(r.nome || label) + '</div><div class="id">ID ' + _qlEsc(String(r.id || '')) + ' · ' + _qlEsc(String(label)) + '</div></td>'
            + _qualifCel(b.nome.st, b.nome.val, false)
            + _qualifCel(b.cpf.st, b.cpf.val, true)
            + _qualifCel(b.rg.st, b.rg.val, true)
            + _qualifCel(b.mae.st, b.mae.val, false)
            + _qualifCel(b.pai.st, b.pai.val, false)
            + '</tr>';
    }
    if (!origens.length) rows = '<tr><td colspan="6" class="ql-empty">Nenhuma certidão/RRC identificada nesta rodada.</td></tr>';
    painel.innerHTML =
        '<div class="ql-head"><div><div class="ql-tt">Qualificação — batimento de identidade</div>'
        + '<div class="ql-ts">Extrai o nome/CPF/RG de cada documento (quando existem no texto) e cruza com a referência (PJe + petição), para vincular a pessoa à certidão. "Não bate" só sinaliza — a diligência é decisão do servidor. <b>Filiação (mãe/pai) por documento: consta/falta — o valor de referência é manual.</b></div></div>'
        + legenda + '</div>'
        + '<div class="ql-tblwrap"><table class="ql-tbl"><thead>' + thead + '</thead><tbody>'
        + refRow + rows
        + '</tbody></table></div>';
}
