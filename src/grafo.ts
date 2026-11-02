// Grafo da tela Mapa: das unidades alteradas e dos passos dos fluxos, anda mais 2 saltos para trás e para
// frente e grava só isso no review.json. A página expande os vizinhos por clique sem precisar do compilador.
import type { Analisador, Fronteira, Ligacao, Unidade } from './analisador.js'
import type { ArestaDoGrafo, Grafo, NoDoGrafo, Papel } from './contrato.js'
import type { Trilha } from './montador.js'

const SALTOS = 2
// Uma função muito chamada, como um helper de log, engoliria o mapa: cada nó mostra poucos vizinhos por lado e anota "mais N".
const VIZINHOS_POR_LADO = 5
const NOS_DEMAIS = 150

type Lado = 'cliente' | 'servidor'
// de chama para; o tipo diz se o compilador prova a ligação.
interface Ponta { de: Unidade; para: Unidade; tipo: ArestaDoGrafo['tipo']; fronteira?: Fronteira }
interface Contexto { doFluxo: Ponta[]; sementes: Set<Unidade>; analisador: Analisador }

export function montarGrafo(alteradas: Map<Unidade, string[]>, trilhas: Trilha[], papeis: Map<string, Papel>, analisador: Analisador): Grafo {
  const sementes = new Set([...alteradas.keys(), ...trilhas.flatMap(t => [...t.unidades])])
  const doFluxo = trilhas.flatMap(t => t.arestas).map(a => ponta(a.de, a.para, a))
  const contexto = { doFluxo, sementes, analisador }
  const conhecidas = new Set(sementes)
  const expandidas = new Set<Unidade>()
  const pontas = new Map<string, Ponta>()
  const mais = new Map<Unidade, number>()

  for (let salto = 0; salto < SALTOS; salto++) {
    for (const unidade of [...conhecidas].filter(u => !expandidas.has(u))) {
      expandidas.add(unidade)
      const { mantidas, cortadas } = vizinhancaDe(unidade, contexto, NOS_DEMAIS - conhecidas.size)
      if (cortadas > 0) mais.set(unidade, cortadas)
      juntar(pontas, mantidas)
      for (const p of mantidas) {
        conhecidas.add(p.de)
        conhecidas.add(p.para)
      }
    }
  }

  const lados = ladosDoGrafo(conhecidas, [...pontas.values()], analisador)
  const nos = [...conhecidas].map((u): NoDoGrafo => {
    const no: NoDoGrafo = {
      id: u.chave, simbolo: u.simbolo, arquivo: u.arquivo, linhas: u.linhas,
      papel: papeis.get(u.chave) ?? papelDoCodigo(analisador.preparar(u)), hunkIds: alteradas.get(u) ?? [],
    }
    if (lados.has(u)) no.lado = lados.get(u)
    if (mais.has(u)) no.mais = mais.get(u)
    return no
  })
  return { nos, arestas: [...pontas.values()].map(p => ({ de: p.de.chave, para: p.para.chave, tipo: p.tipo })) }
}

function ponta(de: Unidade, para: Unidade, { fronteira, dinamico }: { fronteira?: Fronteira; dinamico?: boolean }): Ponta {
  let tipo: Ponta['tipo'] = 'chamada'
  if (fronteira === 'http') tipo = 'http'
  else if (dinamico) tipo = 'dinamico'
  return { de, para, tipo, fronteira }
}

function chaveDa(p: Ponta): string {
  return `${p.de.chave}>${p.para.chave}`
}

// A mesma ligação chega por vários caminhos (o que o chamador vê, o que o chamado vê, o fluxo). O fluxo só sabe "chamada":
// quem diz que a ligação é http ou dinâmica é o analisador, e essa informação não pode se perder.
function juntar(destino: Map<string, Ponta>, novas: Ponta[]): Map<string, Ponta> {
  for (const p of novas) {
    const existente = destino.get(chaveDa(p))
    if (!existente || existente.tipo === 'chamada') destino.set(chaveDa(p), p)
  }
  return destino
}

// Quem a unidade chama, quem a chama e as ligações do próprio fluxo, que o motor já provou (o fetch para a rota, por exemplo).
// Vizinha que já é nó do grafo fica sempre; o resto passa por um corte, e o que sobra vira o "mais N" do nó.
function vizinhancaDe(u: Unidade, { doFluxo, sementes, analisador }: Contexto, vagasNoGrafo: number) {
  const saindo = analisador.preparar(u).chamadas.map((l: Ligacao) => ponta(u, l.unidade, l))
  const chegando = analisador.chamadoresDe(u).map(l => ponta(l.unidade, u, l))
  const todas = [...saindo, ...chegando, ...doFluxo.filter(p => p.de === u || p.para === u)]
  const unicas = [...juntar(new Map(), todas).values()]
  const outra = (p: Ponta) => (p.de === u ? p.para : p.de)

  let vagas = vagasNoGrafo
  const mantidas: Ponta[] = []
  for (const sentido of [(p: Ponta) => p.de === u, (p: Ponta) => p.para === u]) {
    const doLado = unicas.filter(sentido)
    const fixas = doLado.filter(p => sementes.has(outra(p)))
    const livres = doLado.filter(p => !sementes.has(outra(p))).sort((a, b) => outra(a).chave.localeCompare(outra(b).chave))
    const aceitas = livres.slice(0, Math.max(0, Math.min(VIZINHOS_POR_LADO, vagas)))
    vagas -= aceitas.length
    mantidas.push(...fixas, ...aceitas)
  }
  return { mantidas, cortadas: unicas.length - mantidas.length }
}

// Sem fluxo que diga o papel, o código diz: quem tem fonte nasce; quem só tem saída, termina.
function papelDoCodigo(u: Unidade): Papel {
  if (u.fontes.size > 0) return 'nasce'
  return u.saidas.size > 0 && u.chamadas.length === 0 ? 'termina' : 'processa'
}

// O lado vem da diretiva ou da rota. Num fetch para a rota do projeto, quem chama é o cliente e a rota é o servidor;
// no Pages Router, o getServerSideProps entrega as props ao componente da página como JSON.
function ladosDoGrafo(unidades: Set<Unidade>, pontas: Ponta[], analisador: Analisador): Map<Unidade, Lado> {
  const lados = new Map<Unidade, Lado>()
  for (const u of unidades) {
    const lado = analisador.ladoDe(u)
    if (lado) lados.set(u, lado)
  }
  for (const { de, para, tipo, fronteira } of pontas) {
    if (tipo !== 'http' && fronteira !== 'cliente-servidor') continue
    if (!lados.has(de)) lados.set(de, tipo === 'http' ? 'cliente' : 'servidor')
    if (!lados.has(para)) lados.set(para, tipo === 'http' ? 'servidor' : 'cliente')
  }
  return lados
}
