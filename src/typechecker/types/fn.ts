import { UNICODE_LETTER } from '../../parsers/lib/littles'
import { Block, ClosureBody, ClosureCallArg, CmdArg, FnCall, FnDeclArg, FnType, ValueType } from '../../shared/ast'
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
import { getContextuallyResolvedGeneric, getEntityInScope } from '../scope/search'
import { isTypeCompatible } from '../types/compat'
import { developTypeAliases } from './aliases'
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

  ctx = withFnGenericsScope(fnType.generics.concat(fnType.method?.generics ?? []), ctx)

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

export const fnTypeArgsValidator: Typechecker<Token<FnDeclArg>[], Map<string, { at: CodeSection; type: ValueType }>> = (
  fnDeclArgs,
  ctx
) => {
  let hadOptionalPos: Token<FnDeclArg> | null = null
  const args = new Map<string, { at: CodeSection; type: ValueType }>()

  for (const arg of fnDeclArgs) {
    const argType = arg.parsed.type.parsed

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

      args.set(name.parsed, { at: name.at, type: argType })
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

      args.set(name.parsed, { at: name.at, type: argType })

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

    const typeCheck = typeValidator(argType, ctx)
    if (!typeCheck.ok) return typeCheck

    if (arg.parsed.defaultValue) {
      if (!arg.parsed.optional) {
        return err(arg.parsed.defaultValue.at, {
          message: 'only optional arguments can have a default value',
          complements: [
            [
              'tip',
              `if you want to make this argument optional, add a "?" after its name: ${arg.parsed.name.parsed}?:`,
            ],
          ],
        })
      }

      const defaultValueCheck = resolveValueType(arg.parsed.defaultValue, {
        ...ctx,
        typeExpectation: { type: argType, from: arg.parsed.type.at },
      })

      if (!defaultValueCheck.ok) return defaultValueCheck
    }
  }

  return success(args)
}

export const closureCallValidator: Typechecker<
  {
    at: CodeSection
    args: Token<ClosureCallArg>[]
    restArg: Token<string> | null
    body: Token<ClosureBody>
    expected: FnType
  },
  void
> = ({ at, args, restArg, body, expected }, ctx) => {
  const candidateArgs = [...args]
  const aliasedArgs: Token<FnDeclArg>[] = []
  const scopeMapping = new Map<string, string | null>()

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
    scopeMapping.set(arg.parsed.name.parsed, c.parsed.name.parsed === '_' ? null : c.parsed.name.parsed)
  }

  if (args.length > expected.args.length) {
    return err(args[expected.args.length].at, 'too many arguments')
  }

  if (restArg && !expected.restArg) {
    return err(restArg.at, 'function was not expected to have a rest argument')
  } else if (!restArg && expected.restArg) {
    return err(at, 'function was expected to have a rest argument')
  }

  ctx.closuresArgsMapping.push({ at, data: scopeMapping })

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

export const resolveFnCallType: Typechecker<FnCall, ValueType> = (call, ctx) => {
  const name = call.name
  const entity = getEntityInScope(name, ctx)

  if (!entity.ok) {
    return err(name.at, `function \`${name.parsed}\` was not found in this scope`)
  }

  let fnType: FnType

  if (entity.data.type === 'fn') {
    fnType = entity.data.content
  } else {
    const type = developTypeAliases(entity.data.varType, ctx)
    if (!type.ok) return type

    if (type.data.type !== 'fn') {
      return err(
        name.at,
        `the name \`${name.parsed}\` refers to a non-function variable (found \`${rebuildType(type.data, {
          noDepth: true,
        })}\`)`
      )
    }

    fnType = type.data.fnType
  }

  return resolveRawFnCallType({ call, fnType }, ctx)
}

export const resolveRawFnCallType: Typechecker<{ call: FnCall; fnType: FnType }, ValueType> = (
  { call: { at, name, generics, args }, fnType },
  ctx
) => validateAndRegisterFnCall({ at, nameAt: name.at, fnType, generics, args }, ctx)

