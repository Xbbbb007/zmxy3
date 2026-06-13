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
  readonly RUN_SPEED = 500;         // 奔跑速度（双击触发）
  readonly JUMP_SPEED = -400;       // 跳跃力度（负数=向上）
  readonly DOUBLE_TAP_WINDOW = 300; // 双击判定窗口(ms)

  // ========== 运行时状态 ==========
  private _facingRight = true;
  private jumpCount = 0;
  private _isDashing = false;       // 技能冲刺中（由技能设置，PlayerController 不覆盖速度）
  private _isRunning = false;       // 奔跑中（双击触发）

  // ---- 双击检测（用 DOM 原生事件，绕过 Phaser 键盘系统，最可靠） ----
  private lastReleaseTimeLeft = 0;  // 上次松开左方向键的时间戳
  private lastReleaseTimeRight = 0; // 上次松开右方向键的时间戳

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
  get isRunning(): boolean { return this._isRunning; }

  constructor(scene: Phaser.Scene, player: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.player = player;

    // 键盘绑定
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.keyA = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // ---- 双击检测：用 DOM 原生 keyup 事件记录松开时刻 ----
    // 不依赖 Phaser 的键盘事件系统，直接监听 window 的 keyup
    // 这样无论 Phaser 内部怎么处理，DOM 事件一定能捕获到
    window.addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.code === "KeyA") {
        this.lastReleaseTimeLeft = performance.now();
      } else if (e.code === "KeyD") {
        this.lastReleaseTimeRight = performance.now();
      }
    });

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "KeyA") {
        const gap = performance.now() - this.lastReleaseTimeLeft;
        if (gap < this.DOUBLE_TAP_WINDOW) {
          this._isRunning = true;
        } else if (!this.keyD.isDown) {
          // 只有没按住另一个方向键时才取消（避免误取消）
          this._isRunning = false;
        }
      } else if (e.code === "KeyD") {
        const gap = performance.now() - this.lastReleaseTimeRight;
        if (gap < this.DOUBLE_TAP_WINDOW) {
          this._isRunning = true;
        } else if (!this.keyA.isDown) {
          this._isRunning = false;
        }
      }
    });
  }

  /**
   * 重置运行时状态（scene.restart() 时调用）
   */
  reset() {
    this._facingRight = true;
    this.jumpCount = 0;
    this._isRunning = false;
    this.lastReleaseTimeLeft = 0;
    this.lastReleaseTimeRight = 0;
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

    // ---- 奔跑终止条件（每帧检测） ----

    // 松开所有方向键 → 停止奔跑
    if (!this.keyA.isDown && !this.keyD.isDown) {
      this._isRunning = false;
    }

    // 离地 → 停止奔跑（奔跑是地面专属）
    if (!body.touching.down) {
      this._isRunning = false;
    }

    // 反向按键 → 停止奔跑
    if (this._isRunning) {
      const runningRight = body.velocity.x > 0;
      if ((runningRight && this.keyA.isDown && !this.keyD.isDown) ||
          (!runningRight && this.keyD.isDown && !this.keyA.isDown)) {
        this._isRunning = false;
      }
    }

    // ---- 移动（攻击/蓄力/技能冲刺中不响应） ----
    if (!isAttacking && !isCasting && !this._isDashing) {
      const speed = this._isRunning ? this.RUN_SPEED : this.MOVE_SPEED;
      if (this.keyA.isDown) {
        body.setVelocityX(-speed);
      } else if (this.keyD.isDown) {
        body.setVelocityX(speed);
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
