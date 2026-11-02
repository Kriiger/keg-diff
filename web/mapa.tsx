// Tela Mapa: "quem chama isso?" sem sair da revisão. O React Flow desenha, o ELK dá as camadas
// (fonte à esquerda, saída à direita) e o grafo vem pronto no review.json: aqui não há compilador.
import '@xyflow/react/dist/style.css'
import { Background, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction, type SyntheticEvent } from 'react'
import { ancorar } from './ancora'
import { desenharAresta, TIPOS_DE_ARESTA } from './arestas'
import { useDesenho } from './desenho'
import { destacar, type Destaque, type Foco } from './foco'
import { CabecalhoDoMapa } from './cabecalho'
import { resumoDosBlocos } from './legenda'
import { Enquadramento } from './enquadramento'
import { useGaveta } from './gaveta'
import { DestaqueDoMapa, linhasDosNos, montarNos, TIPOS_DE_NO } from './nos'
import { idDaAresta, type Desenho } from './rotas'
import { AvisoDeOutroFluxo, ondeMais } from './outros-fluxos'
import { MODOS, useTema } from './tema'
import { useAtalhos } from './telas'
import { idDoNo, type Fluxo, type Grafo, type Revisao } from '../src/contrato'

interface PropsDoMapa {
  revisao: Revisao
  fluxo: Fluxo
  indice: number
  irParaPasso: (indice: number) => void
  fechar: () => void
  // Só na gaveta: abrir o mapa em outra janela. Na janela externa (externo) o mapa ocupa a janela inteira, e os links para outro fluxo
  // viram `navegar`, que pede à janela principal para trocar de fluxo.
  abrirEmOutraJanela?: () => void
  externo?: boolean
  navegar?: (endereco: string) => void
}

export default function Mapa({ revisao, fluxo, indice, irParaPasso, fechar, abrirEmOutraJanela, externo, navegar }: PropsDoMapa) {
  const { abertos, setAbertos, sobre, setSobre, fixado, setFixado } = useSelecao(fluxo.id)
  const { subindo, pronta, terminou } = useSubida()
  const raiz = useRef<HTMLElement>(null)
  const gaveta = useGaveta(raiz)
  const tema = useTema()
  const grafo = revisao.grafo
  const atual = idDoNo(fluxo.passos[indice] ?? fluxo.passos[0]!)
  // O ancora é o último bloco clicado (o layout novo o mantém no lugar); o clicado avisa o Enquadramento de que o passo veio do clique.
  const ancora = useRef<string>(undefined)
  const clicado = useRef<string>(undefined)
  // Maximizar não existe na janela externa, que já é o mapa inteiro.
  useAtalhos(externo ? {} : { z: gaveta.alternarMaximizar })

  const { doFluxo, visiveis, arestas } = useRecorte(grafo, fluxo, abertos)
  // O ELK calcula enquanto a gaveta sobe (a animação roda no compositor) e o desenho só entra quando ela termina.
  const calculado = useDesenho(grafo, visiveis, arestas, subindo)
  const [cena, setCena] = useCena(pronta ? calculado : undefined, fluxo.id, ancora, atual)
  const desenho = cena.desenho
  const destaque = useMemo(() => destacar(sobre ?? fixado, fixado, arestas, visiveis), [sobre, fixado, arestas, visiveis])
  // O Enquadramento informa quantos blocos estão fora da vista e como mostrar tudo.
  const [vista, setVista] = useState({ fora: 0, ajustar: () => {} })
  const emTorno = useMemo(() => [atual, ...arestas.filter(a => a.de === atual || a.para === atual).flatMap(a => [a.de, a.para])], [atual, arestas])

  // O mouse que estava num bloco que saiu do desenho nunca avisa que saiu.
  useEffect(() => setSobre(undefined), [desenho])

  useFixadoNoPasso(fluxo.id, atual, setFixado)

  const linhas = useMemo(() => (grafo ? linhasDosNos(grafo, revisao) : new Map()), [grafo, revisao])
  const nos = useMemo(() => (grafo && desenho ? montarNos(grafo, desenho, { atual, doFluxo, linhas }) : []), [grafo, desenho, atual, doFluxo, linhas])
  const ligacoes = useMemo(() => (grafo && desenho ? montarLigacoes(grafo, desenho, destaque) : []), [grafo, desenho, destaque])
  const noFixado = fixado && 'no' in fixado ? grafo?.nos.find(n => n.id === fixado.no) : undefined
  const destinos = useMemo(() => ondeMais(noFixado, revisao, fluxo), [noFixado, revisao, fluxo])

  // Clicar abre os vizinhos e deixa o bloco isolado. Se ele é passo deste fluxo, seleciona o passo; qualquer outro só abre ali mesmo:
  // o mapa nunca troca de fluxo sozinho (a saída para outro fluxo é o aviso de outro-fluxo.tsx).
  const escolherNo = (id: string) => {
    if (!grafo?.nos.some(n => n.id === id)) return
    ancora.current = clicado.current = id
    setAbertos(antes => new Set([...antes, id]))
    setFixado({ no: id })
    const passo = fluxo.passos.findIndex(p => idDoNo(p) === id)
    if (passo >= 0) irParaPasso(passo)
  }

  if (!grafo) return <aside className="mapa-do-fluxo" data-subindo={subindo}><p className="detalhe">Este review.json não tem o grafo. Rode <code>keg diff</code> de novo.</p></aside>
  return (
    <aside ref={raiz} className={`mapa-do-fluxo${externo ? ' externo' : ''}${gaveta.maximizada ? ' maximizada' : ''}`} data-subindo={subindo} onAnimationEnd={e => e.target === e.currentTarget && terminou()}>
      {!externo && <div className="alca-da-gaveta" {...gaveta.alca} />}
      <CabecalhoDoMapa titulo={fluxo.titulo} resumo={resumoDosBlocos(grafo, visiveis, doFluxo)} fora={vista.fora} ajustar={vista.ajustar} recolher={() => { setAbertos(new Set()); setFixado(undefined) }} fechar={fechar}
        maximizada={externo ? undefined : gaveta.maximizada} maximizar={gaveta.alternarMaximizar} abrirFora={abrirEmOutraJanela} />
      {/* A área existe desde o começo e só aparece (fade) quando o primeiro layout chega; sem ela o grafo pularia na tela. */}
      <div className="area-do-grafo" data-pronta={desenho !== undefined} data-camada={cena.versao % 2}>
        {/* O React Flow só remonta (e reenquadra) ao trocar de fluxo: layout novo atualiza os nós no lugar, e a vista fica com a pessoa. */}
        {desenho && (
          <DestaqueDoMapa.Provider value={destaque}>
            <ReactFlow key={fluxo.id} nodes={nos} edges={ligacoes} nodeTypes={TIPOS_DE_NO} edgeTypes={TIPOS_DE_ARESTA} colorMode={MODOS[tema]}
              {...eventosDoMapa(escolherNo, setSobre, setFixado)} tabIndex={-1}
              elementsSelectable={false} edgesFocusable={false} nodesConnectable={false} nodesDraggable={false} minZoom={0.1} attributionPosition="bottom-left">
              <Enquadramento nos={nos} emTorno={emTorno} atual={atual} clicado={clicado} aoEnquadrar={(fora, ajustar) => setVista({ fora, ajustar })} />
              {noFixado && <AvisoDeOutroFluxo no={noFixado} destinos={destinos} navegar={navegar} />}
              <Background gap={20} />
            </ReactFlow>
          </DestaqueDoMapa.Provider>
        )}
      </div>
    </aside>
  )
}

