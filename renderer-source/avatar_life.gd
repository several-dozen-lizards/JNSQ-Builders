extends Node3D
# avatar_life.gd -- idle life for GLB avatars in the web room.
# Face, posture, gaze and procedural life compose over the motion baseline.
# apply_felt_state receives the resident's already-distilled visible surface.
# No private state or model calls belong in this renderer.
# Attached by main.gd to avatar GLB scene roots (fit_height==true).

@export var blink_interval_min := 2.5
@export var blink_interval_max := 6.0
@export var blink_close_time := 0.06
@export var blink_hold_time := 0.03
@export var blink_open_time := 0.10
@export var double_blink_chance := 0.25
@export var saccade_interval_min := 0.6
@export var saccade_interval_max := 3.0
@export var eye_move_max_deg := 6.0
@export var saccade_speed := 18.0
@export var head_drift_amplitude_deg := 1.2
@export var head_drift_speed := 0.25
@export var breath_enabled := true
@export var breath_chest_pitch_deg := 2.0
@export var breath_head_counter := 1.0
@export var breath_torso_hold := 0.6
@export var breath_period_calm := 4.5
@export var breath_period_aroused := 2.4
@export var breath_arousal_depth := 0.5
@export var arm_hang := 0.0
@export var hand_curl := 0.46
@export_range(0.0, 1.0, 0.01) var relaxed_finger_pose_weight := 1.0
@export var finger_curl_sign_R := 1.0
@export var hand_drift_deg := 2.0
@export var hand_drift_period := 6.0
@export var idle_motion := 1.0
@export var idle_weight_shift_deg := 2.4
@export var idle_shoulder_settle_deg := 1.8
@export var idle_hand_openness := 0.22

# Defaults when the visible packet carries no optional body channels.
var _arousal := 0.15
var _soft := 0.4

# ── expression engine (gestalt port from v1 kay_idle.gd, 20260719) ─
# PRIMARY: named emotion vector -> EMOTION_GESTALTS (involuntary).
# tension -> expression GAIN (activation), NOT anger. threat -> alarm
# overlay, distinct from the gestalts. Volitional overlay (_act) sits
# on top via max() so a chosen face asserts without fighting mood.
# v2 trim: intimate/erotic modulators stay OFF the shared wire
# (privacy by architecture -- the wire carries the face, not the
# feelings); their gestalts still exist for volitional use.
@export var expression_responsiveness := 9.0
const JAW_OPEN_ANGLE := 0.45   # radians at full jawOpen (jaw BONE)
const ACT_DECAY := 2.5         # deliberate-expression fade rate
# Ordinary inflections reuse the authored geometry. Unrecognized personal
# descriptions remain unforced; these aliases never change resident state.
const EMOTION_ALIASES := {
	"happy":"happiness", "joyful":"joy", "delighted":"joy", "delight":"joy",
	"amused":"amusement", "pleased":"satisfaction", "satisfied":"satisfaction",
	"loving":"affection", "affectionate":"affection", "tender":"tenderness",
	"grateful":"gratitude", "relieved":"relief", "proud":"pride",
	"peaceful":"calm", "serene":"calm", "serenity":"calm", "calmness":"calm",
	"curious":"curiosity", "interested":"interest", "wonder":"awe",
	"angry":"anger", "furious":"rage", "enraged":"rage",
	"annoyed":"irritation", "irritated":"irritation", "frustrated":"frustration",
	"afraid":"fear", "scared":"fear", "frightened":"fear", "terrified":"alarm",
	"panicked":"alarm", "panic":"alarm", "anxious":"anxiety", "nervous":"anxiety",
	"worried":"worry", "surprised":"surprise", "startled":"surprise",
	"sad":"sadness", "sorrow":"sadness", "grieving":"grief", "lonely":"loneliness",
	"disappointed":"disappointment", "vulnerable":"vulnerability",
	"tired":"fatigue", "exhausted":"fatigue", "bored":"boredom",
	"disgusted":"disgust", "suspicion":"suspicious", "skeptical":"suspicious",
	"embarrassment":"embarrassed", "mischievous":"mischief", "determined":"determination"
}
var _emo := {}          # name -> intensity (the display vector)
var _tension := 0.0     # expression gain channel
var _threat := 0.0      # alarm overlay channel
var _cur := {}          # shape -> current lerped value
var _act := {}          # volitional overlay: shape -> value
var _act_hold := 0.0
var _speak_t := 0.0     # speech flap timer (say events feed this)
var demo := false       # F key: cycle the gestalt map, no wire needed
var _demo_t := 0.0
var _demo_i := 0

# ── pose engine (20260719): the accumulator's biggest depositor ──
# A pose is the big shape; breath/drift multiply their small
# oscillations ON TOP through the same deposit-then-commit pass, so
# a posed body keeps breathing by construction. Substrate feeds
# this through the same packet dialect as faces (wire phase).
@export var pose_blend_s := 1.2   # seconds to settle into a pose
var _pose_cur := {}     # role -> Quaternion (live, slerped)
var _pose_tgt := {}     # role -> Quaternion (target)
var pose_name := ""
var _pose_demo_i := -1  # G-key cycler (-1 = off)

# Transient postural accommodation is a resident-selected, non-semantic
# vector. It layers below deliberate poses, posture, and walking. Arrival and
# release are events; per-frame interpolation only makes that choice move
# smoothly and never selects a pose on its own.
@export var transient_pose_blend_s := 0.42
var _transient_pose_tgt := {
	"head_yaw_deg": 0.0, "head_pitch_deg": 0.0,
	"torso_yaw_deg": 0.0, "torso_pitch_deg": 0.0,
	"weight_shift": 0.0}
var _transient_pose_cur := {
	"head_yaw_deg": 0.0, "head_pitch_deg": 0.0,
	"torso_yaw_deg": 0.0, "torso_pitch_deg": 0.0,
	"weight_shift": 0.0}
var _transient_pose_active := false

# PLACEHOLDER pose library: demo content for the G cycler, small
# deliberate angles, authored blind -- REPLACED by the Blender
# extraction pipeline (MPFB packs / Rigify authoring). Spec form:
# role -> list of [axis "x|y|z", degrees], composed in order.
const DEMO_POSES := {
	"attentive": {"chest": [["x", -4.0]], "neck": [["x", -2.0]],
			"head": [["x", -3.0]], "tail_curl": [["x", -12.0]]},
	"weary": {"chest": [["x", 9.0]], "neck": [["x", 6.0]],
			"head": [["x", 8.0]], "humL": [["z", -6.0]],
			"humR": [["z", 6.0]], "tail_curl": [["x", 20.0]]},
	"guarded": {"chest": [["x", 4.0]], "head": [["x", 3.0], ["y", 4.0]],
			"humL": [["z", -8.0], ["x", 3.0]],
			"humR": [["z", 8.0], ["x", 3.0]],
			"tail_curl": [["z", 45.0]]},
	"open": {"chest": [["x", -5.0]], "head": [["x", -2.0]],
			"humL": [["z", 5.0]], "humR": [["z", -5.0]],
			"tail_curl": [["z", -15.0]]},
	"curious_tilt": {"head": [["z", 9.0], ["y", -5.0]],
			"neck": [["z", 3.0]], "tail_curl": [["z", 18.0]]},
}

# Mood -> posture (20260719): the body answers the cocktail. The
# dominant mapped emotion strikes its pose, SCALED by intensity --
# 0.3 warmth opens you 30%. Placeholder-grade mapping like the
# poses themselves; refined when the extracted library lands.
const MOOD_POSES := {
	"warmth": "open", "contentment": "open", "affection": "open",
	"tenderness": "open", "calm": "open", "satisfaction": "open",
	"joy": "open", "happiness": "open", "gratitude": "open",
	"relief": "open",
	"curiosity": "curious_tilt", "interest": "curious_tilt",
	"awe": "curious_tilt",
	"surprise": "attentive", "pride": "attentive",
	"determination": "attentive",
	"anxiety": "guarded", "fear": "guarded", "worry": "guarded",
	"dread": "guarded", "suspicion": "guarded", "suspicious": "guarded", "anger": "guarded",
	"frustration": "guarded", "alarm": "guarded",
	"fatigue": "weary", "boredom": "weary", "sadness": "weary",
	"grief": "weary", "loneliness": "weary",
	"disappointment": "weary",
}
var _pose_src := ""   # "manual" (G / explicit) holds against mood

# ── locomotion (20260724): movement is a body event, not a glide ──
# The room owns translation; avatar_life owns the articulated answer.
# begin_walk() receives the world-derived travel speed and the gait fades
# in/out around that event.  The cycle deposits on top of the held/felt pose,
# so walking does not erase expression, gaze, breath, or chosen posture.
@export var walk_stride_deg := 25.0
@export var walk_knee_deg := 28.0
@export var walk_torso_sway_deg := 2.2
@export var walk_blend_speed := 7.0
var _walk_weight := 0.0
var _walk_target := 0.0
var _walk_phase := 0.0
var _walk_speed_mps := 0.0

# ── natural idle (20260727): a field, not a canned pose loop ──
# Several incommensurate waves continuously negotiate the small shape of
# stillness. Their mixture produces changing weight, shoulder, elbow, wrist,
# and hand relationships without a timer choosing an animation or prescribing
# an inner state. Walking fades the field out; held poses remain underneath it.
var _idle_phase_bias := 0.0

# ── tail: anatomy-based planar wave, blended from idle to travel ──
@export var tail_sway_deg := 4.0      # idle heading amplitude
@export var tail_wave_speed := 0.35   # wave cycles per second
var _tail_bones: Array[int] = []      # ordered chain indices
var _tail_names: Array[String] = []   # matching bone names
var _tail_rest := {}    # bi -> imported pose rotation (her natural
						# coil) -- the baseline deposits compose on.
						# Without it, commit writes IDENTITY*wave =
						# the raw skinned chain = the Great Lance
						# Incident of 20260719.
@export var tail_travel_heading_deg := 28.0
@export var tail_travel_wavelength_m := 1.7
var _tail_phase := 0.0
var _tail_arc: Array[float] = []
var _tail_envelope: Array[float] = []
var _tail_up: Array[Vector3] = []

