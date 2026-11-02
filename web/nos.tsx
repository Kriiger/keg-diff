// Os blocos do mapa: o cartão de cada função, o contêiner de cada arquivo e a montagem dos nós do React Flow.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { createContext, Fragment, useContext } from 'react'
import { Caminho } from './caminho'
import type { Destaque, Relacao } from './foco'
import { ALTURA, idDoGrupo, LARGURA, type Desenho } from './rotas'
import { contarPatch, type Contagem } from './pastas'
import type { Grafo, NoDoGrafo, Revisao } from '../src/contrato'

// Duas perguntas independentes: o trecho mudou neste diff (hunkIds, linhas) e ele é passo deste fluxo (doFluxo).
interface DadosDoNo extends Record<string, unknown> { no: NoDoGrafo; atual: boolean; doFluxo: boolean; linhas?: Contagem; escondidos: number }
// O que o desenho precisa saber além do grafo: o passo atual, os passos do fluxo e as linhas que cada bloco alterado ganhou e perdeu.
export interface Situacao { atual: string; doFluxo: Set<string>; linhas: Map<string, Contagem> }
type NoDoMapa = Node<DadosDoNo, 'no'>
type NoDoArquivo = Node<{ arquivo: string; lado?: string }, 'arquivo'>

// O destaque viaja por contexto e não pelos dados do nó: um objeto de nó novo a cada passada do mouse refaria a passada do React Flow
// por todos os blocos à toa. (As medidas, o React Flow só as guarda se o nó novo trouxer `measured`: ver montarNos.)
export const DestaqueDoMapa = createContext<Destaque | undefined>(undefined)

// O texto garante que o destaque não dependa da cor: cada bloco ligado ao foco diz o que é dele.
const RELACOES: Record<Relacao, { texto: string; dica: string }> = {
  foco: { texto: 'em foco', dica: 'o bloco que você está apontando' },
  chama: { texto: 'chama', dica: 'chama o bloco em foco' },
  chamado: { texto: 'chamado', dica: 'é chamado pelo bloco em foco' },
  ambos: { texto: 'ida e volta', dica: 'chama o bloco em foco e também é chamado por ele' },
  origem: { texto: 'origem', dica: 'de onde a ligação em foco sai' },
  destino: { texto: 'destino', dica: 'aonde a ligação em foco chega' },
}

