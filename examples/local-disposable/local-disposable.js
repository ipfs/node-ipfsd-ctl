/* eslint no-console: 0 */
'use strict'

// Start a disposable node, and get access to the api
// print the node id

// IPFS_PATH will point to /tmp/ipfs_***** and will be
// cleaned up when the process exits.

const factory = require('ipfsd-ctl')
const localController = factory.localController

// start a go daemon
localController.spawn((err, ipfsd) => {
  if (err) {
    throw err
  }

  const ipfs = ipfsd.ctl
  const node = ipfsd.ctrl
  ipfs.id(function (err, id) {
    if (err) {
      throw err
    }

    console.log('go-ipfs')
    console.log(id)
    node.stopDaemon()
  })
})

// start a js daemon
localController.spawn({ isJs: true }, (err, ipfsd) => {
  if (err) {
    throw err
  }

  const ipfs = ipfsd.ctl
  const node = ipfsd.ctrl
  ipfs.id(function (err, id) {
    if (err) {
      throw err
    }

    console.log('js-ipfs')
    console.log(id)
    node.stopDaemon()
  })
})