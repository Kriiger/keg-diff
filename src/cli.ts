#!/usr/bin/env node
// keg diff [argumentos do git diff]: analisa o diff, grava .revisao/review.json e mostra os fluxos em texto.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Config } from './analisador.js'
import { git } from './coletor.js'
import type { Revisao } from './contrato.js'
import { gravarFeedback } from './feedback.js'
import { lerHistorico } from './historico.js'
import { aplicarManifesto } from './manifesto.js'
import { lerConfigDoNarrador, preencherDoCache, type OpcoesDoNarrador } from './narrador.js'
import { observarProjeto } from './observador.js'
import { resumirHistorico } from './resumo-do-historico.js'
import { abrirTela } from './servidor.js'
import { Motor, type Analise, type Tempos } from './trabalhador.js'

const AJUDA = `uso: keg diff [--sem-tela] [--sem-ia] [--watch] [argumentos do git diff]

  keg diff                 tudo o que mudou desde o último commit, arquivos novos inclusive
  keg diff --staged        só o que está no stage
  keg diff HEAD~1 HEAD     um commit
  keg diff main...HEAD     o branch inteiro
  keg diff --sem-tela      só grava o review.json, sem abrir a página
  keg diff --sem-ia        sem o narrador: os passos mostram só a frase mecânica
  keg diff --watch         observa os arquivos e analisa de novo quando o agente corrige
  keg historico [n]        resumo das últimas n revisões (10 por padrão), com as medianas

Rode dentro do pacote que mudou. O resultado vai para .revisao/review.json
e a página de revisão abre no navegador até você apertar Ctrl+C.
Se o agente gravou .revisao/manifesto.json, o Panorama mostra onde ele e o código discordam.
As suas decisões viram .revisao/feedback.md, o texto para devolver ao agente.
Cada revisão que chega a 100% vira uma linha em .revisao/historico.jsonl.`

// Acima disso a revisão não fecha: melhor pedir ao agente que fatie a tarefa.
const TRECHOS_DEMAIS = 40

await rodar()

async function rodar() {
  const [comando, ...argumentos] = process.argv.slice(2)
  if (comando === 'historico') return console.log(resumirHistorico(lerHistorico(path.join(process.cwd(), '.revisao')), Number(argumentos[0]) || undefined))
  const argsDoGit = argumentos.filter(arg => !['--sem-tela', '--sem-ia', '--watch'].includes(arg))
  const semIa = argumentos.includes('--sem-ia')
  const observar = argumentos.includes('--watch')
  // Sem terminal, quem chamou é um script ou um agente: a página ficaria aberta esperando ninguém.
  const comTela = !argumentos.includes('--sem-tela') && process.stdout.isTTY
  if (comando !== 'diff' || argsDoGit.includes('--help') || argsDoGit.includes('-h')) {
    console.log(AJUDA)
    process.exit(comando === 'diff' || comando === undefined || comando === '--help' ? 0 : 1)
  }

  // Observar só faz sentido com a página aberta para receber o aviso.
  if (observar && !comTela) {
    console.error('--watch precisa da página: rode num terminal e sem --sem-tela.')
    process.exit(1)
  }

  exigirRepositorio()
  const raiz = process.cwd()
  const inicio = performance.now()
  const narrador = { semIa, ...lerConfigDoNarrador(raiz) }
  const motor = new Motor(raiz, lerConfig(raiz))
  // Antes da análise: o manifesto que o agente gravou em .revisao/ não pode entrar no diff como arquivo novo.
  esconderDoGit()
  const { revisao, tempos } = await gerarRevisao(motor, argsDoGit, raiz, narrador)
  imprimir(revisao, descreverTempos(performance.now() - inicio, tempos))
  // Só o --watch precisa da thread de análise viva depois da primeira vez.
  if (!observar) motor.encerrar()
  if (!comTela) return
  console.log(`\nPágina de revisão em ${await abrirTela(raiz, narrador)} · Ctrl+C para sair`)
  if (observar) {
    console.log('Observando os arquivos do projeto: a página atualiza quando algo mudar.')
    observarProjeto(raiz, () => reanalisar(motor, argsDoGit, raiz, narrador))
  }
}

