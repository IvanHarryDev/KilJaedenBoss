import { system, GameMode, EntityDamageCause } from "@minecraft/server";

export const TAU = Math.PI * 2;

export const sleep = (ticks) =>
    new Promise((resolve) => system.runTimeout(resolve, Math.max(1, Math.round(ticks))));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => len(sub(a, b));
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a) => {
    const l = len(a) || 1;
    return mul(a, 1 / l);
};
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
export const rotY = (v, rad) => ({
    x: v.x * Math.cos(rad) - v.z * Math.sin(rad),
    y: v.y,
    z: v.x * Math.sin(rad) + v.z * Math.cos(rad),
});
export function distToSegment(p, a, b) {
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    if (l2 === 0) return dist(p, a);
    let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2;
    t = clamp(t, 0, 1);
    return dist(p, add(a, mul(ab, t)));
}

export function isValid(e) {
    try {
        if (!e) return false;
        const v = e.isValid;
        return typeof v === "function" ? v.call(e) : !!v;
    } catch {
        return false;
    }
}

export function isFightable(p) {
    try {
        const gm = p.getGameMode();
        return gm !== GameMode.Creative && gm !== GameMode.Spectator;
    } catch {
        return false;
    }
}

export function playersNear(dim, loc, r) {
    try {
        return dim.getPlayers({ location: loc, maxDistance: r }).filter(isFightable);
    } catch {
        return [];
    }
}

export function nearestPlayer(dim, loc, r, anyMode = false) {
    try {
        const list = dim.getPlayers({ location: loc, maxDistance: r }).filter((p) => anyMode || isFightable(p));
        list.sort((a, b) => dist(a.location, loc) - dist(b.location, loc));
        return list[0];
    } catch {
        return undefined;
    }
}

const IGNORE_TYPES = [
    "minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:armor_stand",
    "minecraft:painting", "minecraft:area_effect_cloud", "minecraft:falling_block",
    "minecraft:thrown_trident", "minecraft:snowball", "minecraft:egg",
];

export function targetsNear(dim, loc, r) {
    let list = [];
    try {
        list = dim.getEntities({
            location: loc,
            maxDistance: r,
            excludeFamilies: ["kj_boss", "kj_minion"],
            excludeTypes: IGNORE_TYPES,
        });
    } catch {
        return [];
    }
    return list.filter((e) => {
        try {
            if (e.typeId === "minecraft:player") return isFightable(e);
            return !!e.getComponent("minecraft:health");
        } catch {
            return false;
        }
    });
}

export function hurt(target, amount, source, cause = EntityDamageCause.magic) {
    try {
        const opts = { cause };
        if (isValid(source)) opts.damagingEntity = source;
        target.applyDamage(amount, opts);
    } catch { }
}

export function knock(target, from, force, up = 0.4) {
    try {
        const dx = target.location.x - from.x;
        const dz = target.location.z - from.z;
        const l = Math.hypot(dx, dz) || 1;
        target.applyKnockback({ x: (dx / l) * force, z: (dz / l) * force }, up);
    } catch { }
}

export function particle(dim, id, loc, vars) {
    try {
        dim.spawnParticle(id, loc, vars);
    } catch { }
}

export function playSound(dim, id, loc, volume = 1, pitch = 1) {
    try {
        if (typeof dim.playSound === "function") {
            dim.playSound(id, loc, { volume, pitch });
            return;
        }
    } catch { }
    try {
        dim.runCommand(`playsound ${id} @a ${loc.x} ${loc.y} ${loc.z} ${volume} ${pitch}`);
    } catch { }
}

export function tell(dim, loc, r, text) {
    try {
        for (const p of dim.getPlayers({ location: loc, maxDistance: r })) p.sendMessage(text);
    } catch { }
}

export function title(dim, loc, r, text, subtitle = "") {
    try {
        for (const p of dim.getPlayers({ location: loc, maxDistance: r })) {
            p.onScreenDisplay.setTitle(text, { subtitle, fadeInDuration: 8, stayDuration: 50, fadeOutDuration: 14 });
        }
    } catch { }
}

export function shake(dim, loc, r, intensity = 0.4, seconds = 0.6) {
    try {
        for (const p of dim.getPlayers({ location: loc, maxDistance: r })) {
            p.runCommand(`camerashake add @s ${intensity} ${seconds} positional`);
        }
    } catch { }
}

export const bar = (frac, size = 20) => {
    const f = Math.round(clamp(frac, 0, 1) * size);
    return "§a" + "|".repeat(f) + "§8" + "|".repeat(size - f);
};