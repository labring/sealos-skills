import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from './index.js'

const skillsRoot = fileURLToPath(new URL('./skills/', import.meta.url))
const expectedNames = [
  'cloud-native-readiness',
  'docker-to-sealos',
  'dockerfile-skill',
  'sealos-app-builder',
  'sealos-canvas',
  'sealos-database',
  'sealos-deploy',
  'sealos-s3',
]

describe('dsh-plugin-sealos', () => {
  it('registers every root skill bundle from skills/*/SKILL.md', async () => {
    const providers = []
    apply({
      skills: {
        registerProvider(create) {
          providers.push(create())
        },
      },
    })
    assert.equal(providers.length, 1)
    assert.equal(providers[0].name, 'sealos')

    const listed = await providers[0].list()
    assert.deepEqual(listed.map(skill => skill.name), expectedNames)
    for (const skill of listed) {
      assert.equal(skill.source, 'bundled')
      assert.equal(skill.rank, 600)
      assert.equal(skill.resourceBase.kind, 'directory')
      assert.ok(skill.resourceBase.path.startsWith(skillsRoot))
      assert.equal('content' in skill, false)
    }

    const loaded = await providers[0].get(listed.find(skill => skill.name === 'sealos-deploy'))
    assert.equal(loaded.name, 'sealos-deploy')
    assert.match(loaded.content, /# Sealos Deploy/)
    assert.doesNotMatch(loaded.content, /^---/)
    assert.equal('rank' in loaded, false)

    assert.equal(await providers[0].get({ name: 'other-skill' }), undefined)
  })
})
