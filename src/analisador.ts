// Analisador: com o compilador do TypeScript (ts-morph), acha a unidade de cada trecho,
// quem ela chama, quem a chama e por que o dado nasce ou termina nela. Nada aqui usa IA.
import path from 'node:path'
import { Node, Project, SyntaxKind, type CallExpression, type Identifier, type SourceFile } from 'ts-morph'
import {
  ARQUIVO_DE_TESTE, CHAMADAS_QUE_NASCEM, CHAMADAS_QUE_TERMINAM, CHAMADA_DE_SQL, INTERCEPTADOR, LEITURAS_QUE_NASCEM,
  METODO_HTTP, PAGINA_DO_APP, PAGINA_DO_PAGES, ROTA_DO_APP, ROTA_DO_PAGES, metodoDaChamada, padraoDaRota, pesoDaRota, regraDaConfig, tipoDoSql,
} from './catalogo.js'
import {
  EMBRULHO, atributoDeEvento, caminhoDaUrl, carregadoPorHtml, chamadaQueRecebe, cortar, declaracaoDe, declaracoesDoModulo, diretiva, diretivaDaFuncao,
  ehFuncao, ehRedirecionamento, emPosicaoDeTipo, ehSetterDeEstado, lerEntradasDoPacote, propDoComponente, nomeDe, normalizar, semExtensao, usaRetorno,
} from './sintaxe.js'

export const ARQUIVO_DE_CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs)$/

export type Fronteira = 'http' | 'cliente-servidor'
// usaRetorno: quem chama usa o valor devolvido, como em "const total = await contar()".
// dinamico: o compilador não prova a chamada (callback em prop, função num objeto): o mapa a desenha tracejada.
// usoDeTipo: a referência está numa anotação (`x as PgError`, `useState<Registro[]>`), não é chamada nem instanciação.
export interface Ligacao { unidade: Unidade; linha: number; fronteira?: Fronteira; usaRetorno?: boolean; dinamico?: boolean; usoDeTipo?: boolean }

// Unidade é a menor declaração que recebe um trecho: função, arrow em const, método ou declaração de módulo.
export interface Unidade {
  chave: string
  no: Node
  nome?: Identifier
  simbolo: string
  arquivo: string
  linhas: [number, number]
  fontes: Set<string>
  saidas: Set<string>
  avisos: string[]
  chamadas: Ligacao[]
  chamadores?: Ligacao[]   // só calculado quando a busca anda para trás: findReferences é caro
  preparada: boolean
}

export interface Config { nasce?: string[]; termina?: string[] }

export class Analisador {
  private unidades = new Map<Node, Unidade>()
  private exportsPorArquivo = new Map<SourceFile, ReturnType<SourceFile['getExportedDeclarations']>>()
  private rotas?: { padrao: RegExp; arquivo: SourceFile; app: boolean; dinamicos: number }[]
  private entradasDoPacote: Set<string>
  private regrasDaConfig: [RegExp, string][]

  constructor(private raiz: string, config: Config, private projeto: Project) {
    this.entradasDoPacote = lerEntradasDoPacote(raiz)
    this.regrasDaConfig = [
      ...(config.nasce ?? []).map(padrao => regraDaConfig(padrao, 'config')),
      ...(config.termina ?? []).map(padrao => regraDaConfig(padrao, 'config-saida')),
    ]
  }

  arquivo(caminho: string): SourceFile | undefined {
    const absoluto = path.join(this.raiz, caminho)
    return this.projeto.getSourceFile(absoluto) ?? this.projeto.addSourceFileAtPathIfExists(absoluto)
  }

  ehEntrada(caminho: string): boolean {
    return [ROTA_DO_APP, ROTA_DO_PAGES, PAGINA_DO_APP, PAGINA_DO_PAGES, INTERCEPTADOR].some(r => r.test(caminho))
      || this.entradasDoPacote.has(semExtensao(caminho)) || carregadoPorHtml(this.raiz, caminho)
  }

  ninguemImporta(caminho: string): boolean {
    return (this.arquivo(caminho)?.getReferencingSourceFiles().length ?? 0) === 0
  }

