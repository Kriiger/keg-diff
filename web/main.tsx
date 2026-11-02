// Página de revisão: lê o review.json pelo servidor local e grava cada decisão no estado.json.
// A cobertura é a fração de trechos com decisão; a chave é o hash do trecho, como no contrato.
import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Estado, Fluxo, Revisao } from '../src/contrato'
import { Panorama, TelaDeTrechos, TelaDoFluxo, decididos, encurtarBase, useAtalhos } from './telas'

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
  const [ladoALado, setLadoALado] = useState(() => lerPreferencia() === 'lado-a-lado')
  const checklist = useMemo(() => revisao && montarChecklist(revisao), [revisao])

  useEffect(() => {
    const carregar = () => {
      fetch('/api/revisao').then(r => r.json()).then(setRevisao).catch(() => setErro('Não consegui ler o review.json.'))
      fetch('/api/estado').then(r => r.json()).then(setEstado)
    }
    // A conexão abre no início e de novo quando outro keg diff sobe na mesma porta: nos dois casos, dados novos.
    const eventos = new EventSource('/api/eventos')
    eventos.addEventListener('open', carregar)
    eventos.addEventListener('revisao', carregar)
    const mudarEndereco = () => setEndereco(location.hash.slice(1))
    addEventListener('hashchange', mudarEndereco)
    return () => {
      eventos.close()
      removeEventListener('hashchange', mudarEndereco)
    }
  }, [])

  const alternarVisao = () => setLadoALado(atual => {
    gravarPreferencia(atual ? 'empilhado' : 'lado-a-lado')
    return !atual
  })
  useAtalhos({ '?': () => setAjuda(aberta => !aberta), Escape: () => setAjuda(false), p: () => (location.hash = ''), v: alternarVisao })

  const decidir: Decidir = (hunkIds, decisao, comentario) => {
    fetch('/api/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hunkIds, decisao, comentario }) })
      .then(r => r.json())
      .then(setEstado)
  }

  if (erro) return <p className="aviso-central">{erro} Rode <code>keg diff</code> de novo.</p>
  if (!revisao || !checklist) return <p className="aviso-central">Carregando…</p>
  const fluxoAberto = checklist.fluxos.find(f => `fluxo/${f.fluxo.id}` === endereco)?.fluxo
  const secao = endereco in SECOES ? (endereco as Secao) : undefined
  const contexto = { revisao, estado, decidir, ladoALado }

  return (
    <div className="pagina">
      <Lateral revisao={revisao} checklist={checklist} estado={estado} endereco={endereco} />
      <main className="conteudo">
        {fluxoAberto && <TelaDoFluxo key={fluxoAberto.id} fluxo={fluxoAberto} {...contexto} />}
        {secao && <TelaDeTrechos key={secao} {...SECOES[secao]} itens={checklist[secao]} {...contexto} />}
        {!fluxoAberto && !secao && <Panorama revisao={revisao} checklist={checklist} estado={estado} />}
      </main>
      <div className="dicas">
        <button onClick={alternarVisao}>{ladoALado ? 'empilhado' : 'lado a lado'} <kbd>v</kbd></button>
        <button onClick={() => setAjuda(true)}>atalhos <kbd>?</kbd></button>
      </div>
      {ajuda && <Ajuda fechar={() => setAjuda(false)} />}
    </div>
  )
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
    </nav>
  )
}

function Ajuda({ fechar }: { fechar: () => void }) {
  const atalhos = [['j / k', 'próximo e anterior'], ['x', 'marca revisado (de novo desfaz)'], ['c', 'comenta'], ['d', 'código morto (órfãos)'], ['f', 'falso positivo (órfãos)'], ['v', 'diff lado a lado ou empilhado'], ['p', 'volta ao panorama'], ['?', 'abre e fecha esta ajuda']]
  return (
    <div className="fundo-da-ajuda" onClick={fechar}>
      <dl className="ajuda">
        {atalhos.map(([tecla, acao]) => [<dt key={tecla}><kbd>{tecla}</kbd></dt>, <dd key={acao}>{acao}</dd>])}
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
