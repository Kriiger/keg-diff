// A conexão da página com o servidor (SSE). Sozinho, o navegador reconecta a cada poucos segundos para sempre,
// e cada tentativa com o servidor desligado vira um ERR_CONNECTION_REFUSED no console. Aqui a página assume a
// espera: tentativas cada vez mais espaçadas, nenhuma com a aba escondida, e um aviso de "servidor desligado".
import { useSyncExternalStore } from 'react'

const ESPERAS_EM_MS = [2000, 5000, 10000, 20000, 30000]
const EVENTOS = ['revisao', 'narrador']

const acoes = new Map<string, Set<() => void>>()
const observadores = new Set<() => void>()
let fonte: EventSource | undefined
let desligado = false
let tentativas = 0
let temporizador: number | undefined

// "open" vale na primeira conexão e em cada volta do servidor. Quem escuta depois da conexão aberta é avisado já.
export function escutar(evento: string, acao: () => void): () => void {
  if (!fonte) conectar()
  const grupo = acoes.get(evento) ?? new Set()
  acoes.set(evento, grupo.add(acao))
  if (evento === 'open' && fonte?.readyState === EventSource.OPEN) acao()
  return () => void grupo.delete(acao)
}

export function useServidorDesligado(): boolean {
  return useSyncExternalStore(assinar, () => desligado)
}

// O botão "Tentar agora": recomeça a contagem das esperas.
export function reconectar() {
  tentativas = 0
  conectar()
}

function conectar() {
  clearTimeout(temporizador)
  fonte?.close()
  const nova = new EventSource('/api/eventos')
  fonte = nova
  nova.onopen = () => {
    tentativas = 0
    mudar(false)
    disparar('open')
  }
  nova.onerror = () => {
    nova.close()
    mudar(true)
    esperar()
  }
  for (const evento of EVENTOS) nova.addEventListener(evento, () => disparar(evento))
}

function esperar() {
  // Com a aba escondida ninguém está olhando: a tentativa fica para quando ela voltar ao foco.
  if (document.hidden) return
  temporizador = window.setTimeout(conectar, ESPERAS_EM_MS[Math.min(tentativas++, ESPERAS_EM_MS.length - 1)])
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && desligado) conectar()
})

function disparar(evento: string) {
  for (const acao of acoes.get(evento) ?? []) acao()
}

function mudar(valor: boolean) {
  if (desligado === valor) return
  desligado = valor
  for (const observador of observadores) observador()
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}
