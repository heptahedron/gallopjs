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
    this.dispatched = new Map()
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

        this.resultCallbacks.get(stream).get(parser).forEach(
          resultCallback => resultCallback(res)
        )
      })
    }
  }

  // defers parser evaluation at a certain point in the stream
  // the parser may be later applied when new results from prior branches
  // are evaluated 
  add(parser, stream, resultCallback) {
    if (!this.resultCallbacks.has(stream)) {
      this.resultCallbacks.set(stream, new Map())
    }

    if (!this.resultCallbacks.get(stream).has(parser)) {
      this.resultCallbacks.get(stream).set(parser, new Set())
    }

    /**
     * The same parser could be deferred at the same point in the stream
     * in two different contexts, which likely have different continuations
     * therefrom, requiring a *set* of possible resultCallbacks.
     * It is a "backlink" in that one can resume the parse from that point in
     * the stream by calling the set of the callbacks stored there by all
     * parsers with the result values from their predecessors to queue the
     * subsequent parsers
     */
    this.resultCallbacks.get(stream).get(parser).add(resultCallback)

    /**
     * While it may be the same parser at the same point, the different
     * possible contexts (i.e. containing parsers) it could occur in mandate
     * a set of results from those parsers it was queued by.
     * Different parse branches could reach the same point/parser at different
     * times, so those that come later will be able to proceed with the results
     * already obtained from the same parser in a different context that 
     * arrived there first. When this happens, each result is immediately
     * given to the resultCallback passed to #add().
     */
    if (this.results.has(stream)
        && this.results.get(stream).has(parser)) {
      this.results.get(stream).get(parser).forEach(resultCallback)
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

  chain(trampoline, stream, resultCallback) {
    resultCallback(this.parse(stream)) // no disjunctions, so we just parse
  }
}

export class NonTerminalParser extends Parser {
  parse(stream) {
    const trampoline = new Trampoline(),
          results = []
    this.chain(trampoline, stream, res => {
      results.push(res)
      console.log(res)
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

  parse(stream) { // not *really* a stream, but you know
    if (stream.length < this.str.length) {
      return new Failure('Unexpected end of stream.', stream)
    }

    const recvdStr = stream.substring(0, this.str.length)
    if (recvdStr === this.str) {
      return new Success(this.str, stream.substr(this.str.length))
    } else {
      return new Failure(`Expected '${this.str}', but got '${recvdStr}'.`,
                         stream)
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

  chain(trampoline, stream, resultCallback) {
    const results = new Set()
    // TODO ensure identical results are referentially identical
    for (const possibleParser of this._gatherPossible(new Set())) {
      trampoline.add(possibleParser, stream, res => {
        /**
         * Consider the following structure with D=Disjoint 
         * N/T=(Non-)terminal (sequential parser) R=Recursive ref
         *          N
         *         / \
         *   'a'->T   D
         *           / \
         *      ''->T   R
         * DisjunctiveParser#parse() would instantiate a trampoline, then
         * call #chain() with it and a callback which adds to the results list.
         * A mutable set of results already given to this trampoline is 
         * thus enclosed in this callback, ensuring that the trampoline will
         * not redundantly add a continuation for the same parser at the same
         * point in the stream with the same parse context.
         */
        console.log(results)
        if (!results.has(res)) {
          resultCallback(res)
          results.add(res)
        }
      })
    }
  }
}
