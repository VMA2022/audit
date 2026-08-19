// popup.js — popup da ação (toolbar): liga/desliga FUNCIONAL da AuditJE nas
// páginas do PJe. Grava um flag em chrome.storage.local; o content.js reage
// (mostra/oculta o painel e o botão lateral) em todas as abas, ao vivo.
// Não exige a permissão "management".
const _api = typeof chrome !== 'undefined' ? chrome : browser;
const _KEY = 'auditje_enabled';

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-extensao');
  const label  = document.getElementById('estado-label');

  const setLabel = () => {
    label.textContent = toggle.checked ? 'Ativado' : 'Desativado';
  };

  // Lê o estado salvo (padrão: ativado).
  _api.storage.local.get({ [_KEY]: true }, (res) => {
    toggle.checked = res[_KEY] !== false;
    setLabel();
  });

  // Salva ao alternar; o content.js de cada aba do PJe reage via storage.onChanged.
  toggle.addEventListener('change', () => {
    setLabel();
    _api.storage.local.set({ [_KEY]: toggle.checked });
  });
});
