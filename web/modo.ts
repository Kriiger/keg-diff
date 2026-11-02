// O modo de visualização: "fluxo" (o diff reorganizado em nasce → processa → termina) ou "arvore" (pastas e arquivos,
// como o GitHub mostra). A escolha fica só neste navegador (localStorage), no mesmo molde do tema.tsx.
// Para ligar um botão: chame alternarModo() no clique e leia o modo de agora com useModo().
import { useSyncExternalStore } from 'react'

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

export function alternarModo() {
  atual = atual === 'fluxo' ? 'arvore' : 'fluxo'
  try {
    localStorage.setItem(CHAVE, atual)
  } catch {}
  for (const observador of observadores) observador()
}

export function useModo(): Modo {
  return useSyncExternalStore(assinar, () => atual)
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}
