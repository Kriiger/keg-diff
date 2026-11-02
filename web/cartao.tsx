// As peças comuns dos cartões do panorama: o cartão, o número grande, as barras e os links para o arquivo.
import type { ReactNode } from 'react'
import { abrirNaArvore } from './arvore'
import { Caminho } from './caminho'
import type { Contagem } from './pastas'

// Um cartão do panorama; a posição dele nas colunas é calculada por quem o contém (colunas.tsx), a partir da altura medida.
export function Cartao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="cartao">
      <h2>{titulo}{dica && <span className="detalhe">{dica}</span>}</h2>
      {children}
    </section>
  )
}

// "dica" é a linha miúda embaixo: de onde o número vem, quando isso muda como lê-lo.
export function Numero({ valor, rotulo, dica, tom }: { valor: ReactNode; rotulo: ReactNode; dica?: string; tom?: 'ok' }) {
  return <div className={tom ? `numero tom-${tom}` : 'numero'}><strong>{valor}</strong><span>{rotulo}</span>{dica && <span className="dica">{dica}</span>}</div>
}

// Uma barra de largura proporcional; só ganha cor quando mede risco (alto, médio, baixo) ou o que já está revisado (ok).
export function Barra({ valor, maximo, tom }: { valor: number; maximo: number; tom?: 'alto' | 'medio' | 'baixo' | 'ok' }) {
  return <span className="barra" aria-hidden="true"><span className={tom ? `tom-${tom}` : undefined} style={{ width: `${maximo === 0 ? 0 : (valor / maximo) * 100}%` }} /></span>
}

// O que entrou (verde) e o que saiu (vermelho) na mesma barra, na escala do maior arquivo ou pasta.
export function BarraDeLinhas({ mais, menos, maximo }: Contagem & { maximo: number }) {
  const parte = (valor: number) => `${maximo === 0 ? 0 : (valor / maximo) * 100}%`
  return <span className="barra duas" aria-hidden="true"><span className="mais" style={{ width: parte(mais) }} /><span className="menos" style={{ width: parte(menos) }} /></span>
}

export function Linhas({ mais, menos }: Contagem) {
  return <span className="linhas"><span className="mais">+{mais}</span><span className="menos">−{menos}</span></span>
}

// Link para o arquivo no modo árvore; com "href", leva ao passo do fluxo que o contém.
export function LinkDoArquivo({ caminho, href, children }: { caminho: string; href?: string; children?: ReactNode }) {
  if (href) return <a className="link-do-arquivo" href={href}>{children ?? <Caminho caminho={caminho} />}</a>
  return <button type="button" className="link-do-arquivo" onClick={() => abrirNaArvore(caminho)} title="Abrir no modo árvore">{children ?? <Caminho caminho={caminho} />}</button>
}
