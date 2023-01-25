import { get } from '../get'

const obj = {
  a: {
    b: {
      c: 42,
      d: true,
      e: 'hello',
      f: [{ g: 'yay' }, { g: 'nay' }]
    },
    h: null
  },
  u: undefined,
  '[txt] non': true,
  '[txt] nest': {
    inner: true
  }
}

const fixtures: Record<string, unknown> = {
  '': obj,
  a: obj.a,
  'a.b': obj.a.b,
  'a.b.c': obj.a.b.c,
  'a.b.d': obj.a.b.d,
  'a.b.e': obj.a.b.e,
  'a.b.f[0]': obj.a.b.f[0],
  'a.b.f[0].g': obj.a.b.f[0].g,
  'a.h': obj.a.h,
  'a.b.x': undefined,
  u: undefined
}

/** note that this test is basically a duplicate of the get.test.ts file,
 * only with the tests that safari can't handle due to its lack of lookbehind (ES2018)
 * grouping removed so it passes in webkit */

describe('get', () => {
  for (const path of Object.keys(fixtures)) {
    test(`"${path}"`, () => {
      expect(get(obj, path)).toEqual(fixtures[path])
    })
  }
})