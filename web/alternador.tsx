// O seletor de modo no canto superior direito: uma pílula com dois rótulos e um polegar sólido que desliza até o lado ativo.
// É um radiogroup: Tab entra no rótulo ativo e as setas passam para o outro (com dois, qualquer seta alterna). O clique,
// as setas e o atalho v chamam a mesma alternarModo, que cuida da transição.
import type { KeyboardEvent, ReactNode } from 'react'
import { alternarModo, useModo, type Modo } from './modo'

const OPCOES: { modo: Modo; rotulo: string; icone: ReactNode }[] = [
  { modo: 'fluxo', rotulo: 'Fluxo', icone: <path d="M3 12h6l4-6h8M9 12l4 6h8" /> },
  {
    modo: 'arvore', rotulo: 'Árvore',
    icone: <><rect x="3" y="3" width="7" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="4" rx="1.5" /><rect x="13" y="17" width="8" height="4" rx="1.5" /><path d="M6 8v11M6 12h7M6 19h7" /></>,
  },
]
const SETAS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

export function AlternadorDeModo() {
  const modo = useModo()
  // O foco vai para o rótulo que ainda não está marcado, o que a troca vai marcar; ele já tem tabIndex -1, mas aceita foco por código.
  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (!SETAS.has(evento.key)) return
    evento.preventDefault()
    alternarModo()
    evento.currentTarget.querySelector<HTMLElement>('[aria-checked="false"]')?.focus()
  }
  return (
    <div className="alternador" role="radiogroup" aria-label="Modo de visualização" data-modo={modo} onKeyDown={aoTeclar}>
      <span className="polegar" aria-hidden="true" />
      {OPCOES.map(({ modo: opcao, rotulo, icone }) => (
        <button key={opcao} type="button" role="radio" aria-checked={opcao === modo} tabIndex={opcao === modo ? 0 : -1} title={`Modo ${rotulo} (a tecla v alterna)`} onClick={() => opcao !== modo && alternarModo()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icone}</svg>
          {rotulo}
        </button>
      ))}
    </div>
  )
}
