// A análise roda numa thread com pilha folgada: o compilador desce recursivo pelos imports, e a cadeia de tipos
// de uma biblioteca grande, como o Shiki, estoura a pilha padrão do Node. No --watch a thread fica viva entre as
// análises, com o Project do ts-morph em memória: só os arquivos que mudaram são lidos de novo.
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import type { Project } from 'ts-morph'
import { Analisador, type Config } from './analisador.js'
import { coletarDiff } from './coletor.js'
import type { Revisao } from './contrato.js'
import { montarRevisao } from './montador.js'
import { montarPanorama } from './panorama.js'
import { abrirProjeto, assinaturaDaConfig, atualizarProjeto } from './projeto.js'

export interface Tempos { projetoMs: number; fluxosMs: number; projetoEmMemoria: boolean }
export interface Analise { revisao: Revisao; tempos: Tempos }

export class Motor {
  private thread?: Worker

  constructor(private raiz: string, private config: Config) {}

  analisar(argsDoGit: string[]): Promise<Analise> {
    const thread = this.thread ??= this.iniciar()
    return new Promise((resolver, rejeitar) => {
      const terminar = (resposta: Analise | { erro: string } | Error | number) => {
        thread.off('message', terminar)
        thread.off('error', terminar)
        thread.off('exit', terminar)
        if (typeof resposta === 'number') rejeitar(new Error('a thread de análise parou'))
        else if (resposta instanceof Error) rejeitar(resposta)
        else if ('erro' in resposta) rejeitar(new Error(resposta.erro))
        else resolver(resposta)
      }
      thread.on('message', terminar)
      thread.on('error', terminar)
      thread.on('exit', terminar)
      thread.postMessage({ argsDoGit })
    })
  }

  encerrar() {
    void this.thread?.terminate()
  }

  private iniciar(): Worker {
    const thread = new Worker(new URL(import.meta.url), { workerData: { raiz: this.raiz, config: this.config }, resourceLimits: { stackSizeMb: 64 } })
    // Thread que caiu é substituída na próxima análise.
    thread.once('exit', () => { if (this.thread === thread) this.thread = undefined })
    return thread
  }
}

if (!isMainThread) escutar()

function escutar() {
  const { raiz, config } = workerData
  let aberto: { projeto: Project; assinatura: string } | undefined
  parentPort!.on('message', ({ argsDoGit }: { argsDoGit: string[] }) => {
    try {
      const inicio = performance.now()
      const assinatura = assinaturaDaConfig(raiz)
      const projetoEmMemoria = aberto !== undefined && aberto.assinatura === assinatura
      if (aberto && projetoEmMemoria) atualizarProjeto(aberto.projeto, raiz)
      else aberto = { projeto: abrirProjeto(raiz), assinatura }
      const meio = performance.now()
      const revisao = montarRevisao(coletarDiff(argsDoGit), new Analisador(raiz, config, aberto.projeto), argsDoGit.join(' ') || 'HEAD')
      acrescentarPanorama(revisao, raiz, argsDoGit)
      parentPort!.postMessage({ revisao, tempos: { projetoMs: meio - inicio, fluxosMs: performance.now() - meio, projetoEmMemoria } })
    } catch (erro) {
      parentPort!.postMessage({ erro: erro instanceof Error ? erro.message : String(erro) })
    }
  })
}

// O panorama é um extra: se o git ou o parser falharem nele, a revisão segue só com os fluxos.
function acrescentarPanorama(revisao: Revisao, raiz: string, argsDoGit: string[]) {
  try {
    revisao.panorama = montarPanorama(revisao, raiz, argsDoGit)
  } catch (erro) {
    console.error(`não consegui montar o panorama: ${erro instanceof Error ? erro.message : erro}`)
  }
}
