export {
  Module,
  getModuleMetadata,
  defineModule,
  isConfiguredModule,
} from "./core/module.decorator";
export { DatapackFactory, consolidateTick } from "./core/factory";
export type { FactoryOptions } from "./core/factory";
export { ActiveFlags, ACTIVE_OBJECTIVE } from "./core/flags";
export {
  On,
  Every,
  on,
  every,
  addEventHandler,
  getEventHandlers,
  rearmEvents,
  HandlerGroup,
  EventLatches,
  EVENT_OBJECTIVE,
} from "./core/events";
export type { OnOptions, EventHandler } from "./core/events";
export { buildEnv, isDev, setBuildEnv } from "./core/env";
export {
  DIFFICULTIES,
  DIFFICULTY,
  DIFFICULTY_IDS,
  defineDifficulty,
  setDifficulty,
} from "./core/difficulty";
export type { Difficulty } from "./core/difficulty";
export { defineItem, ItemBuilder } from "./item/builder";
export { defineBoss, BossBuilder } from "./boss/builder";
export { defineMob, MobBuilder, writeMobPreview } from "./mob";
export type {
  MobModuleOpts,
  MobModuleRef,
  MobPreview,
  MobPreviewOpts,
} from "./mob";
export type {
  AbilityOpts,
  BarStyle,
  BossBody,
  BossModuleOpts,
  BossbarColor,
  PhaseOpts,
} from "./boss/builder";
export { registerItem, registerItemGiveCommands } from "./item/registry";
export type { ItemBehaviour } from "./item/builder";
export { StateMachine } from "./state-machine";
export type { StateBody, StateConfig } from "./state-machine";
export type {
  BuildEnv,
  ConfiguredModule,
  DatapackModule,
  ModuleClass,
  ModuleMetadata,
  ModuleRef,
  ModuleScope,
} from "./core/module.interface";
export type {
  AreaTrigger,
  PlayersTrigger,
  ScoreTrigger,
  Vec3,
  Zone,
} from "./core/area";
export { Logger } from "./logger";
export type { LogLevel, NamespaceLogger } from "./logger";
