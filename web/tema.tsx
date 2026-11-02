// O tema da página: Sistema, Claro ou Escuro. A escolha fica só neste navegador (localStorage) e vira o atributo
// data-tema no <html>; sem atributo, vale o que o sistema pede. O script do index.html aplica o mesmo atributo
// antes da primeira pintura, para a página não piscar clara antes de ficar escura.
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { iniciarTransicao, podeAnimar } from './transicao'

export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'keg-tema'
const ORDEM: Tema[] = ['sistema', 'claro', 'escuro']
const ROTULOS: Record<Tema, string> = { sistema: 'Sistema', claro: 'Claro', escuro: 'Escuro' }
// O que o diff (themeType) e o mapa (colorMode) entendem: o mesmo vocabulário, em inglês.
export const MODOS = { sistema: 'system', claro: 'light', escuro: 'dark' } as const

const observadores = new Set<() => void>()
let atual: Tema = lerTema()
aplicar(atual)

function lerTema(): Tema {
  try {
    const gravado = localStorage.getItem(CHAVE)
    return ORDEM.find(tema => tema === gravado) ?? 'sistema'
  } catch {
    return 'sistema'
  }
}

function aplicar(tema: Tema) {
  if (tema === 'sistema') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = tema
}

// Outra aba (o mapa em outra janela, por exemplo) trocou o tema: esta acompanha.
addEventListener('storage', e => {
  if (e.key !== CHAVE) return
  atual = lerTema()
  aplicar(atual)
  for (const observador of observadores) observador()
})

// A troca de tema é um crossfade da tela inteira (View Transition, composto pela GPU): sem ela, cada elemento animaria a própria cor.
// O tema novo é calculado dentro da troca, como em modo.ts: duas teclas seguidas avançam duas vezes. O flushSync faz o diff e o mapa
// (que leem useTema) já estarem no tema novo na segunda foto.
export function ciclarTema() {
  const trocar = () => {
    atual = ORDEM[(ORDEM.indexOf(atual) + 1) % ORDEM.length]!
    aplicar(atual)
    try {
      localStorage.setItem(CHAVE, atual)
    } catch {}
    for (const observador of observadores) observador()
  }
  if (!podeAnimar()) return trocar()
  iniciarTransicao('tema', () => flushSync(trocar))
}

export function useTema(): Tema {
  return useSyncExternalStore(assinar, () => atual)
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}

const ICONES = {
  sistema: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  claro: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  escuro: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />,
}

// Um botão que cicla, com o ícone e o rótulo do estado de agora ("Tema: Escuro"); o title diz para onde o clique leva.
// O prefixo "Tema:" some nas telas estreitas (estilo/lateral.css), onde o nome e o ícone bastam.
export function BotaoDoTema() {
  const tema = useTema()
  const proximo = ORDEM[(ORDEM.indexOf(tema) + 1) % ORDEM.length]!
  return (
    <button onClick={ciclarTema} title={`Tema: ${ROTULOS[tema]}. Próximo: ${ROTULOS[proximo]}.`} aria-label={`Tema: ${ROTULOS[tema]}. Trocar para ${ROTULOS[proximo]}.`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONES[tema]}
      </svg>
      <span className="prefixo">Tema: </span>{ROTULOS[tema]} <kbd>a</kbd>
    </button>
  )
}
