import {
    Episode, GAMMA, NUCLEON_SLOTS, POSITRON, RECAPTURE, Sequence, WHITE,
    across, logMix, mix, packed, randomDirection, randomStream, smooth, tracksUniforms, unit, wavesUniforms,
} from './common.js';

const ORBITALS = ['1s', '2p', '3d', '4f'];
const EXTENT = [8, 20, 38, 62];
const DISTANCE = [13, 30, 52, 80];
const LINES = [
    {wavelength: 0.03, color: [0.62, 0.35, 1.0]},
    {wavelength: 0.055, color: [1.0, 0.16, 0.1]},
    {wavelength: 0.085, color: [0.75, 0.12, 0.06]},
];
const IONIZING = {wavelength: 0.022, color: [0.75, 0.6, 1.0]};
const DIPOLE_AXES = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
const CIRCULAR_AXIS = [0, 0, 1];
const TRAVEL = 2.5;
const MIX = 3;
const FAST_MIX = 1.4;
const HOLD = 6;
const SHORT_HOLD = 2.5;
const LEFTOVER = 0.1;
const SLOSH_RATE = 2 * Math.PI * 0.9;
const ORBIT_RATE = 2 * Math.PI * 0.45;
const RABI_RATE = 2 * Math.PI / 3.4;
const SNAP = 0.3;
const BALLOON = 1.2;
const BARE = 2.8;
const CAPTURE = 2.2;
const EPISODES = ['ladder', 'ionize', 'ladder', 'laser', 'ladder', 'positron'];

class HydrogenEpisode extends Episode {
    constructor(random) {
        super();
        this.random = random;
        this.segments = [];
    }

    segment(duration, spec) {
        this.segments.push({start: this.duration, end: this.duration + duration, ...spec});
        this.duration += duration;
    }

    hold(level, kind, duration, leftover = LEFTOVER) {
        const partner = level > 0 ? level - 1 : 1;
        this.segment(duration, {
            a: level, b: partner, kind,
            weight: x => leftover * smooth(0, 1, x) * (1 - smooth(duration - 1, duration, x)),
            rate: kind ? ORBIT_RATE : SLOSH_RATE,
        });
    }

    photon(start, mode, low, kind) {
        const direction = randomDirection(this.random);
        const line = LINES[low];
        this.track({start, duration: TRAVEL, mode, direction, line, axis: kind ? null : DIPOLE_AXES[low]});
    }

    waveFor(at, low, kind, color, strength = 1) {
        this.wave(at, color, kind ? CIRCULAR_AXIS : DIPOLE_AXES[low], kind ? 'circular' : 'linear', strength);
    }

    absorb(from, kind) {
        const to = from + 1;
        const line = LINES[from];
        const start = this.duration;
        this.photon(start, 'in', from, kind);
        this.waveFor(start + TRAVEL, from, kind, line.color, 0.8);
        this.segment(TRAVEL + MIX, {
            a: from, b: to, kind,
            weight: x => smooth(TRAVEL - 0.6, TRAVEL + MIX, x),
            rate: kind ? ORBIT_RATE : SLOSH_RATE,
        });
    }

    emit(from, kind, duration = MIX) {
        const to = from - 1;
        const line = LINES[to];
        const at = this.duration + duration * 0.45;
        this.photon(at, 'out', to, kind);
        this.waveFor(at, to, kind, line.color);
        this.segment(duration, {
            a: from, b: to, kind,
            weight: x => smooth(0, duration, x),
            rate: kind ? ORBIT_RATE : SLOSH_RATE,
        });
    }

    bare(duration, level = 0, flicker = true) {
        this.segment(duration, {
            a: level, b: level, kind: 0, weight: () => 0, rate: 0, amp: () => 0,
            star: x => 1 + (flicker ? (0.1 + 0.35 * Math.sin(x * 11) * Math.sin(x * 3.7)) * smooth(0, 0.3, x) * (1 - smooth(duration - 0.3, duration, x)) : 0),
        });
    }

