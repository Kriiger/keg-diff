// Página de revisão: lê o review.json pelo servidor local e grava cada decisão no estado.json.
// A cobertura é a fração de trechos com decisão; a chave é o hash do trecho, como no contrato.
import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Estado, Fluxo, Revisao } from '../src/contrato'
import { useCronometro } from './cronometro'
import { escutar, reconectar, useServidorDesligado } from './eventos'
import { Fechamento } from './fechamento'
import { AvisoDoNarrador, useNarrador } from './narracao'
import { useNavegacao } from './proximo'
import { Panorama, TelaDeTrechos, TelaDoFluxo, decididos, encurtarBase, useAtalhos, type Contexto } from './telas'

export type Decisao = Estado[string]['decisao']
export type Decidir = (hunkIds: string[], decisao: Decisao | null, comentario?: string) => void

export interface Item {
  chave: string
  titulo: string
  detalhe?: string
  arquivo: string
  hunkIds: string[]
}

export interface Checklist {
  fluxos: { fluxo: Fluxo; hunkIds: string[] }[]
  orfaos: Item[]
  testes: Item[]
  outros: Item[]
  todos: string[]
}

const MOTIVOS = {
  'sem-chamador': 'ninguém chama este código',
  'sem-saida': 'o dado não chega a nenhuma saída',
  'arquivo-sem-import': 'nenhum arquivo importa este arquivo',
}

const SECOES = {
  orfaos: { titulo: 'Órfãos', explicacao: 'Trechos alterados que não entraram em nenhum fluxo.', opcoes: ['revisado', 'codigo-morto', 'falso-positivo'] },
  testes: { titulo: 'Testes', explicacao: 'Testes ficam fora dos fluxos: conferem o produto, não são caminho do dado.', opcoes: ['revisado'] },
  outros: { titulo: 'Outros trechos', explicacao: 'O que o motor não analisa: CSS, configuração, documentação, arquivos removidos e trechos fora de funções.', opcoes: ['revisado'] },
} as const satisfies Record<string, { titulo: string; explicacao: string; opcoes: Decisao[] }>

type Secao = keyof typeof SECOES

