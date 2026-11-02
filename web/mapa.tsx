// Tela Mapa: "quem chama isso?" sem sair da revisão. O React Flow desenha, o ELK dá as camadas
// (fonte à esquerda, saída à direita) e o grafo vem pronto no review.json: aqui não há compilador.
import '@xyflow/react/dist/style.css'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { useEffect, useMemo, useState } from 'react'
import { idDoNo, type ArestaDoGrafo, type Fluxo, type Grafo, type NoDoGrafo, type Revisao } from '../src/contrato'

const LARGURA = 232
const ALTURA = 72
const LARGURA_DA_FAIXA = 44
// Abaixo disso o texto do nó fica miúdo demais: num grafo largo, o fitView para aqui e quem lê arrasta o desenho.
const ZOOM_LEGIVEL = 0.75
const ROTULOS: Partial<Record<ArestaDoGrafo['tipo'], string>> = { http: 'http', dinamico: 'dinâmico' }
const OPCOES_DO_ELK = {
  'elk.algorithm': 'layered', 'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90', 'elk.spacing.nodeNode': '28',
}

// O ELK sem worker: o bundle já traz o algoritmo, e a página não precisa de um segundo arquivo para carregar.
const elk = new ELK()

interface DadosDoNo extends Record<string, unknown> { no: NoDoGrafo; atual: boolean; escondidos: number }
type NoDoMapa = Node<DadosDoNo, 'no'>
type NoDaFaixa = Node<{ rotulo: string; altura: number }, 'faixa'>
type Posicoes = Map<string, { x: number; y: number }>
// O que o ELK desenhou: a chave diz quais nós e arestas entraram, para o desenho antigo ficar até o novo chegar.
interface Desenho { chave: string; posicoes: Posicoes; visiveis: Set<string>; arestas: ArestaDoGrafo[] }

interface PropsDoMapa {
  revisao: Revisao
  fluxo: Fluxo
  indice: number
  irParaPasso: (indice: number) => void
  fechar: () => void
}

export default function Mapa({ revisao, fluxo, indice, irParaPasso, fechar }: PropsDoMapa) {
  const [abertos, setAbertos] = useState(new Set<string>())
  const [desenho, setDesenho] = useState<Desenho>()
  const grafo = revisao.grafo
  const atual = idDoNo(fluxo.passos[indice] ?? fluxo.passos[0]!)
  const visiveis = useMemo(() => (grafo ? idsVisiveis(grafo, fluxo, abertos, atual) : new Set<string>()), [grafo, fluxo, abertos, atual])
  const arestas = useMemo(() => (grafo?.arestas ?? []).filter(a => visiveis.has(a.de) && visiveis.has(a.para)), [grafo, visiveis])
  const chave = `${[...visiveis].sort().join('|')}#${arestas.length}`

  useEffect(() => {
    let vigente = true
    const filhos = [...visiveis].map(id => ({ id, width: LARGURA, height: ALTURA }))
    const ligacoes = arestas.map(a => ({ id: `${a.de}>${a.para}`, sources: [a.de], targets: [a.para] }))
    elk.layout({ id: 'raiz', layoutOptions: OPCOES_DO_ELK, children: filhos, edges: ligacoes }).then(resultado => {
      const posicoes: Posicoes = new Map((resultado.children ?? []).map(no => [no.id, { x: no.x ?? 0, y: no.y ?? 0 }]))
      if (vigente) setDesenho({ chave, posicoes, visiveis, arestas })
    })
    return () => { vigente = false }
  }, [chave])

  const nos = useMemo(() => (grafo && desenho ? montarNos(grafo, desenho, atual) : []), [grafo, desenho, atual])
  const ligacoes = useMemo(() => (desenho?.arestas ?? []).map(desenharAresta), [desenho])

  // Clicar expande os vizinhos e, se o nó é um passo ou um trecho alterado, leva a ele.
  const escolher = (_: unknown, node: Node) => {
    const no = (node.data as DadosDoNo).no
    setAbertos(antes => new Set([...antes, no.id]))
    irPara(no, revisao, fluxo, irParaPasso)
  }

  if (!grafo) return <aside className="mapa-do-fluxo"><p className="detalhe">Este review.json não tem o grafo. Rode <code>keg diff</code> de novo.</p></aside>
  return (
    <aside className="mapa-do-fluxo">
      <header>
        <h2>Mapa · quem chama quem</h2>
        <span className="detalhe">cheio: alterado · tracejado: vizinho sem alteração · linha tracejada: o compilador não prova</span>
        <button onClick={() => setAbertos(new Set())}>Recolher</button>
        <button onClick={fechar}>Fechar <kbd>m</kbd></button>
      </header>
      {/* Remontar o React Flow a cada layout reenquadra o desenho, e a expansão sempre cabe na tela. */}
      <ReactFlow key={desenho?.chave} nodes={nos} edges={ligacoes} nodeTypes={TIPOS} onNodeClick={escolher} colorMode="system"
        nodesConnectable={false} fitView fitViewOptions={{ padding: 0.15, minZoom: ZOOM_LEGIVEL, maxZoom: 1 }} minZoom={0.1} attributionPosition="bottom-left">
        <Background gap={20} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </aside>
  )
}