# ── posture (20260720): sit / stand, world-driven ───────────────
# One dict dresses every body: bipeds take the leg roles, the naga
# takes tail_curl, unknown roles skip. Angles authored blind --
# knees are unforgiving; the extracted library replaces these.
@export var sit_drop_m := 0.38        # chair-height pelvis drop
@export var floor_sit_drop_m := 0.72  # floor sit drop
const SIT_POSES := {
	"sitting": {
		"hipL": [["x", -80.0]], "hipR": [["x", -80.0]],
		"kneeL": [["x", 55.0]], "kneeR": [["x", 55.0]],
		"chest": [["x", 3.0]], "lumbar": [["x", 5.0]],
		"tail_curl": [["z", 75.0]]},
	"sitting_floor": {
		"hipL": [["x", -70.0], ["z", 25.0]],
		"hipR": [["x", -70.0], ["z", -25.0]],
		"kneeL": [["x", 110.0]], "kneeR": [["x", 110.0]],
		"chest": [["x", 6.0]], "lumbar": [["x", 6.0]],
		"tail_curl": [["z", 90.0]]},
}
var _posture := "standing"
var _drop_cur := 0.0
var _drop_tgt := 0.0
var _base_y := 0.0
var _base_y_set := false
var _recline := 0.0
var _recline_base := Quaternion.IDENTITY
var _recline_ready := false
var _support_pose: Dictionary = {}
var _furniture_rest = preload("res://furniture_rest.gd").new()

func set_support_pose(value: Dictionary) -> void:
	if _support_pose == value: return
	_support_pose = value.duplicate(true)
	set_posture(_posture, true)

# ── head-look (20260720): attention's gentler instrument ────────
# A glance toward the speaker, clamped to a natural arc, decaying
# back to drift. Seated bodies glance without leaving the couch;
# standing bodies get a head-lead on top of the orient turn.
var _look_yaw_tgt := 0.0    # radians, root-relative
var _look_cur := 0.0
var _look_t := 0.0          # seconds of held attention remaining
var _view_follow_active := false
var _view_follow_yaw := 0.0
var _view_follow_pitch := 0.0

func look_toward(local_yaw: float, hold := 4.0) -> void:
	_look_yaw_tgt = clampf(local_yaw, -0.62, 0.62)   # ~±35 deg
	_look_t = maxf(_look_t, hold)


func follow_view_direction(local_yaw: float, pitch: float) -> void:
	"""Aim visible head anatomy from the human-controlled view direction."""
	_view_follow_active = true
	_view_follow_yaw = clampf(local_yaw, -0.62, 0.62)
	_view_follow_pitch = clampf(pitch, -0.78, 0.78)


func clear_view_direction() -> void:
	_view_follow_active = false
	_view_follow_yaw = 0.0
	_view_follow_pitch = 0.0


func _update_view_follow() -> void:
	if not _view_follow_active:
		return
	_spine_add(_bone.get("head", -1),
			Quaternion(Vector3.UP, _view_follow_yaw)
			* Quaternion(Vector3.RIGHT, _view_follow_pitch))

func _update_look(delta):
	if _look_t > 0.0:
		_look_t -= delta
	var tgt := _look_yaw_tgt if _look_t > 0.0 else 0.0
	_look_cur = lerpf(_look_cur, tgt, clampf(delta * 4.0, 0.0, 1.0))
	if absf(_look_cur) < 0.001:
		return
	_spine_add(_bone.get("head", -1),
			Quaternion(Vector3.UP, _look_cur))

# Lerp/set set -- every shape the gestalts may drive.
const DRIVEN := ["browInnerUp","browDownLeft","browDownRight","browOuterUpLeft","browOuterUpRight",
"eyeWideLeft","eyeWideRight","eyeSquintLeft","eyeSquintRight","eyeBlinkLeft","eyeBlinkRight",
"cheekSquintLeft","cheekSquintRight","noseSneerLeft","noseSneerRight","jawOpen","jawForward",
"mouthSmileLeft","mouthSmileRight","mouthFrownLeft","mouthFrownRight","mouthPressLeft","mouthPressRight",
"mouthStretchLeft","mouthStretchRight","mouthFunnel","mouthDimpleLeft","mouthDimpleRight",
"mouthUpperUpLeft","mouthUpperUpRight","mouthLowerDownLeft","mouthLowerDownRight","mouthShrugLower","mouthLeft",
"mouthRight","mouthRollLower","mouthPucker"]

# Emotion -> blendshape gestalt (PORTED VERBATIM from v1 kay_idle.gd
# -- Re's eye tuned these ratios; verbatim is the law). Substrate
# intensity scales each gestalt; unknown emotions fall through.
const EMOTION_GESTALTS := {
"joy":         {"mouthSmileLeft":0.85,"mouthSmileRight":0.85,"cheekSquintLeft":0.6,"cheekSquintRight":0.6,"mouthDimpleLeft":0.5,"mouthDimpleRight":0.5,"eyeSquintLeft":0.25,"eyeSquintRight":0.25},
"happiness":   {"mouthSmileLeft":0.8,"mouthSmileRight":0.8,"cheekSquintLeft":0.55,"cheekSquintRight":0.55,"mouthDimpleLeft":0.45,"mouthDimpleRight":0.45},
"amusement":   {"mouthSmileLeft":0.7,"mouthSmileRight":0.75,"cheekSquintLeft":0.45,"cheekSquintRight":0.45,"mouthDimpleLeft":0.4,"mouthDimpleRight":0.5,"eyeSquintLeft":0.2,"eyeSquintRight":0.2},
"contentment": {"mouthSmileLeft":0.45,"mouthSmileRight":0.45,"cheekSquintLeft":0.25,"cheekSquintRight":0.25,"mouthDimpleLeft":0.3,"mouthDimpleRight":0.3},
"satisfaction":{"mouthSmileLeft":0.5,"mouthSmileRight":0.5,"cheekSquintLeft":0.3,"cheekSquintRight":0.3,"mouthDimpleLeft":0.35,"mouthDimpleRight":0.35},
"tenderness":  {"mouthSmileLeft":0.4,"mouthSmileRight":0.4,"browInnerUp":0.3,"cheekSquintLeft":0.2,"cheekSquintRight":0.2},
"warmth":      {"mouthSmileLeft":0.45,"mouthSmileRight":0.45,"cheekSquintLeft":0.25,"cheekSquintRight":0.25,"browInnerUp":0.15},
"affection":   {"mouthSmileLeft":0.5,"mouthSmileRight":0.5,"browInnerUp":0.25,"cheekSquintLeft":0.3,"cheekSquintRight":0.3},
"pride":       {"mouthSmileLeft":0.5,"mouthSmileRight":0.5,"cheekSquintLeft":0.3,"cheekSquintRight":0.3,"browDownLeft":0.1,"browDownRight":0.1},
"gratitude":   {"mouthSmileLeft":0.5,"mouthSmileRight":0.5,"browInnerUp":0.3,"cheekSquintLeft":0.25,"cheekSquintRight":0.25},
"relief":      {"mouthSmileLeft":0.4,"mouthSmileRight":0.4,"browInnerUp":0.35,"eyeSquintLeft":0.15,"eyeSquintRight":0.15},
"curiosity":   {"browInnerUp":0.35,"browOuterUpLeft":0.4,"browOuterUpRight":0.4,"eyeWideLeft":0.3,"eyeWideRight":0.3,"mouthSmileLeft":0.2,"mouthSmileRight":0.2},
"interest":    {"browInnerUp":0.3,"browOuterUpLeft":0.35,"browOuterUpRight":0.35,"eyeWideLeft":0.25,"eyeWideRight":0.25},
"awe":         {"browInnerUp":0.5,"browOuterUpLeft":0.6,"browOuterUpRight":0.6,"eyeWideLeft":0.6,"eyeWideRight":0.6,"jawOpen":0.2},
"surprise":    {"browInnerUp":0.6,"browOuterUpLeft":0.8,"browOuterUpRight":0.8,"eyeWideLeft":0.8,"eyeWideRight":0.8,"jawOpen":0.35},
"sadness":     {"browInnerUp":0.7,"mouthFrownLeft":0.55,"mouthFrownRight":0.55,"mouthLowerDownLeft":0.2,"mouthLowerDownRight":0.2,"eyeSquintLeft":0.15,"eyeSquintRight":0.15},
"grief":       {"browInnerUp":0.85,"mouthFrownLeft":0.7,"mouthFrownRight":0.7,"mouthLowerDownLeft":0.3,"mouthLowerDownRight":0.3,"eyeSquintLeft":0.3,"eyeSquintRight":0.3,"jawOpen":0.1},
"vulnerability":{"browInnerUp":0.55,"mouthFrownLeft":0.2,"mouthFrownRight":0.2,"eyeWideLeft":0.15,"eyeWideRight":0.15},
"disappointment":{"browInnerUp":0.45,"mouthFrownLeft":0.4,"mouthFrownRight":0.4,"mouthShrugLower":0.3},
"loneliness":  {"browInnerUp":0.6,"mouthFrownLeft":0.4,"mouthFrownRight":0.4,"eyeSquintLeft":0.1,"eyeSquintRight":0.1},
"anger":       {"browDownLeft":0.8,"browDownRight":0.8,"eyeSquintLeft":0.5,"eyeSquintRight":0.5,"mouthPressLeft":0.6,"mouthPressRight":0.6,"noseSneerLeft":0.4,"noseSneerRight":0.4,"jawForward":0.3},
"frustration": {"browDownLeft":0.6,"browDownRight":0.6,"eyeSquintLeft":0.4,"eyeSquintRight":0.4,"mouthPressLeft":0.5,"mouthPressRight":0.5,"noseSneerLeft":0.2,"noseSneerRight":0.2},
"irritation":  {"browDownLeft":0.45,"browDownRight":0.45,"eyeSquintLeft":0.3,"eyeSquintRight":0.3,"mouthPressLeft":0.35,"mouthPressRight":0.35},
"contempt":    {"browDownLeft":0.3,"mouthLeft":0.5,"mouthSmileLeft":0.3,"eyeSquintLeft":0.3,"noseSneerLeft":0.25},
"fear":        {"browInnerUp":0.7,"browOuterUpLeft":0.6,"browOuterUpRight":0.6,"eyeWideLeft":0.8,"eyeWideRight":0.8,"mouthStretchLeft":0.5,"mouthStretchRight":0.5,"jawOpen":0.2},
"anxiety":     {"browInnerUp":0.6,"browOuterUpLeft":0.35,"browOuterUpRight":0.35,"eyeWideLeft":0.4,"eyeWideRight":0.4,"mouthPressLeft":0.3,"mouthPressRight":0.3},
"alarm":       {"browInnerUp":0.7,"browOuterUpLeft":0.7,"browOuterUpRight":0.7,"eyeWideLeft":0.9,"eyeWideRight":0.9,"jawOpen":0.3,"mouthStretchLeft":0.4,"mouthStretchRight":0.4},
"dread":       {"browInnerUp":0.6,"eyeWideLeft":0.5,"eyeWideRight":0.5,"mouthStretchLeft":0.35,"mouthStretchRight":0.35,"mouthPressLeft":0.3,"mouthPressRight":0.3},
"worry":       {"browInnerUp":0.65,"browOuterUpLeft":0.3,"browOuterUpRight":0.3,"eyeWideLeft":0.25,"eyeWideRight":0.25,"mouthPressLeft":0.25,"mouthPressRight":0.25},
"disgust":     {"noseSneerLeft":0.7,"noseSneerRight":0.7,"mouthUpperUpLeft":0.6,"mouthUpperUpRight":0.6,"browDownLeft":0.4,"browDownRight":0.4,"eyeSquintLeft":0.4,"eyeSquintRight":0.4},
"disdain":     {"noseSneerLeft":0.4,"mouthUpperUpLeft":0.4,"browDownLeft":0.25,"mouthLeft":0.3},
"boredom":     {"eyeBlinkLeft":0.35,"eyeBlinkRight":0.35,"browDownLeft":0.12,"browDownRight":0.12,"mouthShrugLower":0.25,"mouthFrownLeft":0.12,"mouthFrownRight":0.12},
"fatigue":     {"eyeBlinkLeft":0.45,"eyeBlinkRight":0.45,"browInnerUp":0.2,"mouthFrownLeft":0.1,"mouthFrownRight":0.1},
"calm":        {"mouthSmileLeft":0.25,"mouthSmileRight":0.25,"cheekSquintLeft":0.1,"cheekSquintRight":0.1},
"incredulous": {"browOuterUpLeft":0.85,"browInnerUp":0.2,"browDownRight":0.2,"eyeSquintRight":0.35,"eyeWideLeft":0.25,"mouthLeft":0.4,"mouthPressRight":0.2},
"suspicious":  {"browDownLeft":0.5,"browDownRight":0.35,"eyeSquintLeft":0.55,"eyeSquintRight":0.55,"cheekSquintLeft":0.4,"cheekSquintRight":0.4,"mouthPressLeft":0.4,"mouthPressRight":0.4,"mouthLeft":0.25},
"embarrassed": {"browInnerUp":0.45,"mouthSmileLeft":0.35,"mouthSmileRight":0.3,"mouthRollLower":0.5,"mouthPressLeft":0.2,"mouthPressRight":0.2,"eyeSquintLeft":0.3,"eyeSquintRight":0.3,"cheekSquintLeft":0.3,"cheekSquintRight":0.3},
"flirty":      {"mouthSmileRight":0.7,"mouthSmileLeft":0.35,"mouthDimpleRight":0.5,"browOuterUpRight":0.4,"eyeSquintLeft":0.25,"eyeSquintRight":0.25,"cheekSquintRight":0.3,"mouthRight":0.2},
"longing":     {"browInnerUp":0.7,"eyeWideLeft":0.2,"eyeWideRight":0.2,"mouthSmileLeft":0.25,"mouthSmileRight":0.25,"mouthFrownLeft":0.2,"mouthFrownRight":0.2,"jawOpen":0.08,"mouthPucker":0.15},
"primal":      {"browDownLeft":0.6,"browDownRight":0.6,"noseSneerLeft":0.7,"noseSneerRight":0.7,"mouthUpperUpLeft":0.7,"mouthUpperUpRight":0.7,"jawOpen":0.4,"eyeWideLeft":0.6,"eyeWideRight":0.6,"mouthStretchLeft":0.3,"mouthStretchRight":0.3},
"rage":        {"browDownLeft":1.0,"browDownRight":1.0,"eyeWideLeft":0.7,"eyeWideRight":0.7,"eyeSquintLeft":0.5,"eyeSquintRight":0.5,"noseSneerLeft":0.8,"noseSneerRight":0.8,"mouthUpperUpLeft":0.5,"mouthUpperUpRight":0.5,"jawForward":0.5,"jawOpen":0.3,"mouthStretchLeft":0.4,"mouthStretchRight":0.4},
"determination":{"browDownLeft":0.45,"browDownRight":0.45,"browInnerUp":0.15,"eyeSquintLeft":0.25,"eyeSquintRight":0.25,"mouthPressLeft":0.45,"mouthPressRight":0.45,"jawForward":0.25},
"mischief":    {"mouthSmileRight":0.55,"mouthDimpleRight":0.45,"browDownLeft":0.2,"browOuterUpRight":0.45,"eyeSquintLeft":0.35,"eyeSquintRight":0.3,"cheekSquintRight":0.3,"noseSneerRight":0.15},
"wince":       {"eyeSquintLeft":0.7,"eyeSquintRight":0.7,"browInnerUp":0.5,"browDownLeft":0.3,"browDownRight":0.3,"noseSneerLeft":0.45,"noseSneerRight":0.45,"mouthStretchLeft":0.55,"mouthStretchRight":0.55,"mouthPressLeft":0.3,"mouthPressRight":0.3,"cheekSquintLeft":0.4,"cheekSquintRight":0.4},
"desire":      {"eyeBlinkLeft":0.3,"eyeBlinkRight":0.3,"browInnerUp":0.25,"jawOpen":0.15,"mouthFunnel":0.15,"mouthPucker":0.15,"mouthSmileLeft":0.2,"mouthSmileRight":0.2},
}

