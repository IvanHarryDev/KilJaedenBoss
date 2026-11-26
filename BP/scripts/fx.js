import { particle, rand, TAU } from "./util.js";

// IDs (RP/particles/*.json)
export const P = Object.freeze({
    GLOW: "kj:fel_glow",
    BOLT: "kj:fel_bolt_core",
    TRAIL: "kj:fel_bolt_trail",
    EXPLO: "kj:fel_explosion",
    FLASH: "kj:fel_flash",
    RING: "kj:fel_ring",
    PILLAR: "kj:fel_pillar",
    SOUL: "kj:soul_wisp",
    FIRE_CORE: "kj:fire_core",
    FIRE_TRAIL: "kj:fire_trail",
    FIRE_EXPLO: "kj:fire_explosion",
    SMOKE: "kj:smoke_puff",
    BEAM: "kj:beam_point",
    SPARK: "kj:spark",
    DEATH: "kj:death_burst",
    RUNE_S: "kj:rune_circle_s",
    RUNE_M: "kj:rune_circle_m",
    RUNE_L: "kj:rune_circle_l",
});

export function aura(dim, base, height, radius, name = P.GLOW, count = 2) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const r = rand(0.2, radius);
        particle(dim, name, { x: base.x + Math.cos(a) * r, y: base.y + rand(0.1, height), z: base.z + Math.sin(a) * r });
    }
}

export function ring(dim, center, radius, points, name = P.GLOW, y = 0.15) {
    const off = rand(0, TAU);
    for (let i = 0; i < points; i++) {
        const a = off + (i / points) * TAU;
        particle(dim, name, { x: center.x + Math.cos(a) * radius, y: center.y + y, z: center.z + Math.sin(a) * radius });
    }
}

export function line(dim, a, b, step = 0.9, name = P.BEAM) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const n = Math.max(1, Math.floor(Math.hypot(dx, dy, dz) / step));
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        particle(dim, name, { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t });
    }
}

export function column(dim, base, height, step = 0.8, name = P.GLOW) {
    for (let y = 0; y <= height; y += step) particle(dim, name, { x: base.x, y: base.y + y, z: base.z });
}

export function sphereBurst(dim, c, n, r, name = P.GLOW) {
    for (let i = 0; i < n; i++) {
        const u = rand(-1, 1), a = rand(0, TAU), s = Math.sqrt(1 - u * u);
        particle(dim, name, { x: c.x + r * s * Math.cos(a), y: c.y + r * u, z: c.z + r * s * Math.sin(a) });
    }
}

export function explosion(dim, loc, kind = "fel") {
    if (kind === "fire") {
        particle(dim, P.FIRE_EXPLO, loc);
        particle(dim, P.FLASH, loc);
    } else {
        particle(dim, P.EXPLO, loc);
        particle(dim, P.FLASH, loc);
    }
}

export function runeCircle(dim, loc, size = "m") {
    const id = size === "s" ? P.RUNE_S : size === "l" ? P.RUNE_L : P.RUNE_M;
    particle(dim, id, { x: loc.x, y: loc.y + 0.06, z: loc.z });
}

export function smoke(dim, loc) {
    particle(dim, P.SMOKE, { x: loc.x, y: loc.y + 1, z: loc.z });
    particle(dim, P.SMOKE, { x: loc.x, y: loc.y + 2, z: loc.z });
}