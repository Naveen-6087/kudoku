fn rounded_schedule_radius(duration_ms: u64, elapsed_ms: u64, initial_safe_radius: u64, final_safe_radius: u64) -> u64 {
    let radius_delta = initial_safe_radius - final_safe_radius;
    let rounded_delta = ((radius_delta * elapsed_ms) + (duration_ms / 2)) / duration_ms;
    initial_safe_radius - rounded_delta
}

fn main(
    match_id: pub u64,
    duration_ms: pub u64,
    elapsed_ms: pub u64,
    initial_safe_radius: pub u64,
    final_safe_radius: pub u64,
    current_safe_radius: pub u64,
    arena_damage_per_second: pub u64,
) {
    assert(match_id == match_id);
    assert(duration_ms > 0);
    assert(elapsed_ms <= duration_ms);
    assert(initial_safe_radius >= final_safe_radius);
    assert(arena_damage_per_second > 0);

    let expected_radius = rounded_schedule_radius(duration_ms, elapsed_ms, initial_safe_radius, final_safe_radius);
    assert(current_safe_radius == expected_radius);
}

#[test]
fn test_valid_arena_schedule() {
    main(7, 180000, 90000, 3900, 1300, 2600, 120);
}
