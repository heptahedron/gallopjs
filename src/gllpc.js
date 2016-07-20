const ABSTRACT_METHOD = 'Abstract method called!'

export class Result {
  constructor(val, rem) {
    this.val = val
    this.rem = rem
  }
}

export class Success extends Result {}
export class Failure extends Result {}

export class Trampoline {
  constructor() {
    this.dispatchStack = []
    this.resultCallbacks = new Map()
    this.alreadyTried = new Map()
  }

  run() {
    while (this.dispatchStack.length > 0) {
      const [parser, stream] = this.dispatchStack.pop()
      
      parser.chain(this, stream, res => {
        this.resultCallbacks.get(stream).get(parser).forEach(
          resultCallback => resultCallback(res)
        )
      })
    }
  }

  add(parser, stream, resultCallback) {
    if (!this.resultCallbacks.has(stream)) {
      this.resultCallbacks.set(stream, new Map())
    }

    if (!this.resultCallbacks.get(stream).has(parser)) {
      this.resultCallbacks.get(stream).set(parser, new Set())
    }

    this.resultCallbacks.get(stream).get(parser).add(resultCallback)

    if (!this.alreadyTried.contains(stream)) {
      this.alreadyTried.set(stream, new Set())
    }
    
    if (!this.alreadyTried.get(stream).contains(parser)) {
      this.alreadyTried.get(stream).add(parser)
      this.dispatchStack.push([parser, stream])
    }
  }
}

export class Parser {
  // since we don't have a trait for non-atomic parsers (a la Scala),
  // and to reduce code duplication, we put this constructor in 
  // the superclass, to be overridden if a subclass is atomic
  constructor(first, next) {
    this.first = first
    this.next = next
  }

  parse() { throw ABSTRACT_METHOD }
  chain() { throw ABSTRACT_METHOD }
  followedBy() { throw ABSTRACT_METHOD }
  alternately(alternate) {
    return new DisjunctiveParser(this, alternate)
  }
}

export class TerminalParser extends Parser {
  followedBy(next) {
    if (next instanceof TerminalParser) {
      return new TerminalSequentialParser(this, next)
    } else {
      return new NonTerminalSequentialParser(this, next)
    }
  }

  chain(trampoline, stream, resultCallback) {
    resultCallback(this.parse(stream)) // no disjunctions, so we just parse
  }
}

export class NonTerminalParser extends Parser {
  _possibleParsesOf(parser, seen) {
    if (seen.contains(parser)) {
      return []
    } 

    if (parser instanceof NonTerminalParser) {
      return parser._gatherPossible(parser, seen)
    } 

    return [parser]
  }

  _gatherPossible(seen) {
    seen.add(this)

    // consider caching possibilities
    // but would impact runtime alteration of parsers

    return (this._possibleParsesOf(this.first)
            .concat(this._possibleParsesOf(this.next)))
  }
}

export class StringLiteralParser extends TerminalParser {
  constructor(str) {
    super()
    this.str = str
  }

  parse(stream) { // not *really* a stream, but you know
    if (stream.length < this.str.length) {
      return new Failure('Unexpected end of stream.', stream)
    }

    const recvdStr = stream.substring(0, this.str.length)
    if (recvdStr === this.str) {
      return new Success(this.str, stream.substr(this.str.length))
    } else {
      return new Failure(`Expected '${this.str}', but got '${recvdStr}'.`)
    }
  }
}

export class TerminalSequentialParser extends TerminalParser {
  parse(stream) {
    const res1 = this.first.parse(stream)
    if (res1 instanceof Success) {
      const res2 = this.next.parse(res1.rem)
      if (res2 instanceof Success) {
        return new Success([res1.val, res2.val], res2.rem)
      } else {
        return res2
      }
    } else {
      return res1
    }
  }
}

export class NonTerminalSequentialParser extends NonTerminalParser {
  chain(trampoline, stream, resultCallback) {
    this.first.chain(trampoline, stream, res1 => {
      if (res1 instanceof Success) {
        this.next.chain(trampoline, res1.rem, res2 => {
          if (res2 instanceof Success) {
            resultCallback(new Success([res1.val, res2.val], res2.rem))
          } else {
            resultCallback(res2)
          }
        })
      } else {
        resultCallback(res1)
      }
    })
  }
}

export class DisjunctiveParser extends NonTerminalParser {
  parse(stream) {
    const trampoline = new Trampoline(),
          results = []
    this.chain(trampoline, stream, res => results.push(res))
    trampoline.run()
    return results
  }

  chain(trampoline, stream, resultCallback) {
    this._gatherPossible(new Set()).forEach(terminalParser => {
      trampoline.add(terminalParser, stream, res => {
        // it's possible that multiple disjunctions could have
        // the same terminal parser as an option, which would result
        //
        resultCallback(res)
      })
    })
  }
}
