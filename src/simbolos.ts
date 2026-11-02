// Os símbolos de um arquivo antes e depois do diff: o que é novo, o que mudou e o que sumiu. Só sintaxe: o arquivo é lido
// por um Project em memória, sem tipos nem imports resolvidos, então custa pouco por arquivo.
import { createHash } from 'node:crypto'
import { Node, Project, SyntaxKind, ts, type ArrowFunction, type ClassDeclaration, type FunctionDeclaration, type FunctionExpression, type SourceFile, type VariableDeclaration } from 'ts-morph'
import type { SimboloAlterado, TipoDeSimbolo } from './contrato.js'
import { EMBRULHO } from './sintaxe.js'

type Funcao = FunctionDeclaration | ArrowFunction | FunctionExpression

interface Declaracao {
  nome: string
  tipo: TipoDeSimbolo
  exportada: boolean
  assinatura: string
  impressao: string                // hash do texto com os espaços colapsados: igual, o símbolo não mudou
  linhas?: number
  complexidade?: number
}

const TAMANHO_DA_ASSINATURA = 400
const RAMIFICACOES = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement, SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement, SyntaxKind.CaseClause, SyntaxKind.CatchClause, SyntaxKind.ConditionalExpression,
])
const OPERADORES_LOGICOS = new Set([SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken])

let projeto: Project | undefined

// Cada lado do diff vira uma lista de símbolos, e a diferença entre as listas é o que o diff fez com eles.
// Arquivo novo não tem "antes" e arquivo removido não tem "depois".
export function simbolosDoArquivo(caminho: string, antes: string | undefined, depois: string | undefined): SimboloAlterado[] {
  const velhas = new Map(declaracoesDe(caminho, antes).map(d => [d.nome, d]))
  const novas = new Map(declaracoesDe(caminho, depois).map(d => [d.nome, d]))
  const mudancas: SimboloAlterado[] = []
  for (const [nome, nova] of novas) {
    const velha = velhas.get(nome)
    if (!velha) mudancas.push(simbolo(caminho, nova, 'novo'))
    else if (velha.impressao !== nova.impressao || velha.exportada !== nova.exportada) mudancas.push(alterado(caminho, velha, nova))
  }
  for (const [nome, velha] of velhas) {
    if (!novas.has(nome)) mudancas.push(simbolo(caminho, velha, 'removido'))
  }
  return mudancas
}

function simbolo(arquivo: string, d: Declaracao, mudanca: SimboloAlterado['mudanca']): SimboloAlterado {
  const resultado: SimboloAlterado = { arquivo, nome: d.nome, tipo: d.tipo, mudanca, exportado: d.exportada, assinatura: d.assinatura }
  // Tamanho e complexidade são do código de agora: de um símbolo removido não há o que cobrar.
  if (mudanca !== 'removido' && d.linhas !== undefined) resultado.linhas = d.linhas
  if (mudanca !== 'removido' && d.complexidade !== undefined) resultado.complexidade = d.complexidade
  return resultado
}

function alterado(arquivo: string, velha: Declaracao, nova: Declaracao): SimboloAlterado {
  const resultado = simbolo(arquivo, nova, 'alterado')
  if (velha.assinatura !== nova.assinatura) resultado.assinaturaAntes = velha.assinatura
  if (velha.exportada !== nova.exportada) resultado.exportadoAntes = velha.exportada
  return resultado
}

function declaracoesDe(caminho: string, texto: string | undefined): Declaracao[] {
  if (texto === undefined) return []
  projeto ??= new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve } })
  const arquivo = projeto.createSourceFile(`/${caminho}`, texto, { overwrite: true })
  try {
    const exportados = nomesExportados(arquivo)
    const comJsx = /\.[jt]sx$/.test(caminho)
    return arquivo.getStatements().flatMap(instrucao => lerInstrucao(instrucao, comJsx))
      .map(d => (exportados.has(d.nome) ? { ...d, exportada: true } : d))
  } finally {
    projeto.removeSourceFile(arquivo)
  }
}

// "export { a, b }" e "export default Nome" exportam o que foi declarado sem a palavra export.
function nomesExportados(arquivo: SourceFile): Set<string> {
  const nomes = new Set<string>()
  for (const declaracao of arquivo.getExportDeclarations()) {
    if (!declaracao.hasModuleSpecifier()) declaracao.getNamedExports().forEach(nomeado => nomes.add(nomeado.getName()))
  }
  for (const atribuicao of arquivo.getExportAssignments()) {
    const expressao = atribuicao.getExpression()
    if (Node.isIdentifier(expressao)) nomes.add(expressao.getText())
  }
  return nomes
}

