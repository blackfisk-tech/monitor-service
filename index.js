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
const printer = require('node-printer')
console.log(printer.list())
const manager = cupsdm.createManger({autoAddPrinters: false})

let serverList = {}
let printerList = {}
let servername = os.hostname()
let ipAddress = {public: {ip4: null, ip6: null}, private: {ip4: null, ip6: null}}

if (servername.split('-').length !== 3) {
  servername = fs.readFileSync('/etc/servername.conf', 'utf8').trim()
}
const socket = io.connect(os.platform() === 'win32' ? 'http://localhost:3000' : 'https://ws.apophisapp.com', {query: 'servername=' + servername})

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
bonjour.publish({name: servername, type: 'blackfisk.server', port: 443})

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
    printer.printDirect({
      data: data.document,
      printer: data.printer,
      type: 'RAW',
      success: function () {
        console.log(data)
      },
      error: function (err) {
        console.error(err)
      }
    })
  })
  .on('bash', function (data) {
    exec(data.cmd, execErrorHandling)
  })
  .on('git', function (data) {
    console.log('git deploy', data)
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
  })
  .on('reconnect_failed', function (a, b, c) {
    console.error('reconnect_failed', a, b, c)
  })

manager.start()

function findOnlineServers () {
  _.each(serverList, server => {
    server.online = false
  })

  bonjour.find({type: 'blackfisk.server'}, function (server) {
    serverList[server.name] = server
    serverList[server.name]['online'] = true
  })
  socket.emit('blackfisk', {command: 'serverList', servers: serverList})
}

function findOnlinePrinters () {
  _.each(printerList, printer => {
    printer.online = false
  })

  ;(async () => {
    _.each(await cups.list(), printer => {
      if (printer.connection.indexOf('implicitclass') === -1) {
        printerList[printer.name] = printer
        printerList[printer.name]['online'] = true
      }
    })
  })()

  socket.emit('blackfisk', {command: 'printerList', printers: printerList})
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
  _.each(nodes, node =>
    socket.emit('printer', {
      command: 'printer.up',
      ...node
    })
  )
})

manager.on('down', nodes => {
  _.each(nodes, node =>
    socket.emit('printer', {
      command: 'printer.down',
      ...node
    })
  )
})
