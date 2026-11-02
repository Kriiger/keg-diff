// Onde o mapa começa e como se ajusta. Texto ilegível não adianta: se o grafo inteiro cabe no zoom legível, ele aparece inteiro; se não
// cabe, o mapa abre no passo atual com quem se liga a ele e avisa quantos blocos ficaram fora da vista. O viewport sai das posições
// que o ELK deu (nada de esperar o React Flow medir nem de fila de fitView): o resultado e a contagem dos blocos de fora são imediatos.
// Depois da primeira vez a vista é da pessoa: expandir um bloco não reenquadra (ancora.ts mantém o bloco clicado no lugar), e só o passo
// atual, quando muda por j/k ou pela lateral, puxa a vista, e só se ele estiver fora dela.
import { ControlButton, Controls, getViewportForBounds, useReactFlow, useStore, useStoreApi, type Node, type Viewport } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ALTURA, LARGURA } from './rotas'

// Abaixo disso o nome do bloco vira borrão (13px a 0.6 eram 7px); o resto o "ajustar" mostra.
export const ZOOM_LEGIVEL = 0.8
// O topo reserva a fileira de controles (zoom e ajustar), que fica no canto de cima à direita: o enquadramento nunca põe um bloco debaixo deles.
const FOLGAS = { top: '48px', right: '5%', bottom: '5%', left: '5%' } as const
const ZOOM_DO_AJUSTE = 0.1
const TENTATIVAS = 10
const DURACAO_DO_SEGUIR = 300
// Folga da borda da vista: um passo encostado na borda conta como fora.
const FOLGA = 24
// A janela e a gaveta mudam de tamanho em rajada (arrastar a alça, animação de altura): o enquadramento espera a rajada passar.
const ESPERA_DO_TAMANHO = 150

interface PropsDoEnquadramento {
  nos: Node[]
  emTorno: string[]
  atual: string
  // O último bloco clicado no mapa: o passo que o clique escolheu já está debaixo do mouse e não precisa de pan.
  clicado: RefObject<string | undefined>
  // fora: quantos blocos não estão inteiros na vista; ajustar: mostra tudo, mesmo em zoom pequeno.
  aoEnquadrar: (fora: number, ajustar: () => void) => void
}

type Caixa = { x: number; y: number; width: number; height: number }
type Tamanho = { largura: number; altura: number }

const tamanhoDoNo = (no: Node) => (no.type === 'arquivo' ? { width: no.width ?? 0, height: no.height ?? 0 } : { width: LARGURA, height: ALTURA })

function caixaDe(nos: Node[]): Caixa {
  const lados = nos.map(no => ({ ...no.position, ...tamanhoDoNo(no) }))
  const [x, y] = [Math.min(...lados.map(l => l.x)), Math.min(...lados.map(l => l.y))]
  return { x, y, width: Math.max(...lados.map(l => l.x + l.width)) - x, height: Math.max(...lados.map(l => l.y + l.height)) - y }
}

// Um bloco está dentro quando cabe inteiro na vista, a `folga` de cada borda.
function dentroDaVista(no: Node, { x, y, zoom }: Viewport, { largura, altura }: Tamanho, folga = 0): boolean {
  const [esquerda, topo] = [no.position.x * zoom + x, no.position.y * zoom + y]
  return esquerda >= folga && topo >= folga && esquerda + LARGURA * zoom <= largura - folga && topo + ALTURA * zoom <= altura - folga
}

// Os blocos que não aparecem inteiros na vista. O contêiner do arquivo não conta: é moldura, não bloco.
const foraDaVista = (nos: Node[], vista: Viewport, tamanho: Tamanho) => nos.filter(no => no.type === 'no' && !dentroDaVista(no, vista, tamanho)).length

// O tamanho do que a pessoa enxerga, medido no elemento e não só no store do React Flow: o recorte da gaveta (e a janela) manda,
// e um painel que o React Flow mediu mais largo que a moldura deixaria blocos além da borda sem aviso de "fora da vista".
function useTamanhoVisivel(): Tamanho {
  const area = useStore(s => s.domNode)
  const [tamanho, setTamanho] = useState<Tamanho>({ largura: 0, altura: 0 })
  useEffect(() => {
    if (!area) return
    const medir = () => {
      const caixa = area.getBoundingClientRect()
      const moldura = area.closest('.mapa-do-fluxo')?.getBoundingClientRect()
      const direita = Math.min(caixa.right, moldura?.right ?? Infinity, innerWidth)
      const novo = { largura: Math.floor(direita - caixa.left), altura: Math.floor(caixa.height) }
      setTamanho(antes => (antes.largura === novo.largura && antes.altura === novo.altura ? antes : novo))
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(area)
    addEventListener('resize', medir)
    return () => { observador.disconnect(); removeEventListener('resize', medir) }
  }, [area])
  return tamanho
}

// Depois que a pessoa mexe na vista (arrasta, dá zoom, clica), ela é dela: o enquadramento automático para.
function useInteracao(): RefObject<boolean> {
  const area = useStore(s => s.domNode)
  const interagiu = useRef(false)
  useEffect(() => {
    const marcar = () => { interagiu.current = true }
    area?.addEventListener('pointerdown', marcar, true)
    area?.addEventListener('wheel', marcar, true)
    return () => { area?.removeEventListener('pointerdown', marcar, true); area?.removeEventListener('wheel', marcar, true) }
  }, [area])
  return interagiu
}

// O atalho vale enquanto o mapa estiver aberto; na tela dos órfãos, onde o mapa não existe, o f é outro atalho.
function useAtalhoDeAjuste(ajustar: () => void) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const escrevendo = e.target instanceof HTMLElement && e.target.closest('textarea, input')
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !escrevendo) ajustar()
    }
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }, [ajustar])
}