function lerInstrucao(instrucao: Node, comJsx: boolean): Declaracao[] {
  if (Node.isFunctionDeclaration(instrucao)) {
    // A sobrecarga só declara o tipo; quem tem corpo é a implementação.
    return instrucao.hasBody() ? [daFuncao(instrucao.getName() ?? 'default', instrucao, instrucao, { exportada: instrucao.hasExportKeyword(), comJsx })] : []
  }
  if (Node.isVariableStatement(instrucao)) {
    return instrucao.getDeclarations().filter(d => Node.isIdentifier(d.getNameNode())).map(d => daVariavel(d, instrucao.hasExportKeyword(), comJsx))
  }
  if (Node.isClassDeclaration(instrucao)) return [daClasse(instrucao)]
  if (Node.isInterfaceDeclaration(instrucao) || Node.isTypeAliasDeclaration(instrucao) || Node.isEnumDeclaration(instrucao)) {
    const texto = colapsar(instrucao.getText()).replace(/^(export\s+)?(declare\s+)?/, '')
    return [{ nome: instrucao.getName(), tipo: 'tipo', exportada: instrucao.hasExportKeyword(), assinatura: texto.slice(0, TAMANHO_DA_ASSINATURA), impressao: hash(texto) }]
  }
  const padrao = Node.isExportAssignment(instrucao) ? funcaoDe(instrucao.getExpression()) : undefined
  return padrao ? [daFuncao('default', instrucao, padrao, { exportada: true, comJsx })] : []
}

function daVariavel(declaracao: VariableDeclaration, exportada: boolean, comJsx: boolean): Declaracao {
  const nome = declaracao.getName()
  const funcao = funcaoDe(declaracao.getInitializer())
  if (funcao) return daFuncao(nome, declaracao, funcao, { exportada, comJsx })
  const anotacao = declaracao.getTypeNode()?.getText()
  return { nome, tipo: 'constante', exportada, assinatura: colapsar(anotacao ? `${nome}: ${anotacao}` : nome).slice(0, TAMANHO_DA_ASSINATURA), impressao: hash(colapsar(declaracao.getText())) }
}

function daClasse(classe: ClassDeclaration): Declaracao {
  const nome = classe.getName() ?? 'default'
  const heranca = classe.getExtends() ? ` extends ${classe.getExtends()!.getText()}` : ''
  const contratos = classe.getImplements().length > 0 ? ` implements ${classe.getImplements().map(c => c.getText()).join(', ')}` : ''
  return { nome, tipo: 'classe', exportada: classe.hasExportKeyword(), assinatura: colapsar(`class ${nome}${heranca}${contratos}`).slice(0, TAMANHO_DA_ASSINATURA), impressao: hash(colapsar(classe.getText())) }
}

// memo, forwardRef e useCallback embrulham a função, mas o símbolo continua sendo ela.
function funcaoDe(valor: Node | undefined): Funcao | undefined {
  if (!valor) return undefined
  if (Node.isArrowFunction(valor) || Node.isFunctionExpression(valor)) return valor
  return Node.isCallExpression(valor) && EMBRULHO.test(valor.getExpression().getText()) ? funcaoDe(valor.getArguments()[0]) : undefined
}

// Componente é a função de nome maiúsculo num arquivo com JSX; "texto" é o nó cujo texto decide se o símbolo mudou.
function daFuncao(nome: string, texto: Node, funcao: Funcao, { exportada, comJsx }: { exportada: boolean; comJsx: boolean }): Declaracao {
  const genericos = funcao.getTypeParameters().map(t => t.getText())
  const retorno = funcao.getReturnTypeNode()?.getText()
  const assinatura = `${nome}${genericos.length > 0 ? `<${genericos.join(', ')}>` : ''}(${funcao.getParameters().map(p => p.getText()).join(', ')})${retorno ? `: ${retorno}` : ''}`
  return {
    nome, tipo: comJsx && /^[A-Z]/.test(nome) ? 'componente' : 'funcao', exportada,
    assinatura: colapsar(assinatura).slice(0, TAMANHO_DA_ASSINATURA), impressao: hash(colapsar(texto.getText())),
    linhas: funcao.getEndLineNumber() - funcao.getStartLineNumber() + 1, complexidade: complexidadeDe(funcao),
  }
}

// A contagem de McCabe: 1 mais cada desvio (if, laço, case, catch, ternário e os operadores &&, || e ??), as funções de dentro inclusive.
function complexidadeDe(funcao: Funcao): number {
  let total = 1
  funcao.forEachDescendant(no => {
    if (RAMIFICACOES.has(no.getKind()) || (Node.isBinaryExpression(no) && OPERADORES_LOGICOS.has(no.getOperatorToken().getKind()))) total++
  })
  return total
}

function colapsar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function hash(texto: string): string {
  return createHash('sha1').update(texto).digest('hex').slice(0, 12)
}
