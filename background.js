// background.js — Service Worker MV3 (AuditJE)
// O OCR é realizado localmente no iframe (chat.html) via pdfextract.js.
// Este service worker existe apenas para satisfazer o requisito MV3 e
// poderá ser expandido futuramente (ex: cache, sincronização com Sheets).

const extAPI = typeof chrome !== 'undefined' ? chrome : browser;

extAPI.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!request || !request.type) return false;
    // Mensagem desconhecida — ignora sem erro
    sendResponse({ ok: false, error: 'Tipo de mensagem nao suportado: ' + request.type });
    return false;
});
