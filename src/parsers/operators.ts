import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfMatches } from '../lib/conditions'
import { takeWhile1 } from '../lib/loops'
import { oneOf, oneOfMap } from '../lib/matchers'
import { mappedCases } from '../lib/switches'
import { map, silence, toOneProp } from '../lib/transform'
import { DoubleArithOp, DoubleLogicOp, DoubleOp, SingleLogicOp, SingleOp } from '../shared/parsed'

export const _catchUnknownOperator: Parser<void> = silence(
  takeWhile1(oneOf(['+', '-', '*', '/', '%', '&', '|', '^', '!', '<', '>']))
)

export const doubleArithOp: Parser<DoubleArithOp> = map(
  combine(
    oneOfMap([
      ['+', DoubleArithOp.Add],
      ['-', DoubleArithOp.Sub],
      ['*', DoubleArithOp.Mul],
      ['/', DoubleArithOp.Div],
      ['%', DoubleArithOp.Rem],
      ['??', DoubleArithOp.Null],
    ]),
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleLogicOp: Parser<DoubleLogicOp> = map(
  combine(
    oneOfMap([
      ['&&', DoubleLogicOp.And],
      ['||', DoubleLogicOp.Or],
      ['^', DoubleLogicOp.Xor],
      ['==', DoubleLogicOp.Eq],
      ['!=', DoubleLogicOp.NotEq],
      ['>=', DoubleLogicOp.GreaterThanOrEqualTo],
      ['<=', DoubleLogicOp.LessThanOrEqualTo],
      ['>', DoubleLogicOp.GreaterThan],
      ['<', DoubleLogicOp.LessThan],
    ]),
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap([['!', SingleLogicOp.Not]]), failIfMatches(_catchUnknownOperator, 'Unknown operator')),
  ([{ parsed: sym }]) => sym
)

export const singleOp: Parser<SingleOp> = mappedCases<SingleOp>()('type', {
  logic: toOneProp(singleLogicOp, 'op'),
})
