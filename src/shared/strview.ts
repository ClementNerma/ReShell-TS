export abstract class StrView {
  public abstract firstChar(): string
  public abstract littleView(): string
  public abstract empty(): boolean
  public abstract startsWith(pattern: string): boolean
  public abstract startsWithChar(char: string): boolean
  public abstract matchFirstChar(regex: RegExp): RegExpMatchArray | null
  public abstract matchShort(regex: RegExp): RegExpMatchArray | null
  public abstract offset(addOffset: number): StrView
  public abstract toFullStringSlow(): string
  public abstract withSlowMapper(mapper: (input: string) => string): StrView

  static create(input: string, offset = 0, segmentSize = 128): StrView {
    if (input.length === 0) return new EmptyStrView()
    if (input.length <= 8192) return new SingleStrView(input)

    if (offset && offset >= input.length) {
      throw new Error('String view cannot start past input length')
    }

    const segments = new Array(Math.floor(input.length / segmentSize))
      .fill(0)
      .map((_, i) => input.substr(i * segmentSize, segmentSize))

    const rem = input.length % segmentSize

    if (rem > 0) {
      segments.push(input.substr(input.length - rem, rem))
    }

    return new SegmentedStrView(segments, input.length, offset, segmentSize)
  }
}

class SegmentedStrView extends StrView {
  private readonly firstSegment: number
  private readonly firstSegmentOffset: number

  constructor(
    private readonly segments: string[],
    private readonly remaining: number,
    private readonly offsetInside: number,
    private readonly segmentSize: number
  ) {
    super()

    this.firstSegment = Math.floor(offsetInside / this.segmentSize)
    this.firstSegmentOffset = offsetInside % this.segmentSize
  }

  public firstChar(): string {
    return this.segments[this.firstSegment].charAt(this.firstSegmentOffset)
  }

  private start(): string {
    return this.segments[this.firstSegment].substr(this.firstSegmentOffset)
  }

  public littleView(): string {
    return this.segments[this.firstSegment].substr(this.firstSegmentOffset) + this.segments[this.firstSegment + 1]
  }

  public empty(): boolean {
    return false
  }

  public startsWith(pattern: string): boolean {
    const firstSegmentRem = this.segmentSize - this.firstSegmentOffset

    if (pattern.length <= firstSegmentRem) {
      return this.start().startsWith(pattern)
    }

    const additionalSegments = Math.round(pattern.length - firstSegmentRem)
    const subject =
      this.start() + this.segments.slice(this.firstSegment + 1, this.firstSegment + 1 + additionalSegments).join('')

    return subject.startsWith(pattern)
  }

  public startsWithChar(char: string): boolean {
    if (char.length !== 1) throw new Error('Input is not exactly 1 character long')
    return this.firstChar() === char
  }

  public matchFirstChar(regex: RegExp): RegExpMatchArray | null {
    return this.firstChar().match(regex)
  }

  public matchShort(regex: RegExp): RegExpMatchArray | null {
    const beg = this.start() + this.segments[this.firstSegment + 1]

    const match = beg.match(regex)
    if (match === null || match.index !== 0) return null
    // if (match/*[0]?*/.length === 0) return match

    let lastMatch: RegExpMatchArray = match
    let matchOn = beg
    let segment = this.firstSegment + 1

    while (++segment < this.segments.length) {
      matchOn += this.segments[segment]

      const match = matchOn.match(regex)

      if (!match || match.index !== 0) return lastMatch
      if (match[0].length === lastMatch[0].length) return match

      lastMatch = match
    }

    return lastMatch
  }

  public offset(addOffset: number): StrView {
    const rem = this.remaining - addOffset

    if (rem > this.segmentSize) {
      return new SegmentedStrView(
        this.segments,
        this.remaining - addOffset,
        this.offsetInside + addOffset,
        this.segmentSize
      )
    } else if (rem === 0) {
      return new EmptyStrView()
    }

    const offsetInside = this.offsetInside + addOffset
    const firstSegment = Math.floor(offsetInside / this.segmentSize)
    const firstSegmentOffset = offsetInside % this.segmentSize

    const start = this.segments[firstSegment].substr(firstSegmentOffset)

    return firstSegment === this.segments.length - 1
      ? new SingleStrView(start)
      : new SingleStrView(start + this.segments.slice(firstSegment + 1).join(''))
  }

  public toFullStringSlow(): string {
    return this.start() + this.segments.slice(this.firstSegment + 1).join('')
  }

  public withSlowMapper(mapper: (input: string) => string) {
    return StrView.create(mapper(this.toFullStringSlow()), this.offsetInside, this.segmentSize)
  }

  // TODO: function to match longer regexps at once
}

class SingleStrView extends StrView {
  constructor(private readonly source: string) {
    super()
    if (source.length > 8192) throw new Error('Cannot make a single string view that large')
  }

  public firstChar(): string {
    return this.source.charAt(0)
  }

  // TODO: rename
  public littleView(): string {
    return this.source
  }

  public empty(): boolean {
    return false
  }

  public startsWith(pattern: string): boolean {
    return this.source.startsWith(pattern)
  }

  public startsWithChar(char: string): boolean {
    return this.source.charAt(0) === char
  }

  public matchFirstChar(regex: RegExp): RegExpMatchArray | null {
    return this.source.charAt(0).match(regex)
  }

  public matchShort(regex: RegExp): RegExpMatchArray | null {
    const match = this.source.match(regex)
    return match?.index === 0 ? match : null
  }

  public offset(addOffset: number): StrView {
    return addOffset < this.source.length ? new SingleStrView(this.source.substr(addOffset)) : new EmptyStrView()
  }

  public toFullStringSlow(): string {
    return this.source
  }

  public withSlowMapper(mapper: (input: string) => string): StrView {
    return StrView.create(mapper(this.source))
  }
}

class EmptyStrView extends StrView {
  public firstChar(): string {
    return ''
  }

  public littleView(): string {
    return ''
  }

  public empty(): boolean {
    return true
  }

  public startsWith(pattern: string): boolean {
    return pattern === ''
  }

  public startsWithChar(char: string): boolean {
    return char === ''
  }

  public matchFirstChar(regex: RegExp): RegExpMatchArray | null {
    return ''.match(regex)
  }

  public matchShort(regex: RegExp): RegExpMatchArray | null {
    return ''.match(regex)
  }

  public offset(): StrView {
    return this
  }

  public toFullStringSlow(): string {
    return ''
  }

  public withSlowMapper(mapper: (input: string) => string): StrView {
    return StrView.create(mapper(''))
  }
}
