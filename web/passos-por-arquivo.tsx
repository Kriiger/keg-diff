// Os passos do fluxo agrupados por arquivo e desenhados como o modo árvore (arvore.tsx): o arquivo é um nó com seta e ícone e os
// passos dele são os filhos, com o mesmo recuo e as mesmas linhas-guia (as classes vêm de arvore.css). A ordem do fluxo manda:
// voltar a um arquivo abre outro grupo dele, e o número do passo diz a sequência de um grupo ao outro.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Estado, Fluxo, Passo, Revisao } from '../src/contrato'
import { Caminho } from './caminho'
import { Icone } from './icones'
import { agruparPassos, type GrupoDePassos } from './resumo'
import { marcador } from './telas'

const NIVEL_DO_ARQUIVO = { '--nivel': 0 } as CSSProperties
const NIVEL_DO_PASSO = { '--nivel': 1 } as CSSProperties

interface PropsDosPassos {
  fluxo: Fluxo
  revisao: Revisao
  estado: Estado
  indice: number
  escolher: (indice: number) => void
}

// Cada grupo se identifica pelo índice do seu primeiro passo (o mesmo arquivo pode aparecer em vários grupos).
const inicioDe = (grupo: GrupoDePassos) => grupo.passos[0]!.indice

export function PassosPorArquivo({ fluxo, revisao, estado, indice, escolher }: PropsDosPassos) {
  const grupos = useMemo(() => agruparPassos(fluxo, revisao), [fluxo, revisao])
  const [fechados, setFechados] = useState(new Set<number>())
  // Chegar a um passo de grupo recolhido (j, k ou o mapa) reabre o grupo, como a árvore reabre as pastas que escondem o arquivo.
  useEffect(() => {
    const dono = grupos.find(grupo => grupo.passos.some(p => p.indice === indice))
    if (dono && fechados.has(inicioDe(dono))) setFechados(antes => new Set([...antes].filter(i => i !== inicioDe(dono))))
  }, [indice])
  const alternar = (inicio: number) => setFechados(antes => {
    const depois = new Set(antes)
    if (!depois.delete(inicio)) depois.add(inicio)
    return depois
  })
  return (
    <ul className="arvore passos-por-arquivo">
      {grupos.map(grupo => <GrupoDoArquivo key={inicioDe(grupo)} grupo={grupo} aberto={!fechados.has(inicioDe(grupo))} alternar={alternar} estado={estado} indice={indice} escolher={escolher} />)}
    </ul>
  )
}

interface PropsDoGrupo extends Pick<PropsDosPassos, 'estado' | 'indice' | 'escolher'> {
  grupo: GrupoDePassos
  aberto: boolean
  alternar: (inicio: number) => void
}

function GrupoDoArquivo({ grupo, aberto, alternar, estado, indice, escolher }: PropsDoGrupo) {
  const hunkIds = grupo.passos.flatMap(({ passo }) => passo.hunkIds)
  return (
    <li>
      <button className="linha-da-arvore grupo-do-arquivo" style={NIVEL_DO_ARQUIVO} aria-expanded={aberto} onClick={() => alternar(inicioDe(grupo))} title={grupo.arquivo}>
        <Icone nome="chevron" classe={aberto ? 'seta aberta' : 'seta'} />
        <Icone nome="arquivo" />
        <span className="rotulo"><Caminho caminho={grupo.arquivo} /></span>
        {grupo.lado && <span className="lado-do-arquivo">{grupo.lado}</span>}
        <span className="marcador">{hunkIds.length === 0 ? '○' : marcador(hunkIds, estado)}</span>
      </button>
      {aberto && (
        <ul style={NIVEL_DO_ARQUIVO}>
          {grupo.passos.map(({ passo, indice: i }) => (
            <li key={passo.id}>
              <button className={`passo-da-linha papel-${passo.papel} ${i === indice ? 'atual' : ''}`} style={NIVEL_DO_PASSO} aria-current={i === indice ? 'step' : undefined} onClick={() => escolher(i)}>
                <span className="marcador">{marcadorDoPasso(passo, estado)}</span>
                <span className="papel"><span className="ordem">{i + 1}</span>{passo.papel}</span>
                <span className="simbolo">{passo.simbolo}</span>
                <span className="local">linha {passo.linhas[0]}</span>
                {passo.fronteira && <span className="fronteira">⇄ {passo.fronteira}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function marcadorDoPasso(passo: Passo, estado: Estado): string {
  return passo.hunkIds.length === 0 ? '○' : marcador(passo.hunkIds, estado)
}
