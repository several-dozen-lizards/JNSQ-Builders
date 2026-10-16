extends RefCounted
## Godot reparents disconnected skinned meshes under their skeleton. Remove
## render payloads outside the selected glTF scene before it can revive them.
static func scene_bytes(bytes: PackedByteArray) -> PackedByteArray:
	if bytes.size() < 20 or bytes.decode_u32(0) != 0x46546c67:
		return bytes
	var length := bytes.decode_u32(12)
	if bytes.decode_u32(4) != 2 or bytes.decode_u32(8) != bytes.size() or bytes.decode_u32(16) != 0x4e4f534a or length > bytes.size()-20:
		return bytes
	var model = JSON.parse_string(bytes.slice(20, 20 + length).get_string_from_utf8())
	if not model is Dictionary: return bytes
	var nodes: Array = model.get("nodes", [])
	var scenes: Array = model.get("scenes", [])
	if scenes.is_empty(): return bytes
	var selected := int(model.get("scene", 0))
	if selected < 0 or selected >= scenes.size(): return bytes
	var reachable := {}
	var pending: Array = scenes[selected].get("nodes", []).duplicate()
	while not pending.is_empty():
		var index: int = pending.pop_back()
		if index < 0 or index >= nodes.size(): return bytes
		if reachable.has(index): continue
		reachable[index] = true
		pending.append_array(nodes[index].get("children", []))
	for index in nodes.size():
		if not reachable.has(index) or bool(nodes[index].get("extras", {}).get("jnsq_export_helper", false)):
			nodes[index].erase("mesh")
			nodes[index].erase("skin")
		elif nodes[index].has("mesh"):
			var mesh_index=int(nodes[index].mesh)
			var meshes=model.get("meshes",[])
			if mesh_index>=0 and mesh_index<meshes.size():
				var mesh=meshes[mesh_index]
				var names=mesh.get("extras",{}).get("targetNames",[])
				var weights=nodes[index].get("weights",mesh.get("weights",[]))
				var defaults={}
				for i in mini(names.size(),weights.size()):
					if weights[i] is float or weights[i] is int:
						if is_finite(float(weights[i])): defaults[String(names[i])]=float(weights[i])
				var extras=nodes[index].get("extras",{})
				extras["jnsq_import_morph_defaults"]=defaults
				nodes[index]["extras"]=extras
	var json := JSON.stringify(model).to_utf8_buffer()
	while json.size() % 4: json.append(32)
	var result := bytes.slice(0, 20)
	result.encode_u32(12, json.size())
	result.append_array(json)
	result.append_array(bytes.slice(20 + length))
	result.encode_u32(8, result.size())
	return result

static func apply_morph_defaults(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		var defaults=node.get_meta("extras",{}).get("jnsq_import_morph_defaults",{})
		for i in node.mesh.get_blend_shape_count():
			var name=String(node.mesh.get_blend_shape_name(i))
			if defaults.has(name): node.set_blend_shape_value(i,float(defaults[name]))
	for child in node.get_children(): apply_morph_defaults(child)
