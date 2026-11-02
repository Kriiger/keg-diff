// Coletor: transforma o git diff em trechos (hunks) com as linhas exatas do lado novo.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { ArquivoAlterado, Hunk } from './contrato.js'

// Árvore vazia do git: deixa comparar num repositório que ainda não tem commit.
const ARVORE_VAZIA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const CABECALHO_DO_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

export function git(args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// Sem argumento: tudo o que mudou desde o último commit, arquivos novos inclusive.
// Com argumento: a mesma sintaxe do git diff (--staged, HEAD~1 HEAD, main...HEAD).
export function coletarDiff(argsDoGit: string[]): ArquivoAlterado[] {
  const semArgumento = argsDoGit.length === 0
  const alvo = semArgumento ? [temCommit() ? 'HEAD' : ARVORE_VAZIA] : argsDoGit
  // --relative limita ao pacote onde o keg roda e deixa os caminhos relativos a ele.
  const patch = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-prefix', '--relative', '-M', ...alvo])
  const arquivos = lerPatch(patch)
  if (semArgumento) arquivos.push(...arquivosNaoRastreados())
  return arquivos
}

function temCommit(): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', 'HEAD'])
    return true
  } catch {
    return false
  }
}

function lerPatch(texto: string): ArquivoAlterado[] {
  const arquivos: ArquivoAlterado[] = []
  let caminhoAntigo = ''
  for (const linha of texto.split('\n')) {
    const atual = arquivos.at(-1)
    if (linha.startsWith('diff --git ')) {
      arquivos.push({ caminho: '', status: 'alterado', hunks: [] })
      continue
    }
    if (!atual) continue
    const hunk = atual.hunks.at(-1)
    // Dentro de um hunk, "--- x" é uma linha removida que começa com "--", não um cabeçalho.
    if (hunk && /^[-+\\]/.test(linha)) hunk.patch += '\n' + linha
    else if (linha.startsWith('@@')) abrirHunk(atual, linha)
    else if (linha.startsWith('new file mode')) atual.status = 'novo'
    else if (linha.startsWith('deleted file mode')) atual.status = 'removido'
    else if (linha.startsWith('--- ')) caminhoAntigo = linha.slice(4)
    else if (linha.startsWith('+++ ')) atual.caminho = linha === '+++ /dev/null' ? caminhoAntigo : linha.slice(4)
  }
  for (const arquivo of arquivos) darIdsAosHunks(arquivo)
  return arquivos.filter(arquivo => arquivo.caminho !== '')
}

function abrirHunk(arquivo: ArquivoAlterado, cabecalho: string) {
  const [, inicio = '1', quantidade = '1'] = CABECALHO_DO_HUNK.exec(cabecalho) ?? []
  const primeira = Math.max(Number(inicio), 1)
  // Hunk só de remoção tem 0 linhas novas: ele fica preso à linha onde o código sumiu.
  const ultima = Math.max(primeira + Number(quantidade) - 1, primeira)
  arquivo.hunks.push({ id: '', linhas: [primeira, ultima], patch: cabecalho })
}

// O id é o hash do conteúdo, não das linhas: editar acima do trecho não perde a decisão,
// mas mudar o próprio trecho volta ele para "não revisado".
export function darIdsAosHunks(arquivo: ArquivoAlterado) {
  const vistos = new Map<string, number>()
  for (const hunk of arquivo.hunks) {
    const corpo = hunk.patch.slice(hunk.patch.indexOf('\n') + 1)
    const id = createHash('sha1').update(arquivo.caminho + '\n' + corpo).digest('hex').slice(0, 12)
    const repeticoes = vistos.get(id) ?? 0
    vistos.set(id, repeticoes + 1)
    hunk.id = repeticoes === 0 ? id : `${id}-${repeticoes + 1}`
  }
}

// Corta um trecho só de acréscimo depois de cada linha de "fins". Trecho com remoção fica inteiro:
// cortar separaria a linha removida da que a substituiu.
export function partirHunk(hunk: Hunk, fins: number[]): Hunk[] {
  const [cabecalho = '', ...corpo] = hunk.patch.split('\n')
  const [inicio, fim] = hunk.linhas
  const cortes = [...new Set(fins)].filter(linha => linha >= inicio && linha < fim).sort((a, b) => a - b)
  if (cortes.length === 0 || !corpo.every(linha => linha.startsWith('+') || linha.startsWith('\\'))) return [hunk]
  const antigo = /^@@ -(\d+)/.exec(cabecalho)?.[1] ?? '0'
  return [...cortes, fim].map((ate, i) => {
    const de = i === 0 ? inicio : cortes[i - 1]! + 1
    // O último pedaço leva junto o "\ No newline at end of file".
    const linhas = i === cortes.length ? corpo.slice(de - inicio) : corpo.slice(de - inicio, ate - inicio + 1)
    return { id: '', linhas: [de, ate], patch: [`@@ -${antigo},0 +${de},${ate - de + 1} @@`, ...linhas].join('\n') }
  })
}

function arquivosNaoRastreados(): ArquivoAlterado[] {
  const caminhos = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
  return caminhos.flatMap(caminho => {
    const conteudo = readFileSync(caminho, 'utf8')
    if (conteudo.includes('\0')) return []
    const linhas = conteudo.split('\n')
    if (linhas.at(-1) === '') linhas.pop()
    const arquivo: ArquivoAlterado = {
      caminho,
      status: 'novo',
      hunks: [{ id: '', linhas: [1, Math.max(linhas.length, 1)], patch: `@@ -0,0 +1,${linhas.length} @@` }],
    }
    for (const linha of linhas) arquivo.hunks[0]!.patch += '\n+' + linha
    darIdsAosHunks(arquivo)
    return [arquivo]
  })
}
