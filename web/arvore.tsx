// O modo árvore: a lateral mostra as pastas com os arquivos alterados e a área principal mostra o diff do arquivo escolhido.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { AchadosEscolhidos, ArquivoAlterado, Estado, Revisao } from '../src/contrato'
import { precarregar } from './arquivos'
import type { ComentarLinha } from './comentarios-de-linha'
import { frasesDosTrechos, fluxosDoArquivo } from './frases-do-arquivo'
import { Icone } from './icones'
import { MoldeDaLateral, SecaoRecolhivel } from './lateral'
import type { Decidir, Decisao, EscolherAchados } from './main'
import { alternarModo } from './modo'
import type { Narrador } from './narracao'
import { arquivosEmOrdem, contarLinhas, montarArvore, statusDe, type Contagem, type NoDaArvore, type StatusDoArquivo } from './pastas'
import { FluxosDoArquivo, TrechoDaArvore, type Destaque } from './trecho-da-arvore'
import { decididos, marcador, useAtalhos } from './telas'

const STATUS: Record<StatusDoArquivo, { letra: string; nome: string }> = {
  novo: { letra: 'A', nome: 'adicionado' }, alterado: { letra: 'M', nome: 'modificado' },
  removido: { letra: 'D', nome: 'removido' }, renomeado: { letra: 'R', nome: 'renomeado' },
}

// O arquivo escolhido sobrevive a sair do modo árvore e voltar (o componente desmonta); na primeira entrada, vale o primeiro.
let ultimoEscolhido: string | undefined

// Os links do panorama levam a um arquivo daqui: escolhe o arquivo e troca para o modo árvore, que o lê ao montar.
export function abrirNaArvore(caminho: string) {
  ultimoEscolhido = caminho
  alternarModo()
}

interface PropsDaLista {
  escolhido: string | undefined
  fechadas: Set<string>
  estado: Estado
  selecionar: (caminho: string) => void
  alternarPasta: (caminho: string) => void
}

// Quem decide o quê num trecho: o órfão ainda pode ser código morto ou falso positivo; o resto só é revisado.
const OPCOES_DO_ORFAO = ['revisado', 'codigo-morto', 'falso-positivo'] as const
const OPCOES_DO_TRECHO = ['revisado'] as const

interface PropsDaArvore {
  revisao: Revisao
  estado: Estado
  decidir: Decidir
  comentarLinha: ComentarLinha
  ladoALado: boolean
  narrador: Narrador
  achados: AchadosEscolhidos
  escolherAchados: EscolherAchados
  cabeca: ReactNode
  children: ReactNode
}

