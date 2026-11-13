"""Servidor local do jogo SEM cache: o navegador sempre pega a versão mais nova dos arquivos.
Também grava os ajustes do Lab de Armas (POST /api/grips -> assets/config/grips.json, com cópia de segurança).
Uso (na pasta do index.html):  python tools/server.py 8000"""
import http.server, socketserver, sys, os, json, shutil, time
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
GRIPS = os.path.join('assets', 'config', 'grips.json')
PRESETS = os.path.join('assets', 'config', 'presets_claude.json')   # ajustes sugeridos pelo Claude (editáveis no Lab)
SOUND_MAP = os.path.join('assets', 'config', 'sons_destino.json')   # o que você decidiu para cada som (ferramenta de sons do Lab)
TEST_REPORT = os.path.join('tools', 'ultimo_teste.json')   # resultado do teste automático da 1ª pessoa (tools/fpcheck.js)
TARGETS = {'/api/grips': GRIPS, '/api/presets': PRESETS, '/api/sons-destino': SOUND_MAP, '/api/test-report': TEST_REPORT}
PACKS, GAME_SND = 'Sounds', os.path.join('assets', 'sounds')   # pacotes de som (só ouvir) e sons que o jogo usa
AUDIO = ('.mp3', '.wav', '.ogg', '.m4a', '.flac')
def _inside(path, root):
    a, r = os.path.realpath(path), os.path.realpath(root)
    return a == r or a.startswith(r + os.sep)

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate'); self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *a):
        if len(a) > 1 and str(a[1]) not in ('200', '304'): super().log_message(fmt, *a)   # só mostra erros (404...)
    def do_GET(self):
        if self.path.split('?')[0] == '/health':   # monitor/atalho: responde rápido sem poluir o log com 404
            return self._reply(200, {'ok': True})
        if self.path.split('?')[0] == '/api/sons':   # lista os sons dos pacotes (pasta Sounds) e os do jogo (assets/sounds)
            out = {'pacotes': [], 'jogo': []}
            for root, key in ((PACKS, 'pacotes'), (GAME_SND, 'jogo')):
                for dp, dn, fn in os.walk(root):
                    dn[:] = sorted(d for d in dn if d != '_backup')
                    for f in sorted(fn):
                        if f.lower().endswith(AUDIO): q = os.path.join(dp, f); out[key].append({'path': q.replace(os.sep, '/'), 'bytes': os.path.getsize(q)})
            return self._reply(200, out)
        if self.path.split('?')[0] == '/' + GRIPS.replace(os.sep, '/') and not os.path.exists(GRIPS):
            return self._reply(200, {'version': 1, 'chars': {}})   # nada salvo ainda no Lab de Armas
        super().do_GET()
    def _reply(self, code, msg):
        b = json.dumps(msg).encode(); self.send_response(code)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def _som(self, route):
        # aplicar: copia um som do pacote para assets/sounds/<destino>.mp3 (o anterior vai para assets/sounds/_backup)
        # desfazer: volta a cópia mais recente do _backup
        if self.client_address[0] not in ('127.0.0.1', '::1', '::ffff:127.0.0.1'): return self._reply(403, {'ok': False, 'erro': 'so do proprio PC'})
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8'))
            slot = str(data.get('slot', ''))
            if not slot or not all(c.isalnum() or c == '_' for c in slot) or len(slot) > 40: raise ValueError('destino invalido')
            dst, bk = os.path.join(GAME_SND, slot + '.mp3'), os.path.join(GAME_SND, '_backup')
            os.makedirs(bk, exist_ok=True)
            if route == '/api/som-aplicar':
                src = str(data.get('src', ''))
                if not src.lower().endswith('.mp3') or not _inside(src, PACKS) or not os.path.isfile(src): raise ValueError('arquivo invalido (precisa ser .mp3 da pasta Sounds)')
                stamp = os.path.join(bk, slot + '_' + time.strftime('%Y%m%d_%H%M%S'))
                if os.path.exists(dst): shutil.copyfile(dst, stamp + '.mp3')
                else: open(stamp + '.none', 'w').close()   # não tinha som antes: desfazer tira o som novo
                shutil.copyfile(src, dst + '.tmp'); os.replace(dst + '.tmp', dst)
                print(time.strftime('%H:%M:%S'), 'Sons: ', src, '->', dst)
                return self._reply(200, {'ok': True})
            olds = sorted(f for f in os.listdir(bk) if f.startswith(slot + '_') and os.path.splitext(f)[1] in ('.mp3', '.none') and os.path.splitext(f)[0][len(slot) + 1:].replace('_', '').isdigit())
            if not olds: raise ValueError('nada para desfazer')
            last = os.path.join(bk, olds[-1]); base = os.path.splitext(last)[0]
            if last.endswith('.none'):   # antes não existia: o som aplicado vai para o _backup (não é apagado)
                if os.path.exists(dst): os.replace(dst, base + '.removido.mp3')
                os.replace(last, base + '.none.feito')
            else:
                shutil.copyfile(last, dst + '.tmp'); os.replace(dst + '.tmp', dst)
                os.replace(last, base + '.desfeito.mp3')   # não usa de novo a mesma cópia
            return self._reply(200, {'ok': True, 'voltou': olds[-1]})
        except Exception as e:
            return self._reply(400, {'ok': False, 'erro': str(e)})
    def do_POST(self):
        if self.path.split('?')[0] in ('/api/som-aplicar', '/api/som-desfazer'): return self._som(self.path.split('?')[0])
        dest = TARGETS.get(self.path.split('?')[0])
        if not dest: return self._reply(404, {'ok': False})
        if self.client_address[0] not in ('127.0.0.1', '::1', '::ffff:127.0.0.1'): return self._reply(403, {'ok': False, 'erro': 'so do proprio PC'})
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > 2_000_000: return self._reply(400, {'ok': False, 'erro': 'tamanho'})
        try:
            data = json.loads(self.rfile.read(n).decode('utf-8'))
            if not isinstance(data, dict) or (dest == GRIPS and not isinstance(data.get('chars'), dict)): raise ValueError('formato')
        except Exception as e:
            return self._reply(400, {'ok': False, 'erro': str(e)})
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.exists(dest): shutil.copyfile(dest, dest.replace('.json', '.backup.json'))   # versão anterior
        tmp = dest + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, dest)
        print(time.strftime('%H:%M:%S'), 'Lab de Armas: salvo em', dest)
        self._reply(200, {'ok': True})

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', port), H) as s:
    print(f'SHADOW OPS em http://localhost:{port}  (sem cache)'); s.serve_forever()
