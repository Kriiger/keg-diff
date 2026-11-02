// A legenda das ligações, no cabeçalho do mapa. As amostras usam as mesmas classes das ligações de verdade
// (estilo/ligacoes.css), então o traço e a cor da legenda não têm como divergir do desenho.
import { Seta } from './arestas'
import type { Grafo } from '../src/contrato'

const TIPOS = [
  { classe: 'tipo-chamada', nome: 'chamada', dica: 'uma função chama a outra' },
  { classe: 'tipo-http', nome: 'http', dica: 'fetch para uma rota do projeto' },
  { classe: 'tipo-dinamico', nome: 'dinâmico', dica: 'o compilador não prova: callback em prop, função num objeto' },
  { classe: 'tipo-tipo', nome: 'usa tipo', dica: 'usa o tipo ou a interface numa anotação; nada executa' },
  { classe: 'tipo-chamada aresta-retorno', nome: 'volta', dica: 'a ligação volta para uma camada anterior: ciclo' },
]

export function Legenda() {
  return (
    <ul className="legenda-das-ligacoes" aria-label="Tipos de ligação">
      {TIPOS.map(({ classe, nome, dica }) => (
        <li key={nome} className={classe} title={dica}>
          <svg width="36" height="12" viewBox="0 0 36 12" aria-hidden="true"><path className="traco-da-aresta" d="M1,6H29" /><Seta x={35} y={6} angulo={0} /></svg>
          {nome}
        </li>
      ))}
    </ul>
  )
}

// Os dois eixos dos blocos: a tinta diz se o trecho mudou neste diff, a borda diz se ele é do fluxo. As amostras levam as classes dos blocos de verdade.
const BLOCOS = [
  { classes: 'alterado do-fluxo', nome: 'alterado · do fluxo', dica: 'passo deste fluxo que mudou neste diff: borda cheia e tinta' },
  { classes: 'vizinho do-fluxo', nome: 'já existia · do fluxo', dica: 'passo deste fluxo que o diff não mexeu: borda cheia, sem tinta' },
  { classes: 'alterado contexto', nome: 'alterado · outro fluxo', dica: 'mudou neste diff, mas pertence a outro fluxo: borda tracejada e tinta' },
  { classes: 'vizinho contexto', nome: 'já existia · contexto', dica: 'código que já existia ao redor do fluxo: borda tracejada, sem tinta' },
]

export function LegendaDosBlocos() {
  return (
    <ul className="legenda-das-ligacoes" aria-label="Tipos de bloco">
      {BLOCOS.map(({ classes, nome, dica }) => <li key={nome} title={dica}><span className={`no-do-mapa amostra ${classes}`} aria-hidden="true" />{nome}</li>)}
    </ul>
  )
}

// Contagem do que está na tela, nas quatro combinações: passos do fluxo (com quantos deles já existiam), alterações de outros fluxos e o que já existia.
export function resumoDosBlocos(grafo: Grafo, visiveis: Set<string>, doFluxo: Set<string>): string {
  const nos = grafo.nos.filter(no => visiveis.has(no.id))
  const passos = nos.filter(no => doFluxo.has(no.id))
  const semAlteracao = passos.filter(no => no.hunkIds.length === 0).length
  const fora = nos.filter(no => !doFluxo.has(no.id))
  const alteradosFora = fora.filter(no => no.hunkIds.length > 0).length
  return [
    `${passos.length} ${passos.length === 1 ? 'passo' : 'passos'} do fluxo${semAlteracao > 0 ? ` (${semAlteracao} já existia)` : ''}`,
    alteradosFora > 0 && `${alteradosFora} ${alteradosFora === 1 ? 'alteração' : 'alterações'} de outros fluxos`,
    fora.length > alteradosFora && `${fora.length - alteradosFora} já existiam`,
  ].filter(Boolean).join(' · ')
}
