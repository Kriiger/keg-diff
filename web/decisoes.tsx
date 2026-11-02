// Os botões de decisão de um passo ou item, e a caixa de comentário.
import { useState } from 'react'
import type { Estado } from '../src/contrato'
import type { Decidir, Decisao } from './main'

const NOMES: Record<Decisao, string> = { revisado: 'Revisado', 'codigo-morto': 'Código morto', 'falso-positivo': 'Falso positivo', comentado: 'Comentado' }
const TECLAS: Record<Decisao, string> = { revisado: 'x', 'codigo-morto': 'd', 'falso-positivo': 'f', comentado: 'c' }

interface PropsDasDecisoes {
  hunkIds: string[]
  opcoes: readonly Decisao[]
  estado: Estado
  decidir: Decidir
  comentando: boolean
  setComentando: (comentando: boolean) => void
}

export function Decisoes({ hunkIds, opcoes, estado, decidir, comentando, setComentando }: PropsDasDecisoes) {
  if (hunkIds.length === 0) return null
  const decisoes = hunkIds.map(id => estado[id])
  // A marca (revisado, código morto, falso positivo) e o comentário são independentes: 'comentado' sozinho não é marca.
  const marcas = decisoes.map(d => (d?.decisao === 'comentado' ? undefined : d?.decisao))
  const marca = marcas.every(m => m === marcas[0]) ? marcas[0] : undefined
  const comentario = decisoes.find(d => d?.comentario)?.comentario
  const salvar = (texto: string) => {
    // Texto vazio apaga o comentário que havia; sem comentário anterior, só fecha a caixa.
    if (texto.trim() !== '' || comentario) decidir(hunkIds, 'comentado', texto.trim())
    setComentando(false)
  }
  return (
    <div className="decisoes">
      <div className="botoes">
        {opcoes.map(opcao => (
          <button key={opcao} className={marca === opcao ? 'ativa' : ''} onClick={() => decidir(hunkIds, marca === opcao ? null : opcao)}>
            {NOMES[opcao]} <kbd>{TECLAS[opcao]}</kbd>
          </button>
        ))}
        <button className={comentario ? 'ativa' : ''} onClick={() => setComentando(true)}>
          {comentario ? 'Editar comentário' : 'Comentar'} <kbd>c</kbd>
        </button>
      </div>
      {comentando && <CaixaDeComentario inicial={comentario ?? ''} salvar={salvar} cancelar={() => setComentando(false)} />}
      {!comentando && comentario && <blockquote>{comentario}</blockquote>}
    </div>
  )
}

function CaixaDeComentario({ inicial, salvar, cancelar }: { inicial: string; salvar: (texto: string) => void; cancelar: () => void }) {
  const [texto, setTexto] = useState(inicial)
  return (
    <div className="comentario">
      <textarea
        autoFocus value={texto} placeholder="O que o agente precisa ajustar aqui?" onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') cancelar()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) salvar(texto)
        }}
      />
      <div className="botoes">
        <button className="ativa" onClick={() => salvar(texto)}>Salvar <kbd>⌘↵</kbd></button>
        <button onClick={cancelar}>Cancelar <kbd>esc</kbd></button>
      </div>
    </div>
  )
}
