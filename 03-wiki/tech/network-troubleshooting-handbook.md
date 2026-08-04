---
title: Network Troubleshooting Handbook
lang: en
translations:
  cn: tech/network-troubleshooting-handbook.cn
tags:
  - network
  - security
  - workflow
---

> Errors are inevitable — read critically.

## Contents

- **Core Principle**: Network problems = packets not flowing as expected
- **Golden Troubleshooting Flow**: Bottom-up, layer by layer
- **Eleven Phases**: Interface → IP → Route → ARP → Connectivity → Path → Port → Capture
- **The Complete Life of a ping**: What happens behind a single ping
- **Four Network Communication Paths**: Local, same subnet, cross-subnet, NAT
- **NAT / iptables / conntrack Deep Dive**: Their relationship and debugging
- **Dual NIC Management**: Multi-route tables, DHCP, nmcli
- **Tool Quick Reference**: Minimal toolset for Linux + Windows

---

## I. Core Principles

### The Nature of Network Problems

```
Packets are not flowing along the expected path.
```

### Basic Troubleshooting Method

```
Observe → Hypothesize → Verify
```

### Engineering Rule

```
Troubleshoot from the bottom up.
```

Order:

```
Physical → Link → IP → TCP/UDP → Application
```

### OSI Model Key Principle

```
Upper layers work → lower layers are definitely fine.
Lower layer failure → upper layers will be abnormal.
```

---

## II. Network Layers (Engineering Perspective)

OSI seven layers simplified to five in practice:

| Layer | Role | Examples |
|-------|------|----------|
| Application | User programs | HTTP, DNS, SSH |
| Transport | Port communication | TCP, UDP |
| Network | IP addressing | IPv4, IPv6 |
| Link | MAC communication | Ethernet |
| Physical | Electrical signals | NIC |

### Engineering Communication Model

```
Network communication = Address + Route + Forwarding + State + Policy
```

| Layer | Key Question | Example |
|-------|-------------|---------|
| Address | Who am I | IP / MAC |
| Route | Where am I going | route |
| Forwarding | Who is the next hop | ARP |
| State | Is it allowed | conntrack |
| Policy | Is it blocked | firewall |

So network troubleshooting generally follows:

```
IP → ARP → Route → Forward → Firewall → Application
```

---

## III. The Golden Troubleshooting Flow

```
1. Network Interface (NIC status)
2. IP Address (identity)
3. Route (egress)
4. ARP (neighbors)
5. Connectivity (ping)
6. Path Detection (traceroute)
7. Port Status (services)
8. Packet Capture (final resort)
```

---

## IV. Phase 1: Network Interface

Check NIC status.

### Linux

```bash
ip link
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>
```

Both `UP` and `LOWER_UP` mean the interface is enabled and physically connected.

```bash
ip link set eth0 up    # Enable interface
```

### Windows

```bash
ipconfig /all
# or
Get-NetAdapter
```

---

## V. Phase 2: IP Address

IP address defines host identity.

### Linux

```bash
ip addr
# inet 192.168.1.10/24
```

### Windows

```bash
ipconfig
# IPv4 Address . . . : 192.168.1.10
```

---

## VI. Phase 3: Route

Routes determine packet egress. Reference: RFC 1812 (IP Routing).

### Linux

```bash
ip route
# default via 192.168.1.1 dev eth0
```

Test the route for a specific IP:

```bash
ip route get 8.8.8.8
# 8.8.8.8 via 192.168.31.1 dev ens33 src 192.168.31.101
```

### Windows

```bash
route print
```

Add a route:

```bash
route add 10.0.0.0 mask 255.255.255.0 192.168.1.1
```

### Route Table Fields Explained

| Field | Meaning |
|-------|---------|
| Destination | Target network. `0.0.0.0` = unknown / default |
| Gateway | Next hop. `0.0.0.0` = directly connected |
| Genmask | Subnet mask |
| Flags | U=Up, G=Gateway, H=Host, D=Dynamic |
| Metric | Priority — lower is preferred |
| Iface | Egress interface |

