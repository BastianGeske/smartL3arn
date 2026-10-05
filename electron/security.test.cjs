'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { isTrustedSender, configureWindowSecurity } = require('./security.cjs')
const url = 'file:///application/web-dist/index.html'

test('IPC permits only the local main frame of the expected window', () => {
  const frame = { url: `${url}#/smart` }
  const contents = { mainFrame: frame }
  const event = { sender: contents, senderFrame: frame }
  assert.equal(isTrustedSender(event, contents, url), true)
  assert.equal(isTrustedSender({ ...event, sender: {} }, contents, url), false)
  assert.equal(isTrustedSender({ ...event, senderFrame: { url } }, contents, url), false)
  for (const untrusted of ['https://example.com', 'file:///etc/passwd', `${url}?redirect=1`]) {
    frame.url = untrusted
    assert.equal(isTrustedSender(event, contents, url), false)
  }
})

test('unexpected windows, navigation, webviews and permission requests are blocked', () => {
  const events = {}
  let open, request, check
  configureWindowSecurity({ webContents: {
    setWindowOpenHandler: handler => { open = handler },
    on: (name, handler) => { events[name] = handler },
    session: { setPermissionRequestHandler: handler => { request = handler }, setPermissionCheckHandler: handler => { check = handler } },
  } }, url)
  assert.deepEqual(open(), { action: 'deny' })
  let blocked = 0
  const event = { preventDefault: () => { blocked++ } }
  events['will-navigate'](event, `${url}#/preferences`)
  assert.equal(blocked, 0)
  events['will-navigate'](event, 'https://example.com')
  events['will-attach-webview'](event)
  assert.equal(blocked, 2)
  request(null, 'camera', allowed => assert.equal(allowed, false))
  assert.equal(check(), false)
})
