export function sceneShader(features) {
    return [...features.map(feature => `#define HAS_${feature}`), SCENE_SHADER].join('\n');
}

const SCENE_SHADER = `
uniform vec2 u_resolution;
uniform vec2 u_cells;
uniform vec3 u_camera;
uniform float u_fov;
uniform float u_distance;
uniform float u_time;
uniform float u_exposure;
uniform float u_turn;
uniform float u_fade;
uniform vec4 u_shots;
uniform float u_glow;
uniform float u_extent;
uniform float u_cloud_size;
uniform vec4 u_orbital;
uniform vec4 u_orbital_kind;
uniform vec4 u_shells;
uniform vec3 u_p;
uniform vec4 u_nucleus;
uniform vec4 u_nucleons[20];
uniform vec4 u_quarks[5];
uniform vec4 u_quark_colors[5];
uniform vec4 u_tubes_a[4];
uniform vec4 u_tubes_b[4];
uniform vec3 u_tube_colors_a[4];
uniform vec3 u_tube_colors_b[4];
uniform vec4 u_pulse;
uniform vec4 u_pulse_color;
uniform vec3 u_pulse_anti;
uniform vec4 u_spark;
uniform vec4 u_tracks_a[4];
uniform vec4 u_tracks_b[4];
uniform vec4 u_track_colors[4];
uniform vec4 u_waves[2];
uniform vec3 u_wave_axes[2];
uniform vec3 u_wave_colors[2];

const float PI = 3.14159265;
const int CLOUD_STEPS = 48;
const int MAX_AFTERGLOW = 256;
const float SHOT_PERIOD = 4096.0;
const float DOT_GAIN = 3.0;
const float HOT_SHOTS = 1.5;
const float BLOOM_GAIN = 0.45;
const vec3 HOT_COLOR = vec3(1.0, 0.72, 0.45);
const float GLOW_GAIN = 1.0;
const float GLOW_SCALE = 0.12;
const float GLOW_FLOOR = 0.06;
const float STAR_CELLS = 2.2;
const float SPIKE_CELLS = 5.0;
const vec3 PROTON_COLOR = vec3(1.0, 0.42, 0.22);
const vec3 NEUTRON_COLOR = vec3(0.45, 0.62, 0.95);
const vec3 STAR_COLOR = vec3(1.0, 0.78, 0.55);
const vec3 SEA_TINT = vec3(1.0, 0.55, 0.22);
const float NUCLEON_RADIUS = 1.0;
const int SEA_PAIRS = 7;

float square(float x) {
    return x * x;
}

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
        mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
        u.z);
}

vec3 turned(vec3 v) {
    float c = cos(u_turn);
    float s = sin(u_turn);
    return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
}

vec2 rayPoint(vec3 origin, vec3 dir, vec3 point) {
    float t = max(dot(point - origin, dir), 0.0);
    return vec2(length(origin + dir * t - point), t);
}

vec3 raySegment(vec3 origin, vec3 dir, vec3 a, vec3 b) {
    vec3 u = b - a;
    vec3 w = origin - a;
    float uu = max(dot(u, u), 1e-8);
    float ud = dot(u, dir);
    float denom = uu - ud * ud;
    float s = denom > 1e-6 ? (dot(u, w) - ud * dot(dir, w)) / denom : 0.0;
    s = clamp(s, 0.0, 1.0);
    float t = max(dot(a + u * s - origin, dir), 0.0);
    return vec3(length(origin + dir * t - a - u * s), s, t);
}

#ifdef HAS_ELECTRONS
#ifdef HAS_HYDROGEN
vec2 hydrogen(float index, float kind, vec3 p) {
    float r = length(p);
    if (index < 0.5)
        return vec2(0.5641896 * exp(-r), 0.0);
    if (kind < 0.5) {
        if (index < 1.5)
            return vec2(0.0997356 * p.y * exp(-r / 2.0), 0.0);
        if (index < 2.5)
            return vec2(0.0098505 * p.x * p.y * exp(-r / 3.0), 0.0);
        return vec2(0.00063621 * p.x * p.y * p.z * exp(-r / 4.0), 0.0);
    }
    vec2 z = p.xy;
    if (index < 1.5)
        return 0.0705237 * z * exp(-r / 2.0);
    vec2 z2 = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
    if (index < 2.5)
        return 0.0034827 * z2 * exp(-r / 3.0);
    return 0.0000918290 * vec2(z2.x * z.x - z2.y * z.y, z2.x * z.y + z2.y * z.x) * exp(-r / 4.0);
}

vec3 orbitalColor(float index) {
    if (index < 0.5)
        return vec3(0.55, 0.92, 1.0);
    if (index < 1.5)
        return vec3(0.35, 0.62, 1.0);
    if (index < 2.5)
        return vec3(0.72, 0.5, 1.0);
    return vec3(1.0, 0.45, 0.85);
}

vec4 cloudAt(vec3 p) {
    float scale = u_orbital_kind.w;
    p /= scale;
    vec2 a = hydrogen(u_orbital.x, u_orbital_kind.x, p);
    vec2 b = hydrogen(u_orbital.y, u_orbital_kind.y, p);
    float w = u_orbital.z;
    float pa = (1.0 - w) * dot(a, a);
    float pb = w * dot(b, b);
    vec2 overlap = vec2(a.x * b.x + a.y * b.y, a.x * b.y - a.y * b.x);
    float interference = overlap.x * cos(u_orbital.w) + overlap.y * sin(u_orbital.w);
    float density = max(pa + pb + 2.0 * sqrt(w * (1.0 - w)) * interference, 0.0) * u_orbital_kind.z / (scale * scale * scale);
    vec3 color = (pa * orbitalColor(u_orbital.x) + pb * orbitalColor(u_orbital.y)) / max(pa + pb, 1e-12);
    return vec4(color * density, density);
}
#endif

#ifdef HAS_ATOM
vec4 cloudAt(vec3 p) {
    float r = length(p);
    float z1 = u_shells.x;
    float z2 = u_shells.y;
    float inner = z1 * z1 * z1 / PI * exp(-2.0 * z1 * r) * u_shells.z;
    float outer = pow(z2, 5.0) / PI * exp(-2.0 * z2 * r);
    float s = outer * r * r / 3.0 * u_shells.w;
    float p2 = outer * dot(p * p, u_p);
    vec3 color = inner * vec3(0.6, 0.95, 1.0) + s * vec3(0.35, 0.6, 1.0) + p2 * vec3(0.75, 0.5, 1.0);
    return vec4(color, inner + s + p2);
}
#endif

vec4 cloud(vec3 origin, vec3 dir, vec2 cell) {
    float closest = -dot(origin, dir);
    float impact2 = dot(origin, origin) - closest * closest;
    float extent2 = u_extent * u_extent;
    if (impact2 > extent2)
        return vec4(0.0);
    float chord = sqrt(extent2 - impact2);
    vec4 sum = vec4(0.0);
    float jitter = hash13(vec3(cell, 3.0)) - 0.5;
    float stepSize = 2.0 / float(CLOUD_STEPS);
    for (int i = 0; i < CLOUD_STEPS; i++) {
        float s = -1.0 + (float(i) + 0.5 + jitter * 0.8) * stepSize;
        float t = closest + chord * s * abs(s);
        float weight = t > 0.0 ? 2.0 * abs(s) * chord * stepSize : 0.0;
        sum += cloudAt(origin + dir * t) * weight;
    }
    return sum;
}

bool shot(vec2 cell, float root, float index) {
    return hash13(vec3(cell, index)) < root
        && hash13(vec3(cell.yx + 17.0, index * 1.7 + 5.0)) < root
        && hash13(vec3(cell + 41.0, index * 0.37 + 11.0)) < root;
}

vec3 shots(vec2 cell, float probability) {
    if (probability < 1e-7)
        return vec3(0.0);
    float root = pow(min(probability, 1.0), 1.0 / 3.0);
    float lit = 0.0;
    float fresh = 0.0;
    for (int k = 0; k < MAX_AFTERGLOW; k++) {
        float age = float(k) + u_shots.y;
        if (age > u_shots.w * 4.0)
            break;
        float index = mod(u_shots.x - float(k), SHOT_PERIOD);
        float glow = exp(-age / u_shots.w);
        if (glow > lit && shot(cell, root, index)) {
            lit = glow;
            fresh = exp(-age / HOT_SHOTS);
        }
    }
    float bloom = 0.0;
    for (int k = 0; k < 2; k++) {
        float age = float(k) + u_shots.y;
        float index = mod(u_shots.x - float(k), SHOT_PERIOD);
        float heat = exp(-age / HOT_SHOTS);
        if (shot(cell + vec2(1.0, 0.0), root, index) || shot(cell - vec2(1.0, 0.0), root, index)
            || shot(cell + vec2(0.0, 1.0), root, index) || shot(cell - vec2(0.0, 1.0), root, index))
            bloom = max(bloom, heat);
    }
    return vec3(lit, fresh, bloom);
}
#endif

#ifdef HAS_NUCLEUS
vec3 nucleus(vec3 origin, vec3 dir, vec3 color, vec2 cells) {
    vec2 hit = rayPoint(origin, dir, vec3(0.0));
    if (hit.x < u_nucleus.z) {
        float nearest = 1e6;
        vec3 surface = vec3(0.0);
        vec3 normal = vec3(0.0);
        float glint = 0.0;
        for (int i = 0; i < 20; i++) {
            if (float(i) >= u_nucleus.x)
                break;
            vec3 center = u_nucleons[i].xyz;
            vec3 oc = origin - center;
            float b = dot(oc, dir);
            float c = dot(oc, oc) - u_nucleus.y * u_nucleus.y;
            float h = b * b - c;
            if (h > 0.0) {
                float t = -b - sqrt(h);
                if (t > 0.0 && t < nearest) {
                    nearest = t;
                    normal = normalize(origin + dir * t - center);
                    float kind = u_nucleons[i].w;
                    float proton = step(0.5, kind);
                    glint = proton > 0.5 ? kind - 1.0 : -kind;
                    surface = mix(NEUTRON_COLOR, PROTON_COLOR, proton);
                }
            }
        }
        if (nearest < 1e5) {
            float light = 0.35 + 0.65 * max(dot(normal, normalize(-dir + vec3(0.3, 0.6, 0.0))), 0.0);
            float edge = max(1.0 - abs(dot(normal, dir)), 0.0);
            float rim = edge * edge * edge;
            return mix(surface, vec3(1.0, 0.95, 0.8), 0.6 * glint) * (light * 1.6 + rim * 0.8) * (1.0 + 1.5 * glint);
        }
    }
    float r = length(cells);
    float twinkle = 0.85 + 0.15 * sin(u_time * 2.3) * sin(u_time * 1.7 + 1.0);
    float core = exp(-r * r / (STAR_CELLS * STAR_CELLS)) * 3.0;
    float halo = 0.5 / (1.0 + r * r / 4.0);
    cells = max(abs(cells) - 0.5, 0.0);
    float spikes = (exp(-cells.y * 2.0) * exp(-cells.x / SPIKE_CELLS) + exp(-cells.x * 1.4) * exp(-cells.y / (SPIKE_CELLS * 0.7))) * 1.2;
    return color + STAR_COLOR * (core + halo + spikes) * twinkle * u_nucleus.w;
}
#endif

#ifdef HAS_NUCLEON
vec3 sea(vec3 origin, vec3 dir) {
    vec3 color = vec3(0.0);
    for (int i = 0; i < SEA_PAIRS; i++) {
        float slot = float(i);
        float life = u_time / (0.9 + slot * 0.13) + slot * 0.37;
        float generation = floor(life);
        float phase = fract(life);
        if (phase > 0.4)
            continue;
        float grow = sin(phase / 0.4 * PI);
        vec3 seed = vec3(generation, slot, 7.0);
        vec3 center = (vec3(hash13(seed), hash13(seed + 1.3), hash13(seed + 2.9)) - 0.5) * 1.3;
        vec3 axis = normalize(vec3(hash13(seed + 4.1), hash13(seed + 5.3), hash13(seed + 6.7)) - 0.5);
        float pick = floor(hash13(seed + 8.2) * 3.0);
        vec3 charge = pick < 0.5 ? vec3(1.0, 0.25, 0.2) : pick < 1.5 ? vec3(0.3, 1.0, 0.35) : vec3(0.35, 0.5, 1.0);
        vec3 anti = vec3(1.0) - charge + 0.2;
        vec3 a = center + axis * 0.07 * grow;
        vec3 b = center - axis * 0.07 * grow;
        vec2 ha = rayPoint(origin, dir, a);
        vec2 hb = rayPoint(origin, dir, b);
        color += charge * exp(-ha.x * ha.x / 0.0012) * grow * 0.9;
        color += anti * exp(-hb.x * hb.x / 0.0012) * grow * 0.9;
    }
    return color;
}

vec3 nucleonInterior(vec3 origin, vec3 dir) {
    vec3 color = vec3(0.0);
    vec2 hit = rayPoint(origin, dir, vec3(0.0));
    float impact = hit.x / NUCLEON_RADIUS;
    if (impact < 1.0) {
        float chord = sqrt(1.0 - impact * impact);
        vec3 inside = origin + dir * hit.y;
        float boil = noise3(inside * 3.5 + vec3(0.0, u_time * 0.9, u_time * 0.6));
        boil = 0.55 + 0.9 * boil * noise3(inside * 7.0 - vec3(u_time * 1.3));
        color += SEA_TINT * chord * chord * 0.2 * boil * boil;
    }
    color += SEA_TINT * exp(-square(impact - 1.0) * 500.0) * 0.25;
    color += sea(origin, dir) * step(impact, 1.05);

    for (int i = 0; i < 4; i++) {
        float brightness = u_tubes_b[i].w;
        if (brightness <= 0.0)
            continue;
        vec3 hitTube = raySegment(origin, dir, u_tubes_a[i].xyz, u_tubes_b[i].xyz);
        float width = u_tubes_a[i].w;
        float flicker = 0.7 + 0.6 * noise3(vec3(hitTube.y * 9.0 - u_time * 4.0, float(i) * 3.1, u_time));
        vec3 tint = mix(u_tube_colors_a[i], u_tube_colors_b[i], hitTube.y);
        color += tint * exp(-hitTube.x * hitTube.x / (width * width)) * brightness * flicker * 0.8;
    }

    for (int i = 0; i < 5; i++) {
        float brightness = u_quark_colors[i].w;
        if (brightness <= 0.0)
            continue;
        vec2 hitQuark = rayPoint(origin, dir, u_quarks[i].xyz);
        float radius = u_quarks[i].w;
        vec3 tint = u_quark_colors[i].rgb;
        float core = 1.0 - smoothstep(radius * 0.7, radius, hitQuark.x);
        color += mix(tint, vec3(1.0), 0.1 * core) * (core * 1.8 + exp(-square(hitQuark.x / radius)) * 0.5) * brightness;
    }

    if (u_pulse.w > 0.0) {
        vec2 hitPulse = rayPoint(origin, dir, u_pulse.xyz);
        float spread = hitPulse.x * hitPulse.x / (u_pulse.w * u_pulse.w);
        color += u_pulse_color.rgb * exp(-spread) * 1.8 + u_pulse_anti * max(exp(-spread * 0.3) - exp(-spread), 0.0) * 1.2;
    }

    if (u_spark.w > 0.0) {
        vec2 hitSpark = rayPoint(origin, dir, u_spark.xyz);
        color += vec3(1.0, 0.95, 0.85) * (exp(-square(hitSpark.x) / 0.015) * 3.0 + exp(-hitSpark.x * 6.0) * 0.4) * u_spark.w;
    }
    return color;
}
#endif

#ifdef HAS_TRACKS
vec3 tracks(vec3 origin, vec3 dir) {
    vec3 color = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float brightness = u_tracks_b[i].w;
        if (brightness <= 0.0)
            continue;
        vec3 tail = u_tracks_a[i].xyz;
        vec3 head = u_tracks_b[i].xyz;
        float span = length(head - tail);
        if (span < 1e-4)
            continue;
        vec3 hit = raySegment(origin, dir, tail, head);
        float width = u_track_colors[i].w;
        float wavelength = u_tracks_a[i].w;
        float along = hit.y * span;
        float line = exp(-hit.x * hit.x / (width * width));
        float shape;
        if (wavelength > 0.0) {
            float ends = smoothstep(0.0, 0.25, hit.y) * (1.0 - smoothstep(0.75, 1.0, hit.y));
            float wave = 0.5 + 0.5 * cos(along / wavelength * 2.0 * PI - u_time * 12.0);
            shape = ends * (0.25 + 0.75 * wave);
        } else {
            shape = pow(hit.y, 3.0) + exp(-(1.0 - hit.y) * span / (width * 2.5)) * 2.0;
        }
        color += u_track_colors[i].rgb * line * shape * brightness * 1.8;
    }
    return color;
}
#endif

#ifdef HAS_WAVES
vec3 waves(vec3 origin, vec3 dir) {
    float closest = -dot(origin, dir);
    vec3 near = origin + dir * max(closest, 0.0);
    float impact = length(near);
    vec3 normal = near / max(impact, 1e-6);
    vec3 color = vec3(0.0);
    for (int i = 0; i < 2; i++) {
        vec4 wave = u_waves[i];
        if (wave.z <= 0.0)
            continue;
        float ring = exp(-square((impact - wave.x) / wave.y));
        float c = dot(normal, u_wave_axes[i]);
        float pattern = wave.w < 0.5 ? 1.0 - c * c : wave.w < 1.5 ? 0.5 * (1.0 + c * c) : 1.0;
        color += u_wave_colors[i] * ring * pattern * wave.z;
    }
    return color;
}
#endif

vec4 renderPixel(vec2 st) {
    vec2 uv = (st - 0.5) * 2.0 * vec2(u_resolution.x / u_resolution.y, -1.0);
    vec2 cell = floor(st * u_cells);

    float yaw = u_camera.x;
    float pitch = u_camera.y;
    float roll = u_camera.z;
    vec3 origin = u_distance * vec3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw));
    vec3 forward = normalize(-origin);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    vec3 rolledRight = cos(roll) * right + sin(roll) * up;
    vec3 rolledUp = cos(roll) * up - sin(roll) * right;
    vec3 dir = normalize(forward + (uv.x * rolledRight + uv.y * rolledUp) * u_fov);
    origin = turned(origin);
    dir = turned(dir);

    vec3 color = vec3(0.0);
#ifdef HAS_ELECTRONS
    vec4 density = cloud(origin, dir, cell);
    vec3 tint = density.w > 0.0 ? density.rgb / density.w : vec3(0.0);
    float cellWorld = 2.0 * u_fov * u_distance / u_cells.y;
    float cellArea = cellWorld * cellWorld * (u_resolution.x / u_cells.x) / (u_resolution.y / u_cells.y);
    vec3 hit = shots(cell, density.w * cellArea * u_shots.z);
    vec3 hot = mix(HOT_COLOR, vec3(1.0), hit.y);
    color += tint * u_glow * GLOW_GAIN * max(1.0 - exp(-density.w * u_cloud_size * u_cloud_size * GLOW_SCALE) - GLOW_FLOOR, 0.0);
    color += mix(tint, hot, hit.y) * hit.x * DOT_GAIN * (1.0 + 1.2 * hit.y);
    color += hot * hit.z * BLOOM_GAIN;
#endif
#ifdef HAS_NUCLEUS
    vec2 cellScale = vec2(u_cells.x / (2.0 * u_resolution.x / u_resolution.y), u_cells.y / 2.0);
    color = nucleus(origin, dir, color, uv * cellScale);
#endif
#ifdef HAS_NUCLEON
    color += nucleonInterior(origin, dir);
#endif
#ifdef HAS_TRACKS
    color += tracks(origin, dir);
#endif
#ifdef HAS_WAVES
    color += waves(origin, dir);
#endif
    color *= u_fade;
    color = vec3(1.0) - exp(-color * u_exposure);
    color = pow(color, vec3(1.0 / 2.2));
    return vec4(color, 1.0);
}
`;

