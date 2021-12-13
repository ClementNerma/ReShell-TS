import { ValueType } from '../shared/ast'
import { isLocEq } from '../shared/loc-cmp'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, RunnerContext, RunnerResult, success } from './base'

export function checkTypeCompatibilityAndClone(
  at: CodeSection,
  value: ExecValue,
  type: ValueType,
  ctx: RunnerContext
): RunnerResult<false | ExecValue> {
  return matchUnion(type, 'type', {
    bool: () => success(value.type === 'bool' ? value : false),
    number: () => success(value.type === 'number' ? value : false),
    string: () => success(value.type === 'string' ? value : false),
    path: () => success(value.type === 'path' ? value : false),

    list: ({ itemsType }) => {
      if (value.type !== 'list') return success(false)

      const out: ExecValue[] = []

      for (const item of value.items) {
        const check = checkTypeCompatibilityAndClone(at, item, itemsType, ctx)
        if (check.ok !== true) return check
        if (check.data === false) return success(false)

        out.push(check.data)
      }

      return success({ type: 'list', items: out })
    },

    map: ({ itemsType }) => {
      if (value.type !== 'map') return success(false)

      const out = new Map<string, ExecValue>()

      for (const [name, entry] of value.entries) {
        const check = checkTypeCompatibilityAndClone(at, entry, itemsType, ctx)
        if (check.ok !== true) return check
        if (check.data === false) return success(false)

        out.set(name, check.data)
      }

      return success({ type: 'map', entries: out })
    },

    struct: ({ members }) => {
      if (value.type !== 'struct') return success(false)

      const out = new Map<string, ExecValue>()

      for (const { name, type } of members) {
        const member = value.members.get(name)
        if (member === undefined) return success(false)

        const check = checkTypeCompatibilityAndClone(at, member, type, ctx)
        if (check.ok !== true) return check
        if (check.data === false) return success(false)

        out.set(name, check.data)
      }

      return success({ type: 'struct', members: out })
    },

    enum: ({ variants }) =>
      success(
        value.type === 'enum' && variants.map((variant) => variant.parsed).includes(value.variant) ? value : false
      ),

    fn: (/*{ fnType }*/) => err(at, 'internal error: function type assertion'),

    aliasRef: ({ typeAliasName }) => {
      const typeAlias = ctx.typeAliases.get(typeAliasName.parsed)

      return typeAlias !== undefined
        ? checkTypeCompatibilityAndClone(at, value, typeAlias.content, ctx)
        : err(typeAliasName.at, 'internal error: type alias was not found')
    },

    nullable: ({ inner }) =>
      value.type === 'null' ? success({ type: 'null' }) : checkTypeCompatibilityAndClone(at, value, inner, ctx),

    failable: () => success(value.type === 'failable' ? value : false),

    unknown: () => success(value),

    void: () => err(at, 'internal error: found "void" type in type assertion'),

    generic: ({ name, orig }) => {
      for (const scope of ctx.scopes.reverse()) {
        const generic = scope.generics.find((g) => g.name === name.parsed && isLocEq(g.orig.start, orig.start))

        if (generic !== undefined) {
          return checkTypeCompatibilityAndClone(at, value, generic.resolved, ctx)
        }
      }

      return err(name.at, 'internal error: generic was not found')
    },
  })
}
