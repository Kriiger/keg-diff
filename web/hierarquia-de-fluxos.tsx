// A lista de fluxos da lateral com a hierarquia: o passo que vários fluxos dividem vira um nó recolhível, desenhado como o modo árvore
// (arvore.css: mesmo recuo, mesmas linhas-guia, mesma seta), e cada fluxo fica embaixo dele só com o que é seu. Sem passo dividido,
// devolve as linhas soltas, como eram antes da hierarquia.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Estado } from '../src/contrato'
import { Icone } from './icones'
import { gruposAteOFluxo, temGrupo, type FluxoDaLista, type GrupoDeFluxos, type NoDaHierarquia } from './hierarquia'
import { nomesCurtos, plural } from './resumo'
import { marcador } from './telas'

interface PropsDaHierarquia {
  nos: NoDaHierarquia[]
  estado: Estado
  endereco: string
  todos: string[]
  linha: (item: FluxoDaLista, nivel?: number) => ReactNode
}

export function HierarquiaDeFluxos(props: PropsDaHierarquia) {
  const { nos, endereco } = props
  const [fechados, setFechados] = useState(new Set<string>())
  // Reabre o caminho até o fluxo só quando o fluxo aberto MUDA. Reabrir a cada render desfaria o recolher de um nó que contém o fluxo
  // atual: o clique na seta recolheria e o efeito reabriria na hora.
  const fluxoAnterior = useRef<string>(undefined)
  useEffect(() => {
    const fluxoId = endereco.startsWith('fluxo/') ? endereco.slice('fluxo/'.length) : undefined
    if (fluxoId === fluxoAnterior.current) return
    fluxoAnterior.current = fluxoId
    const doFluxo = fluxoId ? gruposAteOFluxo(nos, fluxoId) : []
    if (doFluxo.some(chave => fechados.has(chave))) setFechados(antes => new Set([...antes].filter(chave => !doFluxo.includes(chave))))
  }, [endereco])
  const alternar = (chave: string) => setFechados(antes => {
    const depois = new Set(antes)
    if (!depois.delete(chave)) depois.add(chave)
    return depois
  })
  if (!temGrupo(nos)) return <>{nos.map(no => no.tipo === 'fluxo' && props.linha(no.item))}</>
  return <ul className="arvore hierarquia"><Ramo {...props} nivel={0} fechados={fechados} alternar={alternar} /></ul>
}

type Comum = Omit<PropsDaHierarquia, 'nos'> & { fechados: Set<string>; alternar: (chave: string) => void }

function Ramo({ nos, nivel, ...resto }: Comum & { nos: NoDaHierarquia[]; nivel: number }) {
  return nos.map(no => (no.tipo === 'fluxo' ? <li key={no.item.fluxo.id}>{resto.linha(no.item, nivel)}</li> : <NoDoGrupo key={no.chave} {...resto} no={no} nivel={nivel} />))
}

function NoDoGrupo({ no, nivel, ...resto }: Comum & { no: GrupoDeFluxos; nivel: number }) {
  const { fechados, alternar, estado, todos } = resto
  const recuo = { '--nivel': nivel } as CSSProperties
  const aberto = !fechados.has(no.chave)
  const simbolos = no.passos.map(passo => passo.simbolo).join(' → ')
  const arquivos = [...new Set(no.passos.map(passo => passo.arquivo))]
  const nomes = nomesCurtos(arquivos, todos).join(' · ')
  const hunkIds = [...new Set(no.passos.flatMap(passo => passo.hunkIds))]
  const primeiro = no.passos[0]!
  return (
    <li>
      <div className="linha-da-arvore no-do-grupo" style={recuo}>
        <button type="button" className="alternar-do-grupo" aria-expanded={aberto} aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${simbolos}`} onClick={() => alternar(no.chave)}>
          <Icone nome="chevron" classe={aberto ? 'seta aberta' : 'seta'} />
        </button>
        <a href={`#fluxo/${no.primeiro.fluxo.id}/${primeiro.id}`} className="rotulo" title={`${simbolos} em ${arquivos.join(', ')}: o começo de ${plural(no.total, 'fluxo', 'fluxos')}`}>
          <span className="simbolo-do-grupo">{simbolos}</span> <span className="arquivo-do-grupo">{nomes}</span>
        </a>
        <span className="total-do-grupo">{plural(no.total, 'fluxo', 'fluxos')}</span>
        <span className="marcador">{hunkIds.length === 0 ? '○' : marcador(hunkIds, estado)}</span>
      </div>
      {aberto && <ul style={recuo}><Ramo {...resto} nos={no.filhos} nivel={nivel + 1} /></ul>}
    </li>
  )
}
