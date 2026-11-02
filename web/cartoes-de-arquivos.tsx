// Os cartões que olham os arquivos do diff: onde ele pesa, em que pastas e tipos, e quais códigos ficaram sem teste.
import type { InfoDoArquivo, Revisao } from '../src/contrato'
import { Barra, BarraDeLinhas, Cartao, Linhas, LinkDoArquivo, Numero } from './cartao'
import { agrupar, contarPorStatus, contarStatus, extensaoDe, pastaDe, plural, type ArquivoMedido } from './resumo'

const ARQUIVOS_MOSTRADOS = 6
const PASTAS_MOSTRADAS = 6
const SEM_TESTE_MOSTRADOS = 5

export function CartoesDeArquivos({ revisao, medidos }: { revisao: Revisao; medidos: ArquivoMedido[] }) {
  return (
    <>
      <CartaoDosArquivos medidos={medidos} />
      <CartaoDasPastas medidos={medidos} />
      <CartaoDosTestes revisao={revisao} medidos={medidos} />
    </>
  )
}

function CartaoDosArquivos({ medidos }: { medidos: ArquivoMedido[] }) {
  if (medidos.length === 0) return null
  const maior = Math.max(...medidos.map(m => m.mais + m.menos))
  const tipos = agrupar(medidos, extensaoDe)
  return (
    <Cartao titulo="Arquivos" dica="os que mais mudaram">
      <ul className="chips">
        {contarPorStatus(medidos).map(([status, quantos]) => <li key={status} className={`selo status-${status}`}>{contarStatus(status, quantos)}</li>)}
      </ul>
      <ol className="barras">
        {medidos.slice(0, ARQUIVOS_MOSTRADOS).map(({ arquivo, mais, menos }) => (
          <li key={arquivo.caminho}>
            <LinkDoArquivo caminho={arquivo.caminho} />
            <Linhas mais={mais} menos={menos} />
            <BarraDeLinhas mais={mais} menos={menos} maximo={maior} />
          </li>
        ))}
      </ol>
      {medidos.length > ARQUIVOS_MOSTRADOS && <p className="detalhe">+{medidos.length - ARQUIVOS_MOSTRADOS} arquivos menores</p>}
      <h3>Por tipo de arquivo</h3>
      <ul className="chips">
        {tipos.map(tipo => <li key={tipo.nome} className="selo">{tipo.nome} · {tipo.arquivos} · +{tipo.mais} −{tipo.menos}</li>)}
      </ul>
    </Cartao>
  )
}

// Uma pasta só não diz nada: o cartão aparece quando o diff se espalha por mais de uma.
function CartaoDasPastas({ medidos }: { medidos: ArquivoMedido[] }) {
  const pastas = agrupar(medidos, pastaDe)
  if (pastas.length < 2) return null
  const maior = Math.max(...pastas.map(p => p.mais + p.menos))
  return (
    <Cartao titulo="Pastas" dica="as duas primeiras de cada caminho">
      <ol className="barras">
        {pastas.slice(0, PASTAS_MOSTRADAS).map(pasta => (
          <li key={pasta.nome}>
            <span className="caminho">{pasta.nome} <span className="detalhe">{plural(pasta.arquivos, 'arquivo', 'arquivos')}</span></span>
            <Linhas mais={pasta.mais} menos={pasta.menos} />
            <BarraDeLinhas mais={pasta.mais} menos={pasta.menos} maximo={maior} />
          </li>
        ))}
      </ol>
      {pastas.length > PASTAS_MOSTRADAS && <p className="detalhe">+{pastas.length - PASTAS_MOSTRADAS} pastas menores</p>}
    </Cartao>
  )
}

// "Teste de mesmo nome" (Dashboard.test.tsx para o Dashboard.tsx) é uma heurística: o motor também conta o teste alterado que importa o arquivo.
function CartaoDosTestes({ revisao, medidos }: { revisao: Revisao; medidos: ArquivoMedido[] }) {
  const codigo = revisao.panorama?.arquivos ?? []
  if (codigo.length === 0 && revisao.testes.length === 0) return null
  return (
    <Cartao titulo="Testes" dica="o teste tem o nome do arquivo">
      <div className="numeros">
        <Numero valor={revisao.testes.length} rotulo={revisao.testes.length === 1 ? 'teste alterado' : 'testes alterados'} />
        {codigo.length > 0 && <Numero valor={`${codigo.filter(a => a.teste !== 'nenhum').length} de ${codigo.length}`} rotulo="arquivos de código com teste" />}
      </div>
      {codigo.length > 0 && <CoberturaDeTestes codigo={codigo} />}
      <CodigoSemTeste codigo={codigo} medidos={medidos} />
    </Cartao>
  )
}

const SITUACOES = [['tocado', 'com o teste alterado', 'ok'], ['existe', 'com teste que não mudou', undefined], ['nenhum', 'sem teste', 'medio']] as const

function CoberturaDeTestes({ codigo }: { codigo: InfoDoArquivo[] }) {
  return (
    <ul className="linhas-de-barra">
      {SITUACOES.map(([situacao, rotulo, tom]) => {
        const quantos = codigo.filter(a => a.teste === situacao).length
        return <li key={situacao}><span>{rotulo}</span><Barra valor={quantos} maximo={codigo.length} tom={tom} /><span className="contagem">{quantos}</span></li>
      })}
    </ul>
  )
}

const SEM_MUDANCA = { mais: 0, menos: 0 }

function CodigoSemTeste({ codigo, medidos }: { codigo: InfoDoArquivo[]; medidos: ArquivoMedido[] }) {
  const mudancas = new Map(medidos.map(m => [m.arquivo.caminho, m]))
  const peso = (caminho: string) => (mudancas.get(caminho)?.mais ?? 0) + (mudancas.get(caminho)?.menos ?? 0)
  const semTeste = codigo.filter(a => a.teste === 'nenhum').sort((a, b) => peso(b.caminho) - peso(a.caminho))
  if (semTeste.length === 0) return null
  return (
    <>
      <h3>Código alterado sem teste</h3>
      <ol className="barras">
        {semTeste.slice(0, SEM_TESTE_MOSTRADOS).map(a => (
          <li key={a.caminho}><LinkDoArquivo caminho={a.caminho} /><Linhas {...(mudancas.get(a.caminho) ?? SEM_MUDANCA)} /></li>
        ))}
      </ol>
      {semTeste.length > SEM_TESTE_MOSTRADOS && <p className="detalhe">+{semTeste.length - SEM_TESTE_MOSTRADOS} arquivos</p>}
    </>
  )
}
