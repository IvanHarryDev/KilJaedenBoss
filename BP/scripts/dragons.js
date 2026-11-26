import { ID, DRAGONS, SND } from "./config.js";
import {
    TAU, sleep, rand, randInt, add, sub, mul, norm, lerp, isValid, particle, playSound,
    nearestPlayer,
} from "./util.js";
import { P, runeCircle, column, smoke } from "./fx.js";
import { launch } from "./projectiles.js";

const ownerTag = (boss) => `kj_owner_${boss.id}`;
const dstate = new Map();

export function rebuildDragons(st) {
    st.dragons = [];
    try {
        for (const d of st.entity.dimension.getEntities({ type: ID.DRAGON, tags: [ownerTag(st.entity)] })) st.dragons.push(d);
    } catch { }
}

function prune(st) {
    st.dragons = st.dragons.filter(isValid);
}

export async function summonDragons(st) {
    const boss = st.entity;
    const dim = boss.dimension;
    prune(st);
    const missing = DRAGONS.count - st.dragons.length;
    for (let i = 0; i < missing; i++) {
        if (!isValid(boss)) return;
        const c = boss.location;
        const ang = (i / DRAGONS.count) * TAU + rand(-0.2, 0.2);
        const ground = { x: c.x + Math.cos(ang) * DRAGONS.orbitRadius, y: c.y, z: c.z + Math.sin(ang) * DRAGONS.orbitRadius };
        const pos = { x: ground.x, y: c.y + DRAGONS.orbitHeight, z: ground.z };

        runeCircle(dim, ground, "s");
        column(dim, ground, DRAGONS.orbitHeight, 0.7, P.SOUL);
        playSound(dim, SND.DRAGON_SPAWN, pos, 1, rand(0.9, 1.2));
        await sleep(5);
        if (!isValid(boss)) return;

        try {
            const d = dim.spawnEntity(ID.DRAGON, pos);
            d.addTag(ownerTag(boss));
            dstate.set(d.id, { cd: randInt(20, DRAGONS.fireMax) });
            particle(dim, P.EXPLO, pos);
            st.dragons.push(d);
        } catch (e) {
            console.warn(`[kj] no se pudo spawnear el dragón: ${e}`);
        }
    }
}

export function tickDragons(st, tick) {
    prune(st);
    const n = st.dragons.length;
    if (!n) return;

    const boss = st.entity;
    const dim = boss.dimension;
    const c = boss.location;
    const speedMul = st.rage ? 1.7 : 1;
    const spin = tick * DRAGONS.orbitSpeed * speedMul;

    st.dragons.forEach((d, i) => {
        const ang = spin + (i * TAU) / n;
        const r = DRAGONS.orbitRadius + Math.sin(tick * 0.05 + i * 1.7) * 0.5;
        const h = DRAGONS.orbitHeight + Math.sin(tick * 0.09 + i * 2.1) * 0.6;
        const goal = { x: c.x + Math.cos(ang) * r, y: c.y + h, z: c.z + Math.sin(ang) * r };
        const cur = d.location;
        const pos = lerp(cur, goal, 0.3);

        const ds = dstate.get(d.id) ?? { cd: randInt(20, DRAGONS.fireMax) };
        dstate.set(d.id, ds);
        const target = ds.cd <= 8 ? nearestPlayer(dim, cur, DRAGONS.range) : undefined;
        const look = target
            ? add(target.location, { x: 0, y: 1, z: 0 })
            : add(pos, { x: -Math.sin(ang), y: 0, z: Math.cos(ang) });

        try {
            d.teleport(pos, { facingLocation: look, keepVelocity: false });
        } catch { }

        if (tick % 4 === (i % 4)) particle(dim, P.FIRE_TRAIL, pos);

        ds.cd -= 1;
        if (ds.cd <= 0) {
            ds.cd = Math.round(rand(DRAGONS.fireMin, DRAGONS.fireMax) * st.diff.cd * (st.rage ? 0.45 : 1));
            if (target) shoot(st, d, target);
        }
    });
}

function shoot(st, dragon, target) {
    const dim = dragon.dimension;
    const from = add(dragon.location, { x: 0, y: 0.3, z: 0 });
    const aim = add(target.location, { x: rand(-0.4, 0.4), y: 1 + rand(-0.2, 0.3), z: rand(-0.4, 0.4) });
    const dir = norm(sub(aim, from));
    launch({
        dim,
        from: add(from, mul(dir, 0.8)),
        dir,
        speed: DRAGONS.projectileSpeed,
        life: 75,
        radius: 0.9,
        aoe: 2.2,
        damage: DRAGONS.damage * st.diff.dmg,
        kind: "fire",
        burn: 3,
        homing: 0.02,
        target,
        source: st.entity,
    });
    playSound(dim, SND.DRAGON_FIRE, from, 0.9, rand(0.9, 1.2));
}

export function clearDragons(st, withFx = true) {
    prune(st);
    for (const d of st.dragons) {
        try {
            if (withFx) smoke(d.dimension, d.location);
            dstate.delete(d.id);
            d.remove();
        } catch { }
    }
    st.dragons = [];
}

const orphanSeen = new Map();
export function sweepOrphans(dim, aliveBossIds) {
    let list = [];
    try { list = dim.getEntities({ type: ID.DRAGON }); } catch { return; }
    for (const d of list) {
        const tag = d.getTags().find((t) => t.startsWith("kj_owner_"));
        const owner = tag ? tag.slice("kj_owner_".length) : undefined;
        if (owner && aliveBossIds.has(owner)) { orphanSeen.delete(d.id); continue; }
        const seen = (orphanSeen.get(d.id) ?? 0) + 1;
        orphanSeen.set(d.id, seen);
        if (seen >= 2) { try { smoke(dim, d.location); d.remove(); } catch { } orphanSeen.delete(d.id); }
    }
}

export function onDragonDeath(deadId, loc, dim) {
    dstate.delete(deadId);
    if (loc && dim) {
        particle(dim, P.FIRE_EXPLO, loc);
        playSound(dim, SND.HIT, loc, 0.8, 1.4);
    }
}