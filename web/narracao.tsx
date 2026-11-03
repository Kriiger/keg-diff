// O narrador na página: frases presas a linhas do diff, a frase mecânica quando não há IA e os avisos do topo.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { chaveDaFrase, ehAprofundamento, PREFIXO_DO_APROFUNDAMENTO, type AchadosEscolhidos, type Aprofundamentos, type EstadoDoNarrador, type Explicacao, type Fluxo, type Passo, type Revisao } from '../src/contrato'
import { ehGrupoDeOrfaos, gruposSemNarracao } from '../src/orfaos'
import { escutar, tolerarQueda } from './eventos'
import type { EscolherAchados } from './main'

export interface Narrador {
  estado?: EstadoDoNarrador
  pedir: (fluxos: string[], retomar: boolean) => void
  aprofundamentos: Aprofundamentos
  // Pede a explicação mais funda do bloco de uma chave (chaveDoPasso, chaveDoTrecho); o estado do narrador diz quando ela chega.
  aprofundar: (chave: string) => void
  // Troca o modelo e o esforço das próximas chamadas; devolve o motivo da recusa, ou undefined quando o servidor aceitou.
  configurar: (modelo: string, esforco: string) => Promise<string | undefined>
}

type Linhas = [number, number] | null

const VERBOS = { nasce: 'O dado nasce em', processa: 'O dado passa por', termina: 'O dado termina em' }

export function useNarrador(): Narrador {
  const [estado, setEstado] = useState<EstadoDoNarrador>()
  const [aprofundamentos, setAprofundamentos] = useState<Aprofundamentos>({})
  useEffect(() => {
    const ler = () => fetch('/api/narrador').then(r => r.json()).then(setEstado).catch(tolerarQueda)
    const lerAprofundamentos = () => fetch('/api/aprofundamentos').then(r => r.json()).then(setAprofundamentos).catch(tolerarQueda)
    const parar = [escutar('open', ler), escutar('narrador', ler), escutar('open', lerAprofundamentos), escutar('aprofundamentos', lerAprofundamentos)]
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
  const aprofundar = (chave: string) => {
    fetch('/api/aprofundar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chave }) })
      .then(r => r.json())
      .then(setEstado)
      .catch(tolerarQueda)
  }
  const configurar = (modelo: string, esforco: string) =>
    fetch('/api/config-do-narrador', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelo, esforco }) })
      .then(async r => {
        if (!r.ok) return (await r.text()) || `erro ${r.status}`
        setEstado(await r.json())
        return undefined
      })
      .catch(() => 'não consegui falar com o servidor')
  return { estado, pedir, aprofundamentos, aprofundar, configurar }
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
  // O aprofundamento mostra o próprio "Aprofundando…" no bloco dele; o aviso do topo é só dos fluxos e dos órfãos.
  const narrando = estado.narrando.filter(id => !ehAprofundamento(id))
  const orfaos = narrando.filter(ehGrupoDeOrfaos).length
  const fluxos = narrando.length - orfaos
  if (fluxos + orfaos === 0) return null
  const dosFluxos = `${fluxos} ${fluxos === 1 ? 'fluxo' : 'fluxos'}`
  return <p className="detalhe">Narrando {fluxos > 0 && dosFluxos}{fluxos > 0 && orfaos > 0 && ' e '}{orfaos > 0 && 'os órfãos'}…</p>
}

// "Narrar todos" leva os fluxos sem narração e, depois deles, os grupos de órfãos; a fila narra os fluxos primeiro.
export function BotaoNarrarTodos({ revisao, narrador }: { revisao: Revisao; narrador: Narrador }) {
  const fluxos = revisao.fluxos.filter(semNarracao)
  const grupos = gruposSemNarracao(revisao)
  if (!narrador.estado?.ativo || fluxos.length + grupos.length === 0) return null
  const ocupado = narrador.estado.narrando.some(id => !ehAprofundamento(id))
  const total = [fluxos.length > 0 && String(fluxos.length), grupos.length > 0 && 'órfãos'].filter(Boolean).join(' + ')
  return (
    <button className="narrar-todos" disabled={ocupado} onClick={() => narrador.pedir([...fluxos.map(f => f.id), ...grupos.map(g => g.id)], true)}>
      {ocupado ? 'Narrando…' : `Narrar todos (${total})`}
    </button>
  )
}

