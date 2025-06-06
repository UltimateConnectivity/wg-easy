'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require("crypto");

const debug = require('debug')('WireGuard');
const uuid = require('uuid');
const QRCode = require('qrcode');

const Util = require('./Util');
const ServerError = require('./ServerError');

const {
  WG_PATH,
  WG_HOST,
  WG_PORT,
  WG_MTU,
  WG_DEFAULT_DNS,
  WG_DEFAULT_ADDRESS,
  WG_PERSISTENT_KEEPALIVE,
  WG_ALLOWED_IPS,
  WG_PRE_UP,
  WG_POST_UP,
  WG_PRE_DOWN,
  WG_POST_DOWN,
} = require('../config');

module.exports = class WireGuard {

  async getConfig() {
    if (!this.__configPromise) {
      this.__configPromise = Promise.resolve().then(async () => {
        if (!WG_HOST) {
          throw new Error('WG_HOST Environment Variable Not Set!');
        }

        debug('Loading configuration...');
        let config;
        try {
          config = await fs.readFile(path.join(WG_PATH, 'wg0.json'), 'utf8');
          config = JSON.parse(config);
          debug('Configuration loaded.');
        } catch (err) {
          const privateKey = await Util.exec('wg genkey');
          const publicKey = await Util.exec(`echo ${privateKey} | wg pubkey`, {
            log: 'echo ***hidden*** | wg pubkey',
          });
          const address = WG_DEFAULT_ADDRESS.replace('x', '0').replace('y', '0').replace('z', '1');

          config = {
            server: {
              privateKey,
              publicKey,
              address,
            },
            clients: {},
          };
          debug('Configuration generated.');
        }

        await this.__saveConfig(config);
        await Util.exec('wg-quick down wg0').catch(() => { });
        await Util.exec('wg-quick up wg0').catch((err) => {
          if (err && err.message && err.message.includes('Cannot find device "wg0"')) {
            throw new Error('WireGuard exited with the error: Cannot find device "wg0"\nThis usually means that your host\'s kernel does not support WireGuard!');
          }

          throw err;
        });
        // await Util.exec(`iptables -t nat -A POSTROUTING -s ${WG_DEFAULT_ADDRESS.replace('x', '0')}/24 -o ' + WG_DEVICE + ' -j MASQUERADE`);
        // await Util.exec('iptables -A INPUT -p udp -m udp --dport 51820 -j ACCEPT');
        // await Util.exec('iptables -A FORWARD -i wg0 -j ACCEPT');
        // await Util.exec('iptables -A FORWARD -o wg0 -j ACCEPT');

        // Pre-create all possible clients here
        config.clients = await this.__precreateClients(config);
        await this.__saveConfig(config);
        await this.__syncConfig();

        return config;
      });
    }

    return this.__configPromise;
  }

  __genKeyPair() {
    let k = crypto.generateKeyPairSync("x25519", {
        publicKeyEncoding: { format: "der", type: "spki" },
        privateKeyEncoding: { format: "der", type: "pkcs8" }
    });

    return {
      publicKey: k.publicKey.slice(12).toString("base64"),
        privateKey: k.privateKey.slice(16).toString("base64")
    };
  }

  async __precreateClients(config) {
    const clients = config.clients;

    //precheck if last client is allocated
    if(Object.values(config.clients).find(client => client.address === `10.0.254.254`)) return clients;

    // Pre-create all possible clients here
    for (let i = 0; i < 1; i++) {
      for (let j = 0; j < 255; j++) {
        debug(`Pre-creating clients ${i}.${j}`);
        for (let k = 2; k < 255; k++) {
          const address = WG_DEFAULT_ADDRESS.replace('x', i).replace('y', j).replace('z', k);
          const client = Object.values(config.clients).find(client => client.address === address);

          if (!client) {
            const {publicKey, privateKey} = this.__genKeyPair();
            const preSharedKey = await Util.keyToBase64(Util.generatePresharedKey())
            const clientId = uuid.v4();

            clients[clientId] = {
              name: 'Unallocated',
              id: clientId,
              address,
              privateKey,
              publicKey,
              preSharedKey,
              serverPublicKey: config.server.publicKey,

              createdAt: new Date(),
              updatedAt: new Date(),

              enabled: true,
              allocated: false,
            };
          } else if(client && client.allocated == undefined){
            clients[client.id] = {...client, allocated: true};
          }
        }
      }
    }

    return clients;
  }

  async softSaveConfig() {
    const config = await this.getConfig();
    await this.__saveConfig(config);
  }

  async saveConfig() {
    const config = await this.getConfig();
    await this.__saveConfig(config);
    await this.__syncConfig();
  }

  async __saveConfig(config) {
    let result = `
# Note: Do not edit this file directly.
# Your changes will be overwritten!

# Server
[Interface]
PrivateKey = ${config.server.privateKey}
Address = ${config.server.address}/8
ListenPort = 51820
Table = off
PreUp = ${WG_PRE_UP}
PostUp = ${WG_POST_UP}
PreDown = ${WG_PRE_DOWN}
PostDown = ${WG_POST_DOWN}
`;

    for (const [clientId, client] of Object.entries(config.clients)) {
      if (!client.enabled) continue;

      result += `

# Client: ${client.name} (${clientId})
[Peer]
PublicKey = ${client.publicKey}
PresharedKey = ${client.preSharedKey}
AllowedIPs = ${client.address}/32`;
    }

    debug('Config saving...');
    await fs.writeFile(path.join(WG_PATH, 'wg0.json'), JSON.stringify(config, false, 2), {
      mode: 0o660,
    });
    await fs.writeFile(path.join(WG_PATH, 'wg0.conf'), result, {
      mode: 0o600,
    });
    debug('Config saved.');
  }

  async __syncConfig() {
    debug('Config syncing...');
    await Util.exec('wg syncconf wg0 <(wg-quick strip wg0)');
    debug('Config synced.');
  }

  async getClients() {
    const config = await this.getConfig();
    const clients = Object.entries(config.clients)
    .filter(([clientId, client]) => client.allocated)
    .map(([clientId, client]) => ({
      id: clientId,
      name: client.name,
      enabled: client.enabled,
      address: client.address,
      publicKey: client.publicKey,
      createdAt: new Date(client.createdAt),
      updatedAt: new Date(client.updatedAt),
      allowedIPs: client.allowedIPs,

      persistentKeepalive: null,
      latestHandshakeAt: null,
      transferRx: null,
      transferTx: null,
    }));

    // Loop WireGuard status
    const dump = await Util.exec('wg show wg0 dump', {
      log: false,
    });
    dump
      .trim()
      .split('\n')
      .slice(1)
      .forEach((line) => {
        const [
          publicKey,
          preSharedKey, // eslint-disable-line no-unused-vars
          endpoint, // eslint-disable-line no-unused-vars
          allowedIps, // eslint-disable-line no-unused-vars
          latestHandshakeAt,
          transferRx,
          transferTx,
          persistentKeepalive,
        ] = line.split('\t');

        const client = clients.find((client) => client.publicKey === publicKey);
        if (!client) return;

        client.latestHandshakeAt = latestHandshakeAt === '0'
          ? null
          : new Date(Number(`${latestHandshakeAt}000`));
        client.transferRx = Number(transferRx);
        client.transferTx = Number(transferTx);
        client.persistentKeepalive = persistentKeepalive;
      });

    return clients;
  }

  async getClient({ clientId }) {
    const config = await this.getConfig();
    const client = config.clients[clientId];
    if (!client) {
      throw new ServerError(`Client Not Found: ${clientId}`, 404);
    }

    return client;
  }

  async getClientConfiguration({ clientId }) {
    const config = await this.getConfig();
    const client = await this.getClient({ clientId });

    return `
[Interface]
PrivateKey = ${client.privateKey}
Address = ${client.address}/8
${WG_DEFAULT_DNS ? `DNS = ${WG_DEFAULT_DNS}` : ''}
${WG_MTU ? `MTU = ${WG_MTU}` : ''}

[Peer]
PublicKey = ${config.server.publicKey}
PresharedKey = ${client.preSharedKey}
AllowedIPs = ${WG_ALLOWED_IPS}
PersistentKeepalive = ${WG_PERSISTENT_KEEPALIVE}
Endpoint = ${WG_HOST}:${WG_PORT}`;
  }

  async getClientQRCodeSVG({ clientId }) {
    const config = await this.getClientConfiguration({ clientId });
    return QRCode.toString(config, {
      type: 'svg',
      width: 512,
    });
  }

  async createClient({ name }) {
    if (!name) {
      throw new Error('Missing: Name');
    }

    const config = await this.getConfig();

    // All clients exist already
    // const privateKey = await Util.exec('wg genkey');
    // const publicKey = await Util.exec(`echo ${privateKey} | wg pubkey`);
    // const preSharedKey = await Util.exec('wg genpsk');

    // Calculate next IP
    // let address;
    // outerloop: for (let i = 0; i < 1; i++) {
    //   for (let j = 0; j < 255; j++) {
    //     for (let k = 2; k < 255; k++) {
    //       const client = Object.values(config.clients).find(client => {
    //         return client.address === WG_DEFAULT_ADDRESS.replace('x', i).replace('y', j).replace('z', k);
    //       });

    //       if (client && !client?.allocated) {
    //         address = WG_DEFAULT_ADDRESS.replace('x', i).replace('y', j).replace('z', k);
    //         break outerloop;
    //       }
    //     }
    //   }
    // }
    const client = Object.values(config.clients).find(client => client.allocated === false)

    if (!client) {
      throw new Error('Maximum number of clients reached.');
    }

    // Create Client
    // const id = uuid.v4();
    // const client = {
    //   id: clientId,
    //   name,
    //   address,
    //   privateKey,
    //   publicKey,
    //   preSharedKey,
    //   serverPublicKey: config.server.publicKey,

    //   createdAt: new Date(),
    //   updatedAt: new Date(),

    //   enabled: true,
    // };
    client.allocated = true;
    client.name = name;
    client.updatedAt = new Date();

    config.clients[client.id] = client;

    await this.softSaveConfig();

    return client;
  }

  async deleteClient({ clientId }) {
    const config = await this.getConfig();

    if (config.clients[clientId]) {
      delete config.clients[clientId];
      await this.saveConfig();
    }
  }

  async enableClient({ clientId }) {
    const client = await this.getClient({ clientId });

    client.enabled = true;
    client.updatedAt = new Date();

    await this.saveConfig();
  }

  async disableClient({ clientId }) {
    const client = await this.getClient({ clientId });

    client.enabled = false;
    client.updatedAt = new Date();

    await this.saveConfig();
  }

  async updateClientName({ clientId, name }) {
    const client = await this.getClient({ clientId });

    client.name = name;
    client.updatedAt = new Date();

    await this.saveConfig();
  }

  async updateClientAddress({ clientId, address }) {
    const client = await this.getClient({ clientId });

    if (!Util.isValidIPv4(address)) {
      throw new ServerError(`Invalid Address: ${address}`, 400);
    }

    client.address = address;
    client.updatedAt = new Date();

    await this.saveConfig();
  }

};
