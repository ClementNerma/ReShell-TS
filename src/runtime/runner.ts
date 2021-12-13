import {
  Block,
  CondOrTypeAssertion,
  DoubleOp,
  Expr,
  ExprDoubleOp,
  ExprElement,
  ExprElementContent,
  ExprOrNever,
  NonNullablePropertyAccess,
  Program,
  Statement,
  Value,
} from '../shared/ast'
import { getOpPrecedence } from '../shared/constants'
import { Diagnostic } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { matchStr, matchUnion, matchUnionWithFallback } from '../shared/utils'
import { ensureCoverage, err, ExecValue, Runner, RunnerContext, RunnerResult, Scope, success } from './base'

export function execProgram(
  program: Token<Program>,
  ctx: RunnerContext
): { ok: true } | { ok: false; diag: Diagnostic } {
  const result = runProgram(program.parsed, ctx)
  return result.ok === false ? result : { ok: true }
}

const runProgram: Runner<Program> = (program, ctx) => runBlock(program, ctx)

const runBlock: Runner<Block> = (block, ctx) => {
  ctx = {
    ...ctx,
    scopes: ctx.scopes.concat([
      {
        functions: [],
        entities: new Map(),
      },
    ]),
  }

  for (const { parsed: chain } of block) {
    if (chain.type === 'empty') continue

    let result = runStatement(chain.start.parsed, ctx)

    for (const { parsed: chained } of chain.sequence) {
      result = matchStr(chained.op.parsed, {
        And: () => (result.ok === true ? runStatement(chained.chainedStatement.parsed, ctx) : result),
        Or: () => (result.ok === true ? success(void 0) : runStatement(chained.chainedStatement.parsed, ctx)),
        Then: () => runStatement(chained.chainedStatement.parsed, ctx),
        Pipe: () => {
          if (result.ok !== true) return result
          throw new Error('TODO: implement pipes')
        },
      })

      if (result.ok === null) return result
    }

    if (result.ok !== true) return result
  }

  return success(void 0)
}

