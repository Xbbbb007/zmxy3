/**
 * 战斗场景（BattleScene）
 *
 * 新增：攻击系统 + 训练假人
 *
 * 攻击操作：
 * - J 键：普通攻击（三连招：J → J → J，需要连续按）
 * - 每段伤害递增（10 → 15 → 25）
 * - 第三段击飞效果更强
 *
 * 受击反馈：
 * - 击退（knockback）
 * - 闪白（短暂变白）
 * - 伤害飘字
 * - 头顶血条
 */

import { drawPlayer } from "../entities/PlayerGraphics";

// ===== 敌人状态机 =====
enum EnemyState {
  PATROL,    // 正常巡逻
  WINDUP,    // 前摇中（可被打断）
  ATTACKING, // 攻击判定中
  COOLDOWN,  // 攻击后冷却
  HIT,       // 受击硬直中
}

// ===== 简单的敌人结构（后面会移到独立文件） =====
interface Enemy {
  container: Phaser.GameObjects.Container;
  hp: number;
  maxHp: number;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  alive: boolean;
  // 巡逻状态
  patrolLeft: number;
  patrolRight: number;
  facingRight: boolean;
  // 攻击 AI 状态
  state: EnemyState;
  stateTimer: number;          // 当前状态结束时间
  windupIndicator: Phaser.GameObjects.Text | null; // 前摇感叹号
}

