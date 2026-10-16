extends RefCounted
## Explicit clip audition with measured source/target joint frames.
var clips: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://studio_motion.json"))
var mapping := {"root":"Hips","spine03":"Spine","spine02":"Chest","spine01":"UpperChest","neck01":"Neck","head":"Head"}
var pairs := {}
var idle_rotations := {}
var skeleton: Skeleton3D
var root_offset := Vector3.ZERO

func vector(a: Array) -> Vector3:
	return Vector3(a[0],a[1],a[2])

func palm_frame(origin: Vector3, middle: Vector3, index: Vector3, little: Vector3) -> Quaternion:
	var y=(middle-origin).normalized()
	var z=(index-little).cross(y).normalized()
	var x=y.cross(z).normalized()
	return Basis(x,y,z).get_rotation_quaternion()

func limb_frame(direction: Vector3, palm_normal: Vector3) -> Quaternion:
	var y=direction.normalized()
	var z=(palm_normal-y*palm_normal.dot(y)).normalized()
	return Basis(y.cross(z).normalized(),y,z).get_rotation_quaternion()

func _init() -> void:
	for side in ["L","R"]:
		var prefix = "Left" if side == "L" else "Right"
		for entry in [["clavicle","Shoulder"],["upperarm01","UpperArm"],["lowerarm01","LowerArm"],["wrist","Hand"],["upperleg01","UpperLeg"],["lowerleg01","LowerLeg"],["foot","Foot"],["toe1-1","Toes"]]:
			mapping[entry[0]+"."+side]=prefix+entry[1]
		for digit in range(1,6):
			var finger=["Thumb","Index","Middle","Ring","Little"][digit-1]
			var joints=["Metacarpal","Proximal","Distal"] if digit==1 else ["Proximal","Intermediate","Distal"]
			for joint in range(3):
				mapping["finger%d-%d.%s" % [digit,joint+1,side]]=prefix+finger+joints[joint]

func q(a: Array) -> Quaternion:
	return Quaternion(a[0],a[1],a[2],a[3]).normalized()

func cycle_reference(clip: Dictionary, source_index: int) -> Quaternion:
	# Quaternion signs are interchangeable; align hemispheres before averaging.
	var anchor=q(clip.frames[0][source_index])
	var sum=Vector4.ZERO
	for frame in clip.frames:
		var rotation=q(frame[source_index])
		var sign_value=1.0 if anchor.dot(rotation)>=0.0 else -1.0
		sum+=Vector4(rotation.x,rotation.y,rotation.z,rotation.w)*sign_value
	return Quaternion(sum.x,sum.y,sum.z,sum.w).normalized()

