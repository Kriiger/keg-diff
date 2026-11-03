// As telas da revisão fora do fluxo (a do fluxo é tela-do-fluxo.tsx): as listas de trechos, o diff dos trechos e os atalhos de uma letra.
import { PatchDiff, type DiffLineAnnotation, type FileDiffOptions } from '@pierre/diffs/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LINHAS_DE_CONTEXTO, montarPatchComContexto, patchSemContexto, type Ampliacao } from '../src/contexto'
import type { AchadosEscolhidos, Estado, Revisao } from '../src/contrato'
import { temComentario } from '../src/linhas'
import { gruposSemNarracao } from '../src/orfaos'
import { useConteudo } from './arquivos'
import { useComentariosDeLinha, type Anotacao, type AnotacaoDeLinha, type ComentarLinha } from './comentarios-de-linha'
import { Decisoes } from './decisoes'
import { folhaAberta } from './folha'
import type { Decidir, Decisao, EscolherAchados, Item } from './main'
import { useTrocando } from './modo'
import { FrasesDoOrfao, type Narrador } from './narracao'
import { controlesDoPatch, ehControle, MaisContexto, type AnotacaoDeControle, type Controle } from './mais-contexto'
import { indiceInicial, useCursor, type Navegacao } from './proximo'
import { MODOS, useTema } from './tema'

// Um tema claro e um escuro; qual vale vem da escolha da pessoa (tema.tsx) ou, em "Sistema", do prefers-color-scheme. O fundo do diff vem de estilo/telas.css.
export const TEMAS = { light: 'github-light', dark: 'github-dark' } as const

export interface Contexto {
  revisao: Revisao
  estado: Estado
  decidir: Decidir
  comentarLinha: ComentarLinha
  achados: AchadosEscolhidos
  escolherAchados: EscolherAchados
  ladoALado: boolean
  narrador: Narrador
  mapa: { aberto: boolean; alternar: () => void }
  navegacao: Navegacao
}

// "e89d090ae0d6...bf157df72e51" vira "e89d090...bf157df", como o git log --oneline mostra.
export function encurtarBase(base: string): string {
  return base.replace(/\b([0-9a-f]{7})[0-9a-f]{33}\b/g, '$1')
}

export function decididos(hunkIds: string[], estado: Estado): number {
  return hunkIds.filter(id => estado[id]).length
}

// Atalhos de uma letra, fora das caixas de texto. Com a folha do arquivo aberta eles não agem na página que está por baixo
// (o Esc é da própria folha, ver folha-do-arquivo.tsx).
export function useAtalhos(atalhos: Record<string, () => void>) {
  const atuais = useRef(atalhos)
  atuais.current = atalhos
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.metaKey || evento.ctrlKey || evento.altKey || folhaAberta()) return
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

