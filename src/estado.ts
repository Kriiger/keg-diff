// O que a pessoa decidiu na página: o estado.json (decisões por hash de trecho) e a nota do fechamento.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AchadosEscolhidos, ComentarioDeLinha, Estado, Nota, TipoDoComentario } from './contrato.js'

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
    montar(novo, id, { marca, texto, tipo, linhas: atual?.linhas }, em)
  }
  return novo
}

// Um comentário de uma linha do trecho. "linha" é a posição da linha no corpo do trecho (ver contrato.ts), um inteiro em texto.
export interface PedidoDeComentarioDeLinha {
  hunkId: string
  linha: string
  comentario: string                           // texto vazio apaga o comentário daquela linha
  tipoDoComentario?: TipoDoComentario          // sem ele o comentário guarda o tipo que já tinha (ou corrija, se é novo)
  segundos?: number
}

export function chaveDeLinhaValida(linha: unknown): linha is string {
  return typeof linha === 'string' && /^\d{1,6}$/.test(linha)
}

// Mexe só nos comentários de linha: a marca e o comentário geral do trecho ficam como estão.
export function aplicarComentarioDeLinha(estado: Estado, { hunkId, linha, comentario, tipoDoComentario }: PedidoDeComentarioDeLinha, em = new Date().toISOString()): Estado {
  const novo = { ...estado }
  const atual = estado[hunkId]
  const marca = atual && atual.decisao !== 'comentado' ? atual.decisao : undefined
  const linhas = { ...atual?.linhas }
  const texto = comentario.trim()
  if (!texto) delete linhas[linha]
  else {
    const tipo = tipoDoComentario ?? linhas[linha]?.tipo
    linhas[linha] = { texto, ...(tipo && { tipo }), em }
  }
  montar(novo, hunkId, { marca, texto: atual?.comentario, tipo: atual?.tipoDoComentario, linhas }, em)
  return novo
}

// A entrada do trecho existe enquanto tiver uma marca ou algum comentário (o geral ou o de uma linha); sem nada, sai do estado.
// O tipo acompanha o comentário geral: sem texto, não sobra tipo.
function montar(estado: Estado, id: string, { marca, texto, tipo, linhas }: { marca?: Estado[string]['decisao']; texto?: string; tipo?: TipoDoComentario; linhas?: Record<string, ComentarioDeLinha> }, em: string) {
  const geral = texto ? { comentario: texto, ...(tipo && { tipoDoComentario: tipo }) } : {}
  const porLinha = linhas && Object.keys(linhas).length > 0 ? { linhas } : {}
  if (marca) estado[id] = { decisao: marca, ...geral, ...porLinha, em }
  else if (texto || porLinha.linhas) estado[id] = { decisao: 'comentado', ...geral, ...porLinha, em }
  else delete estado[id]
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
