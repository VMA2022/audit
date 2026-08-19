// atos.js — Painel de Atos Processuais
// Depende de: config.js (Shared Kernel)

// ═════════════════════════════════════════════════════════════════════════════
// ESTADO LOCAL
// ═════════════════════════════════════════════════════════════════════════════

let _atosData = [];          // array completo recebido do content.js
let _filtroAtivo = 'todos';  // 'todos' | 'movimento' | 'certidao' | 'sentenca'

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const _MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function _parsearData(str) {
    if (!str) return null;
    // Formatos: "dd/mm/yyyy hh:mm", "dd/mm/yyyy", "yyyy-mm-dd"
    let m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return { dia: m[1], mes: _MESES[parseInt(m[2],10)-1], ano: m[3] };
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { dia: m[3], mes: _MESES[parseInt(m[2],10)-1], ano: m[1] };
    return null;
}

function _classificarTipo(ato) {
    const n = (ato.nome || ato.descricao || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/sentenca|acordao|acórdão|acórdao/.test(n)) return 'sentenca';
    if (/certidao|certidão/.test(n)) return 'certidao';
    if (/peticao|petição|recurso|contrarrazoes|memoriai/.test(n)) return 'peticao';
    return 'movimento';
}

function _labelTipo(tipo) {
    const map = {
        sentenca:  '⚖ Sentença',
        certidao:  '📋 Certidão',
        peticao:   '📄 Petição',
        movimento: '🔵 Movimento',
    };
    return map[tipo] || '🔵 Movimento';
}

// ═════════════════════════════════════════════════════════════════════════════
// RENDERIZAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

function renderizarPainelAtos(atos) {
    _atosData = (atos || []).map(a => ({
        ...a,
        _tipo: _classificarTipo(a),
    }));
    _filtroAtivo = 'todos';
    _atualizarFiltroUI();
    _renderizarLista();
    _inicializarFiltros();
}

function _renderizarLista() {
    const lista = document.getElementById('atos-lista');
    const count = document.getElementById('atos-count');
    if (!lista) return;

    const filtrados = _filtroAtivo === 'todos'
        ? _atosData
        : _atosData.filter(a => a._tipo === _filtroAtivo);

    if (count) count.textContent = `${filtrados.length} ato${filtrados.length !== 1 ? 's' : ''}`;

    if (filtrados.length === 0) {
        lista.innerHTML = `
        <div id="atos-empty">
          <div class="icon">📜</div>
          <p>${_atosData.length === 0
            ? 'Abra um processo no PJe para visualizar os atos processuais.'
            : 'Nenhum ato encontrado para o filtro selecionado.'
          }</p>
        </div>`;
        return;
    }

    lista.innerHTML = filtrados.map(ato => {
        const d = _parsearData(ato.data || ato.dataMovimento || '');
        const tipo = ato._tipo;
        const descricao = ato.nome || ato.descricao || ato.movimento || '—';
        const destaqueClass = tipo === 'certidao' ? 'destaque-certidao'
                            : tipo === 'sentenca'  ? 'destaque-sentenca'
                            : '';
        return `
        <div class="ato-item ${destaqueClass}">
          <div class="ato-data">
            ${d ? `
              <span class="ato-data-dia">${d.dia}</span>
              <span class="ato-data-mes">${d.mes}</span>
              <span class="ato-data-ano">${d.ano}</span>
            ` : `<span class="ato-data-mes" style="font-size:var(--fs-xs);margin-top:2px;">—</span>`}
          </div>
          <div class="ato-corpo">
            <div class="ato-tipo-badge tipo-${tipo}">${_labelTipo(tipo)}</div>
            <div class="ato-descricao ${descricao === '—' ? 'vazio' : ''}">${_esc(descricao)}</div>
          </div>
        </div>`;
    }).join('');
}

function _atualizarFiltroUI() {
    document.querySelectorAll('#atos-toolbar .atos-filtro').forEach(btn => {
        btn.classList.toggle('ativo', btn.dataset.filtro === _filtroAtivo);
    });
}

function _inicializarFiltros() {
    document.querySelectorAll('#atos-toolbar .atos-filtro').forEach(btn => {
        // Remove listener anterior para evitar duplicatas
        btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('#atos-toolbar .atos-filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            _filtroAtivo = btn.dataset.filtro;
            _atualizarFiltroUI();
            _renderizarLista();
        });
    });
}

// _esc agora é definido uma única vez em config.js (Shared Kernel) — auditoria: M1.
