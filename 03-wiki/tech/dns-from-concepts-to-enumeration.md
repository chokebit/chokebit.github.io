---
title: DNS — From Concepts to Enumeration
lang: en
translations:
  cn: tech/dns-from-concepts-to-enumeration.cn
tags:
  - network
  - dns
  - security
---

> Errors are inevitable — read critically.

## Contents

- **Core Concepts**: Domain, Host, Subdomain, FQDN, Name Server, Zone File, Record Types
- **How DNS Works**: Recursive resolution — Root → TLD → Authoritative
- **Zone File & Record Types**: SOA, A/AAAA, CNAME, MX, NS, PTR, CAA
- **DNS Enumeration**: nslookup, dig, host — practical usage
- **DNS Association Queries — Anti-404 Tricks**: Forward/reverse IP lookup, troubleshooting broken links
- **References**

---

## I. Core Concepts

### DNS (Domain Name System)

The Internet's phonebook — translates domain names into IP addresses.

### Domain Name

`google.com` is a domain name. The DNS allows us to reach Google's servers when we type `google.com` into a browser.

### IP Address

Globally unique, associated with a domain name through DNS.

### TLD (Top-Level Domain)

The rightmost portion: `com`, `net`, `org`, `gov`, `edu`, `io`, etc. Managed by ICANN (Internet Corporation for Assigned Names and Numbers).

### Host

Individual computers or services accessible through a domain:

- `example.com` — bare domain
- `www.example.com` — web server
- `api.example.com` — API server
- `ftp.example.com` or `files.example.com` — file server

Host names can be arbitrary as long as they are unique within the domain.

### Subdomain

DNS works in a hierarchy. `ubuntu.com` is a subdomain of `com`. Each domain can control subdomains under it — e.g., `www.history.school.edu`.

**Subdomain vs Host**: A host defines a computer or resource; a subdomain extends the parent domain. DNS is read left-to-right: most specific to least specific.

### FQDN (Fully Qualified Domain Name)

An absolute domain name specifying its location relative to the DNS root. A proper FQDN ends with a dot: `mail.google.com.`.

### Name Server

A computer designated to translate domain names into IP addresses. Can be authoritative (answering queries for domains under its control), point to other servers, or serve cached data.

### Zone File

A text file containing mappings between domain names and IP addresses. Resides in name servers and defines resources available under a specific domain.

### Records

Within a zone file, records are kept. The simplest form: a single mapping between a resource and a name.

---

## II. How DNS Works

Example: requesting `www.wikipedia.org`

```
Request www.wikipedia.org
  │
  ▼
Root Server
  → Doesn't know, returns org server IP
  │
  ▼
org TLD Server
  → Checks zone file, doesn't know, returns wikipedia.org server IP
  │
  ▼
wikipedia.org Authoritative Server
  → Checks zone file, finds host "www", returns IP
```

### Resolving Name Server

The intermediary between users and DNS. Caches previous results for speed and knows root server addresses. Usually provided by ISP — e.g., Google's `8.8.8.8`.

Browser flow:
1. Check local hosts file and cache
2. Not found → send request to resolving name server
3. Resolver checks cache → if not found, follows the hierarchy above
4. Returns IP to browser

---

## III. Zone File & Record Types

### SOA Record (Start of Authority)

The first record in every zone file — mandatory and one of the most complex.

```
domain.com.  IN SOA   ns1.domain.com. admin.domain.com. (
                          12083           ; serial number
                          3h              ; refresh interval
                          30m             ; retry interval
                          3w              ; expiry period
                          1h              ; negative TTL
                          )
```

| Field | Description |
|-------|-------------|
| `domain.com.` | Zone root, often `@` |
| `IN SOA` | Internet class, SOA indicator |
| `ns1.domain.com.` | Primary name server |
| `admin.domain.com.` | Admin email (`@` → `.`) |
| 12083 | Serial number — must increment on every edit |
| 3h | Refresh — secondary polls primary |
| 30m | Retry — wait between failed connection attempts |
| 3w | Expiry — max time secondary serves without primary contact |
| 1h | Negative TTL — cache time for not-found responses |

### A and AAAA Records

Map a host to an IP:

- **A**: host → IPv4
- **AAAA**: host → IPv6

