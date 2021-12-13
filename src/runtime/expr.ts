import {
  AssertionContent,
  CondOrTypeAssertion,
  DoubleOp,
  Expr,
  ExprDoubleOp,
  ExprElement,
  ExprElementContent,
  ExprOrNever,
} from '../shared/ast'
import { getOpPrecedence } from '../shared/constants'
import { CodeSection, Token } from '../shared/parsed'
import { matchStr, matchStrWithValues, matchUnion, matchUnionWithFallback } from '../shared/utils'
import { ensureCoverage, err, ExecValue, Runner, RunnerResult, Scope, success } from './base'
import { runValueChainings } from './chainings'
import { getEntityInScope } from './scope'
import { checkTypeCompatibilityAndClone } from './utils'
import { expectValueType, expectValueTypeIn, runValue } from './value'

export const runExpr: Runner<Expr, ExecValue> = (expr, ctx) => {
  const execFrom = runExprElement(expr.from.parsed, ctx)
  if (execFrom.ok !== true) return execFrom

  const resolved = runDoubleOpSeq({ baseElementAt: expr.from.at, baseElement: execFrom.data, seq: expr.doubleOps }, ctx)
  if (resolved.ok !== true) return resolved

  return success(resolved.data)
}

export const runDoubleOpSeq: Runner<
  { baseElementAt: CodeSection; baseElement: ExecValue; seq: Token<ExprDoubleOp>[] },
  ExecValue
> = ({ baseElementAt, baseElement, seq }, ctx) => {
  if (seq.length === 0) return success(baseElement)

  const precedence: number[] = seq.map((op) => getOpPrecedence(op.parsed.op.parsed.op.parsed))

  for (let g = 5; g >= 3; g--) {
    const i = precedence.lastIndexOf(g)
    if (i === -1) continue

    const left = runDoubleOpSeq({ baseElementAt, baseElement, seq: seq.slice(0, i) }, ctx)
    if (left.ok !== true) return left

    const rightBase = seq[i].parsed.right
    const execRightBase = runExprElement(rightBase.parsed, ctx)
    if (execRightBase.ok !== true) return execRightBase

    const right = runDoubleOpSeq(
      { baseElementAt: rightBase.at, baseElement: execRightBase.data, seq: seq.slice(i + 1) },
      ctx
    )
    if (right.ok !== true) return right

    return runDoubleOp(
      {
        leftAt: {
          start: baseElementAt.start,
          next: seq[i].at.next,
        },
        left: left.data,
        op: seq[i].parsed.op,
        rightAt: {
          start: rightBase.at.start,
          next: seq[seq.length - 1].at.next,
        },
        right: right.data,
      },
      ctx
    )
  }

  let leftAt = baseElementAt
  let left = baseElement

  for (let i = 0; i < seq.length; i++) {
    if (i < seq.length - 1 && precedence[i + 1] === 2) {
      const innerLeft = runExprElement(seq[i].parsed.right.parsed, ctx)
      if (innerLeft.ok !== true) return innerLeft

      const innerRight = runExprElement(seq[i + 1].parsed.right.parsed, ctx)
      if (innerRight.ok !== true) return innerRight

      const fullOp = runDoubleOp(
        {
          leftAt: seq[i].parsed.right.at,
          left: innerLeft.data,
          op: seq[i + 1].parsed.op,
          rightAt: seq[i + 1].parsed.right.at,
          right: innerRight.data,
        },
        ctx
      )

      if (fullOp.ok !== true) return fullOp

      return runDoubleOp(
        {
          leftAt,
          left,
          op: seq[i + 1].parsed.op,
          rightAt: {
            start: seq[i].parsed.right.at.start,
            next: seq[i + 1].parsed.right.at.next,
          },
          right: fullOp.data,
        },
        ctx
      )
    }

    const { op, right } = seq[i].parsed

    const execRight = runExprElement(right.parsed, ctx)
    if (execRight.ok !== true) return execRight

    const result: RunnerResult<ExecValue> = runDoubleOp(
      { op, leftAt, left, rightAt: right.at, right: execRight.data },
      ctx
    )

    if (result.ok !== true) return result

    left = result.data
    leftAt = right.at
  }

  return success(left)
}

