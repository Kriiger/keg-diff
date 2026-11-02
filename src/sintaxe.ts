// Como ler o código do projeto: abrir com o tsconfig, reconhecer funções, nomes, diretivas e props.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Node, Project, SyntaxKind, ts } from 'ts-morph'
import { caminhosDosPacotes } from './monorepo.js'

// memo, forwardRef e useCallback embrulham a função, mas o nome continua sendo o da const.
export const EMBRULHO = /^(React\.)?(memo|forwardRef|useCallback|useMemo|cache)$/

export function abrirProjeto(raiz: string): Project {
  const pacotes = caminhosDosPacotes(raiz)
  const config = ['tsconfig.json', 'jsconfig.json'].map(nome => path.join(raiz, nome)).find(existsSync)
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
  projeto.addSourceFilesAtPaths([`${raiz}/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `!${raiz}/**/{node_modules,dist,build,.next}/**`])
  return projeto
}

// main, module, bin e exports do package.json apontam para o build; o fonte costuma estar em src/.
export function lerEntradasDoPacote(raiz: string): Set<string> {
  const arquivo = path.join(raiz, 'package.json')
  if (!existsSync(arquivo)) return new Set()
  const pacote = JSON.parse(readFileSync(arquivo, 'utf8'))
  const caminhos = JSON.stringify([pacote.main, pacote.module, pacote.bin, pacote.exports]).match(/"\.?\/?[\w./-]+\.[cm]?[jt]sx?"/g) ?? []
  const entradas = new Set<string>()
  for (const caminho of caminhos) {
    const limpo = semExtensao(caminho.slice(1, -1).replace(/^\.\//, ''))
    entradas.add(limpo)
    entradas.add(limpo.replace(/^(dist|build|lib|out)\//, 'src/'))
  }
  return entradas
}

export function ehFuncao(no: Node): boolean {
  if (Node.isFunctionDeclaration(no) || Node.isMethodDeclaration(no)) return true
  if (!Node.isArrowFunction(no) && !Node.isFunctionExpression(no)) return false
  let pai: Node | undefined = no.getParent()
  if (Node.isCallExpression(pai) && EMBRULHO.test(pai.getExpression().getText())) pai = pai.getParent()
  return Node.isVariableDeclaration(pai) || Node.isPropertyAssignment(pai) || Node.isPropertyDeclaration(pai) || Node.isExportAssignment(pai)
}

export function declaracoesDoModulo(instrucao: Node): Node[] {
  if (Node.isVariableStatement(instrucao)) return instrucao.getDeclarations().filter(d => Node.isIdentifier(d.getNameNode()))
  const ehDeclaracao = Node.isClassDeclaration(instrucao) || Node.isInterfaceDeclaration(instrucao)
    || Node.isTypeAliasDeclaration(instrucao) || Node.isEnumDeclaration(instrucao)
  return ehDeclaracao && instrucao.getName() ? [instrucao] : []
}

export function nomeDe(no: Node): Node | undefined {
  let alvo = no
  if (Node.isArrowFunction(no) || Node.isFunctionExpression(no)) {
    const pai = no.getParent()
    if (pai) alvo = Node.isCallExpression(pai) ? pai.getParent() ?? pai : pai
  }
  return Node.hasName(alvo) ? alvo.getNameNode() : undefined
}

export function declaracaoDe(alvo: Node): Node | undefined {
  const nome = Node.isPropertyAccessExpression(alvo) ? alvo.getNameNode() : alvo
  let simbolo = nome.getSymbol()
  if (simbolo?.isAlias()) simbolo = simbolo.getAliasedSymbol() ?? simbolo
  return simbolo?.getDeclarations()[0]
}

// const [saldo, setSaldo] = useState(): chamar setSaldo devolve o dado à tela num novo render.
export function ehSetterDeEstado(alvo: Node): boolean {
  const declaracao = declaracaoDe(alvo)
  const padrao = declaracao?.getParent()
  if (!Node.isBindingElement(declaracao) || !Node.isArrayBindingPattern(padrao)) return false
  const variavel = padrao.getParent()
  const inicial = Node.isVariableDeclaration(variavel) ? variavel.getInitializer() : undefined
  return padrao.getElements()[1] === declaracao && /(useState|useReducer)\(/.test(inicial?.getText() ?? '')
}

// A prop que uma chamada usa, onSalvar() ou props.onSalvar(), e o componente que a recebe.
export function propDoComponente(alvo: Node): { prop: string; componente: Node } | undefined {
  const raiz = Node.isPropertyAccessExpression(alvo) ? alvo.getExpression() : alvo
  const declaracao = raiz.getSymbol()?.getDeclarations()[0]
  const parametro = Node.isParameterDeclaration(declaracao) ? declaracao : declaracao?.getFirstAncestorByKind(SyntaxKind.Parameter)
  const componente = parametro?.getParent()
  if (!componente) return undefined
  if (Node.isPropertyAccessExpression(alvo)) return { prop: alvo.getName(), componente }
  if (Node.isBindingElement(declaracao)) return { prop: declaracao.getPropertyNameNode()?.getText() ?? declaracao.getName(), componente }
  return undefined
}

// '/api/x' ou `/api/sessao/${id}`: o caminho que dá para casar com uma rota. A parte montada vira um segmento qualquer.
export function caminhoDaUrl(url: Node): { url: string; montada: boolean } | undefined {
  if (Node.isStringLiteral(url) || Node.isNoSubstitutionTemplateLiteral(url)) {
    const valor = url.getLiteralValue()
    return valor.startsWith('/') ? { url: valor, montada: false } : undefined
  }
  if (!Node.isTemplateExpression(url)) return undefined
  const valor = url.getHead().getLiteralText() + url.getTemplateSpans().map(trecho => 'x' + trecho.getLiteral().getLiteralText()).join('')
  return valor.startsWith('/') ? { url: valor, montada: true } : undefined
}

// "const total = await contar()" usa o valor; "contar()" sozinho na linha, não.
export function usaRetorno(chamada: Node): boolean {
  let pai = chamada.getParent()
  while (Node.isAwaitExpression(pai) || Node.isParenthesizedExpression(pai)) pai = pai.getParent()
  return !Node.isExpressionStatement(pai)
}

// return { redirect: { destination } } ou { notFound: true } no getServerSideProps: a página nem chega a renderizar.
export function ehRedirecionamento(no: Node): boolean {
  if (!Node.isPropertyAssignment(no)) return false
  const valor = no.getInitializer()?.getText() ?? ''
  return (no.getName() === 'redirect' && /\bdestination\b/.test(valor)) || (no.getName() === 'notFound' && valor === 'true')
}

export function atributoDeEvento(referencia: Node): Node | undefined {
  const atributo = referencia.getParent()?.getParent()
  return Node.isJsxAttribute(atributo) && /^on[A-Z]/.test(atributo.getNameNode().getText()) ? atributo : undefined
}

export function diretiva(instrucoes: Node[]): string | undefined {
  const primeira = instrucoes[0]
  const expressao = Node.isExpressionStatement(primeira) ? primeira.getExpression() : undefined
  return Node.isStringLiteral(expressao) ? expressao.getLiteralValue() : undefined
}

export function diretivaDaFuncao(no: Node): string | undefined {
  const corpo = Node.isFunctionDeclaration(no) || Node.isArrowFunction(no) || Node.isFunctionExpression(no) ? no.getBody() : undefined
  return Node.isBlock(corpo) ? diretiva(corpo.getStatements()) : undefined
}

export function normalizar(texto: string): string {
  return texto.replace(/\s*(\?\.|\.)\s*/g, '.')
}

export function semExtensao(caminho: string): string {
  return caminho.replace(/\.[cm]?[jt]sx?$/, '')
}

// Etiqueta do passo: o que entra e o que sai, como o compilador infere.
export function tiposDe(no: Node): { entrada?: string; saida?: string } {
  if (Node.isSourceFile(no)) return {}
  if (!Node.isFunctionDeclaration(no) && !Node.isArrowFunction(no) && !Node.isFunctionExpression(no) && !Node.isMethodDeclaration(no)) {
    return { saida: cortar(no.getType().getText(no)) }
  }
  const parametros = no.getParameters().map(p => p.getType().getText(p))
  return { entrada: cortar(parametros.join(', ')), saida: cortar(no.getReturnType().getText(no)) }
}

export function cortar(tipo: string): string {
  return tipo.length > 60 ? tipo.slice(0, 59) + '…' : tipo
}
