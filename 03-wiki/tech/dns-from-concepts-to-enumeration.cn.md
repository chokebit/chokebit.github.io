---
title: DNS 从概念到信息挖掘
lang: cn
translations:
  en: tech/dns-from-concepts-to-enumeration
tags:
  - network
  - dns
  - security
---

> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **DNS 核心概念**：域名、主机、子域、FQDN、Name Server、Zone File、Record Types
- **DNS 工作原理**：递归查询流程，Root → TLD → Authoritative
- **Zone File 与记录类型**：SOA、A/AAAA、CNAME、MX、NS、PTR、CAA
- **DNS 信息挖掘**：nslookup、dig、host 工具实战
- **DNS 关联查询 — 对抗 404 小技巧**：域名 ↔ IP 正向反向查找，关联失效排查
- **参考链接**

---

## 一、DNS 核心概念

### DNS（Domain Name System，域名系统）

互联网的"电话簿"——将域名翻译为 IP 地址。

### 域名（Domain Name）

`google.com` 就是一个域名。URL 中 `google.com` 关联到 Google 的服务器，DNS 让我们在浏览器中输入域名后能到达正确的服务器。

### IP 地址

IP 地址是全球唯一的，通过 DNS 与域名关联。

### 顶级域（TLD，Top-Level Domain）

域名最右侧部分：`com`、`net`、`org`、`gov`、`edu`、`io` 等。由 ICANN（互联网名称与数字地址分配机构）授权管理。

### 主机（Host）

域名下可定义独立主机，指向不同的计算机或服务：

- `example.com` — 裸域
- `www.example.com` — Web 服务器
- `api.example.com` — API 服务器
- `ftp.example.com` 或 `files.example.com` — FTP/文件服务器

主机名只要在域名内唯一即可。

### 子域（Subdomain）

DNS 是层级结构。`ubuntu.com` 可以视为 `com` 的子域，"ubuntu" 是 SLD（Second Level Domain，二级域）。同样，每个域可以控制其下的子域，如 `www.history.school.edu` 中 "history" 就是子域。

**子域 vs 主机**：主机定义计算机/资源，子域扩展父域本身，是一种细分域的方法。DNS 从左到右是从具体到宽泛。

### FQDN（Fully Qualified Domain Name，完全限定域名）

绝对域名，指定其在 DNS 系统中的绝对位置，以点结尾表示 DNS 层级的根。如 `mail.google.com.`（最后有一个点）。部分软件调用的 FQDN 不要求末尾的点，但 ICANN 标准要求带点。

### Name Server（名称服务器）

**将域名翻译为 IP 地址的计算机**。可以是权威的（给出其控制域的确切答案），也可以指向其他服务器或提供缓存。

### Zone File（区域文件）

**存储域名与 IP 之间映射的纯文本文件**。DNS 系统最终通过它知道用户请求某个域名时应该联系哪个 IP 地址。Zone File 保存在 Name Server 上。

### Records（记录）

Zone File 中的一条条记录。最简单形式就是资源和名称之间的一个映射，可以将域名映射到 IP、定义域名的名称服务器、邮件服务器等。

---

## 二、DNS 工作原理

以 `www.wikipedia.org` 为例：

```
请求 www.wikipedia.org
  │
  ▼
Root Server（根服务器）
  → 不知道，给出 org 服务器 IP
  │
  ▼
org Server（TLD 服务器）
  → 查看 zone file，不知道，给出 wikipedia.org 服务器 IP
  │
  ▼
wikipedia.org Server（权威服务器）
  → 查看 zone file，找到 host "www"，返回 IP
```

### Resolving Name Server（递归解析器）

用户和 DNS 系统之间的中介。缓存之前的查询结果以加速，知道根服务器地址以便"解决"未知请求。通常由 ISP 提供，也可使用 Google 的 `8.8.8.8`。

浏览器输入 URL 后的流程：
1. 本机先查 hosts 文件和本地缓存
2. 没找到 → 发送请求到递归解析器
3. 递归解析器查缓存 → 没找到 → 按上述层级查询
4. 返回 IP 给浏览器

---

## 三、Zone File 与记录类型

### SOA 记录（Start of Authority，起始授权）

每个 Zone File 的**第一条记录**，也是最重要的记录之一。

```
domain.com.  IN SOA   ns1.domain.com. admin.domain.com. (
                          12083           ; 序列号
                          3h              ; 刷新间隔
                          30m             ; 重试间隔
                          3w              ; 过期时间
                          1h              ; 负缓存 TTL
                          )
```

| 字段 | 说明 |
|------|------|
| `domain.com.` | 区域根，常用 `@` 替代 |
| `IN SOA` | Internet 类型，SOA 标识 |
| `ns1.domain.com.` | 主名称服务器 |
| `admin.domain.com.` | 管理员邮箱（`@` 替换为 `.`） |
| 12083 | 序列号。每次编辑 Zone File 必须递增，否则辅助服务器不会拉取更新 |
| 3h | 刷新间隔。辅助服务器多久查询一次主服务器 |
| 30m | 重试间隔。连接失败后的重试等待 |
| 3w | 过期时间。辅助服务器连接不上主服务器的最大容忍时间 |
| 1h | 负缓存 TTL。找不到记录时的缓存时间 |

