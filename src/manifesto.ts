// Manifesto: o fluxo que o executor declarou em .revisao/manifesto.json, conferido contra o que o motor calculou.
// Só existe conferência quando o arquivo existe; sem ele, o review.json fica como estava.
//
// Regras de casamento entre o declarado ("arquivo:linha" ou "arquivo:linha símbolo") e o código:
//  1. O arquivo é o mesmo. "./" e prefixo de pasta de monorepo não contam: vale o fim do caminho.
//  2. A linha declarada cai dentro do intervalo do passo, ou o símbolo declarado é o do passo
//     (sem parênteses, e só o último nome de "Classe.metodo"). Uma das duas basta, por causa do
//     agente que erra a linha depois de editar o arquivo.
//  3. Um passo declarado EXISTE se casa com algum passo dos fluxos, com uma função alterada do grafo
//     ou com um trecho alterado do arquivo. Fluxo declarado cujos passos não existem em lugar nenhum
//     é "fluxo inexistente"; se só alguns não existem, cada um é um "passo inexistente".
//  4. Um fluxo calculado está DECLARADO se alguma referência do manifesto (nasce, termina ou passo)
//     casa com um passo dele que foi alterado ou que é ponta (nasce/termina). Passo de contexto do
//     meio não conta, senão um helper compartilhado daria por contado um fluxo que ninguém contou.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Divergencia, Fluxo, Passo, Revisao } from './contrato.js'

type Trecho = Pick<Passo, 'arquivo' | 'linhas' | 'simbolo'>
interface Referencia { texto: string; arquivo: string; linha: number; simbolo?: string }
interface FluxoDeclarado { nome: string; referencias: (Referencia | string)[] }
interface Manifesto { tarefa?: string; fluxos: FluxoDeclarado[] }

export function aplicarManifesto(revisao: Revisao, raiz: string) {
  const arquivo = path.join(raiz, '.revisao', 'manifesto.json')
  if (!existsSync(arquivo)) return
  const lido = lerManifesto(arquivo)
  if (typeof lido === 'string') {
    revisao.manifesto = { erro: lido, divergencias: [] }
    return
  }
  const divergencias = conferir(lido.fluxos, revisao)
  revisao.manifesto = { tarefa: lido.tarefa, divergencias }
  revisao.metricas.divergenciasDoManifesto = divergencias.length
}

// Devolve o manifesto ou, se não der para ler, o motivo em texto.
function lerManifesto(arquivo: string): Manifesto | string {
  let bruto: any
  try {
    bruto = JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    return 'o manifesto.json não é um JSON válido'
  }
  if (!Array.isArray(bruto?.fluxos)) return 'o manifesto.json não tem a lista "fluxos"'
  const fluxos = bruto.fluxos.filter((f: any) => f && typeof f === 'object').map((f: any) => ({
    nome: typeof f.nome === 'string' ? f.nome : '(sem nome)',
    referencias: [f.nasce, ...(Array.isArray(f.passos) ? f.passos : []), f.termina]
      .filter((texto): texto is string => typeof texto === 'string')
      .map(lerReferencia),
  }))
  return { tarefa: typeof bruto.tarefa === 'string' ? bruto.tarefa : undefined, fluxos }
}

// Referência fora do formato fica como texto cru: vira divergência em vez de sumir.
function lerReferencia(texto: string): Referencia | string {
  const partes = texto.match(/^\s*(.+?):(\d+)(?:\s*[-–]\s*\d+)?(?:\s+(.+?))?\s*$/)
  if (!partes) return texto
  return { texto: texto.trim(), arquivo: limparCaminho(partes[1]!), linha: Number(partes[2]), simbolo: partes[3] }
}

function conferir(declarados: FluxoDeclarado[], revisao: Revisao): Divergencia[] {
  const divergencias: Divergencia[] = []
  const contados = new Set<Fluxo>()
  const alterados: Trecho[] = (revisao.grafo?.nos ?? []).filter(no => no.hunkIds.length > 0)
  const todos: Trecho[] = [...revisao.fluxos.flatMap(f => f.passos), ...alterados]

  for (const declarado of declarados) {
    const existentes = declarado.referencias.map(ref => typeof ref !== 'string' && existe(ref, todos, revisao))
    if (!existentes.some(Boolean)) {
      divergencias.push({ tipo: 'declarado-inexistente', texto: `Fluxo declarado que não existe no código: "${declarado.nome}".` })
      continue
    }
    declarado.referencias.forEach((ref, i) => {
      if (!existentes[i]) divergencias.push({ tipo: 'declarado-inexistente', texto: `Passo declarado que não existe no código: ${typeof ref === 'string' ? `"${ref}" fora do formato arquivo:linha` : ref.texto} (fluxo "${declarado.nome}").` })
    })
    for (const fluxo of revisao.fluxos) {
      if (declarado.referencias.some(ref => typeof ref !== 'string' && conta(fluxo, ref))) contados.add(fluxo)
    }
  }

  for (const fluxo of revisao.fluxos.filter(f => !contados.has(f))) {
    const [inicio] = fluxo.passos
    const onde = inicio ? ` (começa em ${inicio.arquivo}:${inicio.linhas[0]})` : ''
    divergencias.push({ tipo: 'calculado-nao-declarado', fluxoId: fluxo.id, texto: `Fluxo que o manifesto não conta: ${fluxo.titulo}${onde}, ${fluxo.passos.length} passos.` })
  }
  return divergencias
}

function existe(ref: Referencia, trechos: Trecho[], revisao: Revisao): boolean {
  if (trechos.some(trecho => casa(ref, trecho))) return true
  const arquivo = revisao.arquivos.find(a => mesmoArquivo(a.caminho, ref.arquivo))
  return arquivo?.hunks.some(h => h.linhas[0] <= ref.linha && ref.linha <= h.linhas[1]) ?? false
}

function conta(fluxo: Fluxo, ref: Referencia): boolean {
  return fluxo.passos.some(passo => (passo.hunkIds.length > 0 || passo.papel !== 'processa') && casa(ref, passo))
}

function casa(ref: Referencia, trecho: Trecho): boolean {
  if (!mesmoArquivo(trecho.arquivo, ref.arquivo)) return false
  const naLinha = trecho.linhas[0] <= ref.linha && ref.linha <= trecho.linhas[1]
  return naLinha || (ref.simbolo !== undefined && ultimoNome(ref.simbolo) === ultimoNome(trecho.simbolo))
}

function mesmoArquivo(a: string, b: string): boolean {
  const [x, y] = [limparCaminho(a), limparCaminho(b)]
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`)
}

function limparCaminho(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/^\.\//, '')
}

function ultimoNome(simbolo: string): string {
  return simbolo.replace(/\(.*$/, '').trim().split('.').pop() ?? ''
}
