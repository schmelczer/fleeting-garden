# 🔺 WebGPU Seed

[![License][license-img]][license-url]

A WebGPU repo you can use to get started with your own renderer.

- [🔳 Codepen Example](https://codepen.io/alaingalvan/pen/GRgvLGw)

- [💬 Blog Post](https://alain.xyz/blog/raw-webgpu)

## Setup

First install:

- [Git](https://git-scm.com/)

- [Node.js](https://nodejs.org/en/)

- A Text Editor such as [Visual Studio Code](https://code.visualstudio.com/).

Then type the following in any terminal your such as [VS Code's Integrated Terminal](https://code.visualstudio.com/docs/editor/integrated-terminal).

```bash
# 🐑 Clone the repo
git clone https://github.com/alaingalvan/webgpu-seed

# 💿 go inside the folder
cd webgpu-seed

# 🔨 Start installing dependencies, building, and running at localhost:8080
npm start
```

> Refer to [this blog post on designing web libraries and apps](https://alain.xyz/blog/designing-a-web-app) for more details on Node.js, packages, etc.

## Project Layout

As your project becomes more complex, you'll want to separate files and organize your application to something more akin to a game or renderer, check out this post on [game engine architecture](https://alain.xyz/blog/game-engine-architecture) and this one on [real time renderer architecture](https://alain.xyz/blog/realtime-renderer-architectures) for more details.

```bash
├─ 📂 node_modules/   # 👶 Dependencies
│  ├─ 📁 gl-matrix      # ➕ Linear Algebra
│  └─ 📁 ...            # 🕚 Other Dependencies (TypeScript, Webpack, etc.)
├─ 📂 src/            # 🌟 Source Files
│  ├─ 📄 index.html     #  📇 Main HTML file
│  └─ 📄 renderer.ts    # 🔺 Triangle Renderer
├─ 📄 .gitignore      # 👁️ Ignore certain files in git repo
├─ 📄 package.json    # 📦 Node Package File
├─ 📄 license.md      # ⚖️ Your License (Unlicense)
└─ 📃readme.md        # 📖 Read Me!
```


[license-img]: https://img.shields.io/:license-unlicense-blue.svg?style=flat-square
[license-url]: https://unlicense.org/
