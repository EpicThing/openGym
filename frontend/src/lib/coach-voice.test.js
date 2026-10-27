// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import phrases from './phrases.ru.json'
import { makeBag, wanted, DEFAULTS } from './coach-voice.js'

const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

describe('makeBag', () => {
  it('uses every phrase once before any repeat', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const next = makeBag(items, seeded(7))
    for (let round = 0; round < 4; round++) {
      const got = Array.from(items, () => next())
      expect([...got].sort()).toEqual(items)
    }
  })
  it('never repeats across a refill boundary', () => {
    const next = makeBag(['a', 'b', 'c'], seeded(3))
    let prev = null
    for (let i = 0; i < 300; i++) { const x = next(); expect(x).not.toBe(prev); prev = x }
  })
  it('copes with one phrase, none, and duplicates', () => {
    expect(makeBag(['x'])()).toBe('x')
    expect(makeBag([])()).toBeNull()
    const next = makeBag(['a', 'a', 'b'], seeded(1))
    expect([next(), next()].sort()).toEqual(['a', 'b'])
  })
})

describe('wanted', () => {
  const p = { ...DEFAULTS }
  it('is silent when off, in time mode and in "Дом" routines unless enabled', () => {
    expect(wanted({ prefs: { ...p, on: false }, category: 'rest_start' })).toBe(false)
    expect(wanted({ prefs: p, mode: 'time', category: 'rest_start' })).toBe(false)
    expect(wanted({ prefs: p, routineName: 'Дом — Верх', category: 'rest_start' })).toBe(false)
    expect(wanted({ prefs: { ...p, home: true }, routineName: 'Дом — Верх', category: 'rest_start' })).toBe(true)
    expect(wanted({ prefs: p, routineName: 'День A', category: 'rest_start' })).toBe(true)
  })
  it('honours the frequency for rest phrases only', () => {
    const two = { ...p, every: 2 }
    expect([0, 1, 2, 3].map(count => wanted({ prefs: two, category: 'rest_start', count }))).toEqual([true, false, true, false])
    expect(wanted({ prefs: two, category: 'get_ready', count: 1 })).toBe(true)
  })
})

describe('phrases.ru.json', () => {
  const cats = ['rest_start', 'get_ready', 'set_done_pr', 'workout_done']
  it('has every category, about 150 unique lines', () => {
    cats.forEach(c => expect(phrases[c].length).toBeGreaterThan(20))
    const all = cats.flatMap(c => phrases[c])
    expect(all.length).toBeGreaterThanOrEqual(150)
    expect(new Set(all).size).toBe(all.length)
  })
  it('keeps off the banned themes', () => {
    const bad = /боль(?!ше)|no pain|жир|толст|худ[оы]|мат/i
    cats.flatMap(c => phrases[c]).forEach(x => expect(x).not.toMatch(bad))
  })
})