func install(target: Skeleton3D) -> void:
	skeleton=target
	pairs.clear()
	idle_rotations.clear()
	for key in clips:
		var clip=clips[key]
		var found := {}
		for i in skeleton.get_bone_count():
			var name=skeleton.get_bone_name(i)
			var wanted=mapping.get(name,name)
			for si in clip.bones.size():
				var source=clip.bones[si]
				if source.name != wanted: continue
				var rest=skeleton.get_bone_global_rest(i)
				var alignment=Quaternion.IDENTITY
				if name.begins_with("wrist.") and skeleton.find_bone("finger3-1."+name.get_slice(".",1))>=0 and skeleton.find_bone("finger2-1."+name.get_slice(".",1))>=0 and skeleton.find_bone("finger5-1."+name.get_slice(".",1))>=0:
					var side=name.get_slice(".",1)
					var prefix="Left" if side=="L" else "Right"
					var positions={}
					for bone in clip.bones: positions[bone.name]=vector(bone.position)
					var target_frame=palm_frame(rest.origin,skeleton.get_bone_global_rest(skeleton.find_bone("finger3-1."+side)).origin,skeleton.get_bone_global_rest(skeleton.find_bone("finger2-1."+side)).origin,skeleton.get_bone_global_rest(skeleton.find_bone("finger5-1."+side)).origin)
					var source_frame=palm_frame(positions[prefix+"Hand"],positions[prefix+"MiddleProximal"],positions[prefix+"IndexProximal"],positions[prefix+"LittleProximal"])
					alignment=source_frame*target_frame.inverse()
				var children=skeleton.get_bone_children(i)
				# Align long-bone directions before transferring the clip. A-pose
				# and T-pose rigs must not inherit each other's shoulder offsets.
				if not children.is_empty() and ("arm" in name or "leg" in name):
					var next_name=name.replace("upperarm01","lowerarm01").replace("upperleg01","lowerleg01")
					if name.begins_with("lowerarm01"): next_name=name.replace("lowerarm01","wrist")
					if name.begins_with("lowerleg01"): next_name=name.replace("lowerleg01","foot")
					var next=skeleton.find_bone(next_name)
					if next<0: next=children[0]
					var direction=(skeleton.get_bone_global_rest(next).origin-rest.origin).normalized()
					var source_direction=Vector3(source.direction[0],source.direction[1],source.direction[2])
					alignment=Quaternion(direction,source_direction)
					if name.begins_with("lowerarm01."):
						# A direction alone leaves forearm roll unconstrained. The
						# palm supplies the second axis so wrist skin does not twist
						# between incompatible forearm and hand rest frames.
						var side=name.get_slice(".",1)
						var prefix="Left" if side=="L" else "Right"
						var positions={}
						for bone in clip.bones:positions[bone.name]=vector(bone.position)
						var middle=skeleton.find_bone("finger3-1."+side)
						var index=skeleton.find_bone("finger2-1."+side)
						var little=skeleton.find_bone("finger5-1."+side)
						if middle>=0 and index>=0 and little>=0 and positions.has(prefix+"LittleProximal"):
							var target_palm=palm_frame(skeleton.get_bone_global_rest(next).origin,skeleton.get_bone_global_rest(middle).origin,skeleton.get_bone_global_rest(index).origin,skeleton.get_bone_global_rest(little).origin)
							var source_palm=palm_frame(positions[prefix+"Hand"],positions[prefix+"MiddleProximal"],positions[prefix+"IndexProximal"],positions[prefix+"LittleProximal"])
							alignment=limb_frame(source_direction,source_palm*Vector3.BACK)*limb_frame(direction,target_palm*Vector3.BACK).inverse()
				if name.begins_with("finger"):
					# Transfer finger curl and spread in anatomical frames, including
					# the palm normal so mirrored hands do not acquire axial twists.
					var side=name.get_slice(".",1)
					var prefix="Left" if side=="L" else "Right"
					var positions={}
					for bone in clip.bones: positions[bone.name]=vector(bone.position)
					var hand=skeleton.find_bone("wrist."+side)
					var middle=skeleton.find_bone("finger3-1."+side)
					var index=skeleton.find_bone("finger2-1."+side)
					var little=skeleton.find_bone("finger5-1."+side)
					if hand>=0 and middle>=0 and index>=0 and little>=0:
						var target_palm=palm_frame(skeleton.get_bone_global_rest(hand).origin,skeleton.get_bone_global_rest(middle).origin,skeleton.get_bone_global_rest(index).origin,skeleton.get_bone_global_rest(little).origin)
						var source_palm=palm_frame(positions[prefix+"Hand"],positions[prefix+"MiddleProximal"],positions[prefix+"IndexProximal"],positions[prefix+"LittleProximal"])
						var direction=rest.basis.y.normalized()
						if not children.is_empty(): direction=(skeleton.get_bone_global_rest(children[0]).origin-rest.origin).normalized()
						# The source has fingertip end bones, so its measured direction
						# is valid for distal joints too. Bone Y is NOT the thumb axis.
						var source_direction=vector(source.direction)
						alignment=limb_frame(source_direction,source_palm*Vector3.BACK)*limb_frame(direction,target_palm*Vector3.BACK).inverse()
				var reference=q(source.rest)
				# This walk contains a persistent chest/shoulder slump. Transfer its
				# oscillation around the avatar's own neutral posture, not the
				# performer's sustained hunch. Arms retain their full gait poses;
				# sitting and talking retain their authored posture as well.
				if key=="walk" and (name in ["spine03","spine02","spine01"] or name.begins_with("clavicle.")):
					reference=cycle_reference(clip,si)
				found[i]={"source":si,"rest":rest.basis.get_rotation_quaternion(),"source_inverse":reference.inverse(),"alignment":alignment}
		pairs[key]=found
		if key=="walk":
			# A planted standing pose: neutral torso/legs, relaxed arms and
			# fingers from the gait's cycle mean, with no frozen walking stride.
			for i in found:
				var name=skeleton.get_bone_name(i)
				if name.begins_with("upperarm01.") or name.begins_with("lowerarm01.") or name.begins_with("wrist.") or name.begins_with("finger"):
					var pair=found[i]
					idle_rotations[i]=cycle_reference(clip,pair.source)*pair.source_inverse*pair.alignment*pair.rest

func apply_idle() -> void:
	if not is_instance_valid(skeleton): return
	root_offset=Vector3.ZERO
	for i in skeleton.get_bone_count():
		if not idle_rotations.has(i): continue
		var parent=skeleton.get_bone_parent(i)
		var parent_rotation=Quaternion.IDENTITY if parent<0 else skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion()
		skeleton.set_bone_pose_rotation(i,(parent_rotation.inverse()*idle_rotations[i]).normalized())
		skeleton.force_update_all_bone_transforms()

func apply(key: String, time: float) -> void:
	if key=="idle":
		apply_idle()
		return
	if not is_instance_valid(skeleton) or not clips.has(key): return
	var clip=clips[key]
	var cursor=fposmod(time,float(clip.duration))/float(clip.duration)*clip.frames.size()
	var first=int(cursor)%clip.frames.size()
	var second=(first+1)%clip.frames.size()
	if clip.has("hips"):
		var offset=vector(clip.hips[first]).lerp(vector(clip.hips[second]),cursor-floorf(cursor))-vector(clip.hips[0])
		var travel=vector(clip.hips[-1])-vector(clip.hips[0])
		root_offset=offset-travel*(cursor/maxf(1.0,clip.frames.size()-1))
		root_offset.y=0.0
	for i in skeleton.get_bone_count():
		if not pairs[key].has(i): continue
		var pair=pairs[key][i]
		var rotation=q(clip.frames[first][pair.source]).slerp(q(clip.frames[second][pair.source]),cursor-floorf(cursor))
		var desired=rotation*pair.source_inverse*pair.alignment*pair.rest
		var parent=skeleton.get_bone_parent(i)
		var parent_rotation=Quaternion.IDENTITY if parent<0 else skeleton.get_bone_global_pose(parent).basis.get_rotation_quaternion()
		skeleton.set_bone_pose_rotation(i,(parent_rotation.inverse()*desired).normalized())
		skeleton.force_update_all_bone_transforms()
	# Tail audition follows the existing gait phase and posture.
	for segment in range(6):
		var tail_bone=skeleton.find_bone("fantasy_tail_"+str(segment))
		if tail_bone<0: continue
		var angle=sin(cursor/maxf(1.0,clip.frames.size())*TAU-float(segment)*0.45)*0.09 if key=="walk" else 0.0
		skeleton.set_bone_pose_rotation(tail_bone,Quaternion(Vector3.UP,angle))
