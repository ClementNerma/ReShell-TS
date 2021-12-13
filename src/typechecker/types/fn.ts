import { ClosureArg, ClosureBody, CmdArg, FnArg, FnType, StatementChain, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import {
  ensureCoverage,
  err,
  GenericResolutionScope,
  Scope,
  ScopeEntity,
  success,
  Typechecker,
  TypecheckerResult,
} from '../base'
import { cmdArgTypechecker } from '../cmdcall'
import { getTypedEntityInScope } from '../scope/search'
import { statementChainChecker } from '../statement'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'
import { typeValidator } from './validator'
import { resolveValueType } from './value'

export const fnTypeValidator: Typechecker<FnType, void> = (fnType, ctx) => {
  for (const generic of fnType.generics) {
    const orig = getTypedEntityInScope(generic, 'generic', ctx)

    if (orig.ok) {
      return err(generic.at, {
        message: 'cannot use the same name for two generics in hierarchy',
        also: [{ at: orig.data.at, message: 'original generic is defined here' }],
      })
    }
  }

  ctx = {
    ...ctx,
    scopes: ctx.scopes.concat(
      new Map(
        fnType.generics.map((name): [string, ScopeEntity] => [name.parsed, { type: 'generic', at: name.at, name }])
      )
    ),
  }

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

  if (fnType.failureType) {
    const check = typeValidator(fnType.failureType.parsed, ctx)
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

export const closureTypeValidator: Typechecker<
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

  for (const arg of expected.args) {
    const c = candidateArgs.shift()

    if (!c) {
      return err(at, {
        message: `missing argument \`${arg.parsed.name}\``,
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
    block: ({ body }) => validateFnBody({ fnType: expected, body }, ctx),
    expr: ({ body }) => {
      if (!expected.returnType) {
        return err(body.at, 'cannot use this syntax here as the function should not return any value')
      }

      const check = resolveExprType(body, {
        ...ctx,
        scopes: ctx.scopes.concat([fnScopeCreator(expected)]),
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

export const validateFnBody: Typechecker<{ fnType: FnType; body: Token<Token<StatementChain>[]> }, void> = (
  { fnType, body },
  ctx
) => {
  const check = statementChainChecker(body.parsed, {
    ...ctx,
    scopes: ctx.scopes.concat([fnScopeCreator(fnType)]),
    fnExpectation: {
      failureType: fnType.failureType ? { type: fnType.failureType.parsed, from: fnType.failureType.at } : null,
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

export const validateFnCallArgs: Typechecker<
  { at: CodeSection; fnType: FnType; args: Token<CmdArg>[]; declaredCommand?: true },
  ValueType
> = ({ at, fnType, args, declaredCommand }, ctx) => {
  const positional = fnType.args.filter((arg) => arg.parsed.flag === null)
  const flags = new Map(
    fnType.args.filter((arg) => arg.parsed.flag !== null).map((arg) => [arg.parsed.name.parsed, arg])
  )

  const gScope: GenericResolutionScope = new Map(fnType.generics.map((generic) => [generic.parsed, null]))
  ctx = { ...ctx, resolvedGenerics: ctx.resolvedGenerics.concat(gScope) }

  let buildingRest = false

  for (const arg of args) {
    if (!buildingRest && positional.length === 0 && fnType.restArg !== null) {
      buildingRest = true
    }

    if (buildingRest) {
      const check = cmdArgTypechecker(arg, ctx)
      if (!check.ok) return check
      continue
    }

    const resolved: TypecheckerResult<void> = matchUnion(arg.parsed, 'type', {
      action: ({ name }) =>
        err(name.at, {
          message: declaredCommand
            ? 'no signature match this call'
            : 'non-quoted arguments are only allowed for commands',
          complements: [['tip', `if you want to reference a variable, wrap it like this: \${${name.parsed}}`]],
        }),

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

        return resolved.ok ? success(void 0) : resolved
      },

      flag: ({ name, directValue }) => {
        const flag = flags.get(name.parsed)
        if (!flag) return err(name.at, `unknown flag \`${name.parsed}\``)

        flags.delete(name.parsed)

        if (!directValue) {
          return flag.parsed.type.type !== 'nullable' && flag.parsed.type.type === 'bool'
            ? success(void 0)
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

        return resolved.ok ? success(void 0) : resolved
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

        return resolved.ok ? success(void 0) : resolved
      },

      rest: ({ varname }) =>
        err(varname.at, 'rest values are only allowed after all the other arguments have been supplied'),
    })

    if (!resolved.ok) return resolved
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

  for (const [generic, type] of gScope.entries()) {
    if (type === null) {
      return err(at, `failed to resolve the type of generic \`${generic}\``)
    }
  }

  if (fnType.failureType !== null) {
    if (!ctx.expectedFailureWriter) {
      return err(at, 'cannot call a failable function without try/catch')
    }

    if (ctx.expectedFailureWriter.ref === null) {
      ctx.expectedFailureWriter.ref = {
        at,
        content: resolveGenerics(fnType.failureType.parsed, ctx.resolvedGenerics.concat(gScope)),
      }
    } else {
      const compat = isTypeCompatible(
        {
          at,
          candidate: fnType.failureType.parsed,
          typeExpectation: {
            type: ctx.expectedFailureWriter.ref.content,
            from: ctx.expectedFailureWriter.ref.at,
          },
        },
        { ...ctx, typeExpectationNature: 'failure type' }
      )

      if (!compat.ok) return compat
    }
  }

  return success(
    fnType.returnType
      ? resolveGenerics(fnType.returnType.parsed, ctx.resolvedGenerics.concat(gScope))
      : { type: 'void' }
  )
}

export function fnScopeCreator(fnType: FnType): Scope {
  return new Map(
    fnType.generics
      .map((name): [string, ScopeEntity] => [name.parsed, { type: 'generic', at: name.at, name }])
      .concat(
        fnType.args.map((arg): [string, ScopeEntity] => [
          arg.parsed.name.parsed,
          {
            type: 'var',
            at: arg.at,
            mutable: false,
            varType: arg.parsed.optional ? { type: 'nullable', inner: arg.parsed.type } : arg.parsed.type,
          },
        ])
      )
  )
}

function resolveGenerics(type: ValueType, gScopes: GenericResolutionScope[]): ValueType {
  switch (type.type) {
    case 'bool':
    case 'number':
    case 'string':
    case 'path':
    case 'enum':
    case 'aliasRef': // TODO: check this
    case 'unknown':
    case 'void':
      return type

    case 'list':
      return { type: type.type, itemsType: resolveGenerics(type.itemsType, gScopes) }

    case 'map':
      return { type: type.type, itemsType: resolveGenerics(type.itemsType, gScopes) }

    case 'struct':
      return {
        type: type.type,
        members: type.members.map(({ name, type }) => ({ name, type: resolveGenerics(type, gScopes) })),
      }

    case 'fn':
      return {
        type: type.type,
        fnType: {
          generics: type.fnType.generics,
          args: type.fnType.args.map((arg) => ({
            ...arg,
            parsed: { ...arg.parsed, type: resolveGenerics(arg.parsed.type, gScopes) },
          })),
          restArg: type.fnType.restArg,
          returnType: type.fnType.returnType
            ? { ...type.fnType.returnType, parsed: resolveGenerics(type.fnType.returnType.parsed, gScopes) }
            : null,
          failureType: type.fnType.failureType
            ? { ...type.fnType.failureType, parsed: resolveGenerics(type.fnType.failureType.parsed, gScopes) }
            : null,
        },
      }

    case 'nullable':
      return { type: type.type, inner: resolveGenerics(type.inner, gScopes) }

    case 'generic':
      for (const scope of gScopes.reverse()) {
        const generic = scope.get(type.name.parsed)
        if (generic) return generic
      }

      return type

    default:
      return ensureCoverage(type)
  }
}