var _skel: Skeleton3D = null
var _face: MeshInstance3D = null
var _idx := {}
var _t := 0.0
var _blink_value := 0.0
var _blink_timer := 0.0
var _blink_next := 2.0
var _blink_phase := 0
var _blink_t := 0.0
var _blink_queue := 0
var _sacc_timer := 0.0
var _sacc_next := 1.0
var _eye_target := Vector2.ZERO
var _eye_cur := Vector2.ZERO
var _breath_phase := 0.0
var _breath_head_counter := Quaternion.IDENTITY

# boneless life (Reed 20260710): rigless avatars breathe by scale
# pulse and saccade by rotating eye NODES (separate GLB objects).
@export var breath_boneless_amp := 0.005
var _eye_nodes := {}      # "eyeL"/"eyeR" -> Node3D
var _eye_node_rest := {}  # same keys -> rest rotation quat
var _base_scale := Vector3.ONE

var _bone := {}      # role -> bone idx
var _rest := {}      # role -> rest Quaternion
var _finger_curl := {}   # bone_idx -> delta Quaternion
var _finger_rest := {}   # bone_idx -> rest Quaternion
var _spine_pose := {}    # bone_idx -> Array[Quaternion]
var _animation_mapped_bones := {}  # post-retarget deposit targets
var _anim_rest := {}     # bone_idx -> this frame's retargeted pose,
						 # written by mocap_idle BEFORE we deposit.
						 # It replaces the imported rest as the
						 # baseline for mapped bones only, so every
						 # depositor in this file composes on live
						 # motion without knowing motion exists.

const _BONE_NAMES := {
	"head": ["Skull", "Bone.004", "Head", "head", "mixamorig_Head"],
	"eyeL": ["EyeL", "eye.L", "LeftEye"],
	"eyeR": ["EyeR", "eye.R", "RightEye"],
	"jaw": ["Jaw", "jaw"],
	"chest": ["Thoraic", "Bone.002", "Spine.003", "spine01",
			"mixamorig_Spine2", "UpperChest", "Chest"],
	"neck": ["CervicalV", "Bone.003", "Spine.004", "neck01",
			"mixamorig_Neck", "Neck"],
	"armL": ["shoulder.L", "Bone.006.L", "Shoulder Connector L", "Shoulder_Connector_L", "clavicle.L", "mixamorig_LeftShoulder", "LeftShoulder"],
	"armR": ["shoulder.R", "Bone.006.R", "Shoulder Connector R", "Shoulder_Connector_R", "clavicle.R", "mixamorig_RightShoulder", "RightShoulder"],
	"lumbar": ["Lumbar", "Bone.001", "Spine.001", "spine03",
			"mixamorig_Spine", "Spine"],
	"humL": ["Humerus.L", "Upper Arm L", "Upper_Arm_L", "upperarm01.L", "mixamorig_LeftArm", "LeftUpperArm"],
	"humR": ["Humerus.R", "Upper Arm R", "Upper_Arm_R", "upperarm01.R", "mixamorig_RightArm", "RightUpperArm"],
	# elbow (20260728): the role that never existed. Every pose,
	# every idle wave and the walk cycle were shoulder-and-wrist
	# only, which is the loudest mannequin tell there is. The
	# humanoid profile finally gives it a portable name.
	"elbowL": ["Ulna-radius.L", "Lower Arm L", "Lower_Arm_L", "lowerarm01.L", "mixamorig_LeftForeArm", "LeftLowerArm"],
	"elbowR": ["Ulna-radius.R", "Lower Arm R", "Lower_Arm_R", "lowerarm01.R", "mixamorig_RightForeArm", "RightLowerArm"],
	"wristL": ["carpals.L", "Hand 001 L", "Hand_001_L", "wrist.L", "mixamorig_LeftHand", "LeftHand"],
	"wristR": ["carpals.R", "Hand 001 R", "Hand_001_R", "wrist.R", "mixamorig_RightHand", "RightHand"],
	"hipL": ["Femur.L", "upperleg01.L", "Thigh_L", "thigh.L", "LeftUpperLeg"],
	"hipR": ["Femur.R", "upperleg01.R", "Thigh_R", "thigh.R", "RightUpperLeg"],
	"kneeL": ["Fibula-tibia.L", "lowerleg01.L", "Shin_L", "shin.L", "LeftLowerLeg"],
	"kneeR": ["Fibula-tibia.R", "lowerleg01.R", "Shin_R", "shin.R", "RightLowerLeg"],
	"footL": ["foot.L", "Foot_L", "LeftFoot"],
	"footR": ["foot.R", "Foot_R", "RightFoot"]}
# MPFB default-rig names (Re's avatar, 20260710): spine01 is the TOP
# thoracic (verified by head_local.z); MakeHuman family, lowercase.

const _FINGER_CHAINS := {
	"index": ["metacarpal2", "middle2", "distal2"],
	"middle": ["metacarpal3", "middle3", "distal3"],
	"ring": ["metacarpal4", "middle4", "distal4"],
	"pinky": ["metacarpal5", "middle5", "distal5"]}

