import { world, system, EntityInitializationCause } from "@minecraft/server";
import { ID, PROP, DYN, BOSS, TIMING, DIFFICULTIES, SND, LINES } from "./config.js";
import {
    TAU, sleep, rand, randInt, add, sub, mul, norm, dist, dist2D, lerp, rotY, distToSegment,
    isValid, particle, playSound, targetsNear, playersNear, nearestPlayer, hurt, knock,
    tell, title, shake, bar,
} from "./util.js";
import { P, aura, ring, line, column, sphereBurst, explosion, runeCircle, smoke } from "./fx.js";
import { launch, tickProjectiles, clearProjectiles } from "./projectiles.js";
import { summonDragons, tickDragons, clearDragons, rebuildDragons, sweepOrphans, onDragonDeath } from "./dragons.js";
import { askDifficulty } from "./ui.js";
import { recordVictory, fmtTime } from "./stats.js";

const bosses = new Map();
export const getBosses = () => [...bosses.values()].filter((s) => isValid(s.entity));

const ABORT = "kj-abort";

function makeState(boss) {
    const idx = Number(boss.getDynamicProperty(DYN.DIFF)) || 0;
    return {
        id: boss.id,
        entity: boss,
        ready: true,
        busy: false,
        dying: false,
        finalDone: false,
        phase: Number(boss.getProperty(PROP.PHASE)) || 0,
        cd: {},
        nextAt: 0,
        fightStart: 0,
        idleTicks: 0,
        diff: DIFFICULTIES[idx] ?? DIFFICULTIES[0],
        dragons: [],
        rage: false,
        lastKnockAt: 0,
    };
}

export function registerBoss(boss) {
    if (!isValid(boss) || boss.typeId !== ID.BOSS) return undefined;
    let st = bosses.get(boss.id);
    if (st) { st.entity = boss; return st; }

    st = makeState(boss);
    rebuildDragons(st);
    const mode = String(boss.getProperty(PROP.MODE));
    if (mode.startsWith("inter_")) { setMode(boss, "combat"); unfreeze(boss); }
    if (boss.getProperty(PROP.ACTION) !== "none") { setAction(boss, "none"); }
    if (mode === "combat" || mode === "calm") unfreeze(boss);
    bosses.set(boss.id, st);
    return st;
}

const getMode = (b) => String(b.getProperty(PROP.MODE));
const setMode = (b, m) => { try { b.setProperty(PROP.MODE, m); } catch { } };
const setAction = (b, a) => { try { b.setProperty(PROP.ACTION, a); } catch { } };
function setPhase(st, n) {
    st.phase = n;
    try { st.entity.setProperty(PROP.PHASE, n); } catch { }
}

function freeze(b) {
    try { b.addEffect("slowness", 20000000, { amplifier: 6, showParticles: false }); } catch { }
}
function unfreeze(b) {
    try { b.removeEffect("slowness"); } catch { }
}

const hpFrac = (b) => {
    try {
        const h = b.getComponent("minecraft:health");
        return h.currentValue / h.effectiveMax;
    } catch { return 1; }
};

function face(b, loc) {
    try {
        b.teleport(b.location, { facingLocation: { x: loc.x, y: b.location.y + 1, z: loc.z }, keepVelocity: true });
    } catch { }
}

function castOrigin(b) {
    const v = b.getViewDirection();
    const l = b.location;
    return { x: l.x + v.x * BOSS.castForward, y: l.y + BOSS.castHeight, z: l.z + v.z * BOSS.castForward };
}

function beamOrigin(b) {
    const v = b.getViewDirection();
    const l = b.location;
    return { x: l.x + v.x * BOSS.beamForward, y: l.y + BOSS.beamHeight, z: l.z + v.z * BOSS.beamForward };
}
const aimAt = (t) => add(t.location, { x: 0, y: 1, z: 0 });

async function wait(st, ticks) {
    await sleep(ticks);
    if (st.dying || !isValid(st.entity)) throw new Error(ABORT);
}

function begin(st, action, target) {
    const b = st.entity;
    freeze(b);
    if (target && isValid(target)) face(b, target.location);
    setAction(b, action);
}
function end(st) {
    const b = st.entity;
    if (!isValid(b) || st.dying) return;
    setAction(b, "none");
    if (getMode(b) === "combat") unfreeze(b);
}

