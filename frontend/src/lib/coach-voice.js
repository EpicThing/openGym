// Spoken coach phrases between sets (personal fork). Phrases live in phrases.ru.json; add lines
// there. Settings are per device (localStorage): a voice is a property of the phone, not the account.
import phrases from './phrases.ru.json'
import { useStore } from '../store/useStore.js'
import { modeOf } from './history.js'
import { duckSpeech } from './rest-alert.js'

// Shuffle bag: every phrase is used once before any repeats, and a refill never starts with
// the phrase that just ended the previous bag.
export function makeBag(items, rng = Math.random) {
  const all = [...new Set(items)]
  let bag = [], last = null
  return () => {
    if (!all.length) return null
    if (!bag.length) {
      bag = [...all]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]]
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]]
    }
    last = bag.pop()
    return last
  }
}

export const DEFAULTS = { on: true, every: 1, rate: 1, volume: 1, home: false }
const KEY = 'gym_coach_voice'
export function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}
export function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* kept for this session only */ } }

// Pure gate: is a phrase wanted for this moment? `count` is how many eligible rests came before.
export function wanted({ prefs, routineName = '', mode = 'reps', category, count = 0 }) {
  if (!prefs.on) return false
  if (!prefs.home && /^дом/i.test(String(routineName).trim())) return false
  if (category !== 'workout_done' && mode === 'time') return false
  if (category === 'rest_start') return count % Math.max(1, prefs.every | 0) === 0
  return true
}

const bags = {}
const pick = cat => (bags[cat] || (bags[cat] = makeBag(phrases[cat] || [])))()

let TTS = null
// Wrapped in an object: a Capacitor plugin proxy answers `then` with a native call that never settles.
const tts = () => TTS || (TTS = import('@capacitor-community/text-to-speech').then(m => ({ T: m.TextToSpeech })).catch(() => null))

let ruOk = null
// Fails silently when the phone has no Russian voice; Settings shows a hint from this.
export async function hasRussianVoice() {
  if (ruOk === true) return true
  try {
    const T = (await tts())?.T
    ruOk = !!T && !!(await T.isLanguageSupported({ lang: 'ru-RU' })).supported
  } catch { ruOk = false }
  return ruOk
}

let timer = null, speaking = false
export function coachStop() {
  clearTimeout(timer); timer = null
  if (!speaking) return
  speaking = false
  tts().then(w => w && w.T.stop()).catch(() => {}).then(() => duckSpeech(false))
}

async function say(text, prefs) {
  try {
    if (!(await hasRussianVoice())) return
    const T = (await tts()).T
    speaking = true
    await duckSpeech(true)
    await T.speak({ text, lang: 'ru-RU', rate: prefs.rate, volume: prefs.volume })
  } catch { /* silent */ } finally {
    if (speaking) { speaking = false; duckSpeech(false) }
  }
}

// Delayed so it lands after the set-tick beep rather than over it.
const later = (text, prefs, ms = 700) => { clearTimeout(timer); timer = setTimeout(() => say(text, prefs), ms) }

const ctx = tm => {
  const A = useStore.getState().S?.active
  const e = A?.entries?.[tm?.forIdx]
  return { routineName: A?.name || '', mode: e ? modeOf({ ...(e.target || {}), id: e.id }) : 'reps' }
}

let rests = 0, prPending = false, prTimer = null
const prSeen = new Set()

// Workout.jsx: a set just beat the exercise's best. Once per exercise per workout.
export function coachPr(exId) {
  if (prSeen.has(exId)) return
  prSeen.add(exId)
  prPending = true
  clearTimeout(prTimer); prTimer = setTimeout(() => { prPending = false }, 3000)
}

// useUI.startRest: a rest began.
export function coachRestStart(tm) {
  if (!tm || tm.kind === 'switch' || tm.total < 8) return
  const prefs = loadPrefs(), c = ctx(tm)
  const pr = prPending
  prPending = false
  const category = pr ? 'set_done_pr' : 'rest_start'
  const count = pr ? 0 : rests++
  if (!wanted({ prefs, ...c, category, count })) return
  const text = pick(category)
  if (text) later(text, prefs)
}

// useUI tick, ~10 s left.
export function coachGetReady(tm) {
  if (!tm || tm.kind === 'switch' || tm.total < 25) return
  const prefs = loadPrefs()
  if (!wanted({ prefs, ...ctx(tm), category: 'get_ready' })) return
  const text = pick('get_ready')
  if (text) later(text, prefs, 0)
}

// sheets.jsx doFinishWorkout. `name` is read before the workout is cleared.
export function coachWorkoutDone(name) {
  prSeen.clear(); rests = 0
  const prefs = loadPrefs()
  if (!wanted({ prefs, routineName: name, category: 'workout_done' })) return
  const text = pick('workout_done')
  if (text) later(text, prefs, 1000)
}

export const coachSample = prefs => say(pick('rest_start') || '', prefs)
