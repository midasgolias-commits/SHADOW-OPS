// Necessário para o navegador oferecer "Instalar" (ícone na área de trabalho).
// Também garante que a página e o código do jogo sempre venham na versão mais nova
// (pergunta ao servidor se mudou; se não mudou, usa o que já tem, sem baixar de novo).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (!/(\/|\.html|\.js|\.css|\.json|\.webmanifest)$/.test(u.pathname)) return;   // modelos, texturas e sons: cache normal
  e.respondWith(fetch(u.href, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(r)));
});