  // Trecho dentro de uma função: a menor que o contém.
  // Fora de qualquer função: a declaração de módulo (const, tipo, classe). Imports não têm unidade.
  unidadesDoTrecho(caminho: string, [inicio, fim]: [number, number]): Unidade[] {
    const arquivo = this.arquivo(caminho)
    if (!arquivo) return []
    const sobrepostas: Node[] = []
    arquivo.forEachDescendant((no, travessia) => {
      // Sem "return travessia.skip()": o ts-morph encerra a varredura inteira quando o callback devolve valor.
      if (no.getEndLineNumber() < inicio || no.getStartLineNumber() > fim) travessia.skip()
      else if (ehFuncao(no)) sobrepostas.push(no)
    })
    const contem = sobrepostas.filter(no => no.getStartLineNumber() <= inicio && no.getEndLineNumber() >= fim)
    // As funções de dentro da menor também entram quando o trecho as toca: um arquivo novo inteiro, por exemplo.
    const menor = contem.at(-1)
    if (menor) return sobrepostas.filter(no => no === menor || menor.containsRange(no.getPos(), no.getEnd())).map(no => this.unidade(no))
    // Trecho que cobre várias funções, como um arquivo novo: todas entram, as de dentro inclusive.
    if (sobrepostas.length > 0) return sobrepostas.map(no => this.unidade(no))
    const instrucoes = arquivo.getStatements().filter(no => no.getEndLineNumber() >= inicio && no.getStartLineNumber() <= fim)
    const declaracoes = instrucoes.flatMap(declaracoesDoModulo)
    if (declaracoes.length > 0) return declaracoes.map(no => this.unidade(no))
    // Código solto no módulo, como o corpo de um script, vira a unidade "(módulo)". Import não conta.
    return instrucoes.some(no => !Node.isImportDeclaration(no)) ? [this.unidade(arquivo)] : []
  }

  preparar(u: Unidade): Unidade {
    if (u.preparada) return u
    u.preparada = true
    this.lerPapelDoArquivo(u)
    u.no.forEachDescendant((no, travessia) => {
      if (ehFuncao(no)) travessia.skip()
      else if (Node.isCallExpression(no)) this.lerChamada(u, no)
      else if (Node.isJsxOpeningElement(no) || Node.isJsxSelfClosingElement(no)) this.lerJsx(u, no.getTagNameNode())
      else if (Node.isJsxFragment(no)) u.saidas.add('tela')
      else if (Node.isJsxAttribute(no)) this.lerEventoEmLinha(u, no)
      else if (Node.isPropertyAccessExpression(no)) marcar(u.fontes, LEITURAS_QUE_NASCEM, normalizar(no.getText()))
      else if (Node.isNewExpression(no)) this.lerNew(u, no.getExpression().getText())
      else if (Node.isPropertyAssignment(no) && ehRedirecionamento(no)) u.saidas.add('navegacao')
    })
    if (/^get(ServerSide|Static)Props$/.test(u.simbolo) && PAGINA_DO_PAGES.test(u.arquivo)) this.ligarPropsDaPagina(u, u.no.getSourceFile())
    // No arquivo da rota, o helper que monta a Response só a devolve; quem responde é o handler exportado.
    if ((ROTA_DO_APP.test(u.arquivo) || ROTA_DO_PAGES.test(u.arquivo)) && !u.fontes.has('rota')) u.saidas.delete('resposta-http')
    return u
  }

  chamadoresDe(u: Unidade): Ligacao[] {
    if (u.chamadores) return u.chamadores
    u.chamadores = []
    for (const referencia of u.nome?.findReferencesAsNodes() ?? []) {
      // Import e export só repassam o nome; quem chama de verdade está em outro lugar.
      const repasse = referencia.getFirstAncestor(pai => Node.isImportDeclaration(pai) || Node.isExportDeclaration(pai))
      const deTeste = ARQUIVO_DE_TESTE.test(path.relative(this.raiz, referencia.getSourceFile().getFilePath()))
      if (referencia === u.nome || repasse || deTeste || this.ligarAliasDaPagina(u, referencia)) continue
      const atributo = atributoDeEvento(referencia)
      if (atributo) {
        this.ligarCallbackPeloPai(u, atributo)
        continue
      }
      const chamador = this.unidadeQueContem(referencia)
      if (chamador !== u) u.chamadores.push({ unidade: chamador, linha: referencia.getStartLineNumber(), usoDeTipo: emPosicaoDeTipo(referencia) })
    }
    const recebedora = chamadaQueRecebe(u.no)
    if (recebedora) u.chamadores.push({ unidade: this.unidadeQueContem(recebedora), linha: recebedora.getStartLineNumber(), dinamico: true })
    return u.chamadores
  }

  // Lado da fronteira dos Server Components: o dado que cruza de um lado para o outro é serializado.
  ladoDe(u: Unidade): 'cliente' | 'servidor' | undefined {
    const diretivaDoArquivo = diretiva(u.no.getSourceFile().getStatements())
    if (diretivaDoArquivo === 'use client') return 'cliente'
    if (diretivaDoArquivo === 'use server' || diretivaDaFuncao(u.no) === 'use server') return 'servidor'
    if (PAGINA_DO_APP.test(u.arquivo) || ROTA_DO_APP.test(u.arquivo)) return 'servidor'
    return undefined
  }

