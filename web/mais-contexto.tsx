// Os controles de "mostrar mais" do diff com contexto: uma linha embaixo de cada bloco (e uma no alto do primeiro) com os botões que pedem
// mais linhas de cima ou de baixo, de 20 em 20 ou todas até o trecho vizinho. Cada bloco do patch (ver montarPatchComContexto) diz quantas linhas
// sem mudança ainda esconde de cada lado; o clique soma à ampliação do trecho e a tela remonta o patch. São anotações do diff: o React as desenha
// dentro dele, e o patch continua parcial, então o realce só pinta as linhas que estão na tela.
import type { DiffLineAnnotation } from '@pierre/diffs/react'
import type { BlocoDoPatch } from '../src/contexto'

export const PASSO_DA_AMPLIACAO = 20

// Quantas linhas ainda dá para pedir de um lado e a quem o pedido pertence.
interface Pedido { hunkId: string; resta: number }

export interface Controle {
  controle: {
    total: number                  // as linhas que a faixa esconde: as que dá para pedir mais as que são de um trecho que não está na tela
    acima?: Pedido                 // o que o bloco de baixo mostraria a mais para cima
    abaixo?: Pedido                // o que o bloco de cima mostraria a mais para baixo
  }
}

export type AnotacaoDeControle = DiffLineAnnotation<Controle>

export function ehControle(metadata: unknown): metadata is Controle {
  return typeof metadata === 'object' && metadata !== null && 'controle' in metadata
}

export type Ampliar = (hunkId: string, sentido: 'acima' | 'abaixo', linhas: number) => void

// O topo prende na linha 0 do diff (acima de tudo); o resto, na última linha de cada bloco (embaixo dela).
export function controlesDoPatch(blocos: BlocoDoPatch[]): AnotacaoDeControle[] {
  const lista: AnotacaoDeControle[] = []
  const primeiro = blocos[0]
  if (primeiro && primeiro.restaAcima > 0) {
    lista.push({ side: 'additions', lineNumber: 0, metadata: { controle: { total: primeiro.restaAcima, acima: { hunkId: primeiro.primeiro, resta: primeiro.restaAcima } } } })
  }
  blocos.forEach((bloco, i) => {
    const seguinte = blocos[i + 1]
    const abaixo = bloco.restaAbaixo > 0 ? { hunkId: bloco.ultimo, resta: bloco.restaAbaixo } : undefined
    const acima = seguinte && seguinte.restaAcima > 0 ? { hunkId: seguinte.primeiro, resta: seguinte.restaAcima } : undefined
    // Entre dois blocos sempre há o vão, mesmo que os dois lados dele estejam fechados por trechos que a tela não mostra.
    const total = seguinte ? seguinte.de - bloco.ate - 1 : bloco.restaAbaixo
    if (total <= 0) return
    lista.push({ side: bloco.ultima.lado === 'novo' ? 'additions' : 'deletions', lineNumber: bloco.ultima.numero, metadata: { controle: { total, acima, abaixo } } })
  })
  return lista
}

export function MaisContexto({ controle: { total, acima, abaixo }, ampliar }: { controle: Controle['controle']; ampliar: Ampliar }) {
  return (
    <div className="mais-contexto">
      <span className="escondidas">{total} {total === 1 ? 'linha escondida' : 'linhas escondidas'}</span>
      {abaixo && <Botoes sentido="abaixo" pedido={abaixo} ampliar={ampliar} />}
      {acima && <Botoes sentido="acima" pedido={acima} ampliar={ampliar} />}
    </div>
  )
}

function Botoes({ sentido, pedido, ampliar }: { sentido: 'acima' | 'abaixo'; pedido: Pedido; ampliar: Ampliar }) {
  const seta = sentido === 'acima' ? '↑' : '↓'
  const passo = Math.min(PASSO_DA_AMPLIACAO, pedido.resta)
  const lado = sentido === 'acima' ? 'acima do trecho de baixo' : 'abaixo do trecho de cima'
  const pedir = (linhas: number) => (evento: { stopPropagation: () => void }) => {
    evento.stopPropagation()
    ampliar(pedido.hunkId, sentido, linhas)
  }
  return (
    <>
      <button type="button" onClick={pedir(passo)} aria-label={`Mostrar mais ${passo} ${passo === 1 ? 'linha' : 'linhas'} ${lado}`}>{seta} {passo}</button>
      {pedido.resta > passo && <button type="button" onClick={pedir(pedido.resta)} aria-label={`Mostrar as ${pedido.resta} linhas ${lado}`}>{seta} todas</button>}
    </>
  )
}
