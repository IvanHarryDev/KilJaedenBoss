export const ID = Object.freeze({
    BOSS: "kj:kil_jaeden",
    DRAGON: "kj:mini_dragon",
});

export const PROP = Object.freeze({
    MODE: "kj:mode",
    ACTION: "kj:action",
    PHASE: "kj:phase",
});

export const DYN = Object.freeze({
    CENTER: "kj:center",
    DIFF: "kj:difficulty",
    INTER1: "kj:inter1_done",
    INTER2: "kj:inter2_done",
});

export const TIMING = Object.freeze({
    talk: 120,
    cast_spell: 24,
    cast_spell_2: 24,
    unleash_fel: 100,
    summon: 50,
    carrion: 38,
    beam: 50,
    stomp: 40,
    knockback: 38,
    vanish: 24,
    inter_enter: 17,
    inter_exit: 27,
    death: 129,
});

export const BOSS = Object.freeze({
    auraRadius: 3.4,
    castForward: 2.2,
    beamHeight: 6.7,
    beamForward: 1.3,
    height: 10.5,
    castHeight: 4.6,
    awakenRange: 20,
    aggroRange: 48,
    leashTicks: 400,
    interTicks: 200,
    inter1: 0.70,
    inter2: 0.40,
    deathAt: 0.04,
    arenaRadius: 28,
});

export const DRAGONS = Object.freeze({
    count: 5,
    orbitRadius: 8,
    orbitHeight: 7.5,
    orbitSpeed: 0.045,
    fireMin: 60,
    fireMax: 110,
    range: 34,
    damage: 6,
    projectileSpeed: 0.7,
});

export const DIFFICULTIES = Object.freeze([
    { id: "normal", name: "Normal", event: "kj:set_normal", dmg: 1.0, cd: 1.0 },
    { id: "heroic", name: "Heroica", event: "kj:set_heroic", dmg: 1.5, cd: 0.8 },
    { id: "mythic", name: "Mítica", event: "kj:set_mythic", dmg: 2.2, cd: 0.6 },
]);

// IDs (RP/sounds/sound_definitions.json)
export const SND = Object.freeze({
    AWAKEN: "kj.boss.awaken",
    CAST: "kj.boss.cast",
    HIT: "kj.boss.bolt_hit",
    SUMMON: "kj.boss.summon",
    WAVE: "kj.boss.fel_wave",
    STOMP: "kj.boss.stomp",
    BEAM: "kj.boss.beam",
    VANISH: "kj.boss.vanish",
    PHASE: "kj.boss.phase",
    DEATH: "kj.boss.death",
    DRAGON_FIRE: "kj.dragon.fire",
    DRAGON_SPAWN: "kj.dragon.spawn",
});

export const LINES = Object.freeze({
    awaken: [
        "§5§lKil'jaeden§r§7: ¿Quién osa despertarme?",
        "§5§lKil'jaeden§r§7: Este mundo arderá como tantos otros.",
    ],
    inter1: "§5§lKil'jaeden§r§7: ¡Sentid cómo se desvanece vuestra esperanza!",
    inter2: "§5§lKil'jaeden§r§7: ¡La Legión no puede ser detenida!",
    death: "§5§lKil'jaeden§r§7: Esto... no... es el final...",
});