// "cabeca" é o topo da lateral (marca e progresso), igual ao do modo fluxo; "children" são os avisos do topo da página.
// O cursor é um arquivo e um trecho dele: j e k andam pelos trechos do arquivo e, passando da ponta, entram no arquivo vizinho (no primeiro
// trecho indo para a frente, no último voltando). x decide o trecho e salta para o próximo sem decisão; X (shift) marca o arquivo inteiro.
export function ModoArvore({ revisao, estado, decidir, comentarLinha, ladoALado, narrador, achados, escolherAchados, cabeca, children }: PropsDaArvore) {
  const nos = useMemo(() => montarArvore(revisao.arquivos), [revisao])
  const ordem = useMemo(() => arquivosEmOrdem(nos), [nos])
  // Todos os trechos na ordem da lateral, para o x achar o próximo sem decisão, e os que são órfãos (têm mais decisões).
  const trechos = useMemo(() => ordem.flatMap(arquivo => arquivo.hunks.map((hunk, trecho) => ({ caminho: arquivo.caminho, trecho, id: hunk.id }))), [ordem])
  const orfaos = useMemo(() => new Set(revisao.orfaos.flatMap(o => o.hunkIds)), [revisao])
  const [escolhido, setEscolhido] = useState(ultimoEscolhido)
  const [trecho, setTrecho] = useState(0)
  const [fechadas, setFechadas] = useState(() => new Set<string>())
  // O trecho que está com a caixa de comentário aberta (posição no arquivo).
  const [comentando, setComentando] = useState<number | null>(null)
  const [destaque, setDestaque] = useState<Destaque | null>(null)
  // Depois de uma revisão nova o arquivo escolhido pode ter sumido: volta para o primeiro da lista.
  const indice = Math.max(0, ordem.findIndex(a => a.caminho === escolhido))
  const atual = ordem[indice]
  const hunks = atual?.hunks ?? []
  const posicao = Math.min(trecho, Math.max(hunks.length - 1, 0))

  // Escolher um arquivo (pelo clique ou pelo j e k) reabre as pastas que o escondem.
  const selecionar = (caminho: string, noTrecho = 0) => {
    setComentando(null)
    setDestaque(null)
    setEscolhido(caminho)
    setTrecho(noTrecho)
    ultimoEscolhido = caminho
    setFechadas(antes => new Set([...antes].filter(pasta => !caminho.startsWith(`${pasta}/`))))
  }
  const escolherTrecho = (i: number) => {
    if (i === posicao) return
    setComentando(null)
    setDestaque(null)
    setTrecho(i)
  }
  const andarDeArquivo = (passos: number) => {
    const destino = ordem[Math.min(Math.max(indice + passos, 0), ordem.length - 1)]
    if (destino) selecionar(destino.caminho)
  }
  // Dentro do arquivo anda de trecho em trecho; na ponta passa ao arquivo vizinho (arquivo sem trecho, só renomeado, conta como uma parada).
  const andar = (passos: 1 | -1) => {
    const destino = posicao + passos
    if (destino >= 0 && destino < hunks.length) return escolherTrecho(destino)
    const vizinho = ordem[indice + passos]
    if (vizinho) selecionar(vizinho.caminho, passos === 1 ? 0 : Math.max(vizinho.hunks.length - 1, 0))
  }
  const alternarPasta = (caminho: string) => setFechadas(antes => {
    const depois = new Set(antes)
    if (!depois.delete(caminho)) depois.add(caminho)
    return depois
  })
  // Depois de decidir um trecho, o cursor vai ao próximo sem decisão na ordem da lateral, dando a volta (como o n); sem outro, fica.
  const aoDecidir = (id: string) => {
    const aqui = trechos.findIndex(t => t.id === id)
    const proximo = [...trechos.slice(aqui + 1), ...trechos.slice(0, aqui)].find(t => t.id !== id && !estado[t.id])
    if (!proximo) return
    if (proximo.caminho === atual?.caminho) escolherTrecho(proximo.trecho)
    else selecionar(proximo.caminho, proximo.trecho)
  }
  const alternarDecisao = (decisao: Decisao) => {
    const hunk = hunks[posicao]
    if (!hunk) return decisao === 'revisado' ? andarDeArquivo(1) : undefined
    if (decisao !== 'revisado' && !orfaos.has(hunk.id)) return
    const pronto = estado[hunk.id]?.decisao === decisao
    decidir([hunk.id], pronto ? null : decisao)
    if (!pronto) aoDecidir(hunk.id)
  }
  // O arquivo inteiro: marca (ou desmarca) todos os trechos de uma vez e passa ao arquivo seguinte.
  const marcarArquivo = () => {
    const hunkIds = hunks.map(h => h.id)
    if (hunkIds.length === 0) return andarDeArquivo(1)
    const pronto = hunkIds.every(id => estado[id]?.decisao === 'revisado')
    decidir(hunkIds, pronto ? null : 'revisado')
    if (!pronto) andarDeArquivo(1)
  }
  useAtalhos({
    j: () => andar(1), k: () => andar(-1), x: () => alternarDecisao('revisado'), X: marcarArquivo,
    d: () => alternarDecisao('codigo-morto'), f: () => alternarDecisao('falso-positivo'),
    c: () => setComentando(hunks.length > 0 ? posicao : null),
  })
  // Chegar a um arquivo começa no alto; andar entre os trechos leva o trecho atual à vista.
  useEffect(() => {
    document.getElementById(`arquivo-${atual?.caminho}`)?.scrollIntoView({ block: 'nearest' })
  }, [atual?.caminho])
  useEffect(() => {
    if (posicao === 0) window.scrollTo({ top: 0 })
    else document.getElementById(`trecho-${posicao}`)?.scrollIntoView({ block: 'nearest' })
  }, [atual?.caminho, posicao])

  const lista: PropsDaLista = { escolhido: atual?.caminho, fechadas, estado, selecionar, alternarPasta }
  return (
    <>
      <MoldeDaLateral cabeca={cabeca}>
        <SecaoRecolhivel titulo="Arquivos">
          <ul className="arvore">{nos.map(no => <NoDaLista key={chaveDoNo(no)} no={no} nivel={0} {...lista} />)}</ul>
        </SecaoRecolhivel>
      </MoldeDaLateral>
      <main className="conteudo">
        {children}
        {atual
          ? <ArquivoEscolhido revisao={revisao} arquivo={atual} estado={estado} decidir={decidir} comentarLinha={comentarLinha} ladoALado={ladoALado} orfaos={orfaos} posicao={posicao} escolherTrecho={escolherTrecho} comentando={comentando} setComentando={setComentando} destaque={destaque} setDestaque={setDestaque} marcarArquivo={marcarArquivo} narrador={narrador} achados={achados} escolherAchados={escolherAchados} />
          : <p className="detalhe">Nenhum arquivo alterado.</p>}
      </main>
    </>
  )
}

