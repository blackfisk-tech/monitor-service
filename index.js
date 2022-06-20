const { io } = require('socket.io-client')
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
const debug = require('debug')('monitor-service')

let serverList = {}
let printerList = {}
// * Server Name
let servername = os.hostname()
if (servername.split('-').length !== 3) {
  servername = fs.readFileSync('/etc/servername.conf', 'utf8').trim()
}
// * Socket Servers
const sockets = {}
const serverSocket = {}
const socketServers = {}
const socketServerEndpoints = ['https://ws.next.blackfisk.com', 'https://ws.app.blackfisk.com']
for (const socketServerEndpoint of socketServerEndpoints) {
  socketServers[socketServerEndpoint] = {
    query: `servername=${servername}&version=${pkg.version}`,
    transports: ['websocket'],
    connected: false,
    reconnectTimer: null,
    reconnectAttempts: 0
  }
}

// * CUPS Manager
let timeoutFindPrinterOnline = null
// Note: yes, the library actually spells their method "createManger".
const manager = cupsdm.createManger({
  autoAddPrinters: false,
  client: {
    baseURL: 'https://ws.app.blackfisk.com/api'
  }
})
const startCUPS = () => {
  // Announce Yourself on the network to see if any other services are listening
  bonjour.publish({ name: servername, type: 'blackfisk.server', port: 443 })
  // Start Manager
  manager.start()
  // Listen for Printer Up, Down, and Add
  registerCupsListeners()
}
const findOnlinePrinters = () => {
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
  _.each(sockets, socket => {
    socket.emit('blackfisk', { command: 'printerList', printers: printerList })
  })
}
const findOnlineServers = () => {
  _.each(serverList, server => {
    server.online = false
  })

  bonjour.find({ type: 'blackfisk.server' }, function (server) {
    serverList[server.name] = server
    serverList[server.name]['online'] = true
  })
  _.each(sockets, socket => {
    socket.emit('blackfisk', { command: 'serverList', servers: serverList })
  })
}
const registerCupsListeners = async () => {
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
        _.each(sockets, (socket) => {
          socket.emit('printer', {
            command: 'printer.up',
            ...node
          })
        })
      }
      clearTimeout(timeoutFindPrinterOnline)
      timeoutFindPrinterOnline = setTimeout(() => findOnlinePrinters(), 10 * 1000)
    })
  })

  manager.on('down', nodes => {
    _.each(nodes, async node => {
      if (node.uri.indexOf('usb') !== -1) {
        console.log('printer down', node.printer.name)
        await cups.uninstall(node.printer.name)
        _.each(sockets, (socket) => {
          socket.emit('printer', {
            command: 'printer.down',
            ...node
          })
        })
        clearTimeout(timeoutFindPrinterOnline)
        timeoutFindPrinterOnline = setTimeout(() => findOnlinePrinters(), 10 * 1000)
      }
    })
  })

  manager.on('addPrinters', nodes => {
    findOnlinePrinters()
  })
}
// * Ip Addresses
const ipAddress = { public: { ip4: null, ip6: null }, private: { ip4: null, ip6: null } }
const detectIPAddress = () => {
  publicIp.v4().then(ip => {
    ipAddress.public.ip4 = ip
    console.log(`connect ${servername} - ${ipAddress.public.ip4}`)
  })
  _.each(os.networkInterfaces(), iface => {
    _.each(iface, adapter => {
      if (adapter.address.match(/(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/) && !adapter.internal) {
        if (ipAddress.private.ip4 === null) {
          ipAddress.private.ip4 = adapter.address
          return false
        }
      }
    })
    if (ipAddress.private.ip4 !== null) {
      return false
    }
  })
}
// * Socket Servers
const onConnect = () => {
  findOnlineServers()
  findOnlinePrinters()
}
const heartbeat = (socket) => {
  const socketServer = _.invert(serverSocket)
  console.log('heartbeat', {
    socketServer: socketServer[socket.id],
    servername: servername,
    socketId: socket.id
  })
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
const execErrorHandling = (error, stdout, stderr, socket) => {
  console.log('ExecError', error, stdout)
  console.error(stderr)
  socket.emit('response', {
    command: 'bash',
    error: error,
    stdout: stdout,
    stderr: stderr
  })
}
const sleep = (ms) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
const registerSocketListeners = async (socket, conf, uri) => {
  socket
    .on('connect', function () {
      console.log(`Connected to ${uri} with socketId:`, socket.id)
      if (socket.reconnectTimer) {
        clearInterval(socket.reconnectTimer)
        socket.reconnectTimer = null
      }
      socket.reconnectAttempts = 0
      serverSocket[uri] = socket.id
      sockets[socket.id] = socket
      conf.connected = true
      onConnect()
      heartbeat(socket)
    })
    .on('print', function (data) {
      console.log('PRINT: data', data)
      let thisPrinter = new Printer(data.printer)
      let thisJob = thisPrinter.printText(data.document, data.options)
      thisJob.on('sent', function () {
        debug('sent', thisJob)
      })
      thisJob.on('completed', function () {
        console.log('Job ' + thisJob.identifier + 'has been printed')
        thisJob.removeAllListeners()
      })
    })
    .on('bash', function (data) {
      console.log('Executing command: ' + data.cmd)
      exec(data.cmd, execErrorHandling, socket)
    })
    .on('git', async function (data) {
      if (data.repo === 'monitor-service') {
        await exec('chmod a+x /home/blackfisk/monitor-service/upgrade.sh', execErrorHandling)
        await sleep(2000)
        await exec('/home/blackfisk/monitor-service/upgrade.sh', execErrorHandling)
      }
    })
    .on('disconnect', function (reason) {
      conf.connected = false
      console.error('goodbye', reason)
      console.log('Disconnect received. Reconnecting socket in 5 seconds.')
      setTimeout(() => {
        socket.open()
      }, 5000)
    })
    .on('heartbeat', function (a, b, c) {
      heartbeat(socket)
      if (socket.disconnected) {
        conf.connected = false
        console.log('Heartbeat encountered broken socket. Reconnecting in 5 seconds.')
        setTimeout(() => {
          socket.open()
        }, 5000)
      }
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
      if (!socket.reconnectTimer) {
        socket.reconnectAttempts++
        // socket.reconnectTimer = setInterval(() => registerSocketListeners(socket, conf, uri), 1000 * 10 * (socket.reconnectAttempts + 1), `Reconnect attempt: ${socket.reconnectAttempts}`)
      }
    })
    .on('reconnect_failed', function (a, b, c) {
      console.error('reconnect_failed', a, b, c)
      if (!socket.reconnectTimer) {
        socket.reconnectAttempts++
        // socket.reconnectTimer = setInterval(() => registerSocketListeners(socket, conf, uri), 1000 * 10 * (socket.reconnectAttempts + 1), `Reconnect attempt: ${socket.reconnectAttempts}`)
      }
    })
}
const startSocket = (conf, uri) => {
  try {
    const socket = io(uri, {
      transports: conf.transports,
      query: conf.query
    })
    console.log('Attempting socket connection:', {uri: uri, query: socket.query})
    registerSocketListeners(socket, conf, uri)
  } catch (err) {
    console.error(err)
  }
}
const startSockets = () => {
  _.each(socketServers, (conf, uri) => {
    startSocket(conf, uri)
  })
}
// * Startup
detectIPAddress()
// CUPS Driver
startCUPS()
// Sockets
startSockets()
