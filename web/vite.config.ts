import { defineConfig } from 'vite'

// O worker do realce (@pierre/diffs) importa as gramáticas do Shiki sob demanda. No formato padrão dos workers (iife) o build
// não divide o código e embute todas as linguagens e temas num único arquivo de ~11 MB, que cada worker do pool teria de baixar e
// interpretar. Em módulo (es) cada linguagem continua um arquivo à parte, carregado só quando um diff a usa.
export default defineConfig({ worker: { format: 'es' } })