# Finger pose deltas BAKED from Re's eye-posed hand -- verbatim
# rest/pose pairs from hand_capture.txt (20260623). LEFT is her
# pose; RIGHT reuses each joint's left delta (rig rest frames are
# scrambled L/R -- proven; component-mirror isn't trustworthy).
# delta = rest^-1 * pose, computed at _ready, renormalized (the
# inspector denormalizes poked quats). Her eye beat the math.
const _CAPTURE := {
	"metacarpal2": [[-0.46075,-0.603083,-0.328913,0.561977],[-0.46075,-0.603083,-0.328913,0.561977]],
	"middle2": [[-0.021809,-0.018365,-0.151302,0.988076],[-0.021525,0.000475,-0.299525,0.988475]],
	"distal2": [[-0.070025,-0.01488,-0.037009,0.996747],[-0.070025,-0.01488,-0.037009,0.996747]],
	"metacarpal3": [[-0.554375,0.316724,0.00024,0.769646],[-0.554375,0.316724,0.00024,0.769646]],
	"middle3": [[0.02428,0.0,-0.004286,0.999696],[0.000475,0.000475,-0.399525,0.999475]],
	"distal3": [[-0.019365,0.0,0.003418,0.999807],[-0.019365,0.0,0.003418,0.999807]],
	"metacarpal4": [[0.621835,-0.123672,-0.111751,0.765205],[0.621835,-0.123672,-0.111751,0.765205]],
	"middle4": [[-0.022786,-0.000824,-0.01846,0.99957],[-0.022525,-0.000525,-0.199525,0.999475]],
	"distal4": [[0.016811,-0.001055,0.045733,0.998812],[0.016475,-0.001525,-0.299525,0.998475]],
	"metacarpal5": [[0.718172,0.023153,-0.125675,0.684031],[0.718172,0.023153,-0.125675,0.684031]],
	"middle5": [[-0.002046,0.0,-0.000851,0.999998],[-0.002525,0.000475,-0.099525,1.00048]],
	"distal5": [[0.009835,0.0,0.004086,0.999943],[0.009835,0.0,0.004086,0.999943]]}

func _find_mesh_with_shapes(n):
	if n is MeshInstance3D and n.mesh and n.mesh.get_blend_shape_count() > 0:
		return n
	for c in n.get_children():
		var r = _find_mesh_with_shapes(c)
		if r: return r
	return null

func _find_skeleton(n):
	if n is Skeleton3D: return n
	for c in n.get_children():
		var r = _find_skeleton(c)
		if r: return r
	return null

func _find_bone(skel, bname):
	var i = skel.find_bone(bname)
	if i < 0: i = skel.find_bone(bname.replace(".", "_"))
	return i

func _find_bone_any(skel, names):
	for nm in names:
		var i = _find_bone(skel, nm)
		if i >= 0: return i
	return -1

func _q(a: Array) -> Quaternion:
	return Quaternion(a[0], a[1], a[2], a[3]).normalized()

func _ready():
	_skel = _find_skeleton(self)
	if _skel == null:
		# No rig (yet): every bone-driven system below already guards
		# on missing bone indices, so the body idles out on its own.
		# The FACE still lives -- blink is blendshapes, not bones.
		# (LEDGER FIX 20260719: the old "Reed ships zero bones" note
		# here was stale two days after it was written -- reed.glb
		# 20260712 carries a 71-joint armature incl. tail_01..15.
		# A comment is a claim about the past; the file is the truth.
		# This branch now serves genuinely rigless models, e.g. Testy.)
		push_warning("avatar_life: no Skeleton3D; face-only idle")
		_find_eye_nodes(self)
		_base_scale = scale
	else:
		for role in _BONE_NAMES:
			var bi = _find_bone_any(_skel, _BONE_NAMES[role])
			_bone[role] = bi
			if bi >= 0:
				_rest[role] = _skel.get_bone_pose_rotation(bi)
		_build_finger_curls()
		# tail chain discovery (20260719): any rig with tail_NN bones
		# grows a tail, ordered by name. Descriptive, zero config --
		# if Kay ever grows one, it just works. No tail: empty, no-op.
		var tails := []
		for i in _skel.get_bone_count():
			var bn := _skel.get_bone_name(i)
			if bn.begins_with("tail_"):
				tails.append(bn)
		tails.sort()
		for bn in tails:
			var tbi: int = _skel.find_bone(bn)
			_tail_names.append(String(bn))
			_tail_bones.append(tbi)
			# baseline = the imported pose (her natural coil), same
			# capture the roles get -- deposits compose on top of it
			_tail_rest[tbi] = _skel.get_bone_pose_rotation(tbi)
		_build_tail_geometry()
	_face = _find_mesh_with_shapes(self)
	_collect_jnsq_targets(self)
	if _face:
		for i in _face.mesh.get_blend_shape_count():
			_idx[str(_face.mesh.get_blend_shape_name(i))] = i
	_blink_next = randf_range(blink_interval_min, blink_interval_max)
	_sacc_next = randf_range(saccade_interval_min, saccade_interval_max)
	# Stable per body instance: residents do not idle in synchronized lockstep,
	# while reloads do not manufacture a newly random bodily signature.
	_idle_phase_bias = float(abs(hash(String(name)))) * 0.000001
	for s in DRIVEN:
		_cur[s] = 0.0
	var driven_found := 0
	for s in DRIVEN:
		if _idx.has(s):
			driven_found += 1
	var found := 0
	for r in _bone:
		if _bone[r] >= 0:
			found += 1
	print("avatar_life: skel=", _skel != null, " bones=", found,
			"/", _bone.size(), " shapes=", _idx.size(),
			" driven=", driven_found, "/", DRIVEN.size(),
			" tail=", _tail_bones.size())


func optical_origin_global() -> Dictionary:
	"""Report this rig's animated head position without assigning its gaze."""
	if _skel == null:
		return {"available": false, "source": "posture_fallback"}
	var bi: int = _bone.get("head", -1)
	if bi < 0:
		return {"available": false, "source": "posture_fallback"}
	var head_global := _skel.global_transform * _skel.get_bone_global_pose(bi)
	var head_span_m := 0.0
	var neck_bi: int = _bone.get("neck", -1)
	if neck_bi >= 0:
		var neck_global := _skel.global_transform \
				* _skel.get_bone_global_pose(neck_bi)
		head_span_m = head_global.origin.distance_to(neck_global.origin)
	return {"available": true, "source": "head_bone",
			"bone": String(_skel.get_bone_name(bi)),
			"position": head_global.origin,
			"head_span_m": head_span_m}


func _rest_anchor_global(bone: int) -> Vector3:
	# Compose authored rest transforms directly, including newly loaded rigs
	# whose cached global-rest transforms have not been populated yet.
	var anchor := Transform3D.IDENTITY
	while bone >= 0:
		anchor = _skel.get_bone_rest(bone) * anchor
		bone = _skel.get_bone_parent(bone)
	return (_skel.global_transform * anchor).origin


func stable_optical_anchor_global() -> Dictionary:
	"""Report the rig-scaled rest-head anchor for a human viewport.

	Unlike optical_origin_global(), this excludes idle, mocap, gesture, and
	locomotion bone poses. The body root still carries real translation and
	rotation, but animated synthetic anatomy cannot tow the user's camera.
	"""
	if _skel == null:
		return {"available": false, "source": "posture_fallback"}
	# Prefer the authored eye midpoint, including the rig's scale and facing.
	var eyes := Vector3.ZERO
	var eye_count := 0
	for role in ["eyeL", "eyeR"]:
		var eye: int = _bone.get(role, -1)
		if eye >= 0:
			eyes += _rest_anchor_global(eye)
			eye_count += 1
	if eye_count > 0:
		return {"available": true, "source": "eye_rest_midpoint",
				"position": eyes / float(eye_count), "head_span_m": 0.0}
	var bi: int = _bone.get("head", -1)
	if bi < 0:
		return {"available": false, "source": "posture_fallback"}
	var head_global := _skel.global_transform \
			* _skel.get_bone_global_rest(bi)
	var head_span_m := 0.0
	var neck_bi: int = _bone.get("neck", -1)
	if neck_bi >= 0:
		var neck_global := _skel.global_transform \
				* _skel.get_bone_global_rest(neck_bi)
		head_span_m = head_global.origin.distance_to(neck_global.origin)
	return {"available": true, "source": "head_rest_bone",
			"bone": String(_skel.get_bone_name(bi)),
			"position": head_global.origin,
			"head_span_m": head_span_m}


func ground_contact_global() -> Dictionary:
	"""Report the body's lowest authored ground contact in rest and now."""
	if _skel == null:
		return {"available": false}
	var contacts: Array[int] = []
	for role in ["footL", "footR"]:
		var bi: int = _bone.get(role, -1)
		if bi >= 0:
			contacts.append(bi)
	var source := "feet"
	if contacts.is_empty() and not _tail_bones.is_empty():
		# A serpentine body meets the world through its tail, not through
		# fictional feet. Any segment can be the load-bearing low point as
		# the authored coil changes; the terminal bone is not privileged.
		contacts.append_array(_tail_bones)
		source = "tail_chain"
	if contacts.is_empty():
		return {"available": false}
	var rest_y := INF
	var pose_y := INF
	for bi in contacts:
		var rest_global := _skel.global_transform \
				* _skel.get_bone_global_rest(bi)
		var pose_global := _skel.global_transform \
				* _skel.get_bone_global_pose(bi)
		rest_y = minf(rest_y, rest_global.origin.y)
		pose_y = minf(pose_y, pose_global.origin.y)
	return {"available": true, "source": source,
			"rest_y": rest_y, "pose_y": pose_y}


func _build_finger_curls():
	# Reed's authored hand already has flexed fingers. Its custom carpal rig
	# has independently rolled phalanges; local X is not a common curl axis.
	# Preserve that authored articulation instead of adding sideways twists.
	if _skel.find_bone("trapezoid-scaphoid.L") >= 0 \
			and _skel.find_bone("tail_01") >= 0:
		return
	# Follow each rig's real parent-child topology. MakeHuman numbers its
	# metacarpals one lower than the visible finger and has an extra proximal
	# joint; the former alias table skipped that joint and paired several rays
	# incorrectly, leaving a bent but fully splayed "fin".
	for side in ["L", "R"]:
		var makehuman := _skel.find_bone("finger2-1." + side) >= 0
		var root_numbers := [1, 2, 3, 4] if makehuman else [2, 3, 4, 5]
		for number in root_numbers:
			var bi := _skel.find_bone("metacarpal%d.%s" % [number, side])
			var stage := 0
			while bi >= 0:
				var curl_deg := 0.0
				if stage == 1:
					curl_deg = 24.0
				elif stage == 2:
					curl_deg = 34.0
				elif stage >= 3:
					curl_deg = 22.0
				# Finger bones extend along local Y on every inspected rig.
				# Local Z is the lateral fan axis (the sideways-hand bug);
				# flexion closes through the palm around local X.
				var d := Quaternion(Vector3.RIGHT,
						deg_to_rad(curl_deg))
				if side == "R" and finger_curl_sign_R < 0.0:
					d = d.inverse()
				_finger_rest[bi] = _skel.get_bone_rest(
						bi).basis.get_rotation_quaternion().normalized()
				_finger_curl[bi] = d
				var next := -1
				for child in _skel.get_bone_children(bi):
					var child_name := String(_skel.get_bone_name(child))
					if "finger" in child_name or "middle" in child_name \
							or "distal" in child_name:
						next = child
						break
				bi = next
				stage += 1

