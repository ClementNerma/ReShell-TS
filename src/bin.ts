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

const iter = argv[1] && argv[1] !== '--ast' ? parseInt(argv[1]) : 1

const iterSrc = source.repeat(iter)

const errorFormatters: ErrorParsingFormatters = {
  header: chalk.yellowBright,
  location: chalk.cyanBright,
  gutter: chalk.cyanBright,
  locationPointer: chalk.redBright,
  errorMessage: chalk.redBright,
  complement: chalk.cyanBright,
}

const kb = (bytes: number) => (bytes / 1024).toFixed(2)

const measurePerf = <T>(runner: () => T): [number, T] => {
  const started = Date.now()
  const out = runner()
  const elapsed = Date.now() - started
  return [elapsed, out]
}

const [parsedDuration, parsed] = measurePerf(() => parseSource(iterSrc, program, initContext()))

if (!parsed.ok) {
  console.error(
    parsed.stack.length === 0
      ? '<no error provided>'
      : formatErr(parsed.stack[0], parsed.context.source.ref, errorFormatters)
  )
  process.exit(1)
}

const jsonStr = JSON.stringify(parsed.data)

const [compressDuration, compressed] = measurePerf(() => deflateSync(jsonStr, { level: 9 }))
const [decompressDuration, decompressed] = measurePerf(() => inflateSync(compressed))

if (decompressed.toString('utf-8') !== jsonStr) {
  fail('Decompressed data is not the same as the source!')
}

const infos = [
  `Parsed (in ${iter} repeats) ${kb(source.length * iter)} kB in ${parsedDuration} ms`,
  `Full AST JSON weights ${kb(JSON.stringify(parsed.data, null, 4).length)} kB`,
  `Minimified AST JSON to ${kb(JSON.stringify(parsed.data).length)} kB`,
  `Compressed (max) to ${kb(compressed.byteLength)} kB in ${compressDuration} ms`,
  `Decompressed (max) in ${decompressDuration} ms`,
]

if (argv[1] === '--ast' || argv[2] === '--ast') {
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
console.log(`Typechecked in ${typecheckerDuration} ms`)
