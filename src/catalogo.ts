// Catálogo de onde o dado nasce e onde termina (tabela do Roteiro 1).
// Cada regra testa o texto da chamada já normalizado: "prisma.conta.findMany", "res.status(200).json".
type Regra = [padrao: RegExp, tipo: string]

const CLIENTE_DO_BANCO = String.raw`(^|\.)(prisma|db|tx)\.\w+\.`
// Drizzle chama db.select() e db.insert() direto no cliente, sem o nome da tabela no meio.
const DRIZZLE = String.raw`^(db|tx|trx)\.`
const SUPABASE = String.raw`^\w*supabase\w*\.from\(.*\)\.`
// Model.find() do Mongoose; Object.create() e companhia não são banco.
const MODELO = String.raw`^(?!(Object|Array|Promise|Math|JSON|Date|Reflect|Number|String|Symbol|Map|Set|Intl|Buffer|URL|React)\.)[A-Z]\w*\.`

export const CHAMADAS_QUE_NASCEM: Regra[] = [
  [/^(useParams|useSearchParams|useLocation|usePathname)$/, 'url'],
  [/^(useQuery|useSuspenseQuery|useSWR|axios|axios\.(get|request)|ky\.get)$/, 'rede'],
  [new RegExp(CLIENTE_DO_BANCO + '(findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|count|aggregate|groupBy)$'), 'banco-leitura'],
  [new RegExp(DRIZZLE + String.raw`(select|selectDistinct|query\.\w+\.(findMany|findFirst))$`), 'banco-leitura'],
  [new RegExp(SUPABASE + 'select$'), 'banco-leitura'],
  [new RegExp(MODELO + '(find|findOne|findById|countDocuments|exists|distinct)$'), 'banco-leitura'],
  [/^((local|session)Storage\.getItem|cookies|headers)$/, 'armazenamento'],
  [/^(useContext|useSelector|use\w+Store)$/, 'estado-global'],
  [/^(fs\.(promises\.)?)?(readFile|readFileSync|readdir|readdirSync)$/, 'arquivo'],
  [/^(child_process\.)?(exec|execSync|execFile|execFileSync|spawn|spawnSync)$/, 'processo'],
]

export const CHAMADAS_QUE_TERMINAM: Regra[] = [
  [new RegExp(CLIENTE_DO_BANCO + '(create|createMany|update|updateMany|upsert|delete|deleteMany)$'), 'banco-escrita'],
  [new RegExp(DRIZZLE + '(insert|update|delete)$'), 'banco-escrita'],
  [new RegExp(SUPABASE + '(insert|update|upsert|delete)$'), 'banco-escrita'],
  [new RegExp(MODELO + '(create|insertMany|updateOne|updateMany|replaceOne|findByIdAndUpdate|findOneAndUpdate|findByIdAndDelete|findOneAndDelete|deleteOne|deleteMany|bulkWrite)$'), 'banco-escrita'],
  [/^(axios\.(post|put|patch|delete)|ky\.(post|put|patch|delete)|useMutation)$/, 'rede-escrita'],
  [/^(NextResponse\.(json|redirect|rewrite)|Response\.(json|redirect)|res\.(\w+\(.*\)\.)?(json|send|end|redirect))$/, 'resposta-http'],
  [/^(router\.(push|replace)|redirect|permanentRedirect|navigate|notFound)$/, 'navegacao'],
  [/^((local|session)Storage\.(setItem|removeItem)|.*cookies\(\)\)?\.(set|delete))$/, 'armazenamento'],
  [/^(fs\.(promises\.)?)?(writeFile|writeFileSync|appendFile|appendFileSync)$/, 'arquivo'],
  [/^navigator\.clipboard\.(writeText|write)$/, 'area-de-transferencia'],
  [/^console\.\w+$/, 'log'],
]

// pool.query('INSERT ...'): o cliente é o mesmo para ler e escrever; quem decide é o verbo do SQL.
export const CHAMADA_DE_SQL = /^(pool|client|db|conn|connection|pg|sql|knex|database|tx|trx)\.(query|execute|raw)$/
const SQL_QUE_ESCREVE = /^\W*(insert|update|delete|upsert|merge|replace|create|drop|alter|truncate)\b/i

