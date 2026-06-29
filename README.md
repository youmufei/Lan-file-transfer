# 📡 LAN Transfer - 局域网跨设备文件传输工具

> 无需互联网，无需安装App，手机扫码即传，数据全程只留在你的电脑上。

LAN Transfer 是一个基于 **局域网（Wi-Fi）** 的轻量级文件传输工具。它在电脑上启动一个本地 Web 服务，手机通过系统相机扫描二维码即可连接，实现文字、链接、图片、视频、文档的双向互传。所有数据仅在局域网内传输，**绝不经过任何云端服务器**，充分保护您的隐私。

---

## ✨ 功能特性

- 📱 **手机扫码即连**：电脑生成二维码，手机用系统相机扫描后自动打开传输页面。
- 🔁 **双向互传**：
  - 手机 → 电脑：上传文件、发送文字/链接。
  - 电脑 → 手机：推送文件、文字/链接，手机端实时刷新接收。
- 📄 **支持多种文件类型**：图片、视频、PDF、Word、Excel 等，无格式限制。
- 🔒 **安全可控**：
  - 所有数据仅在本地局域网传输，不上传云端。
  - 可选 4 位数字 PIN 码保护，防止他人误入。
- 🌐 **跨平台**：电脑端（Windows / macOS / Linux）运行服务，手机端任何浏览器（iOS / Android）均可访问。
- 🎨 **响应式设计**：电脑端大屏适配，手机端卡片式布局，操作流畅。
- ⚡ **传输体验**：实时上传/下载速度显示，大文件分片传输（开发中），进度条反馈。

---

## 🛠️ 技术栈

- **后端**：Python 3.10+ + FastAPI + Uvicorn
- **前端**：原生 HTML + CSS + JavaScript (Vanilla JS)
- **二维码**：qrcode + Pillow

---

## 📦 安装与运行

### 方式一：懒人包（推荐非开发者）

直接下载 [最新 Release](https://github.com/youmufei/Lan-file-tranfer/releases) 中的 `LAN Transfer 懒人包.zip`，解压后双击 `server.exe` 即可使用。

### 方式二：源码运行（开发者）

1. **克隆仓库**：
   ```bash
   git clone https://github.com/你的用户名/你的仓库名.git
   cd lan-file-transfer

2. 安装依赖：

```bash
    pip install -r requirements.txt
```
3. 启动服务：

```bash
    python server.py
```
4. 访问：
启动后终端会显示一个局域网地址（如 http://192.168.1.7:8000/XXXXXX ）,在电脑浏览器打开即可看到二维码。

## 📱 使用说明

### 电脑端
1. 双击 server.exe（或运行 python server.py），会弹出一个黑色命令行窗口。

2. 窗口内显示 二维码、房间号（Room ID） 和 局域网访问地址。

3. 保持黑色窗口开启（关闭即停止服务）。

### 手机端
1. 确保手机与电脑连接同一个 WiFi。

2. 打开手机 系统相机（或微信/支付宝的扫码功能），扫描电脑屏幕上的二维码。

3. 自动跳转到手机浏览器，进入传输界面。

4. 在手机端：

发送：点击“发送文件”或“发送文字”，上传内容。

浏览：查看电脑上已收到的文件/文字，支持预览和下载。

刷新：手动拉取最新数据。

💡 提示：电脑端也可以通过“推送”功能主动向手机发送文字或文件。


### 🖼️ 截图预览

### 电脑端界面：
<img src="https://github.com/user-attachments/assets/4f60e036-1e6a-4bcf-913c-b4075199f040" alt="电脑端界面" width="700"/>

### 手机端界面:
<img src="https://github.com/user-attachments/assets/6a523dd0-1337-4710-a0e5-b08555ea6d85" alt="手机端界面" width="300"/>

### 🔐 安全与隐私
1. 所有传输仅在 局域网内 进行，数据不经过任何公网服务器。

2. 服务启动时自动生成随机房间号（Room ID），可有效防止同网络下他人意外访问。

3.可选启用 4 位 PIN 码 进行二次验证（在 Connect 面板中开启）。

### 📂 项目结构
```text
lan-file-transfer/
├── server.py               # 主程序
├── templates/
│   └── index.html          # 前端页面模板
├── static/
│   ├── style.css           # 样式
│   └── app.js              # 前端逻辑
├── requirements.txt        # Python 依赖清单
├── README.md               # 项目说明
└── LICENSE                 # 开源许可证
```
### 🤝 贡献指南
欢迎提交 Issue 和 Pull Request！如果你有好的改进建议，请先通过 Issue 讨论。

### 📄 开源许可证
本项目采用 MIT License，你可以自由使用、修改、分发，但请保留版权声明。

### 🙏 致谢
感谢 FastAPI、Uvicorn、QRCode 等优秀的开源库。

最后提醒：本项目仅供个人或小团队内部使用，请勿在公共网络环境（如咖啡店WiFi）中传输敏感文件，尽管数据在局域网内，但同一网络下的其他设备仍可能监听。
