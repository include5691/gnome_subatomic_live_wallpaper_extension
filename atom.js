import {
    ELECTRON, Episode, GAMMA, NUCLEON_RADIUS, NUCLEON_SLOTS, POSITRON, RECAPTURE, Sequence, WHITE, XRAY,
    across, add, logMix, packed, randomDirection, randomStream, rotation, scaled, smooth, sub, tracksUniforms, unit, wavesUniforms,
} from './common.js';

const ELEMENTS = {
    helium: {z: 2, a: 4, s: 0, p: [0, 0, 0]},
    carbon: {z: 6, a: 12, s: 2, p: [1, 1, 0]},
    oxygen: {z: 8, a: 16, s: 2, p: [2, 1, 1]},
    neon: {z: 10, a: 20, s: 2, p: [2, 2, 2]},
};
const VIEW = 9.5;
const EXTENT = 5.5;
const NUCLEUS_SIZE = 0.2;
const DIVE_VIEW = 4.2;
const FERMI_JITTER = 0.12;
const ALPHA_RADIUS = 0.95;
const TUMBLE_AXIS = [0.3, 1, 0.15];
const TUMBLE_RATE = 0.2;
const CLUSTER_SPIN = 0.5;
const PION_PERIOD = 0.4;
const PION_TIME = 0.35;
const PION_RANGE = 2.4;
const ALPHA_CENTERS = {
    1: [[0, 0, 0]],
    3: [0, 1, 2].map(i => [1.55 * Math.cos(i * 2.094), 0, 1.55 * Math.sin(i * 2.094)]),
    4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => scaled(unit(v), 1.65)),
    5: [...[0, 1, 2].map(i => [1.55 * Math.cos(i * 2.094), 0, 1.55 * Math.sin(i * 2.094)]), [0, 2.0, 0], [0, -2.0, 0]],
};
const TETRAHEDRON = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => scaled(unit(v), ALPHA_RADIUS));
const KEYS = ['k', 's', 'p0', 'p1', 'p2'];

function alphaNucleus(count, random) {
    const centers = ALPHA_CENTERS[count / 4] ?? ALPHA_CENTERS[1];
    const nucleons = centers.flatMap((center, cluster) => {
        const orient = rotation(randomDirection(random), random() * Math.PI * 2);
        return TETRAHEDRON.map((vertex, index) => ({
            cluster, center, offset: orient(vertex), proton: index < 2,
            phase: [random(), random(), random()].map(v => v * Math.PI * 2),
            rate: [random(), random(), random()].map(v => 1.5 + v * 1.5),
        }));
    });
    const rest = nucleons.map(({center, offset}) => add(center, offset));
    const pairs = [];
    rest.forEach((a, i) => rest.forEach((b, j) => {
        const across = nucleons[i].cluster !== nucleons[j].cluster || centers.length === 1;
        if (j > i && across && Math.hypot(...sub(a, b)) < PION_RANGE)
            pairs.push([i, j]);
    }));
    const radius = Math.max(...rest.map(p => Math.hypot(...p))) + NUCLEON_RADIUS;
    return {nucleons, pairs, radius, spins: centers.map(() => randomDirection(random))};
}

function slater(z, {k, s, p0, p1, p2}) {
    const outer = s + p0 + p1 + p2;
    return [z - 0.3 * Math.max(k - 1, 0), Math.max((z - 0.85 * k - 0.35 * Math.max(outer - 1, 0)) / 2, 0.3)];
}

class AtomEpisode extends Episode {
    constructor(random, element) {
        super();
        this.random = random;
        this.base = {k: 2, s: element.s, p0: element.p[0], p1: element.p[1], p2: element.p[2]};
        this.counts = {...this.base};
        this.changes = [];
        this.dives = [];
    }

    wait(duration) {
        this.duration += duration;
    }

    change(at, key, delta, ramp = 0.35) {
        this.changes.push({at, key, delta, ramp});
        this.counts[key] += delta;
    }