function CartaoDoNo({ data }: NodeProps<NoDoMapa>) {
  const { no, atual, escondidos } = data
  return (
    <div className={`no-do-mapa papel-${no.papel} ${no.hunkIds.length > 0 ? 'alterado' : 'vizinho'} ${atual ? 'atual' : ''}`} title={`${no.arquivo}:${no.linhas[0]}–${no.linhas[1]}`}>
      <Handle type="target" position={Position.Left} />
      <span className="papel">{no.papel}{no.lado && <span className="lado"> · {no.lado}</span>}</span>
      <span className="simbolo">{no.simbolo}</span>
      <span className="local">{no.arquivo}:{no.linhas[0]}</span>
      {escondidos > 0 && <span className="mais" title="vizinhos escondidos: clique para mostrar">+{escondidos}</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

// A faixa é a fronteira cliente/servidor: fica no vão entre quem chama de um lado e quem recebe do outro.
function FaixaDaFronteira({ data }: NodeProps<NoDaFaixa>) {
  return <div className="faixa-da-fronteira" style={{ height: data.altura }}><span>{data.rotulo}</span></div>
}

const TIPOS = { no: CartaoDoNo, faixa: FaixaDaFronteira }

// Os passos do fluxo ficam sempre; dos nós abertos entram os vizinhos que o grafo conhece.
// O passo atual já mostra quem o chama, que é a pergunta do mapa; quem ele chama vem com o clique.
function idsVisiveis(grafo: Grafo, fluxo: Fluxo, abertos: Set<string>, atual: string): Set<string> {
  const existentes = new Set(grafo.nos.map(no => no.id))
  const ids = new Set(fluxo.passos.map(idDoNo).filter(id => existentes.has(id)))
  for (const { de, para } of grafo.arestas) {
    if (abertos.has(de)) ids.add(para)
    if (abertos.has(para) || para === atual) ids.add(de)
  }
  return ids
}

function montarNos(grafo: Grafo, desenho: Desenho, atual: string): (NoDoMapa | NoDaFaixa)[] {
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
      id, type: 'no', position: desenho.posicoes.get(id) ?? { x: 0, y: 0 }, data: { no, atual: id === atual, escondidos: escondidos(no) },
      sourcePosition: Position.Right, targetPosition: Position.Left,
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

function desenharAresta({ de, para, tipo }: ArestaDoGrafo): Edge {
  return {
    id: `${de}>${para}`, source: de, target: para, type: 'smoothstep', label: ROTULOS[tipo],
    markerEnd: { type: MarkerType.ArrowClosed },
    className: tipo === 'chamada' ? '' : 'aresta-tracejada',
    style: tipo === 'chamada' ? {} : { strokeDasharray: '6 4' },
  }
}

// Passo do fluxo aberto: seleciona o passo. Trecho alterado de outro fluxo ou órfão: abre o lugar dele.
function irPara(no: NoDoGrafo, revisao: Revisao, fluxo: Fluxo, irParaPasso: (indice: number) => void) {
  const aqui = fluxo.passos.findIndex(p => idDoNo(p) === no.id)
  if (aqui >= 0) return irParaPasso(aqui)
  if (no.hunkIds.length === 0) return
  const outro = revisao.fluxos.flatMap(f => f.passos.map(passo => ({ fluxo: f, passo }))).find(({ passo }) => idDoNo(passo) === no.id && passo.hunkIds.length > 0)
  if (outro) location.hash = `fluxo/${outro.fluxo.id}/${outro.passo.id}`
  else if (revisao.orfaos.some(o => o.hunkIds.some(id => no.hunkIds.includes(id)))) location.hash = 'orfaos'
}
