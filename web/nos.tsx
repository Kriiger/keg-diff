// Os blocos do mapa: o cartão de cada função, a faixa da fronteira cliente/servidor e a montagem dos nós do React Flow.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { createContext, useContext } from 'react'
import { Caminho } from './caminho'
import type { Destaque, Relacao } from './foco'
import { ALTURA, LARGURA, type Desenho } from './rotas'
import type { Grafo, NoDoGrafo } from '../src/contrato'

export const LARGURA_DA_FAIXA = 44

interface DadosDoNo extends Record<string, unknown> { no: NoDoGrafo; atual: boolean; escondidos: number }
type NoDoMapa = Node<DadosDoNo, 'no'>
type NoDaFaixa = Node<{ rotulo: string; altura: number }, 'faixa'>

// O destaque viaja por contexto e não pelos dados do nó: o React Flow só mede um nó uma vez, e um objeto de nó novo a cada passada
// do mouse apagaria a medida, esconderia o bloco até medir de novo (o clique caía no vazio) e reenquadraria o mapa.
export const DestaqueDoMapa = createContext<Destaque | undefined>(undefined)

// O texto garante que o destaque não dependa da cor: cada bloco ligado ao foco diz o que é dele.
const RELACOES: Record<Relacao, { texto: string; dica: string }> = {
  foco: { texto: 'em foco', dica: 'o bloco que você está apontando' },
  chama: { texto: 'chama', dica: 'chama o bloco em foco' },
  chamado: { texto: 'chamado', dica: 'é chamado pelo bloco em foco' },
  ambos: { texto: 'ida e volta', dica: 'chama o bloco em foco e também é chamado por ele' },
  origem: { texto: 'origem', dica: 'de onde a ligação em foco sai' },
  destino: { texto: 'destino', dica: 'aonde a ligação em foco chega' },
}

function CartaoDoNo({ id, data }: NodeProps<NoDoMapa>) {
  const { no, atual, escondidos } = data
  const destaque = useContext(DestaqueDoMapa)
  const relacao = destaque?.nos.get(id)
  // O bloco isolado por clique diz "fixado": o anel do passo atual (posição na revisão) é outro, a barra à esquerda.
  const textoDaRelacao = relacao === 'foco' && destaque?.fixo ? 'fixado' : relacao && RELACOES[relacao].texto
  const apagado = destaque !== undefined && relacao === undefined
  const classes = ['no-do-mapa', `papel-${no.papel}`, no.hunkIds.length > 0 ? 'alterado' : 'vizinho', atual && 'atual', relacao && `relacao-${relacao}`, apagado && 'apagado']
  return (
    <div className={classes.filter(Boolean).join(' ')} title={`${atual ? 'Passo atual · ' : ''}${no.arquivo}:${no.linhas[0]}–${no.linhas[1]}`}>
      <Handle type="target" position={Position.Left} />
      <span className="topo">
        <span className="papel">{no.papel}{no.lado && <span className="lado"> · {no.lado}</span>}</span>
        {relacao && <span className="relacao" title={RELACOES[relacao].dica}>{textoDaRelacao}</span>}
        {escondidos > 0 && <span className="mais" title="vizinhos escondidos: clique para mostrar">+{escondidos}</span>}
      </span>
      <span className="simbolo">{no.simbolo}</span>
      <span className="local"><Caminho caminho={no.arquivo} />:{no.linhas[0]}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

// A faixa é a fronteira cliente/servidor: fica no vão entre quem chama de um lado e quem recebe do outro.
function FaixaDaFronteira({ data }: NodeProps<NoDaFaixa>) {
  return <div className="faixa-da-fronteira" style={{ height: data.altura }}><span>{data.rotulo}</span></div>
}

export const TIPOS_DE_NO = { no: CartaoDoNo, faixa: FaixaDaFronteira }

export function montarNos(grafo: Grafo, desenho: Desenho, atual: string): (NoDoMapa | NoDaFaixa)[] {
  const porId = new Map(grafo.nos.map(no => [no.id, no]))
  // O que o grafo sabe do nó e a tela não mostra: vizinhos escondidos, mais os que o corte do motor deixou de fora.
  const escondidos = (no: NoDoGrafo) => {
    const vizinhos = new Set<string>()
    for (const { de, para } of grafo.arestas) {
      if (de === no.id) vizinhos.add(para)
      if (para === no.id) vizinhos.add(de)
    }
    return [...vizinhos].filter(id => !desenho.visiveis.has(id)).length + (no.mais ?? 0)
  }
  const desenhados = [...desenho.visiveis].map((id): NoDoMapa => {
    const no = porId.get(id)!
    return {
      id, type: 'no', position: desenho.posicoes.get(id) ?? { x: 0, y: 0 },
      data: { no, atual: id === atual, escondidos: escondidos(no) },
      sourcePosition: Position.Right, targetPosition: Position.Left, ariaLabel: `${no.simbolo}, ${no.papel}, ${no.arquivo} linha ${no.linhas[0]}`,
    }
  })
  return [...faixaDaFronteira(desenho, porId), ...desenhados]
}

// Uma faixa só, no vão entre tudo o que chama de um lado e tudo o que recebe do outro: várias faixas
// (uma por camada do ELK) poluem o desenho. O lado só vale quando o motor o sabe.
function faixaDaFronteira({ arestas, posicoes }: Desenho, porId: Map<string, NoDoGrafo>): NoDaFaixa[] {
  const cruzamentos = arestas.flatMap(({ de, para }) => {
    const pontas = [de, para].map(id => ({ x: posicoes.get(id)?.x ?? 0, lado: porId.get(id)?.lado }))
    const [esquerda, direita] = pontas.sort((p, q) => p.x - q.x)
    return esquerda?.lado && direita?.lado && esquerda.lado !== direita.lado ? [{ esquerda, direita }] : []
  })
  const primeiro = cruzamentos[0]
  if (!primeiro) return []
  const ys = [...posicoes.values()].map(p => p.y)
  const topo = Math.min(...ys) - 40
  const fimDaEsquerda = Math.max(...cruzamentos.map(c => c.esquerda.x)) + LARGURA
  const comecoDaDireita = Math.min(...cruzamentos.map(c => c.direita.x))
  return [{
    id: 'faixa', type: 'faixa', position: { x: Math.round((fimDaEsquerda + comecoDaDireita - LARGURA_DA_FAIXA) / 2), y: topo },
    data: { rotulo: `${primeiro.esquerda.lado} | ${primeiro.direita.lado}`, altura: Math.max(...ys) + ALTURA + 80 - topo },
    draggable: false, selectable: false, focusable: false, zIndex: -1, style: { pointerEvents: 'none' },
  }]
}