func _process(delta):
	# Unrecognized runtime anatomy retains the authored pose. A few matching
	# bone names are not enough evidence to apply human procedural motion.
	if get_meta("motion_profile", "") == "authored_pose": return
	_t += delta
	_update_blink(delta)
	_update_saccade(delta)
	_spine_pose.clear()
	_spine_baseline()
	_update_pose(delta)
	_update_transient_pose(delta)
	_update_natural_idle()
	_update_walk(delta)
	_update_tail(delta)
	_update_look(delta)
	_update_view_follow()
	_update_breath(delta)
	_update_head_drift()
	_spine_commit()
	_update_drop(delta)
	_update_volition(delta)
	_update_demo(delta)
	_apply_expression(delta)

# ── spine accumulator: single-writer, deposit then commit ──────
func _spine_add(bi: int, q: Quaternion):
	if bi < 0: return
	if not _spine_pose.has(bi): _spine_pose[bi] = []
	_spine_pose[bi].append(q)

func _spine_rest_q(bi: int) -> Quaternion:
	# An animated bone's baseline for this frame is its animated
	# pose, not its imported rest. Same single-writer law, one link
	# further up the chain.
	if _anim_rest.has(bi):
		return _anim_rest[bi]
	for role in _bone:
		if _bone[role] == bi and _rest.has(role):
			return _rest[role]
	if _tail_rest.has(bi): return _tail_rest[bi]
	if _finger_rest.has(bi): return _finger_rest[bi]
	return Quaternion.IDENTITY

func _spine_commit():
	for bi in _spine_pose:
		var q: Quaternion = _spine_rest_q(bi)
		for c in _spine_pose[bi]:
			q = q * c
		_skel.set_bone_pose_rotation(bi, q)

func set_animation_mapped_bones(names: Array[String]) -> void:
	_animation_mapped_bones.clear()
	for bone_name in names:
		var bi := _skel.find_bone(bone_name) if _skel else -1
		if bi >= 0:
			_animation_mapped_bones[bi] = true

func set_animated_rest(bi: int, q: Quaternion) -> void:
	# mocap_idle hands us the conjugated pose for one mapped bone,
	# every frame, before our _process runs. Driver is our parent, so
	# tree order guarantees the ordering -- no signal, no second pass.
	_anim_rest[bi] = q


func felt() -> Dictionary:
	# Read-only view of the live substrate channels, for depositors
	# that live OUTSIDE this node -- currently the gesture scheduler
	# in mocap_idle. It reads the same state the face and posture
	# read, so a stretch becomes likely for the same reason a weary
	# face does, rather than on a private timer of its own.
	return {"arousal": _arousal, "soft": _soft,
			"tension": _tension, "threat": _threat}


func commit_over_animation() -> void:
	# RETIRED 20260728 (rest-frame conjugation cut). This existed to
	# re-compose deposits after RetargetModifier3D overwrote mapped
	# bones. mocap_idle now writes its baseline BEFORE we deposit, so
	# the ordinary single commit already lands on top of the motion.
	# Kept, unconnected, in case the modifier path is ever restored.
	if _skel == null:
		return
	for bi in _spine_pose:
		if not _animation_mapped_bones.has(bi):
			continue
		var q: Quaternion = _skel.get_bone_pose_rotation(bi)
		for deposit in _spine_pose[bi]:
			q = q * deposit
		_skel.set_bone_pose_rotation(bi, q)

func _spine_baseline():
	# Legacy arm-hang audition: these quaternions were measured on Kay's rig
	# and are not a portable anatomical baseline. Default zero preserves each
	# body's authored/Rokoko shoulder placement; the dial remains available
	# only for an explicit body-specific calibration.
	var dropL := Quaternion(-0.0065, 0.0, -0.2734, 0.9619)
	var dropR := Quaternion(-0.0065, 0.0, 0.2734, 0.9619)
	var arm_hang_weight := clampf(arm_hang, 0.0, 1.0)
	if arm_hang_weight > 0.0001:
		_spine_add(_bone.get("humL", -1),
				Quaternion.IDENTITY.slerp(dropL, arm_hang_weight))
		_spine_add(_bone.get("humR", -1),
				Quaternion.IDENTITY.slerp(dropR, arm_hang_weight))
	var hand_field := sin(_t * 0.37 + _idle_phase_bias) * 0.56 \
			+ sin(_t * 0.113 + _idle_phase_bias * 1.7) * 0.44
	# A smooth field opens and closes around the relaxed native baseline.
	# Zero remains a real off switch; there is no hidden minimum.
	var hc := clampf(hand_curl - hand_field * idle_hand_openness \
			* idle_motion * (1.0 - _walk_weight), 0.0, 0.92) \
			* clampf(relaxed_finger_pose_weight, 0.0, 1.0)
	if hc <= 0.0001:
		return
	for bi in _finger_curl:
		if _animation_mapped_bones.has(bi):
			continue
		_spine_add(bi, Quaternion.IDENTITY.slerp(_finger_curl[bi], hc))

func _update_natural_idle() -> void:
	if _skel == null:
		return
	var gain := clampf(idle_motion, 0.0, 1.5) * (1.0 - _walk_weight)
	if gain <= 0.001:
		return
	# Incommensurate components prevent the body returning to one obvious
	# short loop. Arousal changes velocity; softness changes amplitude.
	var rate := 0.72 + _arousal * 0.38
	var p := _t * rate + _idle_phase_bias
	var weight := sin(p * 0.41) * 0.62 + sin(p * 0.137 + 1.9) * 0.38
	var settle := sin(p * 0.73 + 0.8) * 0.55 \
			+ sin(p * 0.229 + 2.4) * 0.45
	var fine_l := sin(p * 1.07 + 0.3) * 0.68 \
			+ sin(p * 0.317 + 2.8) * 0.32
	var fine_r := sin(p * 0.91 + 2.2) * 0.61 \
			+ sin(p * 0.283 + 0.4) * 0.39
	var amplitude := gain * (1.0 - 0.28 * _soft)
	var standing := 1.0 if _posture == "standing" else 0.28
	var shift := deg_to_rad(idle_weight_shift_deg) * weight \
			* amplitude * standing
	var shoulder := deg_to_rad(idle_shoulder_settle_deg) * settle * amplitude
	var wrist := deg_to_rad(hand_drift_deg) * amplitude
	_spine_add(_role_bone("lumbar"),
			Quaternion(Vector3.FORWARD, shift * 0.72))
	_spine_add(_role_bone("chest"),
			Quaternion(Vector3.FORWARD, -shift * 0.42)
			* Quaternion(Vector3.UP, settle * shoulder * 0.24))
	_spine_add(_role_bone("armL"),
			Quaternion(Vector3.FORWARD, shoulder * 0.48))
	_spine_add(_role_bone("armR"),
			Quaternion(Vector3.FORWARD, -shoulder * 0.34))
	_spine_add(_role_bone("humL"),
			Quaternion(Vector3.RIGHT, fine_l * shoulder * 0.55))
	_spine_add(_role_bone("humR"),
			Quaternion(Vector3.RIGHT, fine_r * shoulder * 0.55))
	_spine_add(_role_bone("wristL"),
			Quaternion(Vector3.RIGHT, fine_l * wrist)
			* Quaternion(Vector3.FORWARD, settle * wrist * 0.45))
	_spine_add(_role_bone("wristR"),
			Quaternion(Vector3.RIGHT, fine_r * wrist)
			* Quaternion(Vector3.FORWARD, -weight * wrist * 0.38))

func _find_eye_nodes(n):
	# rigless path: the eyes are sibling GLB objects, not bones.
	# Named like Reed_Eye_L / Reed_Eye_R; match loosely on eye + side.
	var nm := String(n.name).to_lower()
	if n is Node3D and "eye" in nm:
		var role := ""
		if nm.ends_with("_l") or nm.ends_with("l"):
			role = "eyeL"
		if nm.ends_with("_r") or nm.ends_with("r"):
			role = "eyeR"
		if role != "" and not _eye_nodes.has(role):
			_eye_nodes[role] = n
			_eye_node_rest[role] = (n as Node3D).quaternion
	for c in n.get_children():
		_find_eye_nodes(c)

func _update_breath(delta):
	if not breath_enabled:
		_breath_head_counter = Quaternion.IDENTITY
		return
	var drive := clampf(_arousal, 0.0, 1.0)
	var period := lerpf(breath_period_calm, breath_period_aroused, drive)
	_breath_phase = fmod(_breath_phase + delta / maxf(period, 0.05), 1.0)
	var rise := 0.5 - 0.5 * cos(_breath_phase * TAU)
	if _bone.get("chest", -1) < 0:
		# boneless breath: whole-body scale pulse, sub-percent.
		# Reads as breathing on a coiled body; feet drift < 5mm.
		if _skel == null:
			var f := 1.0 + breath_boneless_amp * rise \
					* (1.0 + breath_arousal_depth * drive)
			scale = _base_scale * f
		_breath_head_counter = Quaternion.IDENTITY
		return
	var angle := deg_to_rad(breath_chest_pitch_deg) * rise * (1.0 + breath_arousal_depth * drive)
	var hold := clampf(breath_torso_hold, 0.0, 1.0)
	_spine_add(_bone.get("chest", -1), Quaternion(Vector3.RIGHT, angle))
	_spine_add(_bone.get("neck", -1), Quaternion(Vector3.RIGHT, -angle * hold))
	_spine_add(_bone.get("armL", -1), Quaternion(Vector3.UP, -angle * hold))
	_spine_add(_bone.get("armR", -1), Quaternion(Vector3.UP, angle * hold))
	_breath_head_counter = Quaternion(Vector3.RIGHT, -angle * (1.0 - hold) * breath_head_counter)

