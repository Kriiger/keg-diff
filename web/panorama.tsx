// O panorama: a tela inicial. Resume a mudança (tamanho, progresso, risco, fluxos, commits) e abre os cartões do código afetado.
import { useMemo } from 'react'
import type { Estado, Intervalo, Revisao } from '../src/contrato'
import { CartaoDeAtencao } from './cartoes-de-atencao'
import { CartoesDeArquivos } from './cartoes-de-arquivos'
import { CartoesDeSimbolos } from './cartoes-de-simbolos'
import { CartaoDoGrafo } from './cartoes-do-grafo'
import { Barra, Cartao, Linhas, Numero } from './cartao'
import { Caminho } from './caminho'
import { ColunasDeCartoes } from './colunas'
import { formatarTempo } from './cronometro'
import { AlertasDoManifesto } from './divergencias'
import { enderecoDoPasso } from './enderecos'
import type { Checklist } from './main'
import { BotaoNarrarTodos, type Narrador } from './narracao'
import {
  NOME_DO_RISCO, PESO_DO_RISCO, churnPorTrecho, contarPorStatus, contarStatus, destino, distribuirRisco, estimarRevisao, linhasDeFluxo, medirArquivos, nascimento,
  nomesCurtos, plural, pontosDeRisco, somarLinhas, type ArquivoMedido, type LinhaDeFluxo,
} from './resumo'
import { decididos, encurtarBase } from './telas'

// O mesmo limite do cli.ts: acima disso a revisão não fecha.
const TRECHOS_DEMAIS = 40
const COMMITS_MOSTRADOS = 6

interface PropsDoPanorama { revisao: Revisao; checklist: Checklist; estado: Estado; narrador: Narrador; segundos: () => number }

export function Panorama({ revisao, checklist, estado, narrador, segundos }: PropsDoPanorama) {
  const medidos = useMemo(() => medirArquivos(revisao), [revisao])
  const linhas = useMemo(() => linhasDeFluxo(checklist.fluxos, revisao).sort((a, b) => PESO_DO_RISCO[b.fluxo.risco] - PESO_DO_RISCO[a.fluxo.risco]), [checklist, revisao])
  const total = checklist.todos.length
  const feitos = decididos(checklist.todos, estado)
  return (
    <section className="panorama">
      <header>
        <h1>Panorama</h1>
        <p className="detalhe">{descreverIntervalo(revisao)} · gerado às {new Date(revisao.geradoEm).toLocaleTimeString()}</p>
        <p className="resumo-do-diff"><strong>{plural(medidos.length, 'arquivo', 'arquivos')} · {plural(total, 'trecho', 'trechos')}</strong> no diff. {linhas.length > 0 && `${plural(linhas.length, 'fluxo', 'fluxos')}: caminhos que atravessam esses arquivos, não arquivos a mais.`}</p>
      </header>
      <FaixaDeNumeros revisao={revisao} medidos={medidos} total={total} feitos={feitos} segundos={segundos()} />
      {total > TRECHOS_DEMAIS && <p className="alerta">{total} trechos é muito para uma revisão: peça ao agente para fatiar a tarefa.</p>}
      {total > 0 && feitos === total && <p className="sucesso">Revisão completa: {total} de {total} trechos com decisão.</p>}
      <AlertasDoManifesto manifesto={revisao.manifesto} />
      {/* O risco e os fluxos ocupam a largura toda (são o que se lê primeiro); o resto vai em colunas (colunas.tsx), cada cartão na coluna mais baixa. */}
      <div className="destaques-do-panorama">
        <CartaoDoRisco linhas={linhas} revisao={revisao} estado={estado} />
        <CartaoDosFluxos linhas={linhas} revisao={revisao} estado={estado} narrador={narrador} />
      </div>
      <ColunasDeCartoes>
        <CartaoDeAtencao revisao={revisao} />
        <CartaoDosCommits intervalo={revisao.panorama?.intervalo} />
        <CartoesDeArquivos revisao={revisao} medidos={medidos} />
        <CartoesDeSimbolos revisao={revisao} />
        <CartaoDoGrafo revisao={revisao} />
      </ColunasDeCartoes>
    </section>
  )
}