export const ASCII_SHADER = `
uniform sampler2D scene;
uniform vec2 u_output;
uniform vec2 u_cells;
uniform vec2 u_origin;
uniform float u_font;

const vec2 CELL = vec2(6.0, 9.0);
const float LEVELS = 10.0;
const float BLACK_POINT = 0.12;

vec2 glyphBits(float level) {
    if (level < 0.5)
        return vec2(0.0, 0.0);
    if (level < 1.5)
        return vec2(0.0, 4096.0);
    if (level < 2.5)
        return vec2(4096.0, 128.0);
    if (level < 3.5)
        return vec2(458752.0, 0.0);
    if (level < 4.5)
        return vec2(1020032.0, 132.0);
    if (level < 5.5)
        return vec2(31744.0, 31.0);
    if (level < 6.5)
        return vec2(480384.0, 149.0);
    if (level < 7.5)
        return vec2(139875.0, 25378.0);
    if (level < 8.5)
        return vec2(359754.0, 10591.0);
    return vec2(718382.0, 30781.0);
}

float bitmapPixel(vec2 bits, vec2 p) {
    if (p.x < 0.0 || p.x > 4.0 || p.y < 0.0 || p.y > 6.0)
        return 0.0;
    float top = step(p.y, 3.0);
    float value = mix(bits.y, bits.x, top);
    float index = (p.y - 4.0 * (1.0 - top)) * 5.0 + p.x;
    return mod(floor(value / exp2(index)), 2.0);
}

vec4 asciiPixel(vec2 st) {
    vec2 p = st * u_output + u_origin;
    vec2 cellSize = CELL * u_font;
    vec2 cell = floor(p / cellSize);
    vec2 local = floor((p - cell * cellSize) / u_font) - vec2(0.0, 1.0);
    vec3 color = texture2D(scene, (cell + 0.5) / u_cells).rgb;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float value = pow(clamp((luma - BLACK_POINT) / (1.0 - BLACK_POINT), 0.0, 1.0), 0.85);
    float level = floor(min(value, 0.999) * LEVELS);
    vec3 tint = color / max(max(color.r, color.g), max(color.b, 0.02));
    return vec4(tint * mix(0.55, 1.0, value) * bitmapPixel(glyphBits(level), local), 1.0);
}
`;
