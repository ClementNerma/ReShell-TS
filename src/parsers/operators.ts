import { DoubleArithOp, DoubleComparisonOp, DoubleLogicOp, DoubleOp, SingleLogicOp, SingleOp } from '../shared/ast'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches } from './lib/conditions'
import { never } from './lib/consumeless'
import { takeWhile1 } from './lib/loops'
import { oneOf, oneOfMap } from './lib/matchers'
import { mappedCases } from './lib/switches'
import { map, silence, toOneProp } from './lib/transform'

export const _catchUnknownOperator: Parser<void> = silence(
  takeWhile1(oneOf(['+', '-', '*', '/', '%', '&', '|', '^', '!', '<', '>']))
)

export const doubleArithOp: Parser<DoubleArithOp> = map(
  combine(
    oneOfMap<DoubleArithOp>([
      ['+', 'Add'],
      ['-', 'Sub'],
      ['*', 'Mul'],
      ['/', 'Div'],
      ['%', 'Rem'],
      ['??', 'Null'],
    ]),
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleLogicOp: Parser<DoubleLogicOp> = map(
  combine(
    oneOfMap<DoubleLogicOp>([
      ['&&', 'And'],
      ['||', 'Or'],
      ['^', 'Xor'],
    ]),
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleComparisonLogicOp: Parser<DoubleComparisonOp> = map(
  combine(
    oneOfMap<DoubleComparisonOp>([
      ['==', 'Eq'],
      ['!=', 'NotEq'],
      ['>=', 'GreaterThanOrEqualTo'],
      ['<=', 'LessThanOrEqualTo'],
      ['>', 'GreaterThan'],
      ['<', 'LessThan'],
    ]),
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
  comparison: toOneProp(doubleComparisonLogicOp, 'op'),
})

export const doubleOpForAssignment: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
  comparison: never(),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap<SingleLogicOp>([['!', 'Not']]), failIfMatches(_catchUnknownOperator, 'Unknown operator')),
  ([{ parsed: sym }]) => sym
)

export const singleOp: Parser<SingleOp> = mappedCases<SingleOp>()('type', {
  logic: toOneProp(singleLogicOp, 'op'),
})
