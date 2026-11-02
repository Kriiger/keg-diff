// Onde o mapa começa e como se ajusta. Texto ilegível não adianta: se o grafo inteiro cabe no zoom legível, ele aparece inteiro; se não
// cabe, o mapa abre no passo atual com quem se liga a ele e avisa quantos blocos ficaram fora da vista. O viewport sai das posições
// que o ELK deu (nada de esperar o React Flow medir nem de fila de fitView): o resultado e a contagem dos blocos de fora são imediatos.
import { ControlButton, Controls, getViewportForBounds, useReactFlow, useStore, useStoreApi, type Node, type Viewport } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { LARGURA_DA_FAIXA } from './nos'
import { ALTURA, LARGURA } from './rotas'

// Abaixo disso o nome do bloco vira borrão (13px a 0.6 eram 7px); o resto o "ajustar" mostra.
export const ZOOM_LEGIVEL = 0.8
const MARGEM = 0.05
const ZOOM_DO_AJUSTE = 0.1
const TENTATIVAS = 10

interface PropsDoEnquadramento {
  nos: Node[]
  emTorno: string[]
  // fora: quantos blocos não estão inteiros na vista; ajustar: mostra tudo, mesmo em zoom pequeno.
  aoEnquadrar: (fora: number, ajustar: () => void) => void
}

type Caixa = { x: number; y: number; width: number; height: number }

const tamanhoDoNo = (no: Node) => (no.type === 'faixa' ? { width: LARGURA_DA_FAIXA, height: (no.data as { altura: number }).altura } : { width: LARGURA, height: ALTURA })

function caixaDe(nos: Node[]): Caixa {
  const lados = nos.map(no => ({ ...no.position, ...tamanhoDoNo(no) }))
  const [x, y] = [Math.min(...lados.map(l => l.x)), Math.min(...lados.map(l => l.y))]
  return { x, y, width: Math.max(...lados.map(l => l.x + l.width)) - x, height: Math.max(...lados.map(l => l.y + l.height)) - y }
}

// Os blocos que não aparecem inteiros na vista. A faixa da fronteira não conta: é moldura, não bloco.
function foraDaVista(nos: Node[], { x, y, zoom }: Viewport, largura: number, altura: number): number {
  return nos.filter(no => {
    if (no.type !== 'no') return false
    const [esquerda, topo] = [no.position.x * zoom + x, no.position.y * zoom + y]
    return esquerda < 0 || topo < 0 || esquerda + LARGURA * zoom > largura || topo + ALTURA * zoom > altura
  }).length
}

export function Enquadramento({ nos, emTorno, aoEnquadrar }: PropsDoEnquadramento) {
  const { setViewport } = useReactFlow()
  const store = useStoreApi()
  const largura = useStore(s => s.width)
  const altura = useStore(s => s.height)
  const feito = useRef(false)

  // O painel pode ainda não estar pronto para receber o viewport (o zoom do React Flow nasce junto): tenta de novo nos próximos quadros.
  const aplicar = async (vista: Viewport, duracao = 0, tentativas = TENTATIVAS): Promise<void> => {
    if (!(await setViewport(vista, { duration: duracao })) && tentativas > 0) requestAnimationFrame(() => aplicar(vista, duracao, tentativas - 1))
  }
  const ajustar = () => {
    const { width, height } = store.getState()
    aplicar(getViewportForBounds(caixaDe(nos), width, height, ZOOM_DO_AJUSTE, 1, MARGEM), 200)
    aoEnquadrar(0, ajustar)
  }
  const ajustarAtual = useRef(ajustar)
  ajustarAtual.current = ajustar

  // Só a primeira vez: depois, quem manda na vista é a pessoa (arrastar, zoom, ajustar).
  useEffect(() => {
    if (feito.current || !largura || !altura) return
    feito.current = true
    const todos = caixaDe(nos)
    const cabe = Math.min((largura * (1 - 2 * MARGEM)) / todos.width, (altura * (1 - 2 * MARGEM)) / todos.height) >= ZOOM_LEGIVEL
    const proximos = nos.filter(no => emTorno.includes(no.id))
    const alvo = cabe || proximos.length === 0 ? todos : caixaDe(proximos)
    const vista = getViewportForBounds(alvo, largura, altura, ZOOM_LEGIVEL, 1, MARGEM)
    aplicar(vista)
    aoEnquadrar(foraDaVista(nos, vista, largura, altura), () => ajustarAtual.current())
  }, [largura, altura])

  // O atalho vale enquanto o mapa estiver aberto; na tela dos órfãos, onde o mapa não existe, o f é outro atalho.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const escrevendo = e.target instanceof HTMLElement && e.target.closest('textarea, input')
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !escrevendo) ajustarAtual.current()
    }
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <Controls showInteractive={false} showFitView={false} position="bottom-right">
      <ControlButton onClick={ajustar} title="Ajustar à tela (f)" aria-label="Ajustar à tela">
        <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path fill="none" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
      </ControlButton>
    </Controls>
  )
}
