import { UNICODE_LETTER } from '../../parsers/lib/littles'
import { Block, ClosureArg, ClosureBody, CmdArg, FnArg, FnType, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { FnCallGeneric, FnCallPrecompArg } from '../../shared/precomp'
import { matchUnion } from '../../shared/utils'
import {
  err,
  GenericResolutionScope,
  ScopeEntity,
  success,
  Typechecker,
  TypecheckerContext,
  TypecheckerResult,
} from '../base'
import { blockChecker } from '../block'
import { cmdArgTypechecker } from '../cmdcall'
import { getResolvedGenericInSingleScope } from '../scope/search'
import { resolveExprType } from './expr'
import { resolveGenerics } from './generics-resolver'
import { rebuildType } from './rebuilder'
import { typeValidator } from './validator'
import { resolveValueType } from './value'

export const fnTypeValidator: Typechecker<FnType, void> = (fnType, ctx) => {
  const usedGenericNames = new Map<string, CodeSection>()

  for (const { at, parsed: name } of fnType.generics) {
    const orig = usedGenericNames.get(name)

    if (orig) {
      return err(at, {
        message: 'duplicate identifier for generic',
        also: [{ at: orig, message: 'identifier is originally used here' }],
      })
    }

    usedGenericNames.set(name, at)
  }

  ctx = withFnGenericsScope(fnType.generics, ctx)

  const args = fnTypeArgsValidator(fnType.args, ctx)

  if (!args.ok) return args

  if (fnType.restArg) {
    const duplicate = args.data.get(fnType.restArg.parsed)
    if (duplicate) {
      return err(fnType.restArg.at, {
        message: 'cannot use the same name for multiple arguments',
        also: [{ at: duplicate.at, message: 'name already used here' }],
      })
    }
  }

  if (fnType.returnType) {
    const check = typeValidator(fnType.returnType.parsed, ctx)
    if (!check.ok) return check
  }

  return success(void 0)
}

export const fnTypeArgsValidator: Typechecker<Token<FnArg>[], Map<string, { at: CodeSection; type: ValueType }>> = (
  fnArgs,
  ctx
) => {
  let hadOptionalPos: Token<FnArg> | null = null
  const args = new Map<string, { at: CodeSection; type: ValueType }>()

  for (const arg of fnArgs) {
    if (arg.parsed.flag !== null) {
      const name = arg.parsed.name

      const duplicate = args.get(name.parsed)

      if (duplicate) {
        return err(name.at, {
          message: 'cannot use the same name for two different flags',
          also: [
            {
              at: duplicate.at,
              message: 'first usage of this name occurs here',
            },
          ],
        })
      }

      args.set(name.parsed, { at: name.at, type: arg.parsed.type })
    } else {
      const name = arg.parsed.name

      const duplicate = args.get(name.parsed)

      if (duplicate) {
        return err(arg.at, {
          message: 'cannot use the same name for two different positional arguments',
          also: [
            {
              at: duplicate.at,
              message: 'first usage of this name occurs here',
            },
          ],
        })
      }

      args.set(name.parsed, { at: name.at, type: arg.parsed.type })

      if (arg.parsed.optional) {
        if (hadOptionalPos !== null) {
          return err(arg.at, {
            message: 'cannot specify a non-optional positional argument after an optional one',
            also: [
              {
                at: hadOptionalPos.at,
                message: 'first non-optional position argument was declared here',
              },
            ],
          })
        }

        hadOptionalPos = arg
      }
    }

    const typeCheck = typeValidator(arg.parsed.type, ctx)
    if (!typeCheck.ok) return typeCheck
  }

  return success(args)
}

export const closureCallValidator: Typechecker<
  {
    at: CodeSection
    args: Token<ClosureArg>[]
    restArg: Token<string> | null
    body: Token<ClosureBody>
    expected: FnType
  },
  void
> = ({ at, args, restArg, body, expected }, ctx) => {
  const candidateArgs = [...args]
  const aliasedArgs: Token<FnArg>[] = []

  for (const arg of expected.args) {
    const c = candidateArgs.shift()

    if (!c) {
      return err(at, {
        message: `missing argument \`${arg.parsed.name.parsed}\``,
        also: [{ at: arg.at, message: 'missing argument is defined here' }],
      })
    }

    if (arg.parsed.flag && c.parsed.type !== 'flag') {
      return err(at, {
        message: 'this argument should be a flag',
        also: [{ at: arg.at, message: 'flag argument is defined here' }],
      })
    }

    if (!arg.parsed.flag && c.parsed.type === 'flag') {
      return err(at, {
        message: 'this argument should not be a flag',
        also: [{ at: arg.at, message: 'argument is not defined as a flag here' }],
      })
    }

    aliasedArgs.push({ at: arg.at, matched: arg.matched, parsed: { ...arg.parsed, name: c.parsed.name } })
  }

  if (args.length > expected.args.length) {
    return err(args[expected.args.length].at, 'too many arguments')
  }

  if (restArg && !expected.restArg) {
    return err(restArg.at, 'function was not expected to have a rest argument')
  } else if (!restArg && expected.restArg) {
    return err(at, 'function was expected to have a rest argument')
  }

  return matchUnion(body.parsed, 'type', {
    block: ({ body }) => validateFnBody({ fnType: { ...expected, args: aliasedArgs }, body }, ctx),
    expr: ({ body }) => {
      if (!expected.returnType) {
        return err(body.at, 'cannot use this syntax here as the function should not return any value')
      }

      const check = resolveExprType(body, {
        ...withFnScope({ ...expected, args: aliasedArgs }, ctx),
        typeExpectation: {
          from: expected.returnType.at,
          type: expected.returnType.parsed,
        },
        restArgs: restArg ? ctx.restArgs.concat([restArg.parsed]) : ctx.restArgs,
      })

      return check.ok ? success(void 0) : check
    },
  })
}

export const validateFnBody: Typechecker<{ fnType: FnType; body: Token<Block> }, void> = ({ fnType, body }, ctx) => {
  const check = blockChecker(body.parsed, {
    ...withFnScope(fnType, ctx),
    fnExpectation: {
      returnType: fnType.returnType ? { type: fnType.returnType.parsed, from: fnType.returnType.at } : null,
    },
    restArgs: fnType.restArg ? ctx.restArgs.concat([fnType.restArg.parsed]) : ctx.restArgs,
  })

  if (!check.ok) return check

  if (fnType.returnType !== null && !check.data.neverEnds) {
    return err(body.at, 'not all code paths return a value')
  }

  return success(void 0)
}

export const validateAndRegisterFnCall: Typechecker<
  {
    at: CodeSection
    nameAt: CodeSection
    fnType: FnType
    generics: Token<Token<ValueType | null>[]> | null
    args: Token<CmdArg>[]
    declaredCommand?: true
    resolvedGenerics?: GenericResolutionScope
  },
  [ValueType, GenericResolutionScope]
> = ({ at, nameAt, fnType, generics, args, declaredCommand, resolvedGenerics }, ctx) => {
  const positional = fnType.args.filter((arg) => arg.parsed.flag === null)
  const flags = new Map(
    fnType.args.filter((arg) => arg.parsed.flag !== null).map((arg) => [arg.parsed.name.parsed, arg])
  )

  const gScope: GenericResolutionScope = fnType.generics.map((name) => ({
    name,
    orig: name.at,
    mapped: resolvedGenerics
      ? getResolvedGenericInSingleScope(resolvedGenerics, name.parsed, name.at)?.mapped ?? null
      : null,
  }))

  ctx = { ...ctx, resolvedGenerics: ctx.resolvedGenerics.concat([gScope]) }

  if (generics) {
    if (generics.parsed.length < fnType.generics.length) {
      return err(
        generics.at,
        `some generics have not been supplied (expected ${fnType.generics.length}, found ${generics.parsed.length})`
      )
    }

    if (generics.parsed.length > fnType.generics.length) {
      return err(
        generics.at,
        `too many generics supplied (expected ${fnType.generics.length}, found ${generics.parsed.length})`
      )
    }

    for (let g = 0; g < generics.parsed.length; g++) {
      const supplied = generics.parsed[g].parsed
      if (!supplied) continue

      const suppliedFor = fnType.generics[g]

      const determined = getResolvedGenericInSingleScope(gScope, suppliedFor.parsed, suppliedFor.at)

      if (determined !== undefined) {
        // TODO: ensure there are no conflicts here to detect internal errors (type collisions)
        determined.mapped = supplied
      }
    }
  }

  let isSupplyingRestArguments = false
  const suppliedRestArgument: Token<CmdArg>[] = []
  const suppliedArgsScope = new Map<string, FnCallPrecompArg>()

  for (const arg of args) {
    if (!isSupplyingRestArguments && positional.length === 0 && fnType.restArg !== null) {
      isSupplyingRestArguments = true
    }

    if (isSupplyingRestArguments) {
      const check = cmdArgTypechecker(arg, ctx)
      if (!check.ok) return check
      suppliedRestArgument.push(arg)
      continue
    }

    const resolved: TypecheckerResult<[string, FnCallPrecompArg]> = matchUnion(arg.parsed, 'type', {
      action: ({ name }) => {
        const complements: [string, string][] = []

        if (declaredCommand === undefined) {
          complements.push([
            'tip',
            'non-quoted strings are not allowed for commands without a declaration, try to quote this string instead',
          ])
        }

        if (UNICODE_LETTER.exec(name.parsed.charAt(0))) {
          complements.push(['tip', `if you want to reference a variable, wrap it like this: \${${name.parsed}}`])
        }

        return err(name.at, {
          message:
            declaredCommand === undefined
              ? 'no signature match this call (does the command have a declaration?)'
              : 'non-quoted arguments are only allowed for commands',
          complements,
        })
      },

      expr: ({ expr }) => {
        const relatedArg = positional.shift()
        if (!relatedArg) return err(expr.at, 'argument was not expected (all arguments have already been supplied)')

        const resolved = resolveExprType(expr, {
          ...ctx,
          typeExpectation: {
            type: relatedArg.parsed.type,
            from: relatedArg.at,
          },
        })

        return resolved.ok ? success([relatedArg.parsed.name.parsed, { type: 'expr', expr }]) : resolved
      },

      flag: ({ name, directValue }) => {
        const flag = flags.get(name.parsed)
        if (!flag) return err(name.at, `unknown flag \`${name.parsed}\``)

        flags.delete(name.parsed)

        if (!directValue) {
          return !flag.parsed.optional && flag.parsed.type.type === 'bool'
            ? success([name.parsed, { type: 'null' }])
            : err(
                name.at,
                `missing value for flag \`${name.parsed}\` (expected \`${rebuildType(flag.parsed.type, true)}\`)`
              )
        }

        const resolved = resolveExprType(directValue, {
          ...ctx,
          typeExpectation: {
            type: flag.parsed.type,
            from: flag.at,
          },
        })

        return resolved.ok ? success([name.parsed, { type: 'expr', expr: directValue }]) : resolved
      },

      value: ({ value }) => {
        const relatedArg = positional.shift()
        if (!relatedArg) return err(value.at, 'argument was not expected (all arguments have already been supplied)')

        if (value.parsed.type === 'reference') {
          return err(value.at, {
            message: 'references are not allowed in command and function calls',
            complements: [
              ['tip', `to use a variable here, wrap it inside an expression: \${${value.parsed.varname.parsed}}`],
            ],
          })
        }

        const resolved = resolveValueType(value, {
          ...ctx,
          typeExpectation: {
            type: relatedArg.parsed.type,
            from: relatedArg.at,
          },
        })

        return resolved.ok ? success([relatedArg.parsed.name.parsed, { type: 'value', value }]) : resolved
      },

      rest: ({ varname }) =>
        err(varname.at, 'rest values are only allowed after all the other arguments have been supplied'),
    })

    if (!resolved.ok) return resolved

    suppliedArgsScope.set(resolved.data[0], resolved.data[1])
  }

  const lastSection = args[args.length - 1]?.at ?? at
  const lastPos = { start: lastSection.next, next: lastSection.next }

  if (positional.length > 0 && !positional[0].parsed.optional) {
    return err(lastPos, {
      message: `missing required argument \`${positional[0].parsed.name.parsed}\` of type \`${rebuildType(
        positional[0].parsed.type,
        true
      )}\``,
      also: [{ at: positional[0].at, message: 'argument is defined here' }],
    })
  }

  const missingFlag = [...flags.values()].find((arg) => !arg.parsed.optional)

  if (missingFlag) {
    return err(lastPos, {
      message: `missing required flag \`${missingFlag.parsed.name.parsed}\` of type \`${rebuildType(
        missingFlag.parsed.type,
        true
      )}\``,
      also: [{ at: missingFlag.at, message: 'flag is defined here' }],
    })
  }

  for (const arg of fnType.args) {
    if (!suppliedArgsScope.get(arg.parsed.name.parsed)) {
      suppliedArgsScope.set(
        arg.parsed.name.parsed,
        arg.parsed.flag && !arg.parsed.optional && arg.parsed.type.type === 'bool'
          ? { type: 'false' }
          : { type: 'null' }
      )
    }
  }

  const resolvedGScope: FnCallGeneric[] = []

  for (const { name, orig, mapped } of gScope) {
    if (mapped === null) {
      return err(at, {
        message: `failed to determine the type of generic \`${name.parsed}\``,
        also: [{ at: name.at, message: 'generic is defined here' }],
      })
    }

    resolvedGScope.push({ name: name.parsed, orig, resolved: mapped })
  }

  ctx.fnCalls.push({
    at: nameAt,
    data: {
      generics: resolvedGScope,
      args: suppliedArgsScope,
      restArg: fnType.restArg
        ? {
            name: fnType.restArg.parsed,
            content: suppliedRestArgument,
          }
        : null,
      hasReturnType: fnType.returnType !== null,
    },
  })

  return success([
    fnType.returnType ? resolveGenerics(fnType.returnType.parsed, ctx.resolvedGenerics) : { type: 'void' },
    gScope,
  ])
}

export function withFnScope(fnType: FnType, ctx: TypecheckerContext): TypecheckerContext {
  return {
    ...ctx,
    scopes: ctx.scopes.concat([
      new Map(
        fnType.generics
          .map<[string, ScopeEntity]>((name) => [name.parsed, { type: 'generic', at: name.at, name }])
          .concat(
            fnType.args.map<[string, ScopeEntity]>((arg) => [
              arg.parsed.name.parsed,
              {
                type: 'var',
                at: arg.at,
                mutable: false,
                varType: arg.parsed.optional ? { type: 'nullable', inner: arg.parsed.type } : arg.parsed.type,
              },
            ])
          )
      ),
    ]),
  }
}

export function withFnGenericsScope(generics: FnType['generics'], ctx: TypecheckerContext): TypecheckerContext {
  if (generics.length === 0) return ctx

  return {
    ...ctx,
    scopes: ctx.scopes.concat([
      new Map(generics.map((generic): [string, ScopeEntity] => [generic.parsed, { type: 'generic', name: generic }])),
    ]),
  }
}
