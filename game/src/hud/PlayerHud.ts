/**
 * 玩家 HUD 模块（PlayerHud）
 *
 * 把玩家界面上所有"显示信息"的东西从 BattleScene 里拆出来：
 * - HP 血条（左上角绿色/红色条）
 * - MP 蓝条（血条下方蓝色条）
 * - 技能图标（蓝条右侧的小方框，缺蓝时变暗）
 *
 * 为什么拆出来？
 * BattleScene 已经管了移动、攻击、敌人AI、BOSS……再管 UI 显示就太臃肿了。
 * 拆出来后，想改 UI 样式只需改这个文件，不用担心碰到战斗逻辑。
 */

export class PlayerHud {
  // ===== HUD 组件引用 =====
  private hpBarFill: Phaser.GameObjects.Rectangle;   // 血条填充（宽度随 HP 变化）
  private mpBarFill: Phaser.GameObjects.Rectangle;   // 蓝条填充（宽度随 MP 变化）

  // 技能1 缺蓝遮罩
  private skill1DimOverlay: Phaser.GameObjects.Rectangle;

  // 技能2 缺蓝遮罩
  private skill2DimOverlay: Phaser.GameObjects.Rectangle;

  // 技能3 缺蓝遮罩
  private skill3DimOverlay: Phaser.GameObjects.Rectangle;

  /**
   * @param scene         场景引用（用 this.add.xxx 创建游戏对象）
   * @param skill1MpCost  技能1 的 MP 消耗（用于判断"缺蓝"时显示遮罩）
   * @param skill2MpCost  技能2 的 MP 消耗
   * @param skill3MpCost  技能3 的 MP 消耗
   */
  constructor(
    private scene: Phaser.Scene,
    private skill1MpCost: number,
    private skill2MpCost: number,
    private skill3MpCost: number,
  ) {
    // ===== 1. 玩家血条（固定在屏幕左上角） =====
    // 背景（灰色底条）
    this.scene.add.rectangle(90, 42, 160, 14, 0x333333).setScrollFactor(0);
    // 填充（绿色，宽度 = 158 * 当前HP/最大HP）
    this.hpBarFill = this.scene.add.rectangle(11, 42, 158, 12, 0x48bb78)
      .setOrigin(0, 0.5).setScrollFactor(0);
    // "HP" 标签
    this.scene.add.text(11, 28, "HP", {
      fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
    }).setScrollFactor(0);

    // ===== 2. 玩家蓝条（MP，在血条下方） =====
    this.scene.add.rectangle(90, 62, 160, 14, 0x333333).setScrollFactor(0);
    this.mpBarFill = this.scene.add.rectangle(11, 62, 158, 12, 0x4299e1)
      .setOrigin(0, 0.5).setScrollFactor(0);
    this.scene.add.text(11, 48, "MP", {
      fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
    }).setScrollFactor(0);

    // ===== 3. 技能图标 + 缺蓝遮罩 =====
    // 技能1图标（K:烈焰闪，橙色）
    this.createSkillIcon(185, 42, "K", 0xff6600);
    this.skill1DimOverlay = this.scene.add.rectangle(185, 42, 28, 28, 0x000000, 0)
      .setScrollFactor(0); // 默认 alpha=0（有蓝时不显示）

    // 技能2图标（L:巨剑术，金色）
    this.createSkillIcon(220, 42, "L", 0xd4af37);
    this.skill2DimOverlay = this.scene.add.rectangle(220, 42, 28, 28, 0x000000, 0)
      .setScrollFactor(0);

    // 技能3图标（I:天降神踏，绿色毒系）
    this.createSkillIcon(255, 42, "I", 0x44cc44);
    this.skill3DimOverlay = this.scene.add.rectangle(255, 42, 28, 28, 0x000000, 0)
      .setScrollFactor(0);

    // ===== 4. 操作提示文字 =====
    this.scene.add.text(20, 75,
      "A D 移动 | 双击冲刺 | 空格 跳跃 | J 攻击 | K 烈焰闪 | L 巨剑术 | I 天降神踏",
      {
        fontSize: "13px", color: "#ffffff", fontFamily: "Arial",
        backgroundColor: "#00000088", padding: { x: 8, y: 4 },
      }
    ).setScrollFactor(0);
  }

  // ======================== 每帧调用的更新方法 ========================

  /**
   * 更新血条显示
   * @param hp     当前 HP
   * @param maxHp  最大 HP
   */
  updateHp(hp: number, maxHp: number) {
    const ratio = Math.max(0, hp / maxHp);
    this.hpBarFill.width = 158 * ratio;
    // 血量低于 30% 变红色（警告玩家快死了）
    this.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
  }

  /**
   * 更新蓝条显示
   * @param mp    当前 MP
   * @param maxMp 最大 MP
   */
  updateMp(mp: number, maxMp: number) {
    const ratio = mp / maxMp;
    this.mpBarFill.width = 158 * ratio;
  }

  /**
   * 更新技能可用性显示（每帧调用）
   *
   * 只显示缺蓝提示：MP 不够时图标变暗
   *
   * @param mp  当前 MP
   */
  updateSkillAvailability(mp: number) {
    // ---- 技能1 ----
    if (mp < this.skill1MpCost) {
      this.skill1DimOverlay.setFillStyle(0x000000, 0.4);
      this.skill1DimOverlay.setVisible(true);
    } else {
      this.skill1DimOverlay.setVisible(false);
    }

    // ---- 技能2 ----
    if (mp < this.skill2MpCost) {
      this.skill2DimOverlay.setFillStyle(0x000000, 0.4);
      this.skill2DimOverlay.setVisible(true);
    } else {
      this.skill2DimOverlay.setVisible(false);
    }

    // ---- 技能3 ----
    if (mp < this.skill3MpCost) {
      this.skill3DimOverlay.setFillStyle(0x000000, 0.4);
      this.skill3DimOverlay.setVisible(true);
    } else {
      this.skill3DimOverlay.setVisible(false);
    }
  }

  // ======================== 内部方法 ========================

  /**
   * 画一个技能图标小方块
   * 28x28 的深色底 + 彩色内圈 + 快捷键字母
   */
  private createSkillIcon(cx: number, cy: number, key: string, color: number) {
    const icon = this.scene.add.container(cx, cy);
    icon.setScrollFactor(0);

    // 深色底（让 CD 遮罩叠加时对比更明显）
    icon.add(this.scene.add.rectangle(0, 0, 28, 28, 0x222222, 0.9));
    // 彩色内圈（技能代表色）
    icon.add(this.scene.add.rectangle(0, 0, 22, 22, color, 0.5));
    // 快捷键字母
    icon.add(this.scene.add.text(-10, -10, key, {
      fontSize: "10px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5));
  }
}
