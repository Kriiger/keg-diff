// O modo de visualização: "fluxo" (o diff reorganizado em nasce → processa → termina) ou "arvore" (pastas e arquivos,
// como o GitHub mostra). A escolha fica só neste navegador (localStorage), no mesmo molde do tema.tsx.
// Para ligar um botão: chame alternarModo() no clique e leia o modo de agora com useModo() (o seletor está em alternador.tsx).
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { iniciarTransicao, podeAnimar } from './transicao'

export type Modo = 'fluxo' | 'arvore'

const CHAVE = 'keg-modo'
const MODOS: Modo[] = ['fluxo', 'arvore']

const observadores = new Set<() => void>()
let atual: Modo = lerModo()

function lerModo(): Modo {
  try {
    const gravado = localStorage.getItem(CHAVE)
    return MODOS.find(modo => modo === gravado) ?? 'fluxo'
  } catch {
    return 'fluxo'
  }
}

// Verdadeiro da troca até o fim da animação: o diff (Shiki) é a parte cara de montar e, dentro do flushSync, travava a
// segunda foto da transição por ~500 ms. Quem é pesado espera a animação acabar (ver DiffDosTrechos).
let trocando = false
let transicao: ViewTransition | undefined

function aplicarTroca(comAnimacao: boolean) {
  atual = atual === 'fluxo' ? 'arvore' : 'fluxo'
  try {
    localStorage.setItem(CHAVE, atual)
  } catch {}
  trocando = comAnimacao
  avisar()
}

function avisar() {
  for (const observador of observadores) observador()
}

// A única porta de troca: o atalho v, o seletor e as setas passam por aqui. Com View Transitions, o navegador fotografa a tela,
// espera a troca e mistura as duas (o CSS está em estilo/alternador.css). O flushSync faz o React aplicar a troca dentro do
// callback, antes da segunda foto. Sem a API ou com movimento reduzido, troca direto (ver transicao.ts, que também cuida de
// pular a transição anterior, inclusive a do recolher da lateral).
// O modo novo é calculado dentro da troca: duas teclas seguidas alternam duas vezes, em vez de repetir o mesmo destino.
export function alternarModo() {
  if (!podeAnimar()) return flushSync(() => aplicarTroca(false))
  const nova = iniciarTransicao('modo', () => flushSync(() => aplicarTroca(true)))
  transicao = nova
  const terminar = () => {
    if (transicao !== nova) return
    transicao = undefined
    trocando = false
    avisar()
  }
  nova.finished.then(terminar, terminar)
}

export function useModo(): Modo {
  return useSyncExternalStore(assinar, () => atual)
}

export function useTrocando(): boolean {
  return useSyncExternalStore(assinar, () => trocando)
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}
