import { Token } from '../../shared/parsed'
import { Parser, ParserResult, ParserSuccessInfos, ParsingContext, success, withErr, WithErrData } from './base'

/* prettier-ignore */ export function combine<A, B>(a: Parser<A>, b: Parser<B>, error?: WithErrData): Parser<[Token<A>, Token<B>]>;
/* prettier-ignore */ export function combine<A, B, C>(a: Parser<A>, b: Parser<B>, c: Parser<C>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>]>;
/* prettier-ignore */ export function combine<A, B, C, D>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, y: Parser<Y>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>, Token<Y>]>;
/* prettier-ignore */ export function combine<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z>(a: Parser<A>, b: Parser<B>, c: Parser<C>, d: Parser<D>, e: Parser<E>, f: Parser<F>, g: Parser<G>, h: Parser<H>, i: Parser<I>, j: Parser<J>, k: Parser<K>, l: Parser<L>, m: Parser<M>, n: Parser<N>, o: Parser<O>, p: Parser<P>, q: Parser<Q>, r: Parser<R>, s: Parser<S>, t: Parser<T>, u: Parser<U>, v: Parser<V>, w: Parser<W>, x: Parser<X>, y: Parser<Y>, z: Parser<Z>, error?: WithErrData): Parser<[Token<A>, Token<B>, Token<C>, Token<D>, Token<E>, Token<F>, Token<G>, Token<H>, Token<I>, Token<J>, Token<K>, Token<L>, Token<M>, Token<N>, Token<O>, Token<P>, Token<Q>, Token<R>, Token<S>, Token<T>, Token<U>, Token<V>, Token<W>, Token<X>, Token<Y>, Token<Z>]>;
export function combine(...parsers: (Parser<Token<unknown>> | WithErrData | null | undefined)[]): Parser<unknown[]> {
  const error: WithErrData | undefined =
    typeof parsers[parsers.length - 1] !== 'function' ? (parsers.pop() as any) : undefined

  return (start, input, context): ParserResult<unknown[]> => {
    const parsed: Token<unknown>[] = []
    const matched = []
    let next = { ...start }

    let previousInfos: ParserSuccessInfos | null = null

    for (let i = 0; i < parsers.length; i++) {
      const combinationContext: ParsingContext = {
        ...context,
        combinationData: {
          firstIter: i === 0,
          iter: i,
          soFar: { previous: parsed[parsed.length - 1] ?? null, previousInfos, start, matched, parsed },
        },
      }

      const result = (parsers[i] as Parser<unknown>)(next, input, combinationContext)

      if (!result.ok) return withErr(result, context, error)

      const { data, infos } = result

      previousInfos = infos

      input = input.offset(data.matched.length)
      next = data.at.next

      parsed.push(data)
      matched.push(data.matched)
    }

    return success(start, next, parsed, matched.join(''))
  }
}
