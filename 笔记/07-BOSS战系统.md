# 07 - BOSS 战系统

## 核心设计

BOSS = 三种攻击模式循环 + 霸体机制 + 屏幕顶部专属血条

### 1. BOSS 攻击循环

```typescript
attackIndex % 3:
  0 → 冲锋（高速冲向玩家）
  1 → 跳砸（跳起 → 滞空 → 砸落 → 冲击波）
  2 → 弹幕（扇形发射5颗能量球）
```

每次攻击后 `attackIndex++`，自然循环。

### 2. 霸体机制（Super Armor）

普通怪被打会中断前摇进入硬直，BOSS 不一样：

```
PATROL / COOLDOWN 状态 → 可以被短暂硬直（150ms），击退只 0.3 倍
WINDUP / 攻击中        → 完全不打断，不击退
```

这给玩家一种"BOSS 很重、很霸气"的感觉。

### 3. 跳砸实现（bossJumpSlam）

关键技巧：
- 跳起前 `body.setAllowGravity(false)` — 否则物理引擎会把 BOSS 往下拉
- 用 Tween 控制 Y 坐标：上升(Power2) → 滞空(delay) → 下落(Bounce)
- 落地后 `body.setAllowGravity(true)` — 恢复物理
- Bounce 缓动让砸落有"重力加速 → 弹一下"的冲击感
- 落地冲击波 = 两个向左右扩散的 Rectangle + 投掷物（能伤害玩家）

### 4. 弹幕实现（bossBarrage）

扇形发射的核心数学：
```typescript
// 5 颗弹幕，角度从 -30° 到 +30° 等距分布
const spreadAngle = DegToRad(-30 + (60 * i / (count - 1)));
// 以面朝方向为基准叠加扇形角度
const baseAngle = dir > 0 ? 0 : Math.PI;
const finalAngle = baseAngle + spreadAngle;
```

每颗间隔 120ms（`time.delayedCall(i * 120, ...)`），形成连续发射感。

### 5. BOSS 血条（屏幕顶部）

- 400px 宽的红色血条，居中显示
- 低血量（< 30%）变为暗红色
- BOSS 死亡后自动隐藏

### 6. 碰撞体对齐

BOSS 视觉大小 80px，但碰撞体和小怪一样高（48px）。
原因：Phaser 物理引擎以碰撞体底部为"脚"，不同高度的碰撞体会站在不同的"地面"上。
让所有敌人的碰撞体高度一致，才能站在同一条地面上。

## BOSS 参数表

| 参数 | 值 | 说明 |
|------|-----|------|
| BOSS_HP | 500 | 血量 |
| BOSS_PATROL_SPEED | 40 | 慢步逼近速度 |
| BOSS_CHARGE_SPEED | 500 | 冲锋速度 |
| BOSS_JUMP_HEIGHT | 200 | 跳起高度 |
| BOSS_BARRAGE_COUNT | 5 | 弹幕数量 |
| BOSS_HIT_STAGGER | 150ms | 受击硬直（很短） |

## 状态机扩展

BOSS 新增了三个状态：
- `BOSS_JUMP` — 跳砸中（在空中，由 Tween 控制）
- `BOSS_FIRE` — 弹幕发射中（站定不动，等发射完毕）
- `CHARGING` — 复用冲锋怪的状态，但用 BOSS 专属参数
