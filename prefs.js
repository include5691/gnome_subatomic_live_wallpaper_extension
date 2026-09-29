import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCENES = [
    ['hydrogen', 'Hydrogen atom'],
    ['atom', 'Atom with a nucleus'],
    ['nucleon', 'Quarks in a nucleon'],
];

const ORBITALS = [
    ['1s', '1s'],
    ['2p', '2p'],
    ['3d', '3d'],
    ['4f', '4f'],
];

const ELEMENTS = [
    ['helium', 'Helium'],
    ['carbon', 'Carbon'],
    ['oxygen', 'Oxygen'],
    ['neon', 'Neon'],
];

const NUCLEONS = [
    ['proton', 'Proton'],
    ['neutron', 'Neutron'],
];

function connectSetting(settings, key, widget, callback) {
    const id = settings.connect(`changed::${key}`, callback);
    widget.connect('destroy', () => settings.disconnect(id));
}

function spinRow(settings, key, title, subtitle = '') {
    const [, [min, max]] = settings.settings_schema.get_key(key).get_range().recursiveUnpack();
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.set({title, subtitle});
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function comboRow(settings, key, title, options) {
    const row = new Adw.ComboRow({
        title,
        model: Gtk.StringList.new(options.map(([, label]) => label)),
    });
    let syncing = false;
    const sync = () => {
        syncing = true;
        row.selected = Math.max(options.findIndex(([value]) => value === settings.get_string(key)), 0);
        syncing = false;
    };
    sync();
    connectSetting(settings, key, row, sync);
    row.connect('notify::selected', () => {
        if (!syncing)
            settings.set_string(key, options[row.selected][0]);
    });
    return row;
}

function resetButton(settings, keys) {
    const button = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: 'Reset',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    button.connect('clicked', () => keys.forEach(key => settings.reset(key)));
    return button;
}

export default class SubatomicWallpaperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const objects = new Adw.PreferencesGroup({title: 'Scene'});
        objects.add(comboRow(settings, 'scene', 'Scene', SCENES));
        const orbital = comboRow(settings, 'orbital', 'Orbital', ORBITALS);
        const element = comboRow(settings, 'element', 'Element', ELEMENTS);
        const nucleon = comboRow(settings, 'nucleon', 'Nucleon', NUCLEONS);
        const events = switchRow(settings, 'events', 'Events',
            'Photons that excite the atom, X-rays that knock out electrons, and electrons that hit quarks');
        const speed = spinRow(settings, 'speed', 'Speed', 'Events and quark motion, in percent');
        [orbital, element, nucleon, events, speed].forEach(row => objects.add(row));

        const electronKeys = ['shot-rate', 'atoms-per-shot', 'afterglow', 'cloud-glow'];
        const electrons = new Adw.PreferencesGroup({
            title: 'Electron shots',
            description: 'Each shot measures where the electrons are. The cloud is the pattern the shots leave behind.',
            header_suffix: resetButton(settings, electronKeys),
        });
        electrons.add(spinRow(settings, 'shot-rate', 'Shots per second'));
        electrons.add(spinRow(settings, 'atoms-per-shot', 'Atoms per shot', 'Copies of the atom measured in each shot'));
        electrons.add(spinRow(settings, 'afterglow', 'Afterglow', 'Milliseconds'));
        electrons.add(spinRow(settings, 'cloud-glow', 'Cloud glow', 'Faint probability cloud behind the shots, in percent'));

        const performance = new Adw.PreferencesGroup({title: 'Performance'});
        performance.add(spinRow(settings, 'fps', 'Frame rate', 'Frames per second'));
        performance.add(switchRow(settings, 'pause-when-covered', 'Pause behind windows',
            'Stop rendering while a maximized or fullscreen window covers the screen'));

        const cursor = new Adw.PreferencesGroup({title: 'Cursor'});
        const sensitivity = spinRow(settings, 'cursor-sensitivity', 'Sensitivity', 'Percent');
        const smoothing = spinRow(settings, 'cursor-smoothing', 'Smoothness', 'Percent');
        cursor.add(switchRow(settings, 'follow-cursor', 'Follow cursor'));
        cursor.add(sensitivity);
        cursor.add(smoothing);
        const syncCursorRows = () => {
            const follow = settings.get_boolean('follow-cursor');
            [sensitivity, smoothing].forEach(row => row.set_sensitive(follow));
        };
        syncCursorRows();
        connectSetting(settings, 'follow-cursor', sensitivity, syncCursorRows);

        const viewKeys = ['char-size', 'rotation-speed', 'elevation', 'tilt', 'zoom', 'brightness'];
        const view = new Adw.PreferencesGroup({
            title: 'View',
            header_suffix: resetButton(settings, viewKeys),
        });
        view.add(spinRow(settings, 'char-size', 'Character size', 'Screen pixels per font dot'));
        view.add(spinRow(settings, 'rotation-speed', 'Rotation speed', 'Percent'));
        view.add(spinRow(settings, 'elevation', 'Camera height', 'Degrees'));
        view.add(spinRow(settings, 'tilt', 'Tilt', 'Degrees'));
        view.add(spinRow(settings, 'zoom', 'Zoom', 'Percent'));
        view.add(spinRow(settings, 'brightness', 'Brightness', 'Percent'));

        const syncSceneRows = () => {
            const scene = settings.get_string('scene');
            const eventsOn = settings.get_boolean('events');
            orbital.set_visible(scene === 'hydrogen');
            orbital.set_sensitive(!eventsOn);
            element.set_visible(scene === 'atom');
            nucleon.set_visible(scene === 'nucleon');
            speed.set_sensitive(eventsOn || scene === 'nucleon');
            electrons.set_sensitive(scene !== 'nucleon');
        };
        syncSceneRows();
        ['scene', 'events'].forEach(key => connectSetting(settings, key, orbital, syncSceneRows));

        const page = new Adw.PreferencesPage();
        [objects, electrons, performance, cursor, view].forEach(group => page.add(group));
        window.add(page);
    }
}
