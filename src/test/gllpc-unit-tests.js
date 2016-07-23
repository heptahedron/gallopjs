import chai from 'chai'
chai.should()

import * as gllpc from '../gllpc'

describe('gllpc', function() {
  const bird = new gllpc.StringLiteralParser('bird'),
        istheword = new gllpc.StringLiteralParser('istheword'),
        empty = new gllpc.StringLiteralParser(''),
        simpleSeq = bird.followedBy(istheword),
        simpleDis = bird.alternately(istheword),
        recursiveSeq = empty.alternately(undefined) 
  recursiveSeq.next = bird.followedBy(recursiveSeq)

  const basicExpectations = [
    { pClass: gllpc.StringLiteralParser,
      tests: [
        { p: bird, str: 'bird', succ: { val: 'bird', rem: '' },
          it: 'should succeed and consume the whole string' },
        { p: bird, str: 'birdextra', succ: { val: 'bird', rem: 'extra' },
          it: 'should not consume more than necessary' },
        { p: bird, str: 'notbird', fail: { rem: 'notbird' },
          it: 'should fail to parse an incorrect string' },
        { p: empty, str: '', succ: { val: '', rem: '' },
          it: 'should succeed in parsing the empty string' },
        { p: empty, str: 'extra', succ: { val: '', rem: 'extra' },
          it: 'should not consume anything when parsing the empty string' },
      ] },
    { pClass: gllpc.TerminalSequentialParser,
      tests: [
        { p: simpleSeq, str: 'birdistheword',
          succ: { val: ['bird', 'istheword'], rem: '' },
          it: 'should successfully parse both terminals in sequence' },
        { p: simpleSeq, str: 'bird', fail: { rem: '' },
          it: 'should fail to parse a too-short string' },
        { p: simpleSeq, str: 'istheword', fail: { rem: 'istheword' },
          it: 'should not forget to parse the first terminal' },
        { p: simpleSeq, str: '', fail: { rem: '' },
          it: 'should properly handle the empty string' },
      ] },
    // TODO more tests
  ]

  basicExpectations.forEach(({ pClass, tests }) => {
    describe(`${pClass.name}#parse()`, function() {
      tests.forEach(({ p, str, succ, fail, it: _it }) => {
        it(_it, function() {
          let res = p.parse(str),
              shouldSucceed = !!succ,
              expRes = succ || fail
              
          res.should.be.instanceof(shouldSucceed
                                   ? gllpc.Success
                                   : gllpc.Failure)
          expRes.val && res.val.should.deep.equal(expRes.val)
          expRes.rem && res.rem.should.equal(expRes.rem)
        })
      })
    })
  })
})
