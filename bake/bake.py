# Bakes direct + bounced light for the entry hall into one lightmap.
# Usage: blender -b -P bake/bake.py -- bake/room.glb bake/scene.json public/lightmap.png [samples]
import bpy, json, sys, math, time
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
glb, scene_json, out = argv[:3]
samples = int(argv[3]) if len(argv) > 3 else 256
info = json.load(open(scene_json))
S = 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e:
    print('GPU not available, using CPU:', e)
sc.cycles.samples = samples
sc.cycles.max_bounces = 8; sc.cycles.diffuse_bounces = 6; sc.cycles.glossy_bounces = 2
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
sc.cycles.use_adaptive_sampling = False
sc.cycles.sample_clamp_indirect = 2.5; sc.cycles.sample_clamp_direct = 0
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception as e: print('denoiser:', e)

w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.0; sc.world = w

def emitter(mat, color, strength):
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = strength; nt.links.new(e.outputs[0], o.inputs[0])

for m in bpy.data.materials:
    n = m.name.split('.')[0]
    if n == 'day': emitter(m, (0.86, 0.92, 1.0), 9.0)        # daylight through the windows
    elif n == 'shade': emitter(m, (1.0, 0.35, 0.08), 3.0)    # orange lamp shade
    elif n == 'spot': emitter(m, (1.0, 0.8, 0.6), 0.0)

# ceiling downlights (three.js y-up -> Blender z-up: (x, y, z) -> (x, -z, y))
for (x, z) in info['lamps']:
    ld = bpy.data.lights.new('spot', 'SPOT'); ld.energy = 75; ld.color = (1.0, 0.82, 0.62)
    ld.spot_size = math.radians(125); ld.spot_blend = 0.85; ld.shadow_soft_size = 0.05
    ob = bpy.data.objects.new('spot', ld); ob.location = (x, -z, info['h'] - 0.04); sc.collection.objects.link(ob)

lm = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('LM_') and len(o.data.uv_layers) >= 2]
print('lightmapped objects:', len(lm), 'of', len([o for o in sc.objects if o.type == 'MESH']))
bpy.ops.object.select_all(action='DESELECT')
for o in lm: o.select_set(True)
bpy.context.view_layer.objects.active = lm[0]
bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.data.uv_layers.active = ob.data.uv_layers[1]

img = bpy.data.images.new('lm', S, S, alpha=False, float_buffer=True)
for slot in ob.material_slots:
    m = slot.material; m.use_nodes = True
    n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n; n.select = True

sc.render.bake.margin = 3; sc.render.bake.use_clear = True
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False
t0 = time.time()
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})
print('bake seconds:', round(time.time() - t0, 1))

px = np.array(img.pixels[:], dtype=np.float32).reshape(S, S, 4)[..., :3]
lit = px[px.sum(axis=2) > 0]
k = 1.0 / float(np.percentile(lit, 99.8))
enc = np.clip(px * k, 0, 1) ** (1 / 2.2)
o8 = bpy.data.images.new('out', S, S, alpha=False)
o8.colorspace_settings.name = 'Non-Color'
o8.pixels = np.concatenate([enc, np.ones((S, S, 1), np.float32)], axis=2).ravel()
o8.filepath_raw = out; o8.file_format = 'PNG'; o8.save()
json.dump({'k': k, 'mean': float(lit.mean()), 'samples': samples}, open(out.replace('.png', '.json'), 'w'))
print('saved', out, 'k =', k, 'mean =', float(lit.mean()))
