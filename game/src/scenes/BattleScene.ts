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
  ATTACKING, // 攻击判定中（普通怪近战）
  CHARGING,  // 冲锋中（冲锋怪/BOSS高速冲向玩家）
  AIMING,    // 瞄准中（投掷怪锁定方向）
  BOSS_JUMP, // BOSS跳起中（在空中）
  BOSS_FIRE, // BOSS弹幕发射中
  COOLDOWN,  // 攻击后冷却
  HIT,       // 受击硬直中
}

// ===== 敌人类型 =====
enum EnemyType {
  NORMAL,   // 普通近战怪（原来的）
  CHARGER,  // 冲锋怪（远距离发现玩家后高速冲撞）
  THROWER,  // 远程投掷怪（保持距离，扔东西打人）
  BOSS,     // BOSS：三种攻击模式循环（冲锋/跳砸/弹幕）
}

// ===== 简单的敌人结构（后面会移到独立文件） =====
interface Enemy {
  container: Phaser.GameObjects.Container;
  hp: number;
  maxHp: number;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  alive: boolean;
  type: EnemyType;               // 怪物类型
  // 巡逻状态
  patrolLeft: number;
  patrolRight: number;
  facingRight: boolean;
  // 攻击 AI 状态
  state: EnemyState;
  stateTimer: number;          // 当前状态结束时间
  windupIndicator: Phaser.GameObjects.Text | null; // 前摇感叹号
  // BOSS 专用
  attackIndex: number;          // BOSS 当前攻击序号（0=冲锋,1=跳砸,2=弹幕，循环）
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
  private projectiles!: Phaser.Physics.Arcade.Group; // 投掷物组（远程怪的弹药）

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

  // 冲锋怪参数
  private readonly CHARGER_DETECT_RANGE = 250;  // 发现玩家距离（比近战怪远很多）
  private readonly CHARGER_CHARGE_SPEED = 450;   // 冲锋速度（很快！）
  private readonly CHARGER_CHARGE_WINDUP = 600;  // 冲锋前摇（蓄力时间，可打断）
  private readonly CHARGER_CHARGE_DURATION = 500; // 冲锋持续时间（毫秒）
  private readonly CHARGER_CHARGE_DAMAGE = 15;   // 冲撞伤害
  private readonly CHARGER_CHARGE_KNOCKBACK = 250; // 冲撞击退
  private readonly CHARGER_COOLDOWN = 1200;      // 冲锋后冷却（比较久）

  // 远程投掷怪参数
  private readonly THROWER_DETECT_RANGE = 200;   // 发现玩家距离
  private readonly THROWER_PREFERRED_DIST = 150;  // 偏好距离（保持这个距离扔东西）
  private readonly THROWER_AIM_TIME = 400;        // 瞄准时间（毫秒，可打断）
  private readonly THROWER_COOLDOWN = 1500;       // 投掷后冷却
  private readonly THROWER_PROJECTILE_SPEED = 350; // 投掷物飞行速度
  private readonly THROWER_PROJECTILE_DAMAGE = 8;  // 投掷物伤害
  private readonly THROWER_RETREAT_SPEED = 80;    // 后退速度（玩家靠近时往后跑）

  // BOSS 参数（赤焰魔君）
  private readonly BOSS_HP = 500;                 // BOSS 血量（很厚）
  private readonly BOSS_PATROL_SPEED = 40;        // BOSS 慢步逼近速度（压迫感）
  private readonly BOSS_CHARGE_SPEED = 500;       // BOSS 冲锋速度
  private readonly BOSS_CHARGE_WINDUP = 800;      // BOSS 冲锋前摇（比冲锋怪长，给玩家反应时间）
  private readonly BOSS_CHARGE_DURATION = 600;    // BOSS 冲锋持续时间
  private readonly BOSS_CHARGE_DAMAGE = 20;       // BOSS 冲撞伤害
  private readonly BOSS_CHARGE_KNOCKBACK = 300;   // BOSS 冲撞击退
  private readonly BOSS_JUMP_WINDUP = 600;        // BOSS 跳砸前摇
  private readonly BOSS_JUMP_HEIGHT = 200;        // BOSS 跳起高度（像素）
  private readonly BOSS_JUMP_DAMAGE = 25;         // BOSS 跳砸伤害
  private readonly BOSS_JUMP_KNOCKBACK = 350;     // BOSS 跳砸击退
  private readonly BOSS_JUMP_SHOCKWAVE_SPEED = 250; // 跳砸冲击波扩散速度
  private readonly BOSS_BARRAGE_WINDUP = 1000;    // BOSS 弹幕前摇
  private readonly BOSS_BARRAGE_COUNT = 5;        // 弹幕数量（扇形发射）
  private readonly BOSS_BARRAGE_DAMAGE = 10;      // 每颗弹幕伤害
  private readonly BOSS_BARRAGE_SPEED = 300;      // 弹幕飞行速度
  private readonly BOSS_COOLDOWN = 1500;          // BOSS 每次攻击后冷却
  private readonly BOSS_HIT_STAGGER = 150;        // BOSS 受击硬直（很短，有霸体感）

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
  private readonly SKILL2_MP_COST = 30;            // MP 消耗（巨剑术消耗较大）
  private readonly SKILL2_COOLDOWN = 8000;           // 冷却时间(ms)，8秒（大招CD长一些）
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
  private swordHitEnemies = new Set<Enemy>(); // 巨剑术：已命中的敌人（防止重复扣血）