function chaveDoNo(no: NoDaArvore): string {
  return no.tipo === 'pasta' ? no.caminho : no.arquivo.caminho
}

function NoDaLista({ no, nivel, ...lista }: PropsDaLista & { no: NoDaArvore; nivel: number }) {
  const recuo = { '--nivel': nivel } as CSSProperties
  if (no.tipo === 'arquivo') {
    const { arquivo, nome, contagem } = no
    const status = STATUS[statusDe(arquivo)]
    const hunkIds = arquivo.hunks.map(h => h.id)
    return (
      <li>
        <button id={`arquivo-${arquivo.caminho}`} className={`linha-da-arvore arquivo ${lista.escolhido === arquivo.caminho ? 'atual' : ''}`} style={recuo} aria-current={lista.escolhido === arquivo.caminho} onClick={() => lista.selecionar(arquivo.caminho)} title={arquivo.renomeadoDe ? `renomeado de ${arquivo.renomeadoDe}` : arquivo.caminho}>
          <Icone nome="arquivo" />
          <span className="rotulo">{nome}</span>
          <span className="marcador">{hunkIds.length === 0 ? '○' : marcador(hunkIds, lista.estado)}</span>
          <Linhas contagem={contagem} />
          <span className={`status status-${statusDe(arquivo)}`} role="img" aria-label={status.nome}>{status.letra}</span>
        </button>
      </li>
    )
  }
  const aberta = !lista.fechadas.has(no.caminho)
  return (
    <li>
      <button className="linha-da-arvore pasta" style={recuo} aria-expanded={aberta} onClick={() => lista.alternarPasta(no.caminho)} title={no.caminho}>
        <Icone nome="chevron" classe={aberta ? 'seta aberta' : 'seta'} />
        <Icone nome={aberta ? 'pastaAberta' : 'pasta'} />
        <span className="rotulo">{no.nome}</span>
        <Linhas contagem={no.contagem} />
      </button>
      {aberta && <ul style={recuo}>{no.filhos.map(filho => <NoDaLista key={chaveDoNo(filho)} no={filho} nivel={nivel + 1} {...lista} />)}</ul>}
    </li>
  )
}

