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
  private readonly isLastSegment: boolean
  private readonly firstSegment: number
  private readonly firstSegmentOffset: number
  private readonly firstSegmentRem: number

  constructor(
    private readonly segments: string[],
    private readonly total: number,
    private readonly offsetInside: number,
    private readonly segmentSize: number
  ) {
    super()

    this.firstSegment = Math.floor(offsetInside / this.segmentSize)
    this.isLastSegment = this.firstSegment === this.segments.length - 1
    this.firstSegmentOffset = offsetInside % this.segmentSize
    this.firstSegmentRem = this.isLastSegment
      ? this.segments[this.firstSegment].length - this.firstSegmentOffset
      : this.segmentSize - this.firstSegmentOffset
  }

  public firstChar(): string {
    return this.segments[this.firstSegment].charAt(this.firstSegmentOffset)
  }

  private start(): string {
    return this.segments[this.firstSegment].substr(this.firstSegmentOffset)
  }

  // TODO: rename
  public littleView(): string {
    return this.isLastSegment
      ? this.segments[this.firstSegment].substr(this.firstSegmentOffset)
      : this.segments[this.firstSegment].substr(this.firstSegmentOffset) + this.segments[this.firstSegment + 1]
  }

  public empty(): boolean {
    return this.isLastSegment && this.firstSegmentOffset === this.segments[this.firstSegment].length
  }

  public startsWith(pattern: string): boolean {
    if (pattern.length <= this.firstSegmentRem) {
      return this.start().startsWith(pattern)
    }

    const additionalSegments = Math.round(pattern.length - this.firstSegmentRem)
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
    if (this.isLastSegment) {
      return this.start().match(regex)
    }

    const beg = this.start() + this.segments[this.firstSegment + 1]

    const match = beg.match(regex)
    if (match === null) return null
    if (match.length === 0) return match

    let lastMatch: RegExpMatchArray = match
    let matchOn = beg
    let segment = this.firstSegmentRem + 1

    while (++segment < this.segments.length) {
      matchOn += this.segments[++segment]

      const match = matchOn.match(regex)
      if (!match) return lastMatch
      if (match.length === lastMatch.length) return match

      lastMatch = match
    }

    return match
  }

  public offset(addOffset: number): StrView {
    return this.offsetInside + addOffset === this.total - 1
      ? new EmptyStrView()
      : new SegmentedStrView(this.segments, this.total, this.offsetInside + addOffset, this.segmentSize)
  }

  public toFullStringSlow(): string {
    return this.isLastSegment ? this.start() : this.start() + this.segments.slice(this.firstSegment + 1).join('')
  }

  public withSlowMapper(mapper: (input: string) => string) {
    return StrView.create(mapper(this.toFullStringSlow()), this.offsetInside, this.segmentSize)
  }

  // TODO: function to match longer regexps at once
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

  public offset(addOffset: number): StrView {
    return this
  }

  public toFullStringSlow(): string {
    return ''
  }

  public withSlowMapper(mapper: (input: string) => string): StrView {
    return StrView.create(mapper(''))
  }
}
