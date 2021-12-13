import {
  Block,
  CondOrTypeAssertion,
  Expr,
  ExprElement,
  ExprElementContent,
  ExprOrNever,
  Program,
  Statement,
  Value,
} from '../shared/ast'
import { Diagnostic } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { matchStr, matchUnion } from '../shared/utils'
import { createRunnerContext, ensureCoverage, err, ExecValue, Runner, RunnerResult, Scope, success } from './base'

export function execProgram(program: Token<Program>): { ok: true } | { ok: false; diag: Diagnostic } {
  const result = runProgram(program.parsed, createRunnerContext())
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

      scope.entities.set(varname.parsed, evaluated.data)
      return success(void 0)
    },

    assignment: ({ varname, propAccesses, prefixOp, listPush, expr }) => {
      throw new Error('TODO: assignments')
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

      for (const value of iterateOn.data) {
        scope.entities.set(loopVar.parsed, value)

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

      for (const [key, value] of iterateOn) {
        scope.entities.set(keyVar.parsed, { type: 'string', value: key })
        scope.entities.set(valueVar.parsed, value)

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
        type: 'fn',
        def: { args: fnType.args.map((arg) => arg.parsed.name.parsed), restArg: fnType.restArg?.parsed ?? null },
        body: body.parsed,
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

    cmdCall: ({ content }) => {
      throw new Error('TODO: command calls')
    },

    cmdDecl: () => success(void 0),

    fileInclusion: ({ content }) => runProgram(content, ctx),
  })

const runExpr: Runner<Expr, ExecValue> = (expr, ctx) => {
  const execFrom = runExprElement(expr.from.parsed, ctx)
  if (execFrom.ok !== true) return execFrom
  if (expr.doubleOps.length === 0) return execFrom // TODO: TO REMOVE

  throw new Error('TODO: expressions')
}

const runExprElement: Runner<ExprElement, ExecValue> = (element, ctx) => {
  const content = runExprElementContent(element.content.parsed, ctx)
  if (content.ok !== true) return content
  if (element.propAccess.length === 0) return content // TODO: TO REMOVE

  throw new Error('TODO: property accesses')
}

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
    null: () => success({ type: 'null', value: null }),
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

            const segmentStr = expectValueType(segment.at, execExpr.data, 'string')
            if (segmentStr.ok !== true) return segmentStr

            out.push(segmentStr.data.value)
            break
          }

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success({ type: 'string', value: out.join('') })
    },

    computedPath: ({ segments }) => {
      const out: string[] = []

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            out.push(segment.parsed.content.parsed)
            break

          case 'expr': {
            const execExpr = runExpr(segment.parsed.expr.parsed, ctx)
            if (execExpr.ok !== true) return execExpr

            const segments = expectValueType(segment.at, execExpr.data, 'path')
            if (segments.ok !== true) return segments

            out.push(...segments.data.segments)
            break
          }

          case 'separator':
            break

          default:
            return ensureCoverage(segment.parsed)
        }
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

    fnCall: ({ name, args }) => {
      throw new Error('TODO: function calls')
    },

    inlineCmdCallSequence: ({ start, sequence, capture }) => {
      throw new Error('TODO: inline command call sequences')
    },

    reference: ({ varname }) => {
      for (const scope of ctx.scopes.reverse()) {
        const entityType = scope.entities.get(varname.parsed)

        if (entityType) {
          return success(entityType)
        }
      }

      return err(varname.at, 'internal error: reference not found in scope')
    },
  })

const runCondOrTypeAssertion: Runner<CondOrTypeAssertion, ExecValue> = (cond, ctx) =>
  matchUnion(cond, 'type', {
    assertion: ({ varname, minimum, inverted }) => {
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
