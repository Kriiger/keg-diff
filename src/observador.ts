// Modo --watch: observa os arquivos do projeto e pede uma análise nova quando algum muda.
// Rajada de gravações (o editor salvando vários arquivos, o agente rodando um formatador) vira uma análise só.
import { watch } from 'node:fs'
import path from 'node:path'

// .revisao é onde o próprio keg grava; o resto é saída de build ou dependência, que muda sem o código mudar.
const IGNORADAS = new Set(['.revisao', 'node_modules', '.git', 'dist', '.next', '.turbo', 'coverage'])
const ESPERA_EM_MS = 400

export function observarProjeto(raiz: string, analisarDeNovo: () => Promise<void>) {
  let espera: NodeJS.Timeout | undefined
  let rodando = false
  let mudouNoMeio = false

  const agendar = () => {
    clearTimeout(espera)
    espera = setTimeout(executar, ESPERA_EM_MS)
  }
  // Mudou durante a análise: ela termina e uma só análise nova roda depois, nunca duas ao mesmo tempo.
  async function executar() {
    if (rodando) {
      mudouNoMeio = true
      return
    }
    rodando = true
    await analisarDeNovo()
    rodando = false
    if (mudouNoMeio) {
      mudouNoMeio = false
      agendar()
    }
  }

  watch(raiz, { recursive: true }, (_, nome) => {
    if (!nome || !nome.split(path.sep).some(parte => IGNORADAS.has(parte))) agendar()
  })
}