type Apontar = Dispatch<SetStateAction<Foco | undefined>>

// O que a pessoa tem aberto e apontado no mapa. Zera quando o fluxo troca: a gaveta continua aberta (o endereço muda por baixo dela), e
// os blocos abertos do fluxo antigo não valem no novo. O ajuste é feito durante o render para o React Flow novo nunca ver o estado velho.
function useSelecao(fluxoId: string) {
  const [abertos, setAbertos] = useState(new Set<string>())
  // sobre: o que o mouse ou o teclado aponta agora; fixado: o último clique (ou o passo atual, quando ele muda), que segue isolado quando o mouse sai.
  const [sobre, setSobre] = useState<Foco>()
  const [fixado, setFixado] = useState<Foco>()
  const [visto, setVisto] = useState(fluxoId)
  if (visto !== fluxoId) {
    setVisto(fluxoId)
    setAbertos(new Set())
    setSobre(undefined)
    setFixado(undefined)
  }
  return { abertos, setAbertos, sobre, setSobre, fixado, setFixado }
}

// Só depois que a gaveta termina de subir (pronta) o ELK pode atrapalhar: ele roda na thread principal e travaria a animação.
function useSubida() {
  const [pronta, setPronta] = useState(false)
  const [subindo, setSubindo] = useState(false)
  // A subida começa um quadro depois da montagem. Na 1ª abertura o lazy ainda suspende e a gaveta já nascia depois do commit pesado;
  // da 2ª em diante ele está resolvido, a gaveta monta no mesmo commit que re-renderiza a tela toda e a animação perdia os primeiros quadros.
  // Aba em segundo plano não roda requestAnimationFrame, e a gaveta ficaria invisível: o prazo garante a subida, e a animationend perdida, o desenho.
  useEffect(() => {
    let segundo = 0
    const primeiro = requestAnimationFrame(() => { segundo = requestAnimationFrame(() => setSubindo(true)) })
    const prazo = setTimeout(() => setSubindo(true), 400)
    return () => { cancelAnimationFrame(primeiro); cancelAnimationFrame(segundo); clearTimeout(prazo) }
  }, [])
  useEffect(() => {
    if (!subindo) return
    const prazo = setTimeout(() => setPronta(true), 800)
    return () => clearTimeout(prazo)
  }, [subindo])
  return { subindo, pronta, terminou: () => setPronta(true) }
}

