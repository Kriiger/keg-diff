// O conteúdo dos arquivos que a tela mostra com contexto: o arquivo inteiro, como está na ponta de chegada do diff (GET /api/arquivo).
// Buscado sob demanda e guardado por arquivo: vários passos do mesmo arquivo, os trechos da árvore e a folha de "ver arquivo completo" dividem uma
// busca só. O cache vale para o review.json de agora (geradoEm): uma análise nova pode ter mexido nos arquivos, e então ele recomeça vazio.
import { useEffect, useState } from 'react'
import { linhasDoArquivo } from '../src/contexto'
import type { Revisao } from '../src/contrato'
import { escutar } from './eventos'

export interface Conteudo {
  texto: string
  linhas: string[]
}

// null = o servidor não entregou (arquivo fora da revisão, grande demais, binário, não existe lá): quem usa mostra sem contexto.
// Ausente do mapa = ainda não buscado ou em busca.
const prontos = new Map<string, Conteudo | null>()
const buscas = new Map<string, Promise<void>>()
let revisaoDoCache = ''

// O servidor que volta (ou outro keg diff na mesma porta) pode entregar o que antes faltou: as respostas vazias são esquecidas, e a página
// recarregada pede de novo.
escutar('open', () => {
  for (const [chave, conteudo] of prontos) if (conteudo === null) prontos.delete(chave)
})

function chaveDe(revisao: Revisao, arquivo: string): string {
  if (revisaoDoCache !== revisao.geradoEm) {
    revisaoDoCache = revisao.geradoEm
    prontos.clear()
    buscas.clear()
  }
  return arquivo
}

// Começa a busca se ainda não houve; devolve a promessa da busca (resolve quando o cache tem a resposta, nunca rejeita).
export function precarregar(revisao: Revisao, arquivo: string): Promise<void> {
  const chave = chaveDe(revisao, arquivo)
  if (prontos.has(chave)) return Promise.resolve()
  let busca = buscas.get(chave)
  if (!busca) {
    // Uma resposta que chega depois de uma análise nova é do review.json antigo: não entra no cache novo.
    const epoca = revisaoDoCache
    const guardar = (conteudo: Conteudo | null) => { if (epoca === revisaoDoCache) prontos.set(chave, conteudo) }
    busca = fetch(`/api/arquivo?${new URLSearchParams({ arquivo })}`)
      .then(r => (r.ok ? r.json() : null))
      .then((corpo: { conteudo: string } | null) => guardar(corpo && { texto: corpo.conteudo, linhas: linhasDoArquivo(corpo.conteudo) }))
      // Servidor fora: o arquivo fica "sem conteúdo" até a conexão voltar (abaixo).
      .catch(() => guardar(null))
      .finally(() => { if (buscas.get(chave) === busca) buscas.delete(chave) })
    buscas.set(chave, busca)
  }
  return busca
}

// O arquivo de agora, ou undefined enquanto vem, ou null se não há. Com ele no cache a resposta é imediata, no mesmo render.
// Sem arquivo (undefined) o gancho não busca nada.
export function useConteudo(revisao: Revisao, arquivo: string | undefined): Conteudo | null | undefined {
  const [, refazer] = useState(0)
  const chave = arquivo === undefined ? undefined : chaveDe(revisao, arquivo)
  const falta = chave !== undefined && !prontos.has(chave)
  useEffect(() => {
    if (chave !== undefined && falta) precarregar(revisao, chave).then(() => refazer(n => n + 1))
  }, [revisao.geradoEm, chave, falta])
  return chave === undefined ? undefined : prontos.get(chave)
}