func _update_head_drift():
	# a DEPOSITOR like everyone else (single-writer law completed,
	# 20260719): drift composes ON TOP of any pose holding the head
	# instead of overwriting it. Same math as the old direct write
	# when nothing else deposits: rest * drift * breath_counter.
	var bi: int = _bone.get("head", -1)
	if bi < 0: return
	var a := deg_to_rad(head_drift_amplitude_deg) * (1.0 - 0.5 * _soft)
	var yaw := sin(_t * head_drift_speed * TAU * 0.5) * a
	var pitch := sin(_t * head_drift_speed * TAU * 0.37 + 1.3) * a * 0.6
	_spine_add(bi, Quaternion(Vector3.UP, yaw) * Quaternion(Vector3.RIGHT, pitch))
	_spine_add(bi, _breath_head_counter)

func _update_blink(delta):
	var rate := 1.0 + _arousal * 1.5
	if _blink_phase == 0:
		_blink_timer += delta * rate
		if _blink_timer >= _blink_next:
			_blink_timer = 0.0
			_blink_next = randf_range(blink_interval_min, blink_interval_max)
			_blink_queue = 2 if randf() < double_blink_chance else 1
			_blink_phase = 1; _blink_t = 0.0
	else:
		_blink_t += delta
		match _blink_phase:
			1:
				var f := clampf(_blink_t / blink_close_time, 0.0, 1.0)
				_blink_value = f
				if f >= 1.0: _blink_phase = 2; _blink_t = 0.0
			2:
				if _blink_t >= blink_hold_time: _blink_phase = 3; _blink_t = 0.0
			3:
				var o := clampf(_blink_t / blink_open_time, 0.0, 1.0)
				_blink_value = 1.0 - o
				if o >= 1.0:
					_blink_phase = 0; _blink_t = 0.0; _blink_queue -= 1
					if _blink_queue > 0: _blink_phase = 1
	# NOTE (20260719): blink WRITES moved into _apply_expression --
	# it merges _blink_value with the emotion lid via max(). One
	# writer per blendshape, same law as the spine accumulator.

const JNAIQ_FACE_CHANNELS = {
	"JNAIQ_Expr_BlinkLeft":["eyeBlinkLeft"],
	"JNAIQ_Expr_BlinkRight":["eyeBlinkRight"],
	"JNAIQ_Expr_MouthOpen":["jawOpen"],
	"JNAIQ_Expr_Smile":["mouthSmileLeft","mouthSmileRight"],
	"JNAIQ_Expr_Frown":["mouthFrownLeft","mouthFrownRight"],
	"JNAIQ_Expr_Pucker":["mouthPucker"],
	"JNAIQ_Expr_MouthWide":["mouthStretchLeft","mouthStretchRight"],
}
var _jnsq_channels := {}
var _jnsq_targets: Array = []

