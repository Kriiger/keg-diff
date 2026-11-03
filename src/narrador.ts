// Narrador: monta o prompt de um fluxo, valida a resposta do modelo e guarda o resultado em .revisao/cache.
// A IA só escreve frases; cada uma aponta para linhas do passo, e a que não aponta fica marcada.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chamarClaude } from './claude-cli.js'
import { ESFORCOS, modeloValido, type Fluxo, type Frase, type Hunk, type Orfao, type Passo, type Revisao } from './contrato.js'
import { agruparOrfaos, type GrupoDeOrfaos } from './orfaos.js'

export interface ConfigDoNarrador {
  modelo: string
  esforco: string
}

export interface OpcoesDoNarrador extends ConfigDoNarrador {
  semIa: boolean
}

interface Narracao {
  modelo: string
  passos: { id: string; frases: Frase[] }[]
}

// O cache de um grupo de órfãos: "o1", "o2"... é a posição do órfão no grupo (ver descreverOrfaos).
interface NarracaoDeOrfaos {
  modelo: string
  orfaos: { id: string; frases: Frase[] }[]
}

// Quem chama o claude; o padrão é o claude de verdade, e uma resposta falsa entra no lugar nas verificações.
type Chamar = typeof chamarClaude

const MODELO_PADRAO = 'sonnet'
// Narrar frases ancoradas em linhas não pede raciocínio longo: medium gasta bem menos tokens que o padrão do claude.
const ESFORCO_PADRAO = 'medium'
const FRASES_POR_PASSO = 3
export const LINHAS_POR_PASSO = 200
const LINHAS_POR_ORFAO = 120
// Os órfãos têm o prompt próprio (narrador-orfaos.md): a pergunta deles é "isto é código morto?", não "o que o dado faz?".
const ARQUIVO_DO_SISTEMA = path.join(import.meta.dirname, 'narrador.md')
const ARQUIVO_DO_SISTEMA_DE_ORFAOS = path.join(import.meta.dirname, 'narrador-orfaos.md')
const PROMPT_DO_SISTEMA = readFileSync(ARQUIVO_DO_SISTEMA, 'utf8')
const PROMPT_DO_SISTEMA_DE_ORFAOS = readFileSync(ARQUIVO_DO_SISTEMA_DE_ORFAOS, 'utf8')
const MOTIVOS_DO_ORFAO: Record<Orfao['motivo'], string> = {
  'sem-chamador': 'sem chamador (nenhuma função do projeto chama este código)',
  'sem-saida': 'sem saída (o dado que passa por ele não chega a banco, resposta HTTP ou tela)',
  'arquivo-sem-import': 'arquivo que ninguém importa',
}

// Resposta com is_error, como a de limite de uso: a narração para até a pessoa pedir de novo.
export class PausaDaNarracao extends Error {}

// keg.config.json na raiz do projeto: { "narrador": { "modelo": "sonnet", "esforco": "medium" } }.
// O modelo vira argumento do claude, então só entra nome que não pareça opção; esforço fora da lista cai no padrão.
export function lerConfigDoNarrador(raiz: string): ConfigDoNarrador {
  const arquivo = path.join(raiz, 'keg.config.json')
  let narrador: { modelo?: unknown; esforco?: unknown } | undefined
  try {
    narrador = JSON.parse(readFileSync(arquivo, 'utf8')).narrador
  } catch {}
  const { modelo, esforco } = narrador ?? {}
  return {
    modelo: modeloValido(modelo) ? modelo : MODELO_PADRAO,
    esforco: typeof esforco === 'string' && ESFORCOS.includes(esforco) ? esforco : ESFORCO_PADRAO,
  }
}

// A escolha feita na página vai para o mesmo arquivo. As outras chaves do keg.config.json ficam como estão; um arquivo
// que existe mas não lê como JSON não é sobrescrito (jogaria fora o que a pessoa escreveu).
export function gravarConfigDoNarrador(raiz: string, config: ConfigDoNarrador) {
  const arquivo = path.join(raiz, 'keg.config.json')
  const atual = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
  if (typeof atual !== 'object' || atual === null || Array.isArray(atual)) throw new Error('o keg.config.json não é um objeto JSON')
  const narrador = typeof atual.narrador === 'object' && atual.narrador !== null ? atual.narrador : {}
  writeFileSync(arquivo, JSON.stringify({ ...atual, narrador: { ...narrador, modelo: config.modelo, esforco: config.esforco } }, null, 2) + '\n')
}

// Deixa a narração do fluxo no cache; quem chama a aplica ao review.json com preencherDoCache.
// aoChamar avisa de cada chamada ao claude, antes dela, para a conta do consumo não depender de a chamada dar certo.
export async function narrarFluxo(fluxo: Fluxo, revisao: Revisao, raiz: string, opcoes: OpcoesDeChamada) {
  const prompt = montarPrompt(fluxo, revisao, raiz)
  await narrarComCache(raiz, prompt, { sistema: PROMPT_DO_SISTEMA, arquivoDoSistema: ARQUIVO_DO_SISTEMA }, opcoes, texto => validar(texto, fluxo, opcoes.modelo))
}