export function FrasesDoPasso({ passo, fluxo, narrador, destacar, achados, escolher }: { passo: Passo; fluxo: Fluxo; narrador: Narrador; destacar: (linhas: Linhas) => void; achados: AchadosEscolhidos; escolher: EscolherAchados }) {
  const { explicacao } = passo
  if (!explicacao) return <MecanicaDoPasso passo={passo} fluxo={fluxo} narrador={narrador} />
  return <ListaDeFrases explicacao={explicacao} hunkIds={passo.hunkIds} destacar={destacar} achados={achados} escolher={escolher} />
}

// As frases do narrador de um órfão. Sem narração ainda, não há frase mecânica (o órfão não tem grafo): fica o aviso de que está narrando ou de que falhou.
// "grupo" é o id do grupo de órfãos em que ele foi narrado, o que o estado do narrador conhece.
export function FrasesDoOrfao({ explicacao, hunkIds, grupo, narrador, destacar, achados, escolher }: { explicacao?: Explicacao; hunkIds: string[]; grupo: string; narrador: Narrador; destacar: (linhas: Linhas) => void; achados: AchadosEscolhidos; escolher: EscolherAchados }) {
  if (explicacao) return <ListaDeFrases explicacao={explicacao} hunkIds={hunkIds} destacar={destacar} achados={achados} escolher={escolher} />
  const falha = narrador.estado?.falhas[grupo]
  if (falha) return <p className="alerta">Não consegui narrar os órfãos: {falha}</p>
  return narrador.estado?.narrando.includes(grupo) ? <p className="detalhe">Narrando…</p> : null
}

// Passar o mouse numa frase acende no diff as linhas da âncora. Frase sem âncora válida aparece marcada.
// O botão no fim da linha leva a frase para o feedback da correção; clicar nele não mexe no destaque.
// Sem "escolher" (a explicação funda de um bloco) as frases não têm o botão: elas não entram no feedback.
export function ListaDeFrases({ explicacao, hunkIds, destacar, achados = {}, escolher }: { explicacao: Explicacao; hunkIds: string[]; destacar: (linhas: Linhas) => void; achados?: AchadosEscolhidos; escolher?: EscolherAchados }) {
  return (
    <ul className="frases">
      {explicacao.frases.map(({ texto, linhas }) => {
        const chave = chaveDaFrase(hunkIds, texto)
        const dentro = chave in achados
        return (
          <li
            key={texto} tabIndex={0} className={/^atenção:/i.test(texto) ? 'atencao' : ''}
            onMouseEnter={() => destacar(linhas)} onMouseLeave={() => destacar(null)} onFocus={() => destacar(linhas)} onBlur={() => destacar(null)}
          >
            {texto}{' '}
            {linhas
              ? <span className="local">linhas {linhas[0]}–{linhas[1]}</span>
              : <span className="sem-ancora" title="As linhas citadas estão fora do trecho ou faltam: confira no código">sem âncora válida</span>}
            {escolher && hunkIds.length > 0 && (
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

// O botão "explicar mais" de um bloco (um passo, um trecho da árvore) e a explicação funda que ele trouxe, com as mesmas âncoras das frases.
// Sem narrador (--sem-ia, sem login) não há botão: o aviso do topo diz o porquê. Em pausa ele também some, e volta com o "Tentar de novo" do aviso.
export function Aprofundar({ chave, narrador, destacar }: { chave: string; narrador: Narrador; destacar: (linhas: Linhas) => void }) {
  const { estado, aprofundamentos } = narrador
  const id = PREFIXO_DO_APROFUNDAMENTO + chave
  const resposta = aprofundamentos[chave]
  const pedido = estado?.narrando.includes(id)
  const falha = estado?.falhas[id]
  const pode = estado?.ativo === true && !estado.pausa
  return (
    <div className="aprofundamento">
      {resposta && (
        <>
          <ListaDeFrases explicacao={resposta} hunkIds={[]} destacar={destacar} />
          <p className="detalhe">explicação mais funda · {resposta.modelo} · esforço {resposta.esforco}</p>
        </>
      )}
      {pedido && <p className="detalhe">Aprofundando…</p>}
      {falha && <p className="alerta">Não consegui aprofundar: {falha}</p>}
      {pode && !pedido && (
        <button type="button" className="aprofundar" title="Pede ao Claude uma explicação mais funda só deste bloco, sem repetir as frases acima" onClick={evento => { evento.stopPropagation(); narrador.aprofundar(chave) }}>
          {resposta ? 'explicar de novo' : 'explicar mais'}
        </button>
      )}
    </div>
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
