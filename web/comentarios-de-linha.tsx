// Comentário por linha: o "+" que o diff mostra ao lado do número da linha abre uma caixa embaixo dela, e o salvo fica ali como anotação.
// O comentário pertence ao trecho (estado[hunkId].linhas), então some junto com ele quando o agente refaz o trecho.
// A chave é a posição da linha no corpo do trecho, não o número dela no arquivo (ver linhas.ts).
import { useStableCallback, type DiffLineAnnotation, type SelectedLineRange } from '@pierre/diffs/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ComentarioDeLinha, Estado, Hunk, TipoDoComentario } from '../src/contrato'
import { indiceDaLinha, linhasDoTrecho } from '../src/linhas'
import { CaixaDeComentario, TIPOS } from './decisoes'

// Texto vazio apaga. Devolve se o servidor gravou: a caixa só fecha depois, para o texto não sumir de uma queda.
export type ComentarLinha = (hunkId: string, linha: string, texto: string, tipo?: TipoDoComentario) => Promise<boolean>

// O que a anotação carrega: o trecho e a linha dele; sem "comentario", é uma caixa nova ainda por salvar.
export interface Anotacao { hunkId: string; indice: number; comentario?: ComentarioDeLinha }
export type AnotacaoDeLinha = DiffLineAnnotation<Anotacao>

// O diff só redesenha quando o array de anotações muda de identidade: o vazio é sempre o mesmo.
const SEM_ANOTACOES: AnotacaoDeLinha[] = []

interface Aberta { hunkId: string; indice: number }

// Tudo o que o PatchDiff precisa para os comentários de linha. O texto que a pessoa digita mora na caixa (estado local dela):
// digitar nunca passa por aqui, então o diff não redesenha a cada tecla. Só abrir, salvar e apagar mudam as anotações.
export function useComentariosDeLinha(hunks: Hunk[], estado: Estado, comentar: ComentarLinha) {
  const [aberta, setAberta] = useState<Aberta | null>(null)
  // Outro passo ou outro arquivo (outros trechos) não herda a caixa aberta do anterior.
  const chaveDosTrechos = hunks.map(h => h.id).join()
  const [vista, setVista] = useState(chaveDosTrechos)
  if (vista !== chaveDosTrechos) {
    setVista(chaveDosTrechos)
    setAberta(null)
  }

  const trechos = useMemo(() => hunks.map(hunk => ({ hunk, linhas: linhasDoTrecho(hunk.patch) })), [hunks])
  const salvos = hunks.flatMap(h => Object.entries(estado[h.id]?.linhas ?? {}).map(([indice, comentario]) => ({ hunkId: h.id, indice: Number(indice), comentario })))
  // O estado muda a cada decisão (o servidor devolve tudo de novo): o que decide se o diff redesenha é só isto.
  const assinatura = JSON.stringify([salvos.map(s => [s.hunkId, s.indice, s.comentario.texto, s.comentario.tipo ?? 'corrija']), aberta])

  const lineAnnotations = useMemo(() => {
    const lista: AnotacaoDeLinha[] = []
    const colocar = (hunkId: string, indice: number, comentario?: ComentarioDeLinha) => {
      const linha = trechos.find(t => t.hunk.id === hunkId)?.linhas.find(l => l.indice === indice)
      if (linha) lista.push({ side: linha.lado === 'novo' ? 'additions' : 'deletions', lineNumber: linha.numero, metadata: { hunkId, indice, comentario } })
    }
    for (const s of salvos) colocar(s.hunkId, s.indice, s.comentario)
    if (aberta && !salvos.some(s => s.hunkId === aberta.hunkId && s.indice === aberta.indice)) colocar(aberta.hunkId, aberta.indice)
    return lista.length > 0 ? lista : SEM_ANOTACOES
  }, [trechos, assinatura])

  // A linha que está recebendo a caixa fica realçada no diff.
  const emEdicao = useMemo<SelectedLineRange | null>(() => {
    const linha = aberta && trechos.find(t => t.hunk.id === aberta.hunkId)?.linhas.find(l => l.indice === aberta.indice)
    if (!linha) return null
    const side = linha.lado === 'novo' ? 'additions' as const : 'deletions' as const
    return { start: linha.numero, end: linha.numero, side, endSide: side }
  }, [trechos, aberta])

  // Estável: o diff compara as opções por identidade e, com função nova a cada render, desenharia tudo de novo.
  const aoClicarNoMais = useStableCallback((faixa: SelectedLineRange) => {
    const lado = (faixa.endSide ?? faixa.side) === 'deletions' ? 'antigo' : 'novo'
    for (const { hunk, linhas } of trechos) {
      const indice = indiceDaLinha(linhas, lado, faixa.end)
      if (indice !== undefined) return setAberta({ hunkId: hunk.id, indice })
    }
  })

  const renderAnnotation = ({ metadata: { hunkId, indice, comentario } }: AnotacaoDeLinha): ReactNode => {
    const chave = `${hunkId}|${indice}`
    const editando = aberta?.hunkId === hunkId && aberta.indice === indice
    const salvar = (texto: string, tipo: TipoDoComentario) => {
      // Caixa nova salva vazia: só fecha. Com comentário antes, o vazio o apaga.
      if (texto.trim() === '' && !comentario) return setAberta(null)
      comentar(hunkId, String(indice), texto, tipo).then(gravou => gravou && setAberta(null))
    }
    // A chave própria faz o React remontar a caixa quando as anotações trocam de ordem, em vez de passar o texto digitado para outra linha.
    return (
      <ComentarioNaLinha
        key={chave} comentario={comentario} editando={editando} salvar={salvar} fechar={() => setAberta(null)}
        editar={() => setAberta({ hunkId, indice })} apagar={() => void comentar(hunkId, String(indice), '')}
      />
    )
  }

  return { lineAnnotations, renderAnnotation, emEdicao, aoClicarNoMais }
}

interface PropsDoComentario {
  comentario?: ComentarioDeLinha
  editando: boolean
  salvar: (texto: string, tipo: TipoDoComentario) => void
  fechar: () => void
  editar: () => void
  apagar: () => void
}

function ComentarioNaLinha({ comentario, editando, salvar, fechar, editar, apagar }: PropsDoComentario) {
  if (editando) {
    return (
      <div className="comentario-de-linha">
        <CaixaDeComentario inicial={comentario?.texto ?? ''} tipoInicial={comentario?.tipo ?? 'corrija'} salvar={salvar} cancelar={fechar} />
      </div>
    )
  }
  // Caixa nova que acabou de fechar: some no próximo desenho do diff.
  if (!comentario) return null
  return (
    <div className="comentario-de-linha salvo">
      <span className="tipo-do-comentario">{TIPOS[comentario.tipo ?? 'corrija']}</span>
      <p>{comentario.texto}</p>
      <div className="botoes">
        <button type="button" onClick={editar}>Editar</button>
        <button type="button" onClick={apagar}>Apagar</button>
      </div>
    </div>
  )
}
