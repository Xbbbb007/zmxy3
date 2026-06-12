/**
 * 玩家战斗模块（PlayerCombat）
 *
 * 负责攻击连招系统：三段连击（J → J → J）
 * 从 BattleScene 中拆出来的"攻击判定"部分。
 *
 * BattleScene 只需：
 * 1. new PlayerCombat(scene, player)
 * 2. combat.update(time, isDashing, isCasting, enemies, damageEnemy) // 每帧调用
 * 3. combat.isAttacking // 读取攻击状态
 */

import { Enemy } from "../types/EnemyTypes";

export class PlayerCombat {
  // ========== 可调参数（改数字调手感！） ==========
  readonly ATTACK_WINDOW = 400;          // 连招窗口(ms)：攻击后多长时间内再按 J 能接下一段
  readonly ATTACK_DURATION = 250;        // 攻击锁定时间(ms)：出招后多久才能再次移动/攻击
  readonly COMBO_DAMAGE = [10, 15, 25];  // 三段连招各自的伤害
  readonly COMBO_KNOCKBACK = [150, 200, 300]; // 三段连招各自的击退力度
  readonly COMBO_RANGE = [45, 50, 55];   // 三段连招的攻击距离(像素)

  // ========== 运行时状态 ==========
  private _isAttacking = false;
  private comboStep = 0;
  private comboTimer: number | null = null;

  // ========== 键盘 ==========
  private keyJ: Phaser.Input.Keyboard.Key;

  // ========== 引用 ==========
  private scene: Phaser.Scene;
  private player: Phaser.GameObjects.Container;

  // ========== 公开只读 getter ==========
  get isAttacking(): boolean { return this._isAttacking; }

  constructor(scene: Phaser.Scene, player: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.player = player;

    // 键盘绑定
    this.keyJ = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
  }

  /**
   * 重置运行时状态（scene.restart() 时调用）
   */
  reset() {
    this._isAttacking = false;
    this.comboStep = 0;
    this.comboTimer = null;
  }

  /**
   * 每帧更新（在 BattleScene.update() 中调用）
   *
   * @param time        当前时间戳 (scene.time.now)
   * @param isDashing   冲刺中标志（由 PlayerController 提供）
   * @param isCasting   蓄力中标志（由 GiantSword 提供）
   * @param enemies     敌人物理组（用于命中检测）
   * @param damageEnemy 伤害敌人回调
   * @param facingRight 玩家朝向
   */
  update(
    time: number,
    isDashing: boolean,
    isCasting: boolean,
    enemies: Phaser.Physics.Arcade.Group,
    damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) => void,
    facingRight: boolean,
  ) {
    // 冲刺/蓄力中不攻击
    if (isDashing || isCasting) return;

    // ---- 连招超时重置 ----
    if (this.comboTimer !== null && time >= this.comboTimer) {
      this.comboStep = 0;
      this.comboTimer = null;
    }

    // ---- 攻击输入检测 ----
    if (!Phaser.Input.Keyboard.JustDown(this.keyJ)) return;
    if (this._isAttacking) return;

    if (this.comboTimer === null || time >= this.comboTimer) {
      this.comboStep = 0;
    }
    this.comboStep++;
    if (this.comboStep > 3) this.comboStep = 1;

    this.performAttack(this.comboStep, enemies, damageEnemy, facingRight);
    this.comboTimer = time + this.ATTACK_WINDOW;
  }

  // ======================== 内部方法 ========================

  /**
   * 执行攻击：创建判定框 → 命中检测 → 特效 → 延时结束
   */
  private performAttack(
    step: number,
    enemies: Phaser.Physics.Arcade.Group,
    damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) => void,
    facingRight: boolean,
  ) {
    const i = step - 1;
    this._isAttacking = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);

    // 攻击判定框（面朝方向的半透明矩形）
    const range = this.COMBO_RANGE[i];
    const dir = facingRight ? 1 : -1;
    const hitX = this.player.x + dir * range;

    const hitbox = this.scene.add.rectangle(hitX, this.player.y, 36, 48, 0xffff00, 0.25);
    hitbox.setStrokeStyle(1, 0xffff00, 0.4);
    this.scene.physics.add.existing(hitbox);
    (hitbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // 命中检测（手动算距离，比 physics.overlap 更可靠）
    enemies.getChildren().forEach((obj) => {
      const enemyContainer = obj as Phaser.GameObjects.Container;
      const enemy = enemyContainer.getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const dx = enemyContainer.x - hitX;
      const dy = enemyContainer.y - this.player.y;
      if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
        damageEnemy(enemy, this.COMBO_DAMAGE[i], dir * this.COMBO_KNOCKBACK[i]);
      }
    });

    // 挥砍特效
    this.showSlashEffect(hitX, this.player.y, step);

    // 攻击结束后解除锁定
    this.scene.time.delayedCall(this.ATTACK_DURATION, () => {
      this._isAttacking = false;
      hitbox.destroy();
    });
  }

  /**
   * 挥砍视觉特效（三段分别用不同颜色和大小）
   */
  private showSlashEffect(x: number, y: number, step: number) {
    const g = this.scene.add.graphics();
    const colors = [0xffffff, 0xffdd44, 0xff4444];
    const sizes = [20, 26, 34];
    const size = sizes[step - 1];

    g.lineStyle(3, colors[step - 1], 0.8);
    g.strokeEllipse(0, 0, size * 2, size * 3);
    g.setPosition(x, y);

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.4,
      duration: 150,
      onComplete: () => g.destroy(),
    });
  }
}