const runStatement: Runner<Statement> = (stmt, ctx) =>
  matchUnion(stmt, 'type', {
    variableDecl: ({ varname, expr }) => {
      const scope = ctx.scopes[ctx.scopes.length - 1]
      const evaluated = runExpr(expr.parsed, ctx)
      if (evaluated.ok !== true) return evaluated

      const type = ctx.objectsTypingMap.assignedExpr.get(expr.parsed)

      if (type === undefined) {
        return err(expr.at, "internal error: failed to get expression type from typechecker's map for this expression")
      }

      scope.entities.set(varname.parsed, { inner: evaluated.data, type })
      return success(void 0)
    },

    assignment: ({ varname, propAccesses, prefixOp, listPush, expr }) => {
      let found: { scope: Scope; target: ExecValue } | null = null

      for (const scope of ctx.scopes.reverse()) {
        const entityValue = scope.entities.get(varname.parsed)

        if (entityValue) {
          found = { scope, target: entityValue.inner }
          break
        }
      }

      if (found === null) {
        return err(varname.at, 'internal error: variable not found in scope')
      }

      const computeValue = (leftAt: CodeSection, left: ExecValue | undefined): RunnerResult<ExecValue> => {
        const execExpr = runExpr(expr.parsed, ctx)
        if (execExpr.ok !== true) return execExpr
        if (prefixOp === null) return success(execExpr.data)

        if (left === undefined) {
          return err(leftAt, 'internal error: left value is undefined when applying prefix op during assignment')
        }

        return runDoubleOp(
          {
            leftAt,
            left,
            op: prefixOp,
            rightAt: expr.at,
            right: execExpr.data,
          },
          ctx
        )
      }

      let targetAt = varname.at
      let target = found.target

      if (propAccesses.length > 0) {
        const treatAtOnce = listPush ? propAccesses : propAccesses.slice(0, propAccesses.length - 1)

        for (const { at, parsed: propAccess } of treatAtOnce) {
          const resolved = runNonNullablePropertyAccess({ propAccessAt: at, propAccess, value: target }, ctx)
          if (resolved.ok !== true) return resolved
          target = resolved.data
          targetAt = { start: targetAt.start, next: at.next }
        }

        if (listPush === null) {
          const last = propAccesses[propAccesses.length - 1]

          const written = runNonNullablePropertyAccess(
            {
              propAccessAt: last.at,
              propAccess: last.parsed,
              value: target,
              write: (value) => computeValue(targetAt, value),
              writeAllowNonExistentMapKeys: prefixOp === null,
            },
            ctx
          )

          return written.ok !== true ? written : success(void 0)
        }
      }

      if (listPush) {
        if (target.type !== 'list') {
          return err(
            listPush.at,
            `internal error: expected left value to be a "list", found internal type "${target.type}"`
          )
        }

        const newItem = computeValue(targetAt, target)
        if (newItem.ok !== true) return newItem

        target.items.push(newItem.data)
        return success(void 0)
      }

      const newValue = computeValue(targetAt, target)
      if (newValue.ok !== true) return newValue

      const type = ctx.objectsTypingMap.assignedExpr.get(expr.parsed)

      if (type === undefined) {
        return err(expr.at, "internal error: failed to get expression type from typechecker's map for this expression")
      }

      found.scope.entities.set(varname.parsed, { inner: newValue.data, type })
      return success(void 0)
    },

    ifBlock: ({ cond, then, elif, els }) => {
      const result = runCondOrTypeAssertion(cond.parsed, ctx)
      if (result.ok !== true) return result

      const check = expectValueType(cond.at, result.data, 'bool')
      if (check.ok !== true) return check
      if (check.data.value) return runBlock(then, ctx)

      for (const { cond, body } of elif) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const check = expectValueType(cond.at, result.data, 'bool')
        if (check.ok !== true) return check
        if (check.data.value) return runBlock(body, ctx)
      }

      return els ? runBlock(els, ctx) : success(void 0)
    },

    forLoop: ({ loopVar, subject, body }) => {
      const iterateOn: RunnerResult<ExecValue[]> = matchUnion(subject.parsed, 'type', {
        range: ({ from, to }) => {
          const resultFrom = runExpr(from.parsed, ctx)
          if (resultFrom.ok !== true) return resultFrom

          const fromValue = expectValueType(from.at, resultFrom.data, 'number')
          if (fromValue.ok !== true) return fromValue

          const resultTo = runExpr(to.parsed, ctx)
          if (resultTo.ok !== true) return resultTo

          const toValue = expectValueType(from.at, resultTo.data, 'number')
          if (toValue.ok !== true) return toValue

          const fromInt = Math.floor(fromValue.data.value)
          const toInt = Math.floor(toValue.data.value)

          return success(
            fromInt < toInt
              ? []
              : new Array(toInt - fromInt).fill(0).map((_, i) => ({ type: 'number', value: fromInt + i }))
          )
        },

        expr: ({ expr }) => {
          const result = runExpr(expr.parsed, ctx)
          if (result.ok !== true) return result

          const list = expectValueType(expr.at, result.data, 'list')
          if (list.ok !== true) return list

          return success(list.data.items.slice())
        },
      })

      if (iterateOn.ok !== true) return iterateOn

      const scope: Scope = { functions: [], entities: new Map() }
      ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

      const type = ctx.objectsTypingMap.forLoopsValueVar.get(loopVar)

      if (type === undefined) {
        return err(
          loopVar.at,
          "internal error: failed to get the loop's value variable type from typechecker's map for this expression"
        )
      }

      for (const value of iterateOn.data) {
        scope.entities.set(loopVar.parsed, { inner: value, type })

        const result = runBlock(body, ctx)
        if (result.ok === null && result.breaking === 'continue') continue
        if (result.ok === null && result.breaking === 'break') break
        if (result.ok !== true) return result
      }

      return success(void 0)
    },

    forLoopDuo: ({ keyVar, valueVar, subject, body }) => {
      const evalSubject = runExpr(subject.parsed, ctx)
      if (evalSubject.ok !== true) return evalSubject

      const map = expectValueType(subject.at, evalSubject.data, 'map')
      if (map.ok !== true) return map

      const iterateOn = [...map.data.entries.entries()]

      const scope: Scope = { functions: [], entities: new Map() }
      ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

      const type = ctx.objectsTypingMap.forLoopsValueVar.get(valueVar)

      if (type === undefined) {
        return err(
          valueVar.at,
          "internal error: failed to get the loop's value variable type from typechecker's map for this expression"
        )
      }

      for (const [key, value] of iterateOn) {
        scope.entities.set(keyVar.parsed, { inner: { type: 'string', value: key }, type: { type: 'string' } })
        scope.entities.set(valueVar.parsed, { inner: value, type })

        const result = runBlock(body, ctx)
        if (result.ok === null && result.breaking === 'continue') continue
        if (result.ok === null && result.breaking === 'break') break
        if (result.ok !== true) return result
      }

      return success(void 0)
    },

    whileLoop: ({ cond, body }) => {
      for (;;) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const evalCond = expectValueType(cond.at, result.data, 'bool')
        if (evalCond.ok !== true) return evalCond
        if (!evalCond.data.value) break

        const exec = runBlock(body, ctx)
        if (exec.ok === null && exec.breaking === 'continue') continue
        if (exec.ok === null && exec.breaking === 'break') break
        if (exec.ok !== true) return exec
      }

      return success(void 0)
    },

    continue: () => ({ ok: null, breaking: 'continue' }),

    break: () => ({ ok: null, breaking: 'break' }),

    typeAlias: () => success(void 0),

    enumDecl: () => success(void 0),

    match: ({ subject, arms }) => {
      const result = runExpr(subject.parsed, ctx)
      if (result.ok !== true) return result

      const evalSubject = expectValueType(subject.at, result.data, 'enum')
      if (evalSubject.ok !== true) return evalSubject

      const relevantArm =
        arms.parsed.find((arm) => arm.variant.parsed === evalSubject.data.variant) ??
        arms.parsed.find((arm) => arm.variant.parsed === '_')

      if (!relevantArm) {
        return err(
          arms.at,
          `internal error: no match arm nor fallback found for current variant "${evalSubject.data.variant}"`
        )
      }

      return runBlock(relevantArm.matchWith.parsed, ctx)
    },

    fnDecl: ({ name, fnType, body }) => {
      const scope = ctx.scopes[ctx.scopes.length - 1]

      scope.entities.set(name.parsed, {
        inner: {
          type: 'fn',
          def: { args: fnType.args.map((arg) => arg.parsed.name.parsed), restArg: fnType.restArg?.parsed ?? null },
          body: body.parsed,
        },
        type: { type: 'fn', fnType },
      })

      scope.functions.push(name.parsed)

      return success(void 0)
    },

    return: ({ expr }) => {
      if (!expr) return { ok: null, breaking: 'return', value: null }

      const evalRetExpr = runExpr(expr.parsed, ctx)
      if (evalRetExpr.ok !== true) return evalRetExpr

      return { ok: null, breaking: 'return', value: evalRetExpr.data }
    },

    panic: ({ message }) => {
      const expr = runExpr(message.parsed, ctx)
      if (expr.ok !== true) return expr

      const messageStr = expectValueType(message.at, expr.data, 'string')
      if (messageStr.ok !== true) return messageStr

      return err(message.at, `Panicked: ${messageStr.data.value}`)
    },

    cmdCall: (/*{ content }*/) => {
      throw new Error('TODO: command calls')
    },

    cmdDecl: () => success(void 0),

    fileInclusion: ({ content }) => runProgram(content, ctx),
  })

