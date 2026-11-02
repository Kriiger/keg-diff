// A altura da gaveta do mapa. O CSS lê --gaveta em três lugares (a altura da gaveta, o respiro do conteúdo e a subida da barra de
// botões), e os três moram em .pagina; por isso a altura é gravada nessa variável da página e não no estilo da gaveta. Sem escolha,
// vale o padrão do CSS (50vh). Só a altura que a pessoa arrastou fica guardada neste navegador; maximizar vale enquanto o mapa estiver aberto.
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

export function useGaveta(gaveta: RefObject<HTMLElement | null>) {
  const [escolhida, setEscolhida] = useState(lerAltura)
  const [maximizada, setMaximizada] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  // O teto é medido quando o mapa abre e quando a janela muda de tamanho (a barra pode quebrar de linha numa tela estreita).
  const [teto, setTeto] = useState(medirTeto)
  const moveu = useRef(false)
  const efetiva = maximizada ? teto : escolhida && limitar(escolhida, teto)

  useEffect(() => {
    const aoRedimensionar = () => setTeto(medirTeto())
    aoRedimensionar()
    addEventListener('resize', aoRedimensionar)
    return () => removeEventListener('resize', aoRedimensionar)
  }, [])

  // Sem .pagina (a janela externa, onde o mapa ocupa tudo) não há o que ajustar. Antes da pintura: a gaveta nasce já na altura escolhida.
  useLayoutEffect(() => {
    const pagina = gaveta.current?.closest<HTMLElement>('.pagina')
    if (!pagina) return
    if (efetiva) pagina.style.setProperty('--gaveta', `${efetiva}px`)
    // Durante o arrasto a gaveta e a barra seguem o ponteiro sem a transição de altura, que atrasaria o dedo.
    pagina.toggleAttribute('data-gaveta-arrastando', arrastando)
    return () => {
      pagina.style.removeProperty('--gaveta')
      pagina.removeAttribute('data-gaveta-arrastando')
    }
  }, [efetiva, arrastando])

  const escolher = (px: number) => {
    const altura = limitar(px, teto)
    setMaximizada(false)
    setEscolhida(altura)
    gravarAltura(altura)
  }
  const aoApertar = (e: KeyboardEvent) => {
    const sentido = SENTIDOS[e.key]
    if (!sentido) return
    e.preventDefault()
    escolher((efetiva ?? gaveta.current?.offsetHeight ?? MINIMA) + sentido * PASSO_DO_TECLADO)
  }
  // O topo da gaveta está a (altura da janela - borda - altura) do topo da tela: a altura nova é o que sobra abaixo do ponteiro.
  const alturaDoPonteiro = (e: PointerEvent) => limitar(innerHeight - BORDA_DE_BAIXO - e.clientY, teto)

  return {
    maximizada, alternarMaximizar: () => setMaximizada(atual => !atual),
    alca: {
      tabIndex: 0, role: 'separator', 'aria-orientation': 'horizontal' as const, 'aria-label': 'Altura do mapa: setas para cima e para baixo',
      'aria-valuemin': MINIMA, 'aria-valuemax': teto, 'aria-valuenow': efetiva ?? Math.round(innerHeight / 2),
      onKeyDown: aoApertar,
      onPointerDown: (e: PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); moveu.current = false; setArrastando(true) },
      onPointerMove: (e: PointerEvent) => {
        if (!arrastando) return
        moveu.current = true
        gaveta.current?.closest<HTMLElement>('.pagina')?.style.setProperty('--gaveta', `${alturaDoPonteiro(e)}px`)
      },
      // Um clique sem arrasto na alça não muda a altura.
      onPointerUp: (e: PointerEvent) => { setArrastando(false); if (moveu.current) escolher(alturaDoPonteiro(e)) },
    },
  }
}
