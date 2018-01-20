const io = require('socket.io-client')
const os = require('os')
const fs = require('fs')
const ds = require('fd-diskspace')
const exec = require('child_process').exec
const publicIp = require('public-ip')

let servername = os.hostname()
let ipAddress = {ip4: null, ip6: null}

if (servername.split('-').length !== 3) {
  servername = fs.readFileSync('/etc/servername.conf', 'utf8')
  console.log(servername)
}

const socket = io.connect('https://ws.apophisapp.com', {query: 'servername=' + servername})

publicIp.v4().then(ip => {
  ipAddress.ip4 = ip
})

socket
  .on('connect', function () {
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