Summary: Access an IP → route table uses `IP & Genmask` to calculate subnet → Destination → Iface → Gateway → target server.

---

## VII. Phase 4: ARP

ARP handles `IP → MAC`. Reference: RFC 826.

### Linux

```bash
ip neigh
# 192.168.31.1 dev ens33 lladdr 4c:c6:4c:bf:ca:6e REACHABLE

arp -n
# Address            HWtype  HWaddress           Flags Mask  Iface
# 192.168.31.1       ether   4c:c6:4c:bf:ca:6e   C           ens33
```

Clear ARP:

```bash
ip neigh flush all
```

### Windows

```bash
arp -a
arp -d *    # Clear
```

### ARP Table vs Route Table

```
Route table decides where the packet goes.
ARP table decides who gets it.
```

| Table | Function | Example |
|-------|----------|---------|
| Route | IP → next hop | `8.8.8.8 → 192.168.1.1` |
| ARP | IP → MAC | `192.168.1.1 → aa:bb:cc:dd` |

---

## VIII. Phase 5: Network Connectivity

### ping (IP Layer Check)

Reference: RFC 792 (ICMP).

```bash
ping 8.8.8.8        # Linux
ping 8.8.8.8        # Windows
```

### The Complete Life of a ping

Host A `192.168.1.10` pings host B `192.168.2.10`, gateway `192.168.1.1`.

**Step 1 — DNS Resolution** (if using a domain name):

```
Application → getaddrinfo() → libc resolver → /etc/resolv.conf → DNS server → returns IP
```

**Step 2 — Route Decision**:

```bash
ip route get 192.168.2.10
# 192.168.2.10 via 192.168.1.1 dev eth0
# → next hop = 192.168.1.1
```

**Step 3 — ARP Resolution**:

```
System broadcasts:
  ARP Request: Who has 192.168.1.1? Tell 192.168.1.10

Gateway replies:
  192.168.1.1 is at aa:bb:cc:dd:ee

Cached:
  ip neigh → 192.168.1.1 ... REACHABLE
```

**Step 4 — Send Ethernet Frame**:

```
Ethernet Frame:
  dst MAC = gateway
  src MAC = host
   └─ IP packet
       └─ ICMP
```

**Step 5 — Gateway Forwarding**:

```
Gateway checks route table: 192.168.2.0/24 dev vlan20
Gateway ARPs for B: who has 192.168.2.10
```

**Step 6 — Re-encapsulation**:

Gateway modifies MAC, **does not modify IP**:

| Field | Changed? |
|-------|----------|
| src MAC | Yes (replaced with gateway egress MAC) |
| dst MAC | Yes (replaced with target MAC) |
| src IP | No |
| dst IP | No |

**Step 7 — Target Host Reply**:

```
ICMP echo reply: B → gateway → A
```

### Why Check the Path When ping Fails?

```
IP reachable ≠ Application reachable
```

If ping fails, at least one condition exists:

```
1. Route does not exist
2. Intermediate device dropping packets
3. Firewall blocking
4. Target does not exist
```

---

## IX. Phase 6: Path Detection

View the network path.

```bash
traceroute 8.8.8.8    # Linux
tracert 8.8.8.8        # Windows
```

### Four Network Communication Paths

**1. Local communication**:

```
127.0.0.1

Application → Socket → Loopback Interface → Application
(No NIC, ARP, or routing involved)
```

**2. Same-subnet communication**:

```
A 192.168.1.10 → B 192.168.1.20

A → ARP for B's MAC → Send Ethernet Frame directly → B
(No routing, only ARP)
```

**3. Cross-subnet communication**:

```
A 192.168.1.10 → B 192.168.2.10

A → check route → next hop = gateway → ARP for gateway MAC → send to gateway → gateway forwards → B

Core rule: IP stays the same, MAC changes every hop.
```

**4. NAT communication**:

```
192.168.1.10 → NAT Router → Internet

SNAT: 192.168.1.10:4444 → 1.2.3.4:50000
Return: 1.2.3.4:50000 → 192.168.1.10:4444

Relies on conntrack.
```

