import { Expr, ExprElement, SingleLogicOp, Value, ValueType } from '../parsers/data'
import { ensureCoverage, err, success, Typechecker, TypecheckerResult } from './base'
import { Scope } from './scope/complete'
import { getFunctionInScope, getVariableInScope } from './scope/search'

export type ScopedExprType = ValueType

export const resolveExprType: Typechecker<Expr, Scope[], ScopedExprType> = (expr, scopes) => {
  const from = resolveExprElementType(expr.parsed.from, scopes)
  if (!from.ok) return from

  for (const action of expr.parsed.sequence) {
    throw new Error('// TODO: Expr sequence')
  }

  return from
}

export const resolveExprElementType: Typechecker<ExprElement, Scope[], ScopedExprType> = (element, scopes) => {
  switch (element.parsed.type) {
    case 'assertion':
      throw new Error('// TODO: type assertions')

    case 'paren':
      return resolveExprType(element.parsed.inner, scopes)

    case 'singleOp':
      const rightType = resolveExprElementType(element.parsed.right, scopes)
      if (!rightType.ok) return rightType

      const opType = element.parsed.op.parsed.op.parsed

      switch (opType) {
        case SingleLogicOp.Not:
          if (rightType.data.nullable) return err('Cannot apply negative operator to nullable value', element.start)
          if (rightType.data.inner.type !== 'bool')
            return err(
              `Cannot apply negative operator on non-boolean values (found type category: ${rightType.data.inner.type})`,
              element.start
            )

          return success({ nullable: false, inner: { type: 'bool' } })

        default:
          return ensureCoverage(opType)
      }

    case 'ternary':
      // TODO: check that <cond> is a bool, check that all <then> / <elif> / <else> have the same value
      throw new Error('// TODO: ternary expressions')

    case 'try':
      // TODO: check that the <try> and <catch> body have the same type
      throw new Error('// TODO: inline try/catch expressions')

    case 'value':
      return valueType(element.parsed.content, scopes)
  }
}

export const valueType: Typechecker<Value, Scope[], ScopedExprType> = (
  value,
  scopes
): TypecheckerResult<ScopedExprType> => {
  switch (value.parsed.type) {
    case 'null':
      return success({ nullable: true, inner: { type: 'void' } })

    case 'bool':
      return success({ nullable: false, inner: { type: 'bool' } })

    case 'number':
      return success({ nullable: false, inner: { type: 'number' } })

    case 'string':
      return success({ nullable: false, inner: { type: 'string' } })

    case 'path':
      return success({ nullable: false, inner: { type: 'path' } })

    case 'computedString':
      for (const segment of value.parsed.segments) {
        switch (segment.parsed.type) {
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, scopes)
            if (!exprType.ok) return exprType
            if (!isStringifyableType(exprType.data))
              return err('Expression cannot be converted implicitly to a string', segment.start)
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success({ nullable: false, inner: { type: 'string' } })

    case 'computedPath':
      for (const segment of value.parsed.segments) {
        switch (segment.parsed.type) {
          case 'separator':
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, scopes)
            if (!exprType.ok) return exprType
            if (!isTypeConvertibleToPath(exprType.data))
              return err('Expression cannot be converted implicitly to a path', segment.start)
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success({ nullable: false, inner: { type: 'string' } })

    case 'list':
      throw new Error('// TODO: values => list')

    case 'map':
      throw new Error('// TODO: values => map')

    case 'struct':
      throw new Error('// TODO: values => struct')

    case 'closure':
      throw new Error('// TODO: values => closure')

    case 'fnCall':
      throw new Error('// TODO: values => fnCall')

    case 'inlineCmdCallSequence':
      throw new Error('// TODO: values => inlineCmdCallSequence')

    case 'reference':
      const varname = value.parsed.varname.parsed

      const referencedVar = getVariableInScope([varname, value.parsed.varname.start], scopes)
      const referencedFn = getFunctionInScope([varname, value.parsed.varname.start], scopes)

      if (referencedVar.ok) {
        return success(referencedVar.data.data.type)
      } else if (referencedFn.ok) {
        return success({ nullable: false, inner: { type: 'fn', fnType: referencedFn.data.data } })
      } else {
        return err(`Referenced variable "${varname}" was not found in this scope`, value.start)
      }

    default:
      return ensureCoverage(value.parsed)
  }
}

export const isStringifyableType = ({ nullable, inner: { type: typeType } }: ValueType) =>
  !nullable && (typeType === 'number' || typeType === 'string')

export const isTypeConvertibleToPath = ({ nullable, inner: { type: typeType } }: ValueType) =>
  !nullable && (typeType === 'number' || typeType === 'string' || typeType === 'path')
