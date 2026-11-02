// Tela Mapa: "quem chama isso?" sem sair da revisão. O React Flow desenha, o ELK dá as camadas
// (fonte à esquerda, saída à direita) e o grafo vem pronto no review.json: aqui não há compilador.
import '@xyflow/react/dist/style.css'
import { Background, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction, type SyntheticEvent } from 'react'
import { desenharAresta, TIPOS_DE_ARESTA } from './arestas'
import { useDesenho } from './desenho'
import { destacar, type Destaque, type Foco } from './foco'
import { CabecalhoDoMapa } from './cabecalho'
import { Enquadramento } from './enquadramento'
import { DestaqueDoMapa, montarNos, TIPOS_DE_NO } from './nos'
import { idDaAresta, type Desenho } from './rotas'
import { MODOS, useTema } from './tema'
import { idDoNo, type Fluxo, type Grafo, type NoDoGrafo, type Revisao } from '../src/contrato'

interface PropsDoMapa {
  revisao: Revisao
  fluxo: Fluxo
  indice: number
  irParaPasso: (indice: number) => void
  fechar: () => void
}

export default function Mapa({ revisao, fluxo, indice, irParaPasso, fechar }: PropsDoMapa) {
  const [abertos, setAbertos] = useState(new Set<string>())
  // Só depois que a gaveta termina de subir: o ELK roda na thread principal e travaria a animação.
  const [pronta, setPronta] = useState(false)
  const [subindo, setSubindo] = useState(false)
  // sobre: o que o mouse ou o teclado aponta agora; fixado: o último clique, que segue isolado quando o mouse sai.
  const [sobre, setSobre] = useState<Foco>()
  const [fixado, setFixado] = useState<Foco>()
  const tema = useTema()
  const grafo = revisao.grafo
  const atual = idDoNo(fluxo.passos[indice] ?? fluxo.passos[0]!)
  const visiveis = useMemo(() => (grafo ? idsVisiveis(grafo, fluxo, abertos, atual) : new Set<string>()), [grafo, fluxo, abertos, atual])
  // Autoligação não tem rota que se veja, e o par repetido daria dois ids iguais ao React Flow e ao ELK.
  const arestas = useMemo(() => {
    const doTrecho = (grafo?.arestas ?? []).filter(a => a.de !== a.para && visiveis.has(a.de) && visiveis.has(a.para))
    return [...new Map(doTrecho.map(a => [idDaAresta(a), a])).values()]
  }, [grafo, visiveis])
  // O ELK calcula enquanto a gaveta sobe (a animação roda no compositor) e o desenho só entra quando ela termina.
  const calculado = useDesenho(grafo, visiveis, arestas, subindo)
  const desenho = pronta ? calculado : undefined
  const refoco = useRef<string | undefined>(undefined)
  const destaque = useMemo(() => destacar(sobre ?? fixado, fixado, arestas, visiveis), [sobre, fixado, arestas, visiveis])
  // Cada desenho remonta o React Flow, e o Enquadramento informa de novo quantos blocos ficaram fora da vista.
  const [vista, setVista] = useState({ fora: 0, ajustar: () => {} })
  const emTorno = useMemo(() => [atual, ...arestas.filter(a => a.de === atual || a.para === atual).flatMap(a => [a.de, a.para])], [atual, arestas])

  // A subida começa um quadro depois da montagem. Na 1ª abertura o lazy ainda suspende e a gaveta já nascia depois do commit pesado;
  // da 2ª em diante ele está resolvido, a gaveta monta no mesmo commit que re-renderiza a tela toda e a animação perdia os primeiros quadros.
  useEffect(() => {
    let segundo = 0
    const primeiro = requestAnimationFrame(() => { segundo = requestAnimationFrame(() => setSubindo(true)) })
    return () => { cancelAnimationFrame(primeiro); cancelAnimationFrame(segundo) }
  }, [])

  // O desenho novo remonta o React Flow: o mouse que estava num bloco do anterior nunca avisa que saiu.
  useEffect(() => {
    setSobre(undefined)
    if (refoco.current) devolverFoco(refoco.current)
    refoco.current = undefined
  }, [desenho])

  const nos = useMemo(() => (grafo && desenho ? montarNos(grafo, desenho, atual) : []), [grafo, desenho, atual])
  const ligacoes = useMemo(() => (grafo && desenho ? montarLigacoes(grafo, desenho, destaque) : []), [grafo, desenho, destaque])

  // Clicar expande os vizinhos, deixa o bloco isolado e, se ele é um passo ou um trecho alterado, leva a ele.
  const escolherNo = (id: string, doTeclado = false) => {
    const no = grafo?.nos.find(n => n.id === id)
    if (!no) return
    refoco.current = doTeclado ? id : undefined
    setAbertos(antes => new Set([...antes, no.id]))
    setFixado({ no: id })
    irPara(no, revisao, fluxo, irParaPasso)
  }

  if (!grafo) return <aside className="mapa-do-fluxo" data-subindo={subindo}><p className="detalhe">Este review.json não tem o grafo. Rode <code>keg diff</code> de novo.</p></aside>
  return (
    <aside className="mapa-do-fluxo" data-subindo={subindo} onAnimationEnd={e => e.target === e.currentTarget && setPronta(true)}>
      <CabecalhoDoMapa fora={vista.fora} ajustar={vista.ajustar} recolher={() => { setAbertos(new Set()); setFixado(undefined) }} fechar={fechar} />
      {/* A área existe desde o começo e só aparece (fade) quando o primeiro layout chega; sem ela o grafo pularia na tela. */}
      <div className="area-do-grafo" data-pronta={desenho !== undefined}>
        {/* Remontar o React Flow a cada layout reenquadra o desenho, e a expansão sempre cabe na tela. */}
        {desenho && (
          <DestaqueDoMapa.Provider value={destaque}>
            <ReactFlow key={desenho.chave} nodes={nos} edges={ligacoes} nodeTypes={TIPOS_DE_NO} edgeTypes={TIPOS_DE_ARESTA} colorMode={MODOS[tema]}
              {...eventosDoMapa(escolherNo, setSobre, setFixado)} tabIndex={-1}
              elementsSelectable={false} edgesFocusable={false} nodesConnectable={false} nodesDraggable={false} minZoom={0.1} attributionPosition="bottom-left">
              <Enquadramento nos={nos} emTorno={emTorno} aoEnquadrar={(fora, ajustar) => setVista({ fora, ajustar })} />
              <Background gap={20} />
            </ReactFlow>
          </DestaqueDoMapa.Provider>
        )}
      </div>
    </aside>
  )
}

