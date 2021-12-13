import { ValueType } from '../shared/ast'
import { isLocEq } from '../shared/loc-cmp'
import { CodeSection, Token } from '../shared/parsed'
import { err, ExecValue, Runner, success } from './base'

export const getEntityInScope: Runner<Token<string>, ExecValue> = (varname, ctx) => {
  for (let s = ctx.scopes.length - 1; s >= 0; s--) {
    const value = ctx.scopes[s].entities.get(varname.parsed)
    if (value) return success(value)
  }

  return err(varname.at, 'internal error: variable was not found in scope although validated during typechecking')
}

export const getGenericInScope: Runner<{ name: Token<string>; orig: CodeSection }, ValueType> = (
  { name, orig },
  ctx
) => {
  for (let s = ctx.scopes.length - 1; s >= 0; s--) {
    const value = ctx.scopes[s].generics.find((g) => g.name === name.parsed && isLocEq(g.orig.start, orig.start))
    if (value) return success(value.resolved)
  }

  return err(name.at, 'internal error: generic was not found in scope although validated during typechecking')
}