// "e89d090 → bf157df · branch main": de onde o git compara até onde. Review.json sem panorama só conhece a base.
function descreverIntervalo(revisao: Revisao): string {
  const intervalo = revisao.panorama?.intervalo
  if (!intervalo) return encurtarBase(revisao.base)
  return [`${encurtarBase(intervalo.antes)} → ${encurtarBase(intervalo.depois)}`, intervalo.branch && `branch ${intervalo.branch}`].filter(Boolean).join(' · ')
}

interface PropsDaFaixa { revisao: Revisao; medidos: ArquivoMedido[]; total: number; feitos: number; segundos: number }

function FaixaDeNumeros({ revisao, medidos, total, feitos, segundos }: PropsDaFaixa) {
  const linhas = somarLinhas(medidos)
  const porcentagem = total === 0 ? 100 : Math.round((feitos / total) * 100)
  const estimativa = estimarRevisao(revisao, total, total - feitos, linhas)
  const status = contarPorStatus(medidos).map(([nome, quantos]) => contarStatus(nome, quantos)).join(' · ')
  return (
    <div className="cartao faixa">
      <Numero valor={`${porcentagem}%`} rotulo={`${feitos} de ${total} trechos revisados`} tom={total > 0 && feitos === total ? 'ok' : undefined} />
      <Numero valor={medidos.length} rotulo="arquivos" dica={status || undefined} />
      <Numero valor={<Linhas {...linhas} />} rotulo="linhas alteradas" />
      <Numero valor={total} rotulo="trechos no diff" dica={`${plural(revisao.orfaos.length, 'órfão', 'órfãos')}, fora dos fluxos`} />
      <Numero valor={revisao.fluxos.length} rotulo="fluxos" dica="caminhos pelos mesmos arquivos" />
      {estimativa && <Numero valor={`~${estimativa.minutos} min`} rotulo={estimativa.restantes < estimativa.minutos ? `de leitura, faltam ~${estimativa.restantes}` : 'de leitura estimada'} dica={estimativa.detalhe} />}
      {segundos > 0 && <Numero valor={formatarTempo(segundos)} rotulo="nesta revisão" />}
    </div>
  )
}

interface PropsComFluxos { linhas: LinhaDeFluxo[]; revisao: Revisao; estado: Estado }

function CartaoDoRisco({ linhas, revisao, estado }: PropsComFluxos) {
  const churn = useMemo(() => churnPorTrecho(revisao), [revisao])
  if (linhas.length === 0) return null
  const distribuicao = distribuirRisco(linhas, estado)
  const maior = Math.max(...distribuicao.map(d => d.trechos))
  const pontos = pontosDeRisco(linhas.map(l => l.fluxo), estado, churn)
  return (
    <Cartao titulo="Mapa de risco" dica="o risco vem da saída do fluxo">
      <ul className="linhas-de-risco">
        {distribuicao.map(d => (
          <li key={d.risco}>
            <span className={`selo risco-${d.risco}`}>{NOME_DO_RISCO[d.risco]}</span>
            <Barra valor={d.trechos} maximo={maior} tom={d.risco} />
            <span className="contagem">{plural(d.fluxos, 'fluxo', 'fluxos')} · {plural(d.trechos, 'trecho', 'trechos')}{d.pendentes > 0 && ` · ${d.pendentes} sem revisão`}</span>
          </li>
        ))}
      </ul>
      {pontos.length > 0 && <h3>Para ver primeiro</h3>}
      <ol className="pontos-de-risco">
        {pontos.map(({ fluxo, passo, motivos, churn: mudanca }) => (
          <li key={`${fluxo.id}/${passo.id}`}>
            <a href={enderecoDoPasso({ fluxo, passo })}>
              <span className={`selo risco-${fluxo.risco}`}>{NOME_DO_RISCO[fluxo.risco]}</span>
              <span className="corpo">
                <strong>{passo.simbolo}</strong> <span className="local"><Caminho caminho={passo.arquivo} /><span className="linha-do-passo">:{passo.linhas[0]}</span></span>
                <span className="detalhe">{[...motivos, fluxo.titulo].join(' · ')}</span>
              </span>
              <Linhas {...mudanca} />
            </a>
          </li>
        ))}
      </ol>
    </Cartao>
  )
}

