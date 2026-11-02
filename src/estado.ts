// O que a pessoa decidiu na página: o estado.json (decisões por hash de trecho) e a nota do fechamento.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AchadosEscolhidos, Estado, Nota, TipoDoComentario } from './contrato.js'

export function lerEstado(pastaDaRevisao: string): Estado {
  const arquivo = path.join(pastaDaRevisao, 'estado.json')
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
}

export function lerNota(pastaDaRevisao: string): Nota | null {
  const arquivo = path.join(pastaDaRevisao, 'nota.json')
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : null
}

// Devolve null se a nota não for um inteiro de 1 a 5.
export function gravarNota(pastaDaRevisao: string, nota: unknown, base: string): Nota | null {
  if (typeof nota !== 'number' || !Number.isInteger(nota) || nota < 1 || nota > 5) return null
  const gravada = { nota, em: new Date().toISOString(), base } as Nota
  writeFileSync(path.join(pastaDaRevisao, 'nota.json'), JSON.stringify(gravada, null, 2) + '\n')
  return gravada
}

// Uma decisão vinda da página. Marca e comentário são independentes: a pessoa lê, comenta e marca como revisado.
export interface PedidoDeDecisao {
  hunkIds: string[]
  decisao: Estado[string]['decisao'] | null    // null desfaz a marca e deixa o comentário, se houver
  comentario?: string                          // só vale com 'comentado'; texto vazio apaga o comentário (e o tipo dele)
  tipoDoComentario?: TipoDoComentario          // só vale com 'comentado'; sem ele o comentário guarda o tipo que já tinha
  segundos?: number                            // o cronômetro da página no momento da decisão
}

export const TIPOS_DE_COMENTARIO: readonly TipoDoComentario[] = ['corrija', 'duvida']

// Devolve um estado novo, sem mexer no recebido.
export function aplicarDecisao(estado: Estado, { hunkIds, decisao, comentario, tipoDoComentario }: PedidoDeDecisao, em = new Date().toISOString()): Estado {
  const novo = { ...estado }
  for (const id of hunkIds) {
    const atual = estado[id]
    let marca = atual && atual.decisao !== 'comentado' ? atual.decisao : undefined
    let texto = atual?.comentario
    let tipo = atual?.tipoDoComentario
    if (decisao === null) marca = undefined
    else if (decisao === 'comentado') {
      if (typeof comentario === 'string') texto = comentario.trim() || undefined
      if (tipoDoComentario) tipo = tipoDoComentario
    } else marca = decisao
    if (marca) novo[id] = texto ? { decisao: marca, comentario: texto, ...(tipo && { tipoDoComentario: tipo }), em } : { decisao: marca, em }
    else if (texto) novo[id] = { decisao: 'comentado', comentario: texto, ...(tipo && { tipoDoComentario: tipo }), em }
    else delete novo[id]
  }
  return novo
}

export function lerAchados(pastaDaRevisao: string): AchadosEscolhidos {
  const arquivo = path.join(pastaDaRevisao, 'achados.json')
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
}

export function gravarAchados(pastaDaRevisao: string, achados: AchadosEscolhidos) {
  writeFileSync(path.join(pastaDaRevisao, 'achados.json'), JSON.stringify(achados, null, 2) + '\n')
}

// Põe ou tira as chaves; quem já estava dentro mantém a data em que entrou.
export function aplicarAchados(achados: AchadosEscolhidos, chaves: string[], incluir: boolean, em = new Date().toISOString()): AchadosEscolhidos {
  const novo = { ...achados }
  for (const chave of chaves) {
    if (!incluir) delete novo[chave]
    else novo[chave] ??= { em }
  }
  return novo
}
