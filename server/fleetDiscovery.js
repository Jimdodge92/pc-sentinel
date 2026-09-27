const dgram = require('dgram');
const os = require('os');

const UDP_PORT = 3501;
const BROADCAST_ADDR = '255.255.255.255';

class FleetDiscovery {
  constructor(getDeviceInfoFn, getLocalIpFn, httpPort = 3500) {
    this.getDeviceInfo = getDeviceInfoFn;
    this.getLocalIp = getLocalIpFn;
    this.httpPort = httpPort;
    this.socket = null;
    this.broadcastTimer = null;
    this.cleanupTimer = null;
    this.discoveredPeers = new Map(); // key: deviceId or shortCode -> peer info
  }

  start() {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.warn('[FleetDiscovery] UDP Socket error:', err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString('utf8'));
          if (data && data.deviceId && data.type === 'pc_sentinel_beacon') {
            const myInfo = this.getDeviceInfo();
            // Ignore own beacon
            if (data.deviceId === myInfo.deviceId) return;

            const peer = {
              deviceId: data.deviceId,
              shortCode: data.shortCode || data.deviceId.replace(/^SENT-/, ''),
              deviceName: data.deviceName || 'PC Sentinel Machine',
              ip: data.ip || rinfo.address,
              port: data.port || 3500,
              url: `http://${data.ip || rinfo.address}:${data.port || 3500}`,
              lastSeen: Date.now()
            };

            this.discoveredPeers.set(peer.deviceId, peer);
            if (peer.shortCode) {
              this.discoveredPeers.set(peer.shortCode.toLowerCase(), peer);
            }
          }
        } catch (e) {
          // Ignore malformed UDP packet
        }
      });

      this.socket.bind(UDP_PORT, () => {
        try {
          this.socket.setBroadcast(true);
        } catch (e) {
          // Some OS configurations restrict broadcast
        }
        console.log(`[FleetDiscovery] UDP beacon listening on port ${UDP_PORT}`);

        // Broadcast presence every 6 seconds
        this.broadcastPresence();
        this.broadcastTimer = setInterval(() => this.broadcastPresence(), 6000);

        // Prune peers inactive for > 30 seconds
        this.cleanupTimer = setInterval(() => this.cleanupStalePeers(), 15000);
      });
    } catch (e) {
      console.warn('[FleetDiscovery] Could not initialize UDP discovery:', e.message);
    }
  }

  broadcastPresence() {
    if (!this.socket) return;
    try {
      const dev = this.getDeviceInfo();
      const localIp = this.getLocalIp();
      const shortCode = dev.deviceId ? dev.deviceId.replace(/^SENT-/, '') : '';

      const payload = Buffer.from(JSON.stringify({
        type: 'pc_sentinel_beacon',
        deviceId: dev.deviceId,
        shortCode,
        deviceName: dev.deviceName,
        ip: localIp,
        port: this.httpPort,
        time: Date.now()
      }));

      this.socket.send(payload, 0, payload.length, UDP_PORT, BROADCAST_ADDR, (err) => {
        if (err && err.code !== 'ENETUNREACH') {
          // Non-critical network warning
        }
      });
    } catch (e) {
      // Non-blocking
    }
  }

  cleanupStalePeers() {
    const cutoff = Date.now() - 30000;
    for (const [key, peer] of this.discoveredPeers.entries()) {
      if (peer.lastSeen < cutoff) {
        this.discoveredPeers.delete(key);
      }
    }
  }

  getDiscoveredPeers() {
    const unique = new Map();
    for (const peer of this.discoveredPeers.values()) {
      unique.set(peer.deviceId, peer);
    }
    return Array.from(unique.values());
  }

  resolveCode(code) {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    const withoutPrefix = clean.replace(/^sent-/, '');

    // Check if it's THIS machine
    const dev = this.getDeviceInfo();
    const localIp = this.getLocalIp();
    const myShort = dev.deviceId ? dev.deviceId.replace(/^SENT-/, '').toLowerCase() : '';
    if (clean === dev.deviceId.toLowerCase() || withoutPrefix === myShort) {
      return {
        deviceId: dev.deviceId,
        shortCode: myShort,
        deviceName: dev.deviceName,
        ip: localIp,
        port: this.httpPort,
        url: `http://${localIp}:${this.httpPort}`,
        isSelf: true
      };
    }

    // Check discovered peers
    if (this.discoveredPeers.has(clean)) {
      return this.discoveredPeers.get(clean);
    }
    if (this.discoveredPeers.has(withoutPrefix)) {
      return this.discoveredPeers.get(withoutPrefix);
    }

    return null;
  }

  stop() {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
    }
  }
}

module.exports = { FleetDiscovery };
