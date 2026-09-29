export const NUCLEON_SLOTS = 20;
export const TRACK_SLOTS = 4;
export const WAVE_SLOTS = 2;
export const PHOTON_REACH = 0.9;
export const PACKET_WAVES = 6;
export const NUCLEON_RADIUS = 0.85;

const WAVE_LIFE = 3.2;
const WAVE_SPEED = 0.42;
const WAVE_FADE = 1.1;
const SPIRAL_TURNS = 5.5;
const SPIRAL_TAIL = 0.07;
const PATTERNS = {linear: 0, circular: 1, isotropic: 2};

export const ELECTRON = {wavelength: 0, color: [0.55, 0.85, 1.0]};
export const POSITRON = {wavelength: 0, color: [1.0, 0.35, 0.72], width: 0.013};
export const GAMMA = {wavelength: 0.012, color: [0.7, 1.0, 0.75]};
export const XRAY = {wavelength: 0.018, color: [0.7, 0.85, 1.0]};
export const RECAPTURE = {wavelength: 0.04, color: [0.6, 0.4, 1.0]};
export const WHITE = [1.0, 0.95, 0.9];

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const scaled = (a, s) => a.map(v => v * s);
export const lerp = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
export const length = a => Math.hypot(...a);
export const unit = a => scaled(a, 1 / length(a));
export const logMix = (a, b, t) => Math.exp(mix(Math.log(a), Math.log(b), t));

