// A altura da gaveta do mapa. O CSS lê --gaveta em três lugares (a altura da gaveta, o respiro do conteúdo e a subida da barra de
// botões), e os três moram em .pagina; por isso a altura decidida é gravada nessa variável da página e não no estilo da gaveta. Sem escolha,
// vale o padrão do CSS (50vh). Só a altura que a pessoa arrastou fica guardada neste navegador; maximizar vale enquanto o mapa estiver aberto.
// Três regras para a altura nunca pesar no quadro (a página tem um diff enorme e o mapa redesenha quando a gaveta muda de tamanho):
// - mudar --gaveta em .pagina recalcula o estilo de toda a página, então ela só muda quando a altura se decide (soltar a alça, maximizar,
//   setas); durante o arrasto a gaveta ganha height inline e a barra de botões ganha --gaveta inline, um quadro por vez (requestAnimationFrame);
// - o respiro do conteúdo (padding-bottom, que refaz o layout do diff) também só acompanha --gaveta, então fica parado durante o arrasto;
// - maximizar e restaurar aplicam a altura nova de uma vez e animam só um clip-path (sem layout): o mapa recebe um único redimensionamento.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

const CHAVE = 'keg-gaveta'
const MINIMA = 240
const PASSO_DO_TECLADO = 32
// A gaveta tem 12px de vão embaixo; a barra de botões (.dicas) tem 16px de borda e sobe junto, ficando 16px acima da gaveta.
// Em cima fica o seletor de modo (.alternador). A gaveta cresce até a barra tocar a folga debaixo do seletor.
const BORDA_DE_BAIXO = 12
const BORDA_DAS_DICAS = 16
const VAO_ENTRE_DICAS_E_GAVETA = 16
const FOLGA_DO_SELETOR = 12

const SENTIDOS: Record<string, number> = { ArrowUp: 1, ArrowDown: -1 }

// O teto sai das posições de verdade (o seletor e a barra mudam de tamanho com o tema, os rótulos e a largura da tela), não de uma constante.
function medirTeto(): number {
  const alturaDasDicas = document.querySelector<HTMLElement>('.dicas')?.offsetHeight ?? 44
  const baseDoSeletor = document.querySelector('.alternador')?.getBoundingClientRect().bottom ?? 0
  const fixo = BORDA_DE_BAIXO + BORDA_DAS_DICAS + VAO_ENTRE_DICAS_E_GAVETA + alturaDasDicas + baseDoSeletor + FOLGA_DO_SELETOR
  return Math.max(MINIMA, Math.floor(innerHeight - fixo))
}

const limitar = (px: number, teto: number) => Math.round(Math.min(Math.max(px, MINIMA), teto))

function lerAltura(): number | undefined {
  try {
    const gravada = Number(localStorage.getItem(CHAVE))
    return gravada > 0 ? gravada : undefined
  } catch {
    return undefined
  }
}

function gravarAltura(px: number) {
  try {
    localStorage.setItem(CHAVE, String(px))
  } catch {}
}

// O clip-path anima a gaveta sem layout. As margens negativas deixam a sombra do painel (que o clip-path também recorta) à mostra nos lados
// e embaixo; só o topo recua. Os 40px cobrem o blur de 30px da sombra.
const MARGEM_DA_SOMBRA = 40
const recorte = (topo: number) => `inset(${topo}px -${MARGEM_DA_SOMBRA}px -${MARGEM_DA_SOMBRA}px -${MARGEM_DA_SOMBRA}px)`

// A mesma duração e curva do resto da página, lidas do CSS (--duracao-longa e --curva).
function lerTempo(): { duration: number; easing: string } {
  const estilo = getComputedStyle(document.documentElement)
  return { duration: parseFloat(estilo.getPropertyValue('--duracao-longa')) || 280, easing: estilo.getPropertyValue('--curva').trim() || 'ease-out' }
}

