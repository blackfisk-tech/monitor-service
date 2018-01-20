const io = require('socket.io-client')
const os = require('os')
const ds = require('fd-diskspace')
const socket = io.connect('https://ws.apophisapp.com', {query: 'servername=' + os.hostname()})
const exec = require('child_process').exec
const publicIp = require('public-ip')

let ipAddress = {ip4: null, ip6: null}

publicIp.v4().then(ip => {
  ipAddress.ip4 = ip
})

socket
  .on('connect', async function () {
    console.log({
      command: 'heartbeat',
      clientID: socket.id,
      servername: os.hostname(),
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
  })
  .on('bash', function (data) {
    exec(data.cmd, execErrorHandling)
  })
  .on('disconnect', function () {
    console.log('goodbye')
  })
  .on('heartbeat', async function (a, b, c) {
    socket.emit('response', {
      command: 'heartbeat',
      clientID: socket.id,
      servername: os.hostname(),
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
  })

function execErrorHandling (error, stdout, stderr) {
  socket.emit('response', {
    command: 'bash',
    error: error,
    stdout: stdout,
    stderr: stderr
  })
}
