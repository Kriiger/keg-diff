// Feedback para o agente: os comentários e os órfãos marcados como código morto viram .revisao/feedback.md.
// O arquivo é gerado do review.json e do estado.json, então um trecho que o agente mudou depois (hash novo)
// perde o comentário sozinho: o que já foi corrigido não volta no prompt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Estado, Revisao } from './contrato.js'
import { lerEstado } from './estado.js'

// Um lugar do diff onde uma decisão pode estar: passo de fluxo, órfão, teste ou trecho solto.
interface Lugar { arquivo: string; linha?: number; simbolo?: string; hunkIds: string[]; orfao: boolean }

// Um ajuste que a revisão pede ao agente: um comentário da pessoa ou um órfão marcado como código morto.
interface Ajuste { tipo: 'comentario' | 'codigo-morto'; texto: string }

export function montarFeedback(revisao: Revisao, estado: Estado): string {
  const itens = ajustesDaRevisao(revisao, estado).map(ajuste => ajuste.texto)
  const unicos = [...new Set(itens)]
  const titulo = unicos.length === 0 ? 'nenhum ajuste' : `${unicos.length} ${unicos.length === 1 ? 'ajuste' : 'ajustes'}`
  return [`Revisão de ${revisao.base}: ${titulo}`, ...unicos.map((item, i) => `${i + 1}. ${item.replace(/\n+/g, '\n   ')}`)].join('\n') + '\n'
}

// Os achados da revisão, para o historico.jsonl: o mesmo que o feedback.md lista, repetidos não contam duas vezes.
export function contarAchados(revisao: Revisao, estado: Estado): { comentarios: number; codigoMorto: number } {
  const ajustes = [...new Map(ajustesDaRevisao(revisao, estado).map(ajuste => [ajuste.texto, ajuste])).values()]
  return { comentarios: ajustes.filter(a => a.tipo === 'comentario').length, codigoMorto: ajustes.filter(a => a.tipo === 'codigo-morto').length }
}

// Regera a partir do que está em disco agora. Sem review.json ainda, não há o que escrever.
export function gravarFeedback(pastaDaRevisao: string): string {
  const arquivoDaRevisao = path.join(pastaDaRevisao, 'review.json')
  if (!existsSync(arquivoDaRevisao)) return ''
  const texto = montarFeedback(JSON.parse(readFileSync(arquivoDaRevisao, 'utf8')), lerEstado(pastaDaRevisao))
  writeFileSync(path.join(pastaDaRevisao, 'feedback.md'), texto)
  return texto
}

function ajustesDaRevisao(revisao: Revisao, estado: Estado): Ajuste[] {
  return lugares(revisao).flatMap(lugar => ajustesDe(lugar, estado))
}

function ajustesDe(lugar: Lugar, estado: Estado): Ajuste[] {
  const decisoes = lugar.hunkIds.map(id => estado[id]).filter(d => d !== undefined)
  const onde = `${lugar.arquivo}${lugar.linha ? `:${lugar.linha}` : ''}${lugar.simbolo ? ` (${lugar.simbolo})` : ''}`
  const comentarios = decisoes.filter(d => d.decisao === 'comentado' && d.comentario).map(d => ({ tipo: 'comentario' as const, texto: d.comentario!.trim() }))
  const morto = lugar.orfao && decisoes.some(d => d.decisao === 'codigo-morto') ? [{ tipo: 'codigo-morto' as const, texto: 'código morto, apague.' }] : []
  return [...comentarios, ...morto].map(ajuste => ({ ...ajuste, texto: `${onde}: ${ajuste.texto}` }))
}

function lugares(revisao: Revisao): Lugar[] {
  const linhaDe = (arquivo: string, hunkId?: string) => revisao.arquivos.find(a => a.caminho === arquivo)?.hunks.find(h => h.id === hunkId)?.linhas[0]
  const passos = revisao.fluxos.flatMap(f => f.passos).filter(p => p.hunkIds.length > 0)
    .map(p => ({ arquivo: p.arquivo, linha: p.linhas[0], simbolo: p.simbolo, hunkIds: p.hunkIds, orfao: false }))
  // Órfão de arquivo inteiro (sem símbolo) vai sem linha, como "lib/utils/formatarMoeda.ts: código morto".
  const orfaos = revisao.orfaos.map(o => ({
    arquivo: o.arquivo, linha: o.simbolo ? linhaDe(o.arquivo, o.hunkIds[0]) : undefined, simbolo: o.simbolo, hunkIds: o.hunkIds, orfao: true,
  }))
  const testes = revisao.testes.map(t => ({ arquivo: t.arquivo, linha: linhaDe(t.arquivo, t.hunkIds[0]), hunkIds: t.hunkIds, orfao: false }))
  const vistos = new Set([...passos, ...orfaos, ...testes].flatMap(l => l.hunkIds))
  const soltos = revisao.arquivos.flatMap(a => a.hunks.filter(h => !vistos.has(h.id)).map(h => ({ arquivo: a.caminho, linha: h.linhas[0], hunkIds: [h.id], orfao: false })))
  return [...passos, ...orfaos, ...testes, ...soltos]
}
