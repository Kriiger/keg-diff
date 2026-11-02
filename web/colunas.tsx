// As colunas do panorama: um masonry de verdade. Os cartões continuam filhos diretos de uma caixa só, na ordem de importância (então
// o estado de cada um, como o sinal aberto, sobrevive a qualquer redistribuição); o que muda é o lugar de cada um, calculado aqui
// com as alturas medidas. Cada cartão é posicionado (position: absolute, panorama.css) na coluna e na altura que este arquivo escolhe.
import { useLayoutEffect, useRef, type ReactNode } from 'react'

// O vão entre cartões e entre colunas, o mesmo do CSS do panorama (12px).
const VAO = 12
const LARGURA_MINIMA = 380
const MAXIMO_DE_COLUNAS = 4
const CELULAR = '(max-width: 860px)'

interface Empilhado { colunas: number[]; topos: number[]; fundos: number[] }

// Até 4 colunas de 380px ou mais, medidas pela largura da caixa (a lateral que recolhe também muda a conta); no celular, uma só.
function quantasColunas(largura: number): number {
  if (matchMedia(CELULAR).matches) return 1
  return Math.min(MAXIMO_DE_COLUNAS, Math.max(1, Math.floor((largura + VAO) / (LARGURA_MINIMA + VAO))))
}

// A coluna de cada cartão: na ordem dada, cada um vai para a coluna mais baixa até ali.
function repartir(alturas: number[], ordem: number[], quantas: number): number[] {
  const fundos = new Array<number>(quantas).fill(0)
  const colunas: number[] = []
  for (const i of ordem) {
    const coluna = fundos.indexOf(Math.min(...fundos))
    colunas[i] = coluna
    fundos[coluna] = fundos[coluna]! + alturas[i]! + VAO
  }
  return colunas
}

// Empilha cada coluna na ordem de importância (a do DOM): o topo de cada cartão e onde cada coluna termina.
function empilhar(alturas: number[], colunas: number[], quantas: number): Empilhado {
  const fundos = new Array<number>(quantas).fill(0)
  const topos = alturas.map((altura, i) => {
    const topo = fundos[colunas[i]!]!
    fundos[colunas[i]!] = topo + altura + VAO
    return topo
  })
  return { colunas, topos, fundos }
}

function desnivel({ fundos }: Empilhado): number {
  return Math.max(...fundos) - Math.min(...fundos)
}

// Pela ordem de importância, o último cartão decide o desnível, e um cartão alto no fim (o grafo) deixa uma coluna muito além das
// outras. Se o desnível passar do menor cartão, refaz a escolha das colunas com os cartões mais altos primeiro; dentro de cada
// coluna eles seguem na ordem de importância, e o resultado só vale se o desnível ficar menor.
function distribuir(alturas: number[], quantas: number): Empilhado {
  const naOrdem = alturas.map((_, i) => i)
  const pelaOrdem = empilhar(alturas, repartir(alturas, naOrdem, quantas), quantas)
  if (desnivel(pelaOrdem) < Math.min(...alturas)) return pelaOrdem
  const maioresPrimeiro = [...naOrdem].sort((a, b) => alturas[b]! - alturas[a]!)
  const pelaAltura = empilhar(alturas, repartir(alturas, maioresPrimeiro, quantas), quantas)
  return desnivel(pelaAltura) < desnivel(pelaOrdem) ? pelaAltura : pelaOrdem
}

// Ler as alturas logo depois de gravar --colunas força o layout na largura nova, então a conta já usa as alturas certas e uma
// passada só basta. Só escreve estilo (transform e altura da caixa), que não muda o tamanho de nenhum cartão: não há laço de medida.
function distribuirCartoes(raiz: HTMLElement) {
  const cartoes = Array.from(raiz.children, filho => filho as HTMLElement)
  if (cartoes.length === 0) return raiz.style.removeProperty('height')
  const quantas = Math.min(quantasColunas(raiz.clientWidth), cartoes.length)
  raiz.style.setProperty('--colunas', String(quantas))
  const { colunas, topos, fundos } = distribuir(cartoes.map(cartao => cartao.offsetHeight), quantas)
  cartoes.forEach((cartao, i) => {
    cartao.style.transform = `translate(calc(${colunas[i]} * (100% + ${VAO}px)), ${topos[i]}px)`
  })
  raiz.style.height = `${Math.max(...fundos) - VAO}px`
}

// O ResizeObserver chama antes do primeiro desenho e depois a cada mudança de largura (lateral, janela) ou de altura de um cartão
// (sinal que abre); o MutationObserver cobre cartão que entra ou sai quando a revisão muda.
export function ColunasDeCartoes({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const elemento = raiz.current!
    const medidor = new ResizeObserver(() => distribuirCartoes(elemento))
    const observarTudo = () => {
      medidor.disconnect()
      medidor.observe(elemento)
      for (const cartao of elemento.children) medidor.observe(cartao)
    }
    const vigia = new MutationObserver(observarTudo)
    vigia.observe(elemento, { childList: true })
    observarTudo()
    return () => {
      medidor.disconnect()
      vigia.disconnect()
    }
  }, [])
  return <div className="colunas-do-panorama" ref={raiz}>{children}</div>
}
