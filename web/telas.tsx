// As telas da revisão: o panorama, o fluxo passo a passo e as listas de trechos fora dos fluxos.
import { PatchDiff } from '@pierre/diffs/react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { Estado, Fluxo, Passo, Revisao } from '../src/contrato'
import { AlertasDoManifesto } from './divergencias'
import type { Checklist, Decidir, Decisao, Item } from './main'
import { BotaoNarrarTodos, FrasesDoPasso, semNarracao, type Narrador } from './narracao'

// O mesmo limite do cli.ts: acima disso a revisão não fecha.
const TRECHOS_DEMAIS = 40
const ORDEM_DO_RISCO = { alto: 0, medio: 1, baixo: 2 }
const NOMES: Record<Decisao, string> = { revisado: 'Revisado', 'codigo-morto': 'Código morto', 'falso-positivo': 'Falso positivo', comentado: 'Comentado' }
const TECLAS: Record<Decisao, string> = { revisado: 'x', 'codigo-morto': 'd', 'falso-positivo': 'f', comentado: 'c' }
// O mapa leva o React Flow e o ELK (mais de 1 MB): só baixa quando alguém aperta m.
const Mapa = lazy(() => import('./mapa'))

interface Contexto {
  revisao: Revisao
  estado: Estado
  decidir: Decidir
  ladoALado: boolean
  narrador: Narrador
  mapa: { aberto: boolean; alternar: () => void }
}

// "e89d090ae0d6...bf157df72e51" vira "e89d090...bf157df", como o git log --oneline mostra.
export function encurtarBase(base: string): string {
  return base.replace(/\b([0-9a-f]{7})[0-9a-f]{33}\b/g, '$1')
}

export function decididos(hunkIds: string[], estado: Estado): number {
  return hunkIds.filter(id => estado[id]).length
}

// Atalhos de uma letra, fora das caixas de texto.
export function useAtalhos(atalhos: Record<string, () => void>) {
  const atuais = useRef(atalhos)
  atuais.current = atalhos
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (evento.target instanceof HTMLElement && evento.target.closest('textarea, input')) return
      const acao = atuais.current[evento.key]
      if (!acao) return
      evento.preventDefault()
      acao()
    }
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }, [])
}

