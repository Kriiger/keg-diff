// O desenho do mapa: roda o ELK para os blocos e ligações que estão na tela e guarda o resultado.
import ELK from 'elkjs/lib/elk.bundled.js'
import { useEffect, useState } from 'react'
import { calcularLayout, type Desenho } from './rotas'
import type { ArestaDoGrafo, Grafo } from '../src/contrato'

// O ELK sem worker: o bundle já traz o algoritmo, e a página não precisa de um segundo arquivo para carregar.
const elk = new ELK()
// Desenhos que o ELK já calculou, por grafo (um review.json novo é outro objeto e zera o cache): reabrir a gaveta não refaz o layout.
const desenhosCalculados = new WeakMap<Grafo, Map<string, Desenho>>()

// A primeira chamada do ELK é a mais lenta (o código ainda está frio): uma rodada pequena, assim que o módulo carrega
// (o mapa baixa com a página ociosa), tira esse custo da abertura do mapa.
void elk.layout({
  id: 'aquecimento', layoutOptions: { 'elk.algorithm': 'layered', 'elk.edgeRouting': 'ORTHOGONAL' },
  children: ['a', 'b', 'c'].map(id => ({ id, width: 10, height: 10 })),
  edges: [{ id: 'a>b', sources: ['a'], targets: ['b'] }, { id: 'b>c', sources: ['b'], targets: ['c'] }, { id: 'a>c', sources: ['a'], targets: ['c'] }],
})

// Enquanto o ELK trabalha, fica o desenho anterior. `calcular` começa o cálculo (a gaveta já está subindo); quem usa decide quando mostrar.
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
    calcularLayout(elk, [...visiveis], arestas).then(layout => {
      const novo = { ...layout, chave, visiveis, arestas }
      calculados.set(chave, novo)
      if (vigente) setDesenho(novo)
    })
    return () => { vigente = false }
  }, [chave, calcular, grafo])
  return desenho
}
