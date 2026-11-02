// Narrador: monta o prompt de um fluxo, valida a resposta do modelo e guarda o resultado em .revisao/cache.
// A IA só escreve frases; cada uma aponta para linhas do passo, e a que não aponta fica marcada.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chamarClaude } from './claude-cli.js'
import type { Fluxo, Frase, Passo, Revisao } from './contrato.js'

export interface OpcoesDoNarrador {
  semIa: boolean
  modelo: string
}

interface Narracao {
  modelo: string
  passos: { id: string; frases: Frase[] }[]
}

const MODELO_PADRAO = 'sonnet'
const FRASES_POR_PASSO = 3
const LINHAS_POR_PASSO = 200
const PROMPT_DO_SISTEMA = readFileSync(path.join(import.meta.dirname, 'narrador.md'), 'utf8')

// Resposta com is_error, como a de limite de uso: a narração para até a pessoa pedir de novo.
export class PausaDaNarracao extends Error {}

// keg.config.json na raiz do projeto: { "narrador": { "modelo": "sonnet" } }.
// O modelo vira argumento do claude, então só entra nome que não pareça opção.
export function lerModelo(raiz: string): string {
  const arquivo = path.join(raiz, 'keg.config.json')
  let modelo: unknown
  try {
    modelo = JSON.parse(readFileSync(arquivo, 'utf8')).narrador?.modelo
  } catch {}
  return typeof modelo === 'string' && /^[A-Za-z0-9][\w.[\]-]*$/.test(modelo) ? modelo : MODELO_PADRAO
}

// Deixa a narração do fluxo no cache; quem chama a aplica ao review.json com preencherDoCache.
export async function narrarFluxo(fluxo: Fluxo, revisao: Revisao, raiz: string, modelo: string) {
  const prompt = montarPrompt(fluxo, revisao, raiz)
  const arquivo = arquivoDoCache(raiz, prompt, modelo)
  if (existsSync(arquivo)) return
  // JSON fora do formato ganha uma nova tentativa, uma só.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const resposta = await chamarClaude(modelo, prompt)
    if (resposta.erro) throw new PausaDaNarracao(resposta.texto)
    const narracao = validar(resposta.texto, fluxo, modelo)
    if (!narracao) continue
    mkdirSync(path.dirname(arquivo), { recursive: true })
    writeFileSync(arquivo, JSON.stringify(narracao, null, 2) + '\n')
    return
  }
  throw new Error('a resposta do modelo veio fora do formato, mesmo na segunda tentativa')
}

// O motor monta o review.json com o que já está no cache: fluxo sem trecho novo não é narrado de novo.
export function preencherDoCache(revisao: Revisao, raiz: string, modelo: string) {
  for (const fluxo of revisao.fluxos) {
    const arquivo = arquivoDoCache(raiz, montarPrompt(fluxo, revisao, raiz), modelo)
    if (!existsSync(arquivo)) continue
    const narracao: Narracao = JSON.parse(readFileSync(arquivo, 'utf8'))
    for (const { id, frases } of narracao.passos) {
      const passo = fluxo.passos.find(p => p.id === id)
      if (passo) passo.explicacao = { frases, modelo: narracao.modelo }
    }
  }
}

// O hash cobre as regras do narrador, o modelo e o fluxo inteiro: código de cada passo, trechos e vizinhos.
function arquivoDoCache(raiz: string, prompt: string, modelo: string): string {
  const hash = createHash('sha1').update([PROMPT_DO_SISTEMA, modelo, prompt].join('\0')).digest('hex').slice(0, 16)
  return path.join(raiz, '.revisao', 'cache', `${hash}.json`)
}

function montarPrompt(fluxo: Fluxo, revisao: Revisao, raiz: string): string {
  const passos = fluxo.passos.map(passo => descreverPasso(passo, fluxo, revisao, raiz))
  return [`Fluxo: ${fluxo.titulo} (risco ${fluxo.risco})`, ...passos].join('\n\n')
}

