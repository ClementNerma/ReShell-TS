import { Token } from '../../shared/parsed'
import { Parser, ParserResult, ParserSucess, ParsingContext, sliceInput, success, withErr, WithErrData } from './base'

type CombineOptions = {
  error?: WithErrData
  inter?: Parser<unknown>
}

/* prettier-ignore */ export function combine<A, B>(a: Parser<A>, b: Parser<B>, options?: CombineOptions): Parser<[Token<A>, Token<B>]>;
/* prettier-ignore */ export function combine<A, B, C>(a: Parser<A>, b: Parser<B>, c: Parser<C>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>]>;
/* prettier-ignore */ export function combine<A, B, C, D>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, y: Parser<Y>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>, Token<Y>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, y: Parser<Y>, z: Parser<Z>, options?: CombineOptions): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>, Token<Y>, Token<Z>]>;
export function combine(...parsers: (Parser<Token<unknown>> | CombineOptions | null | undefined)[]): Parser<unknown[]> {
  const options: CombineOptions | null =
    typeof parsers[parsers.length - 1] !== 'function' ? (parsers.pop() as any) : null

  return (start, input, context): ParserResult<unknown[]> => {
    let loc = start
    let lastResult: ParserSucess<unknown> = null as any
    const parsed: Token<unknown>[] = []
    const matched = []

    let lastWasNeutralError = false

    for (let i = 0; i < parsers.length; i++) {
      const combinationContext: ParsingContext = {
        ...context,
        combinationData: {
          firstIter: i === 0,
          iter: i,
          lastWasNeutralError,
          soFar: { previous: parsed[parsed.length - 1] ?? null, start, matched, parsed },
        },
      }

      const result = (parsers[i] as Parser<unknown>)(loc, input, combinationContext)

      if (!result.ok) return withErr(result, context, options?.error)

      const { data } = result

      input = sliceInput(input, loc, data.next)

      parsed.push(data)
      matched.push(data.matched)

      if (data.neutralError) {
        if (i === parsers.length - 1) {
          break
        }
      }

      lastWasNeutralError = data.neutralError

      loc = data.next
      lastResult = result

      if (!data.neutralError && options?.inter && i < parsers.length - 1) {
        const interResult = options.inter(loc, input, combinationContext)

        if (!interResult.ok) {
          return withErr(interResult, context, options?.error)
        }

        const { data } = interResult

        input = sliceInput(input, loc, data.next)
        loc = data.next

        matched.push(data.matched)
      }
    }

    return success(start, lastResult.data.end, lastResult.data.next, parsed, matched.join(''))
  }
}
