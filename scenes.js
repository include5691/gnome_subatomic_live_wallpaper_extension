import {AtomScene} from './atom.js';
import {HydrogenScene} from './hydrogen.js';
import {NucleonScene} from './nucleon.js';

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
