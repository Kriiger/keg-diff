#!/usr/bin/env node
// keg diff [argumentos do git diff]: analisa o diff, grava .revisao/review.json e mostra os fluxos em texto.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { Analisador, type Config } from './analisador.js'
import { coletarDiff, git } from './coletor.js'
import type { Revisao } from './contrato.js'
import { montarRevisao } from './montador.js'
import { lerModelo, preencherDoCache } from './narrador.js'
import { abrirTela } from './servidor.js'

const AJUDA = `uso: keg diff [--sem-tela] [--sem-ia] [argumentos do git diff]

  keg diff                 tudo o que mudou desde o último commit, arquivos novos inclusive
  keg diff --staged        só o que está no stage
  keg diff HEAD~1 HEAD     um commit
  keg diff main...HEAD     o branch inteiro
  keg diff --sem-tela      só grava o review.json, sem abrir a página
  keg diff --sem-ia        sem o narrador: os passos mostram só a frase mecânica

Rode dentro do pacote que mudou. O resultado vai para .revisao/review.json
e a página de revisão abre no navegador até você apertar Ctrl+C.`

// Acima disso a revisão não fecha: melhor pedir ao agente que fatie a tarefa.
const TRECHOS_DEMAIS = 40

if (isMainThread) await rodar()
else analisarNaThread()

async function rodar() {
  const [comando, ...argumentos] = process.argv.slice(2)
  const argsDoGit = argumentos.filter(arg => arg !== '--sem-tela' && arg !== '--sem-ia')
  const semIa = argumentos.includes('--sem-ia')
  // Sem terminal, quem chamou é um script ou um agente: a página ficaria aberta esperando ninguém.
  const comTela = !argumentos.includes('--sem-tela') && process.stdout.isTTY
  if (comando !== 'diff' || argsDoGit.includes('--help') || argsDoGit.includes('-h')) {
    console.log(AJUDA)
    process.exit(comando === 'diff' || comando === undefined || comando === '--help' ? 0 : 1)
  }

  try {
    git(['rev-parse', '--show-toplevel'])
  } catch {
    console.error('keg diff precisa rodar dentro de um repositório git.')
    process.exit(1)
  }

  const raiz = process.cwd()
  const pastaDaRevisao = path.join(raiz, '.revisao')
  const arquivoDeConfig = path.join(pastaDaRevisao, 'keg.config.json')
  const config: Config = existsSync(arquivoDeConfig) ? JSON.parse(readFileSync(arquivoDeConfig, 'utf8')) : {}

  const inicio = performance.now()
  const revisao = await analisar(argsDoGit, raiz, config)
  const narrador = { semIa, modelo: lerModelo(raiz) }
  // O que já foi narrado fica no cache; com --sem-ia, nenhuma frase da IA aparece.
  if (!semIa) preencherDoCache(revisao, raiz, narrador.modelo)

  mkdirSync(pastaDaRevisao, { recursive: true })
  writeFileSync(path.join(pastaDaRevisao, 'review.json'), JSON.stringify(revisao, null, 2) + '\n')
  esconderDoGit()
  imprimir(revisao, performance.now() - inicio)
  if (comTela) console.log(`\nPágina de revisão em ${await abrirTela(raiz, narrador)} · Ctrl+C para sair`)
}

// O compilador desce recursivo pelos imports, e a cadeia de tipos de uma biblioteca grande, como o Shiki,
// estoura a pilha padrão do Node. A análise roda numa thread com pilha folgada.
function analisar(argsDoGit: string[], raiz: string, config: Config): Promise<Revisao> {
  const thread = new Worker(new URL(import.meta.url), { workerData: { argsDoGit, raiz, config }, resourceLimits: { stackSizeMb: 64 } })
  return new Promise((resolver, rejeitar) => {
    thread.once('message', resolver)
    thread.once('error', rejeitar)
  })
}

function analisarNaThread() {
  const { argsDoGit, raiz, config } = workerData
  parentPort!.postMessage(montarRevisao(coletarDiff(argsDoGit), new Analisador(raiz, config), argsDoGit.join(' ') || 'HEAD'))
}

// .revisao/ é da máquina de quem revisa: vai para o .git/info/exclude, sem mexer no .gitignore do projeto.
function esconderDoGit() {
  const exclude = path.resolve(git(['rev-parse', '--git-path', 'info/exclude']).trim())
  const atual = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (atual.split('\n').includes('.revisao/')) return
  mkdirSync(path.dirname(exclude), { recursive: true })
  appendFileSync(exclude, `${atual === '' || atual.endsWith('\n') ? '' : '\n'}.revisao/\n`)
}

function imprimir(revisao: Revisao, milissegundos: number) {
  const { metricas, fluxos, orfaos, testes, arquivos } = revisao
  const trechos = arquivos.flatMap(a => a.hunks.map(h => h.id))
  const emFluxo = new Set(fluxos.flatMap(f => f.passos.flatMap(p => p.hunkIds)))
  const linhas = [
    `keg diff · ${revisao.base} · ${arquivos.length} arquivos (${metricas.arquivosNovos} novos) · ${trechos.length} trechos · ${(milissegundos / 1000).toFixed(1)}s`,
    '',
  ]
  if (trechos.length > TRECHOS_DEMAIS) linhas.push(`atenção: ${trechos.length} trechos é muito para uma revisão; peça ao agente para fatiar a tarefa`, '')
  fluxos.forEach((fluxo, i) => {
    linhas.push(`Fluxo ${i + 1} · ${fluxo.titulo} · risco ${fluxo.risco}`)
    for (const passo of fluxo.passos) {
      const alterado = passo.hunkIds.length > 0 ? '●' : '○'
      const tipos = passo.tipoEntrada !== undefined ? `(${passo.tipoEntrada}) → ${passo.tipoSaida}` : passo.tipoSaida ?? ''
      const fronteira = passo.fronteira ? `  ⇄ ${passo.fronteira}` : ''
      linhas.push(`  ${alterado} ${passo.papel.padEnd(8)} ${`${passo.arquivo}:${passo.linhas[0]}`.padEnd(40)} ${passo.simbolo.padEnd(24)} ${tipos}${fronteira}`)
      for (const aviso of passo.avisos ?? []) linhas.push(`      atenção: ${aviso}`)
    }
    linhas.push('')
  })
  if (orfaos.length > 0) {
    linhas.push('Órfãos')
    for (const orfao of orfaos) linhas.push(`  ${orfao.arquivo.padEnd(40)} ${(orfao.simbolo ?? '').padEnd(24)} ${orfao.motivo}`)
    linhas.push('')
  }
  if (testes.length > 0) linhas.push(`Testes: ${testes.map(t => t.arquivo).join(', ')}`, '')
  const doProduto = arquivos.filter(a => !testes.some(t => t.arquivo === a.caminho))
  const semAnalise = doProduto.filter(a => a.status === 'removido' || !/\.[cm]?[jt]sx?$/.test(a.caminho))
  if (semAnalise.length > 0) linhas.push(`Sem fluxo: ${semAnalise.map(a => `${a.caminho} (${a.status})`).join(', ')}`, '')
  const trechosDeTeste = testes.reduce((total, t) => total + t.hunkIds.length, 0)
  linhas.push(`${emFluxo.size} de ${trechos.length - trechosDeTeste} trechos em fluxos · ${orfaos.length} órfãos · ${trechosDeTeste} trechos de teste · ● alterado  ○ contexto`)
  linhas.push('review.json gravado em .revisao/review.json')
  console.log(linhas.join('\n'))
}
