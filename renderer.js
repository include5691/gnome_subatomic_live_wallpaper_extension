import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {createScene, sceneKey} from './scenes.js';
import {ASCII_SHADER, sceneShader} from './shader.js';

const FOV = 0.36;
const TIME_PERIOD = 256;
const SHOT_PERIOD = 4096;
const MAX_FRAME_TIME = 0.25;
const MAX_YAW = Math.PI / 3;
const MAX_PITCH = Math.PI / 7;
const PITCH_LIMIT = Math.PI * 0.45;
const ZOOM_SMOOTHING = 0.12;
const CELL_WIDTH = 6;
const CELL_HEIGHT = 9;
const SAMPLES_PER_CELL = 2;
const TURN_RATE = 2 * Math.PI / 120;
const FADE_TIME = 2.5;
const MAX_AFTERGLOW_SHOTS = 64;

const SCENE_UNIFORMS = [
    'u_resolution', 'u_cells', 'u_camera', 'u_fov', 'u_distance', 'u_time', 'u_exposure', 'u_turn',
    'u_fade', 'u_shots', 'u_glow',
];
const ASCII_UNIFORMS = ['scene', 'u_output', 'u_cells', 'u_origin', 'u_font'];

const ROUNDED_CLIP_DECLARATIONS = `
uniform vec4 bounds;
uniform float clip_radius;
uniform vec2 texture_size;

float rounded_rect_coverage(vec2 p) {
    float center_left = bounds.x + clip_radius;
    float center_right = bounds.z - clip_radius;
    float center_x;
    if (p.x < center_left)
        center_x = center_left;
    else if (p.x > center_right)
        center_x = center_right;
    else
        return 1.0;

    float center_top = bounds.y + clip_radius;
    float center_bottom = bounds.w - clip_radius;
    float center_y;
    if (p.y < center_top)
        center_y = center_top;
    else if (p.y > center_bottom)
        center_y = center_bottom;
    else
        return 1.0;

    vec2 delta = p - vec2(center_x, center_y);
    float dist_squared = dot(delta, delta);
    float outer_radius = clip_radius + 0.5;
    if (dist_squared >= outer_radius * outer_radius)
        return 0.0;
    float inner_radius = clip_radius - 0.5;
    if (dist_squared <= inner_radius * inner_radius)
        return 1.0;
    return outer_radius - sqrt(dist_squared);
}
`;

const ROUNDED_CLIP_CODE = 'cogl_color_out *= rounded_rect_coverage(cogl_tex_coord0_in.xy * texture_size);';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smooth = x => {
    const t = clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
};

const templates = new Map();

function createTemplate(context, shader, entry) {
    const pipeline = Cogl.Pipeline.new(context);
    pipeline.set_layer_null_texture(0);
    const snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, shader, null);
    snippet.set_replace(`cogl_color_out = ${entry}(cogl_tex_coord_in[0].xy);`);
    pipeline.add_snippet(snippet);
    return pipeline;
}

function createPipeline(context, key, build) {
    if (!templates.has(key))
        templates.set(key, build());
    return templates.get(key).copy();
}

function uniformsOf(pipeline, names) {
    return Object.fromEntries(names.map(name => [name, pipeline.get_uniform_location(name)]));
}

function createScenePipeline(context, features) {
    const pipeline = createPipeline(context, `scene ${features.join(' ')}`,
        () => createTemplate(context, sceneShader(features), 'renderPixel'));
    return {pipeline, uniforms: uniformsOf(pipeline, SCENE_UNIFORMS)};
}

function createFramebuffer(texture) {
    const framebuffer = Cogl.Offscreen.new_with_texture(texture);
    framebuffer.allocate();
    framebuffer.orthographic(0, 0, texture.get_width(), texture.get_height(), -1, 1);
    return framebuffer;
}

let viewTemplate = null;

function createViewTemplate(context) {
    const pipeline = Cogl.Pipeline.new(context);
    pipeline.add_snippet(Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, ROUNDED_CLIP_DECLARATIONS, ROUNDED_CLIP_CODE));
    return pipeline;
}

function drawFullscreen(framebuffer, pipeline) {
    framebuffer.draw_textured_rectangle(pipeline, 0, 0,
        framebuffer.get_width(), framebuffer.get_height(), 0, 0, 1, 1);
}