export const runDoubleOp: Runner<
  { leftAt: CodeSection; left: ExecValue; op: Token<DoubleOp>; rightAt: CodeSection; right: ExecValue },
  ExecValue
> = ({ leftAt, left, op, rightAt, right }) =>
  matchUnion(op.parsed, 'type', {
    arith: ({ op }): RunnerResult<ExecValue> => {
      switch (op.parsed) {
        case 'Add':
          return matchUnionWithFallback(
            left,
            'type',
            {
              int: ({ value }) => {
                const rightInt = expectValueType(rightAt, right, 'int')
                return rightInt.ok === true ? success({ type: 'int', value: value + rightInt.data.value }) : rightInt
              },

              float: ({ value }) => {
                const rightFloat = expectValueType(rightAt, right, 'float')
                return rightFloat.ok === true
                  ? success({ type: 'float', value: value + rightFloat.data.value })
                  : rightFloat
              },

              string: ({ value }) => {
                const rightString = expectValueType(rightAt, right, 'string')
                return rightString.ok === true
                  ? success({ type: 'string', value: value + rightString.data.value })
                  : rightString
              },
            },
            () => err(leftAt, `internal error: cannot apply this operator on internal type "${left.type}"`)
          )

        case 'Sub':
        case 'Mul':
        case 'Div':
        case 'Rem': {
          const leftNumber = expectValueTypeIn(leftAt, left, ['int', 'float'])
          if (leftNumber.ok !== true) return leftNumber

          const rightNumber = expectValueType(rightAt, right, leftNumber.data.type)
          if (rightNumber.ok !== true) return rightNumber

          const out: RunnerResult<number> = matchStr(op.parsed, {
            Sub: () => success(leftNumber.data.value - rightNumber.data.value),
            Mul: () => success(leftNumber.data.value * rightNumber.data.value),
            Div: () => {
              if (rightNumber.data.value === 0) {
                return err({ start: leftAt.start, next: rightAt.next }, 'attempted to divide by zero')
              }

              return success(leftNumber.data.value / rightNumber.data.value)
            },
            Rem: () => success(leftNumber.data.value % rightNumber.data.value),
          })

          return out.ok === true
            ? success({
                type: matchStrWithValues(op.parsed, {
                  Sub: leftNumber.data.type,
                  Div: 'float',
                  Mul: leftNumber.data.type,
                  Rem: leftNumber.data.type,
                }),
                value: out.data,
              })
            : out
        }

        case 'Null':
          return success(left.type === 'null' ? right : left)

        default:
          return ensureCoverage(op.parsed)
      }
    },

    logic: ({ op }) => {
      const leftBool = expectValueType(leftAt, left, 'bool')
      if (leftBool.ok !== true) return leftBool

      const rightBool = expectValueType(rightAt, right, 'bool')
      if (rightBool.ok !== true) return rightBool

      const comp = matchStr(op.parsed, {
        And: () => leftBool.data.value === rightBool.data.value,
        Or: () => leftBool.data.value || rightBool.data.value,
        Xor: () => (leftBool.data.value ? !rightBool.data.value : rightBool.data.value),
      })

      return success({ type: 'bool', value: comp })
    },

    comparison: ({ op }) => {
      switch (op.parsed) {
        case 'Eq':
        case 'NotEq': {
          const comp: RunnerResult<boolean> = matchUnionWithFallback(
            left,
            'type',
            {
              bool: ({ value }) => {
                const rightBool = expectValueType(rightAt, right, 'bool')
                return rightBool.ok === true ? success(value === rightBool.data.value) : rightBool
              },
              int: ({ value }) => {
                const rightNumber = expectValueType(rightAt, right, 'int')
                return rightNumber.ok === true ? success(value === rightNumber.data.value) : rightNumber
              },
              float: ({ value }) => {
                const rightNumber = expectValueType(rightAt, right, 'float')
                return rightNumber.ok === true ? success(value === rightNumber.data.value) : rightNumber
              },
              string: ({ value }) => {
                const rightString = expectValueType(rightAt, right, 'string')
                return rightString.ok === true ? success(value === rightString.data.value) : rightString
              },
              path: ({ segments }) => {
                const rightSegments = expectValueType(rightAt, right, 'path')
                return rightSegments.ok === true
                  ? success(segments.join('/') === rightSegments.data.segments.join('/'))
                  : rightSegments
              },
              enum: ({ variant }) => {
                const rightEnum = expectValueType(rightAt, right, 'enum')
                return rightEnum.ok === true ? success(variant === rightEnum.data.variant) : rightEnum
              },
            },
            () => err(op.at, `internal error: cannot apply this operator on internal type "${left.type}"`)
          )

          return comp.ok === true
            ? success({ type: 'bool', value: op.parsed === 'NotEq' ? !comp.data : comp.data })
            : comp
        }

        case 'GreaterThan':
        case 'GreaterThanOrEqualTo':
        case 'LessThan':
        case 'LessThanOrEqualTo': {
          const leftNumber = expectValueTypeIn(leftAt, left, ['int', 'float'])
          if (leftNumber.ok !== true) return leftNumber

          const rightNumber = expectValueType(rightAt, right, leftNumber.data.type)
          if (rightNumber.ok !== true) return rightNumber

          const comp = matchStr(op.parsed, {
            GreaterThan: () => leftNumber.data.value > rightNumber.data.value,
            GreaterThanOrEqualTo: () => leftNumber.data.value >= rightNumber.data.value,
            LessThan: () => leftNumber.data.value < rightNumber.data.value,
            LessThanOrEqualTo: () => leftNumber.data.value <= rightNumber.data.value,
          })

          return success({ type: 'bool', value: comp })
        }

        default:
          return ensureCoverage(op.parsed)
      }
    },
  })

