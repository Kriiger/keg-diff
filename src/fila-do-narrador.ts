// Fila do narrador no servidor: um fluxo (ou um grupo de órfãos) por vez, e nada se repete sozinho.
// O keg só narra com o login da assinatura; qualquer outro login, ou uma resposta com erro, para a fila.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { verificarLogin } from './claude-cli.js'
import type { EstadoDoNarrador, Revisao } from './contrato.js'
import { gravarConfigDoNarrador, narrarFluxo, narrarOrfaos, PausaDaNarracao, preencherDoCache, type ConfigDoNarrador, type OpcoesDoNarrador } from './narrador.js'
import { agruparOrfaos, ehGrupoDeOrfaos } from './orfaos.js'
import type { Sessao } from './sessao.js'

// Os órfãos entram depois dos fluxos: enquanto houver fluxo na fila, ele passa na frente, mesmo que o pedido dos órfãos tenha chegado antes.
export function proximoDaFila(fila: string[]): string | undefined {
  return fila.find(id => !ehGrupoDeOrfaos(id)) ?? fila[0]
}

export class FilaDoNarrador {
  private motivo?: string
  private pausa?: string
  private fila: string[] = []
  private falhas: Record<string, string> = {}
  private login: Promise<void>
  private rodando = false
  private arquivoDaRevisao: string

  constructor(private raiz: string, private opcoes: OpcoesDoNarrador, private sessao: Sessao, private avisar: () => void) {
    this.arquivoDaRevisao = path.join(raiz, '.revisao', 'review.json')
    this.motivo = opcoes.semIa ? 'você rodou o keg diff com --sem-ia' : undefined
    // A trava de login roda antes da primeira chamada, e já na abertura da página, para o aviso aparecer logo.
    this.login = this.conferirLogin()
  }

  estado(): EstadoDoNarrador {
    return { ativo: this.motivo === undefined, motivo: this.motivo, pausa: this.pausa, narrando: [...this.fila], falhas: this.falhas, modelo: this.opcoes.modelo, esforco: this.opcoes.esforco }
  }

  // O modelo e o esforço da página valem já para a próxima chamada, sem reiniciar: o objeto de opções é o mesmo do cli, então a
  // análise do --watch também enxerga a mudança. A chamada que está em andamento termina com a config com que começou.
  // Grava no keg.config.json primeiro: se a gravação falhar, a config de agora continua valendo.
  definirConfig(config: ConfigDoNarrador) {
    gravarConfigDoNarrador(this.raiz, config)
    this.opcoes.modelo = config.modelo
    this.opcoes.esforco = config.esforco
    this.avisar()
  }

  // "ids" são ids de fluxos e de grupos de órfãos (ver orfaos.ts).
  // "retomar" é a pessoa pedindo de novo depois da pausa; abrir um fluxo não conta.
  pedir(ids: string[], retomar: boolean) {
    if (this.opcoes.semIa || (this.pausa && !retomar)) return
    if (retomar) {
      this.pausa = undefined
      this.login = this.conferirLogin()
    }
    for (const id of ids) {
      delete this.falhas[id]
      if (!this.fila.includes(id)) this.fila.push(id)
    }
    void this.processar()
  }

  private async conferirLogin() {
    if (this.opcoes.semIa) return
    const { motivo, metodo } = await verificarLogin()
    this.motivo = motivo
    this.sessao.definirLogin(metodo)
    this.avisar()
  }

  private async processar() {
    if (this.rodando) return
    this.rodando = true
    await this.login
    while (this.fila.length > 0 && !this.pausa && this.motivo === undefined) {
      const id = proximoDaFila(this.fila)!
      await this.narrarUm(id)
      this.fila.splice(this.fila.indexOf(id), 1)
      this.avisar()
    }
    // Parou por pausa ou por trava: o que sobrou na fila só volta se a pessoa pedir.
    this.fila = []
    this.rodando = false
    this.avisar()
  }

  private async narrarUm(id: string) {
    const revisao: Revisao = JSON.parse(readFileSync(this.arquivoDaRevisao, 'utf8'))
    const grupo = ehGrupoDeOrfaos(id) ? agruparOrfaos(revisao).find(g => g.id === id) : undefined
    const fluxo = revisao.fluxos.find(f => f.id === id)
    if (!grupo && !fluxo) {
      this.falhas[id] = `${ehGrupoDeOrfaos(id) ? 'este grupo de órfãos' : 'este fluxo'} não está mais no review.json; rode o keg diff de novo`
      return
    }
    try {
      const opcoes = { modelo: this.opcoes.modelo, esforco: this.opcoes.esforco, aoChamar: () => this.sessao.contarChamada() }
      if (grupo) await narrarOrfaos(grupo, revisao, this.raiz, opcoes)
      else await narrarFluxo(fluxo!, revisao, this.raiz, opcoes)
      this.gravarRevisao()
    } catch (erro) {
      if (erro instanceof PausaDaNarracao) {
        this.pausa = erro.message || 'o claude devolveu um erro'
        this.sessao.contarLimite()
      } else {
        this.falhas[id] = erro instanceof Error ? erro.message : String(erro)
      }
    }
  }

  // Lê o review.json de novo: se o keg diff rodou enquanto a chamada demorava, só entra o que casa com o hash do cache.
  private gravarRevisao() {
    const antes = readFileSync(this.arquivoDaRevisao, 'utf8')
    const revisao: Revisao = JSON.parse(antes)
    preencherDoCache(revisao, this.raiz, this.opcoes)
    const depois = JSON.stringify(revisao, null, 2) + '\n'
    if (depois !== antes) writeFileSync(this.arquivoDaRevisao, depois)
  }
}