    recapture(kind) {
        const level = 2 + Math.floor(this.random() * 2);
        const start = this.duration;
        this.track({start, duration: CAPTURE, mode: 'in', direction: randomDirection(this.random), brightness: () => 0.8});
        this.bare(CAPTURE, level, false);
        const landing = this.duration;
        this.flash(landing, 0.6);
        this.track({start: landing, duration: TRAVEL, mode: 'out', direction: randomDirection(this.random), line: RECAPTURE});
        this.wave(landing, RECAPTURE.color, [0, 1, 0], 'isotropic', 0.6);
        this.segment(1.2, {a: level, b: level, kind, weight: () => 0, rate: 0, amp: x => smooth(0, 0.6, x)});
        for (let from = level; from > 0; from--) {
            this.emit(from, kind, FAST_MIX);
            if (from > 1)
                this.hold(from - 1, kind, 0.7, 0);
        }
        this.hold(0, kind, SHORT_HOLD);
    }
}

function ladder(random) {
    const episode = new HydrogenEpisode(random);
    const kind = random() < 0.5 ? 1 : 0;
    const top = 1 + Math.floor(random() * 3);
    episode.hold(0, kind, HOLD);
    for (let level = 0; level < top; level++) {
        episode.absorb(level, kind);
        episode.hold(level + 1, kind, level + 1 === top ? HOLD : SHORT_HOLD + 1.5);
    }
    for (let level = top; level > 0; level--) {
        episode.emit(level, kind);
        episode.hold(level - 1, kind, SHORT_HOLD);
    }
    return episode;
}

function ionize(random) {
    const episode = new HydrogenEpisode(random);
    const kind = random() < 0.5 ? 1 : 0;
    const direction = randomDirection(random);
    episode.hold(0, kind, 3);
    episode.track({start: episode.duration, duration: 2, mode: 'in', direction, line: IONIZING});
    episode.segment(2, {a: 0, b: 1, kind, weight: () => 0, rate: 0});
    const hit = episode.duration;
    episode.track({start: hit, duration: 1.8, mode: 'out', direction: across(randomDirection(random), direction)});
    episode.wave(hit, IONIZING.color, [0, 1, 0], 'isotropic', 1.2);
    episode.flash(hit, 0.8);
    episode.segment(BALLOON, {
        a: 0, b: 0, kind, weight: () => 0, rate: 0,
        amp: x => 1 - smooth(0, BALLOON, x), scale: x => 1 + 1.6 * smooth(0, BALLOON, x),
    });
    episode.bare(BARE);
    episode.recapture(kind);
    return episode;
}

function laser(random) {
    const episode = new HydrogenEpisode(random);
    const beam = unit([1, 0.12, random() < 0.5 ? 0.3 : -0.3]);
    const half = 3 * Math.PI / RABI_RATE;
    const jumps = [half, 2 * half];
    const duration = 2 * half + 4 * Math.PI / RABI_RATE;
    episode.hold(0, 0, 2);
    const start = episode.duration;
    episode.track({
        start: start - 1, duration: duration + 2, mode: 'through', direction: beam, axis: DIPOLE_AXES[0], line: LINES[0],
        brightness: x => 0.45 * smooth(0, 1, x) * (1 - smooth(duration + 1, duration + 2, x)),
    });
    for (const jump of jumps) {
        episode.photon(start + jump, 'out', 0, 0);
        episode.waveFor(start + jump, 0, 0, LINES[0].color);
    }
    episode.segment(duration, {
        a: 0, b: 1, kind: 0, rate: SLOSH_RATE * 1.3,
        weight: x => {
            const last = jumps.filter(jump => jump <= x).pop() ?? 0;
            const raw = Math.sin(RABI_RATE * (x - last) / 2) ** 2;
            return last > 0 && x - last < SNAP ? mix(1, raw, smooth(0, SNAP, x - last)) : raw;
        },
    });
    episode.hold(0, 0, 2.5);
    return episode;
}

