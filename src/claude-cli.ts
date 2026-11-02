// Adaptador claude-cli: roda o Claude Code instalado na máquina com o login da assinatura.
// Nunca chama a API com chave, nunca lê nem repassa o token e nunca usa shell.
import { execFile, type ExecFileException } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PROMPT_DO_NARRADOR = path.join(import.meta.dirname, 'narrador.md')
const CINCO_MINUTOS = 5 * 60 * 1000
// No -p, uma chave no ambiente vence a assinatura e vira cobrança de API: o filho nasce sem elas.
const VARIAVEIS_DE_COBRANCA = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']
const LOGINS_DA_ASSINATURA = ['claude.ai', 'oauth_token']

export interface Resposta {
  texto: string
  erro: boolean                    // is_error: limite de uso atingido, por exemplo
}

// Devolve o motivo de não poder narrar (sem motivo, o login da assinatura está em ordem) e o método de login
// que o claude declarou, que o historico.jsonl guarda para provar que nenhuma chamada usou chave de API.
export async function verificarLogin(): Promise<{ motivo?: string; metodo?: string }> {
  const { saida, falha } = await executar(['auth', 'status', '--json'])
  if (falha === 'ENOENT') return { motivo: 'o comando claude não está instalado, ou não está no PATH' }
  const status = lerJson(saida)
  if (!status) return { motivo: 'não entendi a resposta de claude auth status' }
  const metodo = String(status.authMethod)
  if (metodo === 'none' || status.loggedIn === false) return { metodo, motivo: 'sem login: rode claude e entre com a sua conta' }
  if (!LOGINS_DA_ASSINATURA.includes(metodo)) return { metodo, motivo: `o login por ${metodo} cobraria a API; o keg só narra com o login da assinatura` }
  // Uma chave que o filho ainda enxerga (apiKeyHelper, por exemplo) venceria a assinatura no -p.
  const chave = status.apiKeySource
  if (typeof chave === 'string' && chave !== 'none') return { metodo, motivo: `uma chave de API (${chave}) vale mais que a assinatura; o keg só narra com o login da assinatura` }
  return { metodo }
}

export async function chamarClaude(modelo: string, prompt: string): Promise<Resposta> {
  const args = [
    '-p', '--safe-mode', '--tools', '', '--model', modelo,
    '--system-prompt-file', PROMPT_DO_NARRADOR, '--output-format', 'json', '--no-session-persistence',
  ]
  const { saida, falha } = await executar(args, prompt)
  const resposta = lerJson(saida)
  if (!resposta) throw new Error(falha === 'ENOENT' ? 'o comando claude não está instalado' : `o claude não devolveu JSON (${falha ?? 'sem saída'})`)
  const erro = resposta.is_error === true
  return { texto: String(resposta.result ?? (erro ? resposta.subtype : '')), erro }
}

// Pasta temporária vazia: nenhum .claude/settings.json de projeto entra no caminho, e um env ou
// apiKeyHelper ali trocaria o login. O stdout vale mesmo com saída diferente de zero: o is_error vem nele.
async function executar(args: string[], entrada?: string): Promise<{ saida: string; falha?: string }> {
  const pasta = await mkdtemp(path.join(tmpdir(), 'keg-narrador-'))
  const env = { ...process.env }
  for (const nome of VARIAVEIS_DE_COBRANCA) delete env[nome]
  try {
    return await new Promise(resolver => {
      const filho = execFile('claude', args, { cwd: pasta, env, timeout: CINCO_MINUTOS, maxBuffer: 64 * 1024 * 1024 }, (erro, saida) => {
        resolver({ saida, falha: motivoDaFalha(erro) })
      })
      filho.stdin?.on('error', () => {})
      filho.stdin?.end(entrada ?? '')
    })
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
}

function motivoDaFalha(erro: ExecFileException | null): string | undefined {
  if (!erro) return undefined
  return erro.killed ? 'tempo esgotado' : String(erro.code ?? erro.message)
}

function lerJson(texto: string): Record<string, unknown> | undefined {
  try {
    const dado = JSON.parse(texto)
    return typeof dado === 'object' && dado !== null ? dado : undefined
  } catch {
    return undefined
  }
}
