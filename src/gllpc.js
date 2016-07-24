const ABSTRACT_METHOD = 'Abstract method called!'

export class Stream {
  constructor(buf, offset) {
    console.log('Stream instantiated')
    this.buf = buf
    this.offset = offset
  }

  take(n) {
    return this.buf.substr(this.offset, n)
  }

  drop(n) {
    return this.constructor._getCachedForBufAt(this.buf, this.offset + n)
  }

  static _getCachedForBufAt(buf, offset) {
    console.log('_getCachedForBufAt called')
    return (this._streamsCache.has(buf)
            ? this._streamsCache.get(buf).has(offset)
              ? this._streamsCache.get(buf).get(offset)
              : this._streamsCache.get(buf)
                .set(offset, new Stream(buf, offset)).get(offset)
            : this._streamsCache.set(buf, new Map()).get(buf)
              .set(offset, new Stream(buf, offset)).get(offset))
  }
}

Stream._streamsCache = new Map()

export class Result {
  constructor(val, rem) {
    this.val = val
    this.rem = rem
  }

  static _getCached(val, rem) { throw ABSTRACT_METHOD }
}

export class Success extends Result {
  static _getCached(val, rem) {
    return (this._successCache.has(rem)
            ? this._successCache.get(rem).has(val)
              ? this._successCache.get(rem).get(val)
              : this._successCache.get(rem)
                .set(val, new Success(val, rem)).get(val)
            : this._successCache.set(rem, new Map()).get(rem)
              .set(val, new Success(val, rem)).get(val))
  }
}

Success._successCache = new Map()
export function success(val, rem) { return Success._getCached(val, rem) }

export class Failure extends Result {
  static _getCached(val, rem) {
    console.log('Failure _getCached called')
    return (this._failureCache.has(rem)
            ? this._failureCache.get(rem).has(val)
              ? this._failureCache.get(rem).get(val)
              : this._failureCache.get(rem)
                .set(val, new Failure(val, rem)).get(val)
            : this._failureCache.set(rem, new Map()).get(rem)
              .set(val, new Failure(val, rem)).get(val))
  }
}
export function failure(val, rem) { return Failure._getCached(val, rem) }

Failure._failureCache = new Map()

export class Trampoline {
  constructor() {
    this.dispatchStack = []
    this.backlinks = new Map()
    this.dispatched = new Map()
    this.saved = new Map()
    this.results = new Map()
  }

  run() {
    while (this.dispatchStack.length > 0) {
      // get next deferred parse and its point in the stream
      const [parser, stream] = this.dispatchStack.pop()
      
      // execute provided callback with result of every possible subsequent
      // parser at this point in the stream, store result in results set
      parser.chain(this, stream, res => {
        if (!this.results.has(stream)) {
          this.results.set(stream, new Map())
        }
        if (!this.results.get(stream).has(parser)) {
          this.results.get(stream).set(parser, new Set())
        }
        if (res instanceof Success) {
          this.results.get(stream).get(parser).add(res)
        }

        console.log('---RUN CALLED---')
        console.log(parser, stream, res)

        if (!this.saved.has(res)) this.saved.set(res, new Set())
        this.backlinks.get(stream).get(parser).forEach(
          backlink => {
            if (!this.saved.get(res).has(backlink)) {
              this.saved.get(res).add(backlink)
              backlink(res)
            }
          }
        )
      })
    }
  }