function CartaoDoNo({ id, data }: NodeProps<NoDoMapa>) {
  const { no, atual, doFluxo, linhas, escondidos } = data
  const destaque = useContext(DestaqueDoMapa)
  const relacao = destaque?.nos.get(id)
  // O bloco isolado por clique diz "fixado": o anel do passo atual (posição na revisão) é outro, a barra à esquerda.
  const textoDaRelacao = relacao === 'foco' && destaque?.fixo ? 'fixado' : relacao && RELACOES[relacao].texto
  const apagado = destaque !== undefined && relacao === undefined
  // Dois eixos que não se misturam: a tinta diz se mudou neste diff (alterado / vizinho) e a borda diz se é do fluxo (cheia) ou contexto (tracejada).
  const mudou = no.hunkIds.length > 0
  const classes = ['no-do-mapa', `papel-${no.papel}`, mudou ? 'alterado' : 'vizinho', doFluxo ? 'do-fluxo' : 'contexto', atual && 'atual', relacao && `relacao-${relacao}`, apagado && 'apagado']
  // O símbolo pode ficar cortado no bloco: o nome inteiro, o lugar e o lado ficam aqui.
  const dica = [atual && 'Passo atual', no.simbolo, `${no.arquivo}:${no.linhas[0]}–${no.linhas[1]}`, no.lado, mudou ? 'alterado neste diff' : 'já existia', doFluxo ? 'passo do fluxo' : 'fora do fluxo'].filter(Boolean).join(' · ')
  return (
    <div className={classes.filter(Boolean).join(' ')} title={dica}>
      <Handle type="target" position={Position.Left} />
      <span className="topo">
        <span className="papel">{no.papel}</span>
        <span className="marcas">
          {relacao && <span className="relacao" title={RELACOES[relacao].dica}>{textoDaRelacao}</span>}
          {escondidos > 0 && <span className="mais" title="vizinhos escondidos: clique para mostrar">+{escondidos}</span>}
        </span>
      </span>
      {/* O nome quebra em duas linhas e só nas fronteiras de palavra (camelCase), para não cortar a parte que identifica a função. */}
      <span className="simbolo">{no.simbolo.split(/(?<=[a-z0-9])(?=[A-Z])/).map((parte, i) => <Fragment key={i}>{i > 0 && <wbr />}{parte}</Fragment>)}</span>
      {/* O texto do selo diz o mesmo que a tinta: quem lê sem cor sabe se o trecho mudou neste diff ou já existia. */}
      <span className="rodape">
        {mudou
          ? <span className="selo-alterado">alterado{linhas && <> <span className="linhas">+{linhas.mais} −{linhas.menos}</span></>}</span>
          : <span className="selo-existia">já existia</span>}
        <span className="linha">:{no.linhas[0]}</span>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

// O contêiner do arquivo, desenhado como uma pasta numa árvore: a pasta apagada, o nome em destaque e o lado (cliente/servidor) quando o arquivo tem um só.
function ContornoDoArquivo({ data }: NodeProps<NoDoArquivo>) {
  return (
    <div className="arquivo-do-mapa">
      <span className="cabeca-do-arquivo"><Caminho caminho={data.arquivo} />{data.lado && <span className="lado-do-arquivo">{data.lado}</span>}</span>
    </div>
  )
}

export const TIPOS_DE_NO = { no: CartaoDoNo, arquivo: ContornoDoArquivo }

// As linhas de cada bloco alterado: a soma dos hunks que o motor ligou a ele.
export function linhasDosNos(grafo: Grafo, revisao: Revisao): Map<string, Contagem> {
  const porHunk = new Map(revisao.arquivos.flatMap(a => a.hunks).map(h => [h.id, contarPatch(h.patch)]))
  const somar = (no: NoDoGrafo, lado: keyof Contagem) => no.hunkIds.reduce((total, id) => total + (porHunk.get(id)?.[lado] ?? 0), 0)
  return new Map(grafo.nos.filter(no => no.hunkIds.length > 0).map((no): [string, Contagem] => [no.id, { mais: somar(no, 'mais'), menos: somar(no, 'menos') }]))
}

// Cada nó leva `measured`: o React Flow só guarda a medida de um nó (e os pontos de ligação dele) se o objeto novo a trouxer, e sem ela cada
// layout esconderia todos os blocos até medir de novo. As medidas são as do ELK (blocos e contêineres têm tamanho fixo).
export function montarNos(grafo: Grafo, desenho: Desenho, { atual, doFluxo, linhas }: Situacao): (NoDoMapa | NoDoArquivo)[] {
  const porId = new Map(grafo.nos.map(no => [no.id, no]))
  // O que o grafo sabe do nó e a tela não mostra: vizinhos escondidos, mais os que o corte do motor deixou de fora.
  const escondidos = (no: NoDoGrafo) => {
    const vizinhos = new Set<string>()
    for (const { de, para } of grafo.arestas) {
      if (de === no.id) vizinhos.add(para)
      if (para === no.id) vizinhos.add(de)
    }
    return [...vizinhos].filter(id => !desenho.visiveis.has(id)).length + (no.mais ?? 0)
  }
  const desenhados = [...desenho.visiveis].map((id): NoDoMapa => {
    const no = porId.get(id)!
    return {
      id, type: 'no', position: desenho.posicoes.get(id) ?? { x: 0, y: 0 }, measured: { width: LARGURA, height: ALTURA },
      data: { no, atual: id === atual, doFluxo: doFluxo.has(id), linhas: linhas.get(id), escondidos: escondidos(no) },
      sourcePosition: Position.Right, targetPosition: Position.Left, ariaLabel: `${no.simbolo}, ${no.papel}, ${no.arquivo} linha ${no.linhas[0]}`,
    }
  })
  return [...contornosDosArquivos(desenho, desenhados), ...desenhados]
}

// Irmãos dos blocos, não pais: as coordenadas do ELK já são absolutas, e abaixo das ligações (zIndex -1) o vidro do contêiner não esconde nenhuma rota.
// O lado só vira etiqueta quando todos os blocos do arquivo concordam.
function contornosDosArquivos({ grupos }: Desenho, blocos: NoDoMapa[]): NoDoArquivo[] {
  return [...grupos].map(([arquivo, caixa]) => {
    const lados = new Set(blocos.filter(b => b.data.no.arquivo === arquivo).map(b => b.data.no.lado).filter(Boolean))
    return {
      id: idDoGrupo(arquivo), type: 'arquivo', position: { x: caixa.x, y: caixa.y }, width: caixa.width, height: caixa.height,
      measured: { width: caixa.width, height: caixa.height }, data: { arquivo, lado: lados.size === 1 ? [...lados][0] : undefined },
      draggable: false, selectable: false, focusable: false, zIndex: -1, style: { pointerEvents: 'none' },
    }
  })
}