export function Enquadramento({ nos, emTorno, atual, clicado, aoEnquadrar }: PropsDoEnquadramento) {
  const { setViewport } = useReactFlow()
  const store = useStoreApi()
  const tamanho = useTamanhoVisivel()
  const interagiu = useInteracao()
  const anterior = useRef(atual)
  const primeira = useRef(true)
  const enquadrado = useRef<Tamanho>(undefined)
  // Quantos blocos estão fora da vista agora, a cada pan, zoom ou layout: o número vem do store e só renderiza quando ele muda.
  const fora = useStore(s => (tamanho.largura ? foraDaVista(nos, { x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }, tamanho) : 0))

  // O painel pode ainda não estar pronto para receber o viewport (o zoom do React Flow nasce junto): tenta de novo nos próximos quadros.
  // A interpolação é linear: a padrão do d3 "voa" (afasta e reaproxima) em deslocamentos longos, e o zoom parecia mudar no meio do caminho.
  const aplicar = async (vista: Viewport, duracao = 0, tentativas = TENTATIVAS): Promise<void> => {
    if (!(await setViewport(vista, { duration: duracao, interpolate: 'linear' })) && tentativas > 0) requestAnimationFrame(() => aplicar(vista, duracao, tentativas - 1))
  }
  const ajustar = () => {
    interagiu.current = true
    aplicar(getViewportForBounds(caixaDe(nos), tamanho.largura, tamanho.altura, ZOOM_DO_AJUSTE, 1, FOLGAS), 200)
  }
  // Onde o mapa nasce: o grafo inteiro se couber num zoom legível, senão o passo atual com quem se liga a ele.
  const enquadrarInicio = () => {
    const todos = caixaDe(nos)
    // Sem zoom mínimo, o zoom devolvido é o que o grafo inteiro pede (até 1): se for legível, ele cabe.
    const cabe = getViewportForBounds(todos, tamanho.largura, tamanho.altura, 0, 1, FOLGAS).zoom >= ZOOM_LEGIVEL
    const proximos = nos.filter(no => emTorno.includes(no.id))
    const alvo = cabe || proximos.length === 0 ? todos : caixaDe(proximos)
    aplicar(getViewportForBounds(alvo, tamanho.largura, tamanho.altura, ZOOM_LEGIVEL, 1, FOLGAS))
  }
  // Se o bloco saiu da vista, a vista vai até ele, no mesmo zoom.
  const trazerParaVista = (id: string) => {
    const bloco = nos.find(no => no.id === id)
    const [x, y, zoom] = store.getState().transform
    if (!bloco || dentroDaVista(bloco, { x, y, zoom }, tamanho, FOLGA)) return
    const centro = { x: tamanho.largura / 2 - (bloco.position.x + LARGURA / 2) * zoom, y: tamanho.altura / 2 - (bloco.position.y + ALTURA / 2) * zoom }
    aplicar({ ...centro, zoom }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURACAO_DO_SEGUIR)
  }
  const acoes = useRef({ ajustar, enquadrarInicio, trazerParaVista })
  acoes.current = { ajustar, enquadrarInicio, trazerParaVista }
  const ajustarEstavel = useCallback(() => acoes.current.ajustar(), [])

  // Enquanto a pessoa não mexeu na vista, cada tamanho novo (a gaveta ainda assentando, a lateral, a janela) refaz o enquadramento
  // inicial; depois, só garante que o passo atual continue à vista. A primeira medida age já, sem espera.
  useEffect(() => {
    if (!tamanho.largura || !tamanho.altura) return
    const espera = setTimeout(() => {
      if (interagiu.current) return acoes.current.trazerParaVista(atual)
      // Variação pequena não refaz o enquadramento: o cabeçalho que quebra em mais uma linha (o aviso de blocos fora da vista) mexe na altura,
      // e refazer o enquadramento mudaria o aviso, que mexeria na altura de novo.
      const antes = enquadrado.current
      if (antes && Math.abs(antes.largura - tamanho.largura) < 8 && Math.abs(antes.altura - tamanho.altura) < 48) return
      enquadrado.current = tamanho
      acoes.current.enquadrarInicio()
    }, primeira.current ? 0 : ESPERA_DO_TAMANHO)
    primeira.current = false
    return () => clearTimeout(espera)
  }, [tamanho.largura, tamanho.altura])

  useEffect(() => aoEnquadrar(fora, ajustarEstavel), [fora])

  // O passo mudou (j, k, lateral): se o bloco dele saiu da vista, a vista vai até ele. Mudança vinda do clique no mapa não mexe.
  useEffect(() => {
    if (anterior.current === atual) return
    anterior.current = atual
    const veioDoClique = clicado.current === atual
    clicado.current = undefined
    if (!veioDoClique) acoes.current.trazerParaVista(atual)
  }, [atual])

  useAtalhoDeAjuste(ajustarEstavel)

  return (
    <Controls showInteractive={false} showFitView={false} position="top-right" orientation="horizontal">
      <ControlButton onClick={ajustarEstavel} title="Ajustar à tela (f)" aria-label="Ajustar à tela">
        <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path fill="none" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
      </ControlButton>
    </Controls>
  )
}
