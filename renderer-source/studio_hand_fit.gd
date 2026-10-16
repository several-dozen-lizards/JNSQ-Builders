extends RefCounted
## Anatomical joint helpers sampled from the same MPFB shapes as the skin.
## Rebind as well as reposition: the mesh must stay unchanged in its rest pose.
var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string('res://studio_hand_joints.json'))
var skeleton: Skeleton3D
var original: Array[Transform3D] = []
var skins: Array = []
var body: MeshInstance3D
var last_weights := {}

func scan(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		if node.name == 'Human': body=node
		if node.skin:
			var poses: Array[Transform3D]=[]
			for i in node.skin.get_bind_count(): poses.append(node.skin.get_bind_pose(i))
			node.skin=node.skin.duplicate()
			skins.append([node.skin,poses])
	for child in node.get_children(): scan(child)

func install(target: Skeleton3D) -> void:
	skeleton=target
	for i in target.get_bone_count(): original.append(target.get_bone_global_rest(i))
	scan(target.get_parent())

func update() -> bool:
	if not is_instance_valid(body) or not is_instance_valid(skeleton): return false
	var weights := {}
	for i in body.mesh.get_blend_shape_count():
		# Older assemblies keep the JNSQ prefix; helpers use the current name.
		var name=String(body.mesh.get_blend_shape_name(i)).replace('JNSQ_', 'JNAIQ_')
		if data.targets.has(name): weights[name]=body.get_blend_shape_value(i)
	# Only compiled builder bodies have these paired shape controls.
	if not weights.has('JNAIQ_BodyFrame_Feminine'): return false
	if weights==last_weights: return false
	last_weights=weights
	var fitted: Array[Transform3D]=original.duplicate()
	for name in data.basis:
		var i=skeleton.find_bone(name)
		if i<0: continue
		var a=data.basis[name]
		var head=Vector3(a[0][0],a[0][1],a[0][2])
		var tail=Vector3(a[1][0],a[1][1],a[1][2])
		for shape in weights:
			if absf(weights[shape])<0.000001: continue
			var d=data.targets[shape][name]
			head+=Vector3(d[0][0],d[0][1],d[0][2])*weights[shape]
			tail+=Vector3(d[1][0],d[1][1],d[1][2])*weights[shape]
		# The compiled assembly uses world metres, matching skeleton coordinates.
		var basis=Basis(Quaternion(original[i].basis.y.normalized(),(tail-head).normalized()))*original[i].basis
		fitted[i]=Transform3D(basis,head)
	for i in skeleton.get_bone_count():
		var parent=skeleton.get_bone_parent(i)
		skeleton.set_bone_rest(i,fitted[i] if parent<0 else fitted[parent].affine_inverse()*fitted[i])
	for row in skins:
		var skin: Skin=row[0]
		for bind in skin.get_bind_count():
			var bone=skeleton.find_bone(skin.get_bind_name(bind))
			if bone<0: bone=skin.get_bind_bone(bind)
			if bone>=0 and bone<fitted.size(): skin.set_bind_pose(bind,fitted[bone].affine_inverse()*original[bone]*row[1][bind])
	skeleton.reset_bone_poses()
	skeleton.force_update_all_bone_transforms()
	return true
