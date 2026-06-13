/**
 * 动态法阵渲染器（MagicCircle）
 *
 * 用 Canvas2D 绘制三层差速旋转的六芒星法阵，通过 Phaser CanvasTexture
 * 实时同步到游戏画面。支持透视压缩（Y轴缩放）模拟地面效果。
 *
 * 三层旋转：
 * - 外圈（卢恩符文环）→ 顺时针慢速
 * - 中圈（六芒星 + 6 个符号圆）→ 逆时针中速
 * - 内核（小六边形）→ 顺时针快速
 *
 * 双层辉光渲染：
 * - Pass 1：深色大范围光晕（shadowBlur 大）
 * - Pass 2：锐利高亮线条（叠加混合）
 *
 * 移植自独立 HTML Canvas 版本。
 */

// ===== 颜色配置 =====
const COLOR_SCHEMES = {
  fire: {
    glowDark: "#ff3300",    // 深橙红（大范围光晕）
    glowLight: "#ff9900",   // 亮橙色（中等光晕）
    core: "#ffeedd",        // 核心亮白/浅金（实体线条）
  },
  poison: {
    glowDark: "#00cc00",
    glowLight: "#44ff44",
    core: "#ccffcc",
  },
};

// ===== 卢恩字母集 =====
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛟᛞ";

// ===== Canvas 尺寸 =====
const CANVAS_SIZE = 400;

export class MagicCircle {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private textureKey: string;
  private texture: Phaser.Textures.CanvasTexture;
  private sprite: Phaser.GameObjects.Image;
  private angleOffset = 0;
  private colors: typeof COLOR_SCHEMES.fire;