function CartaoDosCommits({ intervalo }: { intervalo?: Intervalo }) {
  if (!intervalo || intervalo.commits.length === 0) return null
  const { commits, totalDeCommits } = intervalo
  // Os autores só são exatos quando a lista guardada tem todos os commits.
  const autores = commits.length === totalDeCommits ? ` · ${plural(new Set(commits.map(c => c.autor)).size, 'autor', 'autores')}` : ''
  return (
    <Cartao titulo="Commits" dica={`${plural(totalDeCommits, 'commit', 'commits')}${autores}`}>
      <ol className="commits">
        {commits.slice(0, COMMITS_MOSTRADOS).map(commit => (
          <li key={commit.hash}>
            <code>{commit.hash}</code>
            <span className="corpo"><span className="assunto">{commit.assunto}</span><span className="detalhe">{commit.autor} · {new Date(commit.em).toLocaleDateString()}</span></span>
          </li>
        ))}
      </ol>
      {totalDeCommits > COMMITS_MOSTRADOS && <p className="detalhe">+{totalDeCommits - COMMITS_MOSTRADOS} mais antigos</p>}
    </Cartao>
  )
}

function CartaoDosFluxos({ linhas, revisao, estado, narrador }: PropsComFluxos & { narrador: Narrador }) {
  if (linhas.length === 0) return <Cartao titulo="Fluxos"><p className="detalhe">Nenhum fluxo: os trechos alterados estão nos órfãos e em outros trechos.</p></Cartao>
  const todos = revisao.arquivos.map(a => a.caminho)
  return (
    <Cartao titulo="Fluxos" dica="do mais arriscado ao menos">
      <NotaDosFluxos linhas={linhas} />
      <BotaoNarrarTodos revisao={revisao} narrador={narrador} />
      <ol className="lista-de-fluxos">
        {linhas.map(({ fluxo, hunkIds, arquivos, camadas, nasce, termina }) => {
          const feitos = decididos(hunkIds, estado)
          return (
            <li key={fluxo.id}>
              <a href={`#fluxo/${fluxo.id}`}>
                <span className={`selo risco-${fluxo.risco}`}>{NOME_DO_RISCO[fluxo.risco]}</span>
                <span className="corpo">
                  <strong>{fluxo.titulo}</strong>
                  <span className="detalhe">nasce em {nasce.simbolo}{rotular(nascimento(fluxo.entrada))} → termina em {termina.simbolo}{rotular(destino(fluxo.saida))}</span>
                  {arquivos.length > 0 && <span className="detalhe arquivos-do-fluxo" title={arquivos.join('\n')}>{nomesCurtos(arquivos, todos).join(' · ')}</span>}
                </span>
                <span className="meta">
                  {plural(fluxo.passos.length, 'passo', 'passos')} · {plural(arquivos.length, 'arquivo', 'arquivos')}
                  {camadas.length > 0 && <span className="camadas">{camadas.join(' ⇄ ')}</span>}
                </span>
                <span className="progresso-do-fluxo">
                  <Barra valor={feitos} maximo={hunkIds.length} tom="ok" />
                  <span className={feitos === hunkIds.length ? 'contagem completa' : 'contagem'} title={`${feitos} de ${hunkIds.length} trechos deste fluxo revisados`}>{feitos}/{hunkIds.length}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </Cartao>
  )
}

// Os fluxos passam pelos mesmos trechos, então a soma dos "0/45" passa do total do diff: a nota diz isso antes de alguém contar.
function NotaDosFluxos({ linhas }: { linhas: LinhaDeFluxo[] }) {
  const soma = linhas.reduce((total, l) => total + l.hunkIds.length, 0)
  const distintos = new Set(linhas.flatMap(l => l.hunkIds)).size
  if (soma === distintos) return null
  return <p className="nota-dos-fluxos detalhe">O x/y de cada fluxo são os trechos dele revisados sobre os trechos dele. O mesmo trecho aparece em mais de um fluxo: somados dão {soma}, mas só {distintos} são distintos.</p>
}

function rotular(texto: string | undefined): string {
  return texto ? ` (${texto})` : ''
}
