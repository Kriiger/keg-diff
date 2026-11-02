// historico.jsonl: uma linha por revisão que chegou a 100%, para ver ao longo das semanas se o keg diff funciona.
// O servidor chama registrarRevisao a cada decisão e a cada nota; só grava quando todos os trechos têm decisão.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { LinhaDoHistorico, Revisao } from './contrato.js'
import { lerEstado, lerNota } from './estado.js'
import { contarAchados } from './feedback.js'
import type { Sessao } from './sessao.js'

// Linha ilegível (editada à mão, gravação cortada) é pulada: o resto do histórico continua valendo.
export function lerHistorico(pastaDaRevisao: string): LinhaDoHistorico[] {
  return linhasDoArquivo(pastaDaRevisao).flatMap(texto => {
    const linha = lerLinha(texto)
    return linha ? [linha] : []
  })
}

// Devolve true se gravou. Uma revisão tem uma linha só, identificada pelo início da sessão: gravar de novo
// (a nota veio depois, o agente refez um trecho e a cobertura voltou a 100%) troca a linha de lugar.
export function registrarRevisao(pastaDaRevisao: string, sessao: Sessao): boolean {
  const arquivoDaRevisao = path.join(pastaDaRevisao, 'review.json')
  if (!existsSync(arquivoDaRevisao)) return false
  const revisao: Revisao = JSON.parse(readFileSync(arquivoDaRevisao, 'utf8'))
  const estado = lerEstado(pastaDaRevisao)
  const trechos = revisao.arquivos.flatMap(a => a.hunks.map(h => h.id))
  if (trechos.length === 0 || trechos.some(id => !estado[id])) return false

  // A nota de uma revisão anterior fica em nota.json até a pessoa dar outra: só vale a dada depois do início desta.
  const nota = lerNota(pastaDaRevisao)
  const passosAlterados = revisao.fluxos.flatMap(f => f.passos).filter(p => p.hunkIds.length > 0).length
  const linha: LinhaDoHistorico = {
    iniciadoEm: sessao.iniciadoEm,
    registradoEm: new Date().toISOString(),
    base: revisao.base,
    tempoSegundos: sessao.segundos,
    achados: contarAchados(revisao, estado),
    passos: {
      total: passosAlterados + revisao.orfaos.length,
      falsosPositivos: revisao.orfaos.filter(o => o.hunkIds.some(id => estado[id]?.decisao === 'falso-positivo')).length,
    },
    divergenciasDoManifesto: revisao.metricas.divergenciasDoManifesto,
    arquivosNovos: revisao.metricas.arquivosNovos,
    arquivosAlterados: revisao.metricas.arquivosAlterados,
    trechos: trechos.length,
    nota: nota && nota.em >= sessao.iniciadoEm ? nota.nota : null,
    narrador: sessao.narrador,
  }
  substituirOuAcrescentar(pastaDaRevisao, linha)
  sessao.marcarRegistrada()
  return true
}

function substituirOuAcrescentar(pastaDaRevisao: string, linha: LinhaDoHistorico) {
  const linhas = linhasDoArquivo(pastaDaRevisao)
  const posicao = linhas.findIndex(texto => lerLinha(texto)?.iniciadoEm === linha.iniciadoEm)
  if (posicao >= 0) linhas[posicao] = JSON.stringify(linha)
  else linhas.push(JSON.stringify(linha))
  // Grava ao lado e renomeia: quem lê o arquivo (o keg historico, um script) nunca pega uma linha pela metade.
  const provisorio = path.join(pastaDaRevisao, 'historico.jsonl.tmp')
  writeFileSync(provisorio, linhas.join('\n') + '\n')
  renameSync(provisorio, path.join(pastaDaRevisao, 'historico.jsonl'))
}

function linhasDoArquivo(pastaDaRevisao: string): string[] {
  const arquivo = path.join(pastaDaRevisao, 'historico.jsonl')
  return existsSync(arquivo) ? readFileSync(arquivo, 'utf8').split('\n').filter(texto => texto.trim() !== '') : []
}

function lerLinha(texto: string): LinhaDoHistorico | undefined {
  try {
    const linha = JSON.parse(texto)
    return typeof linha?.iniciadoEm === 'string' ? linha : undefined
  } catch {
    return undefined
  }
}