// O mesmo para um grupo de órfãos: uma chamada para todos eles, com o prompt próprio.
export async function narrarOrfaos(grupo: GrupoDeOrfaos, revisao: Revisao, raiz: string, opcoes: OpcoesDeChamada) {
  const descritos = descreverOrfaos(grupo, revisao)
  const prompt = montarPromptDeOrfaos(grupo, descritos, raiz)
  await narrarComCache(raiz, prompt, { sistema: PROMPT_DO_SISTEMA_DE_ORFAOS, arquivoDoSistema: ARQUIVO_DO_SISTEMA_DE_ORFAOS }, opcoes, texto => validarOrfaos(texto, descritos, opcoes.modelo))
}

export type OpcoesDeChamada = ConfigDoNarrador & { aoChamar: () => void; chamar?: Chamar }

async function narrarComCache<T>(raiz: string, prompt: string, { sistema, arquivoDoSistema }: { sistema: string; arquivoDoSistema: string }, opcoes: OpcoesDeChamada, validarTexto: (texto: string) => T | undefined) {
  const arquivo = arquivoDoCache(raiz, prompt, opcoes, sistema)
  if (existsSync(arquivo)) return
  const narracao = await pedirAoModelo(prompt, arquivoDoSistema, opcoes, validarTexto)
  mkdirSync(path.dirname(arquivo), { recursive: true })
  writeFileSync(arquivo, JSON.stringify(narracao, null, 2) + '\n')
}

// Uma chamada ao claude com a resposta já validada. JSON fora do formato ganha uma nova tentativa, uma só.
export async function pedirAoModelo<T>(prompt: string, arquivoDoSistema: string, { modelo, esforco, aoChamar, chamar = chamarClaude }: OpcoesDeChamada, validarTexto: (texto: string) => T | undefined): Promise<T> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    aoChamar()
    const resposta = await chamar(modelo, esforco, prompt, arquivoDoSistema)
    if (resposta.erro) throw new PausaDaNarracao(resposta.texto)
    const validada = validarTexto(resposta.texto)
    if (validada) return validada
  }
  throw new Error('a resposta do modelo veio fora do formato, mesmo na segunda tentativa')
}

// O motor monta o review.json com o que já está no cache: fluxo sem trecho novo não é narrado de novo, e os órfãos também não.
export function preencherDoCache(revisao: Revisao, raiz: string, config: ConfigDoNarrador) {
  for (const fluxo of revisao.fluxos) {
    const arquivo = arquivoDoCache(raiz, montarPrompt(fluxo, revisao, raiz), config)
    if (!existsSync(arquivo)) continue
    const narracao: Narracao = JSON.parse(readFileSync(arquivo, 'utf8'))
    for (const { id, frases } of narracao.passos) {
      const passo = fluxo.passos.find(p => p.id === id)
      if (passo) passo.explicacao = { frases, modelo: narracao.modelo }
    }
  }
  for (const grupo of agruparOrfaos(revisao)) {
    const descritos = descreverOrfaos(grupo, revisao)
    const arquivo = arquivoDoCache(raiz, montarPromptDeOrfaos(grupo, descritos, raiz), config, PROMPT_DO_SISTEMA_DE_ORFAOS)
    if (!existsSync(arquivo)) continue
    const narracao: NarracaoDeOrfaos = JSON.parse(readFileSync(arquivo, 'utf8'))
    for (const { id, frases } of narracao.orfaos) {
      const orfao = descritos.find(d => d.id === id)?.orfao
      if (orfao) orfao.explicacao = { frases, modelo: narracao.modelo }
    }
  }
}

// O hash cobre as regras do narrador (as dos fluxos ou as dos órfãos), o modelo, o esforço e o fluxo inteiro: código de cada passo, trechos e vizinhos.
// O esforço entra para uma narração feita com outro esforço não ser reaproveitada em silêncio.
function arquivoDoCache(raiz: string, prompt: string, { modelo, esforco }: ConfigDoNarrador, sistema = PROMPT_DO_SISTEMA): string {
  const hash = createHash('sha1').update([sistema, modelo, esforco, prompt].join('\0')).digest('hex').slice(0, 16)
  return path.join(raiz, '.revisao', 'cache', `${hash}.json`)
}

function montarPrompt(fluxo: Fluxo, revisao: Revisao, raiz: string): string {
  const passos = fluxo.passos.map(passo => descreverPasso(passo, fluxo, revisao, raiz))
  return [`Fluxo: ${fluxo.titulo} (risco ${fluxo.risco})`, ...passos].join('\n\n')
}

export function descreverPasso(passo: Passo, fluxo: Fluxo, revisao: Revisao, raiz: string): string {
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
  linhas.push('código (linhas com + foram alteradas):', ...codigoNumerado(passo.arquivo, passo.linhas, trechos.map(t => t.linhas), raiz, LINHAS_POR_PASSO, 'passo'))
  return linhas.join('\n')
}