export const validateAndRegisterFnCall: Typechecker<
  {
    at: CodeSection
    nameAt: CodeSection
    fnType: FnType
    generics: Token<Token<ValueType | null>[]> | null
    args: Token<CmdArg>[]
    declaredCommand?: true
  },
  ValueType
> = ({ at, nameAt, fnType, generics, args, declaredCommand }, ctx) => {
  const gScope: GenericResolutionScope = fnType.generics.map((name) => ({
    name,
    orig: name.at,
    mapped: null,
    inFnCallAt: at.start,
  }))

  ctx.resolvedGenerics.push(...gScope)
  const max = ctx.resolvedGenerics.length
  ctx = { ...ctx, inFnCallAt: at.start }

  if (generics) {
    const suppliableGenerics = fnType.generics.filter((g) =>
      fnType.method ? !fnType.method.generics.includes(g) : true
    )

    if (generics.parsed.length < suppliableGenerics.length) {
      return err(
        generics.at,
        `some generics have not been supplied (expected ${suppliableGenerics.length}, found ${generics.parsed.length})`
      )
    }

    if (generics.parsed.length > suppliableGenerics.length) {
      return err(
        generics.at,
        `too many generics supplied (expected ${suppliableGenerics.length}, found ${generics.parsed.length})`
      )
    }

    for (let g = 0; g < generics.parsed.length; g++) {
      const supplied = generics.parsed[g].parsed
      if (!supplied) continue

      const suppliedFor = suppliableGenerics[g]

      const scoped = getContextuallyResolvedGeneric(gScope, {
        // TODO: to remake more properly (set the types during the gScope's creation)
        type: 'generic',
        name: suppliedFor,
        orig: suppliedFor.at,
        fromFnCallAt: at.start,
      })

      if (!scoped) {
        return err(generics.parsed[g].at, "internal error: generic not found in function's generics scope")
      }

      if (!scoped.mapped) {
        // TODO: ensure there are no conflicts here to detect internal errors (type collisions)
        scoped.mapped = supplied
      }
    }
  }

  if (ctx.typeExpectation && fnType.generics.length > 0) {
    // This function call is only here to populate the generics scope
    // Type incompatibility failures will be caught later on
    // If we fail on, we will get unresolved generics in the error message
    //  as some of them will only be resolved from the arguments' types
    // It would be way too complex to create a function just for generics
    //  scope populating, as there are many complex things to handle inside
    //  like nullability, type aliases, resolving other generics, etc.
    // So we simply call this function and drop its result
    isTypeCompatible(
      {
        at,
        candidate: fnType.returnType?.parsed ?? { type: 'void' },
        typeExpectation: ctx.typeExpectation,
        fillKnownGenerics: gScope,
      },
      ctx
    )
  }

  const positional = fnType.args.filter((arg) => arg.parsed.flag === null)
  const flags = new Map(
    fnType.args.filter((arg) => arg.parsed.flag !== null).map((arg) => [arg.parsed.name.parsed, arg])
  )

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
            type: resolveGenerics(relatedArg.parsed.type.parsed, ctx, max),
            from: relatedArg.at,
          },
        })

        return resolved.ok ? success([relatedArg.parsed.name.parsed, { type: 'expr', expr }]) : resolved
      },

      flag: ({ name, directValue }) => {
        const flag = flags.get(name.parsed)
        if (!flag) return err(name.at, `unknown flag \`${name.parsed}\``)

        flags.delete(name.parsed)

        if (directValue === null) {
          return !flag.parsed.optional && flag.parsed.type.parsed.type === 'bool'
            ? success([name.parsed, { type: 'true' }])
            : err(
                name.at,
                `missing value for flag \`${name.parsed}\` (expected \`${rebuildType(flag.parsed.type.parsed, {
                  noDepth: true,
                })}\`)`
              )
        }

        const resolved = resolveExprType(directValue, {
          ...ctx,
          typeExpectation: {
            type: resolveGenerics(flag.parsed.type.parsed, ctx),
            from: flag.at,
          },
        })

        return resolved.ok ? success([name.parsed, { type: 'expr', expr: directValue }]) : resolved
      },

      fnCall: ({ content }) => {
        const relatedArg = positional.shift()
        if (!relatedArg)
          return err(content.parsed.name.at, 'argument was not expected (all arguments have already been supplied)')

        const resolved = resolveFnCallType(content.parsed, {
          ...ctx,
          typeExpectation: {
            type: resolveGenerics(relatedArg.parsed.type.parsed, ctx),
            from: relatedArg.at,
          },
        })

        return resolved.ok
          ? success([relatedArg.parsed.name.parsed, { type: 'fnCall', nameForPrecomp: content.parsed.name }])
          : resolved
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
            type: resolveGenerics(relatedArg.parsed.type.parsed, ctx),
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
        positional[0].parsed.type.parsed,
        { noDepth: true }
      )}\``,
      also: [{ at: positional[0].at, message: 'argument is defined here' }],
    })
  }

  const missingFlag = [...flags.values()].find((arg) => !arg.parsed.optional && arg.parsed.type.parsed.type !== 'bool')

  if (missingFlag) {
    return err(lastPos, {
      message: `missing required flag \`${missingFlag.parsed.name.parsed}\` of type \`${rebuildType(
        missingFlag.parsed.type.parsed,
        { noDepth: true }
      )}\``,
      also: [{ at: missingFlag.at, message: 'flag is defined here' }],
    })
  }

  for (const arg of fnType.args) {
    if (!suppliedArgsScope.get(arg.parsed.name.parsed)) {
      suppliedArgsScope.set(
        arg.parsed.name.parsed,
        arg.parsed.defaultValue
          ? { type: 'value', value: arg.parsed.defaultValue }
          : arg.parsed.flag && !arg.parsed.optional && arg.parsed.type.parsed.type === 'bool'
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

  ctx.fnOrCmdCalls.push({
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
      methodTypeRef: fnType.method ? fnType.method.forType : null,
    },
  })

  const returnType: ValueType = fnType.returnType
    ? resolveGenerics(fnType.returnType.parsed, ctx, max)
    : { type: 'void' }

  if (ctx.typeExpectation) {
    const compat = isTypeCompatible(
      {
        at,
        candidate: returnType,
        typeExpectation: {
          from: ctx.typeExpectation.from,
          type: resolveGenerics(ctx.typeExpectation.type, ctx),
        },
      },
      ctx
    )

    if (!compat.ok) return compat
  }

  return success(returnType)
}

export function getFnDeclArgType(fnDeclArg: FnDeclArg): ValueType {
  return fnDeclArg.optional && fnDeclArg.defaultValue === null
    ? { type: 'nullable', inner: fnDeclArg.type.parsed }
    : fnDeclArg.type.parsed
}

export function withFnScope(fnType: FnType, ctx: TypecheckerContext): TypecheckerContext {
  return {
    ...ctx,
    scopes: ctx.scopes.concat([
      {
        generics: new Map(fnType.generics.concat(fnType.method?.generics ?? []).map((name) => [name.parsed, name.at])),
        methods: [],
        entities: new Map(
          fnType.args
            .map<[string, ScopeEntity]>((arg) => [
              arg.parsed.name.parsed,
              {
                type: 'var',
                at: arg.at,
                mutable: false,
                varType: getFnDeclArgType(arg.parsed),
              },
            ])
            .concat(
              fnType.method
                ? [
                    [
                      fnType.method.selfArg.parsed,
                      {
                        type: 'var',
                        at: fnType.method.selfArg.at,
                        mutable: false,
                        varType: fnType.method.forType.parsed,
                      },
                    ],
                  ]
                : []
            )
        ),
      },
    ]),
  }
}

export function withFnGenericsScope(generics: FnType['generics'], ctx: TypecheckerContext): TypecheckerContext {
  if (generics.length === 0) return ctx

  return {
    ...ctx,
    scopes: ctx.scopes.concat([
      { generics: new Map(generics.map((name) => [name.parsed, name.at])), methods: [], entities: new Map() },
    ]),
  }
}