export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key; // 技能1：烈焰闪
  private keyL!: Phaser.Input.Keyboard.Key; // 技能2：巨剑术
  private enemies!: Phaser.Physics.Arcade.Group;

  // ========== 可调参数（随便改，找手感） ==========
  private readonly MOVE_SPEED = 300;       // 移动速度（越大跑得越快）
  private readonly JUMP_SPEED = -400;      // 跳跃力度（负数=向上，绝对值越大跳越高）
  private readonly MAP_WIDTH = 3000;       // 地图宽度（像素，比画面宽才能滚动）
  private readonly MAP_HEIGHT = 540;       // 地图高度（和画面高度一致）

  // 冲刺参数
  private readonly DASH_SPEED = 700;       // 冲刺速度（应该比 MOVE_SPEED 快）
  private readonly DASH_DURATION = 200;    // 冲刺持续时间（毫秒，到期后自动减速停下）
  private readonly DOUBLE_TAP_WINDOW = 300; // 双击判定窗口（毫秒，两次按键间隔小于此值才算双击）

  // 攻击参数
  private readonly ATTACK_WINDOW = 400;   // 连招窗口(ms)：攻击后多长时间内再按 J 能接下一段，越大越好接
  private readonly ATTACK_DURATION = 250;  // 攻击锁定时间(ms)：出招后多久才能再次移动/攻击
  private readonly COMBO_DAMAGE = [10, 15, 25];      // 三段连招各自的伤害，逐段递增让第三段更有打击感
  private readonly COMBO_KNOCKBACK = [150, 200, 300]; // 三段连招各自的击退力度，第三段打飞最远
  private readonly COMBO_RANGE = [45, 50, 55];        // 三段连招的攻击距离(像素)，判定框离角色中心的水平距离

  // 敌人巡逻参数
  private readonly ENEMY_PATROL_SPEED = 60;  // 巡逻移动速度（很慢，像散步）
  private readonly ENEMY_PATROL_RANGE = 120; // 巡逻范围（像素，出生点左右各走这么远）

  // 敌人攻击参数
  private readonly ENEMY_DETECT_RANGE = 80;  // 发现玩家的距离（像素，进入此范围就准备攻击）
  private readonly ENEMY_ATTACK_WINDUP = 500; // 攻击前摇（毫秒，期间可被打断）
  private readonly ENEMY_ATTACK_DURATION = 200; // 攻击判定持续时间（毫秒）
  private readonly ENEMY_ATTACK_COOLDOWN = 800; // 攻击后冷却（毫秒，冷却完才能再次攻击）
  private readonly ENEMY_ATTACK_DAMAGE = 10;   // 敌人攻击伤害
  private readonly ENEMY_ATTACK_RANGE = 45;    // 敌人攻击距离（像素）
  private readonly ENEMY_ATTACK_KNOCKBACK = 180; // 敌人攻击击退力度

  // 玩家受击参数
  private readonly PLAYER_HIT_INVINCIBLE = 500; // 受伤后无敌时间（毫秒，防止连续掉血）

  // ========== 技能参数 ==========
  private readonly PLAYER_MAX_MP = 100;        // 最大 MP
  private readonly MP_REGEN = 5;               // 每秒自然回蓝

  // 技能 1：烈焰闪（K 键）
  // 向前冲刺并对路径上的敌人造成火焰伤害
  private readonly SKILL1_MP_COST = 20;         // MP 消耗
  private readonly SKILL1_COOLDOWN = 5000;      // 冷却时间(ms)
  private readonly SKILL1_DAMAGE = 30;           // 伤害
  private readonly SKILL1_DASH_SPEED = 600;      // 冲刺速度
  private readonly SKILL1_DASH_DURATION = 300;   // 冲刺持续时间(ms)
  private readonly SKILL1_RANGE = 200;           // 伤害判定距离(像素)

  // 技能 2：巨剑术（L 键）
  // 蓄力1秒 → 头顶法阵 → 巨剑冲出，范围攻击
  private readonly SKILL2_MP_COST = 0;            // 测试阶段不耗蓝
  private readonly SKILL2_COOLDOWN = 0;           // 测试阶段无冷却
  private readonly SKILL2_CHARGE_TIME = 2500;     // 蓄力时间(ms)，2.5秒
  private readonly SKILL2_DAMAGE = 60;            // 伤害（巨剑术应该很痛）
  private readonly SKILL2_SWORD_SPEED = 800;      // 巨剑飞行速度
  private readonly SKILL2_SWORD_RANGE = 350;      // 巨剑飞行距离(像素)
  private readonly SKILL2_AOE_WIDTH = 80;         // 巨剑AOE宽度(像素)
  private readonly SKILL2_ANGLE = 15;              // 巨剑向下射击角度（度数，改这一个数就行）

  // ===== 运行时状态 =====
  private facingRight = true;
  private jumpCount = 0;
  private isDashing = false;
  private dashEndTime = 0;
  private isAttacking = false;
  private comboStep = 0;
  private comboTimer: number | null = null;

  // 玩家 HP
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerHitTimer = 0;  // 无敌结束时间
  private isPlayerDead = false; // 死亡标记（死了就不能动了）
  private isVictory = false;    // 胜利标记
  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBarFill!: Phaser.GameObjects.Rectangle;

  // 玩家 MP
  private playerMp = 100;
  private playerMpBarBg!: Phaser.GameObjects.Rectangle;
  private playerMpBarFill!: Phaser.GameObjects.Rectangle;

  // 技能冷却计时
  private skill1CooldownEnd = 0; // 技能1冷却结束时间
  private skill2CooldownEnd = 0; // 技能2冷却结束时间
  private isCastingSkill2 = false; // 正在蓄力巨剑术（不能移动/攻击）
  private swordHitEnemies = new Set<Enemy>(); // 万剑归宗：已命中的敌人（防止重复扣血）

  constructor() {
    super({ key: "BattleScene" });
  }

  create() {
    // ===== 0. 重置运行时状态（scene.restart() 时需要） =====
    // Phaser 的 scene.restart() 不会重新执行类的字段初始化，
    // 所以必须在 create() 开头手动重置所有运行时变量
    this.facingRight = true;
    this.jumpCount = 0;
    this.isDashing = false;
    this.dashEndTime = 0;
    this.isAttacking = false;
    this.comboStep = 0;
    this.comboTimer = null;
    this.isPlayerDead = false;
    this.isVictory = false;
    this.playerHp = this.playerMaxHp;
    this.playerMp = this.PLAYER_MAX_MP;
    this.playerHitTimer = 0;
    this.skill1CooldownEnd = 0;
    this.skill2CooldownEnd = 0;
    this.isCastingSkill2 = false;
    this.swordHitEnemies = new Set<Enemy>();

    // ===== 1. 背景 =====
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x4a90d9, 0x4a90d9, 0x87ceeb, 0x87ceeb, 1);
    sky.fillRect(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
    sky.setScrollFactor(0.3);

    [
      [200, 60, 120, 30], [600, 90, 80, 20], [1100, 50, 100, 25],
      [1700, 80, 90, 22], [2300, 65, 110, 28],
    ].forEach(([x, y, w, h]) => {
      this.add.ellipse(x, y, w, h, 0xffffff, 0.6).setScrollFactor(0.2);
    });

    // ===== 2. 地面 + 平台 =====
    const groundGroup = this.physics.add.staticGroup();

    const ground = this.add.rectangle(this.MAP_WIDTH / 2, 480, this.MAP_WIDTH, 40, 0x5c4033);
    ground.setStrokeStyle(2, 0x3d2b1f);
    groundGroup.add(ground);

    [
      { x: 500, y: 380, w: 150 }, { x: 900, y: 320, w: 120 },
      { x: 1400, y: 360, w: 180 }, { x: 1900, y: 300, w: 130 },
      { x: 2500, y: 350, w: 160 },
    ].forEach(({ x, y, w }) => {
      const p = this.add.rectangle(x, y, w, 20, 0x6b8e23);
      p.setStrokeStyle(2, 0x4a6b15);
      groundGroup.add(p);
    });

    // ===== 3. 物理世界边界（必须在创建任何物理体之前设置） =====
    this.physics.world.setBounds(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);

    // ===== 4. 敌人组 =====
    this.enemies = this.physics.add.group({
      collideWorldBounds: true, // 组级别强制所有成员不能出界
    });

    // ===== 4. 玩家 =====
    this.player = this.add.container(100, 400);
    drawPlayer(this.player, this.facingRight);

    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 48);
    body.setOffset(-16, -24);
    body.setCollideWorldBounds(true);
    body.setBounce(0);    // 落地不弹跳（0=完全吸收，1=完全弹性）
    body.setDragX(600);   // 水平摩擦力（松手后减速停止，越大停得越快）

    this.physics.add.collider(this.player, groundGroup);
    this.physics.add.collider(this.enemies, groundGroup); // 敌人也要和地面碰撞

    // ===== 5. 相机 =====
    this.cameras.main.setBounds(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ===== 6. 键盘 =====
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    this.setupDoubleTap(this.keyA, () => this.startDash(false));
    this.setupDoubleTap(this.keyD, () => this.startDash(true));

    // ===== 7. 训练假人（走到它们面前按 J 砍） =====
    this.spawnEnemy(350, 432, 100);
    this.spawnEnemy(700, 432, 100);
    this.spawnEnemy(1100, 432, 100);

    // ===== 8. HUD =====
    // 玩家血条（固定在屏幕左上角）
    this.playerHpBarBg = this.add.rectangle(90, 42, 160, 14, 0x333333).setScrollFactor(0);
    this.playerHpBarFill = this.add.rectangle(11, 42, 158, 12, 0x48bb78)
      .setOrigin(0, 0.5).setScrollFactor(0);
    this.add.text(11, 28, "HP", {
      fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
    }).setScrollFactor(0);

    // 玩家蓝条（MP）
    this.playerMpBarBg = this.add.rectangle(90, 62, 160, 14, 0x333333).setScrollFactor(0);
    this.playerMpBarFill = this.add.rectangle(11, 62, 158, 12, 0x4299e1)
      .setOrigin(0, 0.5).setScrollFactor(0);
    this.add.text(11, 48, "MP", {
      fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
    }).setScrollFactor(0);

    // 技能 CD 提示
    this.add.text(175, 55, "K:烈焰闪 L:巨剑术", {
      fontSize: "11px", color: "#f5c842", fontFamily: "Arial",
    }).setScrollFactor(0);

    const tip = this.add.text(20, 75,
      "A D 移动 | 双击冲刺 | 空格 跳跃 | J 攻击 | K 技能",
      {
        fontSize: "13px", color: "#ffffff", fontFamily: "Arial",
        backgroundColor: "#00000088", padding: { x: 8, y: 4 },
      }
    );
    tip.setScrollFactor(0);
  }

  // ======================== 每帧更新 ========================

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const { space } = this.cursors;

    // 死了就不响应任何输入
    if (this.isPlayerDead) return;

    // 胜利后也不响应输入
    if (this.isVictory) return;

    // ---- 冲刺结束 ----
    if (this.isDashing && this.time.now >= this.dashEndTime) {
      this.isDashing = false;
      body.setDragX(600);
    }

    // ---- 移动（攻击/冲刺/蓄力中不响应） ----
    if (!this.isDashing && !this.isAttacking && !this.isCastingSkill2) {
      if (this.keyA.isDown) body.setVelocityX(-this.MOVE_SPEED);
      else if (this.keyD.isDown) body.setVelocityX(this.MOVE_SPEED);
    }

    // ---- 跳跃 ----
    if (body.touching.down) this.jumpCount = 0;
    if (Phaser.Input.Keyboard.JustDown(space) && this.jumpCount < 2) {
      body.setVelocityY(this.JUMP_SPEED);
      this.jumpCount++;
    }

    // ---- 朝向 ----
    if (!this.isDashing && !this.isAttacking) {
      if (body.velocity.x !== 0) {
        const newFacing = body.velocity.x >= 0;
        if (newFacing !== this.facingRight) {
          this.facingRight = newFacing;
          drawPlayer(this.player, this.facingRight);
        }
      }
    }

    // ---- 连招超时重置 ----
    if (this.comboTimer !== null && this.time.now >= this.comboTimer) {
      this.comboStep = 0;
      this.comboTimer = null;
    }

    // ---- 攻击 ----
    this.handleAttackInput();

    // ---- 技能 ----
    this.handleSkillInput();

    // ---- MP 自然恢复（每秒 +5） ----
    // delta = 上一帧到这一帧的时间差(ms)
    this.playerMp = Math.min(this.PLAYER_MAX_MP, this.playerMp + this.MP_REGEN * (this.game.loop.delta / 1000));
    this.updatePlayerMpBar();

    // ---- 更新敌人位置（血条跟随） ----
    this.updateEnemies();

    // ---- 胜利检测：所有敌人都死了 ----
    if (!this.isVictory) {
      const allDead = this.enemies.getChildren().every((obj) => {
        const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
        return !enemy?.alive;
      });
      if (allDead) {
        this.showVictory();
      }
    }
  }

  // ======================== 攻击系统 ========================

  /**
   * 检测 J 键输入，管理连招段数
   * 连招窗口内按 J → 下一段；超时或首次 → 从第一段开始
   */
  private handleAttackInput() {
    if (!Phaser.Input.Keyboard.JustDown(this.keyJ)) return;
    if (this.isAttacking) return;

    if (this.comboTimer === null || this.time.now >= this.comboTimer) {
      this.comboStep = 0;
    }
    this.comboStep++;
    if (this.comboStep > 3) this.comboStep = 1;

    this.performAttack(this.comboStep);
    this.comboTimer = this.time.now + this.ATTACK_WINDOW;
  }

  /**
   * 执行攻击：创建判定框 → 命中检测 → 特效 → 延时结束
   */
  private performAttack(step: number) {
    const i = step - 1;
    this.isAttacking = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);

    // 攻击判定框（面朝方向的半透明矩形）
    const range = this.COMBO_RANGE[i];
    const dir = this.facingRight ? 1 : -1;
    const hitX = this.player.x + dir * range;

    const hitbox = this.add.rectangle(hitX, this.player.y, 36, 48, 0xffff00, 0.25);
    hitbox.setStrokeStyle(1, 0xffff00, 0.4);
    this.physics.add.existing(hitbox);
    (hitbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // 命中检测（用距离判定，比 physics.overlap 更可靠）
    // physics.overlap 在同一帧内创建物体并检测时可能不生效，
    // 因为物理引擎还没处理新创建的 hitbox。手动算距离就没这个问题。
    this.enemies.getChildren().forEach((obj) => {
      const enemyContainer = obj as Phaser.GameObjects.Container;
      const enemy = enemyContainer.getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const dx = enemyContainer.x - hitX;
      const dy = enemyContainer.y - this.player.y;
      // 水平距离 < 攻击判定框半宽 + 敌人体宽，垂直距离 < 两者半高之和
      if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
        this.damageEnemy(enemy, this.COMBO_DAMAGE[i], dir * this.COMBO_KNOCKBACK[i]);
      }
    });

    // 挥砍特效
    this.showSlashEffect(hitX, this.player.y, step);

    // 攻击结束后解除锁定
    this.time.delayedCall(this.ATTACK_DURATION, () => {
      this.isAttacking = false;
      hitbox.destroy();
    });
  }

  /**
   * 挥砍视觉特效（三段分别用不同颜色和大小）
   */
  private showSlashEffect(x: number, y: number, step: number) {
    const g = this.add.graphics();
    const colors = [0xffffff, 0xffdd44, 0xff4444];
    const sizes = [20, 26, 34];
    const size = sizes[step - 1];

    g.lineStyle(3, colors[step - 1], 0.8);
    g.strokeEllipse(0, 0, size * 2, size * 3);
    g.setPosition(x, y);

    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.4,
      duration: 150,
      onComplete: () => g.destroy(),
    });
  }

  // ======================== 技能系统 ========================

  /**
   * 技能输入处理（每帧调用）
   */
  private handleSkillInput() {
    // 技能1：烈焰闪（K 键）
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) {
      this.useSkill1_FlameDash();
    }
    // 技能2：巨剑术（L 键）
    if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
      this.useSkill2_GiantSword();
    }
  }

  /**
   * 技能1：烈焰闪
   * 效果：向前冲刺，路径上的敌人受到火焰伤害
   */
  private useSkill1_FlameDash() {
    const now = this.time.now;

    // 检查：MP 够不够
    if (this.playerMp < this.SKILL1_MP_COST) return;
    // 检查：CD 好没好
    if (now < this.skill1CooldownEnd) return;
    // 检查：攻击/冲刺中不能用
    if (this.isAttacking || this.isDashing) return;

    // 消耗 MP，进入 CD
    this.playerMp -= this.SKILL1_MP_COST;
    this.skill1CooldownEnd = now + this.SKILL1_COOLDOWN;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const dir = this.facingRight ? 1 : -1;

    // 冲刺移动
    this.isDashing = true;
    this.dashEndTime = now + this.SKILL1_DASH_DURATION;
    body.setVelocityX(dir * this.SKILL1_DASH_SPEED);
    body.setDragX(0);

    // 伤害路径上的敌人
    const startX = this.player.x;
    const endX = startX + dir * this.SKILL1_RANGE;

    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const ex = enemy.container.x;
      // 判断敌人是否在冲刺路径上
      const inRange = dir > 0
        ? (ex >= startX && ex <= endX)
        : (ex <= startX && ex >= endX);
      const closeY = Math.abs(enemy.container.y - this.player.y) < 48;

      if (inRange && closeY) {
        this.damageEnemy(enemy, this.SKILL1_DAMAGE, dir * 250);
      }
    });

    // 火焰拖尾特效
    this.showFlameTrail(startX, this.player.y, endX);
  }

  /**
   * 火焰拖尾视觉特效
   */
  private showFlameTrail(startX: number, y: number, endX: number) {
    // 沿路径生成多个火焰粒子
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;

      // 每个火焰是一个小圆形，延迟出现形成拖尾感
      const flame = this.add.circle(x, y, 12 + Math.random() * 8, 0xff6600, 0.7);

      this.tweens.add({
        targets: flame,
        alpha: 0,
        scale: 1.5 + Math.random() * 0.5,
        y: y - 20 - Math.random() * 15, // 火焰往上飘
        duration: 400,
        delay: i * 30, // 逐个出现
        onComplete: () => flame.destroy(),
      });
    }
  }

  // ======================== 技能2：巨剑术 ========================

  /**
   * 技能2：巨剑术
   * 蓄力1秒 → 法阵出现 → 巨剑从法阵中冲出 → AOE伤害
   */
  private useSkill2_GiantSword() {
    const now = this.time.now;

    if (this.playerMp < this.SKILL2_MP_COST) return;
    if (now < this.skill2CooldownEnd) return;
    if (this.isAttacking || this.isDashing || this.isCastingSkill2) return;

    // 消耗 MP，进入 CD，锁定移动
    this.playerMp -= this.SKILL2_MP_COST;
    this.skill2CooldownEnd = now + this.SKILL2_COOLDOWN;
    this.isCastingSkill2 = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0); // 蓄力时站定不动

    // ===== 阶段1：蓄力 + 法阵出现（持续 CHARGE_TIME 毫秒） =====
    const magicCircle = this.createMagicCircle();

    // 法阵从透明渐渐亮起
    magicCircle.setAlpha(0);
    this.tweens.add({
      targets: magicCircle,
      alpha: 1,
      scale: { from: 0.3, to: 1 },
      duration: this.SKILL2_CHARGE_TIME * 0.8,
      ease: "Power2",
    });

    // 法阵持续旋转
    this.tweens.add({
      targets: magicCircle,
      angle: magicCircle.angle + 360,
      duration: this.SKILL2_CHARGE_TIME,
      ease: "Linear",
    });

    // 蓄力结束后 → 阶段2：巨剑冲出
    this.time.delayedCall(this.SKILL2_CHARGE_TIME, () => {
      this.isCastingSkill2 = false;
      magicCircle.destroy();
      this.launchGiantSword();
    });
  }

  /**
   * 创建法阵视觉特效（同心圆 + 放射线 + 符文）
   */
  private createMagicCircle(): Phaser.GameObjects.Container {
    const dir = this.facingRight ? 1 : -1;
    // 法阵出现在玩家头顶偏前方（朝敌人方向）
    const cx = this.player.x + dir * 30;
    const cy = this.player.y - 70;

    const container = this.add.container(cx, cy);
    const g = this.add.graphics();

    // 外圈
    g.lineStyle(3, 0x9b59b6, 0.9); // 紫色
    g.strokeCircle(0, 0, 40);

    // 内圈
    g.lineStyle(2, 0xe8d44d, 0.8); // 金色
    g.strokeCircle(0, 0, 25);

    // 中心点
    g.fillStyle(0xe8d44d, 0.6);
    g.fillCircle(0, 0, 8);

    // 六条放射线（符文效果）
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x1 = Math.cos(angle) * 12;
      const y1 = Math.sin(angle) * 12;
      const x2 = Math.cos(angle) * 38;
      const y2 = Math.sin(angle) * 38;
      g.lineStyle(2, 0x9b59b6, 0.7);
      g.lineBetween(x1, y1, x2, y2);
    }

    // 小三角符文（三个等距小三角）
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const cx2 = Math.cos(angle) * 32;
      const cy2 = Math.sin(angle) * 32;
      g.fillStyle(0xe8d44d, 0.5);
      g.fillTriangle(cx2 - 5, cy2 - 4, cx2 + 5, cy2 - 4, cx2, cy2 + 5);
    }

    container.add(g);

    // 倾斜朝向敌人（椭圆化 + 旋转）
    container.setScale(1, 0.5); // 压扁成椭圆，模拟透视倾斜
    container.setAngle(dir > 0 ? -15 : 15); // 微微倾斜

    // 发光效果（半透明大圆做光晕）
    const glow = this.add.circle(0, 0, 55, 0x9b59b6, 0.15);
    container.addAt(glow, 0); // 插在底层

    return container;
  }

  /**
   * 巨剑从法阵位置冲出，飞向面朝方向
   */
  private launchGiantSword() {
    this.swordHitEnemies.clear();
    const dir = this.facingRight ? 1 : -1;
    const startX = this.player.x + dir * 30;
    const startY = this.player.y - 70; // 从法阵高度出发（头顶）

    // 向下射击：用三角函数计算终点
    const angleRad = Phaser.Math.DegToRad(this.SKILL2_ANGLE);
    const endX = startX + dir * Math.cos(angleRad) * this.SKILL2_SWORD_RANGE;
    const endY = startY + Math.sin(angleRad) * this.SKILL2_SWORD_RANGE;

    // 画巨剑（用多边形）
    const sword = this.add.container(startX, startY);
    const g = this.add.graphics();

    // 剑身（菱形，很长）
    g.fillStyle(0xd4af37, 1); // 金色
    g.fillPoints([
      new Phaser.Geom.Point(0, -60),   // 剑尖
      new Phaser.Geom.Point(12, -10),  // 右上
      new Phaser.Geom.Point(6, 20),    // 右下
      new Phaser.Geom.Point(-6, 20),   // 左下
      new Phaser.Geom.Point(-12, -10), // 左上
    ], true);

    // 剑身中线（发光）
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(0, -55, 0, 15);

    // 剑柄
    g.fillStyle(0x8b4513, 1); // 棕色
    g.fillRect(-4, 20, 8, 15);
    // 护手
    g.fillStyle(0xd4af37, 1);
    g.fillRect(-14, 18, 28, 5);

    sword.add(g);

    // 巨剑朝向：水平 90° + 向下角度 = 实际旋转角度
    sword.setAngle(dir > 0 ? 90 + this.SKILL2_ANGLE : -(90 + this.SKILL2_ANGLE));
    sword.setScale(0.5);

    // 巨剑飞出动画（沿 30° 斜下方飞行）
    this.tweens.add({
      targets: sword,
      x: endX,
      y: endY,
      scale: 1.2,
      duration: (this.SKILL2_SWORD_RANGE / this.SKILL2_SWORD_SPEED) * 1000,
      ease: "Power1",
      // 飞行过程中持续检测伤害
      onUpdate: () => {
        this.swordHitCheck(sword.x, sword.y, dir);
      },
      onComplete: () => {
        // 到达终点后淡出消失
        this.tweens.add({
          targets: sword,
          alpha: 0,
          scale: 0.3,
          duration: 200,
          onComplete: () => sword.destroy(),
        });
      },
    });

    // 剑身拖尾光效（跟随飞行路径）
    this.swordTrail(startX, startY, endX, endY, dir);
  }

  /**
   * 巨剑飞行路径上的伤害检测
   * 已经命中过的敌人不会重复受伤
   */
  private swordHitCheck(swordX: number, swordY: number, dir: number) {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;
      if (this.swordHitEnemies.has(enemy)) return; // 已经打过了

      const dx = enemy.container.x - swordX;
      const dy = enemy.container.y - swordY;

      // AOE 判定：水平方向在剑前方一定范围内，垂直距离小于 AOE 宽度
      if (Math.abs(dy) < this.SKILL2_AOE_WIDTH / 2 && Math.abs(dx) < 50) {
        this.damageEnemy(enemy, this.SKILL2_DAMAGE, dir * 350);
        this.swordHitEnemies.add(enemy);
      }
    });
  }

  /**
   * 巨剑飞行的拖尾光效
   */
  private swordTrail(startX: number, startY: number, endX: number, endY: number, dir: number) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      const particle = this.add.circle(x, y, 6 + Math.random() * 6, 0xd4af37, 0.5);

      this.tweens.add({
        targets: particle,
        alpha: 0,
        scale: 2,
        y: y - 10 - Math.random() * 10,
        duration: 300 + Math.random() * 200,
        delay: i * 40,
        onComplete: () => particle.destroy(),
      });
    }
  }

  private updatePlayerMpBar() {
    const ratio = this.playerMp / this.PLAYER_MAX_MP;
    this.playerMpBarFill.width = 158 * ratio;
  }

  // ======================== 敌人系统 ========================

  private spawnEnemy(x: number, y: number, maxHp: number) {
    const container = this.add.container(x, y);

    // 画敌人（蓝灰色 + 小眼睛）
    const g = this.add.graphics();
    g.fillStyle(0x4a5568, 1);
    g.fillRect(-16, -24, 32, 48);
    g.lineStyle(2, 0x718096);
    g.strokeRect(-16, -24, 32, 48);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-5, -12, 4);
    g.fillCircle(5, -12, 4);
    g.fillStyle(0x000000, 1);
    g.fillCircle(-4, -12, 2);
    g.fillCircle(6, -12, 2);
    container.add(g);

    // 头顶血条
    const hpBarBg = this.add.rectangle(x, y - 36, 40, 6, 0x333333);
    const hpBarFill = this.add.rectangle(x - 19, y - 36, 38, 4, 0x48bb78).setOrigin(0, 0.5);

    const enemy: Enemy = {
      container, hp: maxHp, maxHp, hpBarBg, hpBarFill, alive: true,
      patrolLeft: x - this.ENEMY_PATROL_RANGE,
      patrolRight: x + this.ENEMY_PATROL_RANGE,
      facingRight: true,
      state: EnemyState.PATROL,
      stateTimer: 0,
      windupIndicator: null,
    };
    container.setData("enemy", enemy);

    this.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 48);
    body.setOffset(-16, -24);
    body.setDragX(400);          // 击退后自动减速停下
    body.setCollideWorldBounds(true); // 不能被打出地图
    // 注意：不开 setAllowGravity(false)，让重力把敌人拉到地面上站稳

    this.enemies.add(container);
  }

  private damageEnemy(enemy: Enemy, damage: number, knockbackX: number) {
    if (!enemy.alive) return;
    enemy.hp -= damage;

    // 打断前摇：如果敌人正在蓄力，立刻取消攻击
    if (enemy.state === EnemyState.WINDUP && enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    // 进入受击硬直状态
    enemy.state = EnemyState.HIT;
    enemy.stateTimer = this.time.now + 300; // 300ms 硬直

    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);

    // 闪白
    this.tweens.add({
      targets: enemy.container,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
    });

    // 伤害飘字
    const dmgText = this.add.text(
      enemy.container.x, enemy.container.y - 40,
      `-${damage}`,
      { fontSize: "22px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold" }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => dmgText.destroy(),
    });

    this.updateEnemyHpBar(enemy);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.killEnemy(enemy);
    }
  }

  private updateEnemyHpBar(enemy: Enemy) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpBarFill.width = 38 * ratio;
    enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
  }

  /**
   * 每帧更新所有存活敌人：状态机 AI + 血条跟随
   *
   * 状态机：PATROL → WINDUP → ATTACKING → COOLDOWN → PATROL
   *                        ↑ 被打断 → HIT → PATROL
   */
  private updateEnemies() {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const body = enemy.container.body as Phaser.Physics.Arcade.Body;
      const now = this.time.now;

      // 计算与玩家的水平距离
      const dx = this.player.x - enemy.container.x;
      const distToPlayer = Math.abs(dx);

      switch (enemy.state) {
        // ---- 巡逻：散步，发现玩家就准备攻击 ----
        case EnemyState.PATROL: {
          if (Math.abs(body.velocity.x) < 5) {
            if (enemy.facingRight) {
              body.setVelocityX(this.ENEMY_PATROL_SPEED);
              if (enemy.container.x >= enemy.patrolRight) enemy.facingRight = false;
            } else {
              body.setVelocityX(-this.ENEMY_PATROL_SPEED);
              if (enemy.container.x <= enemy.patrolLeft) enemy.facingRight = true;
            }
          }
          // 玩家进入感知范围 → 进入前摇
          if (distToPlayer < this.ENEMY_DETECT_RANGE) {
            this.enemyStartWindup(enemy, dx);
          }
          break;
        }

        // ---- 前摇：站定不动，头顶感叹号，可被打断 ----
        case EnemyState.WINDUP: {
          body.setVelocityX(0);
          // 前摇结束 → 进入攻击
          if (now >= enemy.stateTimer) {
            this.enemyPerformAttack(enemy);
          }
          break;
        }

        // ---- 攻击判定中：等持续时间结束 ----
        case EnemyState.ATTACKING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.ENEMY_ATTACK_COOLDOWN;
          }
          break;
        }

        // ---- 冷却：等冷却完恢复巡逻 ----
        case EnemyState.COOLDOWN: {
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.PATROL;
          }
          break;
        }

        // ---- 受击硬直：等硬直结束恢复巡逻 ----
        case EnemyState.HIT: {
          if (Math.abs(body.velocity.x) < 5 && now >= enemy.stateTimer) {
            enemy.state = EnemyState.PATROL;
          }
          break;
        }
      }

      // ---- 血条跟随 ----
      const x = enemy.container.x;
      const y = enemy.container.y;
      enemy.hpBarBg.setPosition(x, y - 36);
      enemy.hpBarFill.setPosition(x - 19, y - 36);
      // 前摇感叹号跟随
      if (enemy.windupIndicator) {
        enemy.windupIndicator.setPosition(x, y - 52);
      }
    });
  }

  /**
   * 敌人进入前摇状态（感叹号 + 停顿）
   */
  private enemyStartWindup(enemy: Enemy, dxToPlayer: number) {
    enemy.state = EnemyState.WINDUP;
    enemy.stateTimer = this.time.now + this.ENEMY_ATTACK_WINDUP;
    // 面朝玩家
    enemy.facingRight = dxToPlayer > 0;

    // 头顶感叹号（视觉提示：这怪要攻击了！）
    enemy.windupIndicator = this.add.text(
      enemy.container.x, enemy.container.y - 52,
      "!", {
        fontSize: "24px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold",
      }
    ).setOrigin(0.5);

    // 感叹号闪烁效果
    this.tweens.add({
      targets: enemy.windupIndicator,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: -1, // 一直闪到被移除
    });
  }

  /**
   * 敌人执行攻击（判定框 + 伤害检测）
   */
  private enemyPerformAttack(enemy: Enemy) {
    enemy.state = EnemyState.ATTACKING;
    enemy.stateTimer = this.time.now + this.ENEMY_ATTACK_DURATION;

    // 移除前摇感叹号
    if (enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    // 攻击判定
    const dir = enemy.facingRight ? 1 : -1;
    const hitX = enemy.container.x + dir * this.ENEMY_ATTACK_RANGE;
    const dx = this.player.x - hitX;
    const dy = this.player.y - enemy.container.y;

    // 命中检测
    if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
      this.damagePlayer(this.ENEMY_ATTACK_DAMAGE, dir * this.ENEMY_ATTACK_KNOCKBACK);
    }

    // 攻击特效（红色弧线，区别于玩家的白色/黄色）
    const g = this.add.graphics();
    g.lineStyle(3, 0xff6644, 0.7);
    g.strokeEllipse(0, 0, 30, 40);
    g.setPosition(hitX, enemy.container.y);

    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.3,
      duration: 150,
      onComplete: () => g.destroy(),
    });
  }

  private killEnemy(enemy: Enemy) {
    this.tweens.add({
      targets: enemy.container,
      alpha: 0,
      angle: 360,
      y: enemy.container.y - 30,
      duration: 400,
      onComplete: () => {
        enemy.container.destroy();
        enemy.hpBarBg.destroy();
        enemy.hpBarFill.destroy();
      },
    });
  }

  // ======================== 玩家受击 ========================

  /**
   * 玩家受到伤害
   * 有无敌时间防止连续掉血
   */
  private damagePlayer(damage: number, knockbackX: number) {
    // 无敌期间不受伤害
    if (this.time.now < this.playerHitTimer) return;

    this.playerHp -= damage;
    if (this.playerHp < 0) this.playerHp = 0;

    // 设置无敌时间
    this.playerHitTimer = this.time.now + this.PLAYER_HIT_INVINCIBLE;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);

    // 受伤闪烁
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 2,
    });

    // 伤害飘字
    const dmgText = this.add.text(
      this.player.x, this.player.y - 40,
      `-${damage}`,
      { fontSize: "22px", color: "#ff8888", fontFamily: "Arial", fontStyle: "bold" }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 30,
      alpha: 0,
      duration: 500,
      onComplete: () => dmgText.destroy(),
    });

    // 更新 HUD 血条
    this.updatePlayerHpBar();

    // 死亡判定
    if (this.playerHp <= 0) {
      this.playerDeath();
    }
  }

  /**
   * 胜利画面：显示"胜利"，按 R 重新开始
   */
  private showVictory() {
    this.isVictory = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // 半透明遮罩
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.5).setScrollFactor(0);

    // "胜利！"
    this.add.text(480, 210, "胜利！", {
      fontSize: "56px", color: "#f5c842", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(480, 280, "所有敌人已被消灭", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(480, 320, "按 R 重新开始", {
      fontSize: "18px", color: "#aaaaaa", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    this.input.keyboard!.once("keydown-R", () => {
      this.scene.restart();
    });
  }

  /**
   * 玩家死亡：显示"你死了"，按 R 重新开始
   */
  private playerDeath() {
    this.isPlayerDead = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // 半透明遮罩
    const overlay = this.add.rectangle(
      this.cameras.main.scrollX + 480,
      this.cameras.main.scrollY + 270,
      960, 540, 0x000000, 0.6
    ).setScrollFactor(0);

    // "你死了"
    const deathText = this.add.text(480, 220, "你死了", {
      fontSize: "48px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    const restartText = this.add.text(480, 290, "按 R 重新开始", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    // 按 R 重新开始
    this.input.keyboard!.once("keydown-R", () => {
      this.scene.restart(); // 重启当前场景，所有状态重置
    });
  }

  private updatePlayerHpBar() {
    const ratio = Math.max(0, this.playerHp / this.playerMaxHp);
    this.playerHpBarFill.width = 158 * ratio;
    // 低血量变红
    this.playerHpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
  }

  // ======================== 冲刺 ========================

  private setupDoubleTap(key: Phaser.Input.Keyboard.Key, onDoubleTap: () => void) {
    let lastTapTime = 0;
    key.on("down", () => {
      const now = this.time.now;
      if (now - lastTapTime < this.DOUBLE_TAP_WINDOW) {
        onDoubleTap();
        lastTapTime = 0;
      } else {
        lastTapTime = now;
      }
    });
  }

  private startDash(toRight: boolean) {
    this.isDashing = true;
    this.facingRight = toRight;
    this.dashEndTime = this.time.now + this.DASH_DURATION;
    drawPlayer(this.player, this.facingRight);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(toRight ? this.DASH_SPEED : -this.DASH_SPEED);
    body.setDragX(0);
  }
}
