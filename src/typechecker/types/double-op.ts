import { DoubleOp, ExprDoubleOp, ExprElement, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchStr } from '../../shared/utils'
import { err, success, Typechecker } from '../base'
import { isTypeCompatible } from './compat'
import { resolveExprElementType, resolveExprType } from './expr'
import { rebuildType } from './rebuilder'

export const resolveDoubleOpSequenceType: Typechecker<
  { baseElement: Token<ExprElement>; baseElementType: ValueType; seq: Token<ExprDoubleOp>[] },
  ValueType
> = ({ baseElement, baseElementType, seq }, ctx) => {
  if (seq.length === 0) return success(baseElementType)
  if (seq.length === 1) {
    return resolveDoubleOpType({ leftExprAt: baseElement.at, leftExprType: baseElementType, op: seq[0].parsed }, ctx)
  }

  const precedence = seq.map((op) => getOpPrecedence(op.parsed.op.parsed.op.parsed))

  for (let g = 4; g >= 3; g--) {
    if (precedence.find((p) => p === g)) {
      for (let i = seq.length - 1; i >= 0; i--) {
        if (precedence[i] === g) {
          const leftExprAt = {
            start: baseElement.at.start,
            next: seq[i].at.next,
          }

          const leftExprType = resolveExprType(
            {
              at: leftExprAt,
              matched: 0 /* // TODO */,
              parsed: {
                from: baseElement,
                doubleOps: seq.slice(0, i),
              },
            },
            { ...ctx, typeExpectation: null }
          )

          if (!leftExprType.ok) return leftExprType

          const rightExprAt = {
            start: seq[i].parsed.right.at.start,
            next: seq[seq.length - 1].at.next,
          }

          const op = buildExprDoubleOp(seq[i].parsed.op, rightExprAt, seq[i].parsed.right, seq.slice(i + 1))

          return resolveDoubleOpType(
            { leftExprAt, leftExprType: leftExprType.data, op },
            { ...ctx, typeExpectation: null }
          )
        }
      }
    }
  }

  let leftExprAt = baseElement.at
  let leftExprType = baseElementType

  for (let i = 0; i < seq.length; i++) {
    if (i < seq.length - 1 && precedence[i + 1] === 2) {
      const rightExprAt = {
        start: seq[i].parsed.right.at.start,
        next: seq[i + 1].parsed.right.at.next,
      }

      const op = buildExprDoubleOp(seq[i].parsed.op, rightExprAt, seq[i].parsed.right, [seq[i + 1]])

      const newLeftExprType = resolveDoubleOpType({ leftExprAt, leftExprType, op }, { ...ctx, typeExpectation: null })

      if (!newLeftExprType.ok) return newLeftExprType

      leftExprAt = rightExprAt
      leftExprType = newLeftExprType.data

      i++
      continue
    }

    const newLeftExprType = resolveDoubleOpType({ leftExprAt, leftExprType, op: seq[i].parsed }, ctx)
    if (!newLeftExprType.ok) return newLeftExprType

    leftExprAt = seq[i].parsed.right.at
    leftExprType = newLeftExprType.data
  }

  return success(leftExprType)
}

export const resolveDoubleOpType: Typechecker<
  { leftExprAt: CodeSection; leftExprType: ValueType; op: ExprDoubleOp },
  ValueType
> = ({ leftExprAt, leftExprType, op: { op, right } }, ctx) => {
  let checkRightOperandType: ValueType | null
  let producedType: ValueType | ((rightType: ValueType) => ValueType)

  switch (op.parsed.type) {
    case 'arith':
      switch (op.parsed.op.parsed) {
        case 'Add':
          if (leftExprType.type !== 'number' && leftExprType.type !== 'string') {
            return errCannotApplyOperator('number | string', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break

        case 'Sub':
        case 'Mul':
        case 'Div':
        case 'Rem':
          if (leftExprType.type !== 'number') {
            return errCannotApplyOperator('number', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break

        case 'Null':
          if (leftExprType.type !== 'nullable') {
            return err(op.at, {
              message: 'this operator can only be applied on nullable values',
              also: [{ at: leftExprAt, message: 'this expression is not nullable' }],
            })
          }

          checkRightOperandType = leftExprType
          producedType = (rightExprType) => rightExprType
          break
      }

      break

    case 'logic':
      switch (op.parsed.op.parsed) {
        case 'And':
        case 'Or':
        case 'Xor':
          if (leftExprType.type !== 'bool') {
            return errCannotApplyOperator('bool', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break
      }

      break

    case 'comparison':
      switch (op.parsed.op.parsed) {
        case 'Eq':
        case 'NotEq': {
          const type = leftExprType.type

          if (type !== 'bool' && type !== 'number' && type !== 'string' && type !== 'path') {
            return errCannotApplyOperator('number', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = { type: 'bool' }
          break
        }

        case 'GreaterThan':
        case 'GreaterThanOrEqualTo':
        case 'LessThan':
        case 'LessThanOrEqualTo':
          if (leftExprType.type !== 'number') {
            return errCannotApplyOperator('number', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = { type: 'bool' }
          break
      }

      break
  }

  const rightExprType = resolveExprElementType(right, {
    ...ctx,
    typeExpectation: { type: checkRightOperandType, from: op.at },
  })

  if (!rightExprType.ok) return rightExprType

  const resultType = typeof producedType === 'function' ? producedType(rightExprType.data) : producedType

  if (ctx.typeExpectation) {
    const compat = isTypeCompatible(
      {
        at: {
          start: leftExprAt.start,
          next: right.at.next,
        },
        candidate: resultType,
        typeExpectation: ctx.typeExpectation,
      },
      ctx
    )

    if (!compat.ok) return compat
  }

  return success(resultType)
}

const getOpPrecedence = (op: DoubleOp['op']['parsed']): 1 | 2 | 3 | 4 =>
  matchStr(op, {
    Add: () => 1,
    Sub: () => 1,
    Mul: () => 2,
    Div: () => 2,
    Rem: () => 1,
    Null: () => 2,
    And: () => 2,
    Or: () => 4,
    Xor: () => 4,
    Eq: () => 3,
    NotEq: () => 3,
    GreaterThanOrEqualTo: () => 3,
    LessThanOrEqualTo: () => 3,
    GreaterThan: () => 3,
    LessThan: () => 3,
  })

export function buildExprDoubleOp(
  doubleOp: Token<DoubleOp>,
  exprAt: CodeSection,
  element: Token<ExprElement>,
  remainingOps: Token<ExprDoubleOp>[]
): ExprDoubleOp {
  return {
    op: doubleOp,
    right: {
      at: exprAt,
      matched: 0 /* // TODO */,
      parsed: {
        content: {
          at: exprAt,
          matched: 0 /* // TODO */,
          parsed: {
            type: 'synth',
            inner: {
              at: exprAt,
              matched: 0 /* // TODO */,
              parsed: {
                from: element,
                doubleOps: remainingOps,
              },
            },
          },
        },
        propAccess: [],
      },
    },
  }
}

const errCannotApplyOperator = (expectedType: string, foundType: ValueType, leftExprAt: CodeSection) => {
  return err(leftExprAt, {
    message: `cannot apply this operator on type \`${rebuildType(foundType, true)}\``,
    complements: [
      ['expected', expectedType],
      ['found   ', rebuildType(foundType)],
    ],
  })
}
