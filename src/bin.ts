/**
 * This is only a test program, not meant for final use
 */

import chalk = require('chalk')
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { install } from 'source-map-support'
import { parseSource } from './lib/base'
import { initContext } from './parsers/context'
import { program } from './parsers/program'
import { ErrorParsingFormatters, formatErr } from './shared/errors'
import { programChecker } from './typechecker/program'

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

const started = Date.now()
const parsed = parseSource(iterSrc, program, initContext())
const elapsed = Date.now() - started

if (!parsed.ok) {
  console.error(
    parsed.stack.length === 0
      ? '<no error provided>'
      : formatErr(parsed.stack[0], parsed.context.source.ref, errorFormatters)
  )
  process.exit(1)
}

const infos = [
  `AST JSON weighs ${(JSON.stringify(parsed.data).length / 1024).toFixed(2)} kB`,
  `Parsed (in ${iter} repeats) ${((source.length * iter) / 1024).toFixed(2)} kB in ${elapsed} ms`,
]

if (argv[1] === '--ast') {
  console.dir(parsed.data, { depth: null })
  infos.forEach((info) => console.log(info))
  process.exit(0)
}

const startedTypechecker = Date.now()
const exec = programChecker(parsed.data, void 0)
const elapsedTypechecker = Date.now() - startedTypechecker

if (!exec.ok) {
  console.error(formatErr(exec, iterSrc, errorFormatters))
  process.exit(1)
}

console.dir(exec.data, { depth: null })

infos.forEach((info) => console.log(info))
console.log(`Executed in ${elapsedTypechecker} ms`)