export function tipoDoSql(sql: string): 'banco-leitura' | 'banco-escrita' {
  return SQL_QUE_ESCREVE.test(sql) ? 'banco-escrita' : 'banco-leitura'
}

// Teste não é fluxo do produto: fica à parte na revisão, e quem só é chamado por teste não ganha fonte nele.
export const ARQUIVO_DE_TESTE = /(^|\/)(__tests__|__mocks__|tests?|e2e|cypress|playwright)\/|\.(test|spec)\.[cm]?[jt]sx?$/

// fetch('/api/x', { method: 'PUT' }) ou axios.put('/api/x'): sem método escrito, é GET.
export function metodoDaChamada(texto: string, opcoes?: string): string {
  const escrito = opcoes?.match(/\bmethod\s*:\s*['"`](\w+)['"`]/)?.[1]
  const doNome = texto.match(/\.(get|post|put|patch|delete)$/i)?.[1]
  return (escrito ?? doNome ?? 'GET').toUpperCase()
}

export const LEITURAS_QUE_NASCEM: Regra[] = [
  [/^(process\.env|import\.meta\.env)$/, 'ambiente'],
  [/^process\.argv$/, 'entrada'],
  [/^(router|useRouter\(\))\.query$/, 'url'],
]

// Risco do fluxo pela saída: escrever no banco ou responder HTTP pesa mais que mostrar na tela.
// A escrita no banco vale mais que a resposta HTTP para o fluxo de uma rota seguir até o banco.
const RISCO_DA_SAIDA: Record<string, number> = {
  'banco-escrita': 4, 'resposta-http': 3, 'rede-escrita': 3, arquivo: 3,
  navegacao: 2, armazenamento: 2, pacote: 2, config: 2,
}

export function riscoDasSaidas(saidas: Iterable<string>): number {
  let maior = 1
  for (const saida of saidas) maior = Math.max(maior, RISCO_DA_SAIDA[saida] ?? 1)
  return maior
}

// O nome da saída que decide o risco do fluxo ("banco-escrita"): a tela diz por que o risco é alto.
export function saidaPrincipal(saidas: Iterable<string>): string | undefined {
  let maior: string | undefined
  for (const saida of saidas) {
    if (maior === undefined || (RISCO_DA_SAIDA[saida] ?? 1) > (RISCO_DA_SAIDA[maior] ?? 1)) maior = saida
  }
  return maior
}

export const ROTA_DO_APP = /(?:^|\/)app\/(.*?)\/?route\.[jt]s$/
export const ROTA_DO_PAGES = /(?:^|\/)pages\/(api(?:\/.*?)?)(?:\/index)?\.[jt]sx?$/
export const PAGINA_DO_APP = /(^|\/)app\/(.+\/)?(page|layout)\.[jt]sx?$/
export const PAGINA_DO_PAGES = /(^|\/)pages\/(?!api\/|_app\.|_document\.)/
export const INTERCEPTADOR = /(^|\/)(proxy|middleware)\.[jt]s$/
export const METODO_HTTP = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/

// "/api/transacoes/[id]" vira um padrão que casa com a URL literal de um fetch.
export function padraoDaRota(rota: string): RegExp {
  let padrao = ''
  for (const parte of rota.split('/')) {
    if (parte === '' || /^\(.*\)$/.test(parte)) continue
    padrao += trechoDoPadrao(parte)
  }
  return new RegExp(`^${padrao}/?$`)
}

// Como no Next: rota fixa ganha da dinâmica, que ganha da catch-all.
export function pesoDaRota(rota: string): number {
  return (rota.match(/\[\[?\.\.\./g)?.length ?? 0) * 100 + (rota.match(/\[/g)?.length ?? 0)
}

function trechoDoPadrao(parte: string): string {
  if (parte.startsWith('[[...')) return '(/.+)?'
  if (parte.startsWith('[...')) return '/.+'
  if (parte.startsWith('[')) return '/[^/]+'
  return '/' + parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Padrão do keg.config.json: "api.*" casa com "api.get" e "api.post".
export function regraDaConfig(padrao: string, tipo: string): Regra {
  const escapado = padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\w$.]*')
  return [new RegExp(`^${escapado}$`), tipo]
}