export const runExprElement: Runner<ExprElement, ExecValue> = (element, ctx) => {
  const content = runExprElementContent(element.content.parsed, ctx)
  if (content.ok !== true) return content

  return runValueChainings({ value: content.data, chainings: element.chainings }, ctx)
}

export const runExprElementContent: Runner<ExprElementContent, ExecValue> = (content, ctx) =>
  matchUnion(content, 'type', {
    synth: ({ inner }) => runExpr(inner.parsed, ctx),
    paren: ({ inner }) => runExpr(inner.parsed, ctx),
    value: ({ content }) => runValue(content, ctx),

    ternary: ({ cond, then, elif, els }) => {
      const result = runCondOrTypeAssertion(cond.parsed, ctx)
      if (result.ok !== true) return result

      const check = expectValueType(cond.at, result.data.result, 'bool')
      if (check.ok !== true) return check
      if (check.data.value)
        return runExprOrNever(
          then.parsed,
          result.data.type === 'assertion'
            ? { ...ctx, scopes: ctx.scopes.concat([result.data.normalAssertionScope]) }
            : ctx
        )

      for (const { cond, expr } of elif) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const check = expectValueType(cond.at, result.data.result, 'bool')
        if (check.ok !== true) return check
        if (check.data.value)
          return runExprOrNever(
            expr.parsed,
            result.data.type === 'assertion'
              ? { ...ctx, scopes: ctx.scopes.concat([result.data.normalAssertionScope]) }
              : ctx
          )
      }

      return runExprOrNever(
        els.parsed,
        result.data.type === 'assertion'
          ? { ...ctx, scopes: ctx.scopes.concat([result.data.oppositeAssertionScope]) }
          : ctx
      )
    },

    singleOp: ({ op, right }) => {
      const execRight = runExprElementContent(right.parsed, ctx)
      if (execRight.ok !== true) return execRight

      return matchUnion(op.parsed, 'type', {
        logic: ({ op }) =>
          matchStr(op.parsed, {
            Not: () => {
              const operand = expectValueType(right.at, execRight.data, 'bool')
              if (operand.ok !== true) return operand

              return success({ type: 'bool', value: !operand.data.value })
            },
          }),
      })
    },
  })

export const runCondOrTypeAssertion: Runner<
  CondOrTypeAssertion,
  | { type: 'expr'; result: ExecValue }
  | { type: 'assertion'; result: ExecValue; normalAssertionScope: Scope; oppositeAssertionScope: Scope }