async function channel(st, origin, ticks, name = P.GLOW) {
    const dim = st.entity.dimension;
    for (let i = 0; i < ticks; i++) {
        sphereBurst(dim, origin, 3, 1.6 - (i / ticks) * 1.2, name);
        await wait(st, 1);
    }
}

async function abFelBolt(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "cast_spell", target);
    await wait(st, TIMING.cast_spell * 0.25);
    const from = castOrigin(b);
    playSound(dim, SND.CAST, from, 1.2, 1);
    await channel(st, from, Math.round(TIMING.cast_spell * 0.25));
    launch({
        dim, from, dir: sub(aimAt(target), from), speed: 0.85, life: 90, radius: 1, aoe: 2.8,
        damage: 9 * st.diff.dmg, kind: "fel", homing: 0.07, target, source: b,
    });
    await wait(st, TIMING.cast_spell * 0.5);
    end(st);
}

async function abVolley(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "cast_spell_2", target);
    await wait(st, TIMING.cast_spell_2 * 0.3);
    const from = castOrigin(b);
    playSound(dim, SND.CAST, from, 1.4, 0.8);
    await channel(st, from, Math.round(TIMING.cast_spell_2 * 0.25), P.SOUL);
    const base = norm(sub(aimAt(target), from));
    const fan = st.phase >= 2 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.3, 0, 0.3];
    for (const a of fan) {
        launch({
            dim, from, dir: rotY(base, a), speed: 0.75, life: 70, radius: 0.9, aoe: 2.3,
            damage: 6 * st.diff.dmg, kind: "fel", homing: a === 0 ? 0.04 : 0, target, source: b,
        });
    }
    await wait(st, TIMING.cast_spell_2 * 0.45);
    end(st);
}

async function abSummon(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "summon", target);
    playSound(dim, SND.SUMMON, b.location, 1.4, 1);
    runeCircle(dim, b.location, "l");
    await wait(st, TIMING.summon * 0.35);
    column(dim, b.location, 5, 0.6, P.PILLAR);
    await summonDragons(st);
    await wait(st, Math.max(1, TIMING.summon * 0.4));
    end(st);
}

async function abCarrion(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "carrion", target);
    await wait(st, TIMING.carrion * 0.3);
    const c = b.location;
    let dir = norm({ x: target.location.x - c.x, y: 0, z: target.location.z - c.z });
    const origin = castOrigin(b);
    const RANGE = 14, SPREAD = 0.55, DUR = 26;
    playSound(dim, SND.CAST, origin, 1.5, 0.6);
    for (let t = 0; t < DUR; t++) {
        const reach = 3 + (t / DUR) * (RANGE - 3);
        for (let k = 0; k < 8; k++) {
            const d = rand(1.5, reach);
            const a = rand(-SPREAD, SPREAD);
            const v = rotY(dir, a);
            particle(dim, P.SOUL, { x: c.x + v.x * d, y: c.y + rand(0.3, 2.4), z: c.z + v.z * d });
        }
        if (t % 6 === 0) {
            for (const e of targetsNear(dim, c, RANGE)) {
                const to = norm({ x: e.location.x - c.x, y: 0, z: e.location.z - c.z });
                const dot = to.x * dir.x + to.z * dir.z;
                if (dot > Math.cos(SPREAD)) {
                    hurt(e, 4 * st.diff.dmg, b);
                    try { e.addEffect("slowness", 40, { amplifier: 1 }); } catch { }
                    knock(e, c, -0.4, 0.1);
                }
            }
        }
        await wait(st, 1);
    }
    await wait(st, TIMING.carrion * 0.3);
    end(st);
}

async function abUnleash(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "unleash_fel", target);
    const c = b.location;
    runeCircle(dim, c, "l");
    playSound(dim, SND.WAVE, c, 1.6, 1);
    title(dim, c, 40, "", "§2¡Saltad!");
    await wait(st, TIMING.unleash_fel * 0.45);
    shake(dim, c, 40, 0.5, 1.2);
    const hit = new Set();
    const MAX = 18;
    for (let r = 1; r <= MAX; r += 0.85) {
        ring(dim, c, r, Math.ceil(r * 8), P.GLOW, 0.2);
        ring(dim, c, r, Math.ceil(r * 3), P.PILLAR, 0.1);
        for (const e of targetsNear(dim, c, r + 1.4)) {
            const h = dist2D(e.location, c);
            if (h < r - 1.4 || h > r + 1.4) continue;
            if (Math.abs(e.location.y - c.y) > 1.4) continue;
            if (hit.has(e.id)) continue;
            hit.add(e.id);
            hurt(e, 14 * st.diff.dmg, b);
            knock(e, c, 1.6, 0.55);
        }
        await wait(st, 1);
    }
    await wait(st, TIMING.unleash_fel * 0.3);
    end(st);
}

