extends RefCounted
## Sample the mounted skin, not a fixed chair-height pelvis drop.
var samples: Array = []
var thigh_samples := {"L":[],"R":[]}
var hand_samples := {"L":[],"R":[]}
var head_samples: Array = []
var skeleton: Skeleton3D
var pelvis := -1
var body_height := 1.75
var base_position := Vector3.ZERO
var ready := false
var hip_supported := false

func prepare(body: Node3D, skel: Skeleton3D) -> void:
	skeleton = skel
	base_position = body.position
	for name in ["Hips", "Coccyx-pelvis", "Coccyxpelvis", "root", "mixamorigHips"]:
		pelvis = skel.find_bone(name)
		if pelvis >= 0: break
	if pelvis < 0:
		for i in skel.get_bone_count():
			if "coccyx" in skel.get_bone_name(i).to_lower():
				pelvis = i
				break
	if pelvis < 0: return
	var low := INF
	var high := -INF
	for i in skel.get_bone_count():
		var y := skel.get_bone_global_rest(i).origin.y
		low = minf(low, y)
		high = maxf(high, y)
	var local_height := maxf(.01, high-low)
	body_height = local_height * skel.global_basis.get_scale().y
	var hip := skel.get_bone_global_rest(pelvis).origin
	for node in body.find_children("*", "MeshInstance3D", true, false):
		var mesh_node: MeshInstance3D = node
		if not mesh_node.mesh or not mesh_node.skin: continue
		var skin := mesh_node.skin
		for surface in mesh_node.mesh.get_surface_count():
			var arrays := mesh_node.mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			if bones.is_empty() or vertices.is_empty(): continue
			var influences := bones.size() / vertices.size()
			for i in range(0, vertices.size(), maxi(1, vertices.size()/320)):
				var terms: Array = []
				var rest := Vector3.ZERO
				var strongest := -1.0
				var dominant := ""
				var dominant_bone := -1
				for j in influences:
					var weight := weights[i*influences+j]
					if weight <= 0: continue
					var bind := bones[i*influences+j]
					var bone := skel.find_bone(skin.get_bind_name(bind))
					if bone < 0: bone = skin.get_bind_bone(bind)
					if bone < 0 or bone >= skel.get_bone_count(): continue
					var point := skin.get_bind_pose(bind) * vertices[i]
					terms.append([bone, point, weight])
					rest += (skel.get_bone_global_rest(bone) * point) * weight
					if weight > strongest:
						strongest = weight
						dominant = skel.get_bone_name(bone).to_lower()
						dominant_bone = bone
				var seat_sample := absf(rest.y-hip.y) < local_height*.105 and Vector2(rest.x-hip.x,rest.z-hip.z).length() < local_height*.17
				var arm := false
				for term in ["arm", "hand", "carpal", "humerus", "ulna", "finger", "metacarp", "clavicle", "thumb", "index", "middle", "ring", "little", "distal"]:
					if term in dominant: arm = true
				if not terms.is_empty():
					var sample := {"terms": terms, "seat": seat_sample, "side_hip": dominant_bone==pelvis and rest.distance_to(hip)<local_height*.14, "arm": arm}
					samples.append(sample)
					var head_ancestor := dominant_bone
					while head_ancestor>=0:
						if head_ancestor==body._role_bone("head") and not "hair" in String(mesh_node.name).to_lower():
							head_samples.append(sample)
							break
						head_ancestor = skel.get_bone_parent(head_ancestor)
					for side in ["L","R"]:
						if dominant_bone==body._role_bone("hip"+side): thigh_samples[side].append(sample)
						var ancestor := dominant_bone
						while ancestor>=0:
							if ancestor==body._role_bone("wrist"+side):
								hand_samples[side].append(sample)
								break
							ancestor = skel.get_bone_parent(ancestor)
	ready = true

