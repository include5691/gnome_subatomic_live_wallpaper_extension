const NUCLEON_SLOTS = 20;
const QUARK_SLOTS = 5;
const TUBE_SLOTS = 4;
const TRACK_SLOTS = 3;

const ORBITALS = ['1s', '2p', '3d', '4f'];
const ORBITAL_EXTENT = [8, 20, 38, 62];
const ORBITAL_DISTANCE = [13, 30, 52, 80];
const HYDROGEN_HOLD = [14, 11, 11, 13];
const CASCADE_HOLD = 4;
const PHOTON_TRAVEL = 2.5;
const MIX_TIME = 3.5;
const SLOSH_RATE = 2 * Math.PI * 0.9;
const PHOTON_REACH = 0.9;
const PACKET_WAVES = 6;
const LINES = [
    {wavelength: 0.03, color: [0.62, 0.35, 1.0]},
    {wavelength: 0.055, color: [1.0, 0.16, 0.1]},
    {wavelength: 0.085, color: [0.75, 0.12, 0.06]},
];
const TRANSITION_DIRECTIONS = [
    sign => [sign, 0, 0.35],
    sign => [0, sign, 0.25],
    (sign, cycle) => [Math.cos(0.6 + cycle * 2.4), Math.sin(0.6 + cycle * 2.4), 0],
];

const ELEMENTS = {
    helium: {z: 2, a: 4, zeta: [1.7, 0], s: 0, p: [0, 0, 0]},
    carbon: {z: 6, a: 12, zeta: [5.7, 1.625], s: 2, p: [1, 1, 0]},
    oxygen: {z: 8, a: 16, zeta: [7.7, 2.275], s: 2, p: [2, 1, 1]},
    neon: {z: 10, a: 20, zeta: [9.7, 2.925], s: 2, p: [2, 2, 2]},
};
const ATOM_VIEW = 9.5;
const ATOM_EXTENT = 5.5;
const NUCLEUS_SIZE = 0.16;
const NUCLEON_RADIUS = 0.85;
const FERMI_JITTER = 0.12;
const XRAY = {wavelength: 0.018, color: [0.7, 0.85, 1.0]};
const RECAPTURE = {wavelength: 0.04, color: [0.6, 0.4, 1.0]};
const ELECTRON = {wavelength: 0, color: [0.55, 0.85, 1.0]};
const ATOM_CALM = 24;
const XRAY_TRAVEL = 2;
const EJECT_TIME = 1.8;
const KALPHA_DELAY = 1.2;
const ION_TIME = 8;
const CAPTURE_TIME = 3;
const SHELL_SETTLE = 0.4;

const PROTON_DISTANCE = 4.6;
const QUARK_RADIUS = {u: 0.11, d: 0.09};
const QUARK_ORBIT = 0.5;
const EXCHANGE_PERIOD = 1.1;
const PULSE_TIME = 0.5;
const CHARGE_COLORS = [[1.0, 0.12, 0.08], [0.15, 1.0, 0.2], [0.2, 0.4, 1.0]];
const ANTI_COLORS = [[0.2, 0.95, 1.0], [1.0, 0.3, 0.95], [1.0, 0.9, 0.2]];
const JUNCTION_COLOR = [0.95, 0.88, 0.8];
const TUBE_WIDTH = 0.04;
const DIS_CALM = 18;
const PROBE_TRAVEL = 1.4;
const STRETCH_TIME = 2.4;
const STRETCH_LENGTH = 1.7;
const MESON_TIME = 4;
const MESON_SPEED = 0.45;
const MESON_SIZE = 0.35;
const RETURN_TIME = 1.6;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scaled = (a, s) => a.map(v => v * s);
const lerp = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const length = a => Math.hypot(...a);
const unit = a => scaled(a, 1 / length(a));