// O desenho que está na tela. O layout novo entra deslocado para o bloco clicado (ou o passo atual) ficar onde estava (ancora.ts).
// A versão só serve ao CSS: a cada layout novo ela troca e as ligações reaparecem junto com o deslize dos blocos.
type Cena = { desenho?: Desenho; versao: number }
function useCena(calculado: Desenho | undefined, fluxoId: string, ancora: RefObject<string | undefined>, atual: string) {
  const estado = useState<Cena>({ versao: 0 })
  const setCena = estado[1]
  // Outro fluxo começa sem desenho: o do fluxo antigo nunca chega ao React Flow novo.
  const [visto, setVisto] = useState(fluxoId)
  if (visto !== fluxoId) {
    setVisto(fluxoId)
    setCena({ versao: 0 })
  }
  useEffect(() => {
    if (calculado) setCena(({ desenho: antes, versao }) => ({ desenho: ancorar(calculado, antes, [ancora.current, atual]), versao: versao + 1 }))
  }, [calculado, fluxoId])
  return estado
}

// O passo mudou por j, k ou pela lateral: o bloco fixado acompanha. Troca de fluxo não conta, e o clique no mapa já fixou o bloco.
function useFixadoNoPasso(fluxoId: string, atual: string, fixar: Apontar) {
  const anterior = useRef({ fluxo: fluxoId, atual })
  useEffect(() => {
    const antes = anterior.current
    anterior.current = { fluxo: fluxoId, atual }
    if (antes.fluxo === fluxoId && antes.atual !== atual) fixar({ no: atual })
  }, [atual, fluxoId])
}

// O recorte do grafo que está na tela: os passos do fluxo mais os vizinhos dos blocos abertos, e as ligações entre eles.
function useRecorte(grafo: Grafo | undefined, fluxo: Fluxo, abertos: Set<string>) {
  const doFluxo = useMemo(() => new Set(fluxo.passos.map(idDoNo)), [fluxo])
  const visiveis = useMemo(() => (grafo ? idsVisiveis(grafo, doFluxo, abertos) : new Set<string>()), [grafo, doFluxo, abertos])
  // Autoligação não tem rota que se veja, e o par repetido daria dois ids iguais ao React Flow e ao ELK.
  const arestas = useMemo(() => {
    const doTrecho = (grafo?.arestas ?? []).filter(a => a.de !== a.para && visiveis.has(a.de) && visiveis.has(a.para))
    return [...new Map(doTrecho.map(a => [idDaAresta(a), a])).values()]
  }, [grafo, visiveis])
  return { doFluxo, visiveis, arestas }
}

// O mouse e o teclado chegam ao mesmo destaque (passar o mouse, Tab) e à mesma ação (clicar, Enter ou espaço). Tab só destaca: quem age é o Enter.
// A ligação só se alcança pelo mouse.
function eventosDoMapa(escolherNo: (id: string) => void, apontar: Apontar, fixar: Apontar) {
  const aoApertar = (e: KeyboardEvent) => {
    const alvo = e.key === 'Enter' || e.key === ' ' ? focoDoEvento(e) : undefined
    if (!alvo || !('no' in alvo)) return
    e.preventDefault()
    escolherNo(alvo.no)
  }
  return {
    onNodeClick: (_: unknown, no: Node) => escolherNo(no.id),
    onEdgeClick: (_: unknown, aresta: Edge) => fixar({ aresta: aresta.id }),
    // Clicar fora de bloco, ligação e botões solta o destaque e leva o foco ao mapa, de onde o Tab entra nos blocos em vez de voltar ao topo da página.
    // Fica no contêiner e não no onPaneClick do React Flow, que só dispara se o alvo for o fundo exato (o contêiner do arquivo, o desenho e o pontilhado não contam).
    onClick: (e: SyntheticEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('.react-flow__node-no, .react-flow__edge, .react-flow__controls, .react-flow__panel')) return
      fixar(undefined)
      alvo.closest<HTMLElement>('.react-flow')?.focus({ preventScroll: true })
    },
    onNodeMouseEnter: (_: unknown, no: Node) => apontar({ no: no.id }), onNodeMouseLeave: () => apontar(undefined),
    onEdgeMouseEnter: (_: unknown, aresta: Edge) => apontar({ aresta: aresta.id }), onEdgeMouseLeave: () => apontar(undefined),
    onFocus: (e: SyntheticEvent) => apontar(focoDoEvento(e)), onBlur: () => apontar(undefined), onKeyDown: aoApertar,
  }
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

// O mapa é o fluxo: os passos ficam sempre e são o caminho principal. O resto é contexto e só entra por clique, com os vizinhos que o grafo
// conhece dos blocos abertos (quem chama e quem é chamado). Nem o passo atual traz quem o chama sozinho: o mapa não muda de tamanho
// quando o passo muda, e o "+N" do bloco diz quantos vizinhos esperam.
function idsVisiveis(grafo: Grafo, doFluxo: Set<string>, abertos: Set<string>): Set<string> {
  const existentes = new Set(grafo.nos.map(no => no.id))
  const ids = new Set([...doFluxo].filter(id => existentes.has(id)))
  for (const { de, para } of grafo.arestas) {
    if (abertos.has(de)) ids.add(para)
    if (abertos.has(para)) ids.add(de)
  }
  return ids
}
