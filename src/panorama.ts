// O panorama: o que só o git e a sintaxe sabem sobre o diff e que os fluxos não mostram. Tudo determinístico, sem IA.
import path from 'node:path'
import { ARQUIVO_DE_CODIGO } from './analisador.js'
import { ARQUIVO_DE_TESTE } from './catalogo.js'
import type { ArquivoAlterado, Dependencia, InfoDoArquivo, Panorama, Revisao } from './contrato.js'
import { compararDependencias } from './dependencias.js'
import { endpointsTocados } from './endpoints.js'
import { lerHistorico } from './historico.js'
import { arquivosNaPonta, descreverIntervalo, lerNaPonta, pontasDoDiff } from './intervalo.js'
import { mediana } from './resumo-do-historico.js'
import { simbolosDoArquivo } from './simbolos.js'

// Nomes que se repetem pelo projeto: o teste de "route" só vale para a rota da mesma pasta.
const NOMES_GENERICOS = new Set(['index', 'route', 'page', 'layout'])
// from './x', import('./x'), require('./x'), jest.mock('./x'): o que um teste carrega.
const IMPORTACAO = /(?:from|import|require|mock)\s*\(?\s*['"]([^'"]+)['"]/g

export function montarPanorama(revisao: Revisao, raiz: string, argsDoGit: string[]): Panorama {
  const pontas = pontasDoDiff(argsDoGit)
  const codigo = revisao.arquivos.filter(a => ARQUIVO_DE_CODIGO.test(a.caminho) && !ARQUIVO_DE_TESTE.test(a.caminho))
  const pacotes = revisao.arquivos.filter(a => path.basename(a.caminho) === 'package.json')
  const lidos = [...codigo, ...pacotes]
  const antes = lerNaPonta(pontas.antes, lidos.filter(a => a.status !== 'novo').map(a => a.renomeadoDe ?? a.caminho))
  const depois = lerNaPonta(pontas.depois, lidos.filter(a => a.status !== 'removido').map(a => a.caminho))

  const simbolos = codigo.flatMap(a => simbolosDoArquivo(a.caminho, antes.get(a.renomeadoDe ?? a.caminho), depois.get(a.caminho)))
  const dependencias = pacotes.flatMap((a): Dependencia[] => compararDependencias(a.caminho, antes.get(a.renomeadoDe ?? a.caminho), depois.get(a.caminho)))
  const panorama: Panorama = {
    intervalo: descreverIntervalo(pontas), simbolos, endpoints: endpointsTocados(simbolos), dependencias,
    arquivos: infoDosArquivos(codigo, depois, chavesDosTestesTocados(revisao, pontas.depois), chavesDosTestesExistentes(pontas.depois)),
  }
  const ritmo = ritmoDoHistorico(raiz)
  if (ritmo) panorama.ritmo = ritmo
  return panorama
}

// Teste "de mesmo nome": Dashboard.test.tsx confere o Dashboard.tsx. É uma heurística, mas é a que o projeto costuma seguir.
function infoDosArquivos(codigo: ArquivoAlterado[], depois: Map<string, string>, tocados: Set<string>, existentes: Set<string>): InfoDoArquivo[] {
  return codigo.filter(a => depois.has(a.caminho)).map(a => {
    const chave = chaveDoNome(a.caminho)
    const teste = existentes.has(chave) ? 'existe' : 'nenhum'
    return { caminho: a.caminho, linhas: depois.get(a.caminho)!.replace(/\n$/, '').split('\n').length, teste: tocados.has(chave) ? 'tocado' : teste }
  })
}

// Um teste alterado cobre o arquivo que tem o nome dele e também o que ele importa: routeEtat.test.ts importa a rota "etat/route".
function chavesDosTestesTocados(revisao: Revisao, ponta: string | undefined): Set<string> {
  const arquivos = revisao.testes.map(t => t.arquivo)
  const textos = [...lerNaPonta(ponta, arquivos).values()]
  return new Set([...arquivos.map(chaveDoNome), ...textos.flatMap(texto => [...texto.matchAll(IMPORTACAO)].map(m => chaveDoNome(m[1]!)))])
}

function chavesDosTestesExistentes(ponta: string | undefined): Set<string> {
  return new Set(arquivosNaPonta(ponta).filter(caminho => ARQUIVO_DE_TESTE.test(caminho)).map(chaveDoNome))
}

function chaveDoNome(caminho: string): string {
  const partes = caminho.split('/')
  const base = partes.pop()!.replace(/\.(test|spec)(?=\.)/, '').replace(/\.[^.]+$/, '').toLowerCase()
  return NOMES_GENERICOS.has(base) ? `${partes.filter(p => p !== '__tests__').at(-1) ?? ''}/${base}` : base
}

// Quanto tempo você levou por trecho nas revisões que fechou em 100%: a base da estimativa da tela.
function ritmoDoHistorico(raiz: string): Panorama['ritmo'] {
  const fechadas = lerHistorico(path.join(raiz, '.revisao')).filter(l => l.trechos > 0 && l.tempoSegundos > 0)
  const segundos = mediana(fechadas.map(l => l.tempoSegundos / l.trechos))
  return segundos === undefined ? undefined : { segundosPorTrecho: Math.round(segundos), revisoes: fechadas.length }
}
