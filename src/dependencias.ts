// O que mudou nas dependências: compara o package.json de antes com o de agora, seção por seção.
import type { Dependencia } from './contrato.js'

const SECOES = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

// package.json ilegível (no meio de uma edição, ou sem o lado de antes) não derruba o panorama: só não conta nada.
export function compararDependencias(arquivo: string, antes: string | undefined, depois: string | undefined): Dependencia[] {
  const velho = lerSecoes(antes)
  const novo = lerSecoes(depois)
  return SECOES.flatMap(secao => {
    const nomes = new Set([...Object.keys(velho[secao] ?? {}), ...Object.keys(novo[secao] ?? {})])
    return [...nomes].sort().flatMap((nome): Dependencia[] => {
      const [de, para] = [velho[secao]?.[nome], novo[secao]?.[nome]]
      if (de === para) return []
      const dependencia: Dependencia = { nome, secao, arquivo }
      if (de !== undefined) dependencia.antes = de
      if (para !== undefined) dependencia.depois = para
      return [dependencia]
    })
  })
}

function lerSecoes(texto: string | undefined): Partial<Record<(typeof SECOES)[number], Record<string, string>>> {
  try {
    return texto === undefined ? {} : JSON.parse(texto)
  } catch {
    return {}
  }
}
