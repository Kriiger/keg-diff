// keg historico: as últimas revisões do historico.jsonl e as medianas que dizem se o keg diff está funcionando.
import type { LinhaDoHistorico } from './contrato.js'

const QUANTAS_PADRAO = 10
// Roteiro 1, "Como medir": passando de 1 falso positivo em cada 10 passos, o motor precisa de ajuste.
const LIMITE_DE_FALSO_POSITIVO = 0.1

export function resumirHistorico(todas: LinhaDoHistorico[], quantas = QUANTAS_PADRAO): string {
  if (todas.length === 0) return 'Nenhuma revisão registrada ainda: o keg grava uma linha em .revisao/historico.jsonl quando todos os trechos de uma revisão têm decisão.'
  const linhas = todas.slice(-quantas)
  const achados = (l: LinhaDoHistorico) => l.achados.comentarios + l.achados.codigoMorto + (l.achados.narrador ?? 0)
  const taxas = linhas.filter(l => l.passos.total > 0).map(l => l.passos.falsosPositivos / l.passos.total)
  const falsos = soma(linhas.map(l => l.passos.falsosPositivos))
  const passos = soma(linhas.map(l => l.passos.total))
  const taxaGeral = passos === 0 ? 0 : falsos / passos
  const taxaMediana = mediana(taxas) ?? 0
  const notas = linhas.flatMap(l => (l.nota === null ? [] : [l.nota]))

  const saida = [
    `keg historico · ${linhas.length === todas.length ? `${todas.length} ${todas.length === 1 ? 'revisão' : 'revisões'}` : `últimas ${linhas.length} de ${todas.length} revisões`}`,
    '',
    `  ${'quando'.padEnd(12)} ${'base'.padEnd(18)} ${'tempo'.padEnd(8)} ${'achados'.padEnd(8)} ${'nota'.padEnd(5)} ${'falso+'.padEnd(8)} narrador`,
    ...linhas.map(l => `  ${quando(l.registradoEm).padEnd(12)} ${encurtar(l.base).padEnd(18)} ${duracao(l.tempoSegundos).padEnd(8)} ${String(achados(l)).padEnd(8)} ${String(l.nota ?? '-').padEnd(5)} ${`${l.passos.falsosPositivos}/${l.passos.total}`.padEnd(8)} ${l.narrador.chamadas} ${l.narrador.chamadas === 1 ? 'chamada' : 'chamadas'}`),
    '',
    `Medianas: tempo ${duracao(mediana(linhas.map(l => l.tempoSegundos)) ?? 0)} · achados ${mediana(linhas.map(achados)) ?? 0} · nota ${mediana(notas) ?? 'sem nota'} · falso positivo ${porcento(taxaMediana)} (${falsos} de ${passos} passos no total)`,
    `Narrador: ${soma(linhas.map(l => l.narrador.chamadas))} chamadas, ${soma(linhas.map(l => l.narrador.avisosDeLimite))} avisos de limite · login ${[...new Set(linhas.map(l => l.narrador.login ?? 'nenhum'))].join(', ')}`,
    `Manifesto: ${soma(linhas.map(l => l.divergenciasDoManifesto))} divergências · ${soma(linhas.map(l => l.arquivosNovos))} arquivos novos`,
  ]
  if (Math.max(taxaMediana, taxaGeral) > LIMITE_DE_FALSO_POSITIVO) {
    saida.push('', `Atenção: mais de 1 falso positivo a cada 10 passos (${porcento(Math.max(taxaMediana, taxaGeral))}). O motor precisa de ajuste: olhe os órfãos marcados como falso positivo e rode o npm run calibrar.`)
  }
  return saida.join('\n')
}

function soma(numeros: number[]): number {
  return numeros.reduce((total, n) => total + n, 0)
}

export function mediana(numeros: number[]): number | undefined {
  if (numeros.length === 0) return undefined
  const ordenados = [...numeros].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  const valor = ordenados.length % 2 === 1 ? ordenados[meio]! : (ordenados[meio - 1]! + ordenados[meio]!) / 2
  return Math.round(valor * 10) / 10
}

function porcento(fracao: number): string {
  return `${Math.round(fracao * 100)}%`
}

function duracao(segundos: number): string {
  const total = Math.round(segundos)
  if (total < 60) return `${total}s`
  const minutos = Math.floor(total / 60)
  return minutos < 60 ? `${minutos}m${String(total % 60).padStart(2, '0')}s` : `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}m`
}

function quando(iso: string): string {
  const data = new Date(iso)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} ${dois(data.getHours())}:${dois(data.getMinutes())}`
}

function encurtar(base: string): string {
  return base.length > 18 ? base.slice(0, 17) + '…' : base
}
