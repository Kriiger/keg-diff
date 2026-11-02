// O modo árvore: a lateral mostra as pastas com os arquivos alterados e a área principal mostra o diff do arquivo escolhido.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { ArquivoAlterado, Estado, Revisao } from '../src/contrato'
import { Decisoes } from './decisoes'
import type { Decidir } from './main'
import { arquivosEmOrdem, contarLinhas, montarArvore, statusDe, type Contagem, type NoDaArvore, type StatusDoArquivo } from './pastas'
import { DiffDosTrechos, marcador, useAtalhos } from './telas'

const STATUS: Record<StatusDoArquivo, { letra: string; nome: string }> = {
  novo: { letra: 'A', nome: 'adicionado' }, alterado: { letra: 'M', nome: 'modificado' },
  removido: { letra: 'D', nome: 'removido' }, renomeado: { letra: 'R', nome: 'renomeado' },
}

// O arquivo escolhido sobrevive a sair do modo árvore e voltar (o componente desmonta); na primeira entrada, vale o primeiro.
let ultimoEscolhido: string | undefined

interface PropsDaLista {
  escolhido: string | undefined
  fechadas: Set<string>
  estado: Estado
  selecionar: (caminho: string) => void
  alternarPasta: (caminho: string) => void
}

// "cabeca" é o topo da lateral (marca e cobertura), igual ao do modo fluxo; "children" são os avisos do topo da página.
export function ModoArvore({ revisao, estado, decidir, ladoALado, cabeca, children }: { revisao: Revisao; estado: Estado; decidir: Decidir; ladoALado: boolean; cabeca: ReactNode; children: ReactNode }) {
  const nos = useMemo(() => montarArvore(revisao.arquivos), [revisao])
  const ordem = useMemo(() => arquivosEmOrdem(nos), [nos])
  const [escolhido, setEscolhido] = useState(ultimoEscolhido)
  const [fechadas, setFechadas] = useState(() => new Set<string>())
  const [comentando, setComentando] = useState(false)
  // Depois de uma revisão nova o arquivo escolhido pode ter sumido: volta para o primeiro da lista.
  const indice = Math.max(0, ordem.findIndex(a => a.caminho === escolhido))
  const atual = ordem[indice]

  // Escolher um arquivo (pelo clique ou pelo j e k) reabre as pastas que o escondem.
  const selecionar = (caminho: string) => {
    setComentando(false)
    setEscolhido(caminho)
    ultimoEscolhido = caminho
    setFechadas(antes => new Set([...antes].filter(pasta => !caminho.startsWith(`${pasta}/`))))
  }
  const andar = (passos: number) => {
    const destino = ordem[Math.min(Math.max(indice + passos, 0), ordem.length - 1)]
    if (destino) selecionar(destino.caminho)
  }
  const alternarPasta = (caminho: string) => setFechadas(antes => {
    const depois = new Set(antes)
    if (!depois.delete(caminho)) depois.add(caminho)
    return depois
  })
  const marcar = () => {
    const hunkIds = atual?.hunks.map(h => h.id) ?? []
    if (hunkIds.length === 0) return andar(1)
    const pronto = hunkIds.every(id => estado[id]?.decisao === 'revisado')
    decidir(hunkIds, pronto ? null : 'revisado')
    if (!pronto) andar(1)
  }
  useAtalhos({ j: () => andar(1), k: () => andar(-1), x: marcar, c: () => setComentando((atual?.hunks.length ?? 0) > 0) })
  useEffect(() => {
    window.scrollTo({ top: 0 })
    document.getElementById(`arquivo-${atual?.caminho}`)?.scrollIntoView({ block: 'nearest' })
  }, [atual?.caminho])

  const lista: PropsDaLista = { escolhido: atual?.caminho, fechadas, estado, selecionar, alternarPasta }
  return (
    <>
      <nav className="lateral">
        {cabeca}
        <h2>Arquivos</h2>
        <ul className="arvore">{nos.map(no => <NoDaLista key={chaveDoNo(no)} no={no} nivel={0} {...lista} />)}</ul>
      </nav>
      <main className="conteudo">
        {children}
        {atual
          ? <ArquivoEscolhido revisao={revisao} arquivo={atual} estado={estado} decidir={decidir} ladoALado={ladoALado} comentando={comentando} setComentando={setComentando} />
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
        <button id={`arquivo-${arquivo.caminho}`} className={`linha-da-arvore ${lista.escolhido === arquivo.caminho ? 'atual' : ''}`} style={recuo} aria-current={lista.escolhido === arquivo.caminho} onClick={() => lista.selecionar(arquivo.caminho)} title={arquivo.renomeadoDe ? `renomeado de ${arquivo.renomeadoDe}` : arquivo.caminho}>
          <span className={`status status-${statusDe(arquivo)}`} role="img" aria-label={status.nome}>{status.letra}</span>
          <span className="rotulo">{nome}</span>
          <span className="marcador">{hunkIds.length === 0 ? '○' : marcador(hunkIds, lista.estado)}</span>
          <Linhas contagem={contagem} />
        </button>
      </li>
    )
  }
  const aberta = !lista.fechadas.has(no.caminho)
  return (
    <li>
      <button className="linha-da-arvore pasta" style={recuo} aria-expanded={aberta} onClick={() => lista.alternarPasta(no.caminho)} title={no.caminho}>
        <svg className={aberta ? 'seta aberta' : 'seta'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <span className="rotulo">{no.nome}</span>
        <Linhas contagem={no.contagem} />
      </button>
      {aberta && <ul>{no.filhos.map(filho => <NoDaLista key={chaveDoNo(filho)} no={filho} nivel={nivel + 1} {...lista} />)}</ul>}
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
  ladoALado: boolean
  comentando: boolean
  setComentando: (comentando: boolean) => void
}

function ArquivoEscolhido({ revisao, arquivo, estado, decidir, ladoALado, comentando, setComentando }: PropsDoArquivo) {
  const hunkIds = arquivo.hunks.map(h => h.id)
  return (
    <section className="tela-do-arquivo" key={arquivo.caminho}>
      <header>
        <h1>{arquivo.caminho}</h1>
        <span className={`selo status-${statusDe(arquivo)}`}>{STATUS[statusDe(arquivo)].nome}</span>
        <Linhas contagem={contarLinhas(arquivo)} />
      </header>
      {arquivo.renomeadoDe && <p className="detalhe">Renomeado de {arquivo.renomeadoDe}.</p>}
      <Decisoes hunkIds={hunkIds} opcoes={['revisado']} estado={estado} decidir={decidir} comentando={comentando} setComentando={setComentando} />
      {hunkIds.length > 0
        ? <DiffDosTrechos revisao={revisao} arquivo={arquivo.caminho} hunkIds={hunkIds} ladoALado={ladoALado} />
        : <p className="detalhe">Sem mudança de conteúdo: o arquivo só mudou de lugar.</p>}
    </section>
  )
}
