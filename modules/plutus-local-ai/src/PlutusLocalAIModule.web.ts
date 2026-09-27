import { registerWebModule, NativeModule } from "expo";

import { PlutusLocalAIModuleEvents } from "./PlutusLocalAI.types";

// PlutusLocalAIModule is not available on the web platform.
class PlutusLocalAIModule extends NativeModule<PlutusLocalAIModuleEvents> {}

export default registerWebModule(PlutusLocalAIModule, "PlutusLocalAIModule");
