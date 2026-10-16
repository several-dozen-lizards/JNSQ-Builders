extends Node
## Explicit workshop tools; motion is an audition, never a resident-state feed.
var bridge
var motion := "still"
var phase := 0.0
var host
var clip_driver = preload("res://studio_motion.gd").new()
var hand_fit

func fit_hands() -> void:
	var skel=host._preview_find_skeleton(host.preview_human_inst)
	if not skel: return
	if hand_fit==null or not is_instance_valid(hand_fit.skeleton) or hand_fit.skeleton!=skel:
		hand_fit=preload('res://studio_hand_fit.gd').new()
		hand_fit.install(skel)
	if hand_fit.update(): clip_driver.install(skel)

func _ready() -> void:
	host = get_parent()
	if OS.has_feature("web"):
		bridge = JavaScriptBridge.create_callback(_command)
		JavaScriptBridge.get_interface("window").jnsqStudio = bridge

func _command(args: Array) -> void:
	if args.is_empty(): return
	var data = JSON.parse_string(String(args[0]))
	if not data is Dictionary: return
	var inst = host.preview_human_inst
	if not is_instance_valid(inst): return
	match String(data.get("command", "")):
		"source":
			var id=String(data.get("value",""))
			if id.length()!=32 or not id.is_valid_hex_number(false): return
			motion="still"
			host.http_preview_meta.cancel_request()
			host.http_preview_model.cancel_request()
			host.preview_candidate_id=id
			host.http_preview_meta.request(host.host_url+"/api/avatar-bodies/candidates/"+id+"/mapping")
		"hair":
			select_hair(inst, String(data.get("value", "none")))
		"appearance":
			appearance(inst, data.get("value", {}))
		"display-expression":
			if inst.has_method("apply_felt_state"):
				inst.apply_felt_state({"display_expression":data.get("value", {})})
				inst._apply_expression(1.0)
		"motion":
			motion = String(data.get("value", "still"))
			phase = 0.0
			inst.set_process(false)
			inst.end_walk()
			inst.set_posture("sitting" if motion == "sit" else "standing")
			var skel = host._preview_find_skeleton(inst)
			if skel:
				skel.reset_bone_poses()
				clip_driver.install(skel)
			inst.position = inst.get_meta("studio_origin", inst.position)
			inst.rotation.y = 0.0
			host._apply_preview_expressions({})
		"thumbnail":
			await RenderingServer.frame_post_draw
			var frame = host.get_viewport().get_texture().get_image()
			frame.resize(240, 240, Image.INTERPOLATE_LANCZOS)
			var payload = {"type":"jnsq-studio-thumbnail", "token":data.get("token", ""),
				"image":"data:image/png;base64," + Marshalls.raw_to_base64(frame.save_png_to_buffer())}
			JavaScriptBridge.eval("window.parent.postMessage(" + JSON.stringify(payload) + ",window.location.origin)")

func _process(delta: float) -> void:
	var inst = host.preview_human_inst
	if not is_instance_valid(inst): return
	fit_hands()
	phase += delta
	if motion in ["idle","walk","sit","talk"]:
		clip_driver.apply(motion,phase)
		var skel=clip_driver.skeleton
		if skel:
			var left=skel.find_bone("foot.L")
			var right=skel.find_bone("foot.R")
			if left>=0 and right>=0:
				var rest_floor=minf(skel.get_bone_global_rest(left).origin.y,skel.get_bone_global_rest(right).origin.y)
				var posed_floor=minf(skel.get_bone_global_pose(left).origin.y,skel.get_bone_global_pose(right).origin.y)
				inst.position=inst.get_meta("studio_origin",inst.position)+(Vector3.UP*(rest_floor-posed_floor)+clip_driver.root_offset)*inst.scale.y
	if motion == "turn": inst.rotation.y = phase * 0.6
	if motion == "blink":
		var value = maxf(0.0, sin(phase * PI)) ** 8.0
		host._apply_preview_expressions({"blink_left":value,"blink_right":value})
	if motion == "talk":
		var syllable=absf(sin(phase*7.0))
		host._apply_preview_expressions({"mouth_open":syllable*0.32,"pucker":maxf(0.0,sin(phase*4.7))*0.55,"mouth_wide":maxf(0.0,-sin(phase*4.7))*0.35})

