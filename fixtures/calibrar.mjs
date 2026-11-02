// Calibragem do motor (Fase 0): roda o keg em PRs reais de agentes e compara com o gabarito escrito à mão.
// Uso: npm run calibrar. Os repositórios são clonados uma vez em fixtures/.repos.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const pastaDosGabaritos = import.meta.dirname
const cli = path.join(pastaDosGabaritos, '..', 'dist', 'cli.js')
const git = (pasta, ...args) => execFileSync('git', ['-C', pasta, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })

let divergencias = 0
for (const nome of readdirSync(pastaDosGabaritos).filter(n => n.endsWith('.json')).sort()) {
  const gabarito = JSON.parse(readFileSync(path.join(pastaDosGabaritos, nome), 'utf8'))
  const repo = path.join(pastaDosGabaritos, '.repos', nome.replace(/\.json$/, ''))
  if (!existsSync(repo)) {
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', gabarito.repositorio, repo], { stdio: 'inherit' })
    git(repo, 'fetch', '-q', 'origin', `pull/${gabarito.numero}/head`)
  }
  git(repo, 'checkout', '-q', '--detach', gabarito.head)
  const pasta = path.join(repo, gabarito.pasta)
  execFileSync('node', [cli, 'diff', '--sem-tela', `${gabarito.base}...${gabarito.head}`], { cwd: pasta, stdio: 'ignore' })
  const revisao = JSON.parse(readFileSync(path.join(pasta, '.revisao', 'review.json'), 'utf8'))
  const erros = comparar(gabarito, revisao)
  divergencias += erros.length
  console.log(`${erros.length === 0 ? '✓' : '✗'} ${nome} · ${revisao.fluxos.length} fluxos · ${gabarito.pr}`)
  for (const erro of erros) console.log(`    ${erro}`)
}
console.log(divergencias === 0 ? '\nTudo bate com o gabarito.' : `\n${divergencias} divergências do gabarito.`)
process.exit(divergencias === 0 ? 0 : 1)

// O gabarito pede o mínimo que um revisor exige: o agrupamento, as pontas e as fronteiras.
// Passos de contexto no meio do caminho ficam livres.
function comparar(gabarito, revisao) {
  const erros = []
  const fluxos = revisao.fluxos.map(fluxo => ({ fluxo, chaves: lerFluxo(fluxo) }))
  const usados = new Set()
  gabarito.fluxos.forEach((esperado, i) => {
    const achado = fluxos
      .map(f => ({ ...f, comuns: esperado.alterados.filter(a => f.chaves.alterados.has(a)).length }))
      .sort((a, b) => b.comuns - a.comuns)[0]
    if (!achado || achado.comuns === 0) return erros.push(`fluxo ${i + 1}: nenhum fluxo tem ${esperado.alterados.join(', ')}`)
    usados.add(achado.fluxo)
    const rotulo = `fluxo ${i + 1} (${achado.fluxo.titulo})`
    for (const campo of ['alterados', 'nasce', 'termina', 'fronteiras']) {
      const faltam = (esperado[campo] ?? []).filter(chave => !achado.chaves[campo].has(chave))
      if (faltam.length > 0) erros.push(`${rotulo}: faltam em ${campo}: ${faltam.join(', ')}`)
    }
    if (esperado.risco && esperado.risco !== achado.fluxo.risco) erros.push(`${rotulo}: risco ${achado.fluxo.risco}, esperado ${esperado.risco}`)
  })
  for (const { fluxo } of fluxos) if (!usados.has(fluxo)) erros.push(`fluxo a mais: ${fluxo.titulo}`)
  const orfaos = revisao.orfaos.map(o => `${o.arquivo}${o.simbolo ? `#${o.simbolo}` : ''} ${o.motivo}`)
  erros.push(...diferenca('órfão', gabarito.orfaos, orfaos))
  erros.push(...diferenca('teste', gabarito.testes, (revisao.testes ?? []).map(t => t.arquivo)))
  return erros
}

function lerFluxo(fluxo) {
  const chave = p => `${p.arquivo}#${p.simbolo}`
  const com = filtro => new Set(fluxo.passos.filter(filtro).map(chave))
  return {
    alterados: com(p => p.hunkIds.length > 0),
    nasce: com(p => p.papel === 'nasce'),
    termina: com(p => p.papel === 'termina'),
    fronteiras: com(p => p.fronteira),
  }
}

function diferenca(tipo, esperados, achados) {
  return [
    ...esperados.filter(e => !achados.includes(e)).map(e => `${tipo} esperado e não achado: ${e}`),
    ...achados.filter(a => !esperados.includes(a)).map(a => `${tipo} a mais: ${a}`),
  ]
}
