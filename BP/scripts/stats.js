import { world } from "@minecraft/server";

export function recordVictory(diffId, seconds) {
    const defeatsKey = "kj:defeats";
    const bestKey = `kj:best_${diffId}`;
    const defeats = (Number(world.getDynamicProperty(defeatsKey)) || 0) + 1;
    world.setDynamicProperty(defeatsKey, defeats);

    const prev = world.getDynamicProperty(bestKey);
    const isRecord = typeof prev !== "number" || seconds < prev;
    if (isRecord) world.setDynamicProperty(bestKey, seconds);
    return { defeats, isRecord, best: isRecord ? seconds : prev };
}

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;