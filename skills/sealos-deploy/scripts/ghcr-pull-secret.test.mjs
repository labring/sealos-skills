import assert from 'assert/strict'
import test from 'node:test'

import {
  documentKind,
  patchTemplatePullSecret,
  splitYamlDocuments,
} from './ghcr-pull-secret.mjs'

const dockerConfigJson = JSON.stringify({
  auths: {
    'ghcr.io': {
      auth: Buffer.from('user:token').toString('base64'),
    },
  },
})

const template = `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: demo
spec:
  title: Demo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${{ defaults.app_name }}
spec:
  template:
    spec:
      containers:
        - name: demo
          image: ghcr.io/demo/app:prepare
`

test('inserts pull Secret after Template so Template remains first document', () => {
  const patched = patchTemplatePullSecret(template, dockerConfigJson)
  const documents = splitYamlDocuments(patched)

  assert.equal(documentKind(documents[0]), 'Template')
  assert.equal(documentKind(documents[1]), 'Secret')
  assert.equal(documentKind(documents[2]), 'Deployment')
  assert.match(documents[2], /imagePullSecrets:\n\s+- name: \$\{\{ defaults\.app_name \}\}/)
})
