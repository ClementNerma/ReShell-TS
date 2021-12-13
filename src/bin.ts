/**
 * This is only a test program, not meant for final use
 */

import chalk = require('chalk')
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { install } from 'source-map-support'
import { deflateSync, inflateSync } from 'zlib'
import { initContext } from './parsers/context'
import { parseSource } from './parsers/lib/base'
import { StrView } from './parsers/lib/strview'
import { program } from './parsers/program'
import { ErrorParsingFormatters, formatErr } from './shared/errors'
import { typecheckProgram } from './typechecker/program'

install()
Error.stackTraceLimit = Infinity

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const argv = process.argv.slice(2)

if (!argv[0]) fail('Please provide an example name')
if (!argv[0].match(/^([a-zA-Z0-9_]+)/)) fail('Invalid example name provided')

const path = join(__dirname, '..', 'examples', argv[0] + '.rsh')

if (!existsSync(path)) fail('Example not found')

const source = readFileSync(path, 'utf-8')

const iter = argv[1] && argv[1].match(/^\d+$/) ? parseInt(argv[1]) : 1

const iterSrc = iter > 1 ? `if true { ${source} }\n`.repeat(iter) : source

const errorFormatters: ErrorParsingFormatters = {
  header: chalk.yellowBright,
  location: chalk.cyanBright,
  gutter: chalk.cyanBright,
  locationPointer: chalk.redBright,
  errorMessage: chalk.redBright,
  complement: chalk.cyanBright,
}

const kb = (bytes: number) => (bytes / 1024).toFixed(2).padStart(8, ' ') + ' kB'
const ms = (ms: number) => ms.toString().padStart(5, ' ') + ' ms'

const measurePerf = <T>(runner: () => T): [number, T] => {
  const started = Date.now()
  const out = runner()
  const elapsed = Date.now() - started
  return [elapsed, out]
}

const [parsedDuration, parsed] = measurePerf(() => parseSource(StrView.create(iterSrc), program, initContext()))

if (!parsed.ok) {
  console.error(
    parsed.stack.length === 0
      ? '<no error provided>'
      : formatErr(parsed.stack[0].content, parsed.context.source.toFullStringSlow(), errorFormatters)
  )
  process.exit(1)
}

const [jsonStrDuration, jsonStr] = measurePerf(() => JSON.stringify(parsed.data))

const [compress1Duration, compressed1] = measurePerf(() => deflateSync(jsonStr, { level: 1 }))
const [decompress1Duration, decompressed1] = measurePerf(() => inflateSync(compressed1))

const [compress9Duration, compressed9] = measurePerf(() => deflateSync(jsonStr, { level: 9 }))
const [decompress9Duration, decompressed9] = measurePerf(() => inflateSync(compressed9))

if (decompressed1.toString('utf-8') !== jsonStr || decompressed9.toString('utf-8') !== jsonStr) {
  fail('Decompressed data is not the same as the source!')
}

const [parseDuration, reparsed] = measurePerf(() => JSON.parse(jsonStr))

if (JSON.stringify(reparsed) !== jsonStr) {
  fail('Reparsed data is not the same as the source!')
}

const infos = [
  `Parsed              | ${ms(parsedDuration)} | ${kb(source.length * iter)}`,
  `Minimified AST JSON | ${ms(jsonStrDuration)} | ${kb(JSON.stringify(parsed.data).length)}`,
  `Compressed (min)    | ${ms(compress1Duration)} | ${kb(compressed1.byteLength)}`,
  `Decompressed (min)  | ${ms(decompress1Duration)} |`,
  `Compressed (max)    | ${ms(compress9Duration)} | ${kb(compressed9.byteLength)}`,
  `Decompressed (max)  | ${ms(decompress9Duration)} |`,
  `JSON AST parsing    | ${ms(parseDuration)} |`,
]

if (argv.includes('--ast-perf')) {
  infos.forEach((info) => console.log(info))
  process.exit(0)
}

if (argv.includes('--ast')) {
  console.dir(parsed.data, { depth: null })
  infos.forEach((info) => console.log(info))
  process.exit(0)
}

const [typecheckerDuration, typechecked] = measurePerf(() => typecheckProgram(parsed.data))

if (!typechecked.ok) {
  console.error(formatErr(typechecked, iterSrc, errorFormatters))
  process.exit(1)
}

console.dir(typechecked.data, { depth: null })

infos.forEach((info) => console.log(info))
console.log(`Typechecked         | ${ms(typecheckerDuration)} |`)