func contact_low(seated: bool) -> float:
	var low := INF
	for sample in samples:
		if seated and not sample.seat: continue
		if hip_supported and not sample.side_hip: continue
		if not seated and sample.arm: continue
		var point := Vector3.ZERO
		for term in sample.terms:
			point += (skeleton.get_bone_global_pose(term[0]) * term[1]) * term[2]
		low = minf(low, (skeleton.global_transform * point).y)
	if seated and not is_finite(low): return contact_low(false)
	return low

func apply(body: Node3D, skel: Skeleton3D, support: Dictionary, seated: bool) -> void:
	if not ready: prepare(body, skel)
	if not ready or not support.has("surface_y_m"): return
	hip_supported = String(support.get("variant", "")).begins_with("elbow")
	skel.force_update_all_bone_transforms()
	var hip := skel.global_transform * skel.get_bone_global_pose(pelvis).origin
	var anchor := (body.get_parent() as Node3D).global_position
	body.global_position += Vector3(anchor.x-hip.x,0,anchor.z-hip.z)
	var low := contact_low(seated)
	if is_finite(low): body.global_position.y += float(support.surface_y_m)-low
	fit_limbs(body, support, seated)
	low = contact_low(seated)
	if is_finite(low): body.global_position.y += float(support.surface_y_m)-low

func rotate_world(bone: int, axis: Vector3, angle: float) -> void:
	var desired := Basis(Quaternion(axis,angle))*skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(bone).basis
	var parent := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(skeleton.get_bone_parent(bone)).basis
	skeleton.set_bone_pose_rotation(bone,(parent.inverse()*desired).get_rotation_quaternion())
	skeleton.force_update_all_bone_transforms()

func prop_error(spine: int, upper: int, points: Array, local_front: Vector3, u: float, l: float, surface: float) -> Vector2:
	var transform := skeleton.global_transform*skeleton.get_bone_global_pose(spine)
	var bounds := AABB(transform*points[0],Vector3.ZERO)
	for point in points: bounds = bounds.expand(transform*point)
	var wrist := bounds.get_center()+(transform.basis*local_front).normalized()*body_height*.025
	wrist.y = bounds.position.y-body_height*.018
	var elbow := wrist-Vector3.UP*l
	# apply() grounds the deformed hip skin after posing; include that shift
	# here so it cannot lift the supporting elbow away from the mattress.
	var low := contact_low(false)
	var grounding := surface-low if is_finite(low) else 0.0
	return Vector2(elbow.y+grounding-surface-body_height*.025,elbow.distance_to(world_bone(upper))-u)

func fit_prop_torso(body: Node3D, spine: int, crown: int, local_front: Vector3, surface: float) -> void:
	var left: int = body._role_bone("humL")
	var right: int = body._role_bone("humR")
	if mini(left,right)<0: return
	var side := "L" if world_bone(left).y<world_bone(right).y else "R"
	var upper: int = body._role_bone("hum"+side)
	var lower: int = body._role_bone("elbow"+side)
	var hand: int = body._role_bone("wrist"+side)
	if mini(lower,hand)<0: return
	var points: Array = []
	var inverse := (skeleton.global_transform*skeleton.get_bone_global_pose(spine)).affine_inverse()
	for point in skin_points(head_samples): points.append(inverse*point)
	if points.is_empty(): return
	var longitudinal := (world_bone(crown)-world_bone(spine)).normalized()
	var across := longitudinal.cross(Vector3.UP).normalized()
	var u := world_bone(upper).distance_to(world_bone(lower))
	var l := world_bone(lower).distance_to(world_bone(hand))
	# Two geometric constraints: elbow on the mattress and wrist above elbow.
	for pass_ in 8:
		var error := prop_error(spine,upper,points,local_front,u,l,surface)
		if error.length()<body_height*.0005: break
		var base := skeleton.get_bone_pose_rotation(spine)
		var columns: Array[Vector2] = []
		for axis in [across,longitudinal]:
			rotate_world(spine,axis,.001)
			columns.append((prop_error(spine,upper,points,local_front,u,l,surface)-error)/.001)
			skeleton.set_bone_pose_rotation(spine,base)
			skeleton.force_update_all_bone_transforms()
		var a := columns[0].x
		var c := columns[0].y
		var b := columns[1].x
		var d := columns[1].y
		var det := a*d-b*c
		if absf(det)<.00000001: break
		rotate_world(spine,across,clampf((-d*error.x+b*error.y)/det,-.2,.2))
		rotate_world(spine,longitudinal,clampf((c*error.x-a*error.y)/det,-.2,.2))