// +N em verde e −M em vermelho: a cor só diz acréscimo ou remoção.
function Linhas({ contagem }: { contagem: Contagem }) {
  return (
    <span className="linhas">
      {contagem.mais > 0 && <span className="mais">+{contagem.mais}</span>}
      {contagem.menos > 0 && <span className="menos">−{contagem.menos}</span>}
    </span>
  )
}

interface PropsDoArquivo {
  revisao: Revisao
  arquivo: ArquivoAlterado
  estado: Estado
  decidir: Decidir
  comentarLinha: ComentarLinha
  ladoALado: boolean
  orfaos: Set<string>
  posicao: number
  escolherTrecho: (indice: number) => void
  comentando: number | null
  setComentando: (indice: number | null) => void
  destaque: Destaque | null
  setDestaque: (destaque: Destaque | null) => void
  marcarArquivo: () => void
  narrador: Narrador
  achados: AchadosEscolhidos
  escolherAchados: EscolherAchados
}

function ArquivoEscolhido({ revisao, arquivo, estado, decidir, comentarLinha, ladoALado, orfaos, posicao, escolherTrecho, comentando, setComentando, destaque, setDestaque, marcarArquivo, narrador, achados, escolherAchados }: PropsDoArquivo) {
  // Só mudam com a revisão e o arquivo: as frases e os fluxos não se refazem a cada decisão ou tecla.
  const frases = useMemo(() => frasesDosTrechos(revisao, arquivo), [revisao, arquivo])
  const fluxos = useMemo(() => fluxosDoArquivo(revisao, arquivo.caminho), [revisao, arquivo.caminho])
  // O arquivo inteiro chega uma vez para todos os trechos dele: o contexto de cada diff nasce sem esperar a busca de cada um.
  useEffect(() => {
    if (arquivo.status === 'alterado' && arquivo.hunks.length > 0) precarregar(revisao, arquivo.caminho)
  }, [revisao, arquivo.caminho])
  const hunkIds = arquivo.hunks.map(h => h.id)
  const inteiro = hunkIds.length > 0 && hunkIds.every(id => estado[id]?.decisao === 'revisado')
  return (
    <section className="tela-do-arquivo" key={arquivo.caminho}>
      <header>
        <h1>{arquivo.caminho}</h1>
        <span className={`selo status-${statusDe(arquivo)}`}>{STATUS[statusDe(arquivo)].nome}</span>
        <Linhas contagem={contarLinhas(arquivo)} />
        {hunkIds.length > 0 && <span className="detalhe">{decididos(hunkIds, estado)} de {hunkIds.length} {hunkIds.length === 1 ? 'trecho' : 'trechos'} com decisão</span>}
        {hunkIds.length > 0 && <button type="button" className={inteiro ? 'ativa' : ''} onClick={marcarArquivo}>Arquivo inteiro revisado <kbd>X</kbd></button>}
      </header>
      {arquivo.renomeadoDe && <p className="detalhe">Renomeado de {arquivo.renomeadoDe}.</p>}
      <FluxosDoArquivo fluxos={fluxos} />
      {hunkIds.length === 0 && <p className="detalhe">Sem mudança de conteúdo: o arquivo só mudou de lugar.</p>}
      {arquivo.hunks.map((hunk, i) => (
        <TrechoDaArvore
          key={hunk.id} revisao={revisao} arquivo={arquivo.caminho} hunk={hunk} indice={i} total={arquivo.hunks.length} atual={i === posicao}
          orfao={orfaos.has(hunk.id)} opcoes={orfaos.has(hunk.id) ? OPCOES_DO_ORFAO : OPCOES_DO_TRECHO} estado={estado} decidir={decidir} comentarLinha={comentarLinha} ladoALado={ladoALado}
          comentando={comentando === i} setComentando={aberta => setComentando(aberta ? i : null)} dados={frases.get(hunk.id)!} narrador={narrador} achados={achados} escolherAchados={escolherAchados}
          destaque={destaque} setDestaque={setDestaque} escolher={escolherTrecho}
        />
      ))}
    </section>
  )
}