> = (cond, ctx) =>
  matchUnion(cond, 'type', {
    directAssertion: ({ varname, assertion }) => {
      const target = getEntityInScope(varname, ctx)
      if (target.ok !== true) return target

      const result = runTypeAssertion({ assertion, value: target.data, alias: varname }, ctx)
      if (result.ok !== true) return result

      return success({
        type: 'assertion',
        result: { type: 'bool', value: result.data.result },
        normalAssertionScope: result.data.normalAssertionScope,
        oppositeAssertionScope: result.data.oppositeAssertionScope,
      })
    },

    aliasedAssertion: ({ subject, alias, assertion }) => {
      const target = runExpr(subject.parsed, ctx)
      if (target.ok !== true) return target

      const result = runTypeAssertion({ assertion, value: target.data, alias }, ctx)
      if (result.ok !== true) return result

      return success({
        type: 'assertion',
        result: { type: 'bool', value: result.data.result },
        normalAssertionScope: result.data.normalAssertionScope,
        oppositeAssertionScope: result.data.oppositeAssertionScope,
      })
    },

    expr: ({ inner }) => {
      const execExpr = runExpr(inner.parsed, ctx)
      return execExpr.ok === true ? success({ type: 'expr', result: execExpr.data }) : execExpr
    },
  })

export const runTypeAssertion: Runner<
  { assertion: AssertionContent; value: ExecValue; alias: Token<string> },
  { result: boolean; normalAssertionScope: Scope; oppositeAssertionScope: Scope }
> = ({ assertion, value, alias }, ctx) => {
  const normalScope: Scope['entities'] = new Map()
  const oppositeScope: Scope['entities'] = new Map()

  const result: RunnerResult<boolean> = matchUnion(assertion.minimum.parsed, 'against', {
    null: () => {
      if (value.type === 'null') {
        normalScope.set(alias.parsed, value)
        oppositeScope.set(alias.parsed, value)
        return success(true)
      } else {
        normalScope.set(alias.parsed, value)
        oppositeScope.set(alias.parsed, value)
        return success(false)
      }
    },

    ok: () => {
      if (value.type !== 'failable') {
        return err(
          alias.at,
          `internal error: expected a failable value for this type assertion, found internal type "${value.type}"`
        )
      }

      const targetScope = value.success ? normalScope : oppositeScope
      targetScope.set(alias.parsed, value.value)
      return success(value.success)
    },

    err: () => {
      if (value.type !== 'failable') {
        return err(
          alias.at,
          `internal error: expected a failable value for this type assertion, found internal type "${value.type}"`
        )
      }

      const targetScope = value.success ? oppositeScope : normalScope
      targetScope.set(alias.parsed, value.value)
      return success(!value.success)
    },

    custom: ({ type }) => {
      const cloned = checkTypeCompatibilityAndClone(assertion.minimum.at, value, type.parsed, ctx)
      if (cloned.ok !== true) return cloned
      if (cloned.data === false) return success(false)

      normalScope.set(alias.parsed, cloned.data)

      return success(true)
    },
  })

  if (result.ok !== true) return result

  return success({
    normalAssertionScope: assertion.inverted
      ? { generics: [], functions: [], entities: oppositeScope }
      : { generics: [], functions: [], entities: normalScope },
    oppositeAssertionScope: assertion.inverted
      ? { generics: [], functions: [], entities: normalScope }
      : { generics: [], functions: [], entities: oppositeScope },
    result: assertion.inverted ? !result.data : result.data,
  })
}

export const runExprOrNever: Runner<ExprOrNever, ExecValue> = (expr, ctx) =>
  matchUnion(expr, 'type', {
    expr: ({ content }) => runExpr(content.parsed, ctx),

    panic: ({ message }) => {
      const expr = runExpr(message.parsed, ctx)
      if (expr.ok !== true) return expr

      const messageStr = expectValueType(message.at, expr.data, 'string')
      if (messageStr.ok !== true) return messageStr

      return err(message.at, `Panicked: ${messageStr.data.value}`)
    },

    return: ({ expr }) => {
      if (!expr) return { ok: null, breaking: 'return', value: null }

      const evalRetExpr = runExpr(expr.parsed, ctx)
      if (evalRetExpr.ok !== true) return evalRetExpr

      return { ok: null, breaking: 'return', value: evalRetExpr.data }
    },
  })
