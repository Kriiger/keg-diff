// O grafo do mapa em números: quantos nós e ligações, quem concentra chamadas e onde há ciclo. Sem React.
import type { ArestaDoGrafo, Grafo, NoDoGrafo } from '../src/contrato'

export interface Concentrador { no: NoDoGrafo; grau: number }
export interface ResumoDoGrafo {
  nos: number
  alterados: number
  arestas: [ArestaDoGrafo['tipo'], number][]
  chamadoPorMuitos: Concentrador[]
  chamaMuitos: Concentrador[]
  ciclos: NoDoGrafo[][]
}

const CONCENTRADORES = 3

export function resumirGrafo(grafo: Grafo): ResumoDoGrafo {
  const porId = new Map(grafo.nos.map(no => [no.id, no]))
  // Uso de tipo não executa nada: não conta como quem chama quem, nem fecha ciclo.
  const execucao = grafo.arestas.filter(a => a.tipo !== 'tipo' && porId.has(a.de) && porId.has(a.para))
  const tipos: ArestaDoGrafo['tipo'][] = ['chamada', 'http', 'dinamico', 'tipo']
  return {
    nos: grafo.nos.length,
    alterados: grafo.nos.filter(no => no.hunkIds.length > 0).length,
    arestas: tipos.map((tipo): [ArestaDoGrafo['tipo'], number] => [tipo, grafo.arestas.filter(a => a.tipo === tipo).length]).filter(([, quantas]) => quantas > 0),
    chamadoPorMuitos: maioresGraus(execucao.map(a => a.para), porId),
    chamaMuitos: maioresGraus(execucao.map(a => a.de), porId),
    ciclos: ciclosDe(execucao, porId),
  }
}

// O mapa guarda só a vizinhança do diff: o grau é o que aparece nele, e um grau de 1 não concentra nada.
function maioresGraus(pontas: string[], porId: Map<string, NoDoGrafo>): Concentrador[] {
  const graus = new Map<string, number>()
  for (const id of pontas) graus.set(id, (graus.get(id) ?? 0) + 1)
  return [...graus]
    .filter(([, grau]) => grau >= 2)
    .sort(([a, grauA], [b, grauB]) => grauB - grauA || a.localeCompare(b))
    .slice(0, CONCENTRADORES)
    .map(([id, grau]) => ({ no: porId.get(id)!, grau }))
}

// Os componentes fortemente conexos com mais de um nó (Tarjan): cada um é um ciclo de chamadas.
function ciclosDe(arestas: ArestaDoGrafo[], porId: Map<string, NoDoGrafo>): NoDoGrafo[][] {
  const vizinhos = new Map<string, string[]>()
  for (const { de, para } of arestas) vizinhos.set(de, [...(vizinhos.get(de) ?? []), para])
  const indices = new Map<string, number>()
  const baixos = new Map<string, number>()
  const pilha: string[] = []
  const componentes: string[][] = []

  const visitar = (id: string) => {
    indices.set(id, indices.size)
    baixos.set(id, indices.get(id)!)
    pilha.push(id)
    for (const vizinho of vizinhos.get(id) ?? []) {
      if (!indices.has(vizinho)) visitar(vizinho)
      if (pilha.includes(vizinho)) baixos.set(id, Math.min(baixos.get(id)!, baixos.get(vizinho)!))
    }
    if (baixos.get(id) !== indices.get(id)) return
    const componente = pilha.splice(pilha.indexOf(id))
    if (componente.length > 1) componentes.push(componente)
  }
  for (const id of porId.keys()) if (!indices.has(id)) visitar(id)
  return componentes.map(ids => ids.map(id => porId.get(id)!))
}