static func appearance(node: Node, values: Dictionary) -> void:
	if node is MeshInstance3D and node.mesh:
		var extra: Dictionary = node.get_meta("extras", {})
		var category = String(extra.get("jnsq_fit_category", ""))
		var asset = String(extra.get("jnsq_fit_asset_name", ""))
		if category in ["eyebrows", "eyelashes"]:
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if category == "hair": node.visible = asset == String(values.get("hairstyle", "short01"))
		if category == "eyebrows": node.visible = asset == String(values.get("eyebrows", "eyebrow009"))
		if category == "eyelashes": node.visible = asset == String(values.get("eyelashes", "lashes_soft_natural"))
		if category == "beard": node.visible = asset == String(values.get("beard", "none"))
		if category == "fantasy" and (asset == "horns" or extra.has("jnsq_horn_style")):
			node.visible = String(extra.get("jnsq_horn_style", "original")) == String(values.get("horn_style", "original"))
		for i in range(node.mesh.get_surface_count()):
			var mat = node.get_active_material(i)
			if not mat is StandardMaterial3D: continue
			var material_name = mat.resource_name.replace("JNSQ.", "JNAIQ.")
			if material_name in ["JNAIQ.Cornea", "JNAIQ.Cornea.ClearV1"]:
				var clear_profile = material_name == "JNAIQ.Cornea.ClearV1"
				var glass: StandardMaterial3D = mat.duplicate()
				glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				glass.albedo_texture = null
				glass.albedo_color = Color(0.02, 0.02, 0.02, 0.012) if clear_profile else Color(1, 1, 1, 0.08)
				glass.roughness = 0.06 if clear_profile else 0.015
				glass.clearcoat_enabled = true
				glass.clearcoat = 0.4 if clear_profile else 0.9
				glass.clearcoat_roughness = 0.04 if clear_profile else 0.015
				node.set_surface_override_material(i, glass)
				continue
			var key := ""
			var name_lower = mat.resource_name.to_lower()
			if name_lower in ["human.body", "jnsq.skin.finev1"]: key = "skin"
			elif category in ["hair", "eyebrows", "beard", "eyelashes"]: key = "hair"
			elif category == "eyes": key = "eyes"
			elif category == "clothes": key = "outfit"
			if key != "":
				var fixed: StandardMaterial3D = mat.duplicate()
				fixed.albedo_color = Color.from_string(String(values.get(key, "#ffffff")), Color.WHITE)
				if category == "clothes" and name_lower in ["jnsq.top", "jnsq.bottom"]:
					fixed.albedo_color *= Color.from_string(String(values.get("outfit_" + name_lower.get_slice(".", 1), "#ffffff")), Color.WHITE)
				var original_key="studio_original_texture_"+str(i)
				if not node.has_meta(original_key): node.set_meta(original_key,mat.albedo_texture)
				var data_key="skin_texture_data" if key=="skin" else "eye_texture_data" if category=="eyes" else "hair_texture_data" if category=="hair" else "clothing_texture_data" if category=="clothes" else ""
				if data_key != "":
					var data=String(values.get(data_key,{}).get(mat.resource_name,"")) if category in ["hair","clothes"] else String(values.get(data_key,""))
					if data.begins_with("data:image/png;base64,"):
						var texture_key="studio_texture_hash_"+str(i)
						if node.get_meta(texture_key,0) != hash(data):
							var image=Image.new()
							if image.load_png_from_buffer(Marshalls.base64_to_raw(data.get_slice(",",1)))==OK:
								image.generate_mipmaps()
								fixed.albedo_texture=ImageTexture.create_from_image(image)
								node.set_meta(texture_key,hash(data))
						if category in ["eyes","hair","clothes"]: fixed.albedo_color=Color.WHITE
					else:
						fixed.albedo_texture=node.get_meta(original_key)
						node.set_meta("studio_texture_hash_"+str(i),0)
				if key == "skin" or category == "clothes":
					fixed.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
					fixed.cull_mode = BaseMaterial3D.CULL_DISABLED
				elif category == "eyes":
					# The eyeball is a continuous wet surface, not a hair card.
					fixed.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
					fixed.alpha_antialiasing_mode = BaseMaterial3D.ALPHA_ANTIALIASING_OFF
					var clear_eye = name_lower == "jnsq.eye.clearv1"
					fixed.roughness = 0.25 if clear_eye else 0.10
					fixed.metallic_specular = 0.65
					fixed.clearcoat_enabled = true
					fixed.clearcoat = 0.25 if clear_eye else 0.9
					fixed.clearcoat_roughness = 0.07 if clear_eye else 0.045
				elif category in ["hair", "eyebrows", "beard", "eyelashes"]:
					fixed.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
					fixed.alpha_scissor_threshold = 0.5
					fixed.alpha_antialiasing_mode = BaseMaterial3D.ALPHA_ANTIALIASING_OFF
					fixed.cull_mode = BaseMaterial3D.CULL_DISABLED
					if category in ["eyebrows", "eyelashes"]:
						fixed.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
						fixed.normal_enabled = false
				if category == "eyelashes":
					# Preserve the source texture's tapered, partially transparent tips.
					fixed.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
					fixed.albedo_color.a = 0.85
					fixed.roughness = 0.85
					fixed.metallic_specular = 0.15
					fixed.clearcoat_enabled = false
					fixed.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
				if category == "eyebrows":
					var brow_color=String(values.get("brow_color","#ffffff"))
					# White is an actual brow color, not an implicit hair-color sentinel.
					fixed.albedo_color=Color.from_string(brow_color,Color.WHITE)
					fixed.albedo_color.a=clampf(float(values.get("brow_density",1.0)),0.0,1.0)
					fixed.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
				if key == "skin":
					# Always derive from the imported finish so repeated edits do not
					# progressively polish the skin. Keep regional roughness detail.
					var roughness_key = "studio_original_roughness_" + str(i)
					if not node.has_meta(roughness_key): node.set_meta(roughness_key, mat.roughness)
					fixed.roughness = float(node.get_meta(roughness_key)) * (1.0 - 0.6 * clampf(float(values.get("skin_sheen", 0.0)), 0.0, 1.0))
					fixed.metallic_specular = 0.25
					fixed.normal_scale = 0.65
					# v7 has no authored tangents; this normal-map path produced
					# morph-dependent dark polygons in the compatibility preview.
					# Keep color/roughness detail pending a verified tangent rebuild.
					fixed.normal_enabled = false
				node.set_surface_override_material(i, fixed)
	for child in node.get_children(): appearance(child, values)

static func select_hair(node: Node, selected: String) -> void:
	if node is MeshInstance3D:
		var extra: Dictionary = node.get_meta("extras", {})
		if String(extra.get("jnsq_fit_category", "")) == "hair":
			node.visible = String(extra.get("jnsq_fit_asset_name", "")) == selected
	for child in node.get_children(): select_hair(child, selected)