function positron(random) {
    const episode = new HydrogenEpisode(random);
    const kind = random() < 0.5 ? 1 : 0;
    episode.hold(0, kind, 3);
    const start = episode.duration;
    episode.track({start, duration: 3.2, mode: 'spiral', angle: random() * Math.PI * 2, line: POSITRON});
    episode.hold(0, kind, 3.2, 0);
    const hit = episode.duration;
    const direction = randomDirection(random);
    episode.track({start: hit, duration: 1.3, mode: 'out', direction, line: GAMMA});
    episode.track({start: hit, duration: 1.3, mode: 'out', direction: direction.map(v => -v), line: GAMMA});
    episode.wave(hit, WHITE, [0, 1, 0], 'isotropic', 1.6);
    episode.flash(hit, 2.5);
    episode.segment(0.35, {a: 0, b: 0, kind, weight: () => 0, rate: 0, amp: x => 1 - smooth(0, 0.35, x)});
    episode.bare(2.2);
    episode.recapture(kind);
    return episode;
}

const BUILDERS = {ladder, ionize, laser, positron};

export class HydrogenScene {
    constructor(options) {
        this.features = ['ELECTRONS', 'HYDROGEN', 'NUCLEUS', ...options.events ? ['TRACKS', 'WAVES'] : []];
        this._events = options.events;
        this._orbital = Math.max(ORBITALS.indexOf(options.orbital), 0);
        this._time = 0;
        this._phase = 0;
        this._sequence = new Sequence(index => {
            const random = randomStream(index * 7919 + 17);
            return BUILDERS[EPISODES[index % EPISODES.length]](random);
        });
    }

    settle() {
        this._still = true;
    }

    advance(dt) {
        if (dt > 0)
            this._still = false;
        this._time += dt;
        const rate = this._events ? this._segment().segment.rate : 0;
        this._phase = (this._phase + dt * rate) % (Math.PI * 2);
    }

    _segment() {
        const {episode, local} = this._sequence.at(this._time);
        const segment = episode.segments.find(candidate => local < candidate.end) ?? episode.segments.at(-1);
        return {episode, local, segment, x: local - segment.start};
    }

    state(view = {}) {
        if (!this._events)
            return this._pack({a: this._orbital, b: this._orbital, kind: 0, weight: 0, amp: 1, scale: 1, star: 1}, [], [], view);
        if (this._still)
            return this._pack({a: 0, b: 0, kind: 0, weight: 0, amp: 1, scale: 1, star: 1}, [], [], view);

        const {episode, local, segment, x} = this._segment();
        const orbital = {
            a: segment.a, b: segment.b, kind: segment.kind,
            weight: segment.weight(x),
            amp: segment.amp ? segment.amp(x) : 1,
            scale: segment.scale ? segment.scale(x) : 1,
            star: (segment.star ? segment.star(x) : 1) + episode.flashAt(local),
        };
        const distance = this._distance(orbital);
        return this._pack(orbital, episode.tracksAt(local, distance, view.turn), episode.wavesAt(local, distance), view);
    }

    _distance({a, b, weight}) {
        return logMix(DISTANCE[a], DISTANCE[b], smooth(0, 1, weight));
    }

    _pack(orbital, tracks, waves, view) {
        const {a, b, kind, weight, amp, scale, star} = orbital;
        const distance = this._distance(orbital);
        const extent = Math.max(EXTENT[a], EXTENT[b]) * scale;
        const size = logMix(EXTENT[a], EXTENT[b], smooth(0, 1, weight)) * scale;
        const radius = (view.distance || distance) * 0.012;
        return {
            distance,
            uniforms: {
                u_orbital: [4, [a, b, weight, this._phase]],
                u_orbital_kind: [4, [kind, kind, amp, scale]],
                u_extent: [1, [extent]],
                u_cloud_size: [1, [size]],
                u_nucleus: [4, [1, radius, radius, star]],
                u_nucleons: [4, packed([[0, 0, 0, 1]], NUCLEON_SLOTS, 4)],
                ...tracksUniforms(tracks),
                ...wavesUniforms(waves),
            },
        };
    }
}