async function abStomp(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "stomp", target);
    await wait(st, TIMING.stomp * 0.45);
    const c = b.location;
    playSound(dim, SND.STOMP, c, 1.6, 0.9);
    particle(dim, P.RING, { x: c.x, y: c.y + 0.15, z: c.z });
    explosion(dim, { x: c.x, y: c.y + 0.3, z: c.z });
    runeCircle(dim, c, "m");
    shake(dim, c, 30, 0.7, 0.7);
    for (const e of targetsNear(dim, c, 9)) {
        hurt(e, 11 * st.diff.dmg, b);
        knock(e, c, 2.2, 0.75);
    }
    await wait(st, TIMING.stomp * 0.55);
    end(st);
}

async function abKnockback(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "knockback", target);
    await wait(st, TIMING.knockback * 0.4);
    const c = b.location;
    playSound(dim, SND.STOMP, c, 1.3, 1.3);
    particle(dim, P.RING, { x: c.x, y: c.y + 0.2, z: c.z });
    particle(dim, P.RING, { x: c.x, y: c.y + 1.2, z: c.z });
    sphereBurst(dim, add(c, { x: 0, y: 1.5, z: 0 }), 30, 1.5, P.SPARK);
    shake(dim, c, 24, 0.5, 0.5);
    for (const e of targetsNear(dim, c, 10)) {
        hurt(e, 4 * st.diff.dmg, b);
        knock(e, c, 3.2, 0.9);
    }
    await wait(st, TIMING.knockback * 0.6);
    end(st);
}

async function abVanish(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "vanish", target);
    playSound(dim, SND.VANISH, b.location, 1.3, 1);
    await wait(st, TIMING.vanish * 0.5);
    smoke(dim, b.location);
    particle(dim, P.EXPLO, add(b.location, { x: 0, y: 1.5, z: 0 }));

    const t = target.location;
    const base = rand(0, TAU);
    let dest;
    for (let i = 0; i < 8 && !dest; i++) {
        const a = base + (i * TAU) / 8;
        const p = { x: t.x + Math.cos(a) * 5, y: t.y, z: t.z + Math.sin(a) * 5 };
        try {
            const f = dim.getBlock(p), h = dim.getBlock({ x: p.x, y: p.y + 1, z: p.z }), h2 = dim.getBlock({ x: p.x, y: p.y + 2, z: p.z });
            if (f?.isAir && h?.isAir && h2?.isAir) dest = p;
        } catch { }
    }
    if (dest) {
        try { b.teleport(dest, { facingLocation: { x: t.x, y: dest.y + 1, z: t.z } }); } catch { }
        smoke(dim, dest);
        particle(dim, P.EXPLO, add(dest, { x: 0, y: 1.5, z: 0 }));
        playSound(dim, SND.CAST, dest, 1, 0.7);
    }
    await wait(st, TIMING.vanish * 0.5);
    end(st);
    if (isValid(target) && st.phase >= 2) await abFelBolt(st, target);
}