  private unidade(no: Node): Unidade {
    const existente = this.unidades.get(no)
    if (existente) return existente
    const nome = nomeDe(no)
    const simbolo = Node.isSourceFile(no) ? '(módulo)' : nome?.getText() ?? 'default'
    const arquivo = path.relative(this.raiz, no.getSourceFile().getFilePath())
    const nova: Unidade = {
      chave: `${arquivo}:${no.getStartLineNumber()}#${simbolo}`,
      no, nome: Node.isIdentifier(nome) ? nome : undefined, simbolo, arquivo,
      linhas: [no.getStartLineNumber(), no.getEndLineNumber()],
      fontes: new Set(), saidas: new Set(), avisos: [], chamadas: [], preparada: false,
    }
    this.unidades.set(no, nova)
    return nova
  }

  private unidadeQueContem(no: Node): Unidade {
    const funcao = no.getFirstAncestor(ehFuncao)
    if (funcao) return this.unidade(funcao)
    // Tipo usado dentro de outro tipo liga pela declaração, e const exportada também: outro arquivo a importa.
    // Const solta de script fica com o "(módulo)", que é quem roda.
    const instrucao = no.getFirstAncestor(pai => Node.isSourceFile(pai.getParent()))
    let declaracao = instrucao && !Node.isVariableStatement(instrucao) ? declaracoesDoModulo(instrucao)[0] : undefined
    if (Node.isVariableStatement(instrucao) && instrucao.isExported()) declaracao = no.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
    return this.unidade(declaracao ?? no.getSourceFile())
  }

  private unidadeDaDeclaracao(declaracao: Node | undefined): Unidade | undefined {
    if (!declaracao || declaracao.getSourceFile().isDeclarationFile() || declaracao.getSourceFile().isInNodeModules()) return undefined
    if (ehFuncao(declaracao)) return this.unidade(declaracao)
    if (Node.isExportAssignment(declaracao)) {
      const expressao = declaracao.getExpression()
      return ehFuncao(expressao) ? this.unidade(expressao) : this.unidadeDaDeclaracao(declaracaoDe(expressao))
    }
    if (!Node.isVariableDeclaration(declaracao) && !Node.isPropertyAssignment(declaracao)) return undefined
    let inicial: Node | undefined = declaracao.getInitializer()
    if (Node.isCallExpression(inicial) && EMBRULHO.test(inicial.getExpression().getText())) inicial = inicial.getArguments()[0]
    return inicial && ehFuncao(inicial) ? this.unidade(inicial) : undefined
  }

  private nomeExportado(u: Unidade): string | undefined {
    const pai = Node.isCallExpression(u.no.getParent()) ? u.no.getParent()?.getParent() : u.no.getParent()
    if (Node.isExportAssignment(pai)) return 'default'
    const declaracao = Node.isVariableDeclaration(pai) ? pai : u.no
    const arquivo = u.no.getSourceFile()
    if (!this.exportsPorArquivo.has(arquivo)) this.exportsPorArquivo.set(arquivo, arquivo.getExportedDeclarations())
    for (const [nome, declaracoes] of this.exportsPorArquivo.get(arquivo)!) {
      if ((declaracoes as Node[]).includes(declaracao)) return nome
    }
    return undefined
  }

  private lerPapelDoArquivo(u: Unidade) {
    const exportado = this.nomeExportado(u)
    const diretivaDoArquivo = diretiva(u.no.getSourceFile().getStatements())
    if (exportado && METODO_HTTP.test(exportado) && ROTA_DO_APP.test(u.arquivo)) adicionar(u, 'rota', 'resposta-http')
    else if (exportado === 'default' && ROTA_DO_PAGES.test(u.arquivo)) adicionar(u, 'rota', 'resposta-http')
    else if (exportado && INTERCEPTADOR.test(u.arquivo)) u.fontes.add('requisicao')
    else if ((exportado && diretivaDoArquivo === 'use server') || diretivaDaFuncao(u.no) === 'use server') adicionar(u, 'acao', 'resposta-http')
    else if (exportado === 'default' && PAGINA_DO_APP.test(u.arquivo)) u.fontes.add('pagina')
    else if (exportado && PAGINA_DO_PAGES.test(u.arquivo) && /^(default|get(ServerSide|Static)Props)$/.test(exportado)) u.fontes.add('pagina')
    if (exportado && this.entradasDoPacote.has(semExtensao(u.arquivo))) adicionar(u, 'pacote', 'pacote')
    if (Node.isSourceFile(u.no) && this.entradasDoPacote.has(semExtensao(u.arquivo))) u.fontes.add('pacote')
    // O corpo do script que o index.html carrega é onde a página começa.
    if (Node.isSourceFile(u.no) && carregadoPorHtml(this.raiz, u.arquivo)) u.fontes.add('pagina')
  }

