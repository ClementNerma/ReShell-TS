import { spawnSync } from 'child_process'
import { Writable } from 'stream'
import { CmdCall } from '../shared/ast'
import { Token } from '../shared/parsed'
import { getLocatedPrecomp } from '../shared/precomp'
import { err, Runner, success } from './base'
import { escapeCmdArg, runCmdArg } from './cmdarg'
import { executeFnCall } from './fncall'

export const runCmdCall: Runner<Token<CmdCall>> = ({ at, parsed: { base, pipes /* redir */ } }, ctx) => {
  if (!base.parsed.unaliased) {
    const fnCall = getLocatedPrecomp(ctx.fnCalls, base.parsed.name.at)

    if (fnCall) {
      const exec = executeFnCall({ name: base.parsed.name, precomp: fnCall }, ctx)
      return exec.ok === true ? success(void 0) : exec
    }
  }

  const commands: [string, string[]][] = []

  for (const { parsed: sub } of [base].concat(pipes)) {
    const strArgs: string[] = []

    for (const arg of sub.args) {
      const execArg = runCmdArg(arg.parsed, ctx)
      if (execArg.ok !== true) return execArg

      strArgs.push(execArg.data)
    }

    commands.push([sub.name.parsed, strArgs])
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // HACK: This code is neither multi-platform nor properly escaping arguments
  // Find another way to perform piping as the current pseudo-TTY libs are not
  // good enough for extended usage.
  const generated = commands
    .map(([name, args]) => `${name} ${args.map((arg) => escapeCmdArg(arg)).join(' ')}`)
    .join(' | ')

  const cmd = spawnSync('sh', ['-c', generated], { stdio: ctx.pipeTo ? 'pipe' : 'inherit' })
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  if (ctx.pipeTo) {
    ctx.pipeTo.stdout.write(cmd.stdout)
    ctx.pipeTo.stderr.write(cmd.stderr)
  }

  return cmd.error
    ? err(at, 'spawn error: ' + cmd.error.message)
    : cmd.status !== null && cmd.status !== 0
    ? err(at, 'command failed with status ' + cmd.status.toString())
    : success(void 0)
}

export const collectableStream = (capture: boolean, handler: (data: Buffer) => void) =>
  new Writable({
    write(chunk, encoding, next) {
      let writable: Buffer

      if (Buffer.isBuffer(chunk)) {
        writable = chunk
      } else if (typeof chunk === 'string') {
        writable = Buffer.from(chunk, encoding)
      } else {
        throw new Error('Got non-buffer and non-string content in writable stream')
      }

      if (capture) {
        handler(writable)
      }

      next()
    },
  })
