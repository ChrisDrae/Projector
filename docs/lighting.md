# Lighting on a 2D canvas

How Projector lights and shades a 3D scene with nothing but the Canvas 2D API, what each technique costs,
and where its limits are.

## What the canvas gives us

Canvas 2D fills and strokes paths with a color, a gradient or a pattern, draws images, and composites them
(`globalAlpha`, `globalCompositeOperation`, `filter` in most browsers). It has no depth buffer, no per-pixel
programs and no way to interpolate colors between the corners of a polygon.

So lighting can't happen per pixel at draw time. Projector computes it in its JavaScript pipeline, per face,
per face corner or per sphere, and turns the result into fill styles; the canvas only fills. Visibility is
the painter's algorithm: primitives are sorted back to front and drawn in order.

That decides the whole design. Every distinct fill color is a separate canvas state change. Batching
(drawing many primitives as one path with one `fill()`) only works for primitives that share a style and are
next to each other in draw order. Lighting adds colors, so every technique below is about getting the look
while keeping the number of distinct styles, draw calls and allocated objects small.

## The techniques

### Lights and flat shading

The scene has an ambient light plus any number (up to 8) of `DirectionalLight`, `PointLight` and `SpotLight`,
and optionally a `HemisphereLight` (sky color from above, ground color from below). All are colored. Point
and spot lights fall off as `1 / d^decay`, optionally cut off smoothly at `distance`; spot lights fade over
the `penumbra` part of their cone.

A flat-shaded face is lit once, at its center: ambient plus hemisphere plus, per light, color × attenuation ×
`max(0, n·l)` (Lambert), times the base color, plus a Blinn-Phong highlight `specular × max(0, n·h)^shininess`
and the `emissive` color, then fog. Lights are moved into view space once per frame, so a face costs a few
dozen multiplications per light.

The resulting color is quantized to 5 bits per channel. A lookup table per material kind (outline, line width,
opacity) maps the 15-bit key to a style id, so a style string is only made the first time a color appears and
faces with equal colors still batch. Scenes that only use white directional lights take the original path:
32 brightness levels of the base color, exactly as before the lighting work.

Lighting happens in the colors' own (sRGB) space, like the original brightness model. Lighting in linear
space and converting back would be more physically right (softer falloff, no dark fringes), and would cost
nothing per frame with a lookup table, but it would change how every existing scene looks.

### Smooth shading with gradients

`shading: "smooth"` lights every face corner with its smooth normal. `Mesh.computeCornerNormals(creaseAngle)`
averages the normals of the faces around a vertex that meet within the crease angle, so hard edges such as a
cylinder's rim stay sharp without duplicating vertices.

A canvas linear gradient changes color along one direction, and a color interpolated linearly over a
triangle is a linear function of screen position. So one linear gradient reproduces it exactly when the
corner colors lie on a line in RGB space. That is the case for any number of lights of one color over one
base color, the common case. For each triangle the gradient line is placed through the points where the
interpolation parameter is 0 and 1 (`triangleGradient`). When colored lights make the corner colors
non-collinear, the gradient runs between the two most different corners and the third is projected onto that
axis, an approximation.

Details that matter:

- **Uniform faces stay batched.** A face whose corners all have the same 6-bit color key is drawn as a flat
  polygon in that color. On a lit sphere only the faces across the light-to-dark transition need gradients.
- **6 bits per channel.** With 5-bit keys, the steps between flat and gradient faces showed as a checker
  pattern in dark tones. Gradient stops and the uniform test use 6-bit keys instead.
- **Seams.** Separately filled triangles show hairline gaps where their anti-aliased edges meet. Each gradient
  triangle is grown by 0.35 px around its center.
- **Cost.** Every gradient triangle is its own `createLinearGradient` and `fill()`. This is the most expensive
  technique, so it is opt-in per material.

### Lit spheres and sprites

Particles and spheres are screen-space circles, so mesh shading doesn't apply. `SphereCloud.shading` offers
two lit modes:

- **"lit"**: one color per sphere: the uniform light (ambient, hemisphere middle, other lights) plus the share
  of the visible side the strongest light reaches. Quantized like faces, so dense clouds stay batched. It
  shows distance falloff from point lights but not the light and shadow sides.
- **"sprite"**: a pre-shaded ball image per sphere, an impostor. For each sphere the pipeline picks the
  strongest light and splits the rest into a uniform term. The sprite key is: palette color, direction to
  that light (quantized into 24 × 8 bins around the view axis), its hue and strength, and the uniform term.
  Spheres with the same key share one image. The Canvas2D backend renders each key once per resolution (16,
  32, 64 or 128 px) into an `OffscreenCanvas`: per-pixel Lambert and Blinn-Phong with an anti-aliased edge.
  Each sphere is then one `drawImage`. A light inside a sphere lights the side facing the viewer, so a star at
  a light's position glows.

