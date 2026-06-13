/**
 * 玩家控制器（PlayerController）
 *
 * 负责玩家的移动、跳跃和朝向管理。
 * 从 BattleScene 中拆出来的"物理操控"部分。
 *
 * BattleScene 只需：
 * 1. new PlayerController(scene, player)
 * 2. controller.update(time, isAttacking, isCasting) // 每帧调用
 * 3. controller.facingRight // 读取朝向
 */

import { drawPlayer } from "../entities/PlayerGraphics";

export class PlayerController {
  // ========== 可调参数（改数字调手感！） ==========
  readonly MOVE_SPEED = 300;        // 移动速度
  readonly JUMP_SPEED = -400;       // 跳跃力度（负数=向上）

  // ========== 运行时状态 ==========
  private _facingRight = true;
  private jumpCount = 0;
  private _isDashing = false;       // 技能冲刺中（由技能设置，PlayerController 不覆盖速度）

  // ========== 键盘 ==========
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;

  // ========== 引用 ==========
  private scene: Phaser.Scene;
  private player: Phaser.GameObjects.Container;

  // ========== 公开只读 getter ==========
  get facingRight(): boolean { return this._facingRight; }
  get isDashing(): boolean { return this._isDashing; }

  constructor(scene: Phaser.Scene, player: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.player = player;

    // 键盘绑定
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.keyA = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  /**
   * 重置运行时状态（scene.restart() 时调用）
   */
  reset() {
    this._facingRight = true;
    this.jumpCount = 0;
  }

  /**
   * 每帧更新（在 BattleScene.update() 中调用）
   *
   * @param time        当前时间戳 (scene.time.now)
   * @param isAttacking 攻击中标志（由 PlayerCombat 提供）
   * @param isCasting   蓄力中标志（由 GiantSword 提供）
   */
  update(time: number, isAttacking: boolean, isCasting: boolean) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const { space } = this.cursors;

    // ---- 移动（攻击/蓄力/技能冲刺中不响应） ----
    if (!isAttacking && !isCasting && !this._isDashing) {
      if (this.keyA.isDown) {
        body.setVelocityX(-this.MOVE_SPEED);
      } else if (this.keyD.isDown) {
        body.setVelocityX(this.MOVE_SPEED);
      } else {
        // 松开方向键 → 立即停止
        body.setVelocityX(0);
      }
    }

    // ---- 跳跃（攻击/蓄力/技能冲刺中不响应） ----
    if (body.touching.down) this.jumpCount = 0;
    if (!isAttacking && !isCasting && !this._isDashing) {
      if (Phaser.Input.Keyboard.JustDown(space) && this.jumpCount < 2) {
        body.setVelocityY(this.JUMP_SPEED);
        this.jumpCount++;
      }
    }

    // ---- 朝向（攻击中不改变） ----
    if (!isAttacking) {
      if (body.velocity.x !== 0) {
        const newFacing = body.velocity.x >= 0;
        if (newFacing !== this._facingRight) {
          this._facingRight = newFacing;
          drawPlayer(this.player, this._facingRight);
        }
      }
    }
  }

  /**
   * 设置技能冲刺状态（供烈焰闪等技能调用）
   * 冲刺期间 PlayerController 不会覆盖玩家速度
   */
  setDash(isDashing: boolean) {
    this._isDashing = isDashing;
  }
}
