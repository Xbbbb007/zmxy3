/**
 * 玩家控制器（PlayerController）
 *
 * 负责玩家的移动、跳跃、冲刺和朝向管理。
 * 从 BattleScene 中拆出来的"物理操控"部分。
 *
 * BattleScene 只需：
 * 1. new PlayerController(scene, player)
 * 2. controller.update(time, isAttacking, isCasting) // 每帧调用
 * 3. controller.facingRight // 读取朝向
 * 4. controller.isDashing   // 读取冲刺状态
 * 5. controller.setDash(isDashing, endTime) // 技能调用
 */

import { drawPlayer } from "../entities/PlayerGraphics";

export class PlayerController {
  // ========== 可调参数（改数字调手感！） ==========
  readonly MOVE_SPEED = 300;        // 移动速度
  readonly JUMP_SPEED = -400;       // 跳跃力度（负数=向上）
  readonly DASH_SPEED = 700;        // 冲刺速度
  readonly DASH_DURATION = 200;     // 冲刺持续时间(ms)
  readonly DOUBLE_TAP_WINDOW = 300; // 双击判定窗口(ms)

  // ========== 运行时状态 ==========
  private _facingRight = true;
  private jumpCount = 0;
  private _isDashing = false;
  private dashEndTime = 0;

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

    // 双击冲刺
    this.setupDoubleTap(this.keyA, () => this.startDash(false));
    this.setupDoubleTap(this.keyD, () => this.startDash(true));
  }

  /**
   * 重置运行时状态（scene.restart() 时调用）
   */
  reset() {
    this._facingRight = true;
    this.jumpCount = 0;
    this._isDashing = false;
    this.dashEndTime = 0;
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

    // ---- 冲刺结束 ----
    if (this._isDashing && time >= this.dashEndTime) {
      this._isDashing = false;
      body.setDragX(600);
    }

    // ---- 移动（攻击/冲刺/蓄力中不响应） ----
    if (!this._isDashing && !isAttacking && !isCasting) {
      if (this.keyA.isDown) body.setVelocityX(-this.MOVE_SPEED);
      else if (this.keyD.isDown) body.setVelocityX(this.MOVE_SPEED);
    }

    // ---- 跳跃 ----
    if (body.touching.down) this.jumpCount = 0;
    if (Phaser.Input.Keyboard.JustDown(space) && this.jumpCount < 2) {
      body.setVelocityY(this.JUMP_SPEED);
      this.jumpCount++;
    }

    // ---- 朝向（攻击/冲刺中不改变） ----
    if (!this._isDashing && !isAttacking) {
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
   * 外部设置冲刺状态（供技能调用）
   */
  setDash(isDashing: boolean, endTime: number) {
    this._isDashing = isDashing;
    this.dashEndTime = endTime;
  }

  // ======================== 内部方法 ========================

  /**
   * 双击检测：两次快速按下同一个方向键 → 触发冲刺
   */
  private setupDoubleTap(key: Phaser.Input.Keyboard.Key, onDoubleTap: () => void) {
    let lastTapTime = 0;
    key.on("down", () => {
      const now = this.scene.time.now;
      if (now - lastTapTime < this.DOUBLE_TAP_WINDOW) {
        onDoubleTap();
        lastTapTime = 0;
      } else {
        lastTapTime = now;
      }
    });
  }

  /**
   * 开始冲刺
   */
  private startDash(toRight: boolean) {
    this._isDashing = true;
    this._facingRight = toRight;
    this.dashEndTime = this.scene.time.now + this.DASH_DURATION;
    drawPlayer(this.player, this._facingRight);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(toRight ? this.DASH_SPEED : -this.DASH_SPEED);
    body.setDragX(0);
  }
}