Guardrails:

- **Level of detail.** Spheres smaller than `spriteMinRadius` (2.5 px) are drawn as lit circles, so clouds of
  tiny particles never pay for images.
- **Render budget.** At most 6 new sprite images are rendered per frame. Spheres whose image isn't ready are
  drawn as lit circles for a frame or two.
- **Bounded caches.** The image cache starts over beyond 2048 images, the sprite table beyond 20000 keys.

A radial gradient per sphere would also work, but it creates a gradient object per sphere per frame and
can't draw a terminator. A cached bitmap is cheaper and looks better.

### Planar shadows

Shadows are projected onto planes. A receiver is the local y = 0 plane of a mesh node with `receiveShadow`, such
as a `Ground`, bounded by the mesh's extent. For each light with `castShadow`:

- **Meshes**: the faces of `castShadow` meshes that face the light are projected onto the plane. For a
  directional light, along the light: `p' = p - l (h / n·l)`, with `h` the height above the plane. For a point
  light, from the light's position. The faces of a closed mesh that face the light cover its whole shadow.
- **Spheres**: become ellipses. The minor axis is the radius. The major axis lies along the light's direction
  in the plane, stretched by `1 / cos` of the light's angle (and magnified for point lights). They are drawn as
  6- to 16-gons depending on their size on screen.
- **Clipping and merging**: shadow polygons are clipped to the receiver's bounds and lifted a hair above it.
  They are pushed into the shadow layer, drawn after the floor and before everything standing on it.

All shadows of a receiver share one style, so they become one path. The queue normalizes polygon winding, and
with the nonzero fill rule overlapping shadows merge into one region instead of darkening each other. A
thousand shadows are one draw call.

Limits: shadows fall only on such planes. Objects don't shadow each other or themselves, and curved
surfaces receive none. That would need shadow maps (see below).

### Fog

`scene.fog = { color, near, far }` fades faces (in the lighting model), mesh lines and line sets (16 fog
levels each) and sphere clouds (by absolute depth instead of the relative depth cue) toward the fog color.

## Measured costs

Chrome on a Ryzen 7 5800X, canvas 1536 × 750 CSS px at device pixel ratio 1.25. Render time is the
renderer's work per frame (emit, sort, canvas calls), averaged over a few seconds; every case ran at 60 fps.

Lighting demo: five meshes (three smooth), 48 sprite balls, a smooth-shaded floor, six lights, shadows:

| Configuration | Render ms | Draw calls |
| --- | --- | --- |
| Everything on | 4.96 | 1292 |
| Balls as lit circles instead of sprites | 4.09 | 1303 |
| And curved objects flat instead of smooth | 3.11 | 1071 |
| And shadows off | 2.92 | 1184 |

- Smooth shading on three curved objects (about 800 faces) costs about 1.2 ms.
- Shadows of everything cost about 0.2 ms, thanks to the single path.
- 48 sprite balls cost about 0.4 ms over lit circles. Most of that is rendering new sprite images: in this
  demo the lamps orbit a turning ring of balls, so about 250 new images per second are needed, held to 6
  per frame by the budget. With fixed lights images are reused and sprites cost little more than circles.

For comparison, the four original demos render in 0.3-0.8 ms, unchanged by this work (they use none of it).

## What needs WebGL

Some lighting is per pixel by nature and has no good Canvas 2D equivalent:

- **Per-pixel lighting** (Phong per pixel, normal maps).
- **Shadow maps**: shadows on any surface, including self-shadowing.
- **Screen-space effects**: ambient occlusion, reflections, bloom at full quality.

The only canvas route is a software rasterizer writing an `ImageData` with a depth buffer, which means
lighting every pixel in JavaScript. Our estimate: at 1536 × 750 that is 1.15 million pixels, and at even
50 ns per lit pixel about 58 ms per frame, three to four times over the 16.7 ms frame budget, before the
upload. At a quarter of the resolution it gets close, at a visible loss of sharpness.

That is what a GPU is for. The `RenderBackend` interface already takes the scene and camera, not
screen-space primitives, so a WebGL2 backend could draw the same meshes, materials and lights with shaders
(and sphere clouds as instances straight from the body arrays) without changes to scenes, objects or physics.

## Cheap additions for later

- **Glow and bloom**: emissive spheres drawn with `globalCompositeOperation = "lighter"`, plus an optional blurred
  copy of a glow layer (`ctx.filter = "blur(…)"`, where supported).
- **Soft and contact shadows**: a radial gradient blob under each body, or a blur filter on the shadow batch.
- **Linear-space lighting**: see above.
- **Baked light maps** for static scenes: light the floor once into an image and draw it as a pattern.
