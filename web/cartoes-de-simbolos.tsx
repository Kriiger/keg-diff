// Os cartões do que o diff fez com o código: os símbolos que mudaram e a API pública, os endpoints HTTP e as dependências.
import type { Dependencia, Revisao, SimboloAlterado, TipoDeSimbolo } from '../src/contrato'
import { Cartao, LinkDoArquivo } from './cartao'
import { enderecoDoSimbolo } from './enderecos'

const TIPOS: [TipoDeSimbolo, string][] = [['funcao', 'funções'], ['componente', 'componentes'], ['classe', 'classes'], ['tipo', 'tipos'], ['constante', 'constantes']]
const MUDANCAS = ['novo', 'alterado', 'removido'] as const
const API_MOSTRADA = 8
const ENDPOINTS_MOSTRADOS = 10
const DEPENDENCIAS_MOSTRADAS = 12

export function CartoesDeSimbolos({ revisao }: { revisao: Revisao }) {
  return (
    <>
      <CartaoDosSimbolos simbolos={revisao.panorama?.simbolos ?? []} revisao={revisao} />
      <CartaoDosEndpoints revisao={revisao} />
      <CartaoDasDependencias dependencias={revisao.panorama?.dependencias ?? []} />
    </>
  )
}

function CartaoDosSimbolos({ simbolos, revisao }: { simbolos: SimboloAlterado[]; revisao: Revisao }) {
  if (simbolos.length === 0) return null
  const quantos = (tipo: TipoDeSimbolo, mudanca: string) => simbolos.filter(s => s.tipo === tipo && s.mudanca === mudanca).length
  const api = simbolos.filter(mudaAApi)
  return (
    <Cartao titulo="Símbolos" dica="declarações do topo dos arquivos de código">
      <table className="tabela-de-simbolos">
        <thead><tr><th /><th>novos</th><th>alterados</th><th>removidos</th></tr></thead>
        <tbody>
          {TIPOS.filter(([tipo]) => simbolos.some(s => s.tipo === tipo)).map(([tipo, nome]) => (
            <tr key={tipo}>
              <th scope="row">{nome}</th>
              {MUDANCAS.map(mudanca => <td key={mudanca} className={quantos(tipo, mudanca) === 0 ? 'zero' : undefined}>{quantos(tipo, mudanca)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {api.length > 0 && <h3>API pública que mudou <span className="detalhe">{api.length}</span></h3>}
      <ul className="api-publica">
        {api.slice(0, API_MOSTRADA).map(s => <ItemDaApi key={`${s.arquivo}#${s.nome}`} simbolo={s} revisao={revisao} />)}
      </ul>
      {api.length > API_MOSTRADA && <p className="detalhe">+{api.length - API_MOSTRADA} na lista completa do review.json</p>}
    </Cartao>
  )
}

// Exportação nova, removida, com assinatura diferente ou que passou a ser (ou deixou de ser) exportada.
// Corpo de função que mudou sem mexer na assinatura não quebra quem a usa.
function mudaAApi(s: SimboloAlterado): boolean {
  if (s.mudanca !== 'alterado') return s.exportado
  return s.assinaturaAntes !== undefined || s.exportadoAntes !== undefined
}

function rotuloDaApi(s: SimboloAlterado): string {
  if (s.mudanca === 'novo') return 'nova'
  if (s.mudanca === 'removido') return 'removida'
  if (s.exportadoAntes !== undefined) return s.exportadoAntes ? 'deixou de exportar' : 'passou a exportar'
  return 'assinatura mudou'
}

function ItemDaApi({ simbolo, revisao }: { simbolo: SimboloAlterado; revisao: Revisao }) {
  // Tirar ou mudar o que os outros arquivos usam é o que pode quebrar quem chama: só isso leva a cor de atenção.
  const quebra = simbolo.mudanca !== 'novo' && simbolo.exportadoAntes !== false
  return (
    <li>
      <span className={quebra ? 'selo risco-medio' : 'selo'}>{rotuloDaApi(simbolo)}</span>
      <LinkDoArquivo caminho={simbolo.arquivo} href={enderecoDoSimbolo(revisao, simbolo.arquivo, simbolo.nome)}><code>{simbolo.nome}</code></LinkDoArquivo>
      <span className="assinatura">
        {simbolo.assinaturaAntes && <span className="antes" title={simbolo.assinaturaAntes}>{simbolo.assinaturaAntes}</span>}
        {simbolo.mudanca !== 'removido' && <span title={simbolo.assinatura}>{simbolo.assinatura}</span>}
      </span>
    </li>
  )
}

function CartaoDosEndpoints({ revisao }: { revisao: Revisao }) {
  const endpoints = revisao.panorama?.endpoints ?? []
  if (endpoints.length === 0) return null
  return (
    <Cartao titulo="Endpoints HTTP" dica="método e rota">
      <ul className="endpoints">
        {endpoints.slice(0, ENDPOINTS_MOSTRADOS).map(({ metodo, rota, arquivo, mudanca }) => (
          <li key={`${metodo} ${rota} ${arquivo}`}>
            <span className="metodo">{metodo}</span>
            <LinkDoArquivo caminho={arquivo} href={enderecoDoSimbolo(revisao, arquivo, metodo === 'ANY' ? 'default' : metodo)}><code>{rota}</code></LinkDoArquivo>
            <span className={mudanca === 'alterado' ? 'selo' : `selo status-${mudanca}`}>{mudanca}</span>
          </li>
        ))}
      </ul>
      {endpoints.length > ENDPOINTS_MOSTRADOS && <p className="detalhe">+{endpoints.length - ENDPOINTS_MOSTRADOS} endpoints</p>}
    </Cartao>
  )
}

function CartaoDasDependencias({ dependencias }: { dependencias: Dependencia[] }) {
  if (dependencias.length === 0) return null
  const arquivos = [...new Set(dependencias.map(d => d.arquivo))]
  return (
    <Cartao titulo="Dependências" dica={arquivos.join(' · ')}>
      <ul className="dependencias">
        {dependencias.slice(0, DEPENDENCIAS_MOSTRADAS).map(d => <ItemDaDependencia key={`${d.arquivo}#${d.secao}#${d.nome}`} dependencia={d} />)}
      </ul>
      {dependencias.length > DEPENDENCIAS_MOSTRADAS && <p className="detalhe">+{dependencias.length - DEPENDENCIAS_MOSTRADAS} dependências</p>}
      <p className="detalhe">{arquivos.map(arquivo => <LinkDoArquivo key={arquivo} caminho={arquivo}>abrir {arquivo}</LinkDoArquivo>)}</p>
    </Cartao>
  )
}

// A primeira parte numérica da versão: ^18.2.0 e 19.0.0 estão em majors diferentes.
function majorDe(versao: string): string | undefined {
  return /\d+/.exec(versao)?.[0]
}

const SITUACAO = { nova: 'selo status-novo', removida: 'selo status-removido', atualizada: 'selo' }

function situacaoDe({ antes, depois }: Dependencia): keyof typeof SITUACAO {
  if (antes === undefined) return 'nova'
  return depois === undefined ? 'removida' : 'atualizada'
}

function ItemDaDependencia({ dependencia }: { dependencia: Dependencia }) {
  const { nome, secao, antes, depois } = dependencia
  const situacao = situacaoDe(dependencia)
  const salto = situacao === 'atualizada' && majorDe(antes!) !== majorDe(depois!)
  return (
    <li>
      <span className={SITUACAO[situacao]}>{situacao}</span>
      <code>{nome}</code>
      <span className="versoes">{situacao === 'atualizada' ? `${antes} → ${depois}` : (antes ?? depois)}</span>
      {salto && <span className="selo risco-medio">major</span>}
      {secao !== 'dependencies' && <span className="detalhe">{secao.replace('Dependencies', '')}</span>}
    </li>
  )
}
