// O Project do ts-morph: abre o repositório pelo tsconfig (ou pelos arquivos de código) e, no --watch,
// atualiza o que mudou em vez de abrir tudo de novo.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { Project, ts } from 'ts-morph'
import { caminhosDosPacotes } from './monorepo.js'

// Mudar um destes muda os paths, os pacotes do workspace ou as dependências instaladas: o Project antigo não vale mais.
const ARQUIVOS_DE_CONFIG = ['tsconfig.json', 'jsconfig.json', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'bun.lock']

export function abrirProjeto(raiz: string): Project {
  const pacotes = caminhosDosPacotes(raiz)
  const config = acharConfig(raiz)
  if (config) {
    // Os paths do próprio tsconfig ganham dos pacotes do workspace.
    const paths = { ...pacotes, ...ts.readConfigFile(config, ts.sys.readFile).config?.compilerOptions?.paths }
    return new Project({ tsConfigFilePath: config, compilerOptions: { allowJs: true, paths } })
  }
  const projeto = new Project({
    compilerOptions: {
      allowJs: true, jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: raiz, paths: pacotes,
    },
  })
  projeto.addSourceFilesAtPaths(arquivosDeCodigo(raiz))
  return projeto
}

// Data e tamanho dos arquivos de configuração: se mudou, o Project em memória está velho e é reaberto.
export function assinaturaDaConfig(raiz: string): string {
  return ARQUIVOS_DE_CONFIG.map(nome => {
    const arquivo = path.join(raiz, nome)
    if (!existsSync(arquivo)) return nome
    const { mtimeMs, size } = statSync(arquivo)
    return `${nome}:${mtimeMs}:${size}`
  }).join('|')
}

// Lê de novo cada arquivo do projeto fora do node_modules (o ts-morph só reprocessa o que mudou, e ler tudo
// custa uns 100 ms num monorepo de 1.700 arquivos) e acrescenta os que nasceram. Não depende de nenhum evento
// do observador: um evento perdido não deixa a análise com código velho.
export function atualizarProjeto(projeto: Project, raiz: string) {
  for (const arquivo of projeto.getSourceFiles()) {
    if (!arquivo.isInNodeModules()) arquivo.refreshFromFileSystemSync()
  }
  const config = acharConfig(raiz)
  if (config) projeto.addSourceFilesFromTsConfig(config)
  else projeto.addSourceFilesAtPaths(arquivosDeCodigo(raiz))
}

function acharConfig(raiz: string): string | undefined {
  return ['tsconfig.json', 'jsconfig.json'].map(nome => path.join(raiz, nome)).find(existsSync)
}

// Sem tsconfig, o projeto é todo arquivo de código fora das pastas de dependência e de build.
function arquivosDeCodigo(raiz: string): string[] {
  return [`${raiz}/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `!${raiz}/**/{node_modules,dist,build,.next}/**`]
}
