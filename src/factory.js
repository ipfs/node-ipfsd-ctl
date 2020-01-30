'use strict'
const merge = require('merge-options').bind({ ignoreUndefined: true })
const kyOriginal = require('ky-universal').default
const { tmpDir, findBin } = require('./utils')
const { isNode } = require('ipfs-utils/src/env')
const ControllerDaemon = require('./ipfsd-daemon')
const ControllerRemote = require('./ipfsd-client')
const ControllerProc = require('./ipfsd-in-proc')
const testsConfig = require('./config')

/** @typedef {import("./index").ControllerOptions} ControllerOptions */
/** @typedef {import("./index").ControllerOptionsOverrides} ControllerOptionsOverrides */
/** @typedef {import("./index").IpfsOptions} IpfsOptions */

const ky = kyOriginal.extend({ timeout: false })
const defaults = {
  remote: !isNode,
  endpoint: 'http://localhost:43134',
  disposable: true,
  test: false,
  type: 'go',
  env: {},
  args: [],
  ipfsModule: {},
  ipfsOptions: {},
  forceKill: true,
  forceKillTimeout: 5000
}

/**
 * Factory class to spawn ipfsd controllers
 */
class Factory {
  /**
   *
   * @param {ControllerOptions} options
   * @param {ControllerOptionsOverrides} overrides - Pre-defined overrides per controller type
   */
  constructor (options = {}, overrides = {}) {
    /** @type ControllerOptions */
    this.opts = merge(defaults, options)

    /** @type ControllerOptionsOverrides */
    this.overrides = merge({
      js: merge(this.opts, { type: 'js' }),
      go: merge(this.opts, { type: 'go' }),
      proc: merge(this.opts, { type: 'proc' })
    }, overrides)

    if (!this.overrides.js.ipfsBin) {
      this.overrides.js.ipfsBin = findBin('js', this.opts.type === 'js')
    }

    if (!this.overrides.go.ipfsBin) {
      this.overrides.go.ipfsBin = findBin('go', this.opts.type === 'go')
    }

    /** @type ControllerDaemon[] */
    this.controllers = []
  }

  /**
   * Utility method to get a temporary directory
   * useful in browsers to be able to generate temp
   * repos manually
   *
   * @param {ControllerOptions} options - Controller type
   *
   * @returns {Promise<String>}
   */
  async tmpDir (options) {
    options = merge(this.opts, options)
    if (options.remote) {
      const res = await ky.get(
        `${options.endpoint}/util/tmp-dir`,
        { searchParams: { type: options.type } }
      ).json()

      return res.tmpDir
    }

    return Promise.resolve(tmpDir(options.type))
  }

  async _spawnRemote (options) {
    const res = await ky.post(
      `${options.endpoint}/spawn`,
      {
        json: {
          ...options,
          // avoid recursive spawning
          remote: false,
          // do not send code refs over http
          ipfsModule: { ...options.ipfsModule, ref: undefined },
          ipfsHttpModule: { ...options.ipfsHttpModule, ref: undefined }
        }
      }
    ).json()
    return new ControllerRemote(
      options.endpoint,
      res,
      options
    )
  }

  /**
   * Spawn an IPFSd Controller
   * @param {ControllerOptions} options
   * @returns {Promise<ControllerDaemon>}
   */
  async spawn (options = { }) {
    const type = options.type || this.opts.type
    const opts = merge(
      this.overrides[type],
      options
    )

    // conditionally include ipfs based on which type of daemon we will spawn when none has been specified
    if ((opts.type === 'js' || opts.type === 'proc') && !opts.ipfsModule) {
      opts.ipfsModule = {}
    }

    if (opts.ipfsModule) {
      if (!opts.ipfsModule.path) {
        opts.ipfsModule.path = require.resolve('ipfs')
      }

      if (!opts.ipfsModule.ref) {
        opts.ipfsModule.ref = require('ipfs')
      }
    }

    // only include the http api client if it has not been specified as an option
    // for example if we are testing the http api client itself we should not try
    // to require 'ipfs-http-client'
    if (!opts.ipfsHttpModule) {
      opts.ipfsHttpModule = {
        path: require.resolve('ipfs-http-client'),
        ref: require('ipfs-http-client')
      }
    }

    // IPFS options defaults
    const ipfsOptions = merge(
      {
        start: false,
        init: false
      },
      opts.test ? {
        config: testsConfig(opts),
        preload: { enabled: false }
      } : {},
      opts.ipfsOptions
    )

    let ctl
    if (opts.type === 'proc') {
      // spawn in-proc controller
      ctl = new ControllerProc({ ...opts, ipfsOptions })
    } else if (opts.remote) {
      // spawn remote controller
      ctl = await this._spawnRemote({ ...opts, ipfsOptions })
    } else {
      // spawn daemon controller
      ctl = new ControllerDaemon({ ...opts, ipfsOptions })
    }

    // Save the controller
    this.controllers.push(ctl)

    // Auto init and start controller
    if (opts.disposable && (!options.ipfsOptions || (options.ipfsOptions && options.ipfsOptions.init !== false))) {
      await ctl.init(ipfsOptions.init)
    }
    if (opts.disposable && (!options.ipfsOptions || (options.ipfsOptions && options.ipfsOptions.start !== false))) {
      await ctl.start()
    }

    return ctl
  }

  /**
   * Stop all controllers
   * @returns {Promise<ControllerDaemon[]>}
   */
  async clean () {
    await Promise.all(this.controllers.map(n => n.stop()))
    this.controllers = []
    return this
  }
}

module.exports = Factory
