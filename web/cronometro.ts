// O cronômetro da revisão: conta os segundos em que a aba está à vista, até a cobertura chegar a 100%.
// O total mora no servidor (.revisao/sessao.json), então recarregar a página, abrir em outro navegador ou
// reiniciar o keg diff no meio da revisão não zera nada. É dele que sai o tempo do historico.jsonl.
import { useEffect, useRef } from 'react'
import { escutar } from './eventos'

// Perde no máximo isto se o navegador morrer de repente; fechar a aba envia na hora.
const ENVIO_A_CADA_SEGUNDOS = 15

interface TempoDoServidor { id: string; segundos: number }

// "5 min 12 s": o tempo da revisão como a pessoa lê.
export function formatarTempo(segundos: number): string {
  if (segundos < 60) return `${segundos} s`
  return `${Math.floor(segundos / 60)} min ${String(segundos % 60).padStart(2, '0')} s`
}

// Devolve uma função que lê os segundos contados até agora.
export function useCronometro(completa: boolean): () => number {
  const contados = useRef(0)
  const enviados = useRef(0)
  const sessao = useRef<string | undefined>(undefined)

  const aplicar = ({ id, segundos }: TempoDoServidor) => {
    // Primeira leitura: o que o servidor já tinha soma ao que contei desde que a página abriu.
    // Sessão diferente (o keg diff foi reiniciado): vale o número do servidor. A mesma sessão: o maior.
    if (sessao.current === undefined) contados.current += segundos
    else if (id !== sessao.current) contados.current = segundos
    else contados.current = Math.max(contados.current, segundos)
    sessao.current = id
    enviados.current = segundos
  }
  const enviar = () => {
    fetch('/api/sessao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ segundos: contados.current }), keepalive: true })
      .then(r => r.json())
      .then(aplicar)
      .catch(() => {})
  }

  useEffect(() => escutar('open', () => {
    fetch('/api/sessao').then(r => r.json()).then(aplicar).catch(() => {})
  }), [])

  useEffect(() => {
    if (completa) return
    const tique = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      contados.current++
      if (contados.current - enviados.current >= ENVIO_A_CADA_SEGUNDOS) enviar()
    }, 1000)
    const aoEsconder = () => document.visibilityState === 'hidden' && enviar()
    addEventListener('visibilitychange', aoEsconder)
    addEventListener('pagehide', enviar)
    return () => {
      clearInterval(tique)
      removeEventListener('visibilitychange', aoEsconder)
      removeEventListener('pagehide', enviar)
    }
  }, [completa])

  return () => contados.current
}