// "itemInicial" é a posição do item que o endereço pede (#orfaos/3, o link do Fechamento); o n pede pelo cursor, que vale mais.
export function TelaDeTrechos(props: Contexto & { rota: string; titulo: string; explicacao: string; itens: Item[]; opcoes: readonly Decisao[]; itemInicial?: string }) {
  const { rota, titulo, explicacao, itens, opcoes, itemInicial, revisao, estado, decidir, comentarLinha, achados, escolherAchados, ladoALado, narrador, navegacao } = props
  const posicaoDoEndereco = itemInicial !== undefined && /^\d+$/.test(itemInicial) ? Math.max(0, Math.min(Number(itemInicial), itens.length - 1)) : undefined
  const [indice, setIndice] = useState(() => indiceInicial(navegacao, rota) ?? posicaoDoEndereco ?? 0)
  const [comentando, setComentando] = useState(false)
  // As frases do narrador de um item acendem no diff dele as linhas da âncora; só um item por vez tem destaque.
  const [destaque, setDestaque] = useState<{ chave: string; linhas: [number, number] } | null>(null)
  // Um link para outro item da mesma tela (o Fechamento, de dentro de #orfaos) não remonta a tela: o índice acompanha o endereço.
  useEffect(() => {
    if (posicaoDoEndereco !== undefined) setIndice(posicaoDoEndereco)
  }, [posicaoDoEndereco])
  // Os órfãos são narrados quando você abre a tela deles, como o fluxo quando você o abre. Com o narrador em pausa ou desligado, o pedido nem sai.
  const narradorPronto = narrador.estado?.ativo === true && !narrador.estado.pausa
  const pendentes = rota === 'orfaos' ? gruposSemNarracao(revisao).map(g => g.id) : []
  const chaveDosPendentes = pendentes.join()
  useEffect(() => {
    if (narradorPronto && pendentes.length > 0) narrador.pedir(pendentes, false)
  }, [narradorPronto, chaveDosPendentes])
  useEffect(() => {
    document.getElementById(`item-${indice}`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])
  const andar = (passos: number) => {
    setComentando(false)
    setIndice(atual => Math.min(Math.max(atual + passos, 0), itens.length - 1))
  }
  useCursor(navegacao, rota, indice, destino => andar(destino - indice))
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
          {item.grupo && <FrasesDoOrfao explicacao={item.explicacao} hunkIds={item.hunkIds} grupo={item.grupo} narrador={narrador} destacar={linhas => setDestaque(linhas && { chave: item.chave, linhas })} achados={achados} escolher={escolherAchados} />}
          <Decisoes hunkIds={item.hunkIds} opcoes={opcoes} estado={estado} decidir={decidir} comentando={comentando && i === indice} setComentando={setComentando} />
          <DiffDosTrechos revisao={revisao} arquivo={item.arquivo} hunkIds={item.hunkIds} estado={estado} comentarLinha={comentarLinha} ladoALado={ladoALado} destaque={destaque?.chave === item.chave ? destaque.linhas : null} />
        </article>
      ))}
    </section>
  )
}

// Os trechos do review.json vêm sem linhas de contexto (git diff --unified=0). O diff mostra exatamente os trechos que a decisão marca, nem mais
// nem menos, cada um com 3 linhas de cada lado lidas do arquivo de chegada (ver arquivos.ts e contexto.ts); o resto do arquivo fica escondido,
// e uma linha embaixo de cada bloco (mais-contexto.tsx) pede mais, de 20 em 20 ou até o trecho vizinho. O patch é montado inteiro aqui e o realce
// continua só nas linhas que estão nele: abrir o arquivo todo seria o Shiki lendo-o de ponta a ponta a cada trecho. Sem o arquivo (a busca falhou
// ou ele não bate com os trechos), o diff volta a ser o de antes, sem contexto.
// "destaque" são as linhas da âncora da frase sob o mouse, no lado novo do arquivo.
// O "+" ao lado do número de cada linha alterada abre o comentário daquela linha (comentarios-de-linha.tsx); nas de contexto ele nem aparece.
export const ALTURA_DA_LINHA = 20
const SEM_ANOTACOES: DiffLineAnnotation<Anotacao | Controle>[] = []
const SEM_CONTROLES: AnotacaoDeControle[] = []
const SO_NAS_LINHAS_ALTERADAS = '[data-line-type="context"] [data-gutter-utility-slot], [data-line-type="context-expanded"] [data-gutter-utility-slot] { display: none; }'