  private lerChamada(u: Unidade, chamada: CallExpression) {
    const alvo = chamada.getExpression()
    const texto = normalizar(alvo.getText())
    this.lerUrl(u, chamada, texto)
    if (texto === 'fetch') return
    if (ehSetterDeEstado(alvo)) u.saidas.add('estado-local')
    const sql = chamada.getArguments()[0]
    if (CHAMADA_DE_SQL.test(texto) && sql) {
      const tipo = tipoDoSql(sql.getText())
      if (tipo === 'banco-escrita') u.saidas.add(tipo)
      else u.fontes.add(tipo)
      if (!Node.isStringLiteral(sql) && !Node.isNoSubstitutionTemplateLiteral(sql) && !Node.isTemplateExpression(sql)) u.avisos.push(`SQL fora da chamada (${cortar(sql.getText())}): o motor supõe leitura`)
    }
    marcar(u.fontes, CHAMADAS_QUE_NASCEM, texto)
    marcar(u.saidas, CHAMADAS_QUE_TERMINAM, texto)
    for (const [padrao, tipo] of this.regrasDaConfig) {
      if (padrao.test(texto)) (tipo === 'config' ? u.fontes : u.saidas).add('config')
    }
    const destino = this.unidadeDaDeclaracao(declaracaoDe(alvo))
    if (destino && destino !== u) u.chamadas.push({ unidade: destino, linha: chamada.getStartLineNumber(), usaRetorno: usaRetorno(chamada) })
    if (!destino) this.ligarCallbackPeloFilho(u, alvo, chamada.getStartLineNumber())
  }

  // fetch('/api/x'), api.fetch('/api/x') ou axios.post('/api/x') para uma rota do próprio projeto:
  // o fluxo atravessa a rede em vez de parar na chamada. Um wrapper só entra quando a URL casa com uma rota.
  private lerUrl(u: Unidade, chamada: CallExpression, texto: string) {
    const [url, opcoes] = chamada.getArguments()
    const caminho = url ? caminhoDaUrl(url) : undefined
    const metodo = metodoDaChamada(texto, opcoes?.getText())
    const destino = caminho ? this.rotaDaUrl(caminho.url, metodo) : undefined
    if (texto !== 'fetch' && !destino) return
    if (metodo === 'GET') u.fontes.add('rede')
    if (destino) {
      u.chamadas.push({ unidade: destino, linha: chamada.getStartLineNumber(), fronteira: 'http', usaRetorno: true })
      if (caminho?.montada) u.avisos.push(`URL montada (${url!.getText()}): ligada a ${metodo} ${destino.arquivo} pelo formato, confira`)
      return
    }
    if (Node.isTemplateExpression(url)) u.avisos.push(`URL montada (${url.getText()}): o motor não liga o fetch com a rota`)
    if (metodo !== 'GET') u.saidas.add('rede-escrita')
  }

