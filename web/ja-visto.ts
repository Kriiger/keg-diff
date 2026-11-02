// "Já visto em outro fluxo": o mesmo passo (os mesmos trechos) repetido em vários fluxos é lido uma vez, no primeiro fluxo da ordem de leitura.
// A conta é só do review.json (não depende do que a pessoa clicou nem do estado.json) e fica numa função pura, memoizada por revisão.
import type { Fluxo, Passo, Revisao } from '../src/contrato'
import { montarHierarquia, type NoDaHierarquia } from './hierarquia'

export interface JaVisto { fluxo: Fluxo; passo: Passo }

// Passo (id) → onde ele foi visto antes. Passo que não está no mapa não é repetido.
export type JaVistosDoFluxo = ReadonlyMap<string, JaVisto>

const SEM_REPETIDOS: JaVistosDoFluxo = new Map()

// A ordem em que a lateral lista os fluxos: a da hierarquia (fluxos que dividem o começo ficam juntos), de cima para baixo.
function folhas(nos: NoDaHierarquia[]): Fluxo[] {
  return nos.flatMap(no => (no.tipo === 'fluxo' ? [no.item.fluxo] : folhas(no.filhos)))
}

export function ordemDeLeitura(revisao: Revisao): Fluxo[] {
  return folhas(montarHierarquia(revisao.fluxos.map(fluxo => ({ fluxo, hunkIds: [] }))))
}

// Revisão (o objeto: um review.json novo é outro e zera o cache) → fluxo → passos já vistos.
const cache = new WeakMap<Revisao, Map<string, JaVistosDoFluxo>>()

// Passo alterado cujos trechos todos estão num passo de um fluxo que vem antes na ordem de leitura. Com mais de um passo assim,
// vale o primeiro da ordem. Passo de contexto (sem trecho) não tem o que ler de novo e nunca entra.
function calcular(revisao: Revisao): Map<string, JaVistosDoFluxo> {
  const vistos = new Map<string, JaVistosDoFluxo>()
  const anteriores: JaVisto[] = []
  for (const fluxo of ordemDeLeitura(revisao)) {
    const repetidos = new Map<string, JaVisto>()
    for (const passo of fluxo.passos) {
      if (passo.hunkIds.length === 0) continue
      const origem = anteriores.find(antes => passo.hunkIds.every(id => antes.passo.hunkIds.includes(id)))
      if (origem) repetidos.set(passo.id, origem)
    }
    vistos.set(fluxo.id, repetidos.size > 0 ? repetidos : SEM_REPETIDOS)
    for (const passo of fluxo.passos) if (passo.hunkIds.length > 0) anteriores.push({ fluxo, passo })
  }
  return vistos
}

export function jaVistosDoFluxo(revisao: Revisao, fluxoId: string): JaVistosDoFluxo {
  let vistos = cache.get(revisao)
  if (!vistos) cache.set(revisao, (vistos = calcular(revisao)))
  return vistos.get(fluxoId) ?? SEM_REPETIDOS
}

// O índice do passo mais próximo que não é repetido, andando para a frente ou para trás. Sem nenhum, fica onde está.
// O clique direto num passo não passa por aqui: só o j e o k pulam os já vistos.
export function vizinhoNaoVisto(fluxo: Fluxo, vistos: JaVistosDoFluxo, de: number, direcao: 1 | -1): number {
  for (let i = de + direcao; i >= 0 && i < fluxo.passos.length; i += direcao) {
    if (!vistos.has(fluxo.passos[i]!.id)) return i
  }
  return de
}