function descreverPasso(passo: Passo, fluxo: Fluxo, revisao: Revisao, raiz: string): string {
  const alterado = revisao.arquivos.find(a => a.caminho === passo.arquivo)
  const trechos = alterado?.hunks.filter(h => passo.hunkIds.includes(h.id)) ?? []
  const simbolos = (ids: string[]) => ids.map(id => `${id} ${fluxo.passos.find(p => p.id === id)?.simbolo}`).join(', ')
  const chamadores = fluxo.passos.filter(p => p.chama?.includes(passo.id)).map(p => p.id)
  const linhas = [
    `Passo ${passo.id} · ${passo.papel} · ${passo.simbolo} · ${passo.arquivo}:${passo.linhas[0]}-${passo.linhas[1]} · ${trechos.length > 0 ? 'ALTERADO' : 'contexto'}`,
    `recebe: ${passo.tipoEntrada ?? '-'} · devolve: ${passo.tipoSaida ?? '-'}`,
    `chamado por: ${simbolos(chamadores) || '-'} · chama: ${simbolos(passo.chama ?? []) || '-'}`,
  ]
  if (passo.fronteira) linhas.push(`fronteira: ${passo.fronteira}`)
  for (const aviso of passo.avisos ?? []) linhas.push(`aviso do compilador: ${aviso}`)
  if (trechos.length > 0) linhas.push('trechos alterados:', ...trechos.map(t => t.patch))
  linhas.push('código (linhas com + foram alteradas):', ...codigoNumerado(passo, trechos.map(t => t.linhas), raiz))
  return linhas.join('\n')
}

function codigoNumerado(passo: Passo, alteradas: [number, number][], raiz: string): string[] {
  const arquivo = path.join(raiz, passo.arquivo)
  if (!existsSync(arquivo)) return ['(arquivo não existe mais)']
  const [de, ate] = passo.linhas
  const fim = Math.min(ate, de + LINHAS_POR_PASSO - 1)
  const codigo = readFileSync(arquivo, 'utf8').split('\n').slice(de - 1, fim)
  const linhas = codigo.map((texto, i) => {
    const numero = de + i
    const marca = alteradas.some(([inicio, final]) => numero >= inicio && numero <= final) ? '+' : ' '
    return `${marca}${String(numero).padStart(4)}  ${texto}`
  })
  return fim < ate ? [...linhas, `(passo cortado na linha ${fim}; ele vai até a ${ate})`] : linhas
}

// undefined = fora do formato pedido. A frase com linhas fora do passo não derruba a resposta: fica sem âncora.
function validar(texto: string, fluxo: Fluxo, modelo: string): Narracao | undefined {
  const bruto = lerJson(texto)
  if (!Array.isArray(bruto?.passos)) return undefined
  const passos: Narracao['passos'] = []
  for (const item of bruto.passos) {
    if (typeof item?.id !== 'string' || !Array.isArray(item.frases)) return undefined
    const passo = fluxo.passos.find(p => p.id === item.id && p.hunkIds.length > 0)
    if (!passo) continue
    const frases = lerFrases(item.frases, passo.linhas)
    if (!frases) return undefined
    if (frases.length > 0) passos.push({ id: item.id, frases })
  }
  return passos.length > 0 ? { modelo, passos } : undefined
}

function lerFrases(lista: unknown[], intervalo: [number, number]): Frase[] | undefined {
  const frases: Frase[] = []
  for (const item of lista as { texto?: unknown; linhas?: unknown }[]) {
    if (typeof item?.texto !== 'string') return undefined
    if (item.texto.trim() !== '') frases.push({ texto: item.texto.trim(), linhas: ancoraValida(item.linhas, intervalo) })
  }
  return frases.slice(0, FRASES_POR_PASSO)
}

function ancoraValida(linhas: unknown, [de, ate]: [number, number]): [number, number] | null {
  if (!Array.isArray(linhas) || linhas.length !== 2) return null
  const [inicio, fim] = linhas
  const inteiros = Number.isInteger(inicio) && Number.isInteger(fim)
  return inteiros && inicio >= de && fim <= ate && inicio <= fim ? [inicio, fim] : null
}

// O modelo às vezes embrulha o JSON em ```json ou escreve uma linha antes.
function lerJson(texto: string): { passos?: unknown } | undefined {
  try {
    return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
}
