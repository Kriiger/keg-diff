// Um trecho do arquivo aberto no modo árvore, com o que o passo do fluxo oferece: as frases do narrador, a decisão e o diff.
// Os links dos fluxos do arquivo ficam aqui também, porque são o caminho de volta ao modo fluxo.
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { LINHAS_DE_CONTEXTO } from '../src/contexto'
import { chaveDoTrecho, type AchadosEscolhidos, type Estado, type Hunk, type Revisao } from '../src/contrato'
import type { ComentarLinha } from './comentarios-de-linha'
import { Decisoes } from './decisoes'
import type { DoTrecho, FluxoDoArquivo } from './frases-do-arquivo'
import type { Decidir, Decisao, EscolherAchados } from './main'
import { alternarModo } from './modo'
import { Aprofundar, ListaDeFrases, type Narrador } from './narracao'
import { ALTURA_DA_LINHA, DiffDosTrechos, marcador } from './telas'

export interface Destaque { hunkId: string; linhas: [number, number] }

interface PropsDoTrecho {
  revisao: Revisao
  arquivo: string
  hunk: Hunk
  indice: number
  total: number
  atual: boolean
  orfao: boolean
  opcoes: readonly Decisao[]
  estado: Estado
  decidir: Decidir
  comentarLinha: ComentarLinha
  ladoALado: boolean
  comentando: boolean
  setComentando: (comentando: boolean) => void
  dados: DoTrecho
  narrador: Narrador
  achados: AchadosEscolhidos
  escolherAchados: EscolherAchados
  destaque: Destaque | null
  setDestaque: (destaque: Destaque | null) => void
  escolher: (indice: number) => void
}

// Cada trecho tem o seu diff (o PatchDiff e o Shiki são a parte cara): só monta quando chega perto da tela, e o trecho atual monta já.
// Montado, fica: desmontar perderia a caixa de comentário de linha aberta. A altura estimada pelas linhas do patch segura o lugar.
const MARGEM_DE_ANTECIPACAO = '1200px 0px'

function useChegouPerto(ref: RefObject<HTMLElement | null>): boolean {
  const [perto, setPerto] = useState(false)
  useEffect(() => {
    const elemento = ref.current
    if (perto || !elemento) return
    const observador = new IntersectionObserver(([entrada]) => { if (entrada?.isIntersecting) setPerto(true) }, { rootMargin: MARGEM_DE_ANTECIPACAO })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [perto, ref])
  return perto
}

export function TrechoDaArvore({ revisao, arquivo, hunk, indice, total, atual, orfao, opcoes, estado, decidir, comentarLinha, ladoALado, comentando, setComentando, dados, narrador, achados, escolherAchados, destaque, setDestaque, escolher }: PropsDoTrecho) {
  const raiz = useRef<HTMLElement>(null)
  const perto = useChegouPerto(raiz)
  const [de, ate] = hunk.linhas
  return (
    <article ref={raiz} id={`trecho-${indice}`} className={`item trecho ${atual ? 'atual' : ''}`} onClick={() => escolher(indice)}>
      <h2>
        <span className="marcador">{marcador([hunk.id], estado)}</span> Trecho {indice + 1} de {total}{' '}
        <span className="local">linhas {de}–{ate}</span>
        {orfao && <> <span className="selo risco-medio" title="Este trecho não está em nenhum fluxo">órfão</span></>}
      </h2>
      {dados.origens.map(origem => (
        <ListaDeFrases key={origem.hunkIds.join()} explicacao={origem.explicacao} hunkIds={origem.hunkIds} destacar={linhas => setDestaque(linhas && { hunkId: hunk.id, linhas })} achados={achados} escolher={escolherAchados} />
      ))}
      <PedirNarracao ids={dados.narrar} narrador={narrador} />
      <Aprofundar chave={chaveDoTrecho(hunk.id)} narrador={narrador} destacar={linhas => setDestaque(linhas && { hunkId: hunk.id, linhas })} />
      <Decisoes hunkIds={[hunk.id]} opcoes={opcoes} estado={estado} decidir={decidir} comentando={comentando} setComentando={setComentando} />
      {perto || atual
        ? <DiffDosTrechos revisao={revisao} arquivo={arquivo} hunkIds={[hunk.id]} estado={estado} comentarLinha={comentarLinha} ladoALado={ladoALado} destaque={destaque?.hunkId === hunk.id ? destaque.linhas : null} />
        : <div className="diff-adiado" style={{ minHeight: (hunk.patch.split('\n').length + 2 * LINHAS_DE_CONTEXTO) * ALTURA_DA_LINHA }} aria-hidden="true" />}
    </article>
  )
}

// O modo árvore não narra sozinho (o fluxo narra ao abrir): se o trecho tem passo ou órfão sem narração, um link discreto pede.
// Com o narrador desligado ou em pausa não há o que pedir (o aviso do topo da página diz o motivo).
function PedirNarracao({ ids, narrador }: { ids: string[]; narrador: Narrador }) {
  const { estado } = narrador
  if (ids.length === 0 || !estado?.ativo || estado.pausa) return null
  if (ids.some(id => estado.narrando.includes(id))) return <p className="detalhe">Narrando…</p>
  return <button type="button" className="narrar-trecho" onClick={evento => { evento.stopPropagation(); narrador.pedir(ids, false) }}>narrar</button>
}

// Os fluxos que passam pelo arquivo: o link leva ao passo, e como o endereço do fluxo só vale no modo fluxo, o clique troca de modo.
export function FluxosDoArquivo({ fluxos }: { fluxos: FluxoDoArquivo[] }) {
  if (fluxos.length === 0) return null
  const ir = (endereco: string) => (evento: MouseEvent) => {
    evento.preventDefault()
    location.hash = endereco
    alternarModo()
  }
  return (
    <p className="fluxos-do-arquivo detalhe">
      Aparece {fluxos.length === 1 ? 'no fluxo' : 'nos fluxos'}{' '}
      {fluxos.map(({ fluxo, passos }, i) => (
        <span key={fluxo.id}>
          {i > 0 && ' · '}
          {fluxo.titulo}:{' '}
          {passos.map((passo, j) => {
            const endereco = `fluxo/${fluxo.id}/${passo.id}`
            return <span key={passo.id}>{j > 0 && ', '}<a href={`#${endereco}`} onClick={ir(endereco)}>{passo.simbolo}</a></span>
          })}
        </span>
      ))}
    </p>
  )
}
