// Que arquivo do projeto a página pode ler: só os que a revisão aberta cita. .env, .git/config e o resto do disco nunca saem.
// Toda rota que entrega conteúdo de arquivo passa por aqui.
import { realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Revisao } from './contrato.js'

// Os lugares do review.json que guardam um caminho de arquivo, relativo à raiz e com "/".
function arquivosCitados(revisao: Revisao): Set<string> {
  const { arquivos, fluxos, orfaos, testes, grafo, panorama } = revisao
  return new Set([
    ...arquivos.flatMap(arquivo => (arquivo.renomeadoDe ? [arquivo.caminho, arquivo.renomeadoDe] : [arquivo.caminho])),
    ...fluxos.flatMap(fluxo => fluxo.passos.map(passo => passo.arquivo)),
    ...orfaos.map(orfao => orfao.arquivo),
    ...testes.map(teste => teste.arquivo),
    ...(grafo?.nos ?? []).map(no => no.arquivo),
    ...(panorama?.simbolos ?? []).map(simbolo => simbolo.arquivo),
    ...(panorama?.endpoints ?? []).map(endpoint => endpoint.arquivo),
    ...(panorama?.dependencias ?? []).map(dependencia => dependencia.arquivo),
    ...(panorama?.arquivos ?? []).map(info => info.caminho),
  ])
}

// O caminho pedido na forma em que o review.json o escreve, se a revisão o cita; caminho absoluto ou que sobe com ".." nunca casa.
// Serve sozinho para quem lê o arquivo de uma revisão do git, onde o arquivo pode nem existir mais no disco.
export function arquivoCitado(revisao: Revisao, pedido: string): string | undefined {
  const caminho = path.posix.normalize(pedido.replaceAll('\\', '/'))
  if (path.posix.isAbsolute(caminho) || caminho === '..' || caminho.startsWith('../')) return undefined
  return arquivosCitados(revisao).has(caminho) ? caminho : undefined
}

// O caminho real no disco do arquivo citado, para ler o conteúdo de agora. O link simbólico é seguido antes de conferir:
// um arquivo citado que aponta para fora do projeto não sai. Sem arquivo (removido, pasta, ilegível), undefined.
export function arquivoPermitido(raiz: string, revisao: Revisao, pedido: string): string | undefined {
  const citado = arquivoCitado(revisao, pedido)
  if (!citado) return undefined
  try {
    const real = realpathSync(path.resolve(raiz, citado))
    return real.startsWith(realpathSync(raiz) + path.sep) && statSync(real).isFile() ? real : undefined
  } catch {
    return undefined
  }
}
