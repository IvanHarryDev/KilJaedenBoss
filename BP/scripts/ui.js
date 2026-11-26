import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { sleep } from "./util.js";
import { DIFFICULTIES } from "./config.js";

export async function askDifficulty(player) {
    const form = new ActionFormData()
        .title("§5§lKil'jaeden")
        .body(
            "§7El Engañador despierta...\n\n" +
            "Elegí la dificultad del combate.\n" +
            "§8Afecta a la vida del jefe, al daño y a la velocidad de sus ataques."
        );
    for (const d of DIFFICULTIES) {
        form.button(`§l${d.name}§r\n§8Daño x${d.dmg}  |  Ataques x${(1 / d.cd).toFixed(1)}`);
    }

    for (let i = 0; i < 15; i++) {
        try {
            const res = await form.show(player);
            if (res.canceled) {
                if (res.cancelationReason === FormCancelationReason.UserBusy) {
                    await sleep(20);
                    continue;
                }
                return 0;
            }
            return res.selection ?? 0;
        } catch {
            return 0;
        }
    }
    return 0;
}