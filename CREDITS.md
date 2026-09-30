# Credits

Every asset in the valley is CC0 (public domain) from [Poly Haven](https://polyhaven.com). Poly Haven asks for no attribution, but we record each source here. `tools/fetch-assets.mjs` downloads the originals and converts them, so the whole set can be rebuilt.

## Textures (1K, converted to WebP)

| Used as | Asset | Author(s) | Link |
|---|---|---|---|
| Meadow ground | Leafy Grass | Poly Haven | https://polyhaven.com/a/leafy_grass |
| Woodland floor | Forest Leaves 02 | Poly Haven | https://polyhaven.com/a/forest_leaves_02 |
| Shore mud | Mud Forest | Poly Haven | https://polyhaven.com/a/mud_forest |
| Rock (spare set) | Mossy Rock | Poly Haven | https://polyhaven.com/a/mossy_rock |
| Tree bark | Jolcham Oak Bark 01 | Poly Haven | https://polyhaven.com/a/jolcham_oak_bark_01 |

Each set uses diffuse, OpenGL normal and ARM (AO / roughness / metal) maps.

## Vegetation cut-outs

| Used as | Source maps | Link |
|---|---|---|
| Grass blades and reeds | Grass Medium 02: diffuse and alpha | https://polyhaven.com/a/grass_medium_02 |
| Grass tufts | Grass Medium 01: diffuse and alpha | https://polyhaven.com/a/grass_medium_01 |
| Leaves on the leaf-cluster cards | Island Tree 02: leaves diffuse and leaves alpha | https://polyhaven.com/a/island_tree_02 |

The grass atlas and the leaf-cluster atlas (`assets/tex/grass_atlas.webp`, `assets/tex/leaf_atlas.webp`) are composited from these photos by `tools/fetch-assets.mjs`.

## Models

| Used as | Asset | Link |
|---|---|---|
| Rocks by the pool, including the squirrel's rock | Rock Moss Set 01 (glTF, 1K textures re-encoded to WebP) | https://polyhaven.com/a/rock_moss_set_01 |

## Sky

| Used as | Asset | Author(s) | Link |
|---|---|---|---|
| Sky plate and fog colours | Hilly Terrain 01 (Pure Sky), 8K HDR | Sergej Majboroda (original), Jarod Guest (sky edit) | https://polyhaven.com/a/hilly_terrain_01_puresky |

The sky plate is a 150° × 70° crop around the sun, stored with an invertible Reinhard/gamma curve (`assets/sky/sky_plate.webp`, metadata in `sky_plate.json`).

## Code

- [three.js](https://threejs.org) r186 (MIT), vendored in `vendor/three`.
- Fonts: Newsreader and Hanken Grotesk from Google Fonts (SIL Open Font License).
- Sound is generated at runtime with the Web Audio API; there are no audio files.