```
host     IN      A       IPv4_address
host     IN      AAAA    IPv6_address
```

Examples:

```
ns1     IN  A       111.222.111.222
www     IN  A       222.222.222.222
@       IN  A       222.222.222.222    ; @ = base domain
*       IN  A       222.222.222.222    ; wildcard
```

### CNAME Record (Canonical Name)

Alias for an existing A/AAAA record:

```
server1     IN  A       111.111.111.111
www         IN  CNAME   server1
```

**Note**: CNAMEs incur performance cost (additional query). Use additional A/AAAA records when possible. Recommended for aliasing resources outside the current zone.

### MX Record (Mail Exchange)

Defines mail servers for the domain. Zone-wide, no host prefix:

```
        IN  MX  10   mail1.domain.com.
        IN  MX  50   mail2.domain.com.
mail1   IN  A       111.111.111.111
mail2   IN  A       222.222.222.222
```

Numbers are priority — lower = higher priority.

### NS Record (Name Server)

Defines name servers for the zone. At least two recommended:

```
        IN  NS     ns1.domain.com.
        IN  NS     ns2.domain.com.
ns1     IN  A      111.222.111.111
ns2     IN  A      123.211.111.233
```

### PTR Record (Reverse DNS)

Defines a name associated with an IP — the inverse of A/AAAA. Used for email spam prevention and traceroute geographic identification.

```bash
dig -x 8.8.4.4 +short
# google-public-dns-b.google.com.
```

### CAA Record (Certification Authority Authorization)

Specifies which CAs can issue SSL/TLS certificates for the domain. Mandatory check for all CAs since September 2017.

```
example.com.  IN  CAA  0 issue "letsencrypt.org"
```

| Part | Description |
|------|-------------|
| `0` | Flag: 0 = ignore unknown tags, 1 = refuse |
| `issue` | Tag: `issue`, `issuewild`, or `iodef` |
| `"letsencrypt.org"` | Value: CA domain |

```bash
dig example.com type257    # Query CAA records
```

---

## IV. DNS Enumeration

### nslookup

```bash
nslookup website.com
nslookup -query=mx website.com
nslookup -query=ns website.com
```

**Note**: Don't prepend `www.` — the `www` subdomain may be hosted on a different IP.

### dig

More flexible than nslookup, excellent for troubleshooting:

```bash
dig website.com
dig website.com MX
dig website.com NS
dig -x 8.8.4.4 +short        # Reverse lookup
dig website.com ANY
dig +short website.com
```

### host

```bash
host website.com
host -t mx website.com
```

---

## V. DNS Association Queries — Anti-404 Tricks

Practical techniques beyond tools — discovering hidden associations between domains and IPs.

### 1. Forward: Domain → IP → Verify Service

Resolve the domain, then check if a service actually runs on that IP:

```bash
dig +short example.com          # Get IP
curl -I http://example.com      # Verify web service
```

If `dig` returns an IP but `curl` can't connect, the domain may have expired, the IP changed, or the service is offline.

### 2. Reverse: IP → Domain (Shared Hosting Discovery)

Multiple domains may be hosted on the same IP (virtual hosting). Use reverse DNS or online tools:

```bash
dig -x 93.184.216.34 +short     # PTR reverse lookup
```

PTR only returns one domain. To find other domains on the same IP, use online services like [viewdns.info/reverseip](https://viewdns.info/reverseip/) or brute-force with `host`.

### 3. Domain ↔ IP Association Failure

When a domain previously resolved to an IP but is now broken:

```bash
# Check current records
dig example.com A

# Check history (Passive DNS)
# Tools: securitytrails.com, virustotal.com

# Access the IP directly
curl -I http://<ip>
```

Common causes: CDN migration, host change, expired domain, DNS hijacking.

---

## References

- [DigitalOcean: DNS Terminology Introduction](https://www.digitalocean.com/community/tutorials/an-introduction-to-dns-terminology-components-and-concepts)
- [Infosec Institute: DNS Enumeration Techniques in Linux](https://resources.infosecinstitute.com/topic/dns-enumeration-techniques-in-linux/)
- [RFC 6844: CAA Records](https://tools.ietf.org/html/rfc6844)