function randomStream(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function packed(values, slots, size) {
    const out = new Array(slots * size).fill(0);
    values.slice(0, slots).forEach((value, index) => value.forEach((v, i) => {
        out[index * size + i] = v;
    }));
    return out;
}

function tracksUniforms(tracks) {
    return {
        u_tracks_a: [4, packed(tracks.map(t => [...t.tail, t.wavelength]), TRACK_SLOTS, 4)],
        u_tracks_b: [4, packed(tracks.map(t => [...t.head, t.brightness]), TRACK_SLOTS, 4)],
        u_track_colors: [4, packed(tracks.map(t => [...t.color, t.width]), TRACK_SLOTS, 4)],
    };
}

function inbound(direction, reach, progress, packet, target = [0, 0, 0]) {
    const travel = reach * progress;
    const tailDistance = Math.min(Math.max(travel - packet, 0), reach);
    return {
        head: add(target, scaled(direction, Math.min(travel, reach) - reach)),
        tail: add(target, scaled(direction, tailDistance - reach)),
        seen: travel > 0 && tailDistance < reach,
    };
}

function outbound(direction, reach, travel, packet, origin = [0, 0, 0]) {
    return {
        head: add(origin, scaled(direction, Math.min(travel, reach))),
        tail: add(origin, scaled(direction, clamp(travel - packet, 0, reach))),
        seen: travel > 0 && travel - packet < reach,
    };
}

function photon(line, distance, ends, brightness = 1) {
    return {
        ...ends, wavelength: line.wavelength * distance, color: line.color,
        width: distance * 0.016, brightness: ends.seen ? brightness * 1.5 : 0,
    };
}

function electronTrack(ends, distance, brightness = 1) {
    return {...ends, wavelength: 0, color: ELECTRON.color, width: distance * 0.008, brightness: ends.seen ? brightness : 0};
}

function nucleusCluster(protons, count, seed) {
    const random = randomStream(seed);
    const points = Array.from({length: count}, () => {
        const direction = unit([random() - 0.5, random() - 0.5, random() - 0.5]);
        return scaled(direction, random() * 1.2 * Math.cbrt(count));
    });
    const contact = NUCLEON_RADIUS * 2 * 0.92;
    for (let step = 0; step < 400; step++) {
        for (let i = 0; i < count; i++) {
            points[i] = scaled(points[i], 0.985);
            for (let j = i + 1; j < count; j++) {
                const gap = sub(points[j], points[i]);
                const distance = length(gap) || 1e-3;
                if (distance < contact) {
                    const push = scaled(gap, (contact - distance) / distance / 2);
                    points[i] = sub(points[i], push);
                    points[j] = add(points[j], push);
                }
            }
        }
    }
    const center = scaled(points.reduce(add, [0, 0, 0]), 1 / count);
    const order = points.map((_, index) => [random(), index]).sort((a, b) => a[0] - b[0]).map(([, index]) => index);
    return points.map((point, index) => ({
        position: sub(point, center),
        proton: order.indexOf(index) < protons ? 1 : 0,
        phase: [random(), random(), random()].map(v => v * Math.PI * 2),
        rate: [random(), random(), random()].map(v => 1.5 + v * 1.5),
    }));
}

function jittered(nucleons, time, scale) {
    return nucleons.map(({position, proton, phase, rate}) => [
        ...position.map((v, axis) => (v + FERMI_JITTER * Math.sin(time * rate[axis] + phase[axis])) * scale),
        proton,
    ]);
}

class HydrogenScene {
    constructor(options) {
        this.features = ['ELECTRONS', 'HYDROGEN', 'NUCLEUS', ...options.events ? ['TRACKS'] : []];
        this._events = options.events;
        this._orbital = ORBITALS.indexOf(options.orbital);
        this._time = 0;
        this._phase = 0;
        this._steps = [];
        ORBITALS.slice(0, -1).forEach((_, index) => {
            this._steps.push({hold: index, duration: HYDROGEN_HOLD[index]});
            this._steps.push({from: index, to: index + 1, absorb: true, duration: PHOTON_TRAVEL + MIX_TIME});
        });
        this._steps.push({hold: 3, duration: HYDROGEN_HOLD[3]});
        for (let index = 3; index > 0; index--) {
            this._steps.push({from: index, to: index - 1, absorb: false, duration: MIX_TIME + PHOTON_TRAVEL});
            if (index > 1)
                this._steps.push({hold: index - 1, duration: CASCADE_HOLD});
        }
        this._cycle = this._steps.reduce((sum, step) => sum + step.duration, 0);
    }

    advance(dt) {
        this._time += dt;
        this._phase = (this._phase + dt * SLOSH_RATE) % (Math.PI * 2);
    }

    state() {
        if (!this._events)
            return this._pack(this._orbital, this._orbital, 0, []);

        const cycle = Math.floor(this._time / this._cycle);
        let t = this._time % this._cycle;
        const step = this._steps.find(candidate => {
            if (t < candidate.duration)
                return true;
            t -= candidate.duration;
            return false;
        });
        if (step.hold !== undefined)
            return this._pack(step.hold, step.hold, 0, []);

        const low = Math.min(step.from, step.to);
        const line = LINES[low];
        const sign = cycle % 2 ? -1 : 1;
        const direction = unit(TRANSITION_DIRECTIONS[low](step.absorb ? sign : -sign, cycle));
        const distance = this._distance(step.from, step.to, 0.5);
        const reach = distance * PHOTON_REACH;
        const packet = line.wavelength * distance * PACKET_WAVES;
        let weight;
        let ends;
        if (step.absorb) {
            weight = smooth(PHOTON_TRAVEL - 0.6, PHOTON_TRAVEL + MIX_TIME, t);
            ends = inbound(direction, reach, t / PHOTON_TRAVEL * (1 + packet / reach), packet);
        } else {
            weight = smooth(0, MIX_TIME, t);
            ends = outbound(direction, reach, (t - MIX_TIME * 0.45) * reach / PHOTON_TRAVEL, packet);
        }
        return this._pack(step.from, step.to, weight, [photon(line, distance, ends)]);
    }

    _distance(a, b, weight) {
        return Math.exp(mix(Math.log(ORBITAL_DISTANCE[a]), Math.log(ORBITAL_DISTANCE[b]), weight));
    }

    _pack(a, b, weight, tracks) {
        const distance = this._distance(a, b, smooth(0, 1, weight));
        const extent = Math.max(ORBITAL_EXTENT[a], weight > 0 ? ORBITAL_EXTENT[b] : 0);
        return {
            distance,
            uniforms: {
                u_orbital: [4, [a, b, weight, this._phase]],
                u_extent: [1, [extent]],
                u_nucleus: [4, [1, distance * 0.012, distance * 0.012, 1]],
                u_nucleons: [4, packed([[0, 0, 0, 1]], NUCLEON_SLOTS, 4)],
                ...tracksUniforms(tracks),
            },
        };
    }
}

class AtomScene {
    constructor(options) {
        this.features = ['ELECTRONS', 'ATOM', 'NUCLEUS', ...options.events ? ['TRACKS'] : []];
        this._events = options.events;
        this._element = ELEMENTS[options.element] ?? ELEMENTS.carbon;
        const {z, a, zeta} = this._element;
        this._nucleons = nucleusCluster(z, a, z * 7919 + a);
        this._outer = zeta[1] > 0 ? 2 / zeta[1] : 1 / zeta[0];
        this._distance = this._outer * ATOM_VIEW;
        this._time = 0;
        const shell = this._element.s > 0;
        this._kalpha = shell ? KALPHA_DELAY : 0;
        this._cycle = ATOM_CALM + XRAY_TRAVEL + this._kalpha + (shell ? PHOTON_TRAVEL : 0) + ION_TIME + CAPTURE_TIME + PHOTON_TRAVEL + 2;
    }

    advance(dt) {
        this._time += dt;
    }

    state() {
        const {z, a, zeta, s, p} = this._element;
        const distance = this._distance;
        const reach = distance * PHOTON_REACH;
        let k = 2;
        let pOccupancy = [...p];
        const tracks = [];
        let flash = 0;
        if (this._events) {
            const t = this._time % this._cycle;
            const hit = ATOM_CALM + XRAY_TRAVEL;
            const shell = s > 0;
            const kalpha = hit + this._kalpha;
            const ion = kalpha + (shell ? PHOTON_TRAVEL : 0);
            const capture = ion + ION_TIME;
            const settle = capture + CAPTURE_TIME;
            const cycle = Math.floor(this._time / this._cycle);
            const angle = 0.7 + cycle * 2.4;
            const inDirection = unit([Math.cos(angle), 0.35, Math.sin(angle) * 0.4]);
            const outDirection = unit([-Math.sin(angle), 0.8, Math.cos(angle) * 0.3]);
            const lost = pOccupancy.indexOf(Math.max(...pOccupancy));

            const xrayPacket = XRAY.wavelength * distance * PACKET_WAVES;
            if (t > ATOM_CALM - 0.1 && t < hit + 0.5)
                tracks.push(photon(XRAY, distance, inbound(inDirection, reach, (t - ATOM_CALM) / XRAY_TRAVEL * (1 + xrayPacket / reach), xrayPacket)));
            if (t > hit && t < hit + EJECT_TIME + 1)
                tracks.push(electronTrack(outbound(unit(add(inDirection, [0, 0.6, 0])), reach, (t - hit) * reach / EJECT_TIME, reach * 0.35), distance));
            flash = Math.exp(-Math.max(t - hit, 0) * 4) * (t > hit ? 0.6 : 0);

            const vacancy = smooth(hit, hit + SHELL_SETTLE, t);
            if (shell) {
                const fill = smooth(kalpha, kalpha + SHELL_SETTLE, t);
                k = 2 - vacancy + fill;
                pOccupancy[lost] -= fill;
                if (t > kalpha)
                    tracks.push(photon(XRAY, distance, outbound(outDirection, reach, (t - kalpha) * reach / PHOTON_TRAVEL, xrayPacket)));
            } else {
                k = 2 - vacancy;
            }

            if (t > capture) {
                const progress = (t - capture) / CAPTURE_TIME;
                tracks.push(electronTrack(inbound(scaled(outDirection, -1), reach, progress, reach * 0.2), distance, 0.8));
                const restored = smooth(settle - 0.2, settle + SHELL_SETTLE * 2, t);
                if (shell)
                    pOccupancy[lost] += restored;
                else
                    k += restored;
                if (t > settle) {
                    const packet = RECAPTURE.wavelength * distance * PACKET_WAVES;
                    tracks.push(photon(RECAPTURE, distance, outbound(inDirection, reach, (t - settle) * reach / PHOTON_TRAVEL, packet)));
                }
            }
        }

        const radius = this._outer * NUCLEUS_SIZE * Math.cbrt(a / 4);
        const scale = radius / (1.2 * Math.cbrt(a));
        return {
            distance,
            uniforms: {
                u_extent: [1, [this._outer * ATOM_EXTENT]],
                u_shells: [4, [zeta[0], zeta[1] || 1, k, s]],
                u_p: [3, pOccupancy],
                u_nucleus: [4, [a, NUCLEON_RADIUS * scale * 1.05, radius + NUCLEON_RADIUS * scale * 1.5, 1 + flash * 4]],
                u_nucleons: [4, packed(jittered(this._nucleons, this._time, scale), NUCLEON_SLOTS, 4)],
                ...tracksUniforms(tracks.slice(0, TRACK_SLOTS)),
            },
        };
    }
}

function quarkOrbit(index, time) {
    const rates = [[1.9, 2.3, 1.7], [2.2, 1.6, 2.5], [1.5, 2.6, 2.0]][index];
    const phases = [[0.3, 1.9, 4.1], [2.4, 0.2, 5.3], [4.6, 3.7, 1.1]][index];
    return rates.map((rate, axis) => QUARK_ORBIT * Math.sin(time * rate + phases[axis]) * (axis === 1 ? 0.9 : 1));
}

class NucleonScene {
    constructor(options) {
        this.features = ['NUCLEON', ...options.events ? ['TRACKS'] : []];
        this._events = options.events;
        this._flavors = options.nucleon === 'neutron' ? ['u', 'd', 'd'] : ['u', 'u', 'd'];
        this._colors = [0, 1, 2];
        this._glints = [0, 0, 0];
        this._time = 0;
        this._exchange = null;
        this._period = -1;
        this._cycle = DIS_CALM + PROBE_TRAVEL + STRETCH_TIME + MESON_TIME;
    }

    advance(dt) {
        this._time += dt;
        this._glints = this._glints.map(glint => glint * Math.exp(-dt * 5));
        const exchange = this._exchange;
        if (exchange && this._time >= exchange.end) {
            this._colors[exchange.to] = exchange.fromColor;
            this._glints[exchange.to] = 1;
            this._exchange = null;
        }
        const period = Math.floor(this._time / EXCHANGE_PERIOD);
        if (period !== this._period && !this._exchange && !this._eventActive()) {
            this._period = period;
            const from = period % 3;
            const to = (from + 1 + Math.floor(period / 3) % 2) % 3;
            this._exchange = {from, to, fromColor: this._colors[from], start: this._time, end: this._time + PULSE_TIME};
            this._colors[from] = this._colors[to];
            this._glints[from] = 1;
        }
    }

    settle() {
        if (!this._exchange)
            return;
        this._colors[this._exchange.to] = this._exchange.fromColor;
        this._exchange = null;
    }

    _eventActive() {
        return this._events && this._time % this._cycle > DIS_CALM - 0.5;
    }

    state() {
        const time = this._time;
        const positions = [0, 1, 2].map(index => quarkOrbit(index, time));
        const quarks = positions.map((position, index) => ({
            position, color: CHARGE_COLORS[this._colors[index]],
            radius: QUARK_RADIUS[this._flavors[index]], brightness: 1 + this._glints[index],
        }));
        const extras = [];
        const tracks = [];
        let flash = 0;
        let flashAt = [0, 0, 0];
        let stretched = -1;
        let tension = 1;

        if (this._events) {
            const cycle = Math.floor(time / this._cycle);
            const t = time % this._cycle;
            const struck = cycle % 3;
            const hit = DIS_CALM + PROBE_TRAVEL;
            const snap = hit + STRETCH_TIME;
            const probeAngle = 0.9 + cycle * 2.1;
            const probeDirection = unit([Math.cos(probeAngle), -0.25, Math.sin(probeAngle) * 0.5]);
            const reach = PROTON_DISTANCE * 0.9;
            const target = quarkOrbit(struck, cycle * this._cycle + hit);
            const scatter = unit(add(probeDirection, [0, 1.1, 0]));
            const kick = unit(sub(probeDirection, scatter));

            if (t > DIS_CALM && t < hit)
                tracks.push(electronTrack(inbound(probeDirection, reach, Math.min((t - DIS_CALM) / PROBE_TRAVEL, 1), reach * 0.5, target), PROTON_DISTANCE));
            if (t > hit && t < hit + 2) {
                tracks.push(electronTrack(outbound(scatter, reach, (t - hit) * reach / 1.2, reach * 0.5, target), PROTON_DISTANCE));
                flash = Math.exp(-(t - hit) * 5) * 0.8;
                flashAt = target;
            }

            if (t > hit && t < snap) {
                const x = (t - hit) / STRETCH_TIME;
                const reachOut = STRETCH_LENGTH * (1 - (1 - x) * (1 - x));
                quarks[struck].position = add(target, scaled(kick, reachOut));
                quarks[struck].brightness = 1.6;
                stretched = struck;
                tension = 1 + 2 * x;
                positions.forEach((position, index) => {
                    if (index !== struck)
                        quarks[index].position = add(position, scaled(kick, 0.12 * x));
                });
            } else if (t >= snap) {
                const after = t - snap;
                const outer = add(target, scaled(kick, STRETCH_LENGTH + after * MESON_SPEED));
                const breakPoint = add(target, scaled(kick, STRETCH_LENGTH * 0.45));
                const pair = smooth(0, 0.6, after);
                const anti = lerp(add(breakPoint, scaled(kick, 0.05)), sub(outer, scaled(kick, MESON_SIZE)), pair);
                const fading = 1 - smooth(MESON_TIME - 1.5, MESON_TIME, after);
                const color = this._colors[struck];
                extras.push({position: outer, color: CHARGE_COLORS[color], radius: QUARK_RADIUS[this._flavors[struck]], brightness: fading});
                extras.push({position: anti, color: ANTI_COLORS[color], radius: QUARK_RADIUS[this._flavors[struck]], brightness: fading});
                quarks[struck].position = lerp(sub(breakPoint, scaled(kick, 0.05)), positions[struck], smooth(0, RETURN_TIME, after));
                flash = Math.exp(-after * 4) * 0.7;
                flashAt = breakPoint;
            }
        }

        const junction = scaled(quarks.slice(0, 3).map(q => q.position).reduce(add, [0, 0, 0]), 1 / 3);
        const tubes = quarks.slice(0, 3).map((quark, index) => ({
            a: quark.position, b: junction, colorA: quark.color, colorB: JUNCTION_COLOR,
            width: TUBE_WIDTH / Math.sqrt(index === stretched ? tension : 1),
            brightness: index === stretched ? tension : 1,
        }));
        if (extras.length)
            tubes.push({a: extras[0].position, b: extras[1].position, colorA: extras[0].color, colorB: extras[1].color, width: TUBE_WIDTH, brightness: extras[0].brightness});

        const all = [...quarks, ...extras];
        let pulse = [0, 0, 0, 0];
        let pulseColor = [0, 0, 0, 0];
        let pulseAnti = [0, 0, 0];
        if (this._exchange) {
            const {from, to, fromColor, start} = this._exchange;
            pulseAnti = ANTI_COLORS[this._colors[to]];
            const phase = clamp((time - start) / PULSE_TIME, 0, 1);
            const position = phase < 0.5
                ? lerp(quarks[from].position, junction, phase * 2)
                : lerp(junction, quarks[to].position, phase * 2 - 1);
            pulse = [...position, 0.06];
            pulseColor = [...CHARGE_COLORS[fromColor], 1];
        }

        return {
            distance: PROTON_DISTANCE,
            uniforms: {
                u_quarks: [4, packed(all.map(q => [...q.position, q.radius]), QUARK_SLOTS, 4)],
                u_quark_colors: [4, packed(all.map(q => [...q.color, q.brightness]), QUARK_SLOTS, 4)],
                u_tubes_a: [4, packed(tubes.map(tube => [...tube.a, tube.width]), TUBE_SLOTS, 4)],
                u_tubes_b: [4, packed(tubes.map(tube => [...tube.b, tube.brightness]), TUBE_SLOTS, 4)],
                u_tube_colors_a: [3, packed(tubes.map(tube => tube.colorA), TUBE_SLOTS, 3)],
                u_tube_colors_b: [3, packed(tubes.map(tube => tube.colorB), TUBE_SLOTS, 3)],
                u_pulse: [4, pulse],
                u_pulse_color: [4, pulseColor],
                u_pulse_anti: [3, pulseAnti],
                u_spark: [4, [...flashAt, flash]],
                ...tracksUniforms(tracks),
            },
        };
    }
}

const SCENES = {hydrogen: HydrogenScene, atom: AtomScene, nucleon: NucleonScene};

export function sceneKey(options) {
    return {
        hydrogen: `hydrogen ${options.events} ${options.orbital}`,
        atom: `atom ${options.events} ${options.element}`,
        nucleon: `nucleon ${options.events} ${options.nucleon}`,
    }[options.scene] ?? sceneKey({...options, scene: 'hydrogen'});
}

export function createScene(options) {
    return new (SCENES[options.scene] ?? HydrogenScene)(options);
}