export function DiffDosTrechos({ revisao, arquivo, hunkIds, estado, comentarLinha, ladoALado, destaque }: { revisao: Revisao; arquivo: string; hunkIds: string[]; estado: Estado; comentarLinha: ComentarLinha; ladoALado: boolean; destaque?: [number, number] | null }) {
  const tema = useTema()
  const trocando = useTrocando()
  const alterado = revisao.arquivos.find(a => a.caminho === arquivo)
  // Os trechos só mudam com a revisão ou com a escolha do passo: a identidade estável poupa o trabalho dos comentários de linha.
  const chaveDosTrechos = hunkIds.join()
  const hunks = useMemo(() => alterado?.hunks.filter(h => hunkIds.includes(h.id)) ?? [], [alterado, chaveDosTrechos])
  const { lineAnnotations: comentarios, renderAnnotation: renderizarComentario, emEdicao, aoClicarNoMais } = useComentariosDeLinha(hunks, estado, comentarLinha)
  // Arquivo novo ou removido já traz todas as linhas no patch: só o alterado precisa do arquivo de chegada.
  const conteudo = useConteudo(revisao, alterado?.status === 'alterado' && hunks.length > 0 ? arquivo : undefined)
  // O que a pessoa pediu a mais acima e abaixo de cada trecho; outro passo ou arquivo recomeça compacto.
  const [ampliacao, setAmpliacao] = useState<Record<string, Ampliacao>>({})
  const [visto, setVisto] = useState(chaveDosTrechos)
  if (visto !== chaveDosTrechos) {
    setVisto(chaveDosTrechos)
    setAmpliacao({})
  }
  const montado = useMemo(
    () => (alterado && conteudo ? montarPatchComContexto(arquivo, alterado.hunks, hunks.map(h => h.id), conteudo.linhas, ampliacao) : undefined),
    [alterado, chaveDosTrechos, conteudo, ampliacao],
  )
  const comContexto = montado !== undefined
  const controles = useMemo(() => (montado ? controlesDoPatch(montado.blocos) : SEM_CONTROLES), [montado])
  const anotacoes = useMemo<DiffLineAnnotation<Anotacao | Controle>[]>(() => (comentarios.length + controles.length === 0 ? SEM_ANOTACOES : [...comentarios, ...controles]), [comentarios, controles])
  const ampliar = (hunkId: string, sentido: 'acima' | 'abaixo', linhas: number) =>
    setAmpliacao(antes => ({ ...antes, [hunkId]: { acima: 0, abaixo: 0, ...antes[hunkId], [sentido]: (antes[hunkId]?.[sentido] ?? 0) + linhas } }))
  const renderizar = (anotacao: DiffLineAnnotation<Anotacao | Controle>) =>
    ehControle(anotacao.metadata) ? <MaisContexto controle={anotacao.metadata.controle} ampliar={ampliar} /> : renderizarComentario(anotacao as AnotacaoDeLinha)
  // As opções são comparadas campo a campo, e um valor novo desenha o diff inteiro de novo: só mudam com o tema, a visão e a chegada do contexto.
  const opcoes = useMemo<FileDiffOptions<Anotacao | Controle, undefined>>(
    () => ({
      diffStyle: ladoALado ? 'split' : 'unified', theme: TEMAS, themeType: MODOS[tema], overflow: 'wrap', enableGutterUtility: true, onGutterUtilityClick: aoClicarNoMais,
      // O vão entre os blocos é a linha dos "mostrar mais" (que diz quantas linhas ficam escondidas): o separador da biblioteca só repetiria a conta.
      hunkSeparators: comContexto ? 'simple' : 'line-info', unsafeCSS: SO_NAS_LINHAS_ALTERADAS,
    }),
    [ladoALado, tema, aoClicarNoMais, comContexto],
  )
  if (!alterado || hunks.length === 0) return null
  // Na troca de modo o diff espera a animação acabar: montá-lo dentro dela travava a transição.
  if (trocando) return <div className="diff-adiado" aria-hidden="true" />
  // O arquivo vem do servidor em poucos milissegundos (e já está no cache quando o passo foi precarregado): o lugar fica reservado, sem pulo.
  if (conteudo === undefined && alterado.status === 'alterado') {
    const linhas = hunks.reduce((total, h) => total + h.patch.split('\n').length + 2 * LINHAS_DE_CONTEXTO, 0)
    return <div className="diff-adiado" style={{ minHeight: linhas * ALTURA_DA_LINHA }} aria-hidden="true" />
  }
  const patch = montado?.patch ?? patchSemContexto(alterado, hunks)
  const selecionadas = destaque ? { start: destaque[0], end: destaque[1], side: 'additions' as const, endSide: 'additions' as const } : emEdicao
  return <PatchDiff patch={patch} selectedLines={selecionadas} lineAnnotations={anotacoes} renderAnnotation={renderizar} options={opcoes} />
}

export function marcador(hunkIds: string[], estado: Estado): string {
  if (decididos(hunkIds, estado) < hunkIds.length) return '●'
  return hunkIds.some(id => temComentario(estado[id])) ? '✎' : '✓'
}
