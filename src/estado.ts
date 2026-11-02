// O que a pessoa decidiu na página: o estado.json (decisões por hash de trecho) e a nota do fechamento.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Estado, Nota } from './contrato.js'

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
