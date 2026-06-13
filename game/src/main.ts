/**
 * 游戏入口文件
 *
 * 这里做两件事：
 * 1. 定义 Phaser 的全局配置（画面大小、物理引擎等）
 * 2. 注册游戏场景，启动游戏
 */

import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { BattleScene } from "./scenes/BattleScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // 自动选择 WebGL 或 Canvas 渲染
  width: 960, // 游戏画面宽度
  height: 540, // 游戏画面高度（16:9 比例）
  parent: document.body, // canvas 挂载到 body
  backgroundColor: "#1a1a2e", // 深蓝黑底色
  physics: {
    default: "arcade", // 使用 Arcade 物理引擎（轻量够用）
    arcade: {
      gravity: { x: 0, y: 800 }, // 全局重力：y 越大下落越快，改小会感觉像在月球上
      debug: false, // 关闭物理碰撞框显示（开发调试时可改回 true）
    },
  },
  scene: [BootScene, MenuScene, LevelSelectScene, BattleScene], // 场景列表：启动 → 菜单 → 选关 → 战斗
};

new Phaser.Game(config);
