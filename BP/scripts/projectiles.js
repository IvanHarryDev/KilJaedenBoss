import { EntityDamageCause } from "@minecraft/server";
import { add, sub, mul, norm, lerp, isValid, particle, playSound, targetsNear, hurt, knock } from "./util.js";
import { P, explosion } from "./fx.js";
import { SND } from "./config.js";

const live = new Set();

const DEFAULTS = {
    speed: 0.8,
    life: 80,
    radius: 0.9,
    aoe: 2.5,
    damage: 8,
    kind: "fel",
    homing: 0,
    burn: 0,
    knock: 0.9,
};

export function launch(opts) {
    const p = { ...DEFAULTS, ...opts, age: 0 };
    p.pos = { ...opts.from };
    p.dir = norm(opts.dir);
    live.add(p);
    return p;
}

export function tickProjectiles() {
    for (const p of [...live]) {
        let keep = false;
        try {
            keep = step(p);
        } catch {
            keep = false;
        }
        if (!keep) live.delete(p);
    }
}

export function clearProjectiles() {
    live.clear();
}

function step(p) {
    p.age++;

    if (p.homing > 0 && isValid(p.target)) {
        const want = norm(sub(add(p.target.location, { x: 0, y: 1, z: 0 }), p.pos));
        p.dir = norm(lerp(p.dir, want, p.homing));
    }

    const next = add(p.pos, mul(p.dir, p.speed));
    const fire = p.kind === "fire";

    particle(p.dim, fire ? P.FIRE_CORE : P.BOLT, next);
    particle(p.dim, fire ? P.FIRE_TRAIL : P.TRAIL, p.pos);

    try {
        const b = p.dim.getBlock(next);
        if (b && !b.isAir && !b.isLiquid && b.isSolid) {
            detonate(p, p.pos);
            return false;
        }
    } catch {
        return false;
    }

    if (targetsNear(p.dim, next, p.radius).length > 0) {
        detonate(p, next);
        return false;
    }

    p.pos = next;
    if (p.age >= p.life) {
        detonate(p, next);
        return false;
    }
    return true;
}

function detonate(p, loc) {
    const fire = p.kind === "fire";
    explosion(p.dim, loc, p.kind);
    playSound(p.dim, SND.HIT, loc, 1, fire ? 1.3 : 1);

    for (const t of targetsNear(p.dim, loc, p.aoe)) {
        const d = Math.hypot(t.location.x - loc.x, t.location.y + 1 - loc.y, t.location.z - loc.z);
        const falloff = 1 - Math.min(0.5, (d / p.aoe) * 0.5);
        hurt(t, p.damage * falloff, p.source, EntityDamageCause.magic);
        knock(t, loc, p.knock, 0.35);
        if (p.burn > 0) {
            try { t.setOnFire(p.burn, true); } catch { }
        }
        particle(p.dim, P.SPARK, { x: t.location.x, y: t.location.y + 1, z: t.location.z });
    }
}