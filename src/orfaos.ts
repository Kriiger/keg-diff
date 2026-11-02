// Os órfãos do narrador: o motor só diz quais trechos ficaram fora dos fluxos, e aqui eles se juntam em poucas chamadas.
// A conta é pura, sobre o review.json, para o servidor (fila) e a página (pedido, "Narrar todos") chegarem aos mesmos grupos e ids.
import type { Orfao, Revisao } from './contrato.js'

export const PREFIXO_DO_GRUPO = 'orfaos:'
// Um grupo fecha quando chega num destes limites, para a resposta e o prompt não crescerem sem fim; um arquivo nunca se parte.
const ORFAOS_POR_GRUPO = 8
const LINHAS_POR_GRUPO = 400

// "orfaos:<primeiro arquivo do grupo>": estável enquanto os órfãos forem os mesmos, e nunca colide com o id de um fluxo (hash).
// "orfaos" aponta para os mesmos objetos do review.json, então preencher a explicação de um a preenche na revisão.
export interface GrupoDeOrfaos {
  id: string
  orfaos: Orfao[]
}

export function ehGrupoDeOrfaos(id: string): boolean {
  return id.startsWith(PREFIXO_DO_GRUPO)
}

// Os órfãos do mesmo arquivo ficam juntos, na ordem em que o motor os listou; os arquivos vão enchendo o grupo até o limite.
// Poucos órfãos viram uma chamada só.
export function agruparOrfaos(revisao: Revisao): GrupoDeOrfaos[] {
  const porArquivo = new Map<string, Orfao[]>()
  for (const orfao of revisao.orfaos) porArquivo.set(orfao.arquivo, [...(porArquivo.get(orfao.arquivo) ?? []), orfao])
  const tamanhoDoHunk = new Map(revisao.arquivos.flatMap(a => a.hunks.map(h => [h.id, h.patch.split('\n').length] as const)))
  const linhasDe = (lista: Orfao[]) => lista.flatMap(o => o.hunkIds).reduce((total, id) => total + (tamanhoDoHunk.get(id) ?? 0), 0)

  const grupos: GrupoDeOrfaos[] = []
  let atual: { arquivo: string; orfaos: Orfao[]; linhas: number } | undefined
  const fechar = () => atual && grupos.push({ id: `${PREFIXO_DO_GRUPO}${atual.arquivo}`, orfaos: atual.orfaos })
  for (const [arquivo, orfaos] of porArquivo) {
    const linhas = linhasDe(orfaos)
    if (atual && (atual.orfaos.length + orfaos.length > ORFAOS_POR_GRUPO || atual.linhas + linhas > LINHAS_POR_GRUPO)) {
      fechar()
      atual = undefined
    }
    atual = atual ? { ...atual, orfaos: [...atual.orfaos, ...orfaos], linhas: atual.linhas + linhas } : { arquivo, orfaos, linhas }
  }
  fechar()
  return grupos
}

// Os grupos em que algum órfão ainda não tem frase do narrador.
export function gruposSemNarracao(revisao: Revisao): GrupoDeOrfaos[] {
  return agruparOrfaos(revisao).filter(grupo => grupo.orfaos.some(o => !o.explicacao))
}