function App() {
  const [revisao, setRevisao] = useState<Revisao>()
  const [estado, setEstado] = useState<Estado>({})
  const [erro, setErro] = useState<string>()
  const [endereco, setEndereco] = useState(location.hash.slice(1))
  const [ajuda, setAjuda] = useState(false)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [ladoALado, setLadoALado] = useState(() => lerPreferencia() === 'lado-a-lado')
  const checklist = useMemo(() => revisao && montarChecklist(revisao), [revisao])
  const narrador = useNarrador()
  const desligado = useServidorDesligado()
  const completa = checklist !== undefined && checklist.todos.length > 0 && decididos(checklist.todos, estado) === checklist.todos.length
  const segundos = useCronometro(completa)
  // "fluxo/<id>/<passo>" é o endereço que o mapa usa para levar a um passo de outro fluxo.
  const [tela = '', id, passoDoEndereco] = endereco.split('/')
  const rota = id ? `${tela}/${id}` : tela
  const { navegacao, atalhos } = useNavegacao(checklist, estado, rota)

  useEffect(() => {
    const carregar = () => {
      fetch('/api/revisao').then(r => r.json()).then(setRevisao).catch(() => setErro('Não consegui ler o review.json.'))
      fetch('/api/estado').then(r => r.json()).then(setEstado)
    }
    // A conexão abre no início e de novo quando o servidor volta ou outro keg diff sobe na mesma porta: nos três casos, dados novos.
    const parar = [escutar('open', carregar), escutar('revisao', carregar)]
    const mudarEndereco = () => setEndereco(location.hash.slice(1))
    addEventListener('hashchange', mudarEndereco)
    return () => {
      for (const desfazer of parar) desfazer()
      removeEventListener('hashchange', mudarEndereco)
    }
  }, [])

  const alternarVisao = () => setLadoALado(atual => {
    gravarPreferencia(atual ? 'empilhado' : 'lado-a-lado')
    return !atual
  })
  useAtalhos({
    '?': () => setAjuda(aberta => !aberta), Escape: () => setAjuda(false), p: () => (location.hash = ''), t: () => (location.hash = 'fechamento'), v: alternarVisao,
    ...atalhos,
  })

  const decidir: Decidir = (hunkIds, decisao, comentario) => {
    fetch('/api/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hunkIds, decisao, comentario, segundos: segundos() }) })
      .then(r => r.json())
      .then(setEstado)
  }

  if (erro) return <p className="aviso-central">{erro} Rode <code>keg diff</code> de novo.</p>
  if (!revisao || !checklist) return <p className="aviso-central">Carregando…</p>
  const fluxoAberto = checklist.fluxos.find(f => `fluxo/${f.fluxo.id}` === rota)?.fluxo
  const mapa = { aberto: mapaAberto, alternar: () => setMapaAberto(aberto => !aberto) }
  const contexto = { revisao, estado, decidir, ladoALado, narrador, mapa, navegacao }

  return (
    <div className={mapaAberto && fluxoAberto ? 'pagina com-mapa' : 'pagina'}>
      <Lateral revisao={revisao} checklist={checklist} estado={estado} endereco={rota} />
      <main className="conteudo">
        {desligado && <p className="alerta grave">Servidor desligado. Rode <code>keg diff</code> de novo: a página reconecta sozinha. <button onClick={reconectar}>Tentar agora</button></p>}
        <AvisoDoNarrador narrador={narrador} />
        <TelaAtual rota={rota} fluxo={fluxoAberto} passoInicial={passoDoEndereco} checklist={checklist} segundos={segundos} contexto={contexto} />
      </main>
      <div className="dicas">
        <button onClick={alternarVisao}>{ladoALado ? 'empilhado' : 'lado a lado'} <kbd>v</kbd></button>
        <button onClick={() => setAjuda(true)}>atalhos <kbd>?</kbd></button>
      </div>
      {ajuda && <Ajuda fechar={() => setAjuda(false)} />}
    </div>
  )
}

// A tela do endereço: um fluxo, um grupo de trechos, o fechamento ou, se nenhum casa, o panorama.
function TelaAtual({ rota, fluxo, passoInicial, checklist, segundos, contexto }: { rota: string; fluxo?: Fluxo; passoInicial?: string; checklist: Checklist; segundos: () => number; contexto: Contexto }) {
  const { revisao, estado, narrador } = contexto
  if (fluxo) return <TelaDoFluxo key={fluxo.id} fluxo={fluxo} passoInicial={passoInicial} {...contexto} />
  if (rota in SECOES) return <TelaDeTrechos key={rota} rota={rota} {...SECOES[rota as Secao]} itens={checklist[rota as Secao]} {...contexto} />
  if (rota === 'fechamento') return <Fechamento revisao={revisao} checklist={checklist} estado={estado} secoes={SECOES} segundos={segundos} />
  return <Panorama revisao={revisao} checklist={checklist} estado={estado} narrador={narrador} />
}

// A coluna da esquerda é a checklist: cada fluxo e cada grupo de trechos com o quanto falta.
function Lateral({ revisao, checklist, estado, endereco }: { revisao: Revisao; checklist: Checklist; estado: Estado; endereco: string }) {
  const feitos = decididos(checklist.todos, estado)
  const total = checklist.todos.length
  const link = (destino: string, rotulo: string, hunkIds: string[], classe = '') => (
    <a key={destino} href={`#${destino}`} className={`item-da-lista ${classe} ${endereco === destino ? 'atual' : ''}`}>
      <span className="rotulo">{rotulo}</span>
      <span className={decididos(hunkIds, estado) === hunkIds.length ? 'contagem completa' : 'contagem'}>
        {decididos(hunkIds, estado)}/{hunkIds.length}
      </span>
    </a>
  )
  return (
    <nav className="lateral">
      <a href="#" className="marca">keg diff <span>{encurtarBase(revisao.base)}</span></a>
      <div className="cobertura">
        <div className="barra"><div style={{ width: `${total === 0 ? 100 : (feitos / total) * 100}%` }} /></div>
        <span>{feitos} de {total} trechos revisados</span>
      </div>
      <a href="#" className={`item-da-lista ${endereco === '' ? 'atual' : ''}`}><span className="rotulo">Panorama</span></a>
      <h2>Fluxos</h2>
      {checklist.fluxos.map(({ fluxo, hunkIds }) => link(`fluxo/${fluxo.id}`, fluxo.titulo, hunkIds, `risco-${fluxo.risco}`))}
      {(Object.keys(SECOES) as Secao[]).filter(s => checklist[s].length > 0).map(s => (
        <div key={s}>
          <h2>{SECOES[s].titulo}</h2>
          {link(s, `${checklist[s].length} ${checklist[s].length === 1 ? 'item' : 'itens'}`, checklist[s].flatMap(i => i.hunkIds))}
        </div>
      ))}
      <h2>Fechar</h2>
      {link('fechamento', 'Fechamento', checklist.todos)}
    </nav>
  )
}

// A mesma lista do README e dos useAtalhos: mudou uma, mude as outras.
const ATALHOS = [
  ['j / k', 'próximo e anterior (passo no fluxo, item nas listas)'],
  ['n', 'vai ao próximo trecho ainda não revisado, em qualquer tela; sem nenhum, abre o fechamento'],
  ['[ / ]', 'fluxo anterior e próximo (depois dos fluxos, os grupos de trechos)'],
  ['x', 'marca revisado (de novo desfaz)'],
  ['c', 'comenta'],
  ['d', 'código morto (órfãos)'],
  ['f', 'falso positivo (órfãos)'],
  ['v', 'diff lado a lado ou empilhado'],
  ['m', 'abre e fecha o mapa de quem chama quem (no fluxo)'],
  ['p', 'volta ao panorama'],
  ['t', 'abre o fechamento: terminei?'],
  ['1 a 5', 'dá a nota de controle (no fechamento)'],
  ['y', 'copia o feedback como prompt (no fechamento)'],
  ['esc', 'fecha a ajuda, o mapa ou a caixa de comentário'],
  ['?', 'abre e fecha esta ajuda'],
]

function Ajuda({ fechar }: { fechar: () => void }) {
  return (
    <div className="fundo-da-ajuda" onClick={fechar}>
      <dl className="ajuda">
        {ATALHOS.map(([tecla, acao]) => [<dt key={tecla}><kbd>{tecla}</kbd></dt>, <dd key={acao}>{acao}</dd>])}
      </dl>
    </div>
  )
}

// Preferência de quem revisa, só neste navegador. Sem storage (aba privada), fica empilhado.
function lerPreferencia(): string | null {
  try {
    return localStorage.getItem('keg-visao')
  } catch {
    return null
  }
}

function gravarPreferencia(visao: string) {
  try {
    localStorage.setItem('keg-visao', visao)
  } catch {}
}

// Todo trecho cai em algum lugar: fluxo, órfão, teste ou "outros". É isso que fecha o N de N.
function montarChecklist(revisao: Revisao): Checklist {
  const fluxos = revisao.fluxos.map(fluxo => ({ fluxo, hunkIds: [...new Set(fluxo.passos.flatMap(p => p.hunkIds))] }))
  const orfaos = revisao.orfaos.map(o => ({
    chave: `${o.arquivo}#${o.simbolo ?? ''}`, titulo: o.simbolo ?? o.arquivo, detalhe: `${o.arquivo} · ${MOTIVOS[o.motivo]}`, arquivo: o.arquivo, hunkIds: o.hunkIds,
  }))
  const testes = revisao.testes.map(t => ({ chave: t.arquivo, titulo: t.arquivo, arquivo: t.arquivo, hunkIds: t.hunkIds }))
  const vistos = new Set([...fluxos, ...orfaos, ...testes].flatMap(g => g.hunkIds))
  const outros = revisao.arquivos.flatMap(arquivo => {
    const hunkIds = arquivo.hunks.map(h => h.id).filter(id => !vistos.has(id))
    return hunkIds.length === 0 ? [] : [{ chave: arquivo.caminho, titulo: arquivo.caminho, detalhe: arquivo.status, arquivo: arquivo.caminho, hunkIds }]
  })
  return { fluxos, orfaos, testes, outros, todos: revisao.arquivos.flatMap(a => a.hunks.map(h => h.id)) }
}

createRoot(document.getElementById('raiz')!).render(<StrictMode><App /></StrictMode>)
