// A sessão é a revisão em andamento: o tempo ativo que a página contou e o que o narrador gastou.
// Fica em .revisao/sessao.json, então recarregar a página ou reiniciar o keg diff não zera o cronômetro.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { LinhaDoHistorico } from './contrato.js'

// Um keg diff novo continua a sessão que ficou pela metade se for da mesma base e recente; senão abre outra.
const RETOMADA_EM_MS = 12 * 60 * 60 * 1000

interface DadosDaSessao {
  iniciadoEm: string
  atualizadoEm: string
  base: string
  segundos: number
  registrada: boolean              // já virou linha do histórico: o próximo keg diff abre outra sessão
  narrador: LinhaDoHistorico['narrador']
}

export class Sessao {
  private constructor(private arquivo: string, private dados: DadosDaSessao) {}

  static abrir(pastaDaRevisao: string, base: string): Sessao {
    const arquivo = path.join(pastaDaRevisao, 'sessao.json')
    const anterior = lerDados(arquivo)
    const recente = anterior !== undefined && Date.now() - Date.parse(anterior.atualizadoEm) < RETOMADA_EM_MS
    if (anterior && recente && anterior.base === base && !anterior.registrada) return new Sessao(arquivo, anterior)
    const agora = new Date().toISOString()
    const nova = new Sessao(arquivo, { iniciadoEm: agora, atualizadoEm: agora, base, segundos: 0, registrada: false, narrador: { chamadas: 0, avisosDeLimite: 0, login: null } })
    nova.gravar()
    return nova
  }

  get iniciadoEm(): string { return this.dados.iniciadoEm }
  get segundos(): number { return this.dados.segundos }
  get narrador(): LinhaDoHistorico['narrador'] { return { ...this.dados.narrador } }

  // A página manda o total que contou; o maior vale, porque duas abas abertas contam o mesmo relógio.
  somarTempo(segundos: unknown) {
    if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos < 0) return
    this.dados.segundos = Math.max(this.dados.segundos, Math.floor(segundos))
    this.gravar()
  }

  contarChamada() {
    this.dados.narrador.chamadas++
    this.gravar()
  }

  contarLimite() {
    this.dados.narrador.avisosDeLimite++
    this.gravar()
  }

  definirLogin(metodo: string | undefined) {
    this.dados.narrador.login = metodo ?? null
    this.gravar()
  }

  marcarRegistrada() {
    this.dados.registrada = true
    this.gravar()
  }

  private gravar() {
    this.dados.atualizadoEm = new Date().toISOString()
    writeFileSync(this.arquivo, JSON.stringify(this.dados, null, 2) + '\n')
  }
}

function lerDados(arquivo: string): DadosDaSessao | undefined {
  if (!existsSync(arquivo)) return undefined
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    return undefined
  }
}
