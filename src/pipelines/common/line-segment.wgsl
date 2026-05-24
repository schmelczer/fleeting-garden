// Six corners forming two triangles for an instanced segment quad.
// X spans [-1, 1] along the segment direction, Y spans [-1, 1] perpendicular.
fn segment_vertex_corner(index: u32) -> vec2<f32> {
  let isRight = index == 2u || index >= 4u;
  let isTop = index == 0u || index == 2u || index == 4u;
  return vec2<f32>(
    select(-1.0, 1.0, isRight),
    select(-1.0, 1.0, isTop)
  );
}

fn segment_vertex_position(
  vertexIndex: u32,
  start: vec2<f32>,
  end: vec2<f32>,
  direction: vec2<f32>,
  radius: f32
) -> vec2<f32> {
  let perpendicular = vec2<f32>(direction.y, -direction.x);
  let corner = segment_vertex_corner(vertexIndex % 6u);
  let center = mix(start, end, (corner.x + 1.0) * 0.5);
  return center + direction * corner.x * radius + perpendicular * corner.y * radius;
}

fn distance_squared_from_segment(
  position: vec2<f32>,
  start: vec2<f32>,
  direction: vec2<f32>,
  inverseLengthSquared: f32
) -> f32 {
  let pa = position - start;
  let q = clamp(dot(pa, direction) * inverseLengthSquared, 0.0, 1.0);
  let nearestOffset = pa - direction * q;
  return dot(nearestOffset, nearestOffset);
}
