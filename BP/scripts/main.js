import { world } from "@minecraft/server";
import { initBoss } from "./boss.js";
import { initCommands } from "./commands.js";

world.afterEvents.worldLoad.subscribe(() => {
    initBoss();
    initCommands();
    console.warn("[kj] Kil'jaeden Boss cargado");
});