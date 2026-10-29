/**
 * Botão "Ícone na área de trabalho":
 * - Chrome/Edge: instala o jogo como aplicativo (ícone próprio na área de trabalho, abre em tela cheia).
 * - Outros navegadores: baixa um atalho "SHADOW OPS.url" que abre o site do jogo.
 */
let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;

export function setupInstall(btn, say = t => alert(t)) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (standalone()) { btn.classList.add('hidden'); return; }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.textContent = 'Instalar na área de trabalho'; });
  addEventListener('appinstalled', () => { deferred = null; btn.classList.add('hidden'); say('Pronto! O ícone do SHADOW OPS está na sua área de trabalho.'); });
  btn.onclick = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome !== 'accepted') downloadShortcut(say); return; }
    downloadShortcut(say);
  };
}

export function downloadShortcut(say) {
  const base = location.href.replace(/[#?].*$/, '').replace(/index\.html$/, '');
  const txt = `[InternetShortcut]\r\nURL=${base}\r\nIconIndex=0\r\nIconFile=${base}assets/icon/shadowops.ico\r\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
  a.download = 'SHADOW OPS.url'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  say?.('Atalho baixado: arraste o arquivo "SHADOW OPS.url" da pasta Downloads para a área de trabalho.');
}
