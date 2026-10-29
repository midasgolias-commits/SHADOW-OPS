// Necessário para o navegador oferecer "Instalar" (ícone na área de trabalho).
// Não guarda nada em cache: sempre baixa a versão mais nova do site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