---

## X. Phase 7: Port Status

### Why Check Ports After Confirming the Path?

```
IP reachable ≠ Application reachable
```

Services run on TCP/UDP. Example: Server IP reachable but port 80 is closed → ping works, HTTP fails.

### Linux

```bash
ss -lntp    # Listening ports
ss -ant     # All connections
```

### Windows

```bash
netstat -ano
```

---

## XI. Packet Capture (Final Resort)

Packet capture is the **most important** network troubleshooting tool. Path and port checks are "logical checks," but intermediate device issues (firewall, NAT, load balancer, ACL, IPS) cannot be seen with system commands — you must capture.

### Linux — tcpdump

```bash
tcpdump -i eth0              # All traffic
tcpdump host 8.8.8.8        # Specific IP
tcpdump port 80              # HTTP
tcpdump arp                  # ARP
tcpdump -i eth0 -w dump.pcap # Save to file
```

### Windows — pktmon

```bash
pktmon start --capture
```

### Wireshark (Cross-Platform)

Supports Windows / Linux / macOS. Docs: https://www.wireshark.org/docs/

---

## XII. NAT / iptables / conntrack Deep Dive

### The Relationship

```
Netfilter (Linux firewall framework)
 ├─ conntrack   (connection state tracking)
 ├─ iptables    (rule control system)
 └─ NAT         (address translation module)
```

| Component | What It Is |
|-----------|-----------|
| conntrack | Connection state tracking system |
| iptables | Rule control system (tool to operate Netfilter) |
| NAT | Address translation module (**100% depends on conntrack**) |

### Linux Netfilter Architecture

```
                Userspace
                ──────────
                 iptables / nftables
                      │
                Kernel Space
                ────────────
                   Netfilter
                      │
      ┌───────────────┼───────────────┐
      │               │               │
  conntrack         NAT            filter
```

### Netfilter Five Hooks

```
            incoming
               │
           PREROUTING
               │
      ┌────────┴─────────┐
      │                  │
    routing            local
      │                  │
   FORWARD             INPUT
      │                  │
      └──────┬───────────┘
             │
          OUTPUT
             │
         POSTROUTING
             │
           outgoing
```

### Complete Packet Flow Diagram

```
NIC receive
  │
NIC Driver
  │
Kernel protocol stack entry
  │
Netfilter PREROUTING
  ├─ raw → mangle → nat (DNAT)
  │
conntrack
  │
Routing decision
  ├─ INPUT  → mangle → filter → local process
  └─ FORWARD → mangle → filter → POSTROUTING
                                    │
                                  mangle → nat (SNAT) → NIC send
```

### Where NAT Happens

| Hook | NAT Type |
|------|---------|
| PREROUTING | DNAT (destination address translation) |
| OUTPUT | Local DNAT |
| POSTROUTING | SNAT (source address translation) |

### DNAT (Destination NAT)

Common scenario: public IP → internal server.

```bash
iptables -t nat -A PREROUTING -d 1.1.1.1 -j DNAT --to 192.168.1.10
```

Flow:

```
Client → accesses 1.1.1.1 → Router → DNAT → 192.168.1.10
```

### SNAT (Source NAT)

Typical: internal network accessing the internet. `192.168.1.10 → 8.8.8.8` becomes `1.1.1.1 → 8.8.8.8` through the router.

```bash
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -j MASQUERADE
```

### conntrack Core Role

**Each connection records**:

```
src IP, dst IP, src port, dst port, protocol, state
```

View:

```bash
conntrack -L
cat /proc/net/nf_conntrack
# tcp  6  431999 ESTABLISHED src=192.168.1.10 dst=8.8.8.8 sport=50000 dport=53
```

### Why NAT Depends on conntrack

After SNAT, return packet `8.8.8.8 → 1.1.1.1` arrives. The router must know "who should this return to?" conntrack records `1.1.1.1:60000 ↔ 192.168.1.10:50000` and automatically performs reverse NAT.

### Linux Troubleshooting Trio

