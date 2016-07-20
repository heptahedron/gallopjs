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
    this.backlinks = new Map()
    this.alreadyTried = new Map()
  }

  run() {
    while (this.dispatchStack.length > 0) {
      const [parser, stream] = this.dispatchStack.pop()
      
      parser.chain(this, stream, res => {
        this.backlinks.get(stream).get(parser).forEach(
          continuation => continuation(res)
        )
      })
    }
  }

  add(parser, stream, continuation) {
    if (!this.backlinks.has(stream)) {
      this.backlinks.set(stream, new Map())
    }

    if (!this.backlinks.get(stream).has(parser)) {
      this.backlinks.get(stream).set(parser, new Set())
    }

    this.backlinks.get(stream).get(parser).add(continuation)

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
  followedBy() {}
}

export class TerminalParser extends Parser {} 
export class NonTerminalParser extends Parser {}

export class NonTerminalSequentialParser extends NonTerminalParser {
  constructor(first, second) {
    super()
    this.first = first
    this.second = second
  }

  chain(trampoline, stream, continuation) {
    this.first.chain(trampoline, stream, res1 => {
      if (res1 instanceof Success) {
        this.second.chain(trampoline, res1.rem, res2 => {
          if (res2 instanceof Success) {
            f(new Success([res1.val, res2.val], res2.rem))
          } else {
            f(res2)
          }
        })
      } else {
        f(res1)
      }
    })
  }
}

export class DisjunctiveParser extends NonTerminalParser {
  constructor(first, second) {
    super()
    this.first = first
    this.second = second
  }

  parse(stream) {
    const trampoline = new Trampoline(),
          results = []
    this.chain(trampoline, stream, res => results.push(res))
    trampoline.run()
    return results
  }

  chain(trampoline, stream, continuation) {
    this._gatherPossibilities().forEach(terminalParser => {
      trampoline.add(terminalParser, stream, res => {
        // paper says check for duplicate results? don't know why
        continuation(res)
      })
    })
  }

  _gatherPossibilities(seen) {
    if (!seen) seen = new Set()
    seen.add(this)

    let poss = []
    if (!seen.contains(this.first)) {
      if (this.first instanceof DisjunctiveParser) {
        poss = poss.concat(this.first._gatherPossibilities(seen))
      } else {
        poss.push(this.first)
      } 
    }

    if (!seen.contains(this.second)) {
      if (this.second instanceof DisjunctiveParser) {
        poss = poss.concat(this.second._gatherPossibilities(seen))
      } else {
        poss.push(this.second)
      }
    }

    return poss
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

  followedBy(next) {
    if (next instanceof TerminalParser) {
      return new TerminalSequentialParser(this, next)
    } else {
      return new NonTerminalSequentialParser(this, next)
    }
  }
}

export class TerminalSequentialParser extends TerminalParser {
  constructor(first, second) {
    super()
    this.first = first
    this.second = second
  }

  parse(stream) {
    const res1 = this.first.parse(stream)
    if (res1 instanceof Success) {
      const res2 = this.second.parse(res1.rem)
      if (res2 instanceof Success) {
        return new Success([res1.val, res2.val], res2.rem)
      } else {
        return res2
      }
    } else {
      return res1
    }
  }

  chain(trampoline, stream, continuation) {
    continuation(this.parse(stream)) // no disjunctions, so we just parse
  }
}