function exigirRepositorio() {
  try {
    git(['rev-parse', '--show-toplevel'])
  } catch {
    console.error('keg diff precisa rodar dentro de um repositório git.')
    process.exit(1)
  }
}

function lerConfig(raiz: string): Config {
  const arquivo = path.join(raiz, '.revisao', 'keg.config.json')
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
}

// Analisa e grava o review.json. O que já foi narrado fica no cache; com --sem-ia, nenhuma frase da IA aparece.
async function gerarRevisao(motor: Motor, argsDoGit: string[], raiz: string, narrador: OpcoesDoNarrador): Promise<Analise> {
  const { revisao, tempos } = await motor.analisar(argsDoGit)
  aplicarManifesto(revisao, raiz)
  if (!narrador.semIa) preencherDoCache(revisao, raiz, narrador)
  const pastaDaRevisao = path.join(raiz, '.revisao')
  mkdirSync(pastaDaRevisao, { recursive: true })
  // Grava num arquivo ao lado e renomeia: a página, avisada no meio da gravação, nunca lê um JSON pela metade.
  const provisorio = path.join(pastaDaRevisao, 'review.json.tmp')
  writeFileSync(provisorio, JSON.stringify(revisao, null, 2) + '\n')
  renameSync(provisorio, path.join(pastaDaRevisao, 'review.json'))
  return { revisao, tempos }
}

// Uma análise do --watch. A decisão de cada trecho está presa ao hash dele, então o que o agente mudou volta
// para "não revisado" e o resto mantém a decisão; só o feedback.md precisa ser regerado. Análise que falha
// (arquivo no meio de uma edição, por exemplo) deixa o review.json anterior e tenta de novo na próxima mudança.
async function reanalisar(motor: Motor, argsDoGit: string[], raiz: string, narrador: OpcoesDoNarrador) {
  const inicio = performance.now()
  const hora = new Date().toLocaleTimeString()
  try {
    const { revisao, tempos } = await gerarRevisao(motor, argsDoGit, raiz, narrador)
    gravarFeedback(path.join(raiz, '.revisao'))
    const trechos = revisao.arquivos.reduce((total, a) => total + a.hunks.length, 0)
    console.log(`${hora} · analisado de novo: ${revisao.fluxos.length} fluxos · ${revisao.orfaos.length} órfãos · ${trechos} trechos · ${descreverTempos(performance.now() - inicio, tempos)}`)
  } catch (erro) {
    console.error(`${hora} · a análise falhou, a página segue com a anterior: ${erro instanceof Error ? erro.message : erro}`)
  }
}

// O tempo de cada análise, com o que foi para o Project do ts-morph e o que foi para montar os fluxos.
function descreverTempos(milissegundos: number, tempos: Tempos): string {
  const projeto = tempos.projetoEmMemoria ? 'projeto em memória' : 'projeto aberto'
  return `${duracao(milissegundos)} (${projeto} ${duracao(tempos.projetoMs)}, fluxos ${duracao(tempos.fluxosMs)})`
}

function duracao(milissegundos: number): string {
  return milissegundos < 1000 ? `${Math.round(milissegundos)} ms` : `${(milissegundos / 1000).toFixed(1)}s`
}

// .revisao/ é da máquina de quem revisa: vai para o .git/info/exclude, sem mexer no .gitignore do projeto.
function esconderDoGit() {
  const exclude = path.resolve(git(['rev-parse', '--git-path', 'info/exclude']).trim())
  const atual = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (atual.split('\n').includes('.revisao/')) return
  mkdirSync(path.dirname(exclude), { recursive: true })
  appendFileSync(exclude, `${atual === '' || atual.endsWith('\n') ? '' : '\n'}.revisao/\n`)
}

function imprimir(revisao: Revisao, tempo: string) {
  const { metricas, fluxos, orfaos, testes, arquivos } = revisao
  const trechos = arquivos.flatMap(a => a.hunks.map(h => h.id))
  const emFluxo = new Set(fluxos.flatMap(f => f.passos.flatMap(p => p.hunkIds)))
  const linhas = [
    `keg diff · ${revisao.base} · ${arquivos.length} arquivos (${metricas.arquivosNovos} novos) · ${trechos.length} trechos · ${tempo}`,
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