export function Panorama({ revisao, checklist, estado, narrador }: { revisao: Revisao; checklist: Checklist; estado: Estado; narrador: Narrador }) {
  const { metricas } = revisao
  const total = checklist.todos.length
  const feitos = decididos(checklist.todos, estado)
  const cartoes: [string, number][] = [
    ['arquivos novos', metricas.arquivosNovos], ['arquivos alterados', metricas.arquivosAlterados],
    ['fluxos', revisao.fluxos.length], ['órfãos', revisao.orfaos.length],
    ['saltos no maior fluxo', metricas.saltosMaximo], ['fronteiras cruzadas', metricas.fronteirasCruzadas],
  ]
  const fluxos = [...checklist.fluxos].sort((a, b) => ORDEM_DO_RISCO[a.fluxo.risco] - ORDEM_DO_RISCO[b.fluxo.risco])
  return (
    <section className="panorama">
      <header>
        <h1>Panorama</h1>
        <p className="detalhe">{encurtarBase(revisao.base)} · gerado às {new Date(revisao.geradoEm).toLocaleTimeString()}</p>
      </header>
      {total > TRECHOS_DEMAIS && <p className="alerta">{total} trechos é muito para uma revisão: peça ao agente para fatiar a tarefa.</p>}
      {total > 0 && feitos === total && <p className="sucesso">Revisão completa: {total} de {total} trechos com decisão.</p>}
      <div className="cartoes">
        <div className="cartao destaque"><strong>{total === 0 ? 100 : Math.round((feitos / total) * 100)}%</strong><span>{feitos} de {total} trechos</span></div>
        {cartoes.map(([rotulo, valor]) => <div key={rotulo} className="cartao"><strong>{valor}</strong><span>{rotulo}</span></div>)}
      </div>
      <AlertasDoManifesto manifesto={revisao.manifesto} />
      <h2>Fluxos por risco</h2>
      <BotaoNarrarTodos fluxos={revisao.fluxos} narrador={narrador} />
      {fluxos.length === 0 && <p className="detalhe">Nenhum fluxo: os trechos alterados estão nos órfãos e em outros trechos.</p>}
      <ol className="fluxos-do-panorama">
        {fluxos.map(({ fluxo, hunkIds }) => (
          <li key={fluxo.id}>
            <a href={`#fluxo/${fluxo.id}`}>
              <span className={`selo risco-${fluxo.risco}`}>{fluxo.risco}</span>
              <span className="rotulo">{fluxo.titulo}</span>
              <span className="detalhe">{fluxo.passos.length} passos</span>
              <span className="contagem">{decididos(hunkIds, estado)}/{hunkIds.length}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function TelaDoFluxo({ fluxo, revisao, estado, decidir, ladoALado, narrador, mapa, passoInicial }: Contexto & { fluxo: Fluxo; passoInicial?: string }) {
  // Abre no passo que o mapa pediu ou, sem pedido, no primeiro passo alterado que ainda espera decisão.
  const [indice, setIndice] = useState(() => {
    const pedido = fluxo.passos.findIndex(p => p.id === passoInicial)
    return pedido >= 0 ? pedido : Math.max(0, fluxo.passos.findIndex(p => decididos(p.hunkIds, estado) < p.hunkIds.length))
  })
  const [comentando, setComentando] = useState(false)
  const [destaque, setDestaque] = useState<[number, number] | null>(null)
  const passo = fluxo.passos[indice] ?? fluxo.passos[0]!
  // O fluxo é narrado quando você o abre. Com o narrador em pausa ou desligado, o pedido nem sai.
  const narradorPronto = narrador.estado?.ativo === true && !narrador.estado.pausa
  const faltaNarrar = semNarracao(fluxo)
  useEffect(() => {
    if (narradorPronto && faltaNarrar) narrador.pedir([fluxo.id], false)
  }, [fluxo.id, narradorPronto, faltaNarrar])
  // Atualização pela função: j apertado rápido não perde passo entre um render e outro.
  const andar = (passos: number) => {
    setComentando(false)
    setDestaque(null)
    setIndice(atual => Math.min(Math.max(atual + passos, 0), fluxo.passos.length - 1))
  }
  const marcar = () => {
    if (passo.hunkIds.length === 0) return andar(1)
    const pronto = passo.hunkIds.every(id => estado[id]?.decisao === 'revisado')
    decidir(passo.hunkIds, pronto ? null : 'revisado')
    if (!pronto) andar(1)
  }
  useAtalhos({ j: () => andar(1), k: () => andar(-1), x: marcar, c: () => setComentando(passo.hunkIds.length > 0), m: mapa.alternar, Escape: () => mapa.aberto && mapa.alternar() })

  return (
    <section className="tela-do-fluxo">
      <header>
        <h1>{fluxo.titulo}</h1>
        <span className={`selo risco-${fluxo.risco}`}>risco {fluxo.risco}</span>
        <button className="botao-do-mapa" onClick={mapa.alternar}>Mapa <kbd>m</kbd></button>
      </header>
      <div className="fluxo">
        <ol className="linha-do-tempo">
          {fluxo.passos.map((p, i) => (
            <li key={p.id}>
              <button className={`passo-da-linha papel-${p.papel} ${i === indice ? 'atual' : ''}`} onClick={() => andar(i - indice)}>
                <span className="marcador">{marcadorDoPasso(p, estado)}</span>
                <span className="papel">{p.papel}</span>
                <span className="simbolo">{p.simbolo}</span>
                <span className="local">{p.arquivo}:{p.linhas[0]}</span>
                {p.fronteira && <span className="fronteira">⇄ {p.fronteira}</span>}
              </button>
            </li>
          ))}
        </ol>
        <article className="passo">
          <h2><span className={`papel papel-${passo.papel}`}>{passo.papel}</span> {passo.simbolo} <span className="local">{passo.arquivo}:{passo.linhas[0]}–{passo.linhas[1]}</span></h2>
          <FrasesDoPasso passo={passo} fluxo={fluxo} narrador={narrador} destacar={setDestaque} />
          {(passo.avisos ?? []).map(aviso => <p key={aviso} className="alerta">{aviso}</p>)}
          <Decisoes hunkIds={passo.hunkIds} opcoes={['revisado']} estado={estado} decidir={decidir} comentando={comentando} setComentando={setComentando} />
          {passo.hunkIds.length > 0
            ? <DiffDosTrechos revisao={revisao} arquivo={passo.arquivo} hunkIds={passo.hunkIds} ladoALado={ladoALado} destaque={destaque} />
            : <CodigoDoPasso key={passo.id} passo={passo} />}
        </article>
      </div>
      {mapa.aberto && (
        <Suspense fallback={null}>
          <Mapa revisao={revisao} fluxo={fluxo} indice={indice} irParaPasso={i => andar(i - indice)} fechar={mapa.alternar} />
        </Suspense>
      )}
    </section>
  )
}

export function TelaDeTrechos(props: Contexto & { titulo: string; explicacao: string; itens: Item[]; opcoes: readonly Decisao[] }) {
  const { titulo, explicacao, itens, opcoes, revisao, estado, decidir, ladoALado } = props
  const [indice, setIndice] = useState(0)
  const [comentando, setComentando] = useState(false)
  useEffect(() => {
    document.getElementById(`item-${indice}`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])
  const andar = (passos: number) => {
    setComentando(false)
    setIndice(atual => Math.min(Math.max(atual + passos, 0), itens.length - 1))
  }
  const alternar = (decisao: Decisao) => {
    const item = itens[indice]
    if (!item || !opcoes.includes(decisao)) return
    const pronto = item.hunkIds.every(id => estado[id]?.decisao === decisao)
    decidir(item.hunkIds, pronto ? null : decisao)
    if (!pronto) andar(1)
  }
  useAtalhos({
    j: () => andar(1), k: () => andar(-1), c: () => setComentando(true),
    x: () => alternar('revisado'), d: () => alternar('codigo-morto'), f: () => alternar('falso-positivo'),
  })

  return (
    <section className="tela-de-trechos">
      <header>
        <h1>{titulo}</h1>
        <p className="detalhe">{explicacao}</p>
      </header>
      {itens.map((item, i) => (
        <article key={item.chave} id={`item-${i}`} className={`item ${i === indice ? 'atual' : ''}`} onClick={() => setIndice(i)}>
          <h2><span className="marcador">{marcador(item.hunkIds, estado)}</span> {item.titulo}</h2>
          {item.detalhe && <p className="detalhe">{item.detalhe}</p>}
          <Decisoes hunkIds={item.hunkIds} opcoes={opcoes} estado={estado} decidir={decidir} comentando={comentando && i === indice} setComentando={setComentando} />
          <DiffDosTrechos revisao={revisao} arquivo={item.arquivo} hunkIds={item.hunkIds} ladoALado={ladoALado} />
        </article>
      ))}
    </section>
  )
}

interface PropsDasDecisoes {
  hunkIds: string[]
  opcoes: readonly Decisao[]
  estado: Estado
  decidir: Decidir
  comentando: boolean
  setComentando: (comentando: boolean) => void
}

function Decisoes({ hunkIds, opcoes, estado, decidir, comentando, setComentando }: PropsDasDecisoes) {
  if (hunkIds.length === 0) return null
  const decisoes = hunkIds.map(id => estado[id])
  const comum = decisoes.every(d => d?.decisao === decisoes[0]?.decisao) ? decisoes[0] : undefined
  const salvar = (texto: string) => {
    if (texto.trim() !== '') decidir(hunkIds, 'comentado', texto.trim())
    setComentando(false)
  }
  return (
    <div className="decisoes">
      <div className="botoes">
        {opcoes.map(opcao => (
          <button key={opcao} className={comum?.decisao === opcao ? 'ativa' : ''} onClick={() => decidir(hunkIds, comum?.decisao === opcao ? null : opcao)}>
            {NOMES[opcao]} <kbd>{TECLAS[opcao]}</kbd>
          </button>
        ))}
        <button className={comum?.decisao === 'comentado' ? 'ativa' : ''} onClick={() => setComentando(true)}>
          {comum?.decisao === 'comentado' ? 'Editar comentário' : 'Comentar'} <kbd>c</kbd>
        </button>
      </div>
      {comentando && <CaixaDeComentario inicial={comum?.comentario ?? ''} salvar={salvar} cancelar={() => setComentando(false)} />}
      {!comentando && comum?.comentario && <blockquote>{comum.comentario}</blockquote>}
    </div>
  )
}

function CaixaDeComentario({ inicial, salvar, cancelar }: { inicial: string; salvar: (texto: string) => void; cancelar: () => void }) {
  const [texto, setTexto] = useState(inicial)
  return (
    <div className="comentario">
      <textarea
        autoFocus value={texto} placeholder="O que o agente precisa ajustar aqui?" onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') cancelar()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) salvar(texto)
        }}
      />
      <div className="botoes">
        <button className="ativa" onClick={() => salvar(texto)}>Salvar <kbd>⌘↵</kbd></button>
        <button onClick={cancelar}>Cancelar <kbd>esc</kbd></button>
      </div>
    </div>
  )
}

// Os trechos do review.json vêm sem linhas de contexto: o patch mostra só o que mudou.
// O diff mostra exatamente os trechos que a decisão marca, nem mais nem menos.
// "destaque" são as linhas da âncora da frase sob o mouse, no lado novo do arquivo.
function DiffDosTrechos({ revisao, arquivo, hunkIds, ladoALado, destaque }: { revisao: Revisao; arquivo: string; hunkIds: string[]; ladoALado: boolean; destaque?: [number, number] | null }) {
  const alterado = revisao.arquivos.find(a => a.caminho === arquivo)
  const hunks = alterado?.hunks.filter(h => hunkIds.includes(h.id)) ?? []
  if (!alterado || hunks.length === 0) return null
  const antes = alterado.status === 'novo' ? '/dev/null' : `a/${arquivo}`
  const depois = alterado.status === 'removido' ? '/dev/null' : `b/${arquivo}`
  const patch = [`diff --git a/${arquivo} b/${arquivo}`, `--- ${antes}`, `+++ ${depois}`, ...hunks.map(h => h.patch)].join('\n') + '\n'
  const selecionadas = destaque ? { start: destaque[0], end: destaque[1], side: 'additions' as const, endSide: 'additions' as const } : null
  return <PatchDiff patch={patch} selectedLines={selecionadas} options={{ diffStyle: ladoALado ? 'split' : 'unified', themeType: 'system', overflow: 'wrap' }} />
}

// Passo de contexto: não mudou, mas o revisor precisa ver o que ele faz com o dado.
function CodigoDoPasso({ passo }: { passo: Passo }) {
  const [codigo, setCodigo] = useState<{ de: number; linhas: string[] }>()
  useEffect(() => {
    const [de, ate] = passo.linhas
    const busca = new URLSearchParams({ arquivo: passo.arquivo, de: String(de), ate: String(Math.min(ate, de + 199)) })
    fetch(`/api/codigo?${busca}`).then(r => (r.ok ? r.json() : undefined)).then(setCodigo)
  }, [passo])
  if (!codigo) return null
  return (
    <pre className="codigo">
      {codigo.linhas.map((linha, i) => <div key={i}><span className="numero">{codigo.de + i}</span>{linha}</div>)}
    </pre>
  )
}

function marcadorDoPasso(passo: Passo, estado: Estado): string {
  return passo.hunkIds.length === 0 ? '○' : marcador(passo.hunkIds, estado)
}

function marcador(hunkIds: string[], estado: Estado): string {
  if (decididos(hunkIds, estado) < hunkIds.length) return '●'
  return hunkIds.some(id => estado[id]?.comentario) ? '✎' : '✓'
}