    outer() {
        for (const shell of [['p0', 'p1', 'p2'], ['s']]) {
            const filled = shell.filter(key => this.counts[key] > 0);
            if (filled.length)
                return filled.reduce((best, key) => (this.counts[key] > this.counts[best] ? key : best));
        }
        return 'k';
    }

    electronOut(at, direction = randomDirection(this.random), particle = ELECTRON) {
        this.track({start: at, duration: 1.6, mode: 'out', direction, line: particle});
    }

    xray(branch) {
        const direction = randomDirection(this.random);
        this.track({start: this.duration, duration: 2, mode: 'in', direction, line: XRAY});
        this.wait(2);
        const hit = this.duration;
        this.change(hit, 'k', -1);
        this.electronOut(hit, across(randomDirection(this.random), direction));
        this.flash(hit, 0.8);
        this.wave(hit, XRAY.color, [0, 1, 0], 'isotropic', 1.1);
        this.dives.push({at: hit + 0.2, duration: 3.6});
        let last = hit + 1.6;
        if (this.base.s === 0) {
            this.wait(last - hit);
            return;
        }
        if (branch === 'auger' && this.counts.s + this.counts.p0 + this.counts.p1 + this.counts.p2 >= 4 && this.random() < 0.4) {
            this.change(hit + 0.4, this.outer(), -1);
            this.electronOut(hit + 0.4);
        }
        const fill = hit + (branch === 'auger' ? 2.2 : 1.3);
        this.change(fill, 'k', 1);
        this.change(fill, this.outer(), -1);
        if (branch === 'auger') {
            this.change(fill, this.outer(), -1);
            this.electronOut(fill);
            this.flash(fill, 0.4);
            this.wave(fill, ELECTRON.color, [0, 1, 0], 'isotropic', 0.6);
            last = fill + 1.6;
        } else {
            this.track({start: fill, duration: 2.2, mode: 'out', direction: randomDirection(this.random), line: XRAY});
            this.wave(fill, XRAY.color, [0, 1, 0], 'isotropic', 0.8);
            last = fill + 2.2;
        }
        this.wait(last - hit);
    }

    positron() {
        this.track({start: this.duration, duration: 3.2, mode: 'spiral', angle: this.random() * Math.PI * 2, line: POSITRON});
        this.wait(3.2);
        const hit = this.duration;
        const direction = randomDirection(this.random);
        this.change(hit, this.outer(), -1, 0.25);
        this.track({start: hit, duration: 1.3, mode: 'out', direction, line: GAMMA});
        this.track({start: hit, duration: 1.3, mode: 'out', direction: scaled(direction, -1), line: GAMMA});
        this.flash(hit, 2);
        this.wave(hit, WHITE, [0, 1, 0], 'isotropic', 1.5);
        this.wait(1.6);
    }

    recaptureAll() {
        const holes = KEYS.flatMap(key => Array(Math.max(this.base[key] - this.counts[key], 0)).fill(key));
        for (const key of holes) {
            this.track({start: this.duration, duration: 2, mode: 'in', direction: randomDirection(this.random), brightness: () => 0.8});
            this.wait(2);
            const at = this.duration;
            this.change(at, key, 1, 0.5);
            this.flash(at, 0.3);
            this.track({start: at, duration: 2.2, mode: 'out', direction: randomDirection(this.random), line: RECAPTURE});
            this.wave(at, RECAPTURE.color, [0, 1, 0], 'isotropic', 0.6);
            this.wait(1.4);
        }
    }

    occupancy(t) {
        const occupancy = {...this.base};
        for (const {at, key, delta, ramp} of this.changes)
            occupancy[key] += delta * smooth(at, at + ramp, t);
        return occupancy;
    }

    diveAt(t) {
        return this.dives.reduce((most, {at, duration}) =>
            Math.max(most, smooth(at, at + 1, t) * (1 - smooth(at + duration - 1.2, at + duration, t))), 0);
    }
}

function build(random, element) {
    const episode = new AtomEpisode(random, element);
    episode.wait(5.5 + random() * 3);
    const roll = random();
    if (element.s === 0)
        roll < 0.6 ? episode.xray('photo') : episode.positron();
    else if (roll < 0.5)
        episode.xray('auger');
    else if (roll < 0.7)
        episode.xray('kalpha');
    else
        episode.positron();
    episode.wait(2.5);
    episode.recaptureAll();
    episode.wait(2);
    return episode;
}

