# gallopJS

I started this as a personal project to understand parsers more, because I'm
hopelessly fascinated by language, I guess. It is currently a work-in-progress,
though the basic functionality seems to be in working order. This 
implementation of GLL parser combinators is described in-depth in Daniel
Spiewak's [excellent paper][1] on the subject.

The name was non-creatively derived from the name of the original source file,
`gllpc.js`.

## Installation

`npm install` will install all devDependencies required to build the
distributable library, ~~or you can use the prebuilt library in `dist/`~~
(TODO).

## Usage

Further documentation will be added as features are tested. For now, the main
classes to be concerned with are the `Parser` family of classes and `Stream`.

- `Parser`
  * Abstract class from which all parsers inherit
  * To parse a given `Stream` instance, simply call a `Parser`'s `#parse()`
    method, passing the stream as the only argument
  * `SequentialParser`
    - A parser formed by the sequence of two other parsers
    - Can be created directly using its constructor or by using any parser's
      `#followedBy()` method
  * `DisjunctiveParser`
    - A parser formed by the logical disjunction of two parsers
    - Can be created directly using constructor or `#alternately()` method
      of any parser

GLL's claim to fame, the ability to parse even ambiguous context-free grammars,
is supported by returning a *list* of results. Left-recursive grammars are also
supported, though right now constructing one using this library is not very
elegant. Future revisions are coming.
