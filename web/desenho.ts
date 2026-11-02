// O desenho do mapa: roda o ELK para os blocos e ligações que estão na tela e guarda o resultado.
import ELK from 'elkjs/lib/elk-api.js'
// O script do worker sai do build como arquivo à parte, intocado (?url): é um script clássico do GWT, não um módulo.
import urlDoWorker from 'elkjs/lib/elk-worker.min.js?url'
import type { ELK as ElkApi, ElkNode } from 'elkjs/lib/elk-api'
import { useEffect, useState } from 'react'
import { calcularLayout, type Desenho } from './rotas'
import type { ArestaDoGrafo, Grafo } from '../src/contrato'

// A primeira chamada do ELK é a mais lenta (o código ainda está frio): uma rodada pequena, assim que o módulo carrega
// (o mapa baixa com a página ociosa), tira esse custo da abertura do mapa. Também prova que o worker nasceu e responde.
const AQUECIMENTO: ElkNode = {
  id: 'aquecimento', layoutOptions: { 'elk.algorithm': 'layered', 'elk.edgeRouting': 'ORTHOGONAL' },
  children: ['a', 'b', 'c'].map(id => ({ id, width: 10, height: 10 })),
  edges: [{ id: 'a>b', sources: ['a'], targets: ['b'] }, { id: 'b>c', sources: ['b'], targets: ['c'] }, { id: 'a>c', sources: ['a'], targets: ['c'] }],
}
const PRAZO_DO_WORKER = 8000

// O ELK roda num worker: o layout de um grafo grande (abrir a gaveta, expandir vizinhos) não trava a thread principal. Se o worker não
// nascer (arquivo que não carrega, política do navegador) ou não responder, o ELK empacotado assume na própria thread, como antes;
// ele só é baixado nesse caso (import dinâmico), e a página que tem worker nunca paga o peso dele.
function criarElk(): Promise<ElkApi> {
  return new Promise(resolver => {
    const empacotado = () => import('elkjs/lib/elk.bundled.js').then(modulo => resolver(new modulo.default()))
    const prazo = setTimeout(empacotado, PRAZO_DO_WORKER)
    try {
      let worker: Worker | undefined
      const elk = new ELK({ workerFactory: () => (worker = new Worker(urlDoWorker)) })
      worker?.addEventListener('error', () => { clearTimeout(prazo); void elk.terminateWorker(); void empacotado() }, { once: true })
      elk.layout(AQUECIMENTO).then(() => { clearTimeout(prazo); resolver(elk) }, () => {})
    } catch {
      clearTimeout(prazo)
      void empacotado()
    }
  })
}
const elkPronto = criarElk()
const elk: Pick<ElkApi, 'layout'> = { layout: (grafo, argumentos) => elkPronto.then(pronto => pronto.layout(grafo, argumentos)) }
// Desenhos que o ELK já calculou, por grafo (um review.json novo é outro objeto e zera o cache): reabrir a gaveta não refaz o layout.
const desenhosCalculados = new WeakMap<Grafo, Map<string, Desenho>>()

// Só devolve o desenho que bate com o que está visível agora: quem usa guarda o anterior (para ancorar o novo) e decide quando mostrar.
// `calcular` começa o cálculo (a gaveta já está subindo).
export function useDesenho(grafo: Grafo | undefined, visiveis: Set<string>, arestas: ArestaDoGrafo[], calcular: boolean): Desenho | undefined {
  const [desenho, setDesenho] = useState<Desenho>()
  const chave = `${[...visiveis].sort().join('|')}#${arestas.length}`
  useEffect(() => {
    if (!calcular || !grafo) return
    const calculados = desenhosCalculados.get(grafo) ?? new Map<string, Desenho>()
    desenhosCalculados.set(grafo, calculados)
    const guardado = calculados.get(chave)
    if (guardado) return setDesenho(guardado)
    let vigente = true
    const porId = new Map(grafo.nos.map(no => [no.id, no]))
    calcularLayout(elk, [...visiveis].flatMap(id => porId.get(id) ?? []), arestas).then(layout => {
      const novo = { ...layout, chave, visiveis, arestas }
      calculados.set(chave, novo)
      if (vigente) setDesenho(novo)
    })
    return () => { vigente = false }
  }, [chave, calcular, grafo])
  return desenho?.chave === chave ? desenho : undefined
}