export class AtomScene {
    constructor(options) {
        this.features = ['ELECTRONS', 'ATOM', 'NUCLEUS', ...options.events ? ['TRACKS', 'WAVES'] : []];
        this._events = options.events;
        this._element = ELEMENTS[options.element] ?? ELEMENTS.carbon;
        const {z, a} = this._element;
        const [p0, p1, p2] = this._element.p;
        const neutral = slater(z, {k: 2, s: this._element.s, p0, p1, p2});
        this._outer = this._element.s > 0 ? 2 / neutral[1] : 1 / neutral[0];
        this._distance = this._outer * VIEW;
        this._nucleus = alphaNucleus(a, randomStream(z * 7919 + a));
        this._radius = this._outer * NUCLEUS_SIZE * Math.cbrt(a / 4);
        this._time = 0;
        this._sequence = new Sequence(index => build(randomStream(index * 104729 + z), this._element));
    }

    settle() {
        this._still = true;
    }

    advance(dt) {
        if (dt > 0)
            this._still = false;
        this._time += dt;
    }

    state(view = {}) {
        const {z, a} = this._element;
        let occupancy = {k: 2, s: this._element.s, p0: this._element.p[0], p1: this._element.p[1], p2: this._element.p[2]};
        let tracks = [];
        let waves = [];
        let flash = 0;
        let dive = 0;
        if (this._events && !this._still) {
            const {episode, local} = this._sequence.at(this._time);
            occupancy = episode.occupancy(local);
            dive = episode.diveAt(local);
            flash = episode.flashAt(local);
            const size = logMix(this._distance, this._radius * DIVE_VIEW, dive);
            tracks = episode.tracksAt(local, size, view.turn);
            waves = episode.wavesAt(local, size);
        }
        const [zeta1, zeta2] = slater(z, occupancy);
        const scale = this._radius / this._nucleus.radius;
        return {
            distance: logMix(this._distance, this._radius * DIVE_VIEW, dive),
            glow: 1 - dive,
            uniforms: {
                u_extent: [1, [this._outer * EXTENT]],
                u_cloud_size: [1, [this._outer * EXTENT]],
                u_shells: [4, [zeta1, zeta2, occupancy.k, occupancy.s]],
                u_p: [3, [occupancy.p0, occupancy.p1, occupancy.p2]],
                u_nucleus: [4, [a, NUCLEON_RADIUS * scale * 1.05, this._radius + NUCLEON_RADIUS * scale * 1.5, (1 + flash * 4) * (1 - 0.8 * dive)]],
                u_nucleons: [4, packed(this._nucleons(scale), NUCLEON_SLOTS, 4)],
                ...tracksUniforms(tracks),
                ...wavesUniforms(waves),
            },
        };
    }

    _nucleons(scale) {
        const time = this._time;
        const {nucleons, pairs, spins} = this._nucleus;
        const tumble = rotation(TUMBLE_AXIS, time * TUMBLE_RATE);
        const spin = spins.map((axis, cluster) => rotation(axis, time * CLUSTER_SPIN * (cluster % 2 ? -1 : 1)));
        const period = Math.floor(time / PION_PERIOD);
        const phase = time - period * PION_PERIOD;
        const pair = pairs.length ? pairs[(period * 7 + 3) % pairs.length] : [];
        const glow = phase < PION_TIME ? Math.sin(Math.PI * phase / PION_TIME) : 0;
        return nucleons.map(({center, offset, cluster, proton, phase: jitterPhase, rate}, index) => {
            const jitter = rate.map((r, axis) => FERMI_JITTER * Math.sin(time * r + jitterPhase[axis]));
            const position = scaled(tumble(add(add(center, spin[cluster](offset)), jitter)), scale);
            const flash = pair.includes(index) ? glow : 0;
            return [...position, proton ? 1 + flash : -flash];
        });
    }
}
