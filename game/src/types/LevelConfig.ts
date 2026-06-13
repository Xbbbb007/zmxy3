/**
 * 关卡配置（LevelConfig）
 *
 * 所有关卡的数据定义，BattleScene 读取这里的配置来生成地图和敌人。
 * 新增关卡只需在 LEVELS 数组末尾加一项即可。
 *
 * 设计参考：造梦西游3 经典关卡
 * - 第一关 花果山：教学关，只有普通怪
 * - 第二关 黑风洞：引入冲锋怪，需要走位
 * - 第三关 黄风岭：投掷怪登场，多线作战
 * - 第四关 火焰山：BOSS 赤焰魔君，终极挑战
 */

import { EnemyType } from "./EnemyTypes";

// ===== 关卡数据结构 =====

export interface EnemySpawn {
  x: number;
  y: number;
  hp: number;
  type: EnemyType;
}

export interface PlatformDef {
  x: number;
  y: number;
  w: number;
}

export interface LevelConfig {
  /** 关卡唯一标识 */
  id: string;
  /** 关卡名称（显示在选择界面和战斗中） */
  name: string;
  /** 关卡简介 */
  description: string;

  // ---- 地图 ----
  mapWidth: number;
  mapHeight: number;
  groundColor: number;        // 地面主色
  groundStroke: number;       // 地面描边色
  platformColor: number;      // 平台主色
  platformStroke: number;     // 平台描边色
  platforms: PlatformDef[];

  // ---- 背景 ----
  skyTopColor: number;        // 天空渐变顶部
  skyBottomColor: number;     // 天空渐变底部
  cloudColor: number;         // 云/装饰物颜色

  // ---- 敌人 ----
  enemies: EnemySpawn[];
  bossName: string | null;    // 有关卡 BOSS 时显示名字，null 表示无 BOSS

  // ---- 难度系数（乘以敌人基础参数） ----
  enemyHpMultiplier: number;  // 敌人血量倍率
}

// ===== 四关配置 =====

export const LEVELS: LevelConfig[] = [

  // ==================== 第一关：花果山 ====================
  {
    id: "huaguoshan",
    name: "第一关 · 花果山",
    description: "猴王的故乡，小妖横行。清剿所有妖怪！",

    mapWidth: 2400,
    mapHeight: 540,
    groundColor: 0x5c8a33,
    groundStroke: 0x3d6b1f,
    platformColor: 0x6b8e23,
    platformStroke: 0x4a6b15,
    platforms: [
      { x: 400, y: 380, w: 150 },
      { x: 800, y: 330, w: 120 },
      { x: 1300, y: 360, w: 160 },
      { x: 1800, y: 310, w: 130 },
    ],

    skyTopColor: 0x4a90d9,
    skyBottomColor: 0x87ceeb,
    cloudColor: 0xffffff,

    enemies: [
      { x: 400, y: 432, hp: 80, type: EnemyType.NORMAL },
      { x: 800, y: 432, hp: 80, type: EnemyType.NORMAL },
      { x: 1300, y: 432, hp: 100, type: EnemyType.NORMAL },
    ],
    bossName: null,
    enemyHpMultiplier: 1.0,
  },

  // ==================== 第二关：黑风洞 ====================
  {
    id: "heifengdong",
    name: "第二关 · 黑风洞",
    description: "黑熊精的巢穴，冲锋型妖怪出没。小心被撞飞！",

    mapWidth: 2800,
    mapHeight: 540,
    groundColor: 0x3d3d3d,
    groundStroke: 0x2a2a2a,
    platformColor: 0x4a4a5a,
    platformStroke: 0x333344,
    platforms: [
      { x: 500, y: 380, w: 140 },
      { x: 900, y: 320, w: 110 },
      { x: 1200, y: 370, w: 160 },
      { x: 1700, y: 300, w: 130 },
      { x: 2200, y: 350, w: 150 },
    ],

    skyTopColor: 0x1a1a2e,
    skyBottomColor: 0x2d2d44,
    cloudColor: 0x444466,

    enemies: [
      { x: 450, y: 432, hp: 100, type: EnemyType.NORMAL },
      { x: 900, y: 432, hp: 100, type: EnemyType.NORMAL },
      { x: 1400, y: 432, hp: 130, type: EnemyType.CHARGER },
      { x: 2000, y: 432, hp: 130, type: EnemyType.CHARGER },
    ],
    bossName: null,
    enemyHpMultiplier: 1.2,
  },

  // ==================== 第三关：黄风岭 ====================
  {
    id: "huangfengling",
    name: "第三关 · 黄风岭",
    description: "黄沙漫天，远程法师藏在暗处。优先解决投掷怪！",

    mapWidth: 3000,
    mapHeight: 540,
    groundColor: 0x8b7355,
    groundStroke: 0x6b5335,
    platformColor: 0xa08060,
    platformStroke: 0x7a6040,
    platforms: [
      { x: 500, y: 380, w: 150 },
      { x: 900, y: 310, w: 120 },
      { x: 1400, y: 360, w: 180 },
      { x: 1900, y: 290, w: 130 },
      { x: 2400, y: 350, w: 160 },
    ],

    skyTopColor: 0xc4a35a,
    skyBottomColor: 0xe8c87a,
    cloudColor: 0xd4b86a,

    enemies: [
      { x: 400, y: 432, hp: 100, type: EnemyType.NORMAL },
      { x: 800, y: 432, hp: 120, type: EnemyType.CHARGER },
      { x: 1200, y: 432, hp: 120, type: EnemyType.CHARGER },
      { x: 1600, y: 432, hp: 80, type: EnemyType.THROWER },
      { x: 2100, y: 432, hp: 80, type: EnemyType.THROWER },
      { x: 2500, y: 432, hp: 100, type: EnemyType.NORMAL },
    ],
    bossName: null,
    enemyHpMultiplier: 1.4,
  },

  // ==================== 第四关：火焰山 ====================
  {
    id: "huoyanshan",
    name: "第四关 · 火焰山",
    description: "赤焰魔君的老巢。击败他，取经之路才能继续！",

    mapWidth: 3200,
    mapHeight: 540,
    groundColor: 0x5c2020,
    groundStroke: 0x3d1010,
    platformColor: 0x7a3030,
    platformStroke: 0x5a2020,
    platforms: [
      { x: 500, y: 380, w: 150 },
      { x: 900, y: 320, w: 120 },
      { x: 1400, y: 360, w: 180 },
      { x: 1900, y: 300, w: 130 },
      { x: 2400, y: 350, w: 160 },
      { x: 2900, y: 320, w: 140 },
    ],

    skyTopColor: 0x8b0000,
    skyBottomColor: 0xcc4400,
    cloudColor: 0xff6600,

    enemies: [
      { x: 400, y: 432, hp: 120, type: EnemyType.NORMAL },
      { x: 800, y: 432, hp: 140, type: EnemyType.CHARGER },
      { x: 1300, y: 432, hp: 90, type: EnemyType.THROWER },
      { x: 1800, y: 432, hp: 140, type: EnemyType.CHARGER },
      { x: 2600, y: 432, hp: 600, type: EnemyType.BOSS },
    ],
    bossName: "赤焰魔君",
    enemyHpMultiplier: 1.5,
  },
];

/** 根据 id 获取关卡配置 */
export function getLevelById(id: string): LevelConfig | undefined {
  return LEVELS.find((l) => l.id === id);
}
