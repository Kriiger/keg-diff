// Para onde o n, o [ e o ] levam. As contas são puras, sobre a checklist; a tela só aplica o resultado.
import { useEffect, useRef, type MutableRefObject } from 'react'
import type { Estado } from '../src/contrato'
import type { Checklist } from './main'

export interface Posicao { rota: string; indice: number }

// A tela aberta diz onde está e como ir a outro lugar dela; "pendente" é o lugar que o n pediu a uma tela que ainda vai abrir.
export interface Navegacao {
  cursor: MutableRefObject<(Posicao & { ir: (indice: number) => void }) | undefined>
  pendente: MutableRefObject<Posicao | undefined>
}

const GRUPOS = ['orfaos', 'testes', 'outros'] as const

// O primeiro lugar com trecho sem decisão depois da posição atual, na ordem da coluna da esquerda
// (passos dos fluxos, órfãos, testes, outros), dando a volta até o começo. Sem posição, começa do começo.
export function proximoNaoRevisado(checklist: Checklist, estado: Estado, atual?: Posicao): Posicao | undefined {
  const dosFluxos = checklist.fluxos.flatMap(({ fluxo }) => fluxo.passos.map((passo, indice) => ({ rota: `fluxo/${fluxo.id}`, indice, hunkIds: passo.hunkIds })))
  const dosGrupos = GRUPOS.flatMap(grupo => checklist[grupo].map((item, indice) => ({ rota: grupo, indice, hunkIds: item.hunkIds })))
  const lugares = [...dosFluxos, ...dosGrupos]
  const aqui = lugares.findIndex(lugar => lugar.rota === atual?.rota && lugar.indice === atual.indice)
  return [...lugares.slice(aqui + 1), ...lugares.slice(0, aqui + 1)].find(lugar => lugar.hunkIds.some(id => !estado[id]))
}

// O fluxo anterior ou o próximo; depois do último vêm os grupos de trechos. Nas pontas fica onde está.
export function rotaVizinha(checklist: Checklist, rota: string, direcao: 1 | -1): string | undefined {
  const rotas = [...checklist.fluxos.map(({ fluxo }) => `fluxo/${fluxo.id}`), ...GRUPOS.filter(grupo => checklist[grupo].length > 0)]
  const posicao = rotas.indexOf(rota)
  if (posicao >= 0) return rotas[posicao + direcao]
  return direcao === 1 ? rotas[0] : rotas.at(-1)
}

// Cada tela com posição (fluxo, grupo de trechos) se registra aqui. A tela que acabou de abrir por causa do n
// nasce já no lugar pedido: ela lê "pendente" na criação (ver indiceInicial), e este efeito o limpa.
export function useCursor({ cursor, pendente }: Navegacao, rota: string, indice: number, ir: (indice: number) => void) {
  useEffect(() => {
    cursor.current = { rota, indice, ir }
    if (pendente.current?.rota === rota) pendente.current = undefined
  })
  useEffect(() => () => { cursor.current = undefined }, [cursor])
}

export function indiceInicial({ pendente }: Navegacao, rota: string): number | undefined {
  return pendente.current?.rota === rota ? pendente.current.indice : undefined
}

// Os atalhos n, [ e ] com o estado que eles precisam. "navegacao" vai para as telas, que se registram nela.
export function useNavegacao(checklist: Checklist | undefined, estado: Estado, rota: string): { navegacao: Navegacao; atalhos: Record<string, () => void> } {
  const navegacao: Navegacao = { cursor: useRef(undefined), pendente: useRef(undefined) }
  // Sem trecho pendente em lugar nenhum, o n leva ao Fechamento.
  const proximo = () => {
    if (!checklist) return
    const alvo = proximoNaoRevisado(checklist, estado, navegacao.cursor.current)
    if (!alvo) location.hash = 'fechamento'
    else if (navegacao.cursor.current?.rota === alvo.rota) navegacao.cursor.current.ir(alvo.indice)
    else {
      navegacao.pendente.current = alvo
      location.hash = alvo.rota
    }
  }
  const vizinho = (direcao: 1 | -1) => {
    const destino = checklist && rotaVizinha(checklist, rota, direcao)
    if (destino) location.hash = destino
  }
  return { navegacao, atalhos: { n: proximo, '[': () => vizinho(-1), ']': () => vizinho(1) } }
}