export function randomStream(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function rotation(axis, angle) {
    const [x, y, z] = unit(axis);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    return v => [
        (t * x * x + c) * v[0] + (t * x * y - s * z) * v[1] + (t * x * z + s * y) * v[2],
        (t * x * y + s * z) * v[0] + (t * y * y + c) * v[1] + (t * y * z - s * x) * v[2],
        (t * x * z - s * y) * v[0] + (t * y * z + s * x) * v[1] + (t * z * z + c) * v[2],
    ];
}

export function turnedBy(turn) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return v => [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
}

export function across(direction, axis) {
    const along = direction.reduce((sum, v, i) => sum + v * axis[i], 0);
    const flat = sub(direction, scaled(axis, along));
    return length(flat) > 1e-3 ? unit(flat) : unit([axis[1] - axis[2], axis[2] - axis[0], axis[0] - axis[1]]);
}

export function randomDirection(random, flatten = 1) {
    const angle = random() * Math.PI * 2;
    const height = (random() * 2 - 1) * 0.6 * flatten;
    return unit([Math.cos(angle), height, Math.sin(angle) * 0.6]);
}

export function packed(values, slots, size) {
    const out = new Array(slots * size).fill(0);
    values.slice(0, slots).forEach((value, index) => value.forEach((v, i) => {
        out[index * size + i] = v;
    }));
    return out;
}

export function inbound(direction, reach, progress, packet, target = [0, 0, 0]) {
    const travel = reach * progress;
    const tailDistance = Math.min(Math.max(travel - packet, 0), reach);
    return {
        head: add(target, scaled(direction, Math.min(travel, reach) - reach)),
        tail: add(target, scaled(direction, tailDistance - reach)),
        seen: travel > 0 && tailDistance < reach,
    };
}

export function outbound(direction, reach, travel, packet, origin = [0, 0, 0]) {
    return {
        head: add(origin, scaled(direction, Math.min(travel, reach))),
        tail: add(origin, scaled(direction, clamp(travel - packet, 0, reach))),
        seen: travel > 0 && travel - packet < reach,
    };
}

export function photon(line, distance, ends, brightness = 1) {
    return {
        ...ends, wavelength: line.wavelength * distance, color: line.color,
        width: distance * 0.016, brightness: ends.seen ? brightness * 1.5 : 0,
    };
}

export function electronTrack(ends, distance, brightness = 1, particle = ELECTRON) {
    return {...ends, wavelength: 0, color: particle.color, width: distance * (particle.width ?? 0.008), brightness: ends.seen ? brightness : 0};
}

export function tracksUniforms(tracks) {
    return {
        u_tracks_a: [4, packed(tracks.map(t => [...t.tail, t.wavelength]), TRACK_SLOTS, 4)],
        u_tracks_b: [4, packed(tracks.map(t => [...t.head, t.brightness]), TRACK_SLOTS, 4)],
        u_track_colors: [4, packed(tracks.map(t => [...t.color, t.width]), TRACK_SLOTS, 4)],
    };
}

export function wavesUniforms(waves) {
    return {
        u_waves: [4, packed(waves.map(w => [w.radius, w.width, w.strength, w.pattern]), WAVE_SLOTS, 4)],
        u_wave_axes: [3, packed(waves.map(w => w.axis), WAVE_SLOTS, 3)],
        u_wave_colors: [3, packed(waves.map(w => w.color), WAVE_SLOTS, 3)],
    };
}

function spiralPoint(spec, reach, u) {
    const radius = reach * 0.8 * Math.pow(Math.max(1 - u, 0), 0.8);
    const angle = spec.angle + SPIRAL_TURNS * u;
    return [radius * Math.cos(angle), radius * Math.sin(angle) * 0.35, radius * Math.sin(angle) * 0.6];
}

export class Episode {
    constructor() {
        this.duration = 0;
        this.tracks = [];
        this.waves = [];
        this.flashes = [];
    }

    track(spec) {
        this.tracks.push(spec);
    }

    wave(at, color, axis = [0, 1, 0], pattern = 'isotropic', strength = 1) {
        this.waves.push({at, color, axis, pattern: PATTERNS[pattern], strength});
    }

    flash(at, strength) {
        this.flashes.push({at, strength});
    }

    flashAt(t) {
        return this.flashes.reduce((sum, {at, strength}) => sum + (t >= at ? strength * Math.exp(-(t - at) * 4) : 0), 0);
    }

    tracksAt(t, distance, turn = 0) {
        const reach = distance * PHOTON_REACH;
        const frame = turnedBy(turn);
        return this.tracks.map(spec => {
            const local = t - spec.start;
            if (local < 0 || local > spec.duration * 2 + 1)
                return null;
            spec.frame ??= frame;
            const direction = spec.direction && (spec.axis ? across(spec.frame(spec.direction), spec.axis) : spec.frame(spec.direction));
            const line = spec.line ?? ELECTRON;
            const packet = spec.packet ?? (line.wavelength > 0 ? line.wavelength * distance * PACKET_WAVES : reach * 0.4);
            const progress = local / spec.duration;
            let ends;
            if (spec.mode === 'in')
                ends = inbound(direction, reach, progress * (1 + packet / reach), packet);
            else if (spec.mode === 'out')
                ends = outbound(direction, reach, progress * reach, packet);
            else if (spec.mode === 'through')
                ends = {head: scaled(direction, reach * 1.6), tail: scaled(direction, -reach * 1.6), seen: progress <= 1};
            else
                ends = {head: spec.frame(spiralPoint(spec, reach, progress)), tail: spec.frame(spiralPoint(spec, reach, progress - SPIRAL_TAIL)), seen: progress <= 1};
            const brightness = spec.brightness ? spec.brightness(local) : 1;
            return line.wavelength > 0
                ? photon(line, distance, ends, brightness)
                : electronTrack(ends, distance, brightness, line);
        }).filter(track => track && track.brightness > 0).slice(0, TRACK_SLOTS);
    }

    wavesAt(t, distance) {
        return this.waves
            .filter(({at}) => t >= at && t - at < WAVE_LIFE)
            .sort((a, b) => b.at - a.at)
            .slice(0, WAVE_SLOTS)
            .map(({at, color, axis, pattern, strength}) => ({
                radius: (t - at) * WAVE_SPEED * distance,
                width: distance * 0.022,
                strength: strength * Math.exp(-(t - at) / WAVE_FADE) * smooth(0, 0.15, t - at),
                pattern, axis, color,
            }));
    }
}

export class Sequence {
    constructor(build) {
        this._build = build;
        this._index = 0;
        this._start = 0;
        this._episode = build(0);
    }

    at(time) {
        while (time - this._start >= this._episode.duration) {
            this._start += this._episode.duration;
            this._index++;
            this._episode = this._build(this._index);
        }
        return {episode: this._episode, local: time - this._start};
    }
}