type Apontar = Dispatch<SetStateAction<Foco | undefined>>

// O mouse e o teclado chegam ao mesmo destaque (passar o mouse, Tab) e à mesma ação (clicar, Enter ou espaço). Tab só destaca: quem age é o Enter.
// A ligação só se alcança pelo mouse.
function eventosDoMapa(escolherNo: (id: string, doTeclado?: boolean) => void, apontar: Apontar, fixar: Apontar) {
  const aoApertar = (e: KeyboardEvent) => {
    const alvo = e.key === 'Enter' || e.key === ' ' ? focoDoEvento(e) : undefined
    if (!alvo || !('no' in alvo)) return
    e.preventDefault()
    escolherNo(alvo.no, true)
  }
  return {
    onNodeClick: (_: unknown, no: Node) => escolherNo(no.id),
    onEdgeClick: (_: unknown, aresta: Edge) => fixar({ aresta: aresta.id }),
    // Clicar fora de bloco, ligação e botões solta o destaque e leva o foco ao mapa, de onde o Tab entra nos blocos em vez de voltar ao topo da página.
    // Fica no contêiner e não no onPaneClick do React Flow, que só dispara se o alvo for o fundo exato (a faixa, o desenho e o pontilhado não contam).
    onClick: (e: SyntheticEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('.react-flow__node-no, .react-flow__edge, .react-flow__controls')) return
      fixar(undefined)
      alvo.closest<HTMLElement>('.react-flow')?.focus({ preventScroll: true })
    },
    onNodeMouseEnter: (_: unknown, no: Node) => apontar({ no: no.id }), onNodeMouseLeave: () => apontar(undefined),
    onEdgeMouseEnter: (_: unknown, aresta: Edge) => apontar({ aresta: aresta.id }), onEdgeMouseLeave: () => apontar(undefined),
    onFocus: (e: SyntheticEvent) => apontar(focoDoEvento(e)), onBlur: () => apontar(undefined), onKeyDown: aoApertar,
  }
}

// O desenho novo remonta os blocos: quem agiu pelo teclado reencontra o mesmo bloco assim que ele é medido e fica visível.
function devolverFoco(id: string, tentativas = 20) {
  const bloco = document.querySelector<HTMLElement>(`.react-flow__node-no[data-id="${CSS.escape(id)}"]`)
  bloco?.focus({ preventScroll: true })
  if (document.activeElement !== bloco && tentativas > 0) requestAnimationFrame(() => devolverFoco(id, tentativas - 1))
}

function montarLigacoes(grafo: Grafo, desenho: Desenho, destaque: Destaque | undefined) {
  const simbolo = (id: string) => grafo.nos.find(no => no.id === id)?.simbolo ?? id
  return desenho.arestas.flatMap(a => {
    const rota = desenho.rotas.get(idDaAresta(a))
    return rota ? [desenharAresta(a, rota, destaque?.arestas.get(idDaAresta(a)), [simbolo(a.de), simbolo(a.para)])] : []
  })
}

// O bloco que o teclado alcançou. As ligações ficam fora da ordem do Tab (edgesFocusable): o Tab passa só pelos blocos.
function focoDoEvento(e: SyntheticEvent): Foco | undefined {
  const id = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node-no')?.dataset.id
  return id ? { no: id } : undefined
}

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

// Passo do fluxo aberto: seleciona o passo. Trecho alterado de outro fluxo ou órfão: abre o lugar dele.
function irPara(no: NoDoGrafo, revisao: Revisao, fluxo: Fluxo, irParaPasso: (indice: number) => void) {
  const aqui = fluxo.passos.findIndex(p => idDoNo(p) === no.id)
  if (aqui >= 0) return irParaPasso(aqui)
  if (no.hunkIds.length === 0) return
  const outro = revisao.fluxos.flatMap(f => f.passos.map(passo => ({ fluxo: f, passo }))).find(({ passo }) => idDoNo(passo) === no.id && passo.hunkIds.length > 0)
  if (outro) location.hash = `fluxo/${outro.fluxo.id}/${outro.passo.id}`
  else if (revisao.orfaos.some(o => o.hunkIds.some(id => no.hunkIds.includes(id)))) location.hash = 'orfaos'
}
