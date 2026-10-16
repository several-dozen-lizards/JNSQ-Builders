extends Node3D
var host_url := ""
var pivot: Node3D
var cam: Camera3D
var yaw := 0.0
var pitch := -0.2
var dist := 4.2
var mode := "orbit"
var preview_mode: bool = false
var preview_candidate_id: String = ""
var preview_adapter: Dictionary = {}
var preview_root: Node3D
var preview_status: Label
var preview_head_slider: HSlider
var preview_head_skel: Skeleton3D
var preview_head_bone: int = -1
var preview_head_rest: Quaternion = Quaternion.IDENTITY
var preview_pov_container: SubViewportContainer
var preview_pov_viewport: SubViewport
var preview_pov_camera: Camera3D
var http_preview_meta: HTTPRequest
var http_preview_model: HTTPRequest
var http_preview_receipt: HTTPRequest
var preview_scene_cache: Dictionary = {}
var preview_human_inst: Node3D
var preview_motion_button: Button
var preview_pov_button: Button
var preview_motion_driver: Node3D
var preview_morph_js_callback
var preview_expression_js_callback
var preview_view_js_callback
var avatar_designer_mode := false


func _ready() -> void:
    if not OS.has_feature("web"):
        return
    host_url = String(JavaScriptBridge.eval("window.location.origin"))
    preview_candidate_id = String(JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('candidate_preview') || ''"))
    if preview_candidate_id.length() != 32 or not preview_candidate_id.is_valid_hex_number(false):
        return
    _ready_candidate_preview()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        if event.button_index == MOUSE_BUTTON_WHEEL_UP:
            dist = maxf(0.3, dist * 0.9)
            _update_cam()
        elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
            dist = minf(9.0, dist / 0.9)
            _update_cam()
    elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
        yaw -= event.relative.x * 0.008
        pitch = clampf(pitch - event.relative.y * 0.006, -1.2, 1.2)
        _update_cam()
    elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
        var pixel_scale = 2.0 * dist * tan(deg_to_rad(cam.fov * 0.5)) / maxf(1.0, get_viewport().get_visible_rect().size.y)
        pivot.position += (-cam.global_basis.x * event.relative.x + cam.global_basis.y * event.relative.y) * pixel_scale
        _update_cam()

func _ready_candidate_preview() -> void:
    print("SEALED BODY PREVIEW -> %s (no room connection)" % preview_candidate_id)
    if OS.has_feature("web"):
        avatar_designer_mode = bool(JavaScriptBridge.eval(
                "new URLSearchParams(window.location.search).get('designer') === '1'"))
    _build_candidate_preview_stage()
    if avatar_designer_mode:
        add_child(preload("res://avatar_studio.gd").new())
    if OS.has_feature("web"):
        preview_morph_js_callback = JavaScriptBridge.create_callback(
                _on_preview_morph_js)
        var window = JavaScriptBridge.get_interface("window")
        window.jnsqHumanMorphApply = preview_morph_js_callback
        preview_expression_js_callback = JavaScriptBridge.create_callback(
                _on_preview_expression_js)
        window.jnsqExpressionApply = preview_expression_js_callback
        preview_view_js_callback = JavaScriptBridge.create_callback(_on_designer_view_js)
        window.jnsqDesignerView = preview_view_js_callback
    http_preview_meta = HTTPRequest.new()
    http_preview_model = HTTPRequest.new()
    http_preview_receipt = HTTPRequest.new()
    add_child(http_preview_meta)
    add_child(http_preview_model)
    add_child(http_preview_receipt)
    http_preview_meta.request_completed.connect(_on_preview_meta)
    http_preview_model.request_completed.connect(_on_preview_model)
    http_preview_receipt.request_completed.connect(_on_preview_receipt)
    http_preview_meta.request(host_url + "/api/avatar-bodies/candidates/"
            + preview_candidate_id + "/mapping")


func _preview_label(text: String, size: int = 14) -> Label:
    var label := Label.new()
    label.text = text
    label.add_theme_font_size_override("font_size", size)
    label.add_theme_color_override("font_color", Color(0.86, 0.95, 0.88))
    return label


func _build_candidate_preview_stage() -> void:
    var we := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color(0.025, 0.055, 0.04)
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color(0.82, 0.82, 0.82)
    env.ambient_light_energy = 0.20
    we.environment = env
    add_child(we)
    var key := DirectionalLight3D.new()
    key.rotation_degrees = Vector3(-42, -28, 0)
    key.light_energy = 0.95
    key.shadow_enabled = true
    add_child(key)
    var rim := OmniLight3D.new()
    rim.position = Vector3(-2.0, 2.4, 1.5)
    rim.light_color = Color.WHITE
    rim.light_energy = 0.12
    rim.omni_range = 6.0
    add_child(rim)
    var floor := MeshInstance3D.new()
    var plane := PlaneMesh.new()
    plane.size = Vector2(7.0, 7.0)
    var floor_mat := StandardMaterial3D.new()
    floor_mat.albedo_color = Color(0.07, 0.11, 0.085)
    floor_mat.metallic = 0.15
    floor_mat.roughness = 0.72
    plane.material = floor_mat
    floor.mesh = plane
    add_child(floor)
    preview_root = Node3D.new()
    preview_root.name = "SealedCandidate"
    add_child(preview_root)
    pivot = Node3D.new()
    pivot.position = Vector3(0.0, 1.0, 0.0)
    add_child(pivot)
    cam = Camera3D.new()
    pivot.add_child(cam)
    yaw = 0.45
    pitch = -0.2
    dist = 4.2
    _update_cam()
    cam.current = true
    mode = "orbit"
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    var canvas := CanvasLayer.new()
    add_child(canvas)
    var panel := PanelContainer.new()
    panel.position = Vector2(18, 18)
    panel.custom_minimum_size = Vector2(310, 0)
    var box_style := StyleBoxFlat.new()
    box_style.bg_color = Color(0.025, 0.055, 0.04, 0.94)
    box_style.border_color = Color(0.2, 0.62, 0.36, 0.9)
    box_style.set_border_width_all(1)
    box_style.corner_radius_top_left = 10
    box_style.corner_radius_top_right = 10
    box_style.corner_radius_bottom_left = 10
    box_style.corner_radius_bottom_right = 10
    box_style.content_margin_left = 14
    box_style.content_margin_right = 14
    box_style.content_margin_top = 12
    box_style.content_margin_bottom = 12
    panel.add_theme_stylebox_override("panel", box_style)
    canvas.add_child(panel)
    panel.visible = not avatar_designer_mode
    var column := VBoxContainer.new()
    panel.add_child(column)
    column.add_child(_preview_label("SEALED BODY PREVIEW", 17))
    column.add_child(_preview_label(
            "Testy pilot · quarantine only · no Nexus connection", 13))
    preview_status = _preview_label("Reading inspected adapter…", 14)
    preview_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    column.add_child(preview_status)
    column.add_child(_preview_label("Head rig exercise (degrees)", 13))
    preview_head_slider = HSlider.new()
    preview_head_slider.min_value = -35.0
    preview_head_slider.max_value = 35.0
    preview_head_slider.step = 1.0
    preview_head_slider.value = 0.0
    preview_head_slider.editable = false
    preview_head_slider.value_changed.connect(_on_preview_head_yaw)
    column.add_child(preview_head_slider)
    var view_row := HBoxContainer.new()
    var full_view := Button.new()
    full_view.text = "Full body"
    full_view.pressed.connect(_on_preview_full_body)
    view_row.add_child(full_view)
    var face_view := Button.new()
    face_view.text = "Face view"
    face_view.pressed.connect(_on_preview_face_view)
    view_row.add_child(face_view)
    column.add_child(view_row)
    preview_pov_button = Button.new()
    preview_pov_button.text = "Show mapped POV"
    preview_pov_button.disabled = true
    preview_pov_button.pressed.connect(_on_preview_toggle_pov)
    column.add_child(preview_pov_button)
    preview_motion_button = Button.new()
    preview_motion_button.text = "Play Rokoko idle"
    preview_motion_button.disabled = true
    preview_motion_button.tooltip_text = \
            "Retarget the local watching idle onto this quarantined body."
    preview_motion_button.pressed.connect(_on_preview_play_rokoko)
    column.add_child(preview_motion_button)
    column.add_child(_preview_label(
            "Right-drag: orbit · wheel: zoom · marker: optical origin", 12))
    preview_pov_container = SubViewportContainer.new()
    preview_pov_container.anchor_left = 1.0
    preview_pov_container.anchor_top = 1.0
    preview_pov_container.anchor_right = 1.0
    preview_pov_container.anchor_bottom = 1.0
    preview_pov_container.offset_left = -348.0
    preview_pov_container.offset_top = -226.0
    preview_pov_container.offset_right = -18.0
    preview_pov_container.offset_bottom = -18.0
    preview_pov_container.stretch = true
    preview_pov_container.visible = false
    canvas.add_child(preview_pov_container)
    preview_pov_viewport = SubViewport.new()
    preview_pov_viewport.size = Vector2i(640, 360)
    preview_pov_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    preview_pov_viewport.world_3d = get_viewport().world_3d
    preview_pov_container.add_child(preview_pov_viewport)
    preview_pov_camera = Camera3D.new()
    preview_pov_camera.fov = 68.0
    preview_pov_viewport.add_child(preview_pov_camera)


func _preview_failure(message: String) -> void:
    preview_status.text = message
    if OS.has_feature("web"):
        JavaScriptBridge.eval("window.parent.postMessage(" + JSON.stringify({
            "type": "jnsq-avatar-preview-error", "message": message
        }) + ", window.location.origin)")


func _on_preview_meta(_result: int, code: int, _headers: PackedStringArray,
        body: PackedByteArray) -> void:
    if code != 200:
        _preview_failure("Adapter unavailable (HTTP %d). Nothing loaded." % code)
        return
    var data = JSON.parse_string(body.get_string_from_utf8())
    if not data is Dictionary or not data.get("candidate") is Dictionary:
        _preview_failure("Adapter response was invalid. Nothing loaded.")
        return
    if not data.get("adapter") is Dictionary:
        _preview_failure("Save a semantic adapter before previewing this candidate.")
        return
    var candidate: Dictionary = data["candidate"]
    if String(candidate.get("pilot_target", "")) != "testy_mcprototype":
        _preview_failure("Candidate is outside the Testy pilot lane.")
        return
    preview_adapter = data["adapter"]
    if bool(preview_adapter.get("install_enabled", true)):
        _preview_failure("Unsafe adapter authority refused.")
        return
    preview_status.text = "Adapter %s · loading quarantined GLB…" % \
            String(preview_adapter.get("revision_id", "unknown")).left(8)
    if avatar_designer_mode and preview_scene_cache.has(preview_candidate_id):
        _on_preview_model(0, 200, PackedStringArray(), PackedByteArray())
        return
    http_preview_model.request(host_url + "/api/avatar-bodies/candidates/"
            + preview_candidate_id + "/model?brow_height=local-brows-2&lower_chin=lower-chin-1" + ("&compact=1" if avatar_designer_mode else ""))


func _preview_find_skeleton(node: Node) -> Skeleton3D:
    if node is Skeleton3D:
        return node
    for child in node.get_children():
        var found := _preview_find_skeleton(child)
        if found:
            return found
    return null


func _preview_hide_export_helpers(node: Node) -> PackedStringArray:
    var hidden := PackedStringArray()
    # Human.low-poly is MakeHuman's eye mesh, not a body proxy. A name
    # must never make an anatomical mesh disappear.
    if node is MeshInstance3D and bool(node.get_meta("extras", {}).get("jnsq_export_helper", node.get_meta("jnsq_export_helper", false))):
        node.visible = false
        hidden.append(String(node.name))
    for child in node.get_children():
        hidden.append_array(_preview_hide_export_helpers(child))
    return hidden


func _preview_repair_human_materials(node: Node) -> void:
    # The inspected MPFB starter exports every surface as BLEND, including
    # RGB skin and fully opaque clothing. Restore depth-writing surfaces;
    # retain cutout alpha for the eye/hair/teeth textures that contain it.
    if node is MeshInstance3D and node.mesh:
        for index in range(node.mesh.get_surface_count()):
            var material = node.get_active_material(index)
            if not material is StandardMaterial3D:
                continue
            var name_lower := String(material.resource_name).to_lower()
            var suffix := name_lower.get_slice(".", name_lower.get_slice_count(".") - 1)
            if suffix.is_valid_int():
                name_lower = name_lower.left(name_lower.length() - suffix.length() - 1)
            var opaque := name_lower in ["human.body", "human.male_casualsuit01", "human.tongue01"]
            var cutout := name_lower in ["human.low-poly", "human.short01", "human.teeth_base"]
            if opaque or cutout:
                var fixed: StandardMaterial3D = material.duplicate()
                fixed.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED if opaque else BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
                fixed.alpha_scissor_threshold = 0.5
                node.set_surface_override_material(index, fixed)
    for child in node.get_children():
        _preview_repair_human_materials(child)


func _preview_find_node(node: Node, wanted: String) -> Node3D:
    if node is Node3D and String(node.name) == wanted:
        return node
    for child in node.get_children():
        var found := _preview_find_node(child, wanted)
        if found:
            return found
    return null


func _preview_mapped_transform(inst: Node3D, wanted: String) -> Dictionary:
    var node := _preview_find_node(inst, wanted)
    if node:
        return {"available": true, "transform": node.global_transform,
                "source": "node"}
    var skel := _preview_find_skeleton(inst)
    if skel:
        var index := skel.find_bone(wanted)
        if index >= 0:
            # Imported, animationless GLBs can report a near-identity pose here
            # even though the bone's authored rest transform is correctly
            # positioned in the body.  Semantic mounts are calibration
            # anchors, so resolve them from the stable rest skeleton; live head
            # motion is still applied separately by the preview exercise.
            return {"available": true,
                    "transform": skel.global_transform * skel.get_bone_global_rest(index),
                    "source": "bone_rest"}
    return {"available": false}


func _preview_add_origin_marker(at: Vector3) -> void:
    var marker := MeshInstance3D.new()
    var sphere := SphereMesh.new()
    sphere.radius = 0.045
    sphere.height = 0.09
    var material := StandardMaterial3D.new()
    material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    material.albedo_color = Color(0.2, 1.0, 0.52)
    material.emission_enabled = true
    material.emission = Color(0.1, 1.0, 0.4)
    material.emission_energy_multiplier = 2.5
    sphere.material = material
    marker.mesh = sphere
    add_child(marker)
    marker.global_position = at


func _preview_set_blend_shape(node: Node, wanted: String, value: float) -> bool:
    var changed := false
    if node is MeshInstance3D and (node as MeshInstance3D).mesh:
        var mesh := (node as MeshInstance3D).mesh
        for index in range(mesh.get_blend_shape_count()):
            if String(mesh.get_blend_shape_name(index)).replace("JNSQ_", "JNAIQ_") == wanted.replace("JNSQ_", "JNAIQ_"):
                (node as MeshInstance3D).set_blend_shape_value(index, value)
                changed = true
    for child in node.get_children():
        changed = _preview_set_blend_shape(child, wanted, value) or changed
    return changed


func _preview_has_blend_shape(node: Node, wanted: String) -> bool:
    if node is MeshInstance3D and (node as MeshInstance3D).mesh:
        var mesh := (node as MeshInstance3D).mesh
        for index in range(mesh.get_blend_shape_count()):
            if String(mesh.get_blend_shape_name(index)).replace("JNSQ_", "JNAIQ_") == wanted.replace("JNSQ_", "JNAIQ_"):
                return true
    for child in node.get_children():
        if _preview_has_blend_shape(child, wanted):
            return true
    return false


func _apply_preview_human_morphs(values: Dictionary) -> void:
    if not preview_human_inst:
        return
    var pairs := {
        "ear_point": ["FANTASY_ear_point_Neutral", "FANTASY_ear_point_Full"],
        "ear_tip_angle": ["FANTASY_ear_tip_angle_Forward", "FANTASY_ear_tip_angle_Back"],
        "ear_tip_spread": ["FANTASY_ear_tip_spread_Inward", "FANTASY_ear_tip_spread_Outward"],
        "ear_sweep": ["FANTASY_ear_sweep_Neutral", "FANTASY_ear_sweep_Full"],
        "ear_round": ["FANTASY_ear_round_Neutral", "FANTASY_ear_round_Full"],
        "fangs": ["FANTASY_fangs_Neutral", "FANTASY_fangs_Full"],
        "fangs_protrusion": ["FANTASY_fangs_protrusion_Inside", "FANTASY_fangs_protrusion_Outside"],
        "tusks": ["FANTASY_tusks_Neutral", "FANTASY_tusks_Full"],
        "tusks_protrusion": ["FANTASY_tusks_protrusion_Inside", "FANTASY_tusks_protrusion_Outside"],
        "horns": ["FANTASY_horns_Neutral", "FANTASY_horns_Full"],
        "tail": ["FANTASY_tail_Neutral", "FANTASY_tail_Full"],
        "character_heart": ["RANGE9_character_heart_Neutral", "RANGE9_character_heart_Full"],
        "character_oval": ["RANGE9_character_oval_Neutral", "RANGE9_character_oval_Full"],
        "character_square": ["RANGE9_character_square_Neutral", "RANGE9_character_square_Full"],
        "character_fine": ["RANGE9_character_fine_Neutral", "RANGE9_character_fine_Full"],
        "character_round": ["RANGE9_character_round_Neutral", "RANGE9_character_round_Full"],
        "character_aquiline": ["RANGE9_character_aquiline_Neutral", "RANGE9_character_aquiline_Full"],
        "character_age": ["RANGE9_character_age_Neutral", "RANGE9_character_age_Full"],
        "body_softness": ["RANGE9_body_softness_Neutral", "RANGE9_body_softness_Full"],
        "body_power": ["RANGE9_body_power_Neutral", "RANGE9_body_power_Full"],
        "breast_size": ["JNAIQ_BreastSize_Small", "JNAIQ_BreastSize_Large"],
        "hip_depth": ["JNAIQ_HipDepth_Shallow", "JNAIQ_HipDepth_Full"],
        "upper_lip_volume": ["JNAIQ_UpperLip_Thin", "JNAIQ_UpperLip_Full"],
        "lower_lip_volume": ["JNAIQ_LowerLip_Thin", "JNAIQ_LowerLip_Full"],
        "cupids_bow": ["JNAIQ_CupidsBow_Soft", "JNAIQ_CupidsBow_Defined"],
        "cupids_bow_width": ["JNAIQ_CupidsBow_Narrow", "JNAIQ_CupidsBow_Wide"],
        "outer_lip_width": ["JNAIQ_OuterLips_Narrow", "JNAIQ_OuterLips_Wide"],
        "upper_lip_border": ["JNAIQ_UpperLipBorder_Lower", "JNAIQ_UpperLipBorder_Higher"],
        "lower_lip_border": ["JNAIQ_LowerLipBorder_Lower", "JNAIQ_LowerLipBorder_Higher"],
        "eyelid_fold": ["JNAIQ_EyelidFold_Rounded", "JNAIQ_EyelidFold_Defined"],
        "eyelid_fold_height": ["JNAIQ_EyelidFoldHeight_Low", "JNAIQ_EyelidFoldHeight_High"],
        "lower_lid_volume": ["JNAIQ_LowerLid_Slim", "JNAIQ_LowerLid_Full"],
        "upper_lip_height": ["JNAIQ_UpperLipHeight_Thin", "JNAIQ_UpperLipHeight_Tall"],
        "lower_lip_height": ["JNAIQ_LowerLipHeight_Thin", "JNAIQ_LowerLipHeight_Tall"],
        "lower_nose_projection": ["JNAIQ_LowerNose_Recessed", "JNAIQ_LowerNose_Projected"],
        "nose_bridge_width": ["JNAIQ_NoseBridge_Narrow", "JNAIQ_NoseBridge_Broad"],
        "nose_tip_width": ["JNAIQ_NoseTip_Narrow", "JNAIQ_NoseTip_Broad"],
        "nostril_flare": ["JNAIQ_NostrilFlare_Subtle", "JNAIQ_NostrilFlare_Flared"],
        "alar_groove_definition": ["JNAIQ_AlarGroove_Soft", "JNAIQ_AlarGroove_Defined"],
        "jaw_corner": ["JNAIQ_JawCorner_Soft", "JNAIQ_JawCorner_Defined"],
        "eye_openness": ["JNAIQ_EyeOpening_Narrow", "JNAIQ_EyeOpening_Round"],
        "eye_tilt": ["JNAIQ_EyeTilt_Down", "JNAIQ_EyeTilt_Up"],
        "outer_lid_height": ["JNAIQ_OuterLidHeight_Down", "JNAIQ_OuterLidHeight_Up"],
        "eye_angle": ["JNAIQ_EyeAngle_Down", "JNAIQ_EyeAngle_Up"],
        "inner_eye_fold": ["JNAIQ_InnerEyeFold_In", "JNAIQ_InnerEyeFold_Out"],
        "inner_lid_opening": ["JNAIQ_InnerLidOpening_Low", "JNAIQ_InnerLidOpening_High"],
        "outer_lid_opening": ["JNAIQ_OuterLidOpening_Low", "JNAIQ_OuterLidOpening_High"],

        "mouth_position": ["JNAIQ_MouthPosition_Lower", "JNAIQ_MouthPosition_Higher"],
        "lip_height": ["JNAIQ_LipHeight_Short", "JNAIQ_LipHeight_Tall"],
        "facial_definition": ["JNAIQ_FacialDefinition_Soft", "JNAIQ_FacialDefinition_Defined"],
        "cheek_volume": ["JNAIQ_CheekVolume_Sunken", "JNAIQ_CheekVolume_Full"],
        "temple_definition": ["JNAIQ_Temples_Full", "JNAIQ_Temples_Hollow"],
        "eye_socket_depth": ["JNAIQ_Socket_Shallow", "JNAIQ_Socket_Deep"],
        "mouth_corner_shape": ["JNAIQ_MouthCorner_Down", "JNAIQ_MouthCorner_Up"],
        "forehead_slope": ["JNAIQ_Forehead_Upright", "JNAIQ_Forehead_Sloped"],
        "under_jaw_fullness": ["JNAIQ_UnderJaw_Tucked", "JNAIQ_UnderJaw_Full"],
        "jowl_volume": ["JNAIQ_Jowl_Taut", "JNAIQ_Jowl_Full"],
        "double_chin_volume": ["JNAIQ_DoubleChin_Lean", "JNAIQ_DoubleChin_Full"],
        "neck_fullness": ["JNAIQ_Neck_Lean", "JNAIQ_Neck_Full"],
        "face_neck_fullness": ["JNAIQ_FaceNeck_Lean", "JNAIQ_FaceNeck_Full"],
        "fullness_temples": ["JNAIQ_Fullness_temples_Less", "JNAIQ_Fullness_temples_More"],
        "fullness_upper_cheeks": ["JNAIQ_Fullness_upper_cheeks_Less", "JNAIQ_Fullness_upper_cheeks_More"],
        "fullness_mouth_sides": ["JNAIQ_Fullness_mouth_sides_Less", "JNAIQ_Fullness_mouth_sides_More"],
        "fullness_lower_cheeks": ["JNAIQ_Fullness_lower_cheeks_Less", "JNAIQ_Fullness_lower_cheeks_More"],
        "fullness_jowls": ["JNAIQ_Fullness_jowls_Less", "JNAIQ_Fullness_jowls_More"],
        "fullness_chin": ["JNAIQ_Fullness_chin_Less", "JNAIQ_Fullness_chin_More"],
        "fullness_under_chin": ["JNAIQ_Fullness_under_chin_Less", "JNAIQ_Fullness_under_chin_More"],
        "fullness_neck_sides": ["JNAIQ_Fullness_neck_sides_Less", "JNAIQ_Fullness_neck_sides_More"],
        "fullness_nape": ["JNAIQ_Fullness_nape_Less", "JNAIQ_Fullness_nape_More"],
        "nose_tip_roundness": ["JNAIQ_NoseTip_Angular", "JNAIQ_NoseTip_Bulbous"],
        "lip_taper": ["JNAIQ_LipCorners_Tapered", "JNAIQ_LipCorners_Full"],
        "lip_projection": ["JNAIQ_Lips_Recessed", "JNAIQ_Lips_Projected"],
        "mouth_projection": ["JNAIQ_Mouth_Recessed", "JNAIQ_Mouth_Forward"],
        "kay_head_envelope": ["JNAIQ_KayHeadEnvelope_Neutral", "JNAIQ_KayHeadEnvelope_Full"],
        "kay_facial_structure": ["JNAIQ_KayFacialStructure_Neutral", "JNAIQ_KayFacialStructure_Full"],
        "body_frame": ["JNAIQ_BodyFrame_Feminine", "JNAIQ_BodyFrame_Masculine"],
        "stature": ["JNAIQ_Stature_Short", "JNAIQ_Stature_Tall"],
        "body_mass": ["JNAIQ_BodyMass_Light", "JNAIQ_BodyMass_Full"],
        "muscularity": ["JNAIQ_Muscularity_Soft", "JNAIQ_Muscularity_Strong"],
        "proportions": ["JNAIQ_Proportions_Compact", "JNAIQ_Proportions_Elongated"],
        "shoulder_width": ["JNAIQ_ShoulderWidth_Narrow", "JNAIQ_ShoulderWidth_Wide"],
        "hip_width": ["JNAIQ_HipWidth_Narrow", "JNAIQ_HipWidth_Wide"],
        "torso_length": ["JNAIQ_TorsoLength_Short", "JNAIQ_TorsoLength_Long"],
        "arm_length": ["JNAIQ_ArmLength_Short", "JNAIQ_ArmLength_Long"],
        "leg_length": ["JNAIQ_LegLength_Short", "JNAIQ_LegLength_Long"],
        "head_scale": ["JNAIQ_HeadScale_Small", "JNAIQ_HeadScale_Large"],
        "jaw_width": ["JNAIQ_JawWidth_Narrow", "JNAIQ_JawWidth_Wide"],
        "chin_height": ["JNAIQ_ChinHeight_Short", "JNAIQ_ChinHeight_Long"],
        "cheekbones": ["JNAIQ_Cheekbones_Soft", "JNAIQ_Cheekbones_Prominent"],
        "cheekbone_height": ["JNAIQ_CheekboneHeight_Lower", "JNAIQ_CheekboneHeight_Higher"],
        "nose_size": ["JNAIQ_NoseSize_Small", "JNAIQ_NoseSize_Large"],
        "nose_curve": ["JNAIQ_NoseCurve_Concave", "JNAIQ_NoseCurve_Convex"],
        "nose_tip_angle": ["JNAIQ_NoseTip_Down", "JNAIQ_NoseTip_Up"],
        "nose_tip_rotation": ["JNAIQ_NoseTipAngle_Down", "JNAIQ_NoseTipAngle_Up"],
        "nostril_angle": ["JNAIQ_NostrilAngle_Down", "JNAIQ_NostrilAngle_Up"],
        "nostril_width": ["JNAIQ_NostrilWidth_Narrow", "JNAIQ_NostrilWidth_Wide"],
        "nose_projection": ["JNAIQ_NoseProjection_Recessed", "JNAIQ_NoseProjection_Forward"],
        "nose_vertical": ["JNAIQ_NoseVertical_Low", "JNAIQ_NoseVertical_High"],
        "septum_angle": ["JNAIQ_SeptumAngle_Low", "JNAIQ_SeptumAngle_High"],
        "jaw_angle": ["JNAIQ_JawAngle_Raised", "JNAIQ_JawAngle_Dropped"],
        "jaw_projection": ["JNAIQ_JawProjection_Recessed", "JNAIQ_JawProjection_Forward"],
        "jaw_definition": ["JNAIQ_JawDefinition_Soft", "JNAIQ_JawDefinition_Angular"],
        "chin_projection": ["JNAIQ_ChinProjection_Recessed", "JNAIQ_ChinProjection_Prominent"],
        "lower_chin_width": ["JNAIQ_LowerChinWidth_Narrow", "JNAIQ_LowerChinWidth_Wide"],
        "nose_sidewall_width": ["JNAIQ_NoseSidewalls_Narrow", "JNAIQ_NoseSidewalls_Wide"],
        "lower_chin_projection": ["JNAIQ_LowerChinProjection_Recessed", "JNAIQ_LowerChinProjection_Projected"],
        "eye_size": ["JNAIQ_EyeSize_Small", "JNAIQ_EyeSize_Large"],
        "eye_spacing": ["JNAIQ_EyeSpacing_Close", "JNAIQ_EyeSpacing_Wide"],
        "mouth_width": ["JNAIQ_MouthWidth_Narrow", "JNAIQ_MouthWidth_Wide"],
        "ear_size": ["JNAIQ_EarSize_Small", "JNAIQ_EarSize_Large"],
        "brow_height": ["JNAIQ_BrowHeight_Low", "JNAIQ_BrowHeight_High"],
        "philtrum_depth": ["JNAIQ_Philtrum_Shallow", "JNAIQ_Philtrum_Deep"],
        "nasolabial_definition": ["JNAIQ_Nasolabial_Soft", "JNAIQ_Nasolabial_Defined"],
        "midface_projection": ["JNAIQ_Midface_Recessed", "JNAIQ_Midface_Projected"],
        "brow_angle": ["JNAIQ_BrowAngle_Up", "JNAIQ_BrowAngle_Down"],
        "brow_projection": ["JNAIQ_BrowProjection_Recessed", "JNAIQ_BrowProjection_Prominent"],
        "brow_width": ["JNAIQ_BrowWidth_Narrow", "JNAIQ_BrowWidth_Wide"],
        "brow_arch": ["JNAIQ_BrowArch_Flat", "JNAIQ_BrowArch_Arched"],
        "brow_inner_horizontal": ["JNAIQ_BrowInner_Inward", "JNAIQ_BrowInner_Outward"],
        "brow_inner_vertical": ["JNAIQ_BrowInner_Lower", "JNAIQ_BrowInner_Higher"],
        "brow_arch_horizontal": ["JNAIQ_BrowArch_Inward", "JNAIQ_BrowArch_Outward"],
        "brow_arch_vertical": ["JNAIQ_BrowArch_Lower", "JNAIQ_BrowArch_Higher"],
        "brow_tail_horizontal": ["JNAIQ_BrowTail_Inward", "JNAIQ_BrowTail_Outward"],
        "brow_tail_vertical": ["JNAIQ_BrowTail_Lower", "JNAIQ_BrowTail_Higher"],
        "brow_hair_thickness": ["JNAIQ_BrowHair_Thin", "JNAIQ_BrowHair_Thick"],
        "brow_hair_length": ["JNAIQ_BrowHair_Short", "JNAIQ_BrowHair_Long"],
        "body_adiposity": ["JNAIQ_Adiposity_Less", "JNAIQ_Adiposity_More"],
        "fat_upper_abdomen": ["JNAIQ_Fat_upper_abdomen_Less", "JNAIQ_Fat_upper_abdomen_More"],
        "fat_lower_abdomen": ["JNAIQ_Fat_lower_abdomen_Less", "JNAIQ_Fat_lower_abdomen_More"],
        "fat_waist": ["JNAIQ_Fat_waist_Less", "JNAIQ_Fat_waist_More"],
        "fat_upper_back": ["JNAIQ_Fat_upper_back_Less", "JNAIQ_Fat_upper_back_More"],
        "fat_chest": ["JNAIQ_Fat_chest_Less", "JNAIQ_Fat_chest_More"],
        "fat_seat": ["JNAIQ_Fat_seat_Less", "JNAIQ_Fat_seat_More"],
        "fat_outer_thighs": ["JNAIQ_Fat_outer_thighs_Less", "JNAIQ_Fat_outer_thighs_More"],
        "fat_inner_thighs": ["JNAIQ_Fat_inner_thighs_Less", "JNAIQ_Fat_inner_thighs_More"],
        "fat_upper_arms": ["JNAIQ_Fat_upper_arms_Less", "JNAIQ_Fat_upper_arms_More"],
        "fat_calves": ["JNAIQ_Fat_calves_Less", "JNAIQ_Fat_calves_More"],
        "fat_belly_hang": ["JNAIQ_Fat_belly_hang_Less", "JNAIQ_Fat_belly_hang_More"],
    }
    for control in pairs:
        if not values.has(control):
            continue
        var position := clampf(float(values[control]), 0.0, 1.25 if control == "lower_nose_projection" else 1.0)
        var names: Array = pairs[control]
        var gate := maxf(0.0, (float(values.get("face_neck_fullness", 0.5)) - 0.5) * 2.0) if control.begins_with("fullness_") else (maxf(0.0, (float(values.get("body_adiposity", 0.5)) - 0.5) * 2.0) if control.begins_with("fat_") else 1.0)
        if control in ["fangs_protrusion", "tusks_protrusion"]:
            gate = maxf(0.0, (float(values.get(control.trim_suffix("_protrusion"), 0.5)) - 0.5) * 2.0)
        if control in ["ear_tip_angle", "ear_tip_spread"]:
            gate = maxf(0.0, (float(values.get("ear_point", 0.5)) - 0.5) * 2.0)
        _preview_set_blend_shape(preview_human_inst, names[0],
                maxf(0.0, (0.5 - position) * 2.0) * gate)
        _preview_set_blend_shape(preview_human_inst, names[1],
                maxf(0.0, (position - 0.5) * 2.0) * gate)
    var anchor_total := 0.0
    for control in pairs:
        if control.begins_with("character_") and control != "character_age":
            anchor_total += maxf(0.0, (float(values.get(control, 0.5)) - 0.5) * 2.0)
    for control in pairs:
        if control.begins_with("character_") and control != "character_age":
            _preview_set_blend_shape(preview_human_inst, pairs[control][1], maxf(0.0, (float(values.get(control, 0.5)) - 0.5) * 2.0) / maxf(1.0, anchor_total))


func _on_preview_morph_js(args: Array) -> void:
    if args.is_empty():
        return
    var values = JSON.parse_string(String(args[0]))
    if values is Dictionary:
        _apply_preview_human_morphs(values)


func _apply_preview_expressions(values: Dictionary) -> void:
    if not preview_human_inst:
        return
    var morphs := {
        "blink_left": "JNAIQ_Expr_BlinkLeft",
        "blink_right": "JNAIQ_Expr_BlinkRight",
        "mouth_open": "JNAIQ_Expr_MouthOpen",
        "smile": "JNAIQ_Expr_Smile",
        "frown": "JNAIQ_Expr_Frown",
        "pucker": "JNAIQ_Expr_Pucker",
        "mouth_wide": "JNAIQ_Expr_MouthWide",
    }
    for control in morphs:
        var value := clampf(float(values.get(control, 0.0)), 0.0, 1.0)
        _preview_set_blend_shape(preview_human_inst, morphs[control], value)


func _on_preview_expression_js(args: Array) -> void:
    if args.is_empty():
        return
    var values = JSON.parse_string(String(args[0]))
    if values is Dictionary:
        _apply_preview_expressions(values)


func _on_preview_model(_result: int, code: int, _headers: PackedStringArray,
        body: PackedByteArray) -> void:
    var preview_import_started := Time.get_ticks_msec()
    if code != 200:
        _preview_failure("Candidate model unavailable (HTTP %d)." % code)
        return
    var inst: Node
    if avatar_designer_mode and preview_scene_cache.has(preview_candidate_id):
        var cached: PackedScene = preview_scene_cache[preview_candidate_id]
        preview_scene_cache.erase(preview_candidate_id)
        preview_scene_cache[preview_candidate_id] = cached
        inst = cached.instantiate()
    else:
        var document := GLTFDocument.new()
        var state := GLTFState.new()
        body = preload("res://published_avatar.gd").scene_bytes(body)
        if document.append_from_buffer(body, "", state) != OK:
            _preview_failure("Godot refused the quarantined GLB.")
            return
        inst = document.generate_scene(state)
        preload("res://published_avatar.gd").apply_morph_defaults(inst)
        if avatar_designer_mode and inst is Node3D:
            var packed := PackedScene.new()
            if packed.pack(inst) == OK:
                # Keep just the current and previous outfit, sharing immutable mesh
                # resources. Revisiting either avoids GLB parsing and image decoding.
                while preview_scene_cache.size() >= 2:
                    preview_scene_cache.erase(preview_scene_cache.keys()[0])
                preview_scene_cache[preview_candidate_id] = packed
    if not inst is Node3D:
        _preview_failure("Candidate produced no 3D scene.")
        return
    inst.set_script(preload("res://avatar_life.gd"))
    if avatar_designer_mode and is_instance_valid(preview_human_inst):
        preview_human_inst.queue_free()
    preview_root.add_child(inst)
    preview_human_inst = inst
    if avatar_designer_mode:
        inst.set_process(false)
    var hidden_helpers := _preview_hide_export_helpers(inst)
    if _preview_has_blend_shape(inst, "JNAIQ_BodyFrame_Feminine"):
        _preview_repair_human_materials(inst)
    if avatar_designer_mode:
        cam.fov = 35.0
    # Godot's mesh AABB encloses every blend-shape extreme.  The paired
    # MakeHuman controls therefore describe a larger audition envelope than
    # the neutral body actually occupies.  Compensate only this known family;
    # ordinary imported candidates retain the established two-metre fit.
    var fit_target := 2.8 if _preview_has_blend_shape(
            inst, "JNAIQ_Stature_Tall") else 2.0
    _fit_model(inst, fit_target, true)
    inst.set_meta("studio_origin", inst.position)
    print("avatar_preview_import_ms=", Time.get_ticks_msec()-preview_import_started, " candidate=", preview_candidate_id)
    if OS.has_feature("web"):
        JavaScriptBridge.eval(
                "window.parent.postMessage({type:'jnsq-human-morph-ready'}, window.location.origin)")
    var roles: Dictionary = preview_adapter.get("roles", {})
    var head_name := String(roles.get("head", ""))
    var head_resolved := false
    preview_head_skel = _preview_find_skeleton(inst)
    if preview_head_skel and head_name != "":
        preview_head_bone = preview_head_skel.find_bone(head_name)
        if preview_head_bone >= 0:
            head_resolved = true
            preview_head_rest = preview_head_skel.get_bone_pose_rotation(
                    preview_head_bone)
            preview_head_slider.editable = true
    var optical: Dictionary = preview_adapter.get("optical_origin", {})
    var optical_name := String(optical.get("node", ""))
    var mount := _preview_mapped_transform(inst, optical_name)
    var mount_text := "optical origin unavailable"
    var optical_position := Vector3.ZERO
    var optical_resolved := false
    var pov_ready := false
    if bool(mount.get("available", false)):
        var xf: Transform3D = mount["transform"]
        var raw_offset = optical.get("offset_m", [0.0, 0.0, 0.0])
        var offset := Vector3(float(raw_offset[0]), float(raw_offset[1]),
                float(raw_offset[2]))
        var origin := xf.origin + xf.basis * offset
        optical_position = origin
        optical_resolved = true
        if not avatar_designer_mode:
            _preview_add_origin_marker(origin)
        mount_text = "%s via %s at (%.2f, %.2f, %.2f)m" % [
                optical_name, String(mount.get("source", "mapping")),
                origin.x, origin.y, origin.z]
        var raw_forward = optical.get("forward_axis_local")
        var raw_up = optical.get("up_axis_local")
        if raw_forward is Array and raw_forward.size() == 3 \
                and raw_up is Array and raw_up.size() == 3:
            var forward_local := Vector3(float(raw_forward[0]),
                    float(raw_forward[1]), float(raw_forward[2]))
            var up_local := Vector3(float(raw_up[0]), float(raw_up[1]),
                    float(raw_up[2]))
            var forward_global := (xf.basis * forward_local).normalized()
            var up_global := (xf.basis * up_local).normalized()
            if forward_global.cross(up_global).length() > 0.99:
                preview_pov_camera.global_position = origin
                preview_pov_camera.look_at(origin + forward_global, up_global)
                preview_pov_camera.current = true
                pov_ready = true
    preview_status.text = "Adapter %s rendered. Head: %s. Optical: %s.\n" \
            % [String(preview_adapter.get("revision_id", "unknown")).left(8),
                (head_name if head_name != "" else "unmapped"), mount_text] \
            + ("POV inset uses the mapped local forward/up vectors."
                if pov_ready else
                "POV direction remains unverified until forward/up axes are mapped.")
    if not hidden_helpers.is_empty():
        preview_status.text += "\nHidden export helper: %s." % ", ".join(hidden_helpers)
    preview_pov_container.visible = false
    preview_pov_button.disabled = not pov_ready
    preview_pov_button.text = "Show mapped POV"
    preview_motion_button.disabled = _preview_find_skeleton(inst) == null
    var receipt := {
        "revision_id": String(preview_adapter.get("revision_id", "")),
        "renderer": "godot", "outcome": "rendered",
        "room_connected": false,
        "head_role": head_name, "head_resolved": head_resolved,
        "optical_node": optical_name, "optical_resolved": optical_resolved,
        "pov_ready": pov_ready,
        "optical_position_m": [optical_position.x, optical_position.y,
                optical_position.z]}
    _capture_preview_receipt.call_deferred(receipt)


func _capture_preview_receipt(receipt: Dictionary) -> void:
    await RenderingServer.frame_post_draw
    await RenderingServer.frame_post_draw
    await RenderingServer.frame_post_draw
    var image := get_viewport().get_texture().get_image()
    var png := image.save_png_to_buffer()
    receipt["frame_data_url"] = "data:image/png;base64," \
            + Marshalls.raw_to_base64(png)
    if bool(receipt.get("pov_ready", false)):
        var pov_image := preview_pov_viewport.get_texture().get_image()
        var pov_png := pov_image.save_png_to_buffer()
        receipt["pov_frame_data_url"] = "data:image/png;base64," \
                + Marshalls.raw_to_base64(pov_png)
    http_preview_receipt.request(
            host_url + "/api/avatar-bodies/candidates/" + preview_candidate_id
            + "/preview-receipts", ["Content-Type: application/json"],
            HTTPClient.METHOD_POST, JSON.stringify(receipt))


func _on_preview_receipt(_result: int, code: int, _headers: PackedStringArray,
        _body: PackedByteArray) -> void:
    if code == 200:
        print("SEALED PREVIEW RECEIPT: rendered, room_connected=false")
    else:
        push_warning("sealed preview receipt refused (HTTP %d)" % code)


func _on_preview_play_rokoko() -> void:
    pass


func _on_preview_toggle_pov() -> void:
    if preview_pov_button.disabled:
        return
    preview_pov_container.visible = not preview_pov_container.visible
    preview_pov_button.text = \
            ("Hide mapped POV" if preview_pov_container.visible else "Show mapped POV")


func _on_preview_head_yaw(value: float) -> void:
    if preview_head_skel and preview_head_bone >= 0:
        preview_head_skel.set_bone_pose_rotation(preview_head_bone,
                preview_head_rest * Quaternion(Vector3.UP, deg_to_rad(value)))


func _on_preview_full_body() -> void:
    pivot.position = Vector3(0.0, 1.0, 0.0)
    yaw = 0.45
    pitch = -0.2
    dist = 4.2
    _update_cam()


func _on_designer_view_js(args: Array) -> void:
    if args.is_empty() or not avatar_designer_mode:
        return
    match String(args[0]):
        "face":
            _on_preview_face_view()
        "body":
            _on_preview_full_body()
        "front":
            yaw = 0.0
            _update_cam()
        "side":
            yaw = PI * 0.5
            _update_cam()
        "back":
            yaw = PI
            _update_cam()


func _preview_eye_mesh(node: Node) -> MeshInstance3D:
    if node is MeshInstance3D and String(node.get_meta("extras", {}).get("jnsq_fit_category", "")) == "eyes":
        return node
    for child in node.get_children():
        var found := _preview_eye_mesh(child)
        if found:
            return found
    return null


func _on_preview_face_view() -> void:
    # Use the selected eye geometry: morph envelopes and imported body scale
    # do not give a reliable fixed world-space height for a close-up.
    if avatar_designer_mode and is_instance_valid(preview_human_inst):
        var eyes := _preview_eye_mesh(preview_human_inst)
        if eyes and eyes.mesh:
            var total := Vector3.ZERO
            var count := 0
            for surface in eyes.mesh.get_surface_count():
                var base: PackedVector3Array = eyes.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
                var selected := base.duplicate()
                var shapes := eyes.mesh.surface_get_blend_shape_arrays(surface)
                for shape in mini(eyes.mesh.get_blend_shape_count(), shapes.size()):
                    var weight := eyes.get_blend_shape_value(shape)
                    if absf(weight) < 0.000001:
                        continue
                    var positions: PackedVector3Array = shapes[shape][Mesh.ARRAY_VERTEX]
                    if positions.size() != selected.size():
                        continue
                    for i in selected.size():
                        selected[i] += (positions[i] - base[i] if eyes.mesh.blend_shape_mode == Mesh.BLEND_SHAPE_MODE_NORMALIZED else positions[i]) * weight
                for point in selected:
                    total += point
                    count += 1
            if count > 0:
                var scale_y := eyes.global_basis.get_scale().y
                pivot.global_position = eyes.global_transform * (total / count) + Vector3(0, -0.035, -0.065) * scale_y
                dist = 0.46 * scale_y / (2.0 * tan(deg_to_rad(cam.fov * 0.5)))
                yaw = 0.0
                pitch = 0.0
                _update_cam()
                return
    # Explicit inspection view only; optical mapping and candidate state stay
    # untouched.
    # The preview's evidence panel occupies the upper-left.  Aim left of the
    # body so the face projects into the unobscured upper-right inspection
    # area instead of hiding beneath the panel.
    pivot.position = Vector3(-0.62, 1.70, 0.0)
    if avatar_designer_mode:
        pivot.position = Vector3(0.0, 1.70, 0.0)
    yaw = 0.0
    pitch = 0.0
    dist = 0.65
    _update_cam()


func _update_cam() -> void:
    # Build the orbit once in world space. Rotating the parent AND using
    # a rotated local offset double-applies the handoff yaw.
    pivot.rotation = Vector3.ZERO
    var cp := cos(pitch)
    var offset := Vector3(sin(yaw) * cp, -sin(pitch),
            cos(yaw) * cp) * dist
    cam.global_position = pivot.global_position + offset
    cam.look_at(pivot.global_position)

func _merge_aabb(node: Node, xf: Transform3D, acc: Array) -> void:
    # acc = [has_any: bool, box: AABB] -- accumulated in ROOT space
    var x := xf
    if node is Node3D:
        x = xf * (node as Node3D).transform
    if node is MeshInstance3D and (node as MeshInstance3D).mesh:
        var ab: AABB = x * (node as MeshInstance3D).mesh.get_aabb()
        if acc[0]:
            acc[1] = (acc[1] as AABB).merge(ab)
        else:
            acc[0] = true
            acc[1] = ab
    elif node is MultiMeshInstance3D and (node as MultiMeshInstance3D).multimesh:
        var ab: AABB = x * (node as MultiMeshInstance3D).multimesh.get_aabb()
        acc[1] = (acc[1] as AABB).merge(ab) if acc[0] else ab
        acc[0] = true
    for c in node.get_children():
        _merge_aabb(c, x, acc)

func _fit_model(inst: Node3D, target_m: float, fit_height: bool) -> float:
    # Uniform-scale the instance so its bounding box meets target_m
    # (height for avatars, largest horizontal extent for furniture),
    # then drop its feet to the floor. Returns the fitted height so
    # labels can sit above whatever the model turned out to be.
    var acc := [false, AABB()]
    _merge_aabb(inst, Transform3D.IDENTITY, acc)
    if not acc[0]:
        return 0.0
    var ab: AABB = acc[1]
    var extent := ab.size.y if fit_height \
            else maxf(ab.size.x, ab.size.z)
    if extent < 0.0001:
        return 0.0
    var s := target_m / extent
    inst.scale = Vector3(s, s, s)
    if fit_height:
        print("FIT %s: aabb_min_y=%.3f size_y=%.3f scale=%.3f -> drop=%.3f"
                % [inst.name, ab.position.y, ab.size.y, s,
                -ab.position.y * s])
    # feet on the floor AND centered on the world position -- model
    # authors put origins anywhere (corners, one end, mid-air); the
    # world's position_m means the CENTER of the thing.
    inst.position.x = -(ab.position.x + ab.size.x * 0.5) * s
    inst.position.z = -(ab.position.z + ab.size.z * 0.5) * s
    inst.position.y = -ab.position.y * s
    return ab.size.y * s

