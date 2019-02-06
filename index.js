const io = require('socket.io-client')
const os = require('os')
const fs = require('fs')
const ds = require('fd-diskspace')
const exec = require('child_process').exec
const publicIp = require('public-ip')
const bonjour = require('bonjour')()
const _ = require('lodash')
const cupsdm = require('cupsdm')
const cups = require('ncups')
const Printer = require('node-printer')
const pkg = require('./package.json')

const manager = cupsdm.createManger({ autoAddPrinters: false })

let serverList = {}
let printerList = {}
let servername = os.hostname()
let ipAddress = { public: { ip4: null, ip6: null }, private: { ip4: null, ip6: null } }

if (servername.split('-').length !== 3) {
  servername = fs.readFileSync('/etc/servername.conf', 'utf8').trim()
}
const socket = io.connect(os.platform() === 'win32' ? 'http://localhost:3000' : 'https://ws.blackfisk.com', { query: 'servername=' + servername + '&version=' + pkg.version })

publicIp.v4().then(ip => {
  ipAddress.public.ip4 = ip
  console.log(`connect ${servername} - ${ipAddress.public.ip4}`)
})

_.each(os.networkInterfaces(), iface => {
  _.each(iface, adapter => {
    if (adapter.address.match(/(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/) && !adapter.internal) {
      if (ipAddress.private.ip4 === null) {
        ipAddress.private.ip4 = adapter.address
      }
    }
  })
})

/*
  Announce Yourself on the network to see if any other services are listening
 */
bonjour.publish({ name: servername, type: 'blackfisk.server', port: 443 })

/*
  usbDetect.on('add', function (device) {
  })

  usbDetect.find(function (err, devices) {
    console.log('find', devices, err)
  })
*/

socket
  .on('connect', function () {
    // console.log(socket.id)
    heartbeat()
  })
  .on('print', function (data) {
    let thisPrinter = new Printer(data.printer)
    let thisJob = thisPrinter.printText(data.document, data.options)
    thisJob.on('sent', function () {
      console.log('sent', thisJob)
    })
    thisJob.on('completed', function () {
      console.log('Job ' + thisJob.identifier + 'has been printed')
      thisJob.removeAllListeners()
    })
  })
  .on('bash', function (data) {
    console.log('executing command: ' + data.cmd)
    exec(data.cmd, execErrorHandling)
  })
  .on('git', async function (data) {
    if (data.repo === 'monitor-service') {
      await exec('chmod a+x /home/blackfisk/monitor-service/upgrade.sh', execErrorHandling)
      await sleep(2000)
      await exec('/home/blackfisk/monitor-service/upgrade.sh', execErrorHandling)
    }
  })
  .on('disconnect', function (reason) {
    console.error('goodbye', reason)
  })
  .on('heartbeat', function (a, b, c) {
    heartbeat()
  })
  .on('error', function (error) {
    console.error('error', error)
  })
  .on('connect_error', function (error) {
    console.error('connect_error', error)
  })
  .on('connect_timeout', function (timeout) {
    console.error('connect_timeout', timeout)
  })
  .on('reconnecting', function (a, b, c) {
    console.error('reconnecting', a, b, c)
  })
  .on('reconnect_error', function (a, b, c) {
    console.error('reconnect_error', a, b, c)
    process.exit(0)
  })
  .on('reconnect_failed', function (a, b, c) {
    console.error('reconnect_failed', a, b, c)
    process.exit(0)
  })

manager.start()

function findOnlineServers () {
  _.each(serverList, server => {
    server.online = false
  })

  bonjour.find({ type: 'blackfisk.server' }, function (server) {
    serverList[server.name] = server
    serverList[server.name]['online'] = true
  })
  socket.emit('blackfisk', { command: 'serverList', servers: serverList })
}
let timeoutFindPrinterOnline = null
function findOnlinePrinters () {
  _.each(printerList, printer => {
    printer.online = false
  })
  // lpinfo -v
  ;(async () => {
    _.each(await cups.list(), printer => {
      if (printer.connection.indexOf('implicitclass') === -1) {
        printerList[printer.name] = printer
        printerList[printer.name]['online'] = true
      }
    })
  })()

  socket.emit('blackfisk', { command: 'printerList', printers: printerList })
}

function heartbeat () {
  console.log('heartbeat')
  findOnlineServers()
  findOnlinePrinters()
  socket.emit('response', {
    command: 'heartbeat',
    clientID: socket.id,
    servername: servername,
    uptime: os.uptime(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    type: os.type(),
    release: os.release(),
    network: os.networkInterfaces(),
    loadavg: os.loadavg(),
    diskspace: ds.diskSpaceSync(),
    ipAddress: ipAddress
  })
}

function execErrorHandling (error, stdout, stderr) {
  console.log(error, stdout, stderr)
  socket.emit('response', {
    command: 'bash',
    error: error,
    stdout: stdout,
    stderr: stderr
  })
}

/*
  Record Printers
 */
manager.on('up', nodes => {
  _.each(nodes, async node => {
    if (node.model.indexOf('Zebra') !== -1) {
      node.driver = {
        id: '',
        makeAndModel: 'Zebra ZPL Label Printer',
        lang: 'en',
        driver: 'drv:///sample.drv/zebra.ppd'
      }
      let serialNumber = _.last(node.uri.split('='))
      node.printer.name = `Zebra_ZPL_Serial_${serialNumber}`
    }
    if (node.uri.indexOf('usb') !== -1) {
      manager._addPrinters([node])
      console.log('printer up', node.printer.name)
      socket.emit('printer', {
        command: 'printer.up',
        ...node
      })
    }

    clearTimeout(timeoutFindPrinterOnline)
    timeoutFindPrinterOnline = setTimeout(() => findOnlinePrinters(), 10 * 1000)
  })
})

manager.on('down', nodes => {
  _.each(nodes, async node => {
    console.log('printer down', node.printer.name)
    await cups.uninstall(node.printer.name)

    socket.emit('printer', {
      command: 'printer.down',
      ...node
    })
    clearTimeout(timeoutFindPrinterOnline)
    timeoutFindPrinterOnline = setTimeout(() => findOnlinePrinters(), 10 * 1000)
  })
})

manager.on('addPrinters', nodes => {
  findOnlinePrinters()
})

function sleep (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
