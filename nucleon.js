import {
    add, clamp, electronTrack, inbound, lerp, outbound, packed, scaled, smooth, sub, tracksUniforms, unit,
} from './common.js';

const QUARK_SLOTS = 5;
const TUBE_SLOTS = 4;
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

function quarkOrbit(index, time) {
    const rates = [[1.9, 2.3, 1.7], [2.2, 1.6, 2.5], [1.5, 2.6, 2.0]][index];
    const phases = [[0.3, 1.9, 4.1], [2.4, 0.2, 5.3], [4.6, 3.7, 1.1]][index];
    return rates.map((rate, axis) => QUARK_ORBIT * Math.sin(time * rate + phases[axis]) * (axis === 1 ? 0.9 : 1));
}

export class NucleonScene {
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