```bash
iptables -t nat -L -n -v    # View NAT rules
conntrack -L                # View connection tracking
tcpdump -i eth0 host 8.8.8.8  # Capture (compare before/after NAT)
```

### Typical NAT Fault Debugging

Internal network cannot access the internet:

```bash
# Step 1: Check IP
ip addr

# Step 2: Check routes
ip route

# Step 3: Check NAT
iptables -t nat -L
# Is MASQUERADE present?

# Step 4: Check conntrack
conntrack -L
# Are there entries?

# Step 5: Capture
tcpdump -i eth0
# Is SNAT happening?
```

### Four Common Misconceptions

1. ❌ "iptables does NAT" → ✅ Netfilter NAT module does NAT; iptables is just the configuration tool
2. ❌ "NAT doesn't need conntrack" → ✅ NAT 100% depends on conntrack
3. ❌ "NAT translates every packet" → ✅ Only the first packet of a connection; subsequent packets use conntrack directly
4. ❌ "SNAT happens at PREROUTING" → ✅ SNAT → POSTROUTING; DNAT → PREROUTING

### Windows Equivalents

| Linux | Windows |
|-------|---------|
| iptables | Windows Firewall |
| conntrack | WFP (Windows Filtering Platform) |
| NAT | ICS / RRAS |

Windows NAT:

```bash
netsh interface portproxy
```

---

## XIII. Dual NIC Management

### Scenario and Key Configuration

One NIC for internet (eth1), one for testing (eth0). **There can only be one default route.**

Prevent a NIC from acquiring a default route:

```bash
nmcli connection modify eth0 ipv4.never-default yes
```

### DHCP Management

```bash
# View lease
nmcli connection show "Wired connection 1" | grep DHCP4

# Manual operations
sudo dhclient eth1          # Request
sudo dhclient -r eth1        # Release
sudo dhclient -v eth1        # Verbose
```

### nmcli Quick Reference

```bash
# View
nmcli device status
nmcli device show eth1
nmcli connection show
nmcli connection show "Wired connection 1"
ip route show

# Operate
nmcli connection up eth0
nmcli connection down "Wired connection 1"
nmcli device disconnect eth0
nmcli device connect eth1

# Modify
nmcli connection modify eth0 ipv4.never-default yes
nmcli connection modify eth0 connection.autoconnect yes
sudo nmcli connection down "..." && sudo nmcli connection up "..."
```

### Network Outage Troubleshooting Order

```bash
# 1. Physical: is the link up?
ip link show eth1 | grep state    # UP + LOWER_UP

# 2. IP: did we get an address?
ip addr show eth1 | grep inet

# 3. Route: is the default route present?
ip route show | grep default

# 4. DNS: can we resolve?
cat /etc/resolv.conf

# 5. Final test:
ping 8.8.8.8          # Ping IP first (eliminate DNS issues)
ping google.com        # Then ping by domain name
```

### Multi-Route Table Configuration

```bash
# Add route tables
sudo ip route add default via 192.168.20.1 dev ens33 table 100
sudo ip route add default via 192.168.1.1 dev br-lan table 200

# Add rules
sudo ip rule add from 192.168.20.0/24 lookup 100
sudo ip rule add from 192.168.1.0/24 lookup 200
sudo ip rule add pref 32766 lookup main

# Test
ping -I ens33 google.com
ping -I br-lan google.com
```

---

## XIV. Minimal Network Troubleshooting Toolkit

### Linux

```
ip          — Interfaces, addresses, routes
ss          — Ports, connections
tcpdump     — Packet capture
iptables    — Firewall/NAT rules
conntrack   — Connection tracking
```

### Windows

```
ipconfig    — IP configuration
route       — Route table
netstat     — Ports, connections
tracert     — Path detection
pktmon      — Packet capture
```

### Cross-Platform

```
Wireshark   — Graphical packet analysis
```

---

## Final Conclusion

```
There are no mysterious network problems.
There are only unobserved packets.

Packet capture is the ultimate truth.
tcpdump + Wireshark are your most important tools.
```