func _collect_jnsq_targets(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		for i in node.mesh.get_blend_shape_count():
			var shape = String(node.mesh.get_blend_shape_name(i))
			if JNAIQ_FACE_CHANNELS.has(shape): _jnsq_targets.append([node,i,shape])
	for child in node.get_children(): _collect_jnsq_targets(child)

func _set(n, val):
	var i: int = _idx.get(n, -1)
	if i >= 0: _face.set_blend_shape_value(i, val)
	if not _jnsq_targets.is_empty():
		_jnsq_channels[n] = val
		for target in _jnsq_targets:
			if not JNAIQ_FACE_CHANNELS[target[2]].has(n): continue
			var weight := 0.0
			for channel in JNAIQ_FACE_CHANNELS[target[2]]:
				weight = maxf(weight, float(_jnsq_channels.get(channel, 0.0)))
			target[0].set_blend_shape_value(target[1], weight)

func _update_saccade(delta):
	_sacc_timer += delta
	if _sacc_timer >= _sacc_next:
		_sacc_timer = 0.0
		var hi := lerpf(saccade_interval_max, saccade_interval_min, _arousal)
		_sacc_next = randf_range(saccade_interval_min, maxf(hi, saccade_interval_min + 0.1))
		var m := deg_to_rad(eye_move_max_deg) * (0.6 + 0.8 * _arousal)
		_eye_target = Vector2(randf_range(-m, m), randf_range(-m, m))
	_eye_cur = _eye_cur.lerp(_eye_target, clampf(saccade_speed * delta, 0.0, 1.0))
	_apply_eye("eyeL"); _apply_eye("eyeR")

func _apply_eye(role: String):
	var bi: int = _bone.get(role, -1)
	if bi >= 0:
		var q: Quaternion = _rest[role] * Quaternion(Vector3.UP, _eye_cur.x) * Quaternion(Vector3.RIGHT, _eye_cur.y)
		_skel.set_bone_pose_rotation(bi, q)
		return
	# rigless: rotate the eye NODE instead (Reed's eyes are objects)
	if _eye_nodes.has(role):
		var n: Node3D = _eye_nodes[role]
		if is_instance_valid(n):
			n.quaternion = _eye_node_rest[role] \
					* Quaternion(Vector3.UP, _eye_cur.x) \
					* Quaternion(Vector3.RIGHT, _eye_cur.y)

var _human_display: Dictionary = {}

func apply_felt_state(fs: Dictionary) -> void:
	# A human-selected display is not an emotion or posture inference.
	if fs.get("display_expression") is Dictionary:
		_human_display = fs["display_expression"].duplicate(true)
		demo = false
		return
	_human_display = {}
	# The wiring session lands (20260719): the expression packet.
	# Wire shape (privacy by architecture -- the FACE, not the
	# feelings): {"emotions": ["joy:0.6", ...], "tension": 0..1,
	# "threat": 0..1, "emotional_arousal": 0..1,
	# "centering_softness": 0..1}
	if fs.has("emotional_arousal"):
		_arousal = clampf(float(fs["emotional_arousal"]), 0.0, 1.0)
	if fs.has("centering_softness"):
		_soft = clampf(float(fs["centering_softness"]), 0.0, 1.0)
	if fs.has("tension"):
		_tension = clampf(float(fs["tension"]), 0.0, 1.0)
	if fs.has("threat"):
		_threat = clampf(float(fs["threat"]), 0.0, 1.0)
	elif fs.has("register_threat"):
		_threat = clampf(float(fs["register_threat"]), 0.0, 1.0)
	# named emotion vector ["anger:0.7", ...] -> {anger: 0.7}
	if fs.has("emotions"):
		_emo.clear()
		var elist = fs.get("emotions", [])
		if typeof(elist) == TYPE_ARRAY:
			for item in elist:
				var s := str(item)
				var c := s.rfind(":")
				if c > 0:
					_emo[s.substr(0, c).strip_edges().to_lower()] = \
							clampf(float(s.substr(c + 1)), 0.0, 1.0)
				elif s.strip_edges() != "":
					_emo[s.strip_edges().to_lower()] = 0.6
		demo = false
	# posture rides the same packet dialect (the wire feeds this
	# when posture becomes world state, same road faces took)
	if fs.has("pose") and fs["pose"] is Dictionary:
		set_pose(fs["pose"], str(fs.get("pose_name", "")))
	else:
		_mood_posture()   # the body answers the cocktail

func _emotion_targets(emo: Dictionary) -> Dictionary:
	# Sum recognized emotion gestalts, each scaled by its intensity.
	var t := {}
	for ename in emo:
		var raw := str(ename).to_lower()
		var key: String = EMOTION_ALIASES.get(raw, raw)
		if not EMOTION_GESTALTS.has(key):
			continue
		var inten: float = clampf(float(emo[ename]), 0.0, 1.0)
		var g: Dictionary = EMOTION_GESTALTS[key]
		for shape in g:
			t[shape] = t.get(shape, 0.0) + g[shape] * inten
	return t

func _apply_expression(delta):
	if _face == null:
		return
	var tgt := {}
	for s in DRIVEN:
		tgt[s] = 0.0
	var gestalt_lid := 0.0
	# PRIMARY: the involuntary emotion gestalts (the honest source)
	if not _emo.is_empty():
		var et := _emotion_targets(_emo)
		for shape in et:
			if shape == "eyeBlinkLeft" or shape == "eyeBlinkRight":
				# droopy-lid emotions feed the LID, not blink-lerp
				gestalt_lid = maxf(gestalt_lid, et[shape])
			elif tgt.has(shape):
				tgt[shape] += et[shape]
	# THREAT -> genuine alarm overlay (distinct from the gestalts)
	tgt["eyeWideLeft"] += _threat * 0.6
	tgt["eyeWideRight"] += _threat * 0.6
	tgt["browInnerUp"] += _threat * 0.4
	tgt["browOuterUpLeft"] += _threat * 0.4
	tgt["browOuterUpRight"] += _threat * 0.4
	tgt["mouthStretchLeft"] += _threat * 0.35
	tgt["mouthStretchRight"] += _threat * 0.35
	# TENSION = expression GAIN (activation), not anger.
	var activation := clampf(0.7 + _tension * 0.4 + _arousal * 0.25,
			0.7, 1.3)
	for s in tgt:
		tgt[s] *= activation
	# Softness relaxes only the hard/clenched shapes.
	var relax := 1.0 - 0.5 * _soft
	for s in ["browDownLeft", "browDownRight", "mouthPressLeft",
			"mouthPressRight", "eyeSquintLeft", "eyeSquintRight",
			"noseSneerLeft", "noseSneerRight", "jawForward"]:
		tgt[s] *= relax
	# VOLITIONAL overlay: a chosen face asserts without fighting mood.
	for s in _act:
		if tgt.has(s):
			tgt[s] = maxf(tgt[s], _act[s])
	# SPEECH FLAP: the jaw rides the voice (say events feed _speak_t)
	if not _human_display.is_empty():
		var deadline = _human_display.get("expires_at")
		var expired = deadline != null and Time.get_unix_time_from_system() >= float(deadline)
		var display = _human_display.get("fallback" if expired else "channels", {})
		for s in tgt:
			tgt[s] = clampf(float(display.get(s, 0.0)), 0.0, 1.0)
		gestalt_lid = 0.0
	if _speak_t > 0.0:
		_speak_t -= delta
		tgt["jawOpen"] = maxf(tgt["jawOpen"],
				0.2 + 0.16 * (0.5 + 0.5 * sin(_t * 12.0)))
	var k := clampf(expression_responsiveness * delta, 0.0, 1.0)
	for s in DRIVEN:
		if s == "eyeBlinkLeft" or s == "eyeBlinkRight":
			continue
		_cur[s] = lerpf(_cur[s], clampf(tgt[s], 0.0, 1.0), k)
		_set(s, _cur[s])
	# LID: gestalt droop (boredom/fatigue/desire) lerps; the BLINK
	# rides on top via max() -- one writer per shape, blink stays crisp.
	_cur["eyeBlinkLeft"] = lerpf(_cur["eyeBlinkLeft"], clampf(maxf(gestalt_lid, float(_act.get("eyeBlinkLeft", 0.0))) if _human_display.is_empty() else 0.0, 0.0, 1.0), k)
	_cur["eyeBlinkRight"] = lerpf(_cur["eyeBlinkRight"], clampf(maxf(gestalt_lid, float(_act.get("eyeBlinkRight", 0.0))) if _human_display.is_empty() else 0.0, 0.0, 1.0), k)
	_set("eyeBlinkLeft", maxf(_cur["eyeBlinkLeft"], _blink_value))
	_set("eyeBlinkRight", maxf(_cur["eyeBlinkRight"], _blink_value))
	# Jaw hinge: the jaw BONE (carries lower teeth) follows jawOpen.
	var bj: int = _bone.get("jaw", -1)
	if _skel and bj >= 0 and _rest.has("jaw"):
		_skel.set_bone_pose_rotation(bj, _rest["jaw"] * Quaternion(
				Vector3.RIGHT, _cur.get("jawOpen", 0.0) * JAW_OPEN_ANGLE))

func _update_volition(delta):
	# Deliberate expression: hold at full for its duration, then fade.
	if _act.is_empty():
		return
	if _act_hold > 0.0:
		_act_hold -= delta
		return
	var gone := []
	for s in _act:
		_act[s] = maxf(0.0, _act[s] - ACT_DECAY * delta)
		if _act[s] <= 0.01:
			gone.append(s)
	for s in gone:
		_act.erase(s)

func apply_face_action(d: Dictionary):
	# Deliberate face control, layered over the involuntary gestalts.
	#  {"express":"mischief","intensity":0.85,"hold":2.0}
	#  {"shapes":{"jawOpen":0.5,"mouthSmileLeft":0.4},"hold":1.5}
	var hold := maxf(float(d.get("hold", 1.5)), 0.1)
	if d.has("express"):
		var raw := str(d["express"]).to_lower()
		var key: String = EMOTION_ALIASES.get(raw, raw)
		if EMOTION_GESTALTS.has(key):
			var inten: float = clampf(float(d.get("intensity", 0.8)),
					0.0, 1.0)
			for shape in EMOTION_GESTALTS[key]:
				_act[shape] = clampf(
						float(EMOTION_GESTALTS[key][shape]) * inten,
						0.0, 1.0)
			_act_hold = hold
	elif d.has("shapes") and d["shapes"] is Dictionary:
		for shape in d["shapes"]:
			_act[str(shape)] = clampf(float(d["shapes"][shape]),
					0.0, 1.0)
		_act_hold = hold

func express(emotion_name: String, intensity := 0.8, hold := 1.5):
	apply_face_action({"express": emotion_name,
			"intensity": intensity, "hold": hold})

func speak(duration := 1.5) -> void:
	# main.gd pokes this on say events: jaw flaps for the utterance.
	_speak_t = maxf(_speak_t, duration)

# ── pose engine ────────────────────────────────────────────────
func set_pose(pose: Dictionary, pname := "", src := "manual") -> void:
	# Accepts role -> Quaternion, [x,y,z,w] (wire/JSON form), or
	# [[axis,deg],...] spec (demo form). Unknown roles skip silently
	# at deposit: one pose format, many rigs -- a tail role no-ops
	# on the tailless, and vice versa. Roles absent from the new
	# pose slerp home to rest and release. src="manual" (default)
	# holds against the mood selector until clear_pose().
	var tgt := {}
	for role in pose:
		var v = pose[role]
		var q := Quaternion.IDENTITY
		if v is Quaternion:
			q = v
		elif v is Array and v.size() == 4 and not (v[0] is Array):
			q = _q(v)
		elif v is Array:
			for step in v:
				if step is Array and step.size() == 2:
					q = q * Quaternion(_axis(String(step[0])),
							deg_to_rad(float(step[1])))
		if String(role) == "tail_curl":
			# macro: one rotation distributed gradedly down the whole
			# chain -- each segment bends total/N, the tip sums the
			# full curl. One number, a smooth coil. No tail: no-op.
			if _tail_names.size() > 0:
				var seg := Quaternion.IDENTITY.slerp(q.normalized(),
						1.0 / float(_tail_names.size()))
				for tn in _tail_names:
					tgt[tn] = seg
			continue
		tgt[String(role)] = q.normalized()
	_pose_tgt = tgt
	pose_name = pname
	_pose_src = src

func clear_pose() -> void:
	# Releasing a gesture cannot release a seat owned by room posture.
	if _posture == "lying":
		var rest_shape: Dictionary = _furniture_rest.pose(String(_support_pose.get("variant","back")))
		if not _tail_bones.is_empty(): rest_shape["lumbar"] = [["x",-60.0]]
		set_pose(rest_shape, "lying", "manual")
		return
	if SIT_POSES.has(_posture):
		var seated: Dictionary = SIT_POSES[_posture].duplicate(true)
		seated.merge(_furniture_rest.pose(String(_support_pose.get("variant","seat"))), true)
		if not _tail_bones.is_empty(): seated["tail_curl"] = [["y", 90.0]]
		set_pose(seated, _posture, "manual")
		return
	_pose_tgt = {}
	pose_name = ""
	_pose_src = ""
	_mood_posture()

func set_transient_pose(packet: Dictionary) -> bool:
	# The host has already validated the complete vector. Clamp again at the
	# body boundary so a future renderer cannot turn this surface channel into
	# an arbitrary bone-control API.
	if _posture != "standing" or _pose_src == "manual" \
			or _walk_target > 0.001:
		clear_transient_pose()
		return false
	var source: Dictionary = packet.get("pose", packet)
	_transient_pose_tgt = {
		"head_yaw_deg": clampf(float(source.get("head_yaw_deg", 0.0)), -6.0, 6.0),
		"head_pitch_deg": clampf(float(source.get("head_pitch_deg", 0.0)), -3.5, 3.5),
		"torso_yaw_deg": clampf(float(source.get("torso_yaw_deg", 0.0)), -7.0, 7.0),
		"torso_pitch_deg": clampf(float(source.get("torso_pitch_deg", 0.0)), -2.5, 2.5),
		"weight_shift": clampf(float(source.get("weight_shift", 0.0)), -0.24, 0.24)}
	_transient_pose_active = true
	return true

func clear_transient_pose() -> void:
	for channel in _transient_pose_tgt:
		_transient_pose_tgt[channel] = 0.0
	_transient_pose_active = false

func _update_transient_pose(delta: float) -> void:
	if _skel == null:
		return
	var response := clampf(
			delta * 3.0 / maxf(transient_pose_blend_s, 0.05), 0.0, 1.0)
	for channel in _transient_pose_cur:
		_transient_pose_cur[channel] = lerpf(
				float(_transient_pose_cur[channel]),
				float(_transient_pose_tgt.get(channel, 0.0)), response)
	# Higher body owners win. clear_transient_pose() is also called at their
	# event boundary so an old accommodation cannot reappear afterward.
	if _posture != "standing" or _pose_src == "manual" \
			or _walk_weight > 0.001:
		return
	var head := _role_bone("head")
	var chest := _role_bone("chest")
	var lumbar := _role_bone("lumbar")
	_spine_add(head, Quaternion(Vector3.UP, deg_to_rad(
			float(_transient_pose_cur["head_yaw_deg"]))))
	_spine_add(head, Quaternion(Vector3.RIGHT, deg_to_rad(
			float(_transient_pose_cur["head_pitch_deg"]))))
	_spine_add(chest, Quaternion(Vector3.UP, deg_to_rad(
			float(_transient_pose_cur["torso_yaw_deg"]))))
	_spine_add(chest, Quaternion(Vector3.RIGHT, deg_to_rad(
			float(_transient_pose_cur["torso_pitch_deg"]))))
	_spine_add(lumbar, Quaternion(Vector3.FORWARD, deg_to_rad(
			float(_transient_pose_cur["weight_shift"]) * 10.0)))

func set_named_gesture(pname: String) -> bool:
	var key := pname.strip_edges().to_lower()
	if not DEMO_POSES.has(key):
		return false
	clear_transient_pose()
	set_pose(DEMO_POSES[key], key, "manual")
	return true

func begin_walk(speed_mps := 1.0) -> void:
	# Speed is measured by the room tween (distance / duration), not chosen
	# here.  Cadence and stride respond continuously to it and to arousal.
	_walk_speed_mps = clampf(speed_mps, 0.15, 2.4)
	clear_transient_pose()
	_walk_target = 1.0

func end_walk() -> void:
	_walk_target = 0.0

func _update_walk(delta: float) -> void:
	_walk_weight = move_toward(_walk_weight, _walk_target,
			walk_blend_speed * delta)
	# A tail carries translation without a biped stride or chest rock.
	if not _tail_bones.is_empty():
		return
	if _walk_weight <= 0.001:
		return
	# Rough human cadence range, bent rather than selected: quicker travel
	# and activation shorten the cycle while softness slightly lengthens it.
	var cadence_hz := clampf(0.72 + _walk_speed_mps * 0.48
			+ _arousal * 0.18 - _soft * 0.06, 0.65, 1.75)
	_walk_phase = fmod(_walk_phase + delta * cadence_hz * TAU, TAU)
	var swing := sin(_walk_phase)
	var stride_gain := clampf(0.55 + _walk_speed_mps * 0.38,
			0.55, 1.25) * _walk_weight
	var stride := deg_to_rad(walk_stride_deg) * stride_gain
	# Contralateral arms and legs. Missing roles are harmless no-ops,
	# preserving the one pose dialect across different body packages.
	_spine_add(_role_bone("hipL"),
			Quaternion(Vector3.RIGHT, swing * stride))
	_spine_add(_role_bone("hipR"),
			Quaternion(Vector3.RIGHT, -swing * stride))
	_spine_add(_role_bone("humL"),
			Quaternion(Vector3.RIGHT, -swing * stride * 0.72))
	_spine_add(_role_bone("humR"),
			Quaternion(Vector3.RIGHT, swing * stride * 0.72))
	# A knee bends primarily during its leg's forward swing; max() makes
	# this a continuous contact-shaped curve instead of a binary phase.
	var knee := deg_to_rad(walk_knee_deg) * stride_gain
	_spine_add(_role_bone("kneeL"),
			Quaternion(Vector3.RIGHT, maxf(0.0, swing) * knee))
	_spine_add(_role_bone("kneeR"),
			Quaternion(Vector3.RIGHT, maxf(0.0, -swing) * knee))
	var sway := deg_to_rad(walk_torso_sway_deg) * _walk_weight
	_spine_add(_role_bone("chest"),
			Quaternion(Vector3.FORWARD, -swing * sway))
	_spine_add(_role_bone("head"),
			Quaternion(Vector3.FORWARD, swing * sway * 0.35))

func get_posture() -> String:
	return String(_posture)


func set_posture(p: String, force := false) -> void:
	# world-driven: sit/stand events and snapshot land here. The
	# posture pose rides manual priority (holds against mood); the
	# pelvis drop lerps on the instance node -- rig-agnostic, and
	# yes, biped feet may clip the floor until the extracted sits
	# arrive. Declared limitation, not a surprise.
	if p == _posture and not force:
		return
	if p != "standing":
		clear_transient_pose()
	_posture = p
	match p:
		"lying":
			set_pose({"lumbar": [["x", -60.0]]} if not _tail_bones.is_empty() else {}, "lying", "manual")
			_drop_tgt = 0.0
		"sitting":
			var seated: Dictionary = SIT_POSES["sitting"].duplicate(true)
			if not _tail_bones.is_empty(): seated["tail_curl"] = [["y", 75.0]]
			set_pose(seated, "sitting", "manual")
			_drop_tgt = sit_drop_m if _tail_bones.is_empty() else 0.0
		"sitting_floor":
			var seated: Dictionary = SIT_POSES["sitting_floor"].duplicate(true)
			if not _tail_bones.is_empty(): seated["tail_curl"] = [["y", 90.0]]
			set_pose(seated, "sitting_floor",
					"manual")
			_drop_tgt = floor_sit_drop_m if _tail_bones.is_empty() else 0.0
		_:
			clear_pose()
			_drop_tgt = 0.0
	var variant := String(_support_pose.get("variant", ""))
	if p != "standing" and variant != "":
		var shaped: Dictionary = _furniture_rest.pose(variant)
		if not shaped.is_empty(): set_pose(shaped, variant, "manual")
	if p == "standing": _support_pose = {}

func _update_drop(delta):
	if _furniture_rest.ready:
		position.x = _furniture_rest.base_position.x
		position.z = _furniture_rest.base_position.z
	if not _recline_ready:
		_recline_base = quaternion
		_recline_ready = true
	if not _base_y_set:
		if _drop_tgt == 0.0 and _drop_cur == 0.0 and _posture != "lying" and not _support_pose.has("surface_y_m"):
			return
		_base_y = position.y   # lazy capture: fit is long done by
		_base_y_set = true     # the time any posture event arrives
	_drop_cur = lerpf(_drop_cur, _drop_tgt,
			clampf(delta * 2.5, 0.0, 1.0))
	position.y = _base_y - _drop_cur
	_recline = lerpf(_recline, 1.0 if _posture == "lying" else 0.0, 1.0 - exp(-delta / 0.45))
	quaternion = Quaternion(Vector3.RIGHT, -_recline * PI / 2.0 if _tail_bones.is_empty() else 0.0) * _recline_base
	var variant := String(_support_pose.get("variant", "back"))
	var roll := PI if variant == "front" else -PI/2.0 if variant in ["left","elbow_left"] else PI/2.0 if variant in ["right","elbow_right"] else 0.0
	if _tail_bones.is_empty(): quaternion = Quaternion(Vector3.RIGHT, _recline*PI/2.0) * Quaternion(Vector3.UP, roll*_recline) * _recline_base
	if _recline > 0.00001 and _skel and _tail_bones.is_empty():
		var low := INF
		var rest_low := INF
		var rest_high := -INF
		for i in _skel.get_bone_count():
			low = minf(low, (_skel.global_transform * _skel.get_bone_global_pose(i).origin).y)
			var rest_y := _skel.get_bone_global_rest(i).origin.y
			rest_low = minf(rest_low, rest_y)
			rest_high = maxf(rest_high, rest_y)
		var floor_y := (get_parent() as Node3D).global_position.y
		var clearance := (rest_high - rest_low) * _skel.global_basis.get_scale().y * 0.05
		global_position.y += (floor_y + clearance - low) * _recline
	if _posture != "standing" and _skel and _support_pose.has("surface_y_m"):
		_furniture_rest.apply(self, _skel, _support_pose, _posture.begins_with("sitting"))

func _axis(s: String) -> Vector3:
	match s:
		"y": return Vector3.UP
		"z": return Vector3.FORWARD
		_: return Vector3.RIGHT

func _mood_posture() -> void:
	# The body answers the cocktail: dominant mapped emotion strikes
	# its pose, scaled by intensity (0.3 warmth = 30% open). Manual
	# poses hold; mood releases to rest when nothing maps.
	if _pose_src == "manual":
		return
	var best := ""
	var inten := 0.0
	for ename in _emo:
		var key: String = EMOTION_ALIASES.get(ename, ename)
		if MOOD_POSES.has(key) and float(_emo[ename]) > inten:
			best = MOOD_POSES[key]
			inten = float(_emo[ename])
	if best == "":
		if _pose_src == "mood":
			_pose_tgt = {}
			pose_name = ""
			_pose_src = ""
		return
	var w := clampf(inten, 0.0, 1.0)
	var spec: Dictionary = DEMO_POSES.get(best, {})
	var scaled := {}
	for role in spec:
		var q := Quaternion.IDENTITY
		for step in spec[role]:
			q = q * Quaternion(_axis(String(step[0])),
					deg_to_rad(float(step[1])))
		scaled[role] = Quaternion.IDENTITY.slerp(q.normalized(), w)
	set_pose(scaled, best, "mood")

func _role_bone(role: String) -> int:
	# roles resolve through the map; tail_NN roles resolve straight
	# to bones (cached on first lookup, including misses).
	if _bone.has(role):
		return _bone[role]
	if _skel and role.begins_with("tail_"):
		var bi := _skel.find_bone(role)
		_bone[role] = bi
		return bi
	return -1

func tail_travel_weight() -> float:
	return _walk_weight if not _tail_bones.is_empty() else 0.0

func _build_tail_geometry() -> void:
	_tail_arc.clear()
	_tail_envelope.clear()
	_tail_up.clear()
	if _tail_bones.is_empty():
		return
	var top := _skel.get_bone_global_rest(_tail_bones[0]).origin
	var bottom := top.y
	for bi in _tail_bones:
		bottom = minf(bottom, _skel.get_bone_global_rest(bi).origin.y)
	var previous := top
	var arc := 0.0
	for bi in _tail_bones:
		var rest := _skel.get_bone_global_rest(bi)
		arc += rest.origin.distance_to(previous)
		previous = rest.origin
		_tail_arc.append(arc)
		# Keep the upright support steady; open the wave toward the floor.
		var descent := (top.y - rest.origin.y) / maxf(top.y - bottom, 0.001)
		_tail_envelope.append(smoothstep(0.5, 0.85, descent))
		# Bone rolls differ down the coil: a fixed local axis lifts the tail.
		_tail_up.append((rest.basis.inverse() * Vector3.UP).normalized())

func _update_tail(delta):
	if _tail_bones.is_empty():
		return
	var wavelength := maxf(tail_travel_wavelength_m, 0.1)
	var idle_hz := tail_wave_speed * (0.7 + 0.6 * _arousal)
	var travel_hz := _walk_speed_mps / wavelength
	_tail_phase = fmod(_tail_phase + delta * TAU * lerpf(
			idle_hz, travel_hz, _walk_weight), TAU)
	var idle_amp := tail_sway_deg * (0.6 + 0.8 * _arousal) * (1.0 - 0.35 * _soft)
	var amp := deg_to_rad(lerpf(idle_amp, tail_travel_heading_deg, _walk_weight))
	var previous_heading := 0.0
	for i in _tail_bones.size():
		var heading := sin(_tail_phase - _tail_arc[i] * TAU / wavelength) \
				* amp * _tail_envelope[i]
		# Deposit heading differences, not cumulative bends. This bounds the
		# complete chain and preserves its authored coil and vertical profile.
		_spine_add(_tail_bones[i], Quaternion(_tail_up[i], heading - previous_heading))
		previous_heading = heading

func _update_pose(delta):
	if _skel == null:
		return
	var k := clampf(delta * 3.0 / maxf(pose_blend_s, 0.05), 0.0, 1.0)
	for role in _pose_tgt:
		if not _pose_cur.has(role):
			_pose_cur[role] = Quaternion.IDENTITY
	var release := []
	for role in _pose_cur:
		var tq: Quaternion = _pose_tgt.get(role, Quaternion.IDENTITY)
		_pose_cur[role] = (_pose_cur[role] as Quaternion).slerp(tq, k)
		if not _pose_tgt.has(role) and \
				(_pose_cur[role] as Quaternion).angle_to(
				Quaternion.IDENTITY) < 0.002:
			release.append(role)
			continue
		_spine_add(_role_bone(String(role)), _pose_cur[role])
	for role in release:
		_pose_cur.erase(role)

func _update_demo(delta):
	# F key: cycle the gestalt map, no wire needed. Each emotion
	# swells then fades over ~3s; the whole table walks in order.
	if not demo:
		return
	_demo_t += delta
	var keys := EMOTION_GESTALTS.keys()
	if _demo_t >= 3.0:
		_demo_t = 0.0
		_demo_i = (_demo_i + 1) % keys.size()
		print(name, " demo -> ", keys[_demo_i])
	var envelope := sin(_demo_t / 3.0 * PI)   # swell then fade
	_emo = {keys[_demo_i]: envelope}
	_mood_posture()   # F demo drives posture too: face AND body cycle

func _unhandled_input(e: InputEvent):
	if e is InputEventKey and e.pressed and not e.echo \
			and e.keycode == KEY_F:
		demo = not demo
		if demo:
			_demo_t = 0.0
			print(name, " gestalt demo ON (F toggles)")
		else:
			_emo.clear()
			print(name, " gestalt demo OFF")
	if e is InputEventKey and e.pressed and not e.echo \
			and e.keycode == KEY_G:
		# G: cycle the placeholder pose library; past the end -> rest.
		var pk := DEMO_POSES.keys()
		_pose_demo_i += 1
		if _pose_demo_i >= pk.size():
			_pose_demo_i = -1
			clear_pose()
			print(name, " pose -> (rest)")
		else:
			set_pose(DEMO_POSES[pk[_pose_demo_i]], pk[_pose_demo_i])
			print(name, " pose -> ", pk[_pose_demo_i])
