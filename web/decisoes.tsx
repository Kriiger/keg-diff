// Os botões de decisão de um passo ou item, e a caixa de comentário.
import { useEffect, useRef, useState } from 'react'
import type { Estado, TipoDoComentario } from '../src/contrato'
import type { Decidir, Decisao } from './main'

const NOMES: Record<Decisao, string> = { revisado: 'Revisado', 'codigo-morto': 'Código morto', 'falso-positivo': 'Falso positivo', comentado: 'Comentado' }
const TECLAS: Record<Decisao, string> = { revisado: 'x', 'codigo-morto': 'd', 'falso-positivo': 'f', comentado: 'c' }
export const TIPOS: Record<TipoDoComentario, string> = { corrija: 'Corrija', duvida: 'Dúvida' }

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
  const comentado = decisoes.find(d => d?.comentario)
  const comentario = comentado?.comentario
  // Sem tipo gravado (estado.json antigo), o comentário é uma correção.
  const tipo = comentado?.tipoDoComentario ?? 'corrija'
  const salvar = (texto: string, tipoEscolhido: TipoDoComentario) => {
    // Texto vazio apaga o comentário que havia (e o tipo com ele); sem comentário anterior, só fecha a caixa.
    if (texto.trim() !== '' || comentario) decidir(hunkIds, 'comentado', texto.trim(), tipoEscolhido)
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
      {comentando && <CaixaDeComentario inicial={comentario ?? ''} tipoInicial={tipo} salvar={salvar} cancelar={() => setComentando(false)} />}
      {!comentando && comentario && <blockquote><span className="tipo-do-comentario">{TIPOS[tipo]}</span>{comentario}</blockquote>}
    </div>
  )
}

// Também é a caixa do comentário de linha, que mora dentro do diff (comentarios-de-linha.tsx).
export function CaixaDeComentario({ inicial, tipoInicial, salvar, cancelar }: { inicial: string; tipoInicial: TipoDoComentario; salvar: (texto: string, tipo: TipoDoComentario) => void; cancelar: () => void }) {
  const [texto, setTexto] = useState(inicial)
  const [tipo, setTipo] = useState(tipoInicial)
  // Dentro do diff a caixa nasce antes da linha dela existir (o diff desenha depois do React): um autoFocus só falharia, então
  // tenta de novo a cada quadro até pegar (no máximo 40, uns 0,6 s).
  const campo = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    let quadro = 0
    let tentativas = 0
    const focar = () => {
      campo.current?.focus()
      if (campo.current && document.activeElement !== campo.current && ++tentativas < 40) quadro = requestAnimationFrame(focar)
    }
    focar()
    return () => cancelAnimationFrame(quadro)
  }, [])
  const alternar = () => setTipo(atual => (atual === 'corrija' ? 'duvida' : 'corrija'))
  return (
    <div className="comentario">
      <div className="botoes tipos" role="group" aria-label="Tipo do comentário">
        {(Object.keys(TIPOS) as TipoDoComentario[]).map(opcao => (
          <button key={opcao} type="button" className={tipo === opcao ? 'ativa' : ''} aria-pressed={tipo === opcao} onClick={() => setTipo(opcao)}>{TIPOS[opcao]}</button>
        ))}
        <span className="detalhe"><kbd>⌥D</kbd> alterna</span>
      </div>
      <textarea
        ref={campo} value={texto} placeholder={tipo === 'duvida' ? 'O que o agente precisa responder aqui?' : 'O que o agente precisa ajustar aqui?'} onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') cancelar()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) salvar(texto, tipo)
          // ⌥D troca o tipo sem sair da caixa; o code evita o "∂" que o Option+D digita no Mac. Tab fica livre para navegar.
          if (e.altKey && e.code === 'KeyD') {
            e.preventDefault()
            alternar()
          }
        }}
      />
      <div className="botoes">
        <button className="ativa" onClick={() => salvar(texto, tipo)}>Salvar <kbd>⌘↵</kbd></button>
        <button onClick={cancelar}>Cancelar <kbd>esc</kbd></button>
      </div>
    </div>
  )
}
