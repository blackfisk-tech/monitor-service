const io = require('socket.io-client')
const os = require('os')
const fs = require('fs')
const ds = require('fd-diskspace')
const exec = require('child_process').exec
const publicIp = require('public-ip')
const bonjour = require('bonjour')()
const _ = require('lodash')
const cupsdm = require('cupsdm')

const manager = cupsdm.createManger({autoAddPrinters: false})

let servername = os.hostname()
let ipAddress = {ip4: null, ip6: null}

if (servername.split('-').length !== 3) {
  servername = fs.readFileSync('/etc/servername.conf', 'utf8').trim()
}

const socket = io.connect('https://ws.apophisapp.com', {query: 'servername=' + servername})

publicIp.v4().then(ip => {
  ipAddress.ip4 = ip
})

bonjour.publish({name: servername, type: 'blackfisk.server', port: 443})

/*
  usbDetect.on('add', function (device) {
    console.log('add', device)
  })

  usbDetect.find(function (err, devices) {
    console.log('find', devices, err)
  })
*/

socket
  .on('connect', function () {
    console.log(`connect ${servername} - ${ipAddress.ip4}`)
    heartbeat()
  })
  .on('bash', function (data) {
    exec(data.cmd, execErrorHandling)
  })
  .on('disconnect', function () {
    console.log('goodbye')
  })
  .on('heartbeat', function (a, b, c) {
    heartbeat()
  })

manager.on('up', nodes => {
  _.each(nodes, node =>
    socket.emit('response', {
      command: 'blackfisk.printer.up',
      ...node
    })
  )
})
manager.on('down', nodes => {
  _.each(nodes, node =>
    socket.emit('response', {
      command: 'blackfisk.printer.down',
      ...node
    })
  )
})

manager.start()

bonjour.find({type: 'blackfisk.server'}, function (service) {
  socket.emit('response', {
    command: 'blackfisk.server',
    ...service
  })
})

function heartbeat () {
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
