/**
 * This is only a test program, not meant for final use
 */

import chalk = require('chalk')
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { install } from 'source-map-support'
import { ExecContext, ExecError, Executed, initialExecContext } from './exec/context'
import { programExec } from './exec/program'
import { Engine } from './lib/engine/main'
import { initContext } from './parsers/context'
import { Program } from './parsers/data'
import { program } from './parsers/program'

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

const iter = argv[1] ? parseInt(argv[1]) : 1

const iterSrc = source.repeat(iter)

const engine = new Engine<Program, ExecError, Executed, ExecContext>(program, programExec, {
  loggers: {
    debug: (text) => console.debug(chalk.gray(text)),
    info: (text) => console.info(chalk.blueBright(text)),
    warn: (text) => console.warn(chalk.yellowBright(text)),
    error: (text) => console.error(chalk.redBright(text)),
    fail: (text) => {
      console.error(chalk.redBright(text))
      process.exit(1)
    },
  },

  formatters: {
    parsingError: {
      wrapper: chalk.reset,
      header: chalk.yellowBright,
      locationPointer: chalk.redBright,
      errorMessage: chalk.redBright,
      failedLine: chalk.cyanBright,
      tip: chalk.cyanBright,
    },
  },
})

const started = Date.now()
const parsed = engine.parse(iterSrc, initContext())
const elapsed = Date.now() - started

if (parsed.ok) {
  engine.execute(parsed.data, initialExecContext)
}

console.log(`Parsed (in ${iter} repeats) ${((source.length * iter) / 1024).toFixed(2)} kB in ${elapsed} ms`)
