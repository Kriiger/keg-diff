// A hierarquia entre fluxos na lateral: fluxos que começam pelos mesmos passos dividem um nó pai, e cada ramo mostra só o que é seu.
// É uma trie sobre a sequência de passos, só de apresentação: os fluxos, os ids, os endereços e as decisões continuam como são.
import { idDoNo, type Fluxo, type Passo } from '../src/contrato'

export interface FluxoDaLista { fluxo: Fluxo; hunkIds: string[] }

export interface GrupoDeFluxos {
  tipo: 'grupo'
  chave: string              // o primeiro fluxo e a profundidade: único na árvore, ao contrário do passo, que se repete entre ramos
  passos: Passo[]            // os passos compartilhados, como o primeiro fluxo do grupo os tem
  primeiro: FluxoDaLista     // o fluxo para onde o clique no nó leva
  total: number              // quantos fluxos há embaixo, em qualquer profundidade
  filhos: NoDaHierarquia[]
}

export type NoDaHierarquia = GrupoDeFluxos | { tipo: 'fluxo'; item: FluxoDaLista }

// Mesma função no mesmo arquivo é o mesmo passo, e é a identidade que o mapa já usa. O id do passo (p1, p2...) é por fluxo e não serve.
const mesmoPasso = (a: Passo | undefined, b: Passo | undefined) => a !== undefined && b !== undefined && idDoNo(a) === idDoNo(b)

// Quantos passos, a partir de "fundo", todos os fluxos do grupo têm em comum. Quem acaba antes limita os outros.
function tamanhoDoPrefixo(grupo: FluxoDaLista[], fundo: number): number {
  let tamanho = 1
  const [primeiro, ...resto] = grupo
  while (resto.every(({ fluxo }) => mesmoPasso(fluxo.passos[fundo + tamanho], primeiro!.fluxo.passos[fundo + tamanho]))) tamanho++
  return tamanho
}

export function temGrupo(nos: NoDaHierarquia[]): boolean {
  return nos.some(no => no.tipo === 'grupo')
}

// Agrupa pelo passo na posição "fundo". Um grupo de dois ou mais vira nó e estende o prefixo enquanto todos concordam, então um nó
// nunca tem um filho só (uma corrente de nós se funde em um). Fluxo sem passo nessa posição ou sozinho no seu passo fica como folha.
// O Map guarda a ordem da primeira aparição: o grupo surge onde estava o primeiro fluxo dele.
export function montarHierarquia(itens: FluxoDaLista[], fundo = 0): NoDaHierarquia[] {
  const grupos = new Map<string, FluxoDaLista[]>()
  for (const item of itens) {
    const passo = item.fluxo.passos[fundo]
    const chave = passo ? idDoNo(passo) : `fim:${item.fluxo.id}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), item])
  }
  return [...grupos.entries()].map(([chave, grupo]): NoDaHierarquia => {
    const [primeiro] = grupo
    if (grupo.length === 1) return { tipo: 'fluxo', item: primeiro! }
    const tamanho = tamanhoDoPrefixo(grupo, fundo)
    return {
      tipo: 'grupo', chave: `${primeiro!.fluxo.id}@${fundo}`, primeiro: primeiro!, total: grupo.length,
      passos: primeiro!.fluxo.passos.slice(fundo, fundo + tamanho),
      filhos: montarHierarquia(grupo, fundo + tamanho),
    }
  })
}

function contemFluxo(no: NoDaHierarquia, fluxoId: string): boolean {
  return no.tipo === 'fluxo' ? no.item.fluxo.id === fluxoId : no.filhos.some(filho => contemFluxo(filho, fluxoId))
}

// As chaves dos nós que escondem o fluxo, do de fora ao de dentro: abrir um fluxo por j, k ou pelo mapa reabre o caminho até ele.
export function gruposAteOFluxo(nos: NoDaHierarquia[], fluxoId: string): string[] {
  return nos.flatMap(no => (no.tipo === 'grupo' && contemFluxo(no, fluxoId) ? [no.chave, ...gruposAteOFluxo(no.filhos, fluxoId)] : []))
}
