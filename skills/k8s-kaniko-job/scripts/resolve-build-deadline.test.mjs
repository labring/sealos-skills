import assert from 'assert/strict'
import test from 'node:test'

import { resolveBuildDeadlineSeconds } from './resolve-build-deadline.mjs'

test('uses the smaller absolute remaining deadline at Job creation time', () => {
  assert.equal(
    resolveBuildDeadlineSeconds(
      {
        buildDeadlineAt: '2026-07-27T00:10:00.000Z',
        buildDeadlineSeconds: 1800,
      },
      Date.parse('2026-07-27T00:01:30.000Z'),
    ),
    510,
  )
})

test('keeps the configured deadline when it is already smaller', () => {
  assert.equal(
    resolveBuildDeadlineSeconds(
      {
        buildDeadlineAt: '2026-07-27T00:30:00.000Z',
        buildDeadlineSeconds: 600,
      },
      Date.parse('2026-07-27T00:01:00.000Z'),
    ),
    600,
  )
})

test('rejects an elapsed absolute deadline', () => {
  assert.throws(
    () =>
      resolveBuildDeadlineSeconds(
        {
          buildDeadlineAt: '2026-07-27T00:01:00.000Z',
          buildDeadlineSeconds: 600,
        },
        Date.parse('2026-07-27T00:01:00.000Z'),
      ),
    /build deadline has elapsed/,
  )
})

test('retains the bounded fallback for callers without a runtime contract', () => {
  assert.equal(resolveBuildDeadlineSeconds({}, 0), 1800)
})

test('rejects configured deadlines above the code-owned maximum', () => {
  assert.throws(
    () => resolveBuildDeadlineSeconds({ buildDeadlineSeconds: 1801 }, 0),
    /must be an integer from 1 to 1800/,
  )
})
