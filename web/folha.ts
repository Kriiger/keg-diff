// A folha "ver arquivo completo": o pedido que a abre (o arquivo e o bloco a marcar) e se está aberta. Qualquer tela pede por aqui
// (o botão do passo, o do trecho da árvore, o clique no mapa) e a folha mora na raiz da página (folha-do-arquivo.tsx), acima de tudo.
// No mesmo molde do tema.tsx e do modo.ts. Um pedido por vez: a folha cobre a página e a deixa inerte, então não há outro botão para apertar.
import { useSyncExternalStore } from 'react'

export interface PedidoDaFolha {
  arquivo: string
  titulo?: string                  // o símbolo, quando o bloco é um passo ou um bloco do mapa
  linhas?: [number, number]        // o bloco a marcar e levar à vista, no arquivo de chegada do diff
  // O que a tela de origem faz além de mostrar o arquivo (o botão do cabeçalho da folha): no mapa, ir ao passo e abrir os vizinhos do bloco.
  acao?: { rotulo: string; executar: () => void }
}

const observadores = new Set<() => void>()
let atual: PedidoDaFolha | undefined
// Quem tinha o foco ao abrir: a folha devolve o foco a ele ao fechar.
let origem: Element | null = null

export function abrirFolha(pedido: PedidoDaFolha) {
  origem = document.activeElement
  atual = pedido
  avisar()
}

export function fecharFolha() {
  if (!atual) return
  atual = undefined
  avisar()
}

// A folha chama depois de tirar a página do estado inerte (um elemento inerte não aceita foco): o foco volta a quem abriu.
export function devolverFoco() {
  if (origem instanceof HTMLElement && origem.isConnected) origem.focus({ preventScroll: true })
  origem = null
}

// Os atalhos de uma letra (telas.tsx, enquadramento.tsx) não agem na página que está por baixo enquanto a folha está aberta.
export function folhaAberta(): boolean {
  return atual !== undefined
}

export function useFolha(): PedidoDaFolha | undefined {
  return useSyncExternalStore(assinar, () => atual)
}

function avisar() {
  for (const observador of observadores) observador()
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}