export function useGaveta(gaveta: RefObject<HTMLElement | null>) {
  const [escolhida, setEscolhida] = useState(lerAltura)
  const [maximizada, setMaximizada] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  // O teto é medido quando o mapa abre e quando a janela muda de tamanho (a barra pode quebrar de linha numa tela estreita).
  const [teto, setTeto] = useState(medirTeto)
  const moveu = useRef(false)
  // Maximizar e as setas animam; soltar a alça (a gaveta já está lá), a janela mudando de tamanho e a primeira altura não.
  const animar = useRef(false)
  const animacao = useRef<Animation>(undefined)
  const montada = useRef(false)
  const arrasto = useRef<{ quadro: number; y: number; barra: HTMLElement | null }>({ quadro: 0, y: 0, barra: null })
  const efetiva = maximizada ? teto : escolhida && limitar(escolhida, teto)

  useEffect(() => {
    const aoRedimensionar = () => setTeto(medirTeto())
    aoRedimensionar()
    addEventListener('resize', aoRedimensionar)
    return () => removeEventListener('resize', aoRedimensionar)
  }, [])

  const pagina = () => gaveta.current?.closest<HTMLElement>('.pagina') ?? null
  // Desfaz o que o arrasto escreveu direto nos elementos; a altura decidida volta a vir de --gaveta.
  const largarArrasto = () => {
    cancelAnimationFrame(arrasto.current.quadro)
    arrasto.current.quadro = 0
    gaveta.current?.style.removeProperty('height')
    arrasto.current.barra?.style.removeProperty('--gaveta')
    arrasto.current.barra = null
  }
  const terminarAnimacao = () => {
    animacao.current?.cancel()
    animacao.current = undefined
    gaveta.current?.style.removeProperty('height')
  }

  // A altura decidida. Sem .pagina (a janela externa, onde o mapa ocupa tudo) não há o que ajustar. Antes da pintura: a gaveta nasce já na altura escolhida.
  useLayoutEffect(() => {
    const raiz = pagina()
    const painel = gaveta.current
    if (!raiz || !painel) return
    terminarAnimacao()
    const antes = painel.offsetHeight
    const depois = efetiva ?? Math.round(innerHeight / 2)
    const comAnimacao = animar.current && montada.current && antes !== depois && !matchMedia('(prefers-reduced-motion: reduce)').matches
    animar.current = false
    montada.current = true
    if (efetiva) raiz.style.setProperty('--gaveta', `${efetiva}px`)
    else raiz.style.removeProperty('--gaveta')
    if (!comAnimacao) return
    // Crescer: a gaveta já está na altura final e o recorte abre do tamanho antigo até o novo. Encolher: ela segue na altura antiga, o recorte
    // fecha até o tamanho novo e só então a altura nova vale. Nos dois casos o mapa muda de tamanho uma vez só, e a barra de botões (transform
    // por --gaveta) acompanha pela própria transição.
    const crescendo = depois > antes
    if (!crescendo) painel.style.height = `${antes}px`
    const tempo = lerTempo()
    const quadros = [recorte(crescendo ? depois - antes : 0), recorte(crescendo ? 0 : antes - depois)]
    const nova = painel.animate({ clipPath: quadros }, { ...tempo, fill: crescendo ? 'none' : 'forwards' })
    animacao.current = nova
    nova.onfinish = nova.oncancel = () => { if (animacao.current === nova) terminarAnimacao() }
  }, [efetiva])

  // O arrasto desliga a transição da barra de botões, que atrasaria o dedo. Ao terminar, o que ele escreveu direto nos elementos sai.
  useLayoutEffect(() => {
    const raiz = pagina()
    if (!raiz) return
    raiz.toggleAttribute('data-gaveta-arrastando', arrastando)
    if (!arrastando) largarArrasto()
  }, [arrastando])

  // Layout effect e não useEffect: ao desmontar, o ref da gaveta ainda aponta para ela aqui (no useEffect já seria nulo e a variável ficaria na página).
  useLayoutEffect(() => () => {
    largarArrasto()
    terminarAnimacao()
    const raiz = pagina()
    raiz?.style.removeProperty('--gaveta')
    raiz?.removeAttribute('data-gaveta-arrastando')
  }, [])

  const escolher = (px: number, comAnimacao = false) => {
    const altura = limitar(px, teto)
    animar.current = comAnimacao && altura !== efetiva
    setMaximizada(false)
    setEscolhida(altura)
    gravarAltura(altura)
  }
  const aoApertar = (e: KeyboardEvent) => {
    const sentido = SENTIDOS[e.key]
    if (!sentido) return
    e.preventDefault()
    escolher((efetiva ?? gaveta.current?.offsetHeight ?? MINIMA) + sentido * PASSO_DO_TECLADO, true)
  }
  // O topo da gaveta está a (altura da janela - borda - altura) do topo da tela: a altura nova é o que sobra abaixo do ponteiro.
  const alturaDoPonteiro = (y: number) => limitar(innerHeight - BORDA_DE_BAIXO - y, teto)
  // No máximo uma escrita por quadro, não importa quantos pointermove o ponteiro mande (mouses de 1000 Hz mandam vários por quadro).
  const seguirPonteiro = () => {
    const { y, barra } = arrasto.current
    arrasto.current.quadro = 0
    const altura = alturaDoPonteiro(y)
    if (gaveta.current) gaveta.current.style.height = `${altura}px`
    barra?.style.setProperty('--gaveta', `${altura}px`)
  }

  return {
    maximizada, alternarMaximizar: () => { animar.current = true; setMaximizada(atual => !atual) },
    alca: {
      tabIndex: 0, role: 'separator', 'aria-orientation': 'horizontal' as const, 'aria-label': 'Altura do mapa: setas para cima e para baixo',
      'aria-valuemin': MINIMA, 'aria-valuemax': teto, 'aria-valuenow': efetiva ?? Math.round(innerHeight / 2),
      onKeyDown: aoApertar,
      onPointerDown: (e: PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        moveu.current = false
        terminarAnimacao()
        arrasto.current.barra = document.querySelector<HTMLElement>('.dicas')
        setArrastando(true)
      },
      onPointerMove: (e: PointerEvent) => {
        if (!arrastando) return
        moveu.current = true
        arrasto.current.y = e.clientY
        arrasto.current.quadro ||= requestAnimationFrame(seguirPonteiro)
      },
      // Um clique sem arrasto na alça não muda a altura.
      onPointerUp: (e: PointerEvent) => {
        cancelAnimationFrame(arrasto.current.quadro)
        arrasto.current.quadro = 0
        setArrastando(false)
        if (moveu.current) escolher(alturaDoPonteiro(e.clientY))
      },
    },
  }
}
