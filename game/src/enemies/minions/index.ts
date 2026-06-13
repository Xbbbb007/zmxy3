/**
 * 小怪模块入口（minions/index）
 *
 * 统一导出所有小怪相关的配置、行为和 AI：
 * - MinionConfig  → 各类型小怪的可调参数
 * - MinionBehavior → 共享行为（巡逻、受击、死亡、画外观）
 * - NormalAI       → 普通近战怪 AI
 * - ChargerAI      → 冲锋怪 AI
 * - ThrowerAI      → 投掷怪 AI
 *
 * EnemyManager 通过 import * as Minions from "./minions" 使用。
 */

export * from "./MinionConfig";
export * as MinionBehavior from "./MinionBehavior";
export * as NormalAI from "./NormalAI";
export * as ChargerAI from "./ChargerAI";
export * as ThrowerAI from "./ThrowerAI";
