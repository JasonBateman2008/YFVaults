const WebSocket = require('ws');
const Eth = require('web3-eth');
const Web3Provider = require('web3-providers-http');
const { MdexFactory, MdexPair, FarmPool } = require('./abi');
const { MDEX_FACTORY, VAULTS_CONTRACT } = process.env;

const options = {
  timeout: 30000, // ms

  // // Useful for credentialed urls, e.g: ws://username:password@localhost:8546
  // headers: {
  //   authorization: 'Basic ' + Buffer.from(':'+PROJECT_SECRET,'utf8').toString('base64')
  // },

  clientConfig: {
    // Useful if requests are large
    maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
    maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

    // Useful to keep a connection alive
    keepalive: true,
    keepaliveInterval: 60000 // ms
  },

  // Enable auto reconnection
  reconnect: {
    auto: true,
    delay: 5000, // ms
    maxAttempts: 5,
    onTimeout: false
  }
};

const providers = new Map([[ 'heco', 'https://http-mainnet-node.huobichain.com' ]].map(([ network, url ]) => {
  return [ '/'+network, [
    new WebSocket.Server({ noServer: true }),
    new Eth(new Web3Provider(url, options))
  ]];
}))

for (const [ wss, provider ] of providers.values()) {
  // provider.subscribe('newBlockHeaders').on('data', ({ number }) => {
  //   wss.clients.forEach(client => {
  //     if (client.readyState === WebSocket.OPEN) {
  //       client.send(JSON.stringify({ 'type': 'block/header', data: number }));
  //     }
  //   })
  // }).on('error', err => console.error(err));

  wss.on('connection', (ws, network) => {
    ws.on('message', payload => {
      try {
        const event = JSON.parse(payload);
        const [ _, provider ] = providers.get(network);

        if (event.type) {
          const { type, data, defaultBlock } = event;
          console.log('[DEBUG] %s on %s', type, network);

          // web3.eth.call
          if (event.type.startsWith('web3/call')) {
            provider.call(data, defaultBlock || 'latest').then(hex => {
              ws.send(JSON.stringify({ type, data: { hex, network }}))
            });
          }

          // web3.eth.getPastLogs
          if (event.type.startsWith('web3/logs')) {
            provider.getPastLogs(data).then(result => {
              ws.send(JSON.stringify({ type, data: result }))
            });
          }
        }
        else {
          console.log('[DEBUG] onmessage: %s', payload);
        }
      } catch(err) {
        console.error(err);
      }
    });
  })
}

const [, heco ]= providers.get('/heco');
module.exports = exports = providers;

exports.heco = heco;
exports.pool = new heco.Contract(FarmPool, VAULTS_CONTRACT); // YF Vaults

// Mdex
exports.factory = new heco.Contract(MdexFactory, MDEX_FACTORY);
exports.lpToken = new heco.Contract(MdexPair);