async function abBeam(st, target) {
    const b = st.entity, dim = b.dimension;
    begin(st, "beam", target);
    playSound(dim, SND.PHASE, b.location, 1.2, 1.2);
    await wait(st, TIMING.beam * 0.2);

    let aim = { ...target.location };
    const DUR = Math.round(TIMING.beam * 0.65);
    for (let t = 0; t < DUR; t++) {
        if (!isValid(target)) {
            const n = nearestPlayer(dim, b.location, 45);
            if (!n) break;
            target = n;
        }
        aim = lerp(aim, target.location, 0.1);
        const from = beamOrigin(b);
        const to = { x: aim.x, y: aim.y + 0.3, z: aim.z };
        face(b, to);
        line(dim, from, to, 0.9, P.BEAM);
        if (t % 3 === 0) particle(dim, P.GLOW, to);
        if (t % 8 === 0) particle(dim, P.FLASH, to);
        if (t % 18 === 0) playSound(dim, SND.BEAM, from, 1, 1);
        if (t % 4 === 0) {
            for (const e of targetsNear(dim, to, 7)) {
                if (distToSegment(add(e.location, { x: 0, y: 1, z: 0 }), from, to) < 1.4) {
                    hurt(e, 3.5 * st.diff.dmg, b);
                    try { e.setOnFire(2, true); } catch { }
                }
            }
        }
        await wait(st, 1);
    }
    const end2 = { x: aim.x, y: aim.y + 0.3, z: aim.z };
    explosion(dim, end2);
    playSound(dim, SND.HIT, end2, 1.4, 0.8);
    for (const e of targetsNear(dim, end2, 4)) { hurt(e, 8 * st.diff.dmg, b); knock(e, end2, 1.4, 0.5); }
    await wait(st, TIMING.beam * 0.15);
    end(st);
}

const ABILITIES = {
    fel_bolt: { phase: 1, cd: 50, min: 0, max: 45, w: 5, run: abFelBolt },
    volley: { phase: 1, cd: 130, min: 5, max: 45, w: 3, run: abVolley },
    summon: { phase: 1, cd: 700, min: 0, max: 60, w: 8, run: abSummon, cond: (st) => st.dragons.length < 3 },
    carrion: { phase: 1, cd: 170, min: 0, max: 14, w: 4, run: abCarrion },
    stomp: { phase: 1, cd: 190, min: 0, max: 6, w: 7, run: abStomp },
    knockback: { phase: 1, cd: 220, min: 0, max: 5, w: 6, run: abKnockback },
    unleash: { phase: 2, cd: 260, min: 0, max: 50, w: 5, run: abUnleash },
    vanish: { phase: 2, cd: 320, min: 8, max: 60, w: 4, run: abVanish },
    beam: { phase: 3, cd: 380, min: 6, max: 45, w: 6, run: abBeam },
};
export const ABILITY_NAMES = Object.keys(ABILITIES);

function chooseAbility(st, target, tick) {
    const d = dist(st.entity.location, target.location);
    const ok = Object.entries(ABILITIES).filter(([n, a]) =>
        st.phase >= a.phase && d >= a.min && d <= a.max && (st.cd[n] ?? 0) <= tick && (!a.cond || a.cond(st)));
    if (!ok.length) return undefined;
    const total = ok.reduce((s, [, a]) => s + a.w, 0);
    let r = Math.random() * total;
    for (const [n, a] of ok) { r -= a.w; if (r <= 0) return n; }
    return ok[0][0];
}

export function runAbility(st, name, target, ignoreBusy = false) {
    const ab = ABILITIES[name];
    if (!ab || (st.busy && !ignoreBusy) || st.dying) return false;
    st.busy = true;
    st.cd[name] = system.currentTick + Math.round(ab.cd * st.diff.cd);
    (async () => {
        try {
            await ab.run(st, target);
        } catch (e) {
            if (!(e && e.message === ABORT)) console.warn(`[kj] ${name}: ${e}`);
        } finally {
            st.busy = false;
            end(st);
            const phaseMul = st.phase >= 3 ? 0.7 : st.phase === 2 ? 0.85 : 1;
            st.nextAt = system.currentTick + Math.round(rand(26, 46) * st.diff.cd * phaseMul);
        }
    })();
    return true;
}

async function awaken(st) {
    const b = st.entity, dim = b.dimension;
    st.busy = true;
    try {
        setMode(b, "calm");
        setAction(b, "talk");
        freeze(b);
        playSound(dim, SND.AWAKEN, b.location, 1.6, 1);
        shake(dim, b.location, 40, 0.6, 2);
        column(dim, b.location, 8, 0.6, P.PILLAR);
        runeCircle(dim, b.location, "l");
        explosion(dim, add(b.location, { x: 0, y: 1.5, z: 0 }));
        const per = TIMING.talk / LINES.awaken.length;
        for (const line of LINES.awaken) {
            tell(dim, b.location, 60, line);
            await sleep(per);
            if (!isValid(b)) return;
        }
        setAction(b, "none");
        setMode(b, "combat");
        setPhase(st, 1);
        unfreeze(b);
        st.fightStart = system.currentTick;
    } finally {
        st.busy = false;
        st.nextAt = system.currentTick + 30;
    }
}

