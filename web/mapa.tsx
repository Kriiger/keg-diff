// Tela Mapa: "quem chama isso?" sem sair da revisão. O React Flow desenha, o ELK dá as camadas
// (fonte à esquerda, saída à direita) e o grafo vem pronto no review.json: aqui não há compilador.
import '@xyflow/react/dist/style.css'
import { Background, Controls, Handle, Position, ReactFlow, type Node, type NodeProps } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { useEffect, useMemo, useState } from 'react'
import { desenharAresta, TIPOS_DE_ARESTA } from './arestas'
import { ALTURA, calcularLayout, idDaAresta, LARGURA, type Layout } from './rotas'
import { MODOS, useTema } from './tema'
import { idDoNo, type ArestaDoGrafo, type Fluxo, type Grafo, type NoDoGrafo, type Revisao } from '../src/contrato'

const LARGURA_DA_FAIXA = 44
// Abaixo disso o texto do nó fica miúdo demais: num grafo largo, o fitView para aqui e quem lê arrasta o desenho.
const ZOOM_LEGIVEL = 0.75

// O ELK sem worker: o bundle já traz o algoritmo, e a página não precisa de um segundo arquivo para carregar.
const elk = new ELK()
// Desenhos que o ELK já calculou, por grafo (um review.json novo é outro objeto e zera o cache): reabrir a gaveta não refaz o layout.
const desenhosCalculados = new WeakMap<Grafo, Map<string, Desenho>>()

interface DadosDoNo extends Record<string, unknown> { no: NoDoGrafo; atual: boolean; escondidos: number }
type NoDoMapa = Node<DadosDoNo, 'no'>
type NoDaFaixa = Node<{ rotulo: string; altura: number }, 'faixa'>
// O que o ELK desenhou: a chave diz quais nós e arestas entraram, para o desenho antigo ficar até o novo chegar.
interface Desenho extends Layout { chave: string; visiveis: Set<string>; arestas: ArestaDoGrafo[] }

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
  // Só depois que a gaveta termina de subir: o ELK roda na thread principal e travaria a animação.
  const [pronta, setPronta] = useState(false)
  const [subindo, setSubindo] = useState(false)
  const tema = useTema()
  const grafo = revisao.grafo
  const atual = idDoNo(fluxo.passos[indice] ?? fluxo.passos[0]!)
  const visiveis = useMemo(() => (grafo ? idsVisiveis(grafo, fluxo, abertos, atual) : new Set<string>()), [grafo, fluxo, abertos, atual])
  // Autoligação não tem rota que se veja, e o par repetido daria dois ids iguais ao React Flow e ao ELK.
  const arestas = useMemo(() => {
    const doTrecho = (grafo?.arestas ?? []).filter(a => a.de !== a.para && visiveis.has(a.de) && visiveis.has(a.para))
    return [...new Map(doTrecho.map(a => [idDaAresta(a), a])).values()]
  }, [grafo, visiveis])
  const chave = `${[...visiveis].sort().join('|')}#${arestas.length}`

  // A subida começa um quadro depois da montagem. Na 1ª abertura o lazy ainda suspende e a gaveta já nascia depois do commit pesado;
  // da 2ª em diante ele está resolvido, a gaveta monta no mesmo commit que re-renderiza a tela toda e a animação perdia os primeiros quadros.
  useEffect(() => {
    let segundo = 0
    const primeiro = requestAnimationFrame(() => { segundo = requestAnimationFrame(() => setSubindo(true)) })
    return () => { cancelAnimationFrame(primeiro); cancelAnimationFrame(segundo) }
  }, [])

  useEffect(() => {
    if (!pronta || !grafo) return
    const calculados = desenhosCalculados.get(grafo) ?? new Map<string, Desenho>()
    desenhosCalculados.set(grafo, calculados)
    const guardado = calculados.get(chave)
    if (guardado) return setDesenho(guardado)
    let vigente = true
    calcularLayout(elk, [...visiveis], arestas).then(layout => {
      const novo = { ...layout, chave, visiveis, arestas }
      calculados.set(chave, novo)
      if (vigente) setDesenho(novo)
    })
    return () => { vigente = false }
  }, [chave, pronta, grafo])

  const nos = useMemo(() => (grafo && desenho ? montarNos(grafo, desenho, atual) : []), [grafo, desenho, atual])
  const ligacoes = useMemo(() => (desenho?.arestas ?? []).flatMap(a => {
    const rota = desenho?.rotas.get(idDaAresta(a))
    return rota ? [desenharAresta(a, rota)] : []
  }), [desenho])

  // Clicar expande os vizinhos e, se o nó é um passo ou um trecho alterado, leva a ele.
  const escolher = (_: unknown, node: Node) => {
    const no = (node.data as DadosDoNo).no
    setAbertos(antes => new Set([...antes, no.id]))
    irPara(no, revisao, fluxo, irParaPasso)
  }

  if (!grafo) return <aside className="mapa-do-fluxo" data-subindo={subindo}><p className="detalhe">Este review.json não tem o grafo. Rode <code>keg diff</code> de novo.</p></aside>
  return (
    <aside className="mapa-do-fluxo" data-subindo={subindo} onAnimationEnd={e => e.target === e.currentTarget && setPronta(true)}>
      <header>
        <h2>Mapa · quem chama quem</h2>
        <span className="detalhe">cheio: alterado · tracejado: vizinho sem alteração · linha tracejada: o compilador não prova</span>
        <button onClick={() => setAbertos(new Set())}>Recolher</button>
        <button onClick={fechar}>Fechar <kbd>m</kbd></button>
      </header>
      {/* A área existe desde o começo e só aparece (fade) quando o primeiro layout chega; sem ela o grafo pularia na tela. */}
      <div className="area-do-grafo" data-pronta={desenho !== undefined}>
        {/* Remontar o React Flow a cada layout reenquadra o desenho, e a expansão sempre cabe na tela. */}
        {desenho && (
          <ReactFlow key={desenho.chave} nodes={nos} edges={ligacoes} nodeTypes={TIPOS} edgeTypes={TIPOS_DE_ARESTA} onNodeClick={escolher} colorMode={MODOS[tema]}
            nodesConnectable={false} nodesDraggable={false} fitView fitViewOptions={{ padding: 0.15, minZoom: ZOOM_LEGIVEL, maxZoom: 1 }} minZoom={0.1} attributionPosition="bottom-left">
            <Background gap={20} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        )}
      </div>
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

// Passo do fluxo aberto: seleciona o passo. Trecho alterado de outro fluxo ou órfão: abre o lugar dele.
function irPara(no: NoDoGrafo, revisao: Revisao, fluxo: Fluxo, irParaPasso: (indice: number) => void) {
  const aqui = fluxo.passos.findIndex(p => idDoNo(p) === no.id)
  if (aqui >= 0) return irParaPasso(aqui)
  if (no.hunkIds.length === 0) return
  const outro = revisao.fluxos.flatMap(f => f.passos.map(passo => ({ fluxo: f, passo }))).find(({ passo }) => idDoNo(passo) === no.id && passo.hunkIds.length > 0)
  if (outro) location.hash = `fluxo/${outro.fluxo.id}/${outro.passo.id}`
  else if (revisao.orfaos.some(o => o.hunkIds.some(id => no.hunkIds.includes(id)))) location.hash = 'orfaos'
}
