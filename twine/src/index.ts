export {
  Module,
  getModuleMetadata,
  defineModule,
  isConfiguredModule,
} from "./module.decorator";
export { DatapackFactory, consolidateTick } from "./factory";
export type { FactoryOptions } from "./factory";
export { ActiveFlags, ACTIVE_OBJECTIVE } from "./flags";
export { defineItem, ItemBuilder } from "./item";
export type { ItemBehaviour } from "./item";
export { StateMachine } from "./state-machine";
export type { StateBody, StateConfig } from "./state-machine";
export type {
  BuildEnv,
  ConfiguredModule,
  DatapackModule,
  ModuleClass,
  ModuleMetadata,
  ModuleRef,
} from "./module.interface";
export type { AreaTrigger, Vec3, Zone } from "./area";
