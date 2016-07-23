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
      ] },
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
          expRes.val && res.val.should.equal(expRes.val)
          expRes.rem && res.rem.should.equal(expRes.rem)
        })
      })
    })
  })
})
