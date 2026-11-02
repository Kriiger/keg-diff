// O cartão do grafo: o tamanho do mapa, quem concentra chamadas, os ciclos e os trechos que ficaram fora dos fluxos.
import { useMemo } from 'react'
import type { Revisao } from '../src/contrato'
import { Cartao, LinkDoArquivo, Numero } from './cartao'
import { enderecoDoNo } from './enderecos'
import { resumirGrafo, type Concentrador } from './grafo-resumo'
import { plural } from './resumo'

const TIPO_DA_LIGACAO = { chamada: 'chamadas', http: 'http', dinamico: 'dinâmicas', tipo: 'usos de tipo' }
const MOTIVO_DO_ORFAO = { 'sem-chamador': 'sem chamador', 'sem-saida': 'sem saída', 'arquivo-sem-import': 'arquivo que ninguém importa' }
const CICLOS_MOSTRADOS = 3

export function CartaoDoGrafo({ revisao }: { revisao: Revisao }) {
  const resumo = useMemo(() => revisao.grafo && resumirGrafo(revisao.grafo), [revisao])
  if (!resumo && revisao.orfaos.length === 0) return null
  return (
    <Cartao titulo="Grafo" dica="a vizinhança do diff, como no Mapa">
      {resumo && (
        <>
          <div className="numeros">
            <Numero valor={resumo.nos} rotulo={`funções · ${resumo.alterados} alteradas`} />
            <Numero valor={resumo.arestas.reduce((total, [, quantas]) => total + quantas, 0)} rotulo="ligações" />
          </div>
          <ul className="chips">{resumo.arestas.map(([tipo, quantas]) => <li key={tipo} className="selo">{quantas} {TIPO_DA_LIGACAO[tipo]}</li>)}</ul>
          <Concentradores titulo="Mais chamadas" lista={resumo.chamadoPorMuitos} revisao={revisao} verbo="chamada por" />
          <Concentradores titulo="Chamam mais" lista={resumo.chamaMuitos} revisao={revisao} verbo="chama" />
          <h3>Ciclos</h3>
          {resumo.ciclos.length === 0 && <p className="detalhe">Nenhum ciclo de chamadas no mapa.</p>}
          <ul className="ciclos">
            {resumo.ciclos.slice(0, CICLOS_MOSTRADOS).map(ciclo => <li key={ciclo.map(no => no.id).join()}>{ciclo.map(no => no.simbolo).join(' → ')} → {ciclo[0]!.simbolo}</li>)}
          </ul>
        </>
      )}
      <Orfaos revisao={revisao} />
    </Cartao>
  )
}

function Concentradores({ titulo, lista, revisao, verbo }: { titulo: string; lista: Concentrador[]; revisao: Revisao; verbo: string }) {
  if (lista.length === 0) return null
  return (
    <>
      <h3>{titulo}</h3>
      <ol className="concentradores">
        {lista.map(({ no, grau }) => (
          <li key={no.id}>
            <LinkDoArquivo caminho={no.arquivo} href={enderecoDoNo(revisao, no.id)}><code>{no.simbolo}</code></LinkDoArquivo>
            <span className="detalhe">{verbo} {plural(grau, 'função', 'funções')}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

function Orfaos({ revisao }: { revisao: Revisao }) {
  if (revisao.orfaos.length === 0) return null
  const motivos = Object.entries(MOTIVO_DO_ORFAO).map(([motivo, nome]) => [nome, revisao.orfaos.filter(o => o.motivo === motivo).length] as const).filter(([, quantos]) => quantos > 0)
  return (
    <>
      <h3>Fora dos fluxos</h3>
      <p><a className="link-do-arquivo" href="#orfaos"><strong>{plural(revisao.orfaos.length, 'órfão', 'órfãos')}</strong></a> <span className="detalhe">{motivos.map(([nome, quantos]) => `${quantos} ${nome}`).join(' · ')}</span></p>
    </>
  )
}