async function runIntermission(st, n) {
    const b = st.entity, dim = b.dimension;
    st.busy = true;
    st.rage = true;
    try {
        b.setDynamicProperty(n === 1 ? DYN.INTER1 : DYN.INTER2, true);
        setAction(b, "none");
        freeze(b);
        const c = b.getDynamicProperty(DYN.CENTER) ?? b.location;
        if (dist2D(b.location, c) > 1.5) {
            smoke(dim, b.location);
            b.teleport(c);
            smoke(dim, c);
        }
        setMode(b, "inter_enter");
        playSound(dim, SND.PHASE, c, 1.8, 1);
        title(dim, c, 60, "§5§lINTERMISSION", n === 1 ? "§7Los dragones se alzan" : "§7La Legión responde");
        tell(dim, c, 60, n === 1 ? LINES.inter1 : LINES.inter2);
        shake(dim, c, 60, 0.6, 2);
        runeCircle(dim, c, "l");
        explosion(dim, add(c, { x: 0, y: 1.5, z: 0 }));
        await sleep(TIMING.inter_enter);

        setMode(b, "inter_idle");
        await sleep(20);
        setMode(b, "inter_channel");
        await summonDragons(st);

        for (let t = 0; t < BOSS.interTicks; t++) {
            if (st.dying || !isValid(b)) return;
            const bc = b.location;
            if (t % 2 === 0) {
                aura(dim, bc, BOSS.height, BOSS.auraRadius * 1.3, P.GLOW, 6);
                aura(dim, bc, BOSS.height + 1, BOSS.auraRadius * 1.8, P.SOUL, 3);
            }
            if (t % 10 === 0) column(dim, { x: bc.x + rand(-6, 6), y: bc.y, z: bc.z + rand(-6, 6) }, 12, 0.7, P.GLOW);
            if (t % 30 === 0) { runeCircle(dim, bc, "m"); playSound(dim, SND.BEAM, bc, 0.9, 0.8); }
            if (t % 28 === 14) felRain(st, c);
            await sleep(1);
        }

        setMode(b, "inter_exit");
        playSound(dim, SND.WAVE, c, 1.8, 0.9);
        particle(dim, P.RING, { x: c.x, y: c.y + 0.2, z: c.z });
        explosion(dim, add(c, { x: 0, y: 1.5, z: 0 }));
        shake(dim, c, 40, 0.8, 1);
        for (const e of targetsNear(dim, c, 9)) { hurt(e, 6 * st.diff.dmg, b); knock(e, c, 2.6, 0.8); }
        await sleep(TIMING.inter_exit);

        setPhase(st, n + 1);
        setMode(b, "combat");
        st.rage = false;
        unfreeze(b);
    } finally {
        st.busy = false;
        st.nextAt = system.currentTick + 40;
    }
}

function felRain(st, center) {
    const b = st.entity, dim = b.dimension;
    const spots = playersNear(dim, center, BOSS.arenaRadius).map((p) => ({ ...p.location }));
    spots.push({ x: center.x + rand(-9, 9), y: center.y, z: center.z + rand(-9, 9) });
    for (const spot of spots.slice(0, 5)) {
        const s = { x: spot.x, y: spot.y + 0.05, z: spot.z };
        runeCircle(dim, s, "s");
        ring(dim, s, 2.6, 18, P.GLOW, 0.1);
        system.runTimeout(() => {
            if (!isValid(b)) return;
            column(dim, s, 9, 0.6, P.PILLAR);
            explosion(dim, { x: s.x, y: s.y + 0.5, z: s.z });
            playSound(dim, SND.HIT, s, 1.2, 0.9);
            for (const e of targetsNear(dim, s, 3.2)) { hurt(e, 10 * st.diff.dmg, b); knock(e, s, 1.2, 0.6); }
        }, 28);
    }
}

