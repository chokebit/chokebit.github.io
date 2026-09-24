---
title: 加密算法基础：AES 与 RSA
lang: cn
description: 理解 AES、RSA 与混合加密的分工，并通过最小示例建立固件安全分析所需的密码学基础。
created: 2026-08-14
modified: 2026-09-24
tags:
  - crypto
  - aes
  - rsa
  - firmware
---

> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **RSA 与 AES 的异同**：非对称 vs 对称，用途、性能、安全性对比
- **为什么混合加密**：用 RSA 保护 AES 密钥、用 AES 保护数据
- **一个可运行的示例**：用 Node.js 原生 `crypto` 演示「AES-GCM 加密数据 + RSA-OAEP 包装密钥 + RSA-PSS 签名」
- **固件场景中的延伸**：下一篇《固件获取、解密与重打包》会用到这里的结论

---

## 一、两种算法的定位

RSA 和 AES 都是加密算法，但解决的是两类不同的问题。理解它们的分工，是理解几乎所有现代加密方案（包括固件校验、安全启动、HTTPS）的基础。

| 维度 | RSA | AES |
|------|-----|-----|
| 类型 | 非对称加密（公钥 + 私钥） | 对称加密（同一个密钥） |
| 密钥长度 | 通常 2048 位以上 | 128 / 192 / 256 位 |
| 速度 | 慢，不适合大量数据 | 快，适合实时加解密 |
| 典型用途 | 密钥交换、数字签名、身份验证 | 文件加密、数据块加密、存储介质加密 |
| 安全假设 | 大数分解困难（整数分解问题） | 算法设计与密钥保密（目前无可行攻击） |

一句话概括：**RSA 适合「安全地传递一把钥匙」，AES 适合「用这把钥匙快速地锁大量数据」**。

### 1. RSA：非对称加密

RSA 使用一对密钥：

- **公钥（public key）**：可公开，用于加密或验证签名。
- **私钥（private key）**：必须保密，用于解密或生成签名。

因为只有私钥能解密，所以任何人都可以用公钥加密一段数据发给持有私钥的人，而中间人拿到密文也无能为力。密钥长度越长越安全，但运算越慢——这也是它不适合直接加密大块数据的原因。

> 补充：RSA 的安全性基于「大整数的质因数分解」在计算上不可行。 Shor 算法在量子计算机上可以高效分解大数，因此长期看 RSA 会受到量子计算的威胁，但这不在本文讨论范围。

### 2. AES：对称加密

AES（Advanced Encryption Standard）使用**同一个密钥**完成加密和解密。密钥长度可以是 128 / 192 / 256 位。由于算法高度并行、硬件加速成熟（AES-NI 指令集），它的速度远超 RSA，因此被用来加密文件、磁盘、网络流量等大规模数据。

在合理密钥长度下，AES 目前没有已知的有效攻击方法。

---

## 二、为什么是「混合加密」

既然 RSA 慢、AES 快，一个自然的工程方案是：

1. 随机生成一把 AES 密钥（称为 **会话密钥 / data key**）。
2. 用 **AES** 加密真正的数据（快）。
3. 用 **RSA 公钥** 加密这把 AES 密钥（只加密几十字节，慢一点没关系）。
4. 把「AES 密文 + RSA 加密后的密钥」一起发给对方。
5. 对方用 **RSA 私钥** 解出 AES 密钥，再用它解密数据。

这样既享受了 AES 的速度，又解决了「如何把对称密钥安全地交给对方」的问题。这套模式广泛用于：

- **HTTPS/TLS**：握手阶段用非对称算法协商出对称密钥，后续通信用对称加密。
- **固件加密**：厂商用公钥加密固件密钥，设备用内置私钥解密（见下一篇）。
- **磁盘/文件加密**：用公钥包装主密钥，私钥存于受保护硬件（TPM/SE）。

---

## 三、可运行示例（Node.js）

下面只使用 Node.js 原生 `node:crypto`，演示一个现代化的最小组合：

- **AES-256-GCM** 同时提供机密性和完整性校验。
- **RSA-OAEP + SHA-256** 用接收方公钥包装随机 AES 密钥。
- **RSA-PSS + SHA-256** 用发送方私钥签名整个消息包。

示例用于理解数据如何组合；生产系统仍应使用经过审计的协议和密钥管理服务，不要自行设计加密格式。

```javascript
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

// 演示用：接收方拥有解密密钥，发送方拥有签名密钥。
const receiver = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sender = generateKeyPairSync("rsa", { modulusLength: 2048 });

const plaintext = Buffer.from("firmware metadata");
const aesKey = randomBytes(32); // AES-256
const iv = randomBytes(12);     // GCM 推荐 96-bit nonce；同一密钥下不得重复

// 1. AES-256-GCM 加密数据。
const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();

// 2. 用接收方 RSA 公钥包装 AES 密钥。
const wrappedKey = publicEncrypt(
  {
    key: receiver.publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  aesKey,
);

// 3. 对固定顺序的消息字段签名。
const envelope = Buffer.concat([wrappedKey, iv, authTag, ciphertext]);
const signature = sign("sha256", envelope, {
  key: sender.privateKey,
  padding: constants.RSA_PKCS1_PSS_PADDING,
  saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
});

// 接收端先验签，再解开 AES 密钥并验证 GCM 标签。
if (!verify("sha256", envelope, {
  key: sender.publicKey,
  padding: constants.RSA_PKCS1_PSS_PADDING,
  saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
}, signature)) {
  throw new Error("signature verification failed");
}

const recoveredKey = privateDecrypt(
  {
    key: receiver.privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  wrappedKey,
);
const decipher = createDecipheriv("aes-256-gcm", recoveredKey, iv);
decipher.setAuthTag(authTag);
const recovered = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

console.log(recovered.toString()); // firmware metadata
```

### 关键点小结

- **AES 密钥和 GCM nonce 必须正确生成和管理**；同一密钥下重复 nonce 会破坏安全性。
- **RSA 公钥可以公开**（甚至写进固件），但私钥必须留在受信任的一侧（服务端 / 安全芯片）。
- **签名**用来确认来源并防止消息包被替换；GCM 标签负责校验密文完整性。

---

## 四、与固件安全的衔接

理解了混合加密，下一篇《固件获取、解密与重打包》里的很多现象就顺理成章了：

- 固件若需要保密，主体通常使用对称算法加密，解密密钥由设备安全存储或硬件密钥派生机制保护；具体设计取决于设备是否需要逐台密钥隔离。
- 安全启动解决的是**真实性与完整性**：设备通常内置公钥或公钥摘要，用它验证厂商私钥生成的签名，而不是依靠“加密固件”代替签名校验。
- 逆向时看到「一段密文 + 一段解密 routine」，往往就是上面的对称加密模式；而 `RSA privatize`/`decrypt` 字样通常指向密钥材料或签名校验。

> 本文只讲算法原理与工程模式，不涉及任何针对具体设备的密钥提取或绕过手段。对真实设备的密钥恢复必须在**你拥有合法授权的设备**上进行（例如厂商提供的开发板、自己购买的硬件），并遵守相关法律规定。

---

## 参考

- RSA / AES 维基百科条目
- Node.js Crypto 文档：https://nodejs.org/api/crypto.html
- TLS 握手与混合加密原理（RFC 5246 / 8446）