export const SubatomicContent = GObject.registerClass({
    Implements: [Clutter.Content],
}, class SubatomicContent extends GObject.Object {
    _init(options) {
        super._init();
        this._options = options;
        this._monitor = null;
        this._scale = 1;
        this._locked = false;
        this._scenePipelines = new Map();
        this._asciiPipeline = null;
        this._viewPipelines = new WeakMap();
        this._sceneFramebuffer = null;
        this._texture = null;
        this._framebuffer = null;
        this._dirty = true;
        this._lastFrame = 0;
        this._time = 0;
        this._shots = 0;
        this._turn = 0;
        this._camera = null;
        this._zoom = 0;
        this._sceneKey = sceneKey(options);
        this._scene = createScene(options);
        this._sceneAge = 0;
    }

    setMonitor(monitor, scale) {
        this._monitor = monitor;
        this._scale = scale;
        this._releaseTexture();
    }

    setLocked(locked) {
        this._locked = locked;
        if (locked)
            this._camera = null;
        this.advance();
    }

    setOptions(options) {
        const resized = options.charSize !== this._options.charSize;
        this._options = options;
        if (sceneKey(options) !== this._sceneKey) {
            this._sceneKey = sceneKey(options);
            this._scene = createScene(options);
            this._sceneAge = 0;
        }
        if (resized)
            this._releaseTexture();
        this.advance();
    }

    advance() {
        this._dirty = true;
        this.invalidate();
    }

    vfunc_get_preferred_size() {
        if (!this._monitor)
            return [false, 0, 0];
        return [true, this._monitor.width, this._monitor.height];
    }

    vfunc_paint_content(actor, node, paintContext) {
        if (!this._monitor)
            return;

        if (!this._framebuffer)
            this._allocate(paintContext.get_framebuffer().get_context());
        if (this._dirty)
            this._render();

        const pipelineNode = new Clutter.PipelineNode(this._viewPipeline(actor, paintContext));
        pipelineNode.set_name('SubatomicContent');
        node.add_child(pipelineNode);
        pipelineNode.add_rectangle(actor.get_content_box());
    }

    _viewPipeline(actor, paintContext) {
        let pipeline = this._viewPipelines.get(actor);
        if (!pipeline) {
            viewTemplate ??= createViewTemplate(paintContext.get_framebuffer().get_context());
            pipeline = viewTemplate.copy();
            this._viewPipelines.set(actor, pipeline);
        }

        const opacity = actor.get_paint_opacity();
        pipeline.set_color(new Cogl.Color({red: opacity, green: opacity, blue: opacity, alpha: opacity}));
        pipeline.set_layer_texture(0, this._texture);
        const [paintWidth] = actor.get_transformed_size();
        const minified = paintWidth * actor.get_resource_scale() < this._texture.get_width();
        pipeline.set_layer_filters(0,
            minified ? Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR : Cogl.PipelineFilter.LINEAR,
            Cogl.PipelineFilter.LINEAR);

        const {x, y, width, height, index} = this._monitor;
        const scale = this._scale;
        const radius = actor.get_parent()?.content?.rounded_clip_radius ?? 0;
        const bounds = radius > 0
            ? Main.layoutManager.getWorkAreaForMonitor(index)
            : {x, y, width, height};
        const x1 = (bounds.x - x) * scale;
        const y1 = (bounds.y - y) * scale;
        pipeline.set_uniform_float(pipeline.get_uniform_location('bounds'), 4, 1,
            [x1, y1, x1 + bounds.width * scale, y1 + bounds.height * scale]);
        pipeline.set_uniform_1f(pipeline.get_uniform_location('clip_radius'), radius * scale);
        pipeline.set_uniform_float(pipeline.get_uniform_location('texture_size'), 2, 1,
            [width * scale, height * scale]);
        return pipeline;
    }

    _allocate(context) {
        this._context = context;
        if (!this._asciiPipeline) {
            const pipeline = createPipeline(context, 'ascii', () => createTemplate(context, ASCII_SHADER, 'asciiPixel'));
            this._asciiPipeline = {pipeline, uniforms: uniformsOf(pipeline, ASCII_UNIFORMS)};
        }

        const width = Math.round(this._monitor.width * this._scale);
        const height = Math.round(this._monitor.height * this._scale);
        const font = this._options.charSize;
        const cellWidth = CELL_WIDTH * font;
        const cellHeight = CELL_HEIGHT * font;
        const columns = Math.ceil(width / cellWidth);
        const rows = Math.ceil(height / cellHeight);

        const sceneTexture = Cogl.Texture2D.new_with_size(context,
            columns * SAMPLES_PER_CELL, rows * SAMPLES_PER_CELL);
        this._sceneFramebuffer = createFramebuffer(sceneTexture);
        this._texture = Cogl.Texture2D.new_with_size(context, width, height);
        this._framebuffer = createFramebuffer(this._texture);

        this._grid = {
            columns, rows, cellWidth, cellHeight, aspect: (columns * cellWidth) / (rows * cellHeight),
            originX: Math.floor((columns * cellWidth - width) / 2), originY: Math.floor((rows * cellHeight - height) / 2),
        };

        const ascii = this._asciiPipeline;
        ascii.pipeline.set_layer_texture(0, sceneTexture);
        ascii.pipeline.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
        ascii.pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
        ascii.pipeline.set_uniform_1i(ascii.uniforms.scene, 0);
        ascii.pipeline.set_uniform_float(ascii.uniforms.u_output, 2, 1, [width, height]);
        ascii.pipeline.set_uniform_float(ascii.uniforms.u_cells, 2, 1, [columns, rows]);
        ascii.pipeline.set_uniform_float(ascii.uniforms.u_origin, 2, 1, [this._grid.originX, this._grid.originY]);
        ascii.pipeline.set_uniform_1f(ascii.uniforms.u_font, font);
        this._dirty = true;
    }

    _releaseTexture() {
        this._sceneFramebuffer = null;
        this._framebuffer = null;
        this._texture = null;
        this._dirty = true;
    }

    _render() {
        const now = GLib.get_monotonic_time() / GLib.USEC_PER_SEC;
        const dt = this._lastFrame ? Math.min(now - this._lastFrame, MAX_FRAME_TIME) : 0;
        this._lastFrame = now;

        const options = this._options;
        const still = this._locked;
        this._time = (this._time + dt) % TIME_PERIOD;
        this._shots = (this._shots + dt * options.shotRate) % SHOT_PERIOD;
        this._turn = (this._turn + dt * options.turnSpeed * TURN_RATE) % (Math.PI * 2);
        this._sceneAge += dt;
        if (!still)
            this._scene.advance(dt * options.speed);
        if (still || options.speed === 0)
            this._scene.settle?.();
        const scene = this._scene.state();
        this._updateCamera(dt);
        this._zoom = this._zoom
            ? this._zoom + (options.zoom - this._zoom) * (1 - Math.exp(-dt / ZOOM_SMOOTHING))
            : options.zoom;

        const target = this._scenePipelineFor();
        const {pipeline, uniforms} = target;
        const {columns, rows, cellWidth, cellHeight} = this._grid;
        pipeline.set_uniform_float(uniforms.u_resolution, 2, 1, [columns * cellWidth, rows * cellHeight]);
        pipeline.set_uniform_float(uniforms.u_cells, 2, 1, [columns, rows]);
        pipeline.set_uniform_float(uniforms.u_camera, 3, 1, [this._camera.yaw, this._camera.pitch, options.tilt]);
        pipeline.set_uniform_1f(uniforms.u_fov, FOV / this._zoom);
        pipeline.set_uniform_1f(uniforms.u_distance, scene.distance);
        pipeline.set_uniform_1f(uniforms.u_time, this._time);
        pipeline.set_uniform_1f(uniforms.u_exposure, options.exposure);
        pipeline.set_uniform_1f(uniforms.u_turn, this._turn);
        pipeline.set_uniform_1f(uniforms.u_fade, still ? 1 : smooth(this._sceneAge / FADE_TIME));
        pipeline.set_uniform_float(uniforms.u_shots, 4, 1, [
            Math.floor(this._shots), this._shots % 1, options.atomsPerShot,
            clamp(options.afterglow * options.shotRate, 0.5, MAX_AFTERGLOW_SHOTS),
        ]);
        pipeline.set_uniform_1f(uniforms.u_glow, options.cloudGlow);
        for (const [name, [size, values]] of Object.entries(scene.uniforms)) {
            uniforms[name] ??= pipeline.get_uniform_location(name);
            pipeline.set_uniform_float(uniforms[name], size, values.length / size, values);
        }

        drawFullscreen(this._sceneFramebuffer, pipeline);
        drawFullscreen(this._framebuffer, this._asciiPipeline.pipeline);
        this._dirty = false;
    }

    _scenePipelineFor() {
        const features = [...this._scene.features].sort();
        const key = features.join(' ');
        let target = this._scenePipelines.get(key);
        if (!target) {
            target = createScenePipeline(this._context, features);
            this._scenePipelines.set(key, target);
        }
        return target;
    }

    _updateCamera(dt) {
        const options = this._options;
        let [x, y] = [0, 0];
        if (options.followCursor && !this._locked) {
            const [pointerX, pointerY] = global.get_pointer();
            const monitor = this._monitor;
            x = clamp((pointerX - monitor.x) / monitor.width * 2 - 1, -1, 1);
            y = clamp((pointerY - monitor.y) / monitor.height * 2 - 1, -1, 1);
        }

        const yaw = x * options.sensitivity * MAX_YAW;
        const pitch = clamp(options.elevation - y * options.sensitivity * MAX_PITCH,
            -PITCH_LIMIT, PITCH_LIMIT);
        if (!this._camera) {
            this._camera = {yaw, pitch};
            return;
        }

        const response = 1 - Math.exp(-dt / options.smoothing);
        this._camera.yaw += (yaw - this._camera.yaw) * response;
        this._camera.pitch += (pitch - this._camera.pitch) * response;
    }
});
