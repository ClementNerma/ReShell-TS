import { CmdArg, CmdCall, CmdDeclSubCommand, CmdVariantSignature, ValueType } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, success, Typechecker, TypecheckerResult } from './base'
import { getFunctionInScope } from './scope/search'
import { resolveExprType } from './types/expr'
import { validateFnCallArgs } from './types/fn'
import { rebuildType } from './types/rebuilder'
import { resolveValueType } from './types/value'

export const cmdCallTypechecker: Typechecker<CmdCall, void> = ({ unaliased, name, args }, ctx) => {
  const fn = getFunctionInScope(name, ctx)

  if (fn.ok && !unaliased) {
    return validateFnCallArgs({ at: name.at, args, fnType: fn.data.content }, ctx)
  } else {
    const decl = ctx.commandDeclarations.get(name.parsed)

    if (decl) {
      return cmdDeclSubCmdCallTypechecker({ at: name.at, subCmd: decl.content, args }, ctx)
    }

    if (!ctx.checkIfCommandExists(name.parsed)) {
      return err(name.at, 'this command was not found in PATH')
    }

    for (const arg of args) {
      const check = cmdArgTypechecker(arg, ctx)
      if (!check.ok) return check
    }

    return success(void 0)
  }
}

export const cmdDeclSubCmdCallTypechecker: Typechecker<
  { at: CodeSection; subCmd: CmdDeclSubCommand; args: Token<CmdArg>[] },
  void
> = ({ at, subCmd, args }, ctx) => {
  if (args.length > 0) {
    const remaining = args.slice(1)

    for (const variant of subCmd.variants) {
      for (const candidate of variant.parsed.argCandidates) {
        const candidateMatches: boolean = matchUnion(args[0].parsed, 'type', {
          action: ({ name }) => name.parsed === candidate.parsed,
          flag: ({ name, short, directValue }) =>
            !directValue && (short.parsed ? '-' : '--') + name.parsed === candidate.parsed,
          expr: () => false,
          value: () => false,
          rest: () => false,
        })

        if (candidateMatches) {
          return cmdSignatureCallValidator(
            {
              at: {
                start: remaining.length > 0 ? remaining[0].at.start : args[0].at.start,
                next: remaining.length > 0 ? remaining[remaining.length - 1].at.next : args[0].at.next,
              },
              signature: variant.parsed.signature,
              callArgs: remaining,
            },
            ctx
          )
        }
      }
    }
  }

  if (subCmd.base) {
    return cmdSignatureCallValidator(
      {
        at: {
          start: args.length > 0 ? args[0].at.start : at.next,
          next: args.length > 0 ? args[args.length - 1].at.next : at.next,
        },
        signature: subCmd.base.parsed.signature,
        callArgs: args,
      },
      ctx
    )
  }

  return err(
    { start: at.next, next: at.next },
    {
      message: 'please provide an action',
      complements: [
        [
          'available',
          subCmd.variants
            .map((variant) => variant.parsed.argCandidates.map((candidate) => candidate.parsed))
            .flat()
            .join(' | '),
        ],
      ],
    }
  )
}

export const cmdSignatureCallValidator: Typechecker<
  { at: CodeSection; signature: CmdVariantSignature; callArgs: Token<CmdArg>[] },
  void
> = ({ at, signature, callArgs }, ctx) =>
  matchUnion(signature, 'type', {
    subCmd: ({ content }) => cmdDeclSubCmdCallTypechecker({ at, subCmd: content, args: callArgs }, ctx),
    direct: ({ args, rest }) =>
      validateFnCallArgs(
        {
          at,
          args: callArgs,
          fnType: {
            args,
            restArg: rest,
            returnType: null,
            failureType: null,
          },
          declaredCommand: true,
        },
        ctx
      ),
  })

export const cmdArgTypechecker: Typechecker<Token<CmdArg>, void> = (arg, ctx) =>
  matchUnion(arg.parsed, 'type', {
    action: ({ name }) =>
      err(name.at, {
        message: 'non-quoted arguments are only allowed for declared commands',
        complements: [
          [
            'details',
            'commands that are not declared beforehand with a @command directive cannot use unquoted arguments',
          ],
          ['tip', 'you may want to use double quotes (") to wrap the argument here'],
        ],
      }),

    expr: ({ expr }) => {
      const resolved = resolveExprType(expr, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(expr.at, resolved.data) : resolved
    },

    flag: ({ directValue }) => {
      if (directValue === null) return success(void 0)
      const resolved = resolveExprType(directValue, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(directValue.at, resolved.data) : resolved
    },

    value: ({ value }) => {
      const resolved = resolveValueType(value, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(value.at, resolved.data) : resolved
    },

    rest: ({ varname }) =>
      ctx.restArgs.includes(varname.parsed)
        ? success(void 0)
        : err(varname.at, `rest argument \`${varname.parsed}\` was not found`),
  })

function cmdArgExprTypeValidator(at: CodeSection, type: ValueType): TypecheckerResult<void> {
  if (type.type !== 'string' && type.type !== 'number' && type.type !== 'path') {
    return err(
      at,
      `command arguments can only be of type \`string\`, \`number\` or \`path\`, found \`${rebuildType(type, true)}\``
    )
  }

  return success(void 0)
}
