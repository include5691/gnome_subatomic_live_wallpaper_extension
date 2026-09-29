# Subatomic Wallpaper

A live ASCII-art wallpaper of atoms and protons for GNOME, rendered on the GPU.

An electron has no path, only a probability cloud. The wallpaper measures where the electron is 30 times a second. Each measurement flashes up as a bright character and fades, so the shape of the orbital builds up out of the shots, like a long exposure.

![Subatomic Wallpaper](assets/preview.png)

## Scenes

- **Hydrogen atom**: one proton, drawn as a star, and one electron.
  - The orbitals are the exact hydrogen wave functions 1s, 2p, 3d and 4f.
  - With Events on, the atom climbs and falls down its ladder of levels:
    - it absorbs a Lyman-alpha photon (1s → 2p), an H-alpha photon (2p → 3d) and a Paschen-alpha photon (3d → 4f);
    - then it falls back step by step and emits the same three photons.
  - During a jump the electron is in a superposition of both orbitals. The cloud sloshes back and forth along the transition's dipole axis, and the photon leaves at right angles to it, as dipole radiation does.
  - H-alpha is drawn in its true red. Lyman-alpha (ultraviolet) and Paschen-alpha (infrared) are invisible to the eye and drawn in false violet and dark red.
- **Atom with a nucleus**: helium, carbon, oxygen or neon.
  - Orbitals are Slater-type orbitals with Slater's screening rules. The 2p electrons follow Hund's rule.
  - The nucleus holds the real number of protons (orange) and neutrons (blue), packed together and jittering.
  - With Events on, an X-ray knocks an electron out of the 1s shell:
    - a 2p electron drops into the hole and emits a K-alpha X-ray. In light atoms this is the rare branch; over 98 % of the time an Auger electron leaves instead;
    - helium has no 2p electron, so it only loses its electron and gets it back;
    - the ion later captures a free electron and emits a photon.
- **Quarks in a nucleon**: a proton (uud) or a neutron (udd).
  - The three quarks carry red, green and blue color charge.
  - A Y-shaped gluon string holds them together. Gluons carry a color and an anticolor from quark to quark, so the colors keep swapping. Counting the gluon in flight, the total is always white.
  - Quark-antiquark pairs flicker in and out of the gluon sea.
  - With Events on, an electron hits a quark, as in the experiments that discovered quarks. The quark recoils, the string stretches and snaps, and a new quark-antiquark pair forms. A meson flies away and the nucleon is whole again.
    - This is a simplified single string break. In real deep inelastic scattering the nucleon usually shatters into jets of many hadrons.

## Not to scale

- A real nucleus is about 100,000 times smaller than its atom. The nucleus is drawn far larger so you can see it.
- Everything is slowed down to seconds: electron cloud oscillations from femtoseconds, excited state lifetimes from nanoseconds, and quark and gluon motion from about 10⁻²⁴ seconds.
- Each shot measures a fresh copy of the atom. A real measurement would disturb the electron.

## Settings

- Shots per second, atoms per shot, afterglow and a faint probability cloud behind the shots.
- Moving the cursor turns the camera. The camera eases after it.
- Zoom by pinching with two fingers on a touchpad. Super+Ctrl+scroll zooms from anywhere, and plain scrolling on an empty desktop also zooms.
- The atom turns slowly. Speed, rotation, camera height, tilt, character size and brightness can be changed.
- The lock screen shows a still frame.
- Rendering pauses behind maximized and fullscreen windows.

## Install

```
make install
```

Then log out and back in, and enable it in Extensions.
