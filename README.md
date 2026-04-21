# BeLaz — AmneziaWG VPN Manager for OpenWrt

**BeLaz** is a LuCI web interface for managing [AmneziaWG](https://github.com/amnezia-vpn/amneziawg-openwrt) VPN servers and clients on OpenWrt routers. It supports AWG protocol versions 1.0 and 2.0 with full obfuscation parameter control, multi-server setup, advanced routing, and traffic statistics.

---

## Features

### Server Management
- Create and delete multiple AmneziaWG servers (AWG 1.0 / 2.0)
- Auto-generated obfuscation parameters (Jc, Jmin, Jmax, S1–S4, H1–H4, I1)
- AWG 2.0: range-based H1–H4 values, S3/S4 parameters, optional DNS masking via I1
- Automatic firewall zone and forwarding rules via UCI
- Custom port and subnet support

### Client Management
- Add / delete clients per server
- Auto IP assignment within server subnet
- Download `.conf` files directly from the web UI
- Enable / disable individual clients without deleting them
- Per-client traffic stats (RX / TX) with online/offline status badge

### Traffic Statistics
- Monthly accumulated traffic per client
- Persistent across tunnel restarts (delta tracking)
- Collected every 5 minutes via cron

### Advanced Routing
- **Cascade** — chain one AWG tunnel through another (e.g. exit via a second VPN)
- **Load balancing / failover** — multipath routing across multiple tunnels with configurable weights
- **Policy-based routing** — route specific CIDRs (address lists) through a chosen tunnel or blackhole them
- Separate Linux routing tables per exit node (tables 100–149)
- Priority-based `ip rule` management (policy: 100–199, cascade: 200–299)

### Address Lists
- Named CIDR groups for use in policy routing rules
- Manage lists from the UI (add, edit, delete)
- Auto-normalize bare IPs to `/32`

### Health Monitoring
- Ping-based tunnel health check every 30 seconds
- Integrates with `mwan3` — marks interfaces online/offline on status change
- Automatically reapplies routing rules on recovery
- Health status badges (↑/↓) in the Routing tab

---

## Requirements

- OpenWrt 22.03 or newer
- [AmneziaWG kernel module and tools](https://github.com/Slava-Shchipunov/awg-openwrt)
- LuCI web interface
- `uhttpd`, `rpcd`

### Install AmneziaWG (via SSH)

```sh
sh <(wget -O - https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/refs/heads/master/amneziawg-install.sh)
```

---

## Installation

### Option 1 — Install pre-built IPK

Download the latest `.ipk` from [Releases](../../releases/latest) and install:

```sh
opkg install luci-app-belaz_*.ipk
```

### Option 2 — Build from source

Requires Linux or WSL with standard shell tools (`tar`, `gzip`):

```sh
git clone https://github.com/sysbedlam/belaz.git
cd belaz
./build_ipk.sh [version] [arch]
# Example:
./build_ipk.sh 0.0.1 x86_64
```

Then copy the resulting `.ipk` to your router and install with `opkg install`.

---

## File Structure

```
belaz/
├── build_ipk.sh                                    # IPK build script
├── htdocs/
│   └── luci-static/resources/view/
│       └── awg-manager.js                          # LuCI frontend (JavaScript)
└── root/
    ├── usr/
    │   ├── bin/
    │   │   ├── awg-manager-backend                 # Shell backend (servers, clients, stats, routing)
    │   │   ├── awg-routing                         # Routing table management
    │   │   ├── awg-healthcheck                     # Tunnel health monitor
    │   │   └── awg-stats-collect                   # Cron stats collector
    │   └── share/
    │       ├── luci/menu.d/
    │       │   └── luci-app-awg-manager.json       # LuCI menu entry
    │       └── rpcd/acl.d/
    │           └── luci-app-awg-manager.json       # rpcd ACL permissions
    └── etc/
        ├── cron.d/
        │   └── awg-manager                         # Cron jobs (stats + healthcheck)
        └── init.d/
            └── awg-manager                         # Init script (routing apply/flush)
```

---

## How It Works

### Backend (`awg-manager-backend`)
A shell script that handles all server-side operations called by LuCI via `rpcd/fs.exec`:
- **Servers**: creates UCI network/firewall entries for each AWG interface
- **Clients**: generates WireGuard config files, assigns IPs, registers peers via UCI
- **Stats**: tracks per-peer RX/TX deltas, accumulates monthly totals in JSON
- **Routing**: reads/writes `routing.json` and delegates apply to `awg-routing`
- **Address lists**: manages named CIDR lists in `address-lists.json`

### Routing (`awg-routing`)
Applies Linux policy routing from `routing.json`:
- Flushes rules (priority 100–299) and tables (100–149) on each apply
- Assigns persistent table numbers per exit node (stored in `tables.json`)
- Supports cascade, balancer (multipath `ip route`), and per-CIDR policy rules

### Health Monitor (`awg-healthcheck`)
Runs every 30 seconds (via two cron entries with 30s offset):
- Pings 8.8.8.8 via each monitored interface
- Writes status to `healthcheck.json`
- Notifies `mwan3` on state change, reapplies routing

---

## Configuration Files (on router)

| Path | Description |
|---|---|
| `/etc/awg-manager/servers/<name>/server.conf` | Server parameters |
| `/etc/awg-manager/servers/<name>/clients/*.conf` | Client WireGuard configs |
| `/etc/awg-manager/routing.json` | Routing rules (cascades, balancers, policies) |
| `/etc/awg-manager/address-lists.json` | Address lists for policy routing |
| `/etc/awg-manager/stats/<name>.json` | Monthly traffic stats |
| `/etc/awg-manager/healthcheck.json` | Current tunnel health status |
| `/etc/awg-manager/tables.json` | Routing table number registry |

---

## License

MIT

---

*Developed by [beit24.ru](https://beit24.ru)*
