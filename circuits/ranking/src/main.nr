fn ordered(
    left_mass: u64,
    left_survived_ms: u64,
    left_tiebreak_key: u128,
    right_mass: u64,
    right_survived_ms: u64,
    right_tiebreak_key: u128,
) -> bool {
    if (left_mass > right_mass) {
        true
    } else if (left_mass < right_mass) {
        false
    } else if (left_survived_ms > right_survived_ms) {
        true
    } else if (left_survived_ms < right_survived_ms) {
        false
    } else {
        left_tiebreak_key <= right_tiebreak_key
    }
}

fn main(
    match_id: pub u64,
    player_count: pub u32,
    first_mass: pub u64,
    first_survived_ms: pub u64,
    first_tiebreak_key: pub u128,
    second_mass: pub u64,
    second_survived_ms: pub u64,
    second_tiebreak_key: pub u128,
    third_mass: pub u64,
    third_survived_ms: pub u64,
    third_tiebreak_key: pub u128,
) {
    assert(player_count >= 3);
    assert(match_id == match_id);
    assert(ordered(
        first_mass,
        first_survived_ms,
        first_tiebreak_key,
        second_mass,
        second_survived_ms,
        second_tiebreak_key,
    ));
    assert(ordered(
        second_mass,
        second_survived_ms,
        second_tiebreak_key,
        third_mass,
        third_survived_ms,
        third_tiebreak_key,
    ));
}

#[test]
fn test_valid_ranking() {
    main(11, 3, 100, 120000, 1, 75, 90000, 2, 20, 30000, 3);
}

#[test]
fn test_valid_ranking_tie_breakers() {
    main(11, 3, 50, 1000, 5, 50, 900, 1, 20, 100, 0);
}
