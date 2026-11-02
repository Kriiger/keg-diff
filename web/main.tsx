// Página de revisão: lê o review.json pelo servidor local e grava cada decisão no estado.json.
// A cobertura é a fração de trechos com decisão; a chave é o hash do trecho, como no contrato.
import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Estado, Fluxo, Revisao } from '../src/contrato'
import './estilo/tema.css'
import './estilo/base.css'
import './estilo/lateral.css'
import './estilo/telas.css'
import './estilo/alertas.css'
import './estilo/mapa.css'
import './estilo/ligacoes.css'
import './estilo/arvore.css'
import './estilo/alternador.css'
import './estilo/panorama.css'
import { AlternadorDeModo } from './alternador'
import { recarregarSeChunkSumiu } from './chunks'
import { ModoArvore } from './arvore'
import { useCronometro } from './cronometro'
import { escutar, reconectar, tolerarQueda, useServidorDesligado } from './eventos'
import { Fechamento } from './fechamento'
import { atenderJanelaExterna, ehJanelaExterna } from './janela-do-mapa'
import { MapaExterno } from './mapa-externo'
import { CabecaDaLateral, LateralDoFluxo } from './lateral'
import { alternarModo, useModo } from './modo'
import { AvisoDoNarrador, useNarrador } from './narracao'
import { Panorama } from './panorama'
import { useNavegacao } from './proximo'
import { alternarLateral, fecharGaveta } from './recolher'
import { BotaoDoTema, ciclarTema } from './tema'
import { TelaDoFluxo } from './tela-do-fluxo'
import { TelaDeTrechos, decididos, useAtalhos, type Contexto } from './telas'

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
  const modo = useModo()
  const completa = checklist !== undefined && checklist.todos.length > 0 && decididos(checklist.todos, estado) === checklist.todos.length
  const segundos = useCronometro(completa)
  // "fluxo/<id>/<passo>" é o endereço que o mapa usa para levar a um passo de outro fluxo.
  const [tela = '', id, passoDoEndereco] = endereco.split('/')
  const rota = id ? `${tela}/${id}` : tela
  const { navegacao, atalhos } = useNavegacao(checklist, estado, rota)

  // O mapa em outra janela precisa saber que esta página está viva, não importa a tela.
  useEffect(atenderJanelaExterna, [])

  useEffect(() => {
    const carregar = () => {
      fetch('/api/revisao').then(r => r.json()).then(setRevisao).catch(() => setErro('Não consegui ler o review.json.'))
      fetch('/api/estado').then(r => r.json()).then(setEstado).catch(tolerarQueda)
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
  // Panorama, fechamento, n e [ ] andam pelo endereço do modo fluxo: no modo árvore não há para onde ir.
  useAtalhos({
    '?': () => setAjuda(aberta => !aberta), Escape: () => { setAjuda(false); fecharGaveta() }, v: alternarModo, l: alternarVisao, a: ciclarTema, s: alternarLateral,
    ...(modo === 'fluxo' && { p: () => (location.hash = ''), t: () => (location.hash = 'fechamento'), ...atalhos }),
  })

  const decidir: Decidir = (hunkIds, decisao, comentario) => {
    fetch('/api/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hunkIds, decisao, comentario, segundos: segundos() }) })
      .then(r => r.json())
      .then(setEstado)
      .catch(tolerarQueda)
  }

  if (erro) return <p className="aviso-central">{erro} Rode <code>keg diff</code> de novo.</p>
  if (!revisao || !checklist) return <p className="aviso-central">Carregando…</p>
  const fluxoAberto = checklist.fluxos.find(f => `fluxo/${f.fluxo.id}` === rota)?.fluxo
  const mapa = { aberto: mapaAberto, alternar: () => setMapaAberto(aberto => !aberto) }
  const contexto = { revisao, estado, decidir, ladoALado, narrador, mapa, navegacao }
  const avisoDeServidor = desligado && <p className="alerta grave servidor-desligado" role="alert">Servidor desligado. Rode <code>keg diff</code> de novo: a página reconecta sozinha. <button onClick={reconectar}>Tentar agora</button></p>

  return (
    <div className={modo === 'fluxo' && mapaAberto && fluxoAberto ? 'pagina com-mapa' : 'pagina'}>
      {modo === 'arvore'
        ? <ModoArvore revisao={revisao} estado={estado} decidir={decidir} ladoALado={ladoALado} cabeca={<CabecaDaLateral revisao={revisao} checklist={checklist} estado={estado} />}>{avisoDeServidor}</ModoArvore>
        : <>
          <LateralDoFluxo revisao={revisao} checklist={checklist} estado={estado} endereco={rota} secoes={SECOES} />
          <main className="conteudo">
            {avisoDeServidor}
            <AvisoDoNarrador narrador={narrador} />
            <TelaAtual rota={rota} fluxo={fluxoAberto} passoInicial={passoDoEndereco} checklist={checklist} segundos={segundos} contexto={contexto} />
          </main>
        </>}
      <AlternadorDeModo />
      <div className="dicas">
        <button onClick={alternarVisao}>{ladoALado ? 'empilhado' : 'lado a lado'} <kbd>l</kbd></button>
        <BotaoDoTema />
        <button onClick={() => setAjuda(true)}>atalhos <kbd>?</kbd></button>
      </div>
      {ajuda && <Ajuda fechar={() => setAjuda(false)} />}
    </div>
  )
}

// A tela do endereço: um fluxo, um grupo de trechos, o fechamento ou, se nenhum casa, o panorama.
function TelaAtual({ rota, fluxo, passoInicial, checklist, segundos, contexto }: { rota: string; fluxo?: Fluxo; passoInicial?: string; checklist: Checklist; segundos: () => number; contexto: Contexto }) {
  const { revisao, estado, narrador } = contexto
  if (fluxo) return <TelaDoFluxo fluxo={fluxo} passoInicial={passoInicial} {...contexto} />
  if (rota in SECOES) return <TelaDeTrechos key={rota} rota={rota} {...SECOES[rota as Secao]} itens={checklist[rota as Secao]} {...contexto} />
  if (rota === 'fechamento') return <Fechamento revisao={revisao} checklist={checklist} estado={estado} secoes={SECOES} segundos={segundos} />
  return <Panorama revisao={revisao} checklist={checklist} estado={estado} narrador={narrador} segundos={segundos} />
}

// A mesma lista do README e dos useAtalhos: mudou uma, mude as outras.
const ATALHOS = [
  ['j / k', 'próximo e anterior (passo no fluxo, item nas listas, arquivo na árvore)'],
  ['n', 'vai ao próximo trecho ainda não revisado, em qualquer tela; sem nenhum, abre o fechamento (modo fluxo)'],
  ['[ / ]', 'fluxo anterior e próximo (depois dos fluxos, os grupos de trechos)'],
  ['x', 'marca revisado (de novo desfaz); na árvore, o arquivo inteiro'],
  ['c', 'comenta'],
  ['d', 'código morto (órfãos)'],
  ['f', 'falso positivo (órfãos); com o mapa aberto, ajusta a vista para ver tudo'],
  ['v', 'modo fluxo ou modo árvore (arquivos e pastas)'],
  ['l', 'diff lado a lado ou empilhado'],
  ['a', 'aparência: tema do sistema, claro ou escuro'],
  ['m', 'abre e fecha o mapa de quem chama quem (no fluxo); com o mapa numa janela externa, traz essa janela à frente'],
  ['z', 'com o mapa aberto, maximiza e restaura a altura dele'],
  ['s', 'recolhe e mostra a lateral'],
  ['p', 'volta ao panorama'],
  ['t', 'abre o fechamento: terminei?'],
  ['1 a 5', 'dá a nota de controle (no fechamento)'],
  ['y', 'copia o feedback como prompt (no fechamento)'],
  ['esc', 'fecha a ajuda, o mapa, a caixa de comentário ou a lateral no celular'],
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

recarregarSeChunkSumiu()
// A janela externa do mapa é a mesma página com o endereço #mapa-externo: o mesmo bundle, outra raiz.
const Raiz = ehJanelaExterna() ? MapaExterno : App
createRoot(document.getElementById('raiz')!).render(<StrictMode><Raiz /></StrictMode>)