export function codigoNumerado(arquivoRelativo: string, [de, ate]: [number, number], alteradas: [number, number][], raiz: string, limite: number, quem: 'passo' | 'órfão' | 'trecho'): string[] {
  const arquivo = path.join(raiz, arquivoRelativo)
  if (!existsSync(arquivo)) return ['(arquivo não existe mais)']
  const fim = Math.min(ate, de + limite - 1)
  const codigo = readFileSync(arquivo, 'utf8').split('\n').slice(de - 1, fim)
  const linhas = codigo.map((texto, i) => {
    const numero = de + i
    const marca = alteradas.some(([inicio, final]) => numero >= inicio && numero <= final) ? '+' : ' '
    return `${marca}${String(numero).padStart(4)}  ${texto}`
  })
  return fim < ate ? [...linhas, `(${quem} cortado na linha ${fim}; ele vai até a ${ate})`] : linhas
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

// Um órfão no prompt: "o1", "o2"... pela posição no grupo, e o intervalo de linhas que cobre os trechos dele (a âncora das frases cai aí).
export interface OrfaoDescrito { id: string; orfao: Orfao; intervalo: [number, number]; trechos: Hunk[] }

export function descreverOrfaos(grupo: GrupoDeOrfaos, revisao: Revisao): OrfaoDescrito[] {
  return grupo.orfaos.map((orfao, i) => {
    const trechos = revisao.arquivos.find(a => a.caminho === orfao.arquivo)?.hunks.filter(h => orfao.hunkIds.includes(h.id)) ?? []
    const intervalo: [number, number] = trechos.length > 0 ? [Math.min(...trechos.map(h => h.linhas[0])), Math.max(...trechos.map(h => h.linhas[1]))] : [0, 0]
    return { id: `o${i + 1}`, orfao, intervalo, trechos }
  })
}

export function montarPromptDeOrfaos(grupo: GrupoDeOrfaos, descritos: OrfaoDescrito[], raiz: string): string {
  const arquivos = [...new Set(grupo.orfaos.map(o => o.arquivo))].join(', ')
  return [`Órfãos de ${arquivos}`, ...descritos.map(d => descreverOrfao(d, raiz))].join('\n\n')
}

function descreverOrfao({ id, orfao, intervalo, trechos }: OrfaoDescrito, raiz: string): string {
  const nome = orfao.simbolo ?? (orfao.motivo === 'arquivo-sem-import' ? 'arquivo inteiro' : 'trechos fora de função')
  const onde = intervalo[0] > 0 ? `${orfao.arquivo}:${intervalo[0]}-${intervalo[1]}` : orfao.arquivo
  const linhas = [`Órfão ${id} · ${nome} · ${onde} · motivo: ${MOTIVOS_DO_ORFAO[orfao.motivo]}`]
  if (trechos.length > 0) linhas.push('trechos alterados:', ...trechos.map(t => t.patch))
  if (intervalo[0] > 0) linhas.push('código (linhas com + foram alteradas):', ...codigoNumerado(orfao.arquivo, intervalo, trechos.map(t => t.linhas), raiz, LINHAS_POR_ORFAO, 'órfão'))
  return linhas.join('\n')
}

// undefined = fora do formato pedido, como em validar; o órfão que o modelo esqueceu fica sem frase.
function validarOrfaos(texto: string, descritos: OrfaoDescrito[], modelo: string): NarracaoDeOrfaos | undefined {
  const bruto = lerJson(texto)
  if (!Array.isArray(bruto?.orfaos)) return undefined
  const orfaos: NarracaoDeOrfaos['orfaos'] = []
  for (const item of bruto.orfaos) {
    if (typeof item?.id !== 'string' || !Array.isArray(item.frases)) return undefined
    const descrito = descritos.find(d => d.id === item.id)
    if (!descrito || orfaos.some(o => o.id === item.id)) continue
    const frases = lerFrases(item.frases, descrito.intervalo)
    if (!frases) return undefined
    if (frases.length > 0) orfaos.push({ id: item.id, frases })
  }
  return orfaos.length > 0 ? { modelo, orfaos } : undefined
}

export function lerFrases(lista: unknown[], intervalo: [number, number], maximo = FRASES_POR_PASSO): Frase[] | undefined {
  const frases: Frase[] = []
  for (const item of lista as { texto?: unknown; linhas?: unknown }[]) {
    if (typeof item?.texto !== 'string') return undefined
    if (item.texto.trim() !== '') frases.push({ texto: item.texto.trim(), linhas: ancoraValida(item.linhas, intervalo) })
  }
  return frases.slice(0, maximo)
}

function ancoraValida(linhas: unknown, [de, ate]: [number, number]): [number, number] | null {
  if (!Array.isArray(linhas) || linhas.length !== 2) return null
  const [inicio, fim] = linhas
  const inteiros = Number.isInteger(inicio) && Number.isInteger(fim)
  return inteiros && inicio >= de && fim <= ate && inicio <= fim ? [inicio, fim] : null
}

// O modelo às vezes embrulha o JSON em ```json ou escreve uma linha antes.
export function lerJson(texto: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
}
