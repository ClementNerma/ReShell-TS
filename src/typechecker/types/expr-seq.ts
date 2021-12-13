import {
  CodeSection,
  DoubleOp,
  ExprElement,
  ExprSequenceAction,
  PropertyAccess,
  Token,
  ValueType,
} from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { err, success, Typechecker } from '../base'
import { resolveExprElementType } from './expr'
import { rebuildType } from './rebuilder'

export const resolveExprSequenceActionType: Typechecker<
  { leftExprAt: CodeSection; leftExprType: ValueType; action: ExprSequenceAction },
  ValueType
> = ({ leftExprAt, leftExprType, action }, context) =>
  matchUnion(action, 'type', {
    doubleOp: ({ op, right }) => resolveDoubleOpType({ leftExprAt, leftExprType, op, right }, context),
    propAccess: ({ right }) => resolvePropAccessType({ leftExprAt, leftExprType, right }, context),
  })

export const resolveDoubleOpType: Typechecker<
  { leftExprAt: CodeSection; leftExprType: ValueType; op: Token<DoubleOp>; right: Token<ExprElement> },
  ValueType
> = ({ leftExprAt, leftExprType, op, right }, context) => {
  let checkRightOperandType: ValueType | null
  let producedType: ValueType | ((rightType: ValueType) => ValueType)

  switch (op.parsed.type) {
    case 'arith':
      switch (op.parsed.op.parsed) {
        case 'Add':
          if (leftExprType.nullable || (leftExprType.inner.type !== 'number' && leftExprType.inner.type !== 'string')) {
            return errCannotApplyOperator(op.parsed.op, 'number | string', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break

        case 'Sub':
        case 'Mul':
        case 'Div':
        case 'Rem':
          if (leftExprType.nullable || leftExprType.inner.type !== 'number') {
            return errCannotApplyOperator(op.parsed.op, 'number', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break

        case 'Null':
          if (!leftExprType.nullable) {
            return err(op.at, {
              message: 'This operator can only be applied on nullable values',
              also: [{ at: leftExprAt, message: 'This expression is not nullable' }],
            })
          }

          checkRightOperandType = null
          producedType = (rightExprType) => ({ nullable: true, inner: rightExprType.inner })
          break
      }

      break

    case 'logic':
      switch (op.parsed.op.parsed) {
        case 'And':
        case 'Or':
        case 'Xor':
        case 'Eq':
        case 'NotEq':
          if (leftExprType.nullable || leftExprType.inner.type !== 'bool') {
            return errCannotApplyOperator(op.parsed.op, 'bool', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = leftExprType
          break

        case 'GreaterThan':
        case 'GreaterThanOrEqualTo':
        case 'LessThan':
        case 'LessThanOrEqualTo':
          if (leftExprType.nullable || leftExprType.inner.type !== 'number') {
            return errCannotApplyOperator(op.parsed.op, 'number', leftExprType, leftExprAt)
          }

          checkRightOperandType = leftExprType
          producedType = { nullable: false, inner: { type: 'bool' } }
          break
      }

      break
  }

  const rightExprType = resolveExprElementType(right, {
    scopes: context.scopes,
    expectedType: checkRightOperandType,
  })

  if (!rightExprType.ok) return rightExprType

  return success(typeof producedType === 'function' ? producedType(rightExprType.data) : rightExprType.data)
}

export const resolvePropAccessType: Typechecker<
  { leftExprAt: CodeSection; leftExprType: ValueType; right: Token<PropertyAccess> },
  ValueType
> = ({ leftExprAt, leftExprType, right }, context) => {
  throw new Error('// TODO: prop access')
}

const errCannotApplyOperator = (
  operator: Token<string>,
  expectedType: string,
  foundType: ValueType,
  leftExprAt: CodeSection
) => {
  return err(leftExprAt, {
    message: `cannot apply operator \`${operator.matched}\` on type \`${rebuildType(foundType, true)}\``,
    complements: [
      ['Expected', expectedType],
      ['Found   ', rebuildType(foundType)],
    ],
  })
}
