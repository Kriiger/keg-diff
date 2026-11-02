// Catálogo de onde o dado nasce e onde termina (tabela do Roteiro 1).
// Cada regra testa o texto da chamada já normalizado: "prisma.conta.findMany", "res.status(200).json".
type Regra = [padrao: RegExp, tipo: string]

const CLIENTE_DO_BANCO = String.raw`(^|\.)(prisma|db|tx)\.\w+\.`

export const CHAMADAS_QUE_NASCEM: Regra[] = [
  [/^(useParams|useSearchParams|useLocation|usePathname)$/, 'url'],
  [/^(useQuery|useSuspenseQuery|useSWR|axios|axios\.(get|request)|ky\.get)$/, 'rede'],
  [new RegExp(CLIENTE_DO_BANCO + '(findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|count|aggregate|groupBy)$'), 'banco-leitura'],
  [/^((local|session)Storage\.getItem|cookies|headers)$/, 'armazenamento'],
  [/^(useContext|useSelector|use\w+Store)$/, 'estado-global'],
  [/^(fs\.(promises\.)?)?(readFile|readFileSync|readdir|readdirSync)$/, 'arquivo'],
  [/^(child_process\.)?(exec|execSync|execFile|execFileSync|spawn|spawnSync)$/, 'processo'],
]

export const CHAMADAS_QUE_TERMINAM: Regra[] = [
  [new RegExp(CLIENTE_DO_BANCO + '(create|createMany|update|updateMany|upsert|delete|deleteMany)$'), 'banco-escrita'],
  [/^(axios\.(post|put|patch|delete)|ky\.(post|put|patch|delete)|useMutation)$/, 'rede-escrita'],
  [/^(NextResponse\.(json|redirect|rewrite)|Response\.(json|redirect)|res\.(\w+\(.*\)\.)?(json|send|end|redirect))$/, 'resposta-http'],
  [/^(router\.(push|replace)|redirect|permanentRedirect|navigate|notFound)$/, 'navegacao'],
  [/^((local|session)Storage\.(setItem|removeItem)|.*cookies\(\)\)?\.(set|delete))$/, 'armazenamento'],
  [/^(fs\.(promises\.)?)?(writeFile|writeFileSync|appendFile|appendFileSync)$/, 'arquivo'],
  [/^console\.\w+$/, 'log'],
]

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