const runExpr: Runner<Expr, ExecValue> = (expr, ctx) => {
  const execFrom = runExprElement(expr.from.parsed, ctx)
  if (execFrom.ok !== true) return execFrom

  const resolved = runDoubleOpSeq({ baseElementAt: expr.from.at, baseElement: execFrom.data, seq: expr.doubleOps }, ctx)
  if (resolved.ok !== true) return resolved

  return success(resolved.data)
}

const runDoubleOpSeq: Runner<
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

const runDoubleOp: Runner<
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
              number: ({ value }) => {
                const rightNumber = expectValueType(rightAt, right, 'number')
                return rightNumber.ok === true
                  ? success({ type: 'number', value: value + rightNumber.data.value })
                  : rightNumber
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
          const leftNumber = expectValueType(leftAt, left, 'number')
          if (leftNumber.ok !== true) return leftNumber

          const rightNumber = expectValueType(rightAt, right, 'number')
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

          return out.ok === true ? success({ type: 'number', value: out.data }) : out
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
              number: ({ value }) => {
                const rightNumber = expectValueType(rightAt, right, 'number')
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
          const leftNumber = expectValueType(leftAt, left, 'number')
          if (leftNumber.ok !== true) return leftNumber

          const rightNumber = expectValueType(rightAt, right, 'number')
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

const runExprElement: Runner<ExprElement, ExecValue> = (element, ctx) => {
  const content = runExprElementContent(element.content.parsed, ctx)
  if (content.ok !== true) return content
  if (element.propAccess.length === 0) return content

  let left = content.data

  for (const { at, parsed: access } of element.propAccess) {
    if (access.nullable && left.type === 'null') {
      return success({ type: 'null' })
    }

    const value = runNonNullablePropertyAccess({ value: left, propAccessAt: at, propAccess: access.access }, ctx)
    if (value.ok !== true) return value

    left = value.data
  }

  return success(left)
}

const runNonNullablePropertyAccess: Runner<
  {
    value: ExecValue
    propAccessAt: CodeSection
    propAccess: NonNullablePropertyAccess
    write?: Runner<ExecValue | undefined, ExecValue>
    writeAllowNonExistentMapKeys?: boolean
  },
  ExecValue
> = ({ value, propAccessAt, propAccess, write, writeAllowNonExistentMapKeys }, ctx) =>
  matchUnion(propAccess, 'type', {
    refIndex: ({ index }): RunnerResult<ExecValue> => {
      const execIndex = runExpr(index.parsed, ctx)
      if (execIndex.ok !== true) return execIndex

      if (execIndex.data.type === 'number') {
        if (value.type !== 'list') {
          return err(
            propAccessAt,
            `internal error: expected left value to be a "list" because of "number" index, found internal type "${value.type}"`
          )
        }

        if (Math.floor(execIndex.data.value) !== execIndex.data.value) {
          return err(index.at, `cannot use non-integer value as a list index (found: ${execIndex.data.value})`)
        }

        if (execIndex.data.value < 0) {
          return err(index.at, `cannot use negative number as a list index (found: ${execIndex.data.value})`)
        }

        if (execIndex.data.value >= value.items.length) {
          return err(
            index.at,
            `index out-of-bounds, list contains ${value.items.length} elements but tried to access index ${execIndex.data.value}`
          )
        }

        const item = value.items[execIndex.data.value]
        if (!write) return success(item)

        const mapped = write(value.items[execIndex.data.value], ctx)
        if (mapped.ok !== true) return mapped

        value.items[execIndex.data.value] = mapped.data

        return success(mapped.data)
      } else if (execIndex.data.type === 'string') {
        if (value.type !== 'map') {
          return err(
            propAccessAt,
            `internal error: expected left value to be a "map" because of "string" index, found internal type "${value.type}"`
          )
        }

        const entry = value.entries.get(execIndex.data.value)

        if (!write) {
          return entry !== undefined ? success(entry) : err(index.at, 'tried to access non-existent key in map')
        }

        if (entry === undefined && writeAllowNonExistentMapKeys !== true) {
          return err(index.at, 'cannot assign to non-existent key in map')
        }

        const mapped = write(entry, ctx)
        if (mapped.ok !== true) return mapped

        value.entries.set(execIndex.data.value, mapped.data)

        return success(mapped.data)
      } else {
        return err(
          index.at,
          `internal error: expected index to be a "number" or "string", found internal type "${value.type}"`
        )
      }
    },

    refStructMember: ({ member }) => {
      if (value.type !== 'struct') {
        return err(
          propAccessAt,
          `internal error: expected left value to be a "struct" because of struct member access, found internal type "${value.type}"`
        )
      }

      const accessed = value.members.get(member.parsed)

      if (accessed === undefined) {
        return err(propAccessAt, 'internal error: tried to access non-existent member in struct')
      }

      if (!write) return success(accessed)

      const mapped = write(accessed, ctx)
      if (mapped.ok !== true) return mapped

      value.members.set(member.parsed, mapped.data)

      return success(mapped.data)
    },
  })

const runExprElementContent: Runner<ExprElementContent, ExecValue> = (content, ctx) =>
  matchUnion(content, 'type', {
    synth: ({ inner }) => runExpr(inner.parsed, ctx),
    paren: ({ inner }) => runExpr(inner.parsed, ctx),
    value: ({ content }) => runValue(content.parsed, ctx),

    ternary: ({ cond, then, elif, els }) => {
      const result = runCondOrTypeAssertion(cond.parsed, ctx)
      if (result.ok !== true) return result

      const check = expectValueType(cond.at, result.data, 'bool')
      if (check.ok !== true) return check
      if (check.data.value) return runExprOrNever(then.parsed, ctx)

      for (const { cond, expr } of elif) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const check = expectValueType(cond.at, result.data, 'bool')
        if (check.ok !== true) return check
        if (check.data.value) return runExprOrNever(expr.parsed, ctx)
      }

      return runExprOrNever(els.parsed, ctx)
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

const runValue: Runner<Value, ExecValue> = (value, ctx) =>
  matchUnion(value, 'type', {
    null: () => success({ type: 'null' }),
    bool: ({ value }) => success({ type: 'bool', value: value.parsed }),
    number: ({ value }) => success({ type: 'number', value: value.parsed }),
    string: ({ value }) => success({ type: 'string', value: value.parsed }),
    path: ({ segments }) => success({ type: 'path', segments: segments.parsed.map((segment) => segment.parsed) }),

    computedString: ({ segments }) => {
      const out: string[] = []

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            out.push(segment.parsed.content.parsed)
            break

          case 'expr': {
            const execExpr = runExpr(segment.parsed.expr.parsed, ctx)
            if (execExpr.ok !== true) return execExpr

            if (execExpr.data.type === 'string') {
              out.push(execExpr.data.value)
            } else if (execExpr.data.type === 'number') {
              out.push(execExpr.data.value.toString())
            } else {
              return err(
                segment.at,
                `internal error: expected segment to be either "string" or "number", found internal type "${execExpr.data.type}"`
              )
            }
            break
          }

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success({ type: 'string', value: out.join('') })
    },

    computedPath: ({ segments }) => {
      let currentSegment: string[] = []
      const out: string[] = []

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            currentSegment.push(segment.parsed.content.parsed)
            break

          case 'expr': {
            const execExpr = runExpr(segment.parsed.expr.parsed, ctx)
            if (execExpr.ok !== true) return execExpr

            if (execExpr.data.type === 'string') {
              currentSegment.push(execExpr.data.value)
            } else if (execExpr.data.type === 'path') {
              if (currentSegment.length > 0) {
                out.push(currentSegment.join(''))
                currentSegment = []
              }

              out.push(...execExpr.data.segments)
            } else {
              return err(
                segment.at,
                `internal error: expected segment to be either "string" or "path", found internal type "${execExpr.data.type}"`
              )
            }

            break
          }

          case 'separator':
            if (currentSegment.length > 0) {
              out.push(currentSegment.join(''))
              currentSegment = []
            }
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      if (currentSegment.length > 0) {
        out.push(currentSegment.join(''))
      }

      return success({ type: 'path', segments: out })
    },

    list: ({ items }) => {
      const out: ExecValue[] = []

      for (const item of items) {
        const execItem = runExpr(item.parsed, ctx)
        if (execItem.ok !== true) return execItem

        out.push(execItem.data)
      }

      return success({ type: 'list', items: out })
    },

    map: ({ entries }) => {
      const out = new Map<string, ExecValue>()

      for (const { key, value } of entries) {
        const execValue = runExpr(value.parsed, ctx)
        if (execValue.ok !== true) return execValue

        out.set(key.parsed, execValue.data)
      }

      return success({ type: 'map', entries: out })
    },

    struct: ({ members }) => {
      const out = new Map<string, ExecValue>()

      for (const { name, value } of members) {
        const execValue = runExpr(value.parsed, ctx)
        if (execValue.ok !== true) return execValue

        out.set(name.parsed, execValue.data)
      }

      return success({ type: 'struct', members: out })
    },

    enumVariant: ({ variant }) => success({ type: 'enum', variant: variant.parsed }),

    match: ({ subject, arms }) => {
      const result = runExpr(subject.parsed, ctx)
      if (result.ok !== true) return result

      const evalSubject = expectValueType(subject.at, result.data, 'enum')
      if (evalSubject.ok !== true) return evalSubject

      const relevantArm =
        arms.parsed.find((arm) => arm.variant.parsed === evalSubject.data.variant) ??
        arms.parsed.find((arm) => arm.variant.parsed === '_')

      if (!relevantArm) {
        return err(
          arms.at,
          `internal error: no match arm nor fallback found for current variant "${evalSubject.data.variant}"`
        )
      }

      return runExpr(relevantArm.matchWith.parsed, ctx)
    },

    callback: ({ args, restArg, body }) =>
      success({
        type: 'callback',
        def: { args: args.map((arg) => arg.parsed.name.parsed), restArg: restArg?.parsed ?? null },
        body: body.parsed,
      }),

    fnCall: (/*{ name, args }*/) => {
      throw new Error('TODO: function calls')
    },

    inlineCmdCallSequence: (/*{ start, sequence, capture }*/) => {
      throw new Error('TODO: inline command call sequences')
    },

    reference: ({ varname }) => {
      for (const scope of ctx.scopes.reverse()) {
        const value = scope.entities.get(varname.parsed)

        if (value) {
          return success(value.inner)
        }
      }

      return err(varname.at, 'internal error: reference not found in scope')
    },
  })

const runCondOrTypeAssertion: Runner<CondOrTypeAssertion, ExecValue> = (cond, ctx) =>
  matchUnion(cond, 'type', {
    assertion: (/*{ varname, minimum, inverted }*/) => {
      throw new Error('TODO: type assertions')
    },

    expr: ({ inner }) => runExpr(inner.parsed, ctx),
  })

const runExprOrNever: Runner<ExprOrNever, ExecValue> = (expr, ctx) =>
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

function expectValueType<T extends ExecValue['type']>(
  at: CodeSection,
  value: ExecValue,
  type: T
): RunnerResult<Extract<ExecValue, { type: T }>> {
  return value.type === type
    ? success(value as Extract<ExecValue, { type: T }>)
    : err(at, `internal error: type mismatch (expected internal type "${type}", found "${value.type}")`)
}