  private rotaDaUrl(url: string, metodo: string): Unidade | undefined {
    this.rotas ??= this.projeto.getSourceFiles().flatMap(arquivo => {
      const relativo = path.relative(this.raiz, arquivo.getFilePath())
      const rota = ROTA_DO_APP.exec(relativo) ?? ROTA_DO_PAGES.exec(relativo)
      return rota ? [{ padrao: padraoDaRota('/' + rota[1]), arquivo, app: ROTA_DO_APP.test(relativo), dinamicos: pesoDaRota(rota[1]!) }] : []
    })
    this.rotas.sort((a, b) => a.dinamicos - b.dinamicos)
    const caminho = url.split(/[?#]/)[0]!
    const rota = this.rotas.find(r => r.padrao.test(caminho))
    const declaracao = rota?.arquivo.getExportedDeclarations().get(rota.app ? metodo : 'default')?.[0]
    return this.unidadeDaDeclaracao(declaracao)
  }

  private lerJsx(u: Unidade, tag: Node) {
    u.saidas.add('tela')
    if (!/^[A-Z]/.test(tag.getText())) return
    const componente = this.unidadeDaDeclaracao(declaracaoDe(tag))
    if (componente && componente !== u) u.chamadas.push({ unidade: componente, linha: tag.getStartLineNumber() })
  }

  // onClick={() => ...} num elemento do DOM: o dado nasce num evento do usuário.
  private lerEventoEmLinha(u: Unidade, atributo: Node) {
    if (!Node.isJsxAttribute(atributo) || !/^on[A-Z]/.test(atributo.getNameNode().getText())) return
    const elemento = atributo.getParent()?.getParent()
    const tag = Node.isJsxOpeningElement(elemento) || Node.isJsxSelfClosingElement(elemento) ? elemento.getTagNameNode().getText() : ''
    if (/^[a-z]/.test(tag)) u.fontes.add('evento')
  }

  private lerNew(u: Unidade, classe: string) {
    if (classe === 'Response' || classe === 'NextResponse') u.saidas.add('resposta-http')
    if (classe === 'FormData') u.fontes.add('formulario')
  }

  // onSalvar={salvar} num componente: quem chama onSalvar() lá dentro chama salvar.
  private ligarCallbackPeloPai(u: Unidade, atributo: Node) {
    if (!Node.isJsxAttribute(atributo)) return
    const elemento = atributo.getParent()?.getParent()
    if (!Node.isJsxOpeningElement(elemento) && !Node.isJsxSelfClosingElement(elemento)) return
    const tag = elemento.getTagNameNode()
    if (/^[a-z]/.test(tag.getText())) {
      u.fontes.add('evento')
      return
    }
    const filho = this.unidadeDaDeclaracao(declaracaoDe(tag))
    const prop = atributo.getNameNode().getText()
    filho?.no.forEachDescendant(no => {
      if (!Node.isCallExpression(no)) return
      const origem = propDoComponente(no.getExpression())
      if (origem?.prop !== prop || origem.componente !== filho.no) return
      const chamador = this.unidadeQueContem(no)
      u.chamadores!.push({ unidade: chamador, linha: no.getStartLineNumber(), dinamico: true })
    })
  }

  // O caminho inverso: onSalvar() dentro do filho chama o que o pai passou na prop.
  private ligarCallbackPeloFilho(u: Unidade, alvo: Node, linha: number) {
    const origem = propDoComponente(alvo)
    const componente = origem && ehFuncao(origem.componente) ? this.unidade(origem.componente) : undefined
    if (!origem || !componente?.nome) return
    for (const referencia of componente.nome.findReferencesAsNodes()) {
      const elemento = referencia.getParent()
      if (!Node.isJsxOpeningElement(elemento) && !Node.isJsxSelfClosingElement(elemento)) continue
      const atributo = elemento.getAttribute(origem.prop)
      const valor = Node.isJsxAttribute(atributo) ? atributo.getInitializer() : undefined
      const expressao = Node.isJsxExpression(valor) ? valor.getExpression() : undefined
      if (!expressao) continue
      const chamadas = Node.isArrowFunction(expressao) || Node.isFunctionExpression(expressao)
        ? expressao.getDescendantsOfKind(SyntaxKind.CallExpression).map(c => c.getExpression())
        : [expressao]
      for (const chamada of chamadas) {
        const destino = this.unidadeDaDeclaracao(declaracaoDe(chamada))
        if (destino) u.chamadas.push({ unidade: destino, linha, dinamico: true })
      }
    }
  }

  // No Pages Router, o retorno de getServerSideProps vira as props do componente da página, como JSON.
  private ligarPropsDaPagina(u: Unidade, pagina: SourceFile) {
    const componente = this.unidadeDaDeclaracao(pagina.getExportedDeclarations().get('default')?.[0])
    if (componente) u.chamadas.push({ unidade: componente, linha: u.linhas[1], fronteira: 'cliente-servidor' })
  }

  // export const getServerSideProps = getCoursePageProps: a função de outro arquivo vira a entrada da página.
  private ligarAliasDaPagina(u: Unidade, referencia: Node): boolean {
    const declaracao = referencia.getParent()
    if (!Node.isVariableDeclaration(declaracao) || declaracao.getInitializer() !== referencia) return false
    const pagina = referencia.getSourceFile()
    if (!/^get(ServerSide|Static)Props$/.test(declaracao.getName()) || !PAGINA_DO_PAGES.test(path.relative(this.raiz, pagina.getFilePath()))) return false
    u.fontes.add('pagina')
    this.ligarPropsDaPagina(u, pagina)
    return true
  }
}

function adicionar(u: Unidade, fonte: string, saida: string) {
  u.fontes.add(fonte)
  u.saidas.add(saida)
}

function marcar(destino: Set<string>, regras: [RegExp, string][], texto: string) {
  for (const [padrao, tipo] of regras) if (padrao.test(texto)) destino.add(tipo)
}
