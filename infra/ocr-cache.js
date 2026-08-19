// ocr-cache.js — Cache de OCR: hash do documento (SHA-256) -> texto extraido.
// Objetivo: nao reprocessar PDF.js/Tesseract para o mesmo documento em reauditorias
// ou ao reabrir o painel. Persistente entre sessoes via IndexedDB (o texto e pequeno,
// mas muitos processos somam; ha teto com descarte LRU). Todas as operacoes degradam
// em silencio (retornam null / no-op) para nunca quebrar a extracao.
//
// Carregado em chat.html ANTES de infra/pdfextract.js, que consome ocrCacheHash/Get/Set.
(function () {
    'use strict';
    const DB_NAME = 'auditje-ocr-cache';
    const STORE = 'textos';
    const MAX_ENTRIES = 500;          // teto de documentos guardados (descarte LRU por acesso)
    // Versao do OCR: BUMPE este numero quando a logica ou os parametros de extracao
    // mudarem (OCR_ESCALA, PAGINAS_MAX, TEXTO_LIMITE, algoritmo...). Entra na chave do
    // cache, entao documentos ja vistos viram 'miss' e sao reprocessados; os registros
    // de versoes antigas sao podados na abertura do banco.
    const OCR_CACHE_VERSION = 2;   // v2: remonta formulários RRC/RRCI/Complemento por coordenadas (invalida cache antigo)

    let _dbPromise = null;

    function _abrirDB() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open(DB_NAME, 1); }
            catch (e) { reject(e); return; }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: 'hash' });
                    os.createIndex('ts', 'ts');
                }
            };
            req.onsuccess = () => { resolve(req.result); _limparVersoesAntigas(req.result); };
            req.onerror = () => reject(req.error);
        });
        return _dbPromise;
    }

    // Remove registros de versoes de OCR anteriores (chaves que nao comecam com a versao atual).
    let _versoesPodadas = false;
    function _limparVersoesAntigas(db) {
        if (_versoesPodadas) return;
        _versoesPodadas = true;
        try {
            const prefixo = 'v' + OCR_CACHE_VERSION + ':';
            const os = db.transaction(STORE, 'readwrite').objectStore(STORE);
            os.openCursor().onsuccess = (ev) => {
                const cur = ev.target.result;
                if (!cur) return;
                if (typeof cur.key !== 'string' || cur.key.indexOf(prefixo) !== 0) {
                    try { cur.delete(); } catch (_) { /* noop */ }
                }
                cur.continue();
            };
        } catch (_) { /* noop */ }
    }

    // SHA-256 (hex) do conteudo do documento, a partir do base64.
    async function ocrCacheHash(base64) {
        try {
            if (!base64 || typeof crypto === 'undefined' || !crypto.subtle) return null;
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const buf = await crypto.subtle.digest('SHA-256', bytes);
            const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            return 'v' + OCR_CACHE_VERSION + ':' + hex;   // chave versionada (invalida ao trocar a versao)
        } catch (e) {
            return null;
        }
    }

    // Le o texto guardado para um hash (e atualiza o timestamp de acesso — LRU).
    async function ocrCacheGet(hash) {
        if (!hash) return null;
        try {
            const db = await _abrirDB();
            return await new Promise((resolve) => {
                const tx = db.transaction(STORE, 'readwrite');
                const os = tx.objectStore(STORE);
                const req = os.get(hash);
                req.onsuccess = () => {
                    const rec = req.result;
                    if (rec && typeof rec.texto === 'string') {
                        rec.ts = Date.now();
                        try { os.put(rec); } catch (_) { /* noop */ }
                        resolve(rec.texto);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    // Guarda o texto extraido para um hash e faz a poda se passar do teto.
    async function ocrCacheSet(hash, texto) {
        if (!hash || texto == null) return;
        try {
            const db = await _abrirDB();
            await new Promise((resolve) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put({ hash, texto, ts: Date.now() });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            });
            _podarSeNecessario(db);
        } catch (e) {
            /* noop */
        }
    }

    // Remove os registros mais antigos (LRU pelo indice 'ts') se passar de MAX_ENTRIES.
    function _podarSeNecessario(db) {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            const os = tx.objectStore(STORE);
            const cnt = os.count();
            cnt.onsuccess = () => {
                let excedente = cnt.result - MAX_ENTRIES;
                if (excedente <= 0) return;
                os.index('ts').openCursor().onsuccess = (ev) => {
                    const cur = ev.target.result;
                    if (cur && excedente > 0) { try { cur.delete(); } catch (_) {} excedente--; cur.continue(); }
                };
            };
        } catch (e) {
            /* noop */
        }
    }

    // Exposto como global (mesmo padrao dos demais modulos do iframe).
    window.ocrCacheHash = ocrCacheHash;
    window.ocrCacheGet = ocrCacheGet;
    window.ocrCacheSet = ocrCacheSet;

    console.log('[ocr-cache] pronto (IndexedDB: ' + DB_NAME + ')');
})();
