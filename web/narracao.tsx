// O narrador na página: frases presas a linhas do diff, a frase mecânica quando não há IA e os avisos do topo.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { chaveDaFrase, type AchadosEscolhidos, type EstadoDoNarrador, type Fluxo, type Passo } from '../src/contrato'
import { escutar, tolerarQueda } from './eventos'
import type { EscolherAchados } from './main'

export interface Narrador {
  estado?: EstadoDoNarrador
  pedir: (fluxos: string[], retomar: boolean) => void
}

type Linhas = [number, number] | null

const VERBOS = { nasce: 'O dado nasce em', processa: 'O dado passa por', termina: 'O dado termina em' }

export function useNarrador(): Narrador {
  const [estado, setEstado] = useState<EstadoDoNarrador>()
  useEffect(() => {
    const ler = () => fetch('/api/narrador').then(r => r.json()).then(setEstado).catch(tolerarQueda)
    const parar = [escutar('open', ler), escutar('narrador', ler)]
    return () => {
      for (const desfazer of parar) desfazer()
    }
  }, [])
  const pedir = (fluxos: string[], retomar: boolean) => {
    fetch('/api/narrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fluxos, retomar }) })
      .then(r => r.json())
      .then(setEstado)
      .catch(tolerarQueda)
  }
  return { estado, pedir }
}

export function semNarracao(fluxo: Fluxo): boolean {
  return fluxo.passos.some(p => p.hunkIds.length > 0 && !p.explicacao)
}

// Aviso no topo da página: por que não há narração, ou que ela parou e só volta quando a pessoa pedir.
export function AvisoDoNarrador({ narrador }: { narrador: Narrador }) {
  const { estado, pedir } = narrador
  if (!estado) return null
  if (!estado.ativo) return <p className="alerta">Narrador desligado: {estado.motivo}. Os passos mostram a frase mecânica.</p>
  if (estado.pausa) {
    return (
      <p className="alerta">
        Narração pausada: {estado.pausa}. O cache continua valendo e nada é repetido sozinho.{' '}
        <button onClick={() => pedir([], true)}>Tentar de novo</button>
      </p>
    )
  }
  const fluxos = estado.narrando.length
  if (fluxos === 0) return null
  return <p className="detalhe">Narrando {fluxos} {fluxos === 1 ? 'fluxo' : 'fluxos'}…</p>
}

export function BotaoNarrarTodos({ fluxos, narrador }: { fluxos: Fluxo[]; narrador: Narrador }) {
  const pendentes = fluxos.filter(semNarracao)
  if (!narrador.estado?.ativo || pendentes.length === 0) return null
  const ocupado = narrador.estado.narrando.length > 0
  return (
    <button className="narrar-todos" disabled={ocupado} onClick={() => narrador.pedir(pendentes.map(f => f.id), true)}>
      {ocupado ? 'Narrando…' : `Narrar todos (${pendentes.length})`}
    </button>
  )
}

// Passar o mouse numa frase acende no diff as linhas da âncora. Frase sem âncora válida aparece marcada.
// O botão no fim da linha leva a frase para o feedback da correção; clicar nele não mexe no destaque.
export function FrasesDoPasso({ passo, fluxo, narrador, destacar, achados, escolher }: { passo: Passo; fluxo: Fluxo; narrador: Narrador; destacar: (linhas: Linhas) => void; achados: AchadosEscolhidos; escolher: EscolherAchados }) {
  const { explicacao } = passo
  if (!explicacao) return <MecanicaDoPasso passo={passo} fluxo={fluxo} narrador={narrador} />
  return (
    <ul className="frases">
      {explicacao.frases.map(({ texto, linhas }) => {
        const chave = chaveDaFrase(passo.hunkIds, texto)
        const dentro = chave in achados
        return (
          <li
            key={texto} tabIndex={0} className={/^atenção:/i.test(texto) ? 'atencao' : ''}
            onMouseEnter={() => destacar(linhas)} onMouseLeave={() => destacar(null)} onFocus={() => destacar(linhas)} onBlur={() => destacar(null)}
          >
            {texto}{' '}
            {linhas
              ? <span className="local">linhas {linhas[0]}–{linhas[1]}</span>
              : <span className="sem-ancora" title="As linhas citadas estão fora do passo ou faltam: confira no código">sem âncora válida</span>}
            {passo.hunkIds.length > 0 && (
              <button className={dentro ? 'na-correcao ativa' : 'na-correcao'} aria-pressed={dentro} onClick={e => { e.stopPropagation(); escolher([chave], !dentro) }}>
                {dentro ? 'na correção ✓' : '+ correção'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function MecanicaDoPasso({ passo, fluxo, narrador }: { passo: Passo; fluxo: Fluxo; narrador: Narrador }) {
  const falha = narrador.estado?.falhas[fluxo.id]
  const narrando = narrador.estado?.narrando.includes(fluxo.id) && passo.hunkIds.length > 0
  return (
    <>
      <p className="frase">{fraseMecanica(passo, fluxo)}{narrando && <span className="detalhe"> Narrando…</span>}</p>
      {falha && passo.hunkIds.length > 0 && <p className="alerta">Não consegui narrar este fluxo: {falha}</p>}
    </>
  )
}

// Sem IA, a frase sai do grafo: "recebe X de Y, chama Z e entrega W a Y", com o que o passo e o fluxo já sabem.
function fraseMecanica(passo: Passo, fluxo: Fluxo): ReactNode {
  const nome = (p: Passo) => <code>{p.simbolo}</code>
  const chamadores = fluxo.passos.filter(p => p.chama?.includes(passo.id))
  const chamados = fluxo.passos.filter(p => passo.chama?.includes(p.id))
  const partes: ReactNode[] = []
  if (passo.tipoEntrada !== undefined) partes.push(<>recebe <code>({passo.tipoEntrada})</code>{chamadores.length > 0 && <> de {listar(chamadores.map(nome))}</>}</>)
  else if (chamadores.length > 0) partes.push(<>é chamado por {listar(chamadores.map(nome))}</>)
  if (chamados.length > 0) partes.push(<>chama {listar(chamados.map(nome))}</>)
  if (passo.tipoSaida) partes.push(<>entrega <code>{passo.tipoSaida}</code>{chamadores.length > 0 && <> a {listar(chamadores.map(nome))}</>}</>)
  return (
    <>
      {partes.length > 0 ? <>{nome(passo)} {listar(partes)}.</> : <>{VERBOS[passo.papel]} <code>{passo.simbolo}</code>.</>}
      {passo.fronteira && ` Aqui o fluxo cruza a fronteira ${passo.fronteira}.`}
      {passo.hunkIds.length === 0 && ' Passo de contexto: não mudou neste diff.'}
    </>
  )
}

function listar(itens: ReactNode[]): ReactNode {
  return itens.map((item, i) => <Fragment key={i}>{separador(i, itens.length)}{item}</Fragment>)
}

function separador(posicao: number, total: number): string {
  if (posicao === 0) return ''
  return posicao === total - 1 ? ' e ' : ', '
}