  // 技能图标 CD 显示（两个小方框，冷却中显示倒计时数字）
  private skill1Icon!: Phaser.GameObjects.Container;  // 技能1图标容器
  private skill1CdOverlay!: Phaser.GameObjects.Rectangle; // CD 中覆盖的半透明黑色遮罩
  private skill1CdText!: Phaser.GameObjects.Text;     // CD 剩余秒数文字
  private skill2Icon!: Phaser.GameObjects.Container;
  private skill2CdOverlay!: Phaser.GameObjects.Rectangle;
  private skill2CdText!: Phaser.GameObjects.Text;

  // BOSS 头顶血条（固定在屏幕顶部居中）
  private bossHpBarBg!: Phaser.GameObjects.Rectangle;
  private bossHpBarFill!: Phaser.GameObjects.Rectangle;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private bossRef: Enemy | null = null; // BOSS 引用（用于更新 HUD）

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
    this.bossRef = null;

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

    // ===== 5. 投掷物组（远程怪的弹药） =====
    this.projectiles = this.physics.add.group({
      allowGravity: false, // 投掷物不受重力影响
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

    // 投掷物碰到玩家 → 造成伤害（伤害值存在投掷物的 data 里）
    this.physics.add.overlap(this.player, this.projectiles, (_playerObj, projObj) => {
      const proj = projObj as Phaser.GameObjects.Arc;
      const knockDir = this.player.x < proj.x ? -1 : 1;
      const dmg = (proj.getData("damage") as number) || this.THROWER_PROJECTILE_DAMAGE;
      this.damagePlayer(dmg, knockDir * 150);
      proj.destroy();
    });

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

    // ===== 7. 敌人（不同类型混搭 + BOSS） =====
    this.spawnEnemy(350, 432, 100, EnemyType.NORMAL);   // 普通近战怪
    this.spawnEnemy(700, 432, 120, EnemyType.CHARGER);  // 冲锋怪
    this.spawnEnemy(1100, 432, 80, EnemyType.THROWER);  // 远程投掷怪
    this.spawnEnemy(2000, 432, this.BOSS_HP, EnemyType.BOSS); // BOSS：赤焰魔君

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

    // ===== 技能图标 + CD 显示（MP 蓝条右侧的两个小方框） =====
    // 技能1图标（K:烈焰闪）—— 位于 MP 条右边
    this.skill1Icon = this.createSkillIcon(185, 42, "K", 0xff6600);
    this.skill1CdOverlay = this.add.rectangle(185, 42, 28, 28, 0x000000, 0)
      .setScrollFactor(0); // alpha=0 默认不显示（没在 CD 时透明）
    this.skill1CdText = this.add.text(185, 42, "", {
      fontSize: "14px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

    // 技能2图标（L:巨剑术）—— 紧跟技能1右侧
    this.skill2Icon = this.createSkillIcon(220, 42, "L", 0xd4af37);
    this.skill2CdOverlay = this.add.rectangle(220, 42, 28, 28, 0x000000, 0)
      .setScrollFactor(0);
    this.skill2CdText = this.add.text(220, 42, "", {
      fontSize: "14px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

    const tip = this.add.text(20, 75,
      "A D 移动 | 双击冲刺 | 空格 跳跃 | J 攻击 | K 烈焰闪 | L 巨剑术",
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

    // ---- BOSS 血条刷新 ----
    this.updateBossHud();

    // ---- 技能 CD 显示刷新 ----
    this.updateSkillCdDisplay();

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

  // ======================== 技能图标 CD 显示 ========================

  /**
   * 创建技能图标（一个带边框和快捷键标签的小方块）
   *
   * @param cx     图标中心 X（屏幕坐标）
   * @param cy     图标中心 Y（屏幕坐标）
   * @param key    快捷键显示文字（"K" 或 "L"）
   * @param color  图标主色调（烈焰闪=橙色，巨剑术=金色）
   * @returns 图标的 Container（方便后续操作）
   */
  private createSkillIcon(cx: number, cy: number, key: string, color: number): Phaser.GameObjects.Container {
    const icon = this.add.container(cx, cy);
    icon.setScrollFactor(0); // 固定在屏幕上，不随相机滚动

    // 底色（深色半透明，让 CD 遮罩叠加时更明显）
    const bg = this.add.rectangle(0, 0, 28, 28, 0x222222, 0.9);
    icon.add(bg);

    // 彩色内圈（代表技能属性的颜色）
    const inner = this.add.rectangle(0, 0, 22, 22, color, 0.5);
    icon.add(inner);

    // 快捷键字母（左上角小字，方便玩家知道按哪个键）
    const keyLabel = this.add.text(-10, -10, key, {
      fontSize: "10px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5);
    icon.add(keyLabel);

    return icon;
  }

  /**
   * 每帧刷新技能 CD 显示
   *
   * 原理：
   * - 如果当前时间 < 冷却结束时间，说明技能还在 CD 中
   * - 显示半透明黑色遮罩覆盖图标（视觉上变暗）
   * - 在图标上显示剩余秒数（向上取整，让玩家知道还要等多久）
   * - CD 结束后隐藏遮罩和数字
   *
   * 同时检查 MP 是否足够：MP 不够时也显示遮罩提示（但显示"MP不足"）
   */
  private updateSkillCdDisplay() {
    const now = this.time.now;

    // ---- 技能1：烈焰闪 ----
    const skill1Remaining = Math.max(0, this.skill1CooldownEnd - now); // 剩余 CD 毫秒数
    if (skill1Remaining > 0) {
      // CD 中：显示遮罩 + 倒计时
      this.skill1CdOverlay.setFillStyle(0x000000, 0.6); // 半透明黑色
      this.skill1CdOverlay.setVisible(true);
      this.skill1CdText.setText(Math.ceil(skill1Remaining / 1000).toString()); // 毫秒→秒，向上取整
      this.skill1CdText.setVisible(true);
    } else if (this.playerMp < this.SKILL1_MP_COST) {
      // 没在 CD 但蓝不够：显示遮罩但不显示倒计时（提示"缺蓝"）
      this.skill1CdOverlay.setFillStyle(0x000000, 0.4);
      this.skill1CdOverlay.setVisible(true);
      this.skill1CdText.setVisible(false);
    } else {
      // 技能就绪：隐藏遮罩
      this.skill1CdOverlay.setVisible(false);
      this.skill1CdText.setVisible(false);
    }

    // ---- 技能2：巨剑术（同样逻辑） ----
    const skill2Remaining = Math.max(0, this.skill2CooldownEnd - now);
    if (skill2Remaining > 0) {
      this.skill2CdOverlay.setFillStyle(0x000000, 0.6);
      this.skill2CdOverlay.setVisible(true);
      this.skill2CdText.setText(Math.ceil(skill2Remaining / 1000).toString());
      this.skill2CdText.setVisible(true);
    } else if (this.playerMp < this.SKILL2_MP_COST) {
      this.skill2CdOverlay.setFillStyle(0x000000, 0.4);
      this.skill2CdOverlay.setVisible(true);
      this.skill2CdText.setVisible(false);
    } else {
      this.skill2CdOverlay.setVisible(false);
      this.skill2CdText.setVisible(false);
    }
  }

  // ======================== 敌人系统 ========================

  /**
   * 生成敌人（根据 type 画不同外观）
   * @param x     出生 X
   * @param y     出生 Y
   * @param maxHp 最大血量
   * @param type  敌人类型（默认 NORMAL）
   */
  private spawnEnemy(x: number, y: number, maxHp: number, type: EnemyType = EnemyType.NORMAL) {
    const container = this.add.container(x, y);
    const g = this.add.graphics();

    // ---- 根据类型画不同外观 ----
    switch (type) {
      case EnemyType.NORMAL: {
        // 普通怪：蓝灰色方块 + 小眼睛（原来的样子）
        g.fillStyle(0x4a5568, 1);
        g.fillRect(-16, -24, 32, 48);
        g.lineStyle(2, 0x718096);
        g.strokeRect(-16, -24, 32, 48);
        // 眼睛
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-5, -12, 4);
        g.fillCircle(5, -12, 4);
        g.fillStyle(0x000000, 1);
        g.fillCircle(-4, -12, 2);
        g.fillCircle(6, -12, 2);
        break;
      }
      case EnemyType.CHARGER: {
        // 冲锋怪：绿色，宽扁，头上两个角（像野牛）
        g.fillStyle(0x48bb78, 1);
        g.fillRect(-20, -20, 40, 40);
        g.lineStyle(2, 0x2f855a);
        g.strokeRect(-20, -20, 40, 40);
        // 两只角（三角）
        g.fillStyle(0xe8d44d, 1);
        g.fillTriangle(-20, -20, -14, -20, -18, -32); // 左角
        g.fillTriangle(20, -20, 14, -20, 18, -32);   // 右角
        // 红色眼睛（凶狠）
        g.fillStyle(0xff4444, 1);
        g.fillCircle(-7, -8, 4);
        g.fillCircle(7, -8, 4);
        break;
      }
      case EnemyType.THROWER: {
        // 投掷怪：紫色，瘦高，手持法杖
        g.fillStyle(0x9b59b6, 1);
        g.fillRect(-12, -28, 24, 56);
        g.lineStyle(2, 0x7d3c98);
        g.strokeRect(-12, -28, 24, 56);
        // 法杖（一根竖线 + 顶部圆球）
        g.lineStyle(2, 0xe8d44d, 1);
        g.lineBetween(14, -20, 14, 20);
        g.fillStyle(0xe8d44d, 1);
        g.fillCircle(14, -24, 5);
        // 眼睛（蓝色，神秘）
        g.fillStyle(0x00e5ff, 1);
        g.fillCircle(-4, -16, 3);
        g.fillCircle(4, -16, 3);
        break;
      }
      case EnemyType.BOSS: {
        // BOSS（赤焰魔君）：暗红色大块 + 金色冠角 + 火焰眼睛
        // 身体（比其他怪大两倍）
        g.fillStyle(0xcc0000, 1);
        g.fillRect(-32, -40, 64, 80);
        g.lineStyle(3, 0x8b0000);
        g.strokeRect(-32, -40, 64, 80);
        // 金色肩甲
        g.fillStyle(0xe8d44d, 1);
        g.fillRect(-36, -30, 8, 20); // 左肩
        g.fillRect(28, -30, 8, 20);  // 右肩
        // 金色冠角（三只角，比冲锋怪更霸气）
        g.fillTriangle(-20, -40, -12, -40, -16, -58);  // 左角
        g.fillTriangle(0, -40, 0, -40, 0, -62);        // 中角（最高）
        g.fillTriangle(20, -40, 12, -40, 16, -58);     // 右角
        g.fillRect(-2, -62, 4, 22);                     // 中角柱体
        // 火焰眼睛（橙红发光）
        g.fillStyle(0xff6600, 1);
        g.fillCircle(-10, -20, 6);
        g.fillCircle(10, -20, 6);
        g.fillStyle(0xffff00, 1); // 瞳孔亮黄
        g.fillCircle(-10, -20, 3);
        g.fillCircle(10, -20, 3);
        // 胸口符文（X形）
        g.lineStyle(2, 0xe8d44d, 0.6);
        g.lineBetween(-15, -5, 15, 25);
        g.lineBetween(15, -5, -15, 25);
        break;
      }
    }
    container.add(g);

    // ---- 头顶血条 ----
    // BOSS 不需要头顶血条（用屏幕顶部的专用血条），但为了 damageEnemy 兼容还是创建
    const hpBarY = type === EnemyType.BOSS ? -50 : (type === EnemyType.THROWER ? -40 : -36);
    const hpBarW = type === EnemyType.BOSS ? 78 : 38; // BOSS 血条更宽
    const hpBarBg = this.add.rectangle(x, y + hpBarY, hpBarW + 2, 6, 0x333333);
    const hpBarFill = this.add.rectangle(x - hpBarW / 2, y + hpBarY, hpBarW, 4, 0x48bb78).setOrigin(0, 0.5);

    // BOSS 头顶血条默认隐藏（用屏幕顶部的）
    if (type === EnemyType.BOSS) {
      hpBarBg.setVisible(false);
      hpBarFill.setVisible(false);
    }

    // ---- 构建敌人数据 ----
    const enemy: Enemy = {
      container, hp: maxHp, maxHp, hpBarBg, hpBarFill, alive: true,
      type,
      patrolLeft: x - this.ENEMY_PATROL_RANGE,
      patrolRight: x + this.ENEMY_PATROL_RANGE,
      facingRight: true,
      state: EnemyState.PATROL,
      stateTimer: 0,
      windupIndicator: null,
      attackIndex: 0, // BOSS 攻击模式循环计数器
    };
    container.setData("enemy", enemy);

    // ---- 物理体 ----
    this.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    // 不同类型不同体型
    // BOSS 特殊处理：碰撞体和小怪一样高(48)，但视觉上大两倍
    // 这样 BOSS 和小怪站在同一地面上，不会出现高度差
    let bodyW: number, bodyH: number, bodyOffY: number;
    switch (type) {
      case EnemyType.BOSS:    bodyW = 64; bodyH = 48; bodyOffY = -24; break;
      case EnemyType.CHARGER: bodyW = 40; bodyH = 40; bodyOffY = -20; break;
      case EnemyType.THROWER: bodyW = 24; bodyH = 56; bodyOffY = -28; break;
      default:                bodyW = 32; bodyH = 48; bodyOffY = -24; break;
    }
    body.setSize(bodyW, bodyH);
    body.setOffset(-bodyW / 2, bodyOffY);
    body.setDragX(type === EnemyType.BOSS ? 200 : 400); // BOSS 击退后恢复更快
    body.setCollideWorldBounds(true);

    this.enemies.add(container);

    // ---- BOSS 特殊初始化 ----
    if (type === EnemyType.BOSS) {
      this.bossRef = enemy;
      this.createBossHudBar();
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, knockbackX: number) {
    if (!enemy.alive) return;
    enemy.hp -= damage;

    const body = enemy.container.body as Phaser.Physics.Arcade.Body;

    if (enemy.type === EnemyType.BOSS) {
      // ---- BOSS 霸体：被打不中断攻击，只短暂硬直 + 少量击退 ----
      // 不打断前摇/攻击状态
      // 只在空闲（PATROL/COOLDOWN）时才进入短硬直
      if (enemy.state === EnemyState.PATROL || enemy.state === EnemyState.COOLDOWN) {
        enemy.state = EnemyState.HIT;
        enemy.stateTimer = this.time.now + this.BOSS_HIT_STAGGER; // 很短的硬直
        body.setVelocityX(knockbackX * 0.3); // 击退力度很小（BOSS很重）
      }
      // 攻击中完全不打断，也不击退
    } else {
      // ---- 普通怪：打断前摇 + 完整硬直 ----
      if (enemy.state === EnemyState.WINDUP && enemy.windupIndicator) {
        enemy.windupIndicator.destroy();
        enemy.windupIndicator = null;
      }
      enemy.state = EnemyState.HIT;
      enemy.stateTimer = this.time.now + 300;
      body.setVelocityX(knockbackX);
    }

    // 闪白（BOSS 闪红而不是变透明）
    this.tweens.add({
      targets: enemy.container,
      alpha: enemy.type === EnemyType.BOSS ? 0.6 : 0.3,
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
   * 状态机：PATROL → WINDUP → ATTACKING/CHARGING/AIMING → COOLDOWN → PATROL
   *                        ↑ 被打断 → HIT → PATROL
   */
  private updateEnemies() {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const body = enemy.container.body as Phaser.Physics.Arcade.Body;
      const now = this.time.now;

      // 计算与玩家的水平距离和方向
      const dx = this.player.x - enemy.container.x;
      const distToPlayer = Math.abs(dx);

      switch (enemy.state) {
        // ---- 巡逻：散步/逼近，发现玩家就准备攻击 ----
        case EnemyState.PATROL: {
          if (enemy.type === EnemyType.BOSS) {
            // BOSS 不巡逻，始终慢步逼近玩家
            const dir = dx > 0 ? 1 : -1;
            enemy.facingRight = dir > 0;
            if (distToPlayer > 60) { // 距离太近就停下（准备攻击）
              body.setVelocityX(dir * this.BOSS_PATROL_SPEED);
            } else {
              body.setVelocityX(0);
            }
            // BOSS 感知范围很大
            if (distToPlayer < 400) {
              this.enemyStartWindup(enemy, dx);
            }
          } else {
            // 普通怪/冲锋怪/投掷怪：正常巡逻
            if (Math.abs(body.velocity.x) < 5) {
              if (enemy.facingRight) {
                body.setVelocityX(this.ENEMY_PATROL_SPEED);
                if (enemy.container.x >= enemy.patrolRight) enemy.facingRight = false;
              } else {
                body.setVelocityX(-this.ENEMY_PATROL_SPEED);
                if (enemy.container.x <= enemy.patrolLeft) enemy.facingRight = true;
              }
            }
            const detectRange = this.getDetectRange(enemy);
            if (distToPlayer < detectRange) {
              if (enemy.type === EnemyType.THROWER && distToPlayer < 80) {
                const retreatDir = dx > 0 ? -1 : 1;
                body.setVelocityX(retreatDir * this.THROWER_RETREAT_SPEED);
              } else {
                this.enemyStartWindup(enemy, dx);
              }
            }
          }
          break;
        }

        // ---- 前摇：站定不动，头顶提示，可被打断（BOSS不可打断） ----
        case EnemyState.WINDUP: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.enemyPerformAttack(enemy);
          }
          break;
        }

        // ---- 普通怪近战攻击 ----
        case EnemyState.ATTACKING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.ENEMY_ATTACK_COOLDOWN;
          }
          break;
        }

        // ---- 冲锋（冲锋怪 / BOSS 通用） ----
        case EnemyState.CHARGING: {
          const chargeDir = enemy.facingRight ? 1 : -1;
          const chargeSpeed = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_SPEED : this.CHARGER_CHARGE_SPEED;
          const chargeDmg = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_DAMAGE : this.CHARGER_CHARGE_DAMAGE;
          const chargeKb = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_KNOCKBACK : this.CHARGER_CHARGE_KNOCKBACK;
          const chargeCooldown = enemy.type === EnemyType.BOSS
            ? this.BOSS_COOLDOWN : this.CHARGER_COOLDOWN;

          body.setVelocityX(chargeDir * chargeSpeed);

          // 碰撞检测
          const hitDx = this.player.x - enemy.container.x;
          const hitDy = this.player.y - enemy.container.y;
          const hitRange = enemy.type === EnemyType.BOSS ? 50 : 36;
          if (Math.abs(hitDx) < hitRange && Math.abs(hitDy) < 48) {
            this.damagePlayer(chargeDmg, chargeDir * chargeKb);
          }

          if (now >= enemy.stateTimer) {
            body.setVelocityX(0);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + chargeCooldown;
          }
          break;
        }

        // ---- 投掷怪瞄准中 ----
        case EnemyState.AIMING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.throwerLaunchProjectile(enemy);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.THROWER_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 跳起中（在空中，不受地面物理影响） ----
        case EnemyState.BOSS_JUMP: {
          body.setVelocityX(0);
          // 跳砸逻辑由 bossJumpSlam 的 tween 控制
          // 这里只等状态结束
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 弹幕发射中 ----
        case EnemyState.BOSS_FIRE: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
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

        // ---- 受击硬直 ----
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
      const hpBarY = enemy.type === EnemyType.THROWER ? -40 : -36;
      enemy.hpBarBg.setPosition(x, y + hpBarY);
      enemy.hpBarFill.setPosition(x - 19, y + hpBarY);
      // 前摇感叹号跟随
      if (enemy.windupIndicator) {
        enemy.windupIndicator.setPosition(x, y - 52);
      }
    });
  }

  /** 根据敌人类型返回感知范围 */
  private getDetectRange(enemy: Enemy): number {
    switch (enemy.type) {
      case EnemyType.CHARGER: return this.CHARGER_DETECT_RANGE;
      case EnemyType.THROWER: return this.THROWER_DETECT_RANGE;
      default: return this.ENEMY_DETECT_RANGE;
    }
  }

  /**
   * 敌人进入前摇状态（感叹号 + 停顿）
   * BOSS 不可被打断（霸体），其他怪可打断
   */
  private enemyStartWindup(enemy: Enemy, dxToPlayer: number) {
    enemy.state = EnemyState.WINDUP;
    // 根据类型确定前摇时长
    let windupTime: number;
    if (enemy.type === EnemyType.BOSS) {
      // BOSS 根据当前攻击序号选择前摇时间
      const atk = enemy.attackIndex % 3;
      windupTime = atk === 0 ? this.BOSS_CHARGE_WINDUP
        : (atk === 1 ? this.BOSS_JUMP_WINDUP : this.BOSS_BARRAGE_WINDUP);
    } else if (enemy.type === EnemyType.CHARGER) {
      windupTime = this.CHARGER_CHARGE_WINDUP;
    } else if (enemy.type === EnemyType.THROWER) {
      windupTime = this.THROWER_AIM_TIME;
    } else {
      windupTime = this.ENEMY_ATTACK_WINDUP;
    }
    enemy.stateTimer = this.time.now + windupTime;
    enemy.facingRight = dxToPlayer > 0;

    // 指示器颜色和文字随类型变化
    let indicatorColor: string, indicatorText: string;
    if (enemy.type === EnemyType.BOSS) {
      indicatorColor = "#ff0000";
      const atk = enemy.attackIndex % 3;
      indicatorText = atk === 0 ? "⚡冲锋" : (atk === 1 ? "💥跳砸" : "🔥弹幕");
    } else if (enemy.type === EnemyType.CHARGER) {
      indicatorColor = "#ff8800";
      indicatorText = "!!";
    } else if (enemy.type === EnemyType.THROWER) {
      indicatorColor = "#aa44ff";
      indicatorText = "✦";
    } else {
      indicatorColor = "#ff4444";
      indicatorText = "!";
    }

    enemy.windupIndicator = this.add.text(
      enemy.container.x, enemy.container.y - 52,
      indicatorText, {
        fontSize: enemy.type === EnemyType.BOSS ? "18px" : "24px",
        color: indicatorColor,
        fontFamily: "Arial", fontStyle: "bold",
        backgroundColor: "#00000088", padding: { x: 4, y: 2 },
      }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: enemy.windupIndicator,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * 敌人执行攻击（根据类型走不同分支）
   */
  private enemyPerformAttack(enemy: Enemy) {
    // 移除前摇感叹号
    if (enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    switch (enemy.type) {
      case EnemyType.NORMAL: {
        // ---- 普通近战攻击 ----
        enemy.state = EnemyState.ATTACKING;
        enemy.stateTimer = this.time.now + this.ENEMY_ATTACK_DURATION;
        const dir = enemy.facingRight ? 1 : -1;
        const hitX = enemy.container.x + dir * this.ENEMY_ATTACK_RANGE;
        const dx = this.player.x - hitX;
        const dy = this.player.y - enemy.container.y;
        if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
          this.damagePlayer(this.ENEMY_ATTACK_DAMAGE, dir * this.ENEMY_ATTACK_KNOCKBACK);
        }
        // 红色弧线特效
        const g = this.add.graphics();
        g.lineStyle(3, 0xff6644, 0.7);
        g.strokeEllipse(0, 0, 30, 40);
        g.setPosition(hitX, enemy.container.y);
        this.tweens.add({
          targets: g, alpha: 0, scale: 1.3, duration: 150,
          onComplete: () => g.destroy(),
        });
        break;
      }

      case EnemyType.CHARGER: {
        // ---- 冲锋怪冲锋 ----
        enemy.state = EnemyState.CHARGING;
        enemy.stateTimer = this.time.now + this.CHARGER_CHARGE_DURATION;
        for (let i = 0; i < 3; i++) {
          const dust = this.add.circle(
            enemy.container.x + (Math.random() - 0.5) * 20,
            enemy.container.y + 15,
            4 + Math.random() * 3, 0xcccccc, 0.5
          );
          this.tweens.add({
            targets: dust, alpha: 0, y: dust.y - 15, duration: 300,
            onComplete: () => dust.destroy(),
          });
        }
        break;
      }

      case EnemyType.THROWER: {
        // ---- 投掷怪瞄准后投掷 ----
        enemy.state = EnemyState.AIMING;
        enemy.stateTimer = this.time.now + 200;
        const flash = this.add.circle(
          enemy.container.x + (enemy.facingRight ? 14 : -14),
          enemy.container.y - 24, 8, 0xe8d44d, 0.7
        );
        this.tweens.add({
          targets: flash, scale: 2, alpha: 0, duration: 200,
          onComplete: () => flash.destroy(),
        });
        break;
      }

      case EnemyType.BOSS: {
        // ---- BOSS 三种攻击循环 ----
        const atk = enemy.attackIndex % 3;
        enemy.attackIndex++; // 下次用下一种攻击

        switch (atk) {
          case 0: // 冲锋
            enemy.state = EnemyState.CHARGING;
            enemy.stateTimer = this.time.now + this.BOSS_CHARGE_DURATION;
            this.cameras.main.shake(100, 0.005); // 蓄力震屏
            break;
          case 1: // 跳砸
            this.bossJumpSlam(enemy);
            break;
          case 2: // 弹幕
            this.bossBarrage(enemy);
            break;
        }
        break;
      }
    }
  }

  /**
   * 投掷怪发射投掷物（法杖能量球飞向玩家）
   */
  private throwerLaunchProjectile(enemy: Enemy) {
    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 14;
    const startY = enemy.container.y - 24;

    // 创建投掷物（紫色能量球）
    const proj = this.add.circle(startX, startY, 6, 0x9b59b6, 0.9);

    // 先加入物理组（组会自动创建物理体）
    this.projectiles.add(proj);
    proj.setData("damage", this.THROWER_PROJECTILE_DAMAGE); // 投掷怪伤害

    // 设置物理体属性
    const projBody = proj.body as Phaser.Physics.Arcade.Body;
    projBody.setAllowGravity(false);
    projBody.setSize(12, 12);

    // 计算飞行方向（朝向玩家当前位置）
    const aimDx = this.player.x - startX;
    const aimDy = this.player.y - startY;
    const dist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
    const speed = this.THROWER_PROJECTILE_SPEED;
    projBody.setVelocity((aimDx / dist) * speed, (aimDy / dist) * speed);

    // 内圈高光（跟随投掷物移动）
    const inner = this.add.circle(startX, startY, 3, 0xe8d44d, 0.7);
    this.tweens.add({
      targets: inner,
      duration: 3000,
      onUpdate: () => {
        if (proj.active) {
          inner.setPosition(proj.x, proj.y);
        } else {
          inner.destroy();
        }
      },
    });

    // 3秒后自动销毁（防止飞出地图卡住）
    this.time.delayedCall(3000, () => {
      if (proj.active) proj.destroy();
      if (inner.active) inner.destroy();
    });
  }

  // ======================== BOSS 专属攻击 ========================

  /**
   * BOSS 跳砸：跳起 → 滞空 → 砸落 → 左右冲击波
   * 跳起期间不受重力，用 Tween 控制 Y 坐标
   */
  private bossJumpSlam(enemy: Enemy) {
    enemy.state = EnemyState.BOSS_JUMP;
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false); // 跳起时关闭重力

    const origY = enemy.container.y;
    const dir = enemy.facingRight ? 1 : -1;
    // 跳跃目标：玩家附近（预判位置）
    const targetX = this.player.x;

    // 阶段1：跳起（300ms）
    this.tweens.add({
      targets: enemy.container,
      y: origY - this.BOSS_JUMP_HEIGHT,
      x: targetX, // 水平方向也移向玩家
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        // 阶段2：滞空（200ms，给玩家反应时间）
        this.time.delayedCall(200, () => {
          // 阶段3：砸落（250ms）
          this.tweens.add({
            targets: enemy.container,
            y: origY, // 落回地面
            duration: 250,
            ease: "Bounce",
            onComplete: () => {
              // 恢复重力
              body.setAllowGravity(true);

              // 落点伤害判定
              const hitDx = Math.abs(this.player.x - enemy.container.x);
              const hitDy = Math.abs(this.player.y - enemy.container.y);
              if (hitDx < 60 && hitDy < 60) {
                this.damagePlayer(this.BOSS_JUMP_DAMAGE, dir * this.BOSS_JUMP_KNOCKBACK);
              }

              // 震屏
              this.cameras.main.shake(300, 0.015);

              // 左右冲击波（两个沿地面扩散的半透明矩形）
              this.bossShockwave(enemy.container.x, origY);

              // 冷却
              enemy.stateTimer = this.time.now + this.BOSS_COOLDOWN;
              enemy.state = EnemyState.COOLDOWN;
            },
          });
        });
      },
    });
  }

  /**
   * BOSS 跳砸落地的冲击波（左右各一个扩散矩形 + 粒子）
   */
  private bossShockwave(x: number, y: number) {
    // 左右冲击波
    [-1, 1].forEach((dir) => {
      const wave = this.add.rectangle(x, y - 10, 10, 30, 0xff4444, 0.7);
      this.tweens.add({
        targets: wave,
        x: x + dir * 200,
        width: 200,
        alpha: 0,
        duration: 400,
        ease: "Power2",
        onComplete: () => wave.destroy(),
      });

      // 冲击波也作为投掷物（能伤害玩家）
      const proj = this.add.circle(x, y - 10, 8, 0xff6644, 0.5);
      this.projectiles.add(proj);
      proj.setData("damage", this.BOSS_JUMP_DAMAGE); // 跳砸冲击波伤害
      const projBody = proj.body as Phaser.Physics.Arcade.Body;
      projBody.setAllowGravity(false);
      projBody.setVelocity(dir * this.BOSS_JUMP_SHOCKWAVE_SPEED, 0);
      this.time.delayedCall(500, () => { if (proj.active) proj.destroy(); });
    });

    // 落地碎石
    for (let i = 0; i < 6; i++) {
      const debris = this.add.rectangle(
        x + (Math.random() - 0.5) * 60, y,
        4 + Math.random() * 4, 4 + Math.random() * 4, 0x8b6914
      );
      this.tweens.add({
        targets: debris,
        y: y - 30 - Math.random() * 40,
        x: debris.x + (i % 2 === 0 ? 1 : -1) * (40 + Math.random() * 50),
        alpha: 0, angle: 360, duration: 500, ease: "Bounce",
        onComplete: () => debris.destroy(),
      });
    }
  }

  /**
   * BOSS 弹幕攻击：扇形发射多颗能量球
   */
  private bossBarrage(enemy: Enemy) {
    enemy.state = EnemyState.BOSS_FIRE;
    enemy.stateTimer = this.time.now + 800; // 发射持续时间

    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 32;
    const startY = enemy.container.y - 20;

    // 扇形发射：5颗，角度从 -30° 到 +30°
    const count = this.BOSS_BARRAGE_COUNT;
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 120, () => { // 每颗间隔120ms
        if (!enemy.alive) return; // BOSS 死了就不射了

        // 角度：以面朝方向为基准，扇形展开
        const spreadAngle = Phaser.Math.DegToRad(-30 + (60 * i / (count - 1)));
        const baseAngle = dir > 0 ? 0 : Math.PI; // 0=右, π=左
        const finalAngle = baseAngle + spreadAngle;

        const vx = Math.cos(finalAngle) * this.BOSS_BARRAGE_SPEED;
        const vy = Math.sin(finalAngle) * this.BOSS_BARRAGE_SPEED;

        // 创建弹幕（红色大能量球）
        const proj = this.add.circle(startX, startY, 8, 0xff4444, 0.9);
        this.projectiles.add(proj);
        proj.setData("damage", this.BOSS_BARRAGE_DAMAGE); // BOSS 弹幕伤害
        const projBody = proj.body as Phaser.Physics.Arcade.Body;
        projBody.setAllowGravity(false);
        projBody.setSize(16, 16);
        projBody.setVelocity(vx, vy);

        // 3秒后自动销毁
        this.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
      });
    }
  }

  // ======================== BOSS HUD ========================

  /**
   * 创建 BOSS 专属血条（屏幕顶部居中，大血条 + 名字）
   */
  private createBossHudBar() {
    const barW = 400;
    const barH = 18;
    const cx = 480; // 屏幕中心 X

    // 背景
    this.bossHpBarBg = this.add.rectangle(cx, 18, barW + 4, barH + 4, 0x222222)
      .setScrollFactor(0).setDepth(10);
    // 血条
    this.bossHpBarFill = this.add.rectangle(cx - barW / 2, 18, barW, barH, 0xcc0000)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(11);
    // 名字
    this.bossHpLabel = this.add.text(cx, 6, "赤焰魔君", {
      fontSize: "14px", color: "#ff4444", fontFamily: "SimHei", fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(11);
  }

  /**
   * 每帧更新 BOSS 血条（在主 update 中调用）
   */
  private updateBossHud() {
    if (!this.bossRef || !this.bossRef.alive) {
      // BOSS 死了就隐藏血条
      if (this.bossHpBarBg) this.bossHpBarBg.setVisible(false);
      if (this.bossHpBarFill) this.bossHpBarFill.setVisible(false);
      if (this.bossHpLabel) this.bossHpLabel.setVisible(false);
      return;
    }
    const ratio = Math.max(0, this.bossRef.hp / this.bossRef.maxHp);
    this.bossHpBarFill.width = 400 * ratio;
    // 低血量变色（深红→暗红）
    this.bossHpBarFill.setFillStyle(ratio > 0.3 ? 0xcc0000 : 0x660000);
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
