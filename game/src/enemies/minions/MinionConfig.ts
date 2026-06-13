/**
 * 小怪参数配置（MinionConfig）
 *
 * 把所有非 BOSS 类敌人（普通怪/冲锋怪/投掷怪）的可调参数集中在这里。
 * 改数字就能调难度，不用翻逻辑代码。
 *
 * BOSS 参数仍然留在 EnemyManager.ts 中。
 */

// ======================== 普通近战怪（NORMAL） ========================

export const NORMAL = {
  /** 巡逻移动速度（很慢，像散步） */
  PATROL_SPEED: 60,
  /** 巡逻范围（像素，出生点左右各走这么远） */
  PATROL_RANGE: 120,

  /** 发现玩家的距离（像素，进入此范围就准备攻击） */
  DETECT_RANGE: 80,
  /** 攻击前摇（毫秒，期间可被打断） */
  ATTACK_WINDUP: 500,
  /** 攻击判定持续时间（毫秒） */
  ATTACK_DURATION: 200,
  /** 攻击后冷却（毫秒） */
  ATTACK_COOLDOWN: 800,
  /** 攻击伤害 */
  ATTACK_DAMAGE: 10,
  /** 攻击距离（像素） */
  ATTACK_RANGE: 45,
  /** 攻击击退力度 */
  ATTACK_KNOCKBACK: 180,
} as const;

// ======================== 冲锋怪（CHARGER） ========================

export const CHARGER = {
  /** 发现玩家距离（比近战怪远很多） */
  DETECT_RANGE: 250,
  /** 冲锋速度（很快！） */
  CHARGE_SPEED: 450,
  /** 冲锋前摇（蓄力时间，可打断） */
  CHARGE_WINDUP: 600,
  /** 冲锋持续时间 */
  CHARGE_DURATION: 500,
  /** 冲撞伤害 */
  CHARGE_DAMAGE: 15,
  /** 冲撞击退 */
  CHARGE_KNOCKBACK: 250,
  /** 冲锋后冷却（比较久） */
  COOLDOWN: 1200,
  /** 巡逻速度（与普通怪共用逻辑） */
  PATROL_SPEED: 60,
  /** 巡逻范围 */
  PATROL_RANGE: 120,
} as const;

// ======================== 远程投掷怪（THROWER） ========================

export const THROWER = {
  /** 发现玩家距离 */
  DETECT_RANGE: 200,
  /** 偏好距离（保持这个距离扔东西） */
  PREFERRED_DIST: 150,
  /** 瞄准时间（毫秒，可打断） */
  AIM_TIME: 400,
  /** 投掷后冷却 */
  COOLDOWN: 1500,
  /** 投掷物飞行速度 */
  PROJECTILE_SPEED: 350,
  /** 投掷物伤害 */
  PROJECTILE_DAMAGE: 8,
  /** 后退速度（玩家靠近时往后跑） */
  RETREAT_SPEED: 55,
  /** 太近判定阈值（低于此距离触发后退） */
  RETREAT_THRESHOLD: 65,
  /** 巡逻速度 */
  PATROL_SPEED: 60,
  /** 巡逻范围 */
  PATROL_RANGE: 120,
} as const;

// ======================== 通用 ========================

/** 小怪受击硬直时间（毫秒），BOSS 不受此影响 */
export const MINION_HIT_STAGGER = 500;
