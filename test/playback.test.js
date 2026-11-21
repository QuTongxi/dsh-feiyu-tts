import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import { feiyuPhrases, speakFeiyuPhrases } from '../companion/playback.js'

const settings = { tts: { provider: 'api', model: 'FeiyuVoice-CosyVoice3' } }
const text = '先守住第三路的铁桶僵尸！现在补上第二排的豌豆射手。等下一波再种一棵向日葵。'
const parts = feiyuPhrases(text)

function playerFixture() {
  const requested = [], playing = []
  const player = {
    generation: 0,
    analyser: { disconnect() {} },
    stop() {
      this.generation++
      this.controller?.abort()
      playing.at(-1)?.finish()
    },
    decodePhrase(text) {
      const { promise, resolve, reject } = Promise.withResolvers()
      this.controller.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })
      requested.push({ text, resolve: () => resolve({ text, duration: 2 }), reject })
      return promise
    },
    playDecoded(audio, start, progress) {
      const { promise, resolve } = Promise.withResolvers()
      playing.push({ text: audio.text, finish: resolve })
      start?.()
      progress({ elapsed: 1, duration: 2 })
      return promise.then(() => progress({ elapsed: 2, duration: 2 }))
    },
  }
  return { player, requested, playing }
}

test('Chinese punctuation, quoted endings and punctuation-free input retain all spoken text', () => {
  assert.equal(parts.length, 3)
  for (const sample of [text, '他说：“先买向日葵！”然后呢？'.repeat(5), '守住这一路'.repeat(32), 'PvZ v1.5 is ready. '.repeat(8)]) {
    const phrases = feiyuPhrases(sample)
    assert.equal(phrases.join(''), sample)
    assert.ok(phrases.every(part => part.trim() && !part.startsWith('！')))
  }
})

test('short lines and other TTS providers use the native single-request player', async () => {
  const received = []
  const player = { speak: async line => received.push(line) }
  await speakFeiyuPhrases(player, settings, '先守第三路！')
  await speakFeiyuPhrases(player, { tts: { provider: 'edge' } }, text)
  assert.deepEqual(received, ['先守第三路！', text])
})

test('a short opening with a natural pause can speak its first clause immediately', () => {
  assert.deepEqual(feiyuPhrases('第三路来僵尸了，快种豌豆射手！'), ['第三路来僵尸了，', '快种豌豆射手！'])
  assert.deepEqual(feiyuPhrases('第三路马上就要守不住啦！'), ['第三路马上就要守不住啦！'])
})

test('first phrase plays before later synthesis, with one lookahead and one start callback', async () => {
  const { player, requested, playing } = playerFixture()
  const ratios = []
  let starts = 0
  const done = speakFeiyuPhrases(player, settings, text, () => starts++, p => ratios.push(p.ratio))
  assert.equal(requested.length, 1)
  requested[0].resolve()
  await nextTick()
  assert.equal(playing.length, 1)
  assert.equal(requested.length, 2)
  requested[1].resolve()
  await nextTick()
  assert.equal(playing.length, 1)
  assert.equal(requested.length, 2)
  playing[0].finish()
  await nextTick()
  assert.equal(playing.length, 2)
  assert.equal(requested.length, 3)
  requested[2].resolve()
  playing[1].finish()
  await nextTick()
  playing[2].finish()
  await done
  assert.deepEqual(playing.map(p => p.text), parts)
  assert.equal(starts, 1)
  assert.equal(ratios.at(-1), 1)
  assert.deepEqual(ratios, ratios.toSorted((a, b) => a - b))
})

test('stop aborts prefetch and never plays it; a failed prefetch propagates after the current phrase', async () => {
  for (const cancel of [true, false]) {
    const { player, requested, playing } = playerFixture()
    const done = speakFeiyuPhrases(player, settings, text)
    requested[0].resolve()
    await nextTick()
    if (cancel) {
      player.stop()
      await done
    } else {
      requested[1].reject(new Error('TTS unavailable'))
      await nextTick()
      playing[0].finish()
      await assert.rejects(done, /TTS unavailable/)
    }
    assert.equal(playing.length, 1)
    assert.equal(requested.length, 2)
  }
})
