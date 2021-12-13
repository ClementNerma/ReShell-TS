import { CmdArg, CodeSection, FnArg, FnType, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { err, success, Typechecker, TypecheckerResult } from '../base'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'
import { typeValidator } from './validator'
import { resolveValueType } from './value'

export const fnTypeValidator: Typechecker<FnType, void> = (fnType, ctx) => {
  let hadOptionalPos: Token<FnArg> | null = null
  const flagsLoc = new Map<string, CodeSection>()
  const positionalLoc = new Map<string, CodeSection>()

  for (const arg of fnType.args) {
    if (arg.parsed.flag !== null) {
      const name = arg.parsed.name

      const duplicate = flagsLoc.get(name.parsed)

      if (duplicate) {
        return err(name.at, {
          message: 'cannot use the same name for two different flags',
          also: [
            {
              at: duplicate,
              message: 'first usage of this name occurs here',
            },
          ],
        })
      }

      flagsLoc.set(name.parsed, name.at)
    } else {
      const name = arg.parsed.name

      const duplicate = positionalLoc.get(name.parsed)

      if (duplicate) {
        return err(arg.at, {
          message: 'cannot use the same name for two different positional arguments',
          also: [
            {
              at: duplicate,
              message: 'first usage of this name occurs here',
            },
          ],
        })
      }

      positionalLoc.set(name.parsed, name.at)

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
  }

  return typeValidator({ nullable: false, inner: { type: 'fn', fnType } }, ctx)
}

export const validateFnCallArgs: Typechecker<{ at: CodeSection; fnType: FnType; args: Token<CmdArg>[] }, void> = (
  { at, fnType, args },
  ctx
) => {
  const positional = fnType.args.filter((arg) => arg.parsed.flag === null)
  const flags = new Map(
    fnType.args.filter((arg) => arg.parsed.flag !== null).map((arg) => [arg.parsed.name.parsed, arg])
  )

  for (const arg of args) {
    const resolved: TypecheckerResult<void> = matchUnion(arg.parsed, 'type', {
      escape: () => success(void 0),

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
          return !flag.parsed.type.nullable && flag.parsed.type.inner.type === 'bool'
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

      // reference: ({ varname }) => {
      //   const relatedArg = positional.shift()
      //   if (!relatedArg) return err(varname.at, 'argument was not expected (all arguments have already been supplied)')

      //   const resolved = resolveExprType(expr, {
      //     ...ctx,
      //     typeExpectation: {
      //       type: relatedArg.parsed.type,
      //       from: relatedArg.at,
      //     },
      //   })

      //   return resolved.ok ? success(void 0) : resolved
      // },

      value: ({ value }) => {
        const relatedArg = positional.shift()
        if (!relatedArg) return err(value.at, 'argument was not expected (all arguments have already been supplied)')

        if (value.parsed.type === 'reference') {
          return err(value.at, {
            message: 'references are not allowed in command and function calls',
            complements: [
              ['Tip', `to use a variable here, wrap it inside an expression: \${${value.parsed.varname.parsed}}`],
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
    })

    if (!resolved.ok) return resolved
  }

  const lastSection = args[args.length - 1]?.at ?? at
  const lastPos = { start: lastSection.next, next: lastSection.next }

  if (positional.length > 0 && !positional[0].parsed.optional) {
    return err(
      lastPos,
      `missing required argument \`${positional[0].parsed.name.parsed}\` of type \`${rebuildType(
        positional[0].parsed.type,
        true
      )}\``
    )
  }

  const missingFlag = [...flags.values()].find((arg) => !arg.parsed.optional)

  if (missingFlag) {
    return err(
      lastPos,
      `missing required flag \`${missingFlag.parsed.name.parsed}\` of type \`${rebuildType(
        missingFlag.parsed.type,
        true
      )}\``
    )
  }

  return success(void 0)
}
