// Feedback para o agente: os comentários, as frases do narrador que a pessoa escolheu e os órfãos marcados como código morto
// viram .revisao/feedback.md. O arquivo é gerado do review.json, do estado.json e do achados.json, então um trecho que o agente
// mudou depois (hash novo) perde o comentário e a frase sozinho: o que já foi corrigido não volta no prompt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chaveDaFrase, type AchadosEscolhidos, type Estado, type Frase, type Revisao } from './contrato.js'
import { lerAchados, lerEstado } from './estado.js'

// Um lugar do diff onde uma decisão pode estar: passo de fluxo, órfão, teste ou trecho solto.
interface Lugar { arquivo: string; linha?: number; simbolo?: string; hunkIds: string[]; orfao: boolean; frases?: Frase[] }

// Um ajuste que a revisão pede ao agente: um comentário da pessoa, uma frase do narrador que ela confirmou ou um órfão marcado como código morto.
interface Ajuste { tipo: 'comentario' | 'narrador' | 'codigo-morto'; texto: string }

const SUFIXO_DO_NARRADOR = '(apontado pelo narrador)'

export function montarFeedback(revisao: Revisao, estado: Estado, achados: AchadosEscolhidos = {}): string {
  const ajustes = unicos(ajustesDaRevisao(revisao, estado, achados))
  const titulo = ajustes.length === 0 ? 'nenhum ajuste' : `${ajustes.length} ${ajustes.length === 1 ? 'ajuste' : 'ajustes'}`
  const instrucao = ajustes.length === 0 ? [] : [ajustes.some(a => a.tipo === 'narrador')
    ? `Corrija cada item no código. Os itens "${SUFIXO_DO_NARRADOR}" vieram da IA na revisão e eu confirmei.`
    : 'Corrija cada item no código.']
  return [`Revisão de ${revisao.base}: ${titulo}`, ...instrucao, ...ajustes.map((a, i) => `${i + 1}. ${a.texto.replace(/\n+/g, '\n   ')}`)].join('\n') + '\n'
}

// Os achados da revisão, para o historico.jsonl: o mesmo que o feedback.md lista, repetidos não contam duas vezes.
export function contarAchados(revisao: Revisao, estado: Estado, achados: AchadosEscolhidos = {}): { comentarios: number; codigoMorto: number; narrador: number } {
  const lista = unicos(ajustesDaRevisao(revisao, estado, achados))
  const quantos = (tipo: Ajuste['tipo']) => lista.filter(a => a.tipo === tipo).length
  return { comentarios: quantos('comentario'), codigoMorto: quantos('codigo-morto'), narrador: quantos('narrador') }
}

// O mesmo texto em dois lugares conta uma vez.
function unicos(ajustes: Ajuste[]): Ajuste[] {
  return [...new Map(ajustes.map(ajuste => [ajuste.texto, ajuste])).values()]
}

// Regera a partir do que está em disco agora. Sem review.json ainda, não há o que escrever.
export function gravarFeedback(pastaDaRevisao: string): string {
  const arquivoDaRevisao = path.join(pastaDaRevisao, 'review.json')
  if (!existsSync(arquivoDaRevisao)) return ''
  const texto = montarFeedback(JSON.parse(readFileSync(arquivoDaRevisao, 'utf8')), lerEstado(pastaDaRevisao), lerAchados(pastaDaRevisao))
  writeFileSync(path.join(pastaDaRevisao, 'feedback.md'), texto)
  return texto
}

function ajustesDaRevisao(revisao: Revisao, estado: Estado, achados: AchadosEscolhidos): Ajuste[] {
  return lugares(revisao).flatMap(lugar => ajustesDe(lugar, estado, achados))
}

function ajustesDe(lugar: Lugar, estado: Estado, achados: AchadosEscolhidos): Ajuste[] {
  const decisoes = lugar.hunkIds.map(id => estado[id]).filter(d => d !== undefined)
  const onde = `${lugar.arquivo}${lugar.linha ? `:${lugar.linha}` : ''}${lugar.simbolo ? ` (${lugar.simbolo})` : ''}`
  // O comentário vale com qualquer marca: revisado e comentado convivem.
  const comentarios = decisoes.filter(d => d.comentario).map(d => ({ tipo: 'comentario' as const, texto: `${onde}: ${d.comentario!.trim()}` }))
  const narrador = (lugar.frases ?? []).filter(f => achados[chaveDaFrase(lugar.hunkIds, f.texto)]).map(f => ({ tipo: 'narrador' as const, texto: `${ondeDaFrase(lugar, f)}: ${fraseDoNarrador(f.texto)} ${SUFIXO_DO_NARRADOR}` }))
  const morto = lugar.orfao && decisoes.some(d => d.decisao === 'codigo-morto') ? [{ tipo: 'codigo-morto' as const, texto: `${onde}: código morto, apague.` }] : []
  return [...comentarios, ...narrador, ...morto]
}

// A frase aponta para linhas do passo; sem âncora, vale a linha de início do passo, como nos outros itens.
function ondeDaFrase({ arquivo, linha, simbolo }: Lugar, { linhas }: Frase): string {
  const onde = linhas ? (linhas[0] === linhas[1] ? `${linhas[0]}` : `${linhas[0]}-${linhas[1]}`) : linha
  return `${arquivo}${onde ? `:${onde}` : ''}${simbolo ? ` (${simbolo})` : ''}`
}

// "atenção: valor negativo passa." vira "Valor negativo passa.": no feedback a frase já é um item da lista.
function fraseDoNarrador(texto: string): string {
  const limpa = texto.replace(/^atenção:\s*/i, '').trim()
  return limpa.charAt(0).toUpperCase() + limpa.slice(1)
}

function lugares(revisao: Revisao): Lugar[] {
  const linhaDe = (arquivo: string, hunkId?: string) => revisao.arquivos.find(a => a.caminho === arquivo)?.hunks.find(h => h.id === hunkId)?.linhas[0]
  const passos = revisao.fluxos.flatMap(f => f.passos).filter(p => p.hunkIds.length > 0)
    .map(p => ({ arquivo: p.arquivo, linha: p.linhas[0], simbolo: p.simbolo, hunkIds: p.hunkIds, orfao: false, frases: p.explicacao?.frases }))
  // Órfão de arquivo inteiro (sem símbolo) vai sem linha, como "lib/utils/formatarMoeda.ts: código morto".
  const orfaos = revisao.orfaos.map(o => ({
    arquivo: o.arquivo, linha: o.simbolo ? linhaDe(o.arquivo, o.hunkIds[0]) : undefined, simbolo: o.simbolo, hunkIds: o.hunkIds, orfao: true,
  }))
  const testes = revisao.testes.map(t => ({ arquivo: t.arquivo, linha: linhaDe(t.arquivo, t.hunkIds[0]), hunkIds: t.hunkIds, orfao: false }))
  const vistos = new Set([...passos, ...orfaos, ...testes].flatMap(l => l.hunkIds))
  const soltos = revisao.arquivos.flatMap(a => a.hunks.filter(h => !vistos.has(h.id)).map(h => ({ arquivo: a.caminho, linha: h.linhas[0], hunkIds: [h.id], orfao: false })))
  return [...passos, ...orfaos, ...testes, ...soltos]
}