func world_bone(index: int) -> Vector3:
	return skeleton.global_transform * skeleton.get_bone_global_pose(index).origin

func skin_points(collection: Array) -> Array[Vector3]:
	var result: Array[Vector3] = []
	for sample in collection:
		var point := Vector3.ZERO
		for term in sample.terms: point += (skeleton.get_bone_global_pose(term[0])*term[1])*term[2]
		result.append(skeleton.global_transform*point)
	return result

func thigh_top(side: String, target: Vector3) -> float:
	var top := -INF
	for point in skin_points(thigh_samples[side]):
		if Vector2(point.x-target.x,point.z-target.z).length()<body_height*.07: top = maxf(top,point.y)
	return top

func aim(bone: int, child: int, target: Vector3) -> void:
	var origin := skeleton.get_bone_global_pose(bone).origin
	var from := (skeleton.get_bone_global_pose(child).origin-origin).normalized()
	var to := (skeleton.to_local(target)-origin).normalized()
	var desired := Quaternion(from,to)*skeleton.get_bone_global_pose(bone).basis.get_rotation_quaternion()
	var parent := skeleton.get_bone_parent(bone)
	var parent_rotation := Quaternion.IDENTITY if parent<0 else skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion()
	skeleton.set_bone_pose_rotation(bone,(parent_rotation.inverse()*desired).normalized())
	skeleton.force_update_all_bone_transforms()

func solve(upper: int, middle: int, end: int, target: Vector3, pole: Vector3) -> void:
	var a := world_bone(upper)
	var b := world_bone(middle)
	var c := world_bone(end)
	var u := a.distance_to(b)
	var l := b.distance_to(c)
	var distance := clampf(a.distance_to(target),absf(u-l)+.00001,u+l-.00001)
	var along := (target-a).normalized()
	var bend := (pole-along*pole.dot(along)).normalized()
	var projection := (u*u+distance*distance-l*l)/(2.0*distance)
	var rise := sqrt(maxf(0,u*u-projection*projection))
	aim(upper,middle,a+along*projection+bend*rise)
	aim(middle,end,target)

