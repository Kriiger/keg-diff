// Quais arquivos os fluxos atravessam, na lateral do modo fluxo: a trilha de um fluxo ("Dashboard.tsx → route.ts → Dashboard.tsx")
// e o resumo de todos eles (cada arquivo com quantos fluxos passam por ele). Os dois repetem o ícone de arquivo do modo árvore.
import { Fragment } from 'react'
import type { Fluxo } from '../src/contrato'
import { Icone } from './icones'
import { fluxosPorArquivo, nomesCurtos, plural, trilhaDoFluxo } from './resumo'

// A ordem da trilha é a dos passos e o arquivo repete quando o fluxo volta a ele: é isso que mostra o vai e volta cliente e servidor.
export function TrilhaDoFluxo({ fluxo, todos }: { fluxo: Fluxo; todos: string[] }) {
  const trilha = trilhaDoFluxo(fluxo)
  const nomes = nomesCurtos(trilha, todos)
  return (
    <span className="trilha">
      {nomes.map((nome, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="trilha-seta" aria-hidden="true">→</span>}
          <span className="trilha-arquivo" title={trilha[i]}><Icone nome="arquivo" />{nome}</span>
        </Fragment>
      ))}
    </span>
  )
}

export function ArquivosDosFluxos({ fluxos, todos }: { fluxos: Fluxo[]; todos: string[] }) {
  const doResumo = fluxosPorArquivo(fluxos)
  const nomes = nomesCurtos(doResumo.map(([arquivo]) => arquivo), todos)
  return (
    <ul className="arquivos-dos-fluxos" aria-label="Arquivos dos fluxos">
      {doResumo.map(([arquivo, quantos], i) => (
        <li key={arquivo} title={arquivo}>
          <Icone nome="arquivo" />
          <span className="rotulo">{nomes[i]}</span>
          <span className="contagem">{plural(quantos, 'fluxo', 'fluxos')}</span>
        </li>
      ))}
    </ul>
  )
}