  // defers parser evaluation at a certain point in the stream
  // the parser may be later applied when new results from prior branches
  // are evaluated 
  add(parser, stream, backlink) {
    if (!this.backlinks.has(stream)) {
      this.backlinks.set(stream, new Map())
    }

    if (!this.backlinks.get(stream).has(parser)) {
      this.backlinks.get(stream).set(parser, new Set())
    }

    /**
     * The same parser could be deferred at the same point in the stream
     * in two different contexts, which likely have different continuations
     * therefrom, requiring a *set* of possible backlinks.
     * It is a "backlink" in that one can resume the parse from that point in
     * the stream by calling the set of the callbacks stored there by all
     * parsers with the result values from their predecessors to queue the
     * subsequent parsers
     */
    this.backlinks.get(stream).get(parser).add(backlink)

    /**
     * While it may be the same parser at the same point, the different
     * possible contexts (i.e. containing parsers) it could occur in mandate
     * a set of results from those parsers it was queued by.
     * Different parse branches could reach the same point/parser at different
     * times, so those that come later will be able to proceed with the results
     * already obtained from the same parser in a different context that 
     * arrived there first. When this happens, each result is immediately
     * given to the backlink passed to #add().
     */
    if (this.results.has(stream)
        && this.results.get(stream).has(parser)) {
      this.results.get(stream).get(parser).forEach(backlink)
    } else {
      /**
       * Ensures the same parser is not queued twice, which would not normally 
       * happen if it already had its result stored, but could already be on
       * the dispatchStack, requiring this extra check.
       */
      if (!this.dispatched.has(stream)) {
        this.dispatched.set(stream, new Set())
      }

      if (!this.dispatched.get(stream).has(parser)) {
        this.dispatched.get(stream).add(parser)
        this.dispatchStack.push([parser, stream])
      }
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

  chain(trampoline, stream, backlink) {
    backlink(this.parse(stream))
  }
}

export class NonTerminalParser extends Parser {
  parse(stream) {
    const trampoline = new Trampoline(),
          results = []
    this.chain(trampoline, stream, res => {
      results.push(res)
    })
    trampoline.run()
    return results
  }

  followedBy(next) {
    return new NonTerminalSequentialParser(this, next)
  }
}

export class StringLiteralParser extends TerminalParser {
  constructor(str) {
    super()
    this.str = str
  }

  parse(stream) {
    if (stream instanceof Stream) {
      const recvd = stream.take(this.str.length)
      if (recvd.length < this.str.length) {
        return failure('Unexpected end of stream.', stream)
      } else {
        return success(this.str, stream.drop(this.str.length))
      }
    } else {
      if (stream.length < this.str.length) {
        return failure('Unexpected end of stream.', stream)
      }

      const recvdStr = stream.substring(0, this.str.length)
      if (recvdStr === this.str) {
        return success(this.str, stream.substr(this.str.length))
      } else {
        return failure(`Expected '${this.str}', but got '${recvdStr}'.`,
                           stream)
      }
    }
  }
}

export class TerminalSequentialParser extends TerminalParser {
  parse(stream) {
    const res1 = this.first.parse(stream)
    if (res1 instanceof Success) {
      const res2 = this.next.parse(res1.rem)
      if (res2 instanceof Success) {
        return success([res1.val, res2.val], res2.rem)
      } else {
        return res2
      }
    } else {
      return res1
    }
  }
}

export class NonTerminalSequentialParser extends NonTerminalParser {
  chain(trampoline, stream, backlink) {
    this.first.chain(trampoline, stream, res1 => {
      if (res1 instanceof Success) {
        this.next.chain(trampoline, res1.rem, res2 => {
          if (res2 instanceof Success) {
            backlink(success([res1.val, res2.val], res2.rem))
          } else {
            backlink(res2)
          }
        })
      } else {
        backlink(res1)
      }
    })
  }
}

export class DisjunctiveParser extends NonTerminalParser {
  _possibleParsesOf(parser, seen) {
    if (seen.has(parser)) {
      return []
    } 

    if (parser instanceof DisjunctiveParser) {
      return parser._gatherPossible(seen)
    }  

    return [parser]
  }

  _gatherPossible(seen) {
    // consider caching possibilities
    // but would impact runtime alteration of parsers
    seen.add(this)
    return (this._possibleParsesOf(this.first, seen)
            .concat(this._possibleParsesOf(this.next, seen)))
  }

  chain(trampoline, stream, backlink) {
    const results = new Set()
    // TODO ensure identical results are referentially identical
    for (const possibleParser of this._gatherPossible(new Set())) {
      trampoline.add(possibleParser, stream, res => {
        if (!results.has(res)) {
          backlink(res)
          results.add(res)
        }
      })
    }
  }
}
