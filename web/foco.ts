// O que isolar no mapa quando a pessoa aponta (ou foca pelo teclado) um bloco ou uma ligação.
// Aqui só se decide quem entra no destaque; o desenho dele está em estilo/ligacoes.css.
import type { ArestaDoGrafo } from '../src/contrato'
import { idDaAresta } from './rotas'

export type Foco = { no: string } | { aresta: string }
// Do ponto de vista do bloco em foco: chama = quem o chama, chamado = quem ele chama. Numa ligação em foco, origem e destino dela.
export type Relacao = 'foco' | 'chama' | 'chamado' | 'ambos' | 'origem' | 'destino'
export type EstadoDaAresta = 'sai' | 'entra' | 'foco' | 'fora'
// fixo: o foco é o do último clique, que fica até clicar no fundo; sem ele, vale só enquanto o mouse ou o teclado estão ali.
export interface Destaque { nos: Map<string, Relacao>; arestas: Map<string, EstadoDaAresta>; fixo: boolean }

// Foco que já não está na tela (o bloco saiu quando o passo mudou) não destaca nada: apagar o resto sem mostrar o motivo confundiria.
export function destacar(foco: Foco | undefined, fixado: Foco | undefined, arestas: ArestaDoGrafo[], visiveis: Set<string>): Destaque | undefined {
  if (!foco) return undefined
  // Apontar o próprio bloco clicado continua "fixado": o clique vale na hora, com o mouse ainda em cima.
  const fixo = fixado !== undefined && JSON.stringify(foco) === JSON.stringify(fixado)
  let destaque: Omit<Destaque, 'fixo'> | undefined
  if (!('no' in foco)) destaque = destacarAresta(foco.aresta, arestas)
  else if (visiveis.has(foco.no)) destaque = destacarNo(foco.no, arestas)
  return destaque && { ...destaque, fixo }
}

function destacarNo(no: string, arestas: ArestaDoGrafo[]): Omit<Destaque, 'fixo'> {
  const nos = new Map<string, Relacao>([[no, 'foco']])
  const estados = new Map<string, EstadoDaAresta>()
  for (const aresta of arestas) {
    const sai = aresta.de === no
    if (!sai && aresta.para !== no) {
      estados.set(idDaAresta(aresta), 'fora')
      continue
    }
    estados.set(idDaAresta(aresta), sai ? 'sai' : 'entra')
    const vizinho = sai ? aresta.para : aresta.de
    const relacao = sai ? 'chamado' : 'chama'
    // Quem chama e também é chamado pelo bloco mostra os dois sentidos em vez de esconder um deles.
    nos.set(vizinho, nos.has(vizinho) && nos.get(vizinho) !== relacao ? 'ambos' : relacao)
  }
  return { nos, arestas: estados }
}

function destacarAresta(id: string, arestas: ArestaDoGrafo[]): Omit<Destaque, 'fixo'> | undefined {
  const escolhida = arestas.find(a => idDaAresta(a) === id)
  if (!escolhida) return undefined
  const nos = new Map<string, Relacao>([[escolhida.de, 'origem'], [escolhida.para, 'destino']])
  return { nos, arestas: new Map(arestas.map((a): [string, EstadoDaAresta] => [idDaAresta(a), idDaAresta(a) === id ? 'foco' : 'fora'])) }
}
