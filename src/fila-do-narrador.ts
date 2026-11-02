// Fila do narrador no servidor: um fluxo por vez, e nada se repete sozinho.
// O keg só narra com o login da assinatura; qualquer outro login, ou uma resposta com erro, para a fila.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { verificarLogin } from './claude-cli.js'
import type { EstadoDoNarrador, Revisao } from './contrato.js'
import { narrarFluxo, PausaDaNarracao, preencherDoCache, type OpcoesDoNarrador } from './narrador.js'
import type { Sessao } from './sessao.js'

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
    return { ativo: this.motivo === undefined, motivo: this.motivo, pausa: this.pausa, narrando: [...this.fila], falhas: this.falhas, modelo: this.opcoes.modelo }
  }

  // "retomar" é a pessoa pedindo de novo depois da pausa; abrir um fluxo não conta.
  pedir(fluxos: string[], retomar: boolean) {
    if (this.opcoes.semIa || (this.pausa && !retomar)) return
    if (retomar) {
      this.pausa = undefined
      this.login = this.conferirLogin()
    }
    for (const id of fluxos) {
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
      await this.narrarUm(this.fila[0]!)
      this.fila.shift()
      this.avisar()
    }
    // Parou por pausa ou por trava: o que sobrou na fila só volta se a pessoa pedir.
    this.fila = []
    this.rodando = false
    this.avisar()
  }

  private async narrarUm(id: string) {
    const revisao: Revisao = JSON.parse(readFileSync(this.arquivoDaRevisao, 'utf8'))
    const fluxo = revisao.fluxos.find(f => f.id === id)
    if (!fluxo) {
      this.falhas[id] = 'este fluxo não está mais no review.json; rode o keg diff de novo'
      return
    }
    try {
      await narrarFluxo(fluxo, revisao, this.raiz, { modelo: this.opcoes.modelo, aoChamar: () => this.sessao.contarChamada() })
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
    preencherDoCache(revisao, this.raiz, this.opcoes.modelo)
    const depois = JSON.stringify(revisao, null, 2) + '\n'
    if (depois !== antes) writeFileSync(this.arquivoDaRevisao, depois)
  }
}
