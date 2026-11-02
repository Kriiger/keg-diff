// Monorepo: "@equipe/utils" só resolve com o node_modules instalado. Sem ele, o motor aponta o nome
// de cada pacote do workspace direto para o fonte, como o bundler faria.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export function caminhosDosPacotes(raiz: string): Record<string, string[]> {
  const caminhos: Record<string, string[]> = {}
  const raizDoMonorepo = acharRaizDoMonorepo(raiz)
  if (!raizDoMonorepo) return caminhos
  for (const pasta of pastasDosWorkspaces(raizDoMonorepo)) {
    const pacote = lerJson(path.join(pasta, 'package.json'))
    if (typeof pacote?.name !== 'string') continue
    const entrada = entradaDoFonte(pasta, pacote)
    if (entrada) caminhos[pacote.name] = [entrada]
    caminhos[`${pacote.name}/*`] = [path.join(pasta, 'src', '*'), path.join(pasta, '*')]
  }
  return caminhos
}

function acharRaizDoMonorepo(inicio: string): string | undefined {
  for (let pasta = inicio; ; pasta = path.dirname(pasta)) {
    if (existsSync(path.join(pasta, 'pnpm-workspace.yaml')) || lerJson(path.join(pasta, 'package.json'))?.workspaces) return pasta
    if (path.dirname(pasta) === pasta) return undefined
  }
}

// "packages/*" e "apps/web": o glob simples que quase todo monorepo usa.
function pastasDosWorkspaces(raiz: string): string[] {
  const declarados = lerJson(path.join(raiz, 'package.json'))?.workspaces
  const padroes: string[] = Array.isArray(declarados) ? declarados : declarados?.packages ?? []
  const yaml = path.join(raiz, 'pnpm-workspace.yaml')
  if (existsSync(yaml)) padroes.push(...lerPacotesDoPnpm(readFileSync(yaml, 'utf8')))
  return padroes.filter(p => !p.startsWith('!')).flatMap(padrao => {
    const base = path.join(raiz, padrao.replace(/\/\*\*?$/, ''))
    if (!padrao.endsWith('*')) return [base]
    if (!existsSync(base)) return []
    return readdirSync(base).map(nome => path.join(base, nome)).filter(pasta => statSync(pasta).isDirectory())
  })
}

function lerPacotesDoPnpm(texto: string): string[] {
  const bloco = texto.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? ''
  return [...bloco.matchAll(/^\s*-\s*['"]?([^'"#\s]+)['"]?/gm)].map(m => m[1]!)
}

// O package.json aponta para o build ou já para o fonte; o fonte costuma estar em src/.
function entradaDoFonte(pasta: string, pacote: Record<string, any>): string | undefined {
  const ponto = typeof pacote.exports === 'string' ? pacote.exports : pacote.exports?.['.']
  const declaradas = [ponto, ponto?.import, ponto?.default, ponto?.types, pacote.module, pacote.main, pacote.types]
  const candidatas = declaradas.filter((c): c is string => typeof c === 'string').flatMap(c => {
    const limpo = c.replace(/^\.\//, '').replace(/\.(d\.ts|[cm]?js)$/, '')
    const fonte = limpo.replace(/^(dist|build|lib|out)\//, 'src/')
    return [c, ...['.ts', '.tsx', '.js'].flatMap(ext => [limpo + ext, fonte + ext])]
  })
  candidatas.push('src/index.ts', 'src/index.tsx', 'index.ts', 'index.js')
  return candidatas.map(c => path.join(pasta, c)).find(c => existsSync(c) && statSync(c).isFile())
}

function lerJson(arquivo: string): Record<string, any> | undefined {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    return undefined
  }
}
