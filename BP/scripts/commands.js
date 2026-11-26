import { system } from "@minecraft/server";
import { ID, DYN } from "./config.js";
import { add, mul, nearestPlayer, isValid } from "./util.js";
import { getBosses, runAbility, setDifficulty, ABILITY_NAMES } from "./boss.js";

/**
 * Comandos:
 *   /scriptevent kj:spawn
 *   /scriptevent kj:skill <nombre>
 *   /scriptevent kj:hp <porcentaje>
 *   /scriptevent kj:diff <0|1|2>
 *   /scriptevent kj:clear
 */
export function initCommands() {
    system.afterEvents.scriptEventReceive.subscribe(
        (ev) => {
            const src = ev.sourceEntity;
            const arg = (ev.message ?? "").trim();
            const bosses = getBosses();
            const st = bosses[0];

            switch (ev.id) {
                case "kj:spawn": {
                    if (!src) return;
                    const v = src.getViewDirection();
                    const loc = add(src.location, mul({ x: v.x, y: 0, z: v.z }, 8));
                    src.dimension.spawnEntity(ID.BOSS, loc);
                    break;
                }
                case "kj:skill": {
                    if (!st) return src?.sendMessage("§cNo hay jefe cargado.");
                    if (!ABILITY_NAMES.includes(arg)) return src?.sendMessage(`§eHabilidades: ${ABILITY_NAMES.join(", ")}`);
                    const target = nearestPlayer(st.entity.dimension, st.entity.location, 60, true);
                    if (target) runAbility(st, arg, target);
                    break;
                }
                case "kj:hp": {
                    if (!st) return;
                    const pct = Math.max(1, Math.min(100, Number(arg) || 100));
                    const h = st.entity.getComponent("minecraft:health");
                    h.setCurrentValue(Math.max(1, Math.floor((h.effectiveMax * pct) / 100)));
                    break;
                }
                case "kj:diff": {
                    if (!st) return;
                    setDifficulty(st, Number(arg) || 0);
                    break;
                }
                case "kj:clear": {
                    for (const s of bosses) {
                        s.dragons.forEach((d) => { try { d.remove(); } catch { } });
                        if (isValid(s.entity)) s.entity.remove();
                    }
                    break;
                }
            }
        },
        { namespaces: ["kj"] }
    );
}