### A 和 AAAA 记录

将主机映射到 IP：

- **A 记录**：主机 → IPv4
- **AAAA 记录**：主机 → IPv6

```
host     IN      A       IPv4_address
host     IN      AAAA    IPv6_address
```

示例：

```
ns1     IN  A       111.222.111.222
www     IN  A       222.222.222.222
@       IN  A       222.222.222.222    ; @ 代表基础域
*       IN  A       222.222.222.222    ; * 通配符，匹配所有未明确定义的主机
```

### CNAME 记录（Canonical Name，别名）

为一个已有 A/AAAA 记录的主机定义别名：

```
server1     IN  A       111.111.111.111
www         IN  CNAME   server1
```

**注意**：CNAME 有性能损耗（需要额外查询）。大多数情况用额外的 A/AAAA 记录能达到同样效果。CNAME 推荐用于为当前区域之外的资源提供别名。

### MX 记录（Mail Exchange，邮件交换）

定义域名的邮件服务器，作用于整个区域：

```
        IN  MX  10   mail1.domain.com.
        IN  MX  50   mail2.domain.com.
mail1   IN  A       111.111.111.111
mail2   IN  A       222.222.222.222
```

`10` 和 `50` 是优先级数字，越小优先级越高。

### NS 记录（Name Server）

定义管理此区域的名称服务器。至少定义两个以保证冗余：

```
        IN  NS     ns1.domain.com.
        IN  NS     ns2.domain.com.
ns1     IN  A      111.222.111.111
ns2     IN  A      123.211.111.233
```

### PTR 记录（反向 DNS）

定义 IP 地址关联的名称，是 A/AAAA 记录的逆操作。常用于邮件服务器的反垃圾邮件验证，以及 traceroute/MTR 路径分析中的地理位置识别。

```bash
dig -x 8.8.4.4 +short
# google-public-dns-b.google.com.
```

### CAA 记录（证书颁发机构授权）

指定哪些 CA（Certificate Authority，证书颁发机构）可以为此域名签发 SSL/TLS 证书。2017 年 9 月 8 日起所有 CA 必须检查此记录。

```
example.com.  IN  CAA  0 issue "letsencrypt.org"
```

| 部分 | 说明 |
|------|------|
| `0` | Flag。0=忽略不理解的 tag，1=CA 必须拒绝签发 |
| `issue` | Tag。`issue`=授权单主机，`issuewild`=授权通配符，`iodef`=违规报告 URL |
| `"letsencrypt.org"` | Value。CA 的域名 |

```bash
dig example.com type257    # 查询 CAA 记录
```

---

## 四、DNS 信息挖掘

### nslookup

```bash
nslookup website.com

# 指定记录类型
nslookup -query=mx website.com
nslookup -query=ns website.com
```

**注意**：不要拼接 `www.website.com` 来查询——`www` 子域可能托管在不同 IP 上。

### dig

比 nslookup 更灵活，适合排查 DNS 问题：

```bash
dig website.com
dig website.com MX
dig website.com NS
dig -x 8.8.4.4 +short        # 反向查询
dig website.com ANY           # 查询所有记录
dig +short website.com        # 精简输出
```

### host

```bash
host website.com
host -t mx website.com
```

---

## 五、DNS 关联查询 - 对抗404小技巧

工具之外的实用技巧——通过 DNS 发现域名与 IP 之间的隐藏关联。

### 1. 正向：域名 → IP → 验证服务

拿到域名，先查 A 记录，再验证这个 IP 上是否真的跑着对应服务：

```bash
dig +short example.com          # 获取 IP
curl -I http://example.com      # 验证 Web 服务是否存在
```

如果 `dig` 返回了 IP 但 `curl` 连不上，可能域名已过期、IP 已更换或服务已下线。

### 2. 反向：IP → 域名（共享主机发现）

同一个 IP 上可能托管多个域名（虚拟主机）。通过反向 DNS 或在线服务查找关联域名：

```bash
dig -x 93.184.216.34 +short     # PTR 反向查询
```

PTR 记录只返回一个域名。要查同 IP 上的其他域名，用在线服务如 [viewdns.info/reverseip](https://viewdns.info/reverseip/) 或 `host` 暴力枚举。

### 3. 域名 ↔ IP 关联失效排查

如果域名曾经解析到某 IP 但现在失效：

```bash
# 查当前记录
dig example.com A

# 查历史记录（Passive DNS）
# 在线工具: securitytrails.com, virustotal.com

# 直接访问 IP 看是否还有其他服务
curl -I http://<ip>
```

关联失效的常见原因：CDN 切换、主机迁移、域名过期、DNS 劫持。

---

## 参考链接

- [DigitalOcean: DNS Terminology Introduction](https://www.digitalocean.com/community/tutorials/an-introduction-to-dns-terminology-components-and-concepts)
- [Infosec Institute: DNS Enumeration Techniques in Linux](https://resources.infosecinstitute.com/topic/dns-enumeration-techniques-in-linux/)
- [RFC 6844: CAA Records](https://tools.ietf.org/html/rfc6844)