func fit_limbs(body: Node3D, support: Dictionary, seated: bool) -> void:
	var variant := String(support.get("variant","seat"))
	var yaw := (body.get_parent() as Node3D).global_basis.orthonormalized()
	var front := yaw*Vector3.FORWARD
	var performing := bool(body.get_meta("rest_action_active",false))
	if seated and not performing:
		var spine: int = body._role_bone("lumbar")
		var neck: int = body._role_bone("neck")
		if neck < 0: neck = body._role_bone("head")
		if mini(spine,neck) >= 0:
			aim(spine,neck,world_bone(spine)+Vector3.UP+front*.035)
	if not seated and not body._tail_bones.is_empty():
		var spine: int = body._role_bone("lumbar")
		var head: int = body._role_bone("head")
		if mini(spine,head) >= 0:
			var length_ := world_bone(spine).distance_to(world_bone(head))
			aim(spine,head,world_bone(spine)-front*length_)
			var roll := PI if variant=="front" else -PI/2.0 if variant in ["left","elbow_left"] else PI/2.0 if variant in ["right","elbow_right"] else 0.0
			var desired := Quaternion((skeleton.global_basis.inverse()*-front).normalized(),roll)*skeleton.get_bone_global_pose(spine).basis.get_rotation_quaternion()
			var parent := skeleton.get_bone_parent(spine)
			skeleton.set_bone_pose_rotation(spine,(skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion().inverse()*desired).normalized())
			skeleton.force_update_all_bone_transforms()
	var sideways := variant in ["left","right","elbow_left","elbow_right"]
	for side in ["L","R"]:
		var hip: int = body._role_bone("hip"+side)
		var knee: int = body._role_bone("knee"+side)
		var foot: int = body._role_bone("foot"+side)
		if mini(hip,mini(knee,foot)) < 0: continue
		var point := world_bone(hip)
		var thigh := point.distance_to(world_bone(knee))
		var shin := world_bone(knee).distance_to(world_bone(foot))
		var target := point+front*thigh
		target.y = maxf((body.get_parent() as Node3D).global_position.y+body_height*.035,point.y-shin)
		var pole := front
		if variant == "sit_up":
			var folded: bool = side=="R"
			target = point+front*(thigh+shin)*(.37 if folded else .91)+yaw*Vector3.RIGHT*body_height*(-.17 if folded else .025)
			target.y = float(support.surface_y_m)+body_height*.065
			pole = front+yaw*Vector3.RIGHT*(-1.0 if folded else 1.0)
		elif not seated:
			var upper_side: bool = side==("R" if variant in ["left","elbow_left"] else "L")
			target = point+front*(thigh+shin)*((.67 if upper_side else .76) if sideways else .96)
			target.y = float(support.surface_y_m)+body_height*((.09 if upper_side else .025) if sideways else .055)
			pole = yaw*Vector3.RIGHT*(1.0 if variant in ["left","elbow_left"] else -1.0) if sideways else Vector3.UP
		solve(hip,knee,foot,target,pole)
		if not seated:
			for toe in skeleton.get_bone_children(foot):
				var direction := (world_bone(toe)-world_bone(foot)).normalized().lerp(front,.65 if variant=="front" else .3)
				aim(foot,toe,world_bone(foot)+direction)
				break
	if variant.begins_with("elbow"):
		var spine: int = body._role_bone("lumbar")
		var crown: int = body._role_bone("head")
		if mini(spine,crown) >= 0:
			aim(spine,crown,world_bone(crown)+Vector3.UP*body_height*.08)
			var relative := body.global_basis.inverse()*skeleton.global_basis
			var standing := yaw*Basis(body._recline_base)*relative
			var local_front := (standing*skeleton.get_bone_global_rest(spine).basis).inverse()*front
			fit_prop_torso(body,spine,crown,local_front,float(support.surface_y_m))
			var body_front := (skeleton.global_basis*skeleton.get_bone_global_pose(spine).basis*local_front).normalized()
			var head_up := (world_bone(crown)-world_bone(spine)).normalized()
			var head_points := skin_points(head_samples)
			var bounds := AABB(world_bone(crown),Vector3.ZERO)
			if not head_points.is_empty():
				bounds = AABB(head_points[0],Vector3.ZERO)
				for point in head_points: bounds = bounds.expand(point)
			var cheek := bounds.get_center()+body_front*body_height*.025
			cheek.y = bounds.position.y-body_height*(.018 if not head_points.is_empty() else .078)
			var left: int = body._role_bone("humL")
			var right: int = body._role_bone("humR")
			if mini(left,right)>=0:
				var supporting := "L" if world_bone(left).y<world_bone(right).y else "R"
				for side in ["L","R"]:
					var upper: int = body._role_bone("hum"+side)
					var lower: int = body._role_bone("elbow"+side)
					var hand: int = body._role_bone("wrist"+side)
					if mini(lower,hand)<0: continue
					if side!=supporting:
						for bone in [upper,lower,hand]:
							skeleton.set_bone_pose_rotation(bone,skeleton.get_bone_rest(bone).basis.get_rotation_quaternion())
					skeleton.force_update_all_bone_transforms()
					var supporting_hand: bool = side==supporting
					var target := cheek if supporting_hand else world_bone(spine)+body_front*body_height*.12+head_up*body_height*.18
					if not supporting_hand: target.y = float(support.surface_y_m)+body_height*.018
					if not supporting_hand:
						var intent: Dictionary = support.get("arm_action", {})
						var offset = intent.get("target_offset_m", [])
						if offset is Array and offset.size()==3:
							var elapsed := float(intent.get("elapsed_s",Time.get_unix_time_from_system()-float(intent.get("started_at",0))))
							var phase := elapsed/maxf(.001,float(intent.get("duration_s",1)))
							if phase>=0 and phase<1:
								var goal: Vector3 = body.get_parent().to_global(Vector3(offset[0],0,offset[2]))
								goal.y = float(support.surface_y_m)+float(offset[1])
								target = target.lerp(goal,pow(sin(PI*phase),2))
						var shoulder := world_bone(upper)
						var u := shoulder.distance_to(world_bone(lower))
						var l := world_bone(lower).distance_to(world_bone(hand))
						var maximum := sqrt(u*u+l*l+2*u*l*cos(deg_to_rad(40)))
						var front_distance := (target-world_bone(spine)).dot(body_front)
						if front_distance<body_height*.1: target += body_front*(body_height*.1-front_distance)
						if shoulder.distance_to(target)>maximum: target = shoulder+(target-shoulder).normalized()*maximum
						target.y = maxf(target.y,float(support.surface_y_m)+body_height*.018)
					var elbow_target := target-Vector3.UP*body_height if supporting_hand else world_bone(upper)+body_front*body_height*.12
					if not supporting_hand: elbow_target.y = float(support.surface_y_m)+body_height*.025
					if not supporting_hand: elbow_target += -head_up*body_height*.25+body_front*body_height*.12
					solve(upper,lower,hand,target,(elbow_target-world_bone(upper)).normalized())
					# Align the authored elbow hinge, not just the joint locations.
					var rest_a := skeleton.get_bone_global_rest(upper).origin
					var rest_b := skeleton.get_bone_global_rest(lower).origin
					var rest_c := skeleton.get_bone_global_rest(hand).origin
					var rest_normal := (rest_b-rest_a).cross(rest_c-rest_b)
					if not supporting_hand and rest_normal.length_squared()>.0000000001:
						var hinge := skeleton.get_bone_global_rest(upper).basis.inverse()*rest_normal.normalized()
						var a := world_bone(upper)
						var b := world_bone(lower)
						var c := world_bone(hand)
						var axis := (b-a).normalized()
						var desired_normal := axis.cross(c-b).normalized()
						var current_normal := (skeleton.global_basis*skeleton.get_bone_global_pose(upper).basis*hinge).normalized()
						var angle := atan2(axis.dot(current_normal.cross(desired_normal)),current_normal.dot(desired_normal))
						var desired := Basis(Quaternion(axis,angle))*skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(upper).basis
						var parent_basis := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(skeleton.get_bone_parent(upper)).basis
						skeleton.set_bone_pose_rotation(upper,(parent_basis.inverse()*desired).get_rotation_quaternion())
						skeleton.force_update_all_bone_transforms()
						aim(lower,hand,c)
					skeleton.set_bone_pose_rotation(hand,skeleton.get_bone_rest(hand).basis.get_rotation_quaternion())
					skeleton.force_update_all_bone_transforms()
					for child in skeleton.get_bone_children(hand):
						var name := skeleton.get_bone_name(child).to_lower()
						if "metacarpal3" in name or "middle" in name:
							aim(hand,child,world_bone(hand)+(head_up if supporting_hand else -body_front))
							break
					if supporting_hand:
						for pass_ in 2:
							var wrist := world_bone(hand)
							var gap := INF
							var offset := Vector3.ZERO
							for palm in skin_points(hand_samples[side]):
								if palm.distance_to(wrist)>body_height*.075: continue
								for point in head_points:
									var distance := point.distance_to(palm)
									if distance<gap:
										gap = distance
										offset = point-palm
							if not is_finite(gap) or gap<=body_height*.002: break
							var orientation := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(hand).basis
							wrist += offset*(1.0-body_height*.0015/gap)
							solve(upper,lower,hand,wrist,Vector3.DOWN)
							var parent_basis := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(skeleton.get_bone_parent(hand)).basis
							skeleton.set_bone_pose_rotation(hand,(parent_basis.inverse()*orientation).get_rotation_quaternion())
							skeleton.force_update_all_bone_transforms()
					if not supporting_hand:
						var fingers := {}
						for i in skeleton.get_bone_count():
							var key := skeleton.get_bone_name(i).to_lower().replace(".","")
							for digit in ["2","3","5"]:
								if key=="middle"+digit+String(side).to_lower(): fingers[digit]=i
						if fingers.size()==3:
							var reach := world_bone(hand)-world_bone(lower)
							if world_bone(hand).y-float(support.surface_y_m)<body_height*.05: reach.y = 0
							if reach.length_squared()<.000001: reach = Vector3(head_up.x,0,head_up.z)
							aim(hand,fingers["3"],world_bone(hand)+reach.normalized())
							var origin := world_bone(hand)
							var normal := (world_bone(fingers["2"])-origin).cross(world_bone(fingers["5"])-origin).normalized()*(1.0 if side=="L" else -1.0)
							var world_rotation := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(hand).basis
							var direction := reach.normalized()
							var palm_up := (Vector3.UP-direction*direction.y).normalized()
							var desired := Basis(Quaternion(normal,palm_up))*world_rotation
							var parent_basis := skeleton.global_basis.orthonormalized()*skeleton.get_bone_global_pose(skeleton.get_bone_parent(hand)).basis
							skeleton.set_bone_pose_rotation(hand,(parent_basis.inverse()*desired).get_rotation_quaternion())
							skeleton.force_update_all_bone_transforms()
	if not performing:
		var head: int = body._role_bone("head")
		if head < 0: return
		for side in ["L","R"]:
			if variant.begins_with("elbow"): continue
			var upper: int = body._role_bone("hum"+side)
			var lower: int = body._role_bone("elbow"+side)
			var hand: int = body._role_bone("wrist"+side)
			if mini(mini(upper,lower),hand) < 0: continue
			var lateral := yaw*Vector3.RIGHT
			var shoulder := world_bone(upper)
			var sign_ := signf((shoulder-world_bone(pelvis)).dot(lateral)) if seated else (1.0 if side=="L" else -1.0)
			var out := lateral*(sign_ if sign_!=0.0 else 1.0)
			var target := world_bone(pelvis)
			var pole := out+front*.2
			if seated:
				var edge := variant.begins_with("sit_edge")
				var thigh: int = body._role_bone("hip"+side)
				var knee: int = body._role_bone("knee"+side)
				if not edge and mini(thigh,knee)>=0: target = world_bone(thigh).lerp(world_bone(knee),.55)
				else: target += out*body_height*.16-front*body_height*.025
				target.y = float(support.surface_y_m)+body_height*.025 if edge else maxf(target.y+body_height*.025,float(support.surface_y_m)+body_height*.085)
				if not edge:
					var top := thigh_top(side,target)
					if is_finite(top): target.y = maxf(target.y,top+body_height*.018)
				if not edge:
					var u := shoulder.distance_to(world_bone(lower))
					var l := world_bone(lower).distance_to(world_bone(hand))
					var comfortable_reach := sqrt(u*u+l*l+2.0*u*l*cos(deg_to_rad(55.0)))
					if shoulder.distance_to(target)>comfortable_reach: target = shoulder+(target-shoulder).normalized()*comfortable_reach
			elif variant in ["left","right"]:
				target = world_bone(head)+front*body_height*.065
				target.y = float(support.surface_y_m)+body_height*(.055 if side==("L" if variant=="left" else "R") else .1)
				pole = front
			elif variant=="front":
				target = world_bone(head)+out*body_height*.12
				target.y = float(support.surface_y_m)+body_height*.025
			else:
				target += out*body_height*(.18 if variant.begins_with("elbow") else .15)+front*body_height*(-.12 if variant.begins_with("elbow") else .08)
				target.y = float(support.surface_y_m)+body_height*.035
			solve(upper,lower,hand,target,pole)
			skeleton.set_bone_pose_rotation(hand,skeleton.get_bone_rest(hand).basis.get_rotation_quaternion())
			skeleton.force_update_all_bone_transforms()
			if seated:
				var fingers := {}
				for i in skeleton.get_bone_count():
					var key := skeleton.get_bone_name(i).to_lower().replace(".","")
					for digit in ["2","3","5"]:
						if key=="middle"+digit+String(side).to_lower(): fingers[digit]=i
				if fingers.size()==3:
					aim(hand,fingers["3"],world_bone(hand)+front)
					var origin := world_bone(hand)
					var normal := (world_bone(fingers["2"])-origin).cross(world_bone(fingers["5"])-origin).normalized()*(1.0 if side=="L" else -1.0)
					var turn := Quaternion(normal,Vector3.UP)
					var local_turn := skeleton.global_basis.get_rotation_quaternion().inverse()*turn*skeleton.global_basis.get_rotation_quaternion()
					var desired := local_turn*skeleton.get_bone_global_pose(hand).basis.get_rotation_quaternion()
					var parent := skeleton.get_bone_parent(hand)
					skeleton.set_bone_pose_rotation(hand,(skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion().inverse()*desired).normalized())
					skeleton.force_update_all_bone_transforms()
				if not variant.begins_with("sit_edge"):
					var leg := skin_points(thigh_samples[side])
					for pass_ in 2:
						var lift := 0.0
						for palm in skin_points(hand_samples[side]):
							for point in leg:
								if Vector2(point.x-palm.x,point.z-palm.z).length()<body_height*.025: lift = maxf(lift,point.y+body_height*.003-palm.y)
						if lift<=body_height*.0005: break
						var orientation := skeleton.get_bone_global_pose(hand).basis.get_rotation_quaternion()
						solve(upper,lower,hand,world_bone(hand)+Vector3.UP*lift,pole)
						var parent := skeleton.get_bone_parent(hand)
						skeleton.set_bone_pose_rotation(hand,(skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion().inverse()*orientation).normalized())
						skeleton.force_update_all_bone_transforms()

static func pose(variant: String) -> Dictionary:
	if variant == "sit_up": return {"hipL":[["x",-85.0]],"hipR":[["x",-85.0]],"kneeL":[["x",8.0]],"kneeR":[["x",8.0]],"lumbar":[["x",-12.0]]}
	if variant in ["left","right","elbow_left","elbow_right"]:
		var result := {"hipL":[["x",-18.0]],"hipR":[["x",-18.0]],"kneeL":[["x",30.0]],"kneeR":[["x",30.0]],"elbowL":[["x",65.0]],"elbowR":[["x",65.0]]}
		if variant.begins_with("elbow"):
			var sign_ := 1.0 if variant.ends_with("left") else -1.0
			result.lumbar = [["z", sign_*-4.0]]
			result.head = [["z", sign_*12.0]]
		return result
	if variant == "front": return {"head":[["y",45.0]],"humL":[["z",-40.0]],"humR":[["z",40.0]],"elbowL":[["x",90.0]],"elbowR":[["x",90.0]]}
	return {}
