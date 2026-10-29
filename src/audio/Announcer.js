/**
 * Locutor: liga os sons escolhidos na ferramenta de Sons do Lab (assets/config/sons_destino.json) aos acontecimentos da partida.
 * Cada acontecimento tem uma lista de destinos aceitos (o primeiro que tiver som carregado toca). Os nomes livres que você
 * escreveu em "Outro" na ferramenta também entram aqui — ex.: "ao_iniciar_a_partida_no_botao_de_start".
 * Para ligar um som novo: escolha o destino na ferramenta, aplique, e (se for um acontecimento novo) acrescente aqui.
 */
export const EVENTS = {
  inicio: ['locutor_inicio', 'ao_iniciar_a_partida_no_botao_de_start'],       // começo da partida (botão Iniciar)
  abate: ['locutor_abate'],                                                   // 1 abate (sem sequência)
  duplo: ['locutor_abate_duplo'],                                             // 2 abates seguidos
  triplo: ['locutor_abate_triplo'],                                           // 3 abates seguidos
  massacre: ['locutor_massacre', 'locutor_sequencia'],                        // 4 ou mais abates seguidos
  headshot: ['locutor_headshot'],                                             // abate com tiro na cabeça
  headshot2: ['locutor_headshot_duplo', 'ao_dar_2_tiro_na_cabe_a_em_sequencia'], // 2 abates seguidos na cabeça
  granada: ['ao_matar_na_granada'],                                           // abate com granada (o jogo ainda não tem granada)
  vitoria: ['locutor_vitoria'], derrota: ['locutor_derrota']
};
export const SEQ_WINDOW = 5000;   // ms entre abates para contar como sequência (igual ao letreiro de abate)

export class Announcer {
  constructor(audio) { this.audio = audio; this.n = 0; this.heads = 0; this.last = -1e9; this.t = null; }
  /** Toca o primeiro som carregado do acontecimento. Retorna o nome tocado (ou null). */
  say(ev, delay = 0, retry = 8) {
    const name = (EVENTS[ev] || []).find(n => this.audio?.has?.(n));
    if (!name) { if (retry > 0 && (EVENTS[ev] || []).some(n => this.audio?.raw && n in this.audio.raw)) setTimeout(() => this.say(ev, 0, retry - 1), 400); return null; }   // ainda decodificando
    clearTimeout(this.t); this.t = setTimeout(() => this.audio.play(name, { gain: 1 }), delay);   // um locutor por vez: o mais novo vence
    return name;
  }
  /** Abate feito pelo jogador. e = { head, weapon }. Decide qual fala: sequência > cabeça > abate simples. */
  kill(e, now = performance.now()) {
    const seq = now - this.last < SEQ_WINDOW; this.last = now;
    this.n = seq ? this.n + 1 : 1; this.heads = e.head ? (seq ? this.heads + 1 : 1) : 0;
    const ev = e.grenade ? 'granada' : this.n >= 4 ? 'massacre' : this.n === 3 ? 'triplo' : this.n === 2 ? (this.heads >= 2 && this.has('headshot2') ? 'headshot2' : 'duplo')
      : e.head ? 'headshot' : 'abate';
    return { ev, name: this.say(ev, 350) };   // depois do "tum" do abate
  }
  has(ev) { return (EVENTS[ev] || []).some(n => this.audio?.has?.(n)); }
  reset() { this.n = this.heads = 0; this.last = -1e9; }
}