async function runDeath(st) {
    if (st.dying) return;
    st.dying = true;
    const b = st.entity, dim = b.dimension;
    try {
        setAction(b, "none");
        setMode(b, "dead");
        freeze(b);
        try { b.addEffect("resistance", 20000, { amplifier: 4, showParticles: false }); } catch { }
        clearDragons(st, true);
        clearProjectiles();
        const c = b.location;
        playSound(dim, SND.DEATH, c, 2, 1);
        tell(dim, c, 60, LINES.death);
        title(dim, c, 60, "§5§lKIL'JAEDEN", "§7cae derrotado...");
        for (let t = 0; t < TIMING.death; t++) {
            if (!isValid(b)) return;
            if (t % 3 === 0) {
                const p = { x: c.x + rand(-3.5, 3.5), y: c.y + rand(0.3, BOSS.height), z: c.z + rand(-3.5, 3.5) };
                explosion(dim, p);
                sphereBurst(dim, p, 6, 1, P.SPARK);
            }
            if (t % 12 === 0) { column(dim, c, 9, 0.6, P.PILLAR); shake(dim, c, 40, 0.5, 0.6); }
            await sleep(1);
        }
        finalDeath(st);
        if (isValid(b)) b.kill();
    } catch (e) {
        console.warn(`[kj] death: ${e}`);
    }
}

function finalDeath(st, loc, dim) {
    if (st.finalDone) return;
    st.finalDone = true;
    const b = st.entity;
    const l = loc ?? (isValid(b) ? b.location : undefined);
    const d = dim ?? (isValid(b) ? b.dimension : undefined);
    if (!l || !d) return;
    particle(d, P.DEATH, { x: l.x, y: l.y + 1.5, z: l.z });
    particle(d, P.RING, { x: l.x, y: l.y + 0.2, z: l.z });
    column(d, l, 14, 0.5, P.PILLAR);
    playSound(d, SND.HIT, l, 2, 0.6);
    shake(d, l, 60, 1, 1.5);
    clearDragons(st, true);
    const secs = st.fightStart ? (system.currentTick - st.fightStart) / 20 : 0;
    const r = recordVictory(st.diff.id, secs);
    tell(d, l, 80,
        `§5§l¡Kil'jaeden ha caído!§r\n§7Dificultad: §f${st.diff.name}  §7Tiempo: §f${fmtTime(secs)}` +
        `${r.isRecord ? "  §6¡NUEVO RÉCORD!" : `  §8(récord ${fmtTime(r.best)})`}\n§7Victorias totales en este mundo: §f${r.defeats}`);
}

function ambient(st, tick, mode) {
    if (tick % 3) return;
    const b = st.entity, dim = b.dimension, c = b.location;
    if (mode === "statue") { if (tick % 12 === 0) aura(dim, c, BOSS.height, BOSS.auraRadius * 0.8, P.GLOW, 2); return; }
    aura(dim, c, BOSS.height, BOSS.auraRadius, P.GLOW, 5);
    if (st.phase >= 2 && tick % 6 === 0) aura(dim, c, BOSS.height, BOSS.auraRadius * 1.2, P.SOUL, 3);
    if (st.phase >= 3 && tick % 9 === 0) aura(dim, c, BOSS.height, BOSS.auraRadius, P.FIRE_TRAIL, 4);
}

function updateBoss(st, tick) {
    const b = st.entity;
    const mode = getMode(b);
    ambient(st, tick, mode);

    if (mode === "statue") {
        if (st.ready && !st.busy && tick % 10 === 0 && playersNear(b.dimension, b.location, BOSS.awakenRange).length) awaken(st);
        return;
    }
    if (mode === "dead" || st.dying) return;

    tickDragons(st, tick);

    const hp = hpFrac(b);
    if (!st.dying && hp <= BOSS.deathAt && mode !== "calm") { runDeath(st); return; }
    if (st.busy) return;

    if (mode === "combat") {
        if (st.phase === 1 && hp <= BOSS.inter1 && !b.getDynamicProperty(DYN.INTER1)) { runIntermission(st, 1); return; }
        if (st.phase === 2 && hp <= BOSS.inter2 && !b.getDynamicProperty(DYN.INTER2)) { runIntermission(st, 2); return; }

        const target = nearestPlayer(b.dimension, b.location, BOSS.aggroRange);
        if (!target) {
            if (++st.idleTicks > BOSS.leashTicks) resetBoss(st);
            return;
        }
        st.idleTicks = 0;
        if (tick < st.nextAt) return;
        const name = chooseAbility(st, target, tick);
        if (name) runAbility(st, name, target);
        else st.nextAt = tick + 10;
    }
}

