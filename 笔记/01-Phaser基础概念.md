## Phaser 3 基础概念

### 场景（Scene）
- 一个游戏由多个 Scene 组成，可以互相跳转
- `this.scene.start("场景名")` → 跳转到另一个场景
- `main.ts` 的 `scene: [...]` 数组里第一个场景会自动启动

### 我们目前的场景流
```
BootScene → MenuScene → BattleScene
(加载资源)    (主菜单)     (战斗)
```

### Scene 的生命周期
- `create()` → 场景创建时执行一次（放初始化代码）
- `update()` → 每帧执行（放游戏逻辑，比如移动、碰撞检测）
- `preload()` → 场景创建前加载资源（图片、音频等）

### 物理引擎（Arcade Physics）
- Phaser 自带的轻量物理系统，够用
- `gravity: { y: 800 }` → 数值越大，下落越快
- `debug: true` → 显示绿色碰撞框，方便调试

### 常用 API 速查
```ts
// 添加文字
this.add.text(x, y, "内容", { fontSize: "32px", color: "#fff" })

// 添加矩形
this.add.rectangle(x, y, 宽, 高, 颜色)

// 获取画面中心
this.cameras.main.centerX / centerY

// 让文字/图形居中
.setOrigin(0.5)

// 添加鼠标交互
.setInteractive({ useHandCursor: true })
.on("pointerdown", () => { ... })  // 点击
.on("pointerover", () => { ... })  // 悬停
.on("pointerout", () => { ... })   // 离开
```

### 项目结构
```
game/
├── index.html         ← HTML 入口
├── package.json       ← 依赖管理
├── vite.config.ts     ← 开发服务器配置
├── src/
│   ├── main.ts        ← 游戏入口（Phaser 配置）
│   ├── scenes/        ← 所有场景放这里
│   └── entities/      ← 游戏实体（Player、Enemy 等）
└── public/assets/     ← 图片、音频等资源
```
