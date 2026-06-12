/**
 * 敌人类型定义（EnemyTypes）
 *
 * 把敌人的"类型标签"和"数据结构"从 BattleScene 里抽出来，
 * 这样其他文件（EnemyFactory、EnemyAI、BossHud 等）都能引用，
 * 不用全部挤在 BattleScene 里面。
 *
 * 这个文件只有类型和接口，没有任何运行时代码，
 * 所以不会产生循环依赖的问题。
 */

// ===== 敌人状态机 =====
// 敌人每一帧都处于以下某种状态，AI 根据当前状态决定行为
export enum EnemyState {
  PATROL,    // 正常巡逻（散步/逼近玩家）
  WINDUP,    // 前摇中（站定不动，头顶感叹号，可被打断）
  ATTACKING, // 攻击判定中（普通怪近战挥砍）
  CHARGING,  // 冲锋中（冲锋怪/BOSS 高速冲向玩家）
  AIMING,    // 瞄准中（投掷怪锁定方向准备投掷）
  BOSS_JUMP, // BOSS 跳起中（在空中，由 Tween 控制）
  BOSS_FIRE, // BOSS 弹幕发射中（站定不动，连续发射能量球）
  COOLDOWN,  // 攻击后冷却（等冷却结束恢复巡逻）
  HIT,       // 受击硬直中（被打后的短暂僵直）
}

// ===== 敌人类型 =====
// 不同种类的敌人有不同的外观、AI 行为和攻击方式
export enum EnemyType {
  NORMAL,   // 普通近战怪（蓝灰色方块，靠近了才打你）
  CHARGER,  // 冲锋怪（绿色野牛，远距离发现玩家后高速冲撞）
  THROWER,  // 远程投掷怪（紫色法师，保持距离扔能量球）
  BOSS,     // BOSS：三种攻击模式循环（冲锋/跳砸/弹幕）
}

// ===== 敌人数据结构 =====
// 每个敌人身上挂着这一整坨数据（通过 container.setData("enemy", enemy) 存取）
export interface Enemy {
  container: Phaser.GameObjects.Container; // 敌人的容器（包含所有视觉元素）
  hp: number;                              // 当前血量
  maxHp: number;                           // 最大血量
  hpBarBg: Phaser.GameObjects.Rectangle;   // 头顶血条背景（灰色）
  hpBarFill: Phaser.GameObjects.Rectangle; // 头顶血条填充（绿色/红色）
  alive: boolean;                          // 是否还活着
  type: EnemyType;                         // 敌人类型（决定 AI 行为）

  // ---- 巡逻状态 ----
  patrolLeft: number;   // 巡逻左边界（出生点左侧一定距离）
  patrolRight: number;  // 巡逻右边界
  facingRight: boolean; // 当前面朝方向

  // ---- 攻击 AI 状态 ----
  state: EnemyState;                                     // 当前状态机状态
  stateTimer: number;                                    // 当前状态结束的时间戳
  windupIndicator: Phaser.GameObjects.Text | null;       // 前摇感叹号（可被打掉）

  // ---- BOSS 专用 ----
  attackIndex: number; // 攻击序号（0=冲锋, 1=跳砸, 2=弹幕，循环递增）
}
