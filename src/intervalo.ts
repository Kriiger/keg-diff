// O intervalo que o git diff compara: de onde até onde, os commits no meio e o conteúdo dos arquivos nas duas pontas.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { git } from './coletor.js'
import type { Commit, Intervalo } from './contrato.js'

const COMMITS_MOSTRADOS = 30
const SEPARADOR = '\x1f'
export const STAGE = ':'
export const DIRETORIO_DE_TRABALHO = 'diretório de trabalho'

// "depois" sem valor é o diretório de trabalho; STAGE é o índice (--staged).
export interface Pontas { antes: string; depois?: string }

// Lê os argumentos como o git diff lê: A...B compara a partir do ancestral comum, A..B e "A B" comparam as duas pontas,
// um commit só compara com o diretório de trabalho e sem argumento é o HEAD contra o diretório de trabalho.
export function pontasDoDiff(argsDoGit: string[]): Pontas {
  const ate = argsDoGit.indexOf('--')
  const args = ate < 0 ? argsDoGit : argsDoGit.slice(0, ate)
  const [primeiro = 'HEAD', segundo] = args.filter(arg => !arg.startsWith('-'))
  if (args.includes('--staged') || args.includes('--cached')) return { antes: primeiro, depois: STAGE }
  if (primeiro.includes('...')) return daFaixa(primeiro, '...')
  if (primeiro.includes('..')) return daFaixa(primeiro, '..')
  return { antes: primeiro, depois: segundo }
}

// Ponta vazia vale HEAD, como no git ("main.." é main até o HEAD).
function daFaixa(faixa: string, separador: '..' | '...'): Pontas {
  const [a, b] = faixa.split(separador).map(ref => ref || 'HEAD')
  const [antes, depois] = [a ?? 'HEAD', b ?? 'HEAD']
  return { antes: separador === '...' ? ancestralComum(antes, depois) : antes, depois }
}

function ancestralComum(a: string, b: string): string {
  try {
    return git(['merge-base', a, b]).trim()
  } catch {
    return a
  }
}

// Os commits entre as pontas. Com o diretório de trabalho na ponta, valem os commits de "antes" até o HEAD.
export function descreverIntervalo({ antes, depois }: Pontas): Intervalo {
  const alvo = depois === undefined || depois === STAGE ? 'HEAD' : depois
  const faixa = `${antes}..${alvo}`
  const intervalo: Intervalo = { antes, depois: nomeDaPonta(depois), commits: [], totalDeCommits: 0 }
  try {
    // Num pacote de monorepo, só contam os commits que mexeram nele, como o --relative do diff. Na raiz, nenhum filtro:
    // o commit sem arquivos ("Initial plan" de um agente) também é parte do intervalo.
    const doPacote = git(['rev-parse', '--show-prefix']).trim() === '' ? [] : ['--', '.']
    intervalo.totalDeCommits = Number(git(['rev-list', '--count', faixa, ...doPacote]).trim())
    const texto = git(['log', `--max-count=${COMMITS_MOSTRADOS}`, `--format=%h${SEPARADOR}%an${SEPARADOR}%aI${SEPARADOR}%s`, faixa, ...doPacote])
    intervalo.commits = texto.split('\n').filter(Boolean).map(linhaDeCommit)
    // O branch só conta quando o intervalo termina no que está em uso: main...feature visto de dentro da main não é "da main".
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    if (branch !== 'HEAD' && alvo === 'HEAD') intervalo.branch = branch
  } catch {
    // Repositório sem commit ou ref que o git não resolve: o diff já falaria; aqui só some a lista de commits.
  }
  return intervalo
}

function nomeDaPonta(depois: string | undefined): string {
  if (depois === undefined) return DIRETORIO_DE_TRABALHO
  return depois === STAGE ? 'stage' : depois
}

// O caminho de volta: a ponta de chegada que o review.json registrou (intervalo.depois) como lerNaPonta a entende.
// Sem intervalo (review.json antigo) vale o diretório de trabalho, como no keg diff sem argumento.
export function pontaDeChegada(intervalo: Pick<Intervalo, 'depois'> | undefined): string | undefined {
  if (intervalo === undefined || intervalo.depois === DIRETORIO_DE_TRABALHO) return undefined
  return intervalo.depois === 'stage' ? STAGE : intervalo.depois
}

function linhaDeCommit(linha: string): Commit {
  const [hash = '', autor = '', em = '', ...assunto] = linha.split(SEPARADOR)
  return { hash, autor, em, assunto: assunto.join(SEPARADOR) }
}

// Os arquivos numa ponta: uma chamada do git para todos (cat-file --batch), em vez de uma por arquivo.
// Arquivo que não existe lá (novo, ou removido) fica fora do mapa. Os caminhos são relativos à raiz (o pacote onde o keg roda).
export function lerNaPonta(ponta: string | undefined, caminhos: string[], raiz = process.cwd()): Map<string, string> {
  if (caminhos.length === 0) return new Map()
  return ponta === undefined ? lerDoDisco(caminhos, raiz) : lerDoGit(ponta === STAGE ? '' : ponta, caminhos, raiz)
}

function lerDoDisco(caminhos: string[], raiz: string): Map<string, string> {
  const lidos = new Map<string, string>()
  for (const caminho of caminhos) {
    try {
      lidos.set(caminho, readFileSync(path.resolve(raiz, caminho), 'utf8'))
    } catch {}
  }
  return lidos
}

function lerDoGit(prefixo: string, caminhos: string[], raiz: string): Map<string, string> {
  const entrada = caminhos.map(caminho => `${prefixo}:./${caminho}\n`).join('')
  const lidos = new Map<string, string>()
  let saida: Buffer
  try {
    saida = execFileSync('git', ['cat-file', '--batch'], { cwd: raiz, input: entrada, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    // Ponta que o git não resolve, como o HEAD de um repositório sem commit: é como se nenhum arquivo existisse lá.
    return lidos
  }
  let posicao = 0
  for (const caminho of caminhos) {
    const fim = saida.indexOf(10, posicao)
    const tamanho = /^\w+ blob (\d+)$/.exec(saida.toString('utf8', posicao, fim))?.[1]
    posicao = fim + 1
    if (tamanho === undefined) continue
    lidos.set(caminho, saida.toString('utf8', posicao, posicao + Number(tamanho)))
    // O git separa as respostas com uma quebra de linha depois do conteúdo.
    posicao += Number(tamanho) + 1
  }
  return lidos
}

// Os arquivos de teste que existem na ponta de chegada, para saber se o código alterado tem teste.
export function arquivosNaPonta(ponta: string | undefined): string[] {
  const texto = ponta === undefined || ponta === STAGE ? git(['ls-files']) : git(['ls-tree', '-r', '--name-only', ponta, '--', '.'])
  return texto.split('\n').filter(Boolean)
}