function resetBoss(st) {
    const b = st.entity;
    clearDragons(st, true);
    const c = b.getDynamicProperty(DYN.CENTER);
    if (c) { try { b.teleport(c); } catch { } }
    try { b.getComponent("minecraft:health").resetToMaxValue(); } catch { }
    b.setDynamicProperty(DYN.INTER1, false);
    b.setDynamicProperty(DYN.INTER2, false);
    setPhase(st, 0);
    setAction(b, "none");
    setMode(b, "statue");
    freeze(b);
    st.idleTicks = 0;
    st.cd = {};
    st.rage = false;
}

function tickAll() {
    const tick = system.currentTick;
    tickProjectiles();
    for (const [id, st] of bosses) {
        if (!isValid(st.entity)) { bosses.delete(id); continue; }
        try { updateBoss(st, tick); } catch (e) { console.warn(`[kj] tick: ${e}`); }
    }
    if (tick % 200 === 0) {
        const ids = new Set([...bosses.keys()]);
        for (const dimId of ["overworld", "nether", "the_end"]) {
            try { sweepOrphans(world.getDimension(dimId), ids); } catch { }
        }
    }
}

async function initFresh(st) {
    const b = st.entity;
    st.ready = false;
    b.setDynamicProperty(DYN.CENTER, b.location);
    b.setDynamicProperty(DYN.INTER1, false);
    b.setDynamicProperty(DYN.INTER2, false);
    freeze(b);
    const p = nearestPlayer(b.dimension, b.location, 32, true);
    const idx = p ? await askDifficulty(p) : 0;
    if (!isValid(b)) return;
    setDifficulty(st, idx);
    st.ready = true;
}

export function setDifficulty(st, idx) {
    const d = DIFFICULTIES[idx] ?? DIFFICULTIES[0];
    const b = st.entity;
    try { b.triggerEvent(d.event); } catch { }
    b.setDynamicProperty(DYN.DIFF, DIFFICULTIES.indexOf(d));
    st.diff = d;
    try { b.getComponent("minecraft:health").resetToMaxValue(); } catch { }
}

function onBossHurt(ev) {
    const b = ev.hurtEntity;
    const st = registerBoss(b);
    if (!st) return;
    const dim = b.dimension;
    particle(dim, P.SPARK, add(b.location, { x: rand(-2, 2), y: rand(1, BOSS.height), z: rand(-2, 2) }));

    const src = ev.damageSource?.damagingEntity;
    if (src && src.typeId === "minecraft:player") {
        try {
            src.onScreenDisplay.setActionBar(`§5Kil'jaeden §7${bar(hpFrac(b))} §f${Math.round(hpFrac(b) * 100)}%`);
        } catch { }
        const tick = system.currentTick;
        if (!st.busy && getMode(b) === "combat" && dist(src.location, b.location) < 7 && tick - st.lastKnockAt > 160) {
            st.lastKnockAt = tick;
            runAbility(st, "knockback", src);
        }
    }
}

function onEntityDie(ev) {
    const e = ev.deadEntity;
    try {
        if (e.typeId === ID.DRAGON) {
            onDragonDeath(e.id, e.location, e.dimension);
        } else if (e.typeId === ID.BOSS) {
            const st = bosses.get(e.id);
            if (st) finalDeath(st, e.location, e.dimension);
            bosses.delete(e.id);
        }
    } catch { }
}

export function initBoss() {
    for (const dimId of ["overworld", "nether", "the_end"]) {
        try {
            for (const e of world.getDimension(dimId).getEntities({ type: ID.BOSS })) registerBoss(e);
        } catch { }
    }

    world.afterEvents.entitySpawn.subscribe((ev) => {
        if (ev.entity.typeId !== ID.BOSS) return;
        const st = registerBoss(ev.entity);
        if (st && ev.cause === EntityInitializationCause.Spawned) initFresh(st);
    });
    world.afterEvents.entityLoad.subscribe((ev) => {
        if (ev.entity.typeId === ID.BOSS) registerBoss(ev.entity);
    });
    world.afterEvents.entityHurt.subscribe((ev) => {
        if (ev.hurtEntity.typeId === ID.BOSS) onBossHurt(ev);
        else if (ev.hurtEntity.typeId === ID.DRAGON) {
            particle(ev.hurtEntity.dimension, P.SPARK, add(ev.hurtEntity.location, { x: 0, y: 0.5, z: 0 }));
        }
    });
    world.afterEvents.entityDie.subscribe(onEntityDie);

    system.runInterval(tickAll, 1);
}