  /**
   * 创建动态法阵
   * @param scene  场景引用
   * @param x      世界坐标 X
   * @param y      世界坐标 Y
   * @param perspectiveY  纵向压缩比例（0.35 = 地面透视效果）
   * @param scheme  颜色方案（"fire" 默认金橙 | "poison" 绿色毒系）
   */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    perspectiveY = 0.35,
    scheme: keyof typeof COLOR_SCHEMES = "fire",
  ) {
    this.colors = COLOR_SCHEMES[scheme];
    const size = CANVAS_SIZE;
    this.textureKey = `magic_circle_rt_${Date.now()}_${Math.random()}`;

    // 创建离屏 Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext("2d")!;

    // 创建 Phaser CanvasTexture
    this.texture = scene.textures.addCanvas(this.textureKey, this.canvas)!;

    // 创建精灵
    this.sprite = scene.add.image(x, y, this.textureKey);
    this.sprite.setScale(0.7, 0.7 * perspectiveY);
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** 获取精灵引用（用于 Tween 动画） */
  getSprite(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  /**
   * 每帧更新（在 BattleScene update 中调用，或由 Tween 驱动）
   * @param deltaMs 帧间隔毫秒数
   */
  update(deltaMs: number) {
    this.angleOffset += 0.003 * (deltaMs / 16.67);

    const ctx = this.ctx;
    const size = CANVAS_SIZE;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";

    const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
    const { glowDark, glowLight, core } = this.colors;

    // Pass 1: 深色大范围光晕
    ctx.save();
    ctx.shadowBlur = size * 0.04 + pulse * size * 0.01;
    ctx.shadowColor = glowDark;
    ctx.strokeStyle = glowDark;
    ctx.fillStyle = glowDark;
    ctx.globalAlpha = 0.8;
    this.drawCircle(ctx, true, this.angleOffset);
    ctx.restore();

    // Pass 2: 高亮锐利线条（叠加）
    ctx.save();
    ctx.shadowBlur = size * 0.01;
    ctx.shadowColor = glowLight;
    ctx.strokeStyle = core;
    ctx.fillStyle = core;
    ctx.globalCompositeOperation = "lighter";
    this.drawCircle(ctx, false, this.angleOffset);
    ctx.restore();

    // 重置混合模式
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 通知 Phaser 刷新 GPU 纹理
    this.texture.refresh();
  }

  /** 销毁法阵（清理纹理和精灵） */
  destroy() {
    this.sprite.destroy();
    this.texture.destroy();
  }

  // ======================== 核心绘制 ========================

  /**
   * 绘制整个法阵（三层差速旋转）
   */
  private drawCircle(ctx: CanvasRenderingContext2D, isGlow: boolean, angle: number) {
    const size = CANVAS_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.45;

    // ---- 第一层：外圈 + 卢恩符文（顺时针慢速） ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle * 0.5);
    ctx.translate(-cx, -cy);

    this.strokeCircle(ctx, cx, cy, R, 2, isGlow);
    this.strokeCircle(ctx, cx, cy, R * 0.95, 4, isGlow);
    this.strokeCircle(ctx, cx, cy, R * 0.78, 4, isGlow);
    this.strokeCircle(ctx, cx, cy, R * 0.75, 1, isGlow);

    // 卢恩符文环
    ctx.save();
    ctx.font = `bold ${R * 0.08}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const runeRadius = R * 0.865;
    const totalRunes = 42;
    for (let i = 0; i < totalRunes; i++) {
      const a = (i / totalRunes) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * runeRadius, cy + Math.sin(a) * runeRadius);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(RUNES[i % RUNES.length], 0, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore(); // 结束第一层

    // ---- 第二层：六芒星 + 6 个符号圆（逆时针中速） ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle * 0.8);
    ctx.translate(-cx, -cy);

    const hexR = R * 0.75;
    this.strokePolygon(ctx, cx, cy, hexR, 3, -Math.PI / 2, 3, isGlow); // 正三角
    this.strokePolygon(ctx, cx, cy, hexR, 3, Math.PI / 2, 3, isGlow);  // 倒三角

    const innerHexR = hexR * 0.577;
    const smallCR = R * 0.12;
    const symbols: SymbolType[] = [
      "A", "crescent-right", "anchor", "R", "crescent-left", "eye",
    ];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const px = cx + Math.cos(a) * innerHexR;
      const py = cy + Math.sin(a) * innerHexR;

      this.strokeCircle(ctx, px, py, smallCR, 2, isGlow);
      this.strokeCircle(ctx, px, py, smallCR * 0.85, 1, isGlow);

      // 符号自转
      this.drawSymbol(ctx, px, py, symbols[i], smallCR * 0.6, 2, isGlow, angle * 2);
    }
    ctx.restore(); // 结束第二层

    // ---- 第三层：核心区域（顺时针快速） ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle * 1.5);
    ctx.translate(-cx, -cy);

    this.strokeCircle(ctx, cx, cy, R * 0.18, 3, isGlow);
    this.strokePolygon(ctx, cx, cy, R * 0.14, 6, 0, 2, isGlow);
    ctx.restore(); // 结束第三层
  }

  // ======================== 基础绘图 ========================

  private strokeCircle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, radius: number,
    lineWidth: number, isGlow: boolean,
  ) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = isGlow ? lineWidth * 4 : lineWidth;
    ctx.stroke();
  }

  private strokePolygon(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, radius: number,
    sides: number, offsetAngle: number,
    lineWidth: number, isGlow: boolean,
  ) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = offsetAngle + (i * 2 * Math.PI / sides);
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = isGlow ? lineWidth * 4 : lineWidth;
    ctx.stroke();
  }

  // ======================== 符号绘制 ========================

  private drawSymbol(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, type: SymbolType,
    r: number, lineWidth: number, isGlow: boolean,
    localRotation: number,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(localRotation);
    ctx.lineWidth = isGlow ? lineWidth * 4 : lineWidth;
    ctx.beginPath();

    switch (type) {
      case "crescent-right":
        ctx.arc(0, 0, r * 0.6, -Math.PI * 0.4, Math.PI * 0.4, false);
        ctx.quadraticCurveTo(-r * 0.4, 0, Math.cos(-Math.PI * 0.4) * r * 0.6, Math.sin(-Math.PI * 0.4) * r * 0.6);
        break;
      case "crescent-left":
        ctx.arc(0, 0, r * 0.6, Math.PI * 0.6, Math.PI * 1.4, false);
        ctx.quadraticCurveTo(r * 0.4, 0, Math.cos(Math.PI * 0.6) * r * 0.6, Math.sin(Math.PI * 0.6) * r * 0.6);
        break;
      case "A":
        ctx.moveTo(0, -r * 0.6); ctx.lineTo(-r * 0.5, r * 0.6);
        ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.5, r * 0.6);
        ctx.moveTo(-r * 0.3, r * 0.2); ctx.lineTo(r * 0.3, r * 0.2);
        break;
      case "anchor":
        ctx.arc(0, r * 0.3, r * 0.4, 0, Math.PI, false);
        ctx.moveTo(0, r * 0.7); ctx.lineTo(0, -r * 0.6);
        ctx.moveTo(-r * 0.3, -r * 0.4); ctx.lineTo(r * 0.3, -r * 0.4);
        break;
      case "R":
        ctx.moveTo(-r * 0.3, r * 0.6); ctx.lineTo(-r * 0.3, -r * 0.6);
        ctx.lineTo(r * 0.2, -r * 0.6);
        ctx.arc(r * 0.2, -r * 0.2, r * 0.4, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-r * 0.3, r * 0.2);
        ctx.moveTo(0, r * 0.2); ctx.lineTo(r * 0.4, r * 0.6);
        break;
      case "eye":
        ctx.moveTo(-r * 0.7, 0); ctx.quadraticCurveTo(0, -r * 0.7, r * 0.7, 0);
        ctx.quadraticCurveTo(0, r * 0.7, -r * 0.7, 0);
        ctx.moveTo(r * 0.2, 0); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        break;
    }

    ctx.stroke();
    ctx.restore();
  }
}

// ===== 类型 =====
type SymbolType = "A" | "crescent-right" | "anchor" | "R" | "crescent-left" | "eye";
