use std::hash::pedersen_hash;

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

fn supported_player_count(player_count: u32) -> bool {
    if (player_count == 3) {
        true
    } else if (player_count == 4) {
        true
    } else if (player_count == 6) {
        true
    } else {
        player_count == 12
    }
}

fn hash_slot(
    mass: u64,
    survived_ms: u64,
    tiebreak_key: u128,
    alive: u8,
    death_type: u8,
) -> Field {
    pedersen_hash([
        mass as Field,
        survived_ms as Field,
        tiebreak_key as Field,
        alive as Field,
        death_type as Field,
    ])
}

fn verify_active_slot(
    duration_ms: u64,
    mass: u64,
    survived_ms: u64,
    alive: u8,
    death_type: u8,
) {
    assert(mass > 0);
    assert(survived_ms <= duration_ms);

    if (alive == 1) {
        assert(death_type == 0);
    } else {
        assert(alive == 0);
        if (death_type == 1) {
            assert(death_type == 1);
        } else {
            assert(death_type == 2);
        }
    }
}

fn verify_empty_slot(
    mass: u64,
    survived_ms: u64,
    tiebreak_key: u128,
    alive: u8,
    death_type: u8,
) {
    assert(mass == 0);
    assert(survived_ms == 0);
    assert(tiebreak_key == 0);
    assert(alive == 0);
    assert(death_type == 0);
}

fn verify_slot(
    enabled: bool,
    duration_ms: u64,
    mass: u64,
    survived_ms: u64,
    tiebreak_key: u128,
    alive: u8,
    death_type: u8,
) {
    if (enabled) {
        assert(tiebreak_key == tiebreak_key);
        verify_active_slot(duration_ms, mass, survived_ms, alive, death_type);
    } else {
        verify_empty_slot(mass, survived_ms, tiebreak_key, alive, death_type);
    }
}

fn main(
    match_id: pub u64,
    player_count: pub u32,
    elimination_commitment: pub Field,
    config_commitment: pub Field,
    duration_ms: u64,
    initial_safe_radius: u64,
    final_safe_radius: u64,
    collision_radius: u64,
    slot_1_mass: u64,
    slot_1_survived_ms: u64,
    slot_1_tiebreak_key: u128,
    slot_1_alive: u8,
    slot_1_death_type: u8,
    slot_2_mass: u64,
    slot_2_survived_ms: u64,
    slot_2_tiebreak_key: u128,
    slot_2_alive: u8,
    slot_2_death_type: u8,
    slot_3_mass: u64,
    slot_3_survived_ms: u64,
    slot_3_tiebreak_key: u128,
    slot_3_alive: u8,
    slot_3_death_type: u8,
    slot_4_mass: u64,
    slot_4_survived_ms: u64,
    slot_4_tiebreak_key: u128,
    slot_4_alive: u8,
    slot_4_death_type: u8,
    slot_5_mass: u64,
    slot_5_survived_ms: u64,
    slot_5_tiebreak_key: u128,
    slot_5_alive: u8,
    slot_5_death_type: u8,
    slot_6_mass: u64,
    slot_6_survived_ms: u64,
    slot_6_tiebreak_key: u128,
    slot_6_alive: u8,
    slot_6_death_type: u8,
    slot_7_mass: u64,
    slot_7_survived_ms: u64,
    slot_7_tiebreak_key: u128,
    slot_7_alive: u8,
    slot_7_death_type: u8,
    slot_8_mass: u64,
    slot_8_survived_ms: u64,
    slot_8_tiebreak_key: u128,
    slot_8_alive: u8,
    slot_8_death_type: u8,
    slot_9_mass: u64,
    slot_9_survived_ms: u64,
    slot_9_tiebreak_key: u128,
    slot_9_alive: u8,
    slot_9_death_type: u8,
    slot_10_mass: u64,
    slot_10_survived_ms: u64,
    slot_10_tiebreak_key: u128,
    slot_10_alive: u8,
    slot_10_death_type: u8,
    slot_11_mass: u64,
    slot_11_survived_ms: u64,
    slot_11_tiebreak_key: u128,
    slot_11_alive: u8,
    slot_11_death_type: u8,
    slot_12_mass: u64,
    slot_12_survived_ms: u64,
    slot_12_tiebreak_key: u128,
    slot_12_alive: u8,
    slot_12_death_type: u8,
) {
    assert(match_id == match_id);
    assert(supported_player_count(player_count));
    assert(duration_ms > 0);
    assert(initial_safe_radius >= final_safe_radius);
    assert(collision_radius > 0);

    let expected_config_commitment = pedersen_hash([
        duration_ms as Field,
        initial_safe_radius as Field,
        final_safe_radius as Field,
        collision_radius as Field,
    ]);
    assert(config_commitment == expected_config_commitment);

    verify_slot(true, duration_ms, slot_1_mass, slot_1_survived_ms, slot_1_tiebreak_key, slot_1_alive, slot_1_death_type);
    verify_slot(true, duration_ms, slot_2_mass, slot_2_survived_ms, slot_2_tiebreak_key, slot_2_alive, slot_2_death_type);
    verify_slot(true, duration_ms, slot_3_mass, slot_3_survived_ms, slot_3_tiebreak_key, slot_3_alive, slot_3_death_type);
    verify_slot(player_count > 3, duration_ms, slot_4_mass, slot_4_survived_ms, slot_4_tiebreak_key, slot_4_alive, slot_4_death_type);
    verify_slot(player_count > 4, duration_ms, slot_5_mass, slot_5_survived_ms, slot_5_tiebreak_key, slot_5_alive, slot_5_death_type);
    verify_slot(player_count > 5, duration_ms, slot_6_mass, slot_6_survived_ms, slot_6_tiebreak_key, slot_6_alive, slot_6_death_type);
    verify_slot(player_count > 6, duration_ms, slot_7_mass, slot_7_survived_ms, slot_7_tiebreak_key, slot_7_alive, slot_7_death_type);
    verify_slot(player_count > 7, duration_ms, slot_8_mass, slot_8_survived_ms, slot_8_tiebreak_key, slot_8_alive, slot_8_death_type);
    verify_slot(player_count > 8, duration_ms, slot_9_mass, slot_9_survived_ms, slot_9_tiebreak_key, slot_9_alive, slot_9_death_type);
    verify_slot(player_count > 9, duration_ms, slot_10_mass, slot_10_survived_ms, slot_10_tiebreak_key, slot_10_alive, slot_10_death_type);
    verify_slot(player_count > 10, duration_ms, slot_11_mass, slot_11_survived_ms, slot_11_tiebreak_key, slot_11_alive, slot_11_death_type);
    verify_slot(player_count > 11, duration_ms, slot_12_mass, slot_12_survived_ms, slot_12_tiebreak_key, slot_12_alive, slot_12_death_type);

    assert(ordered(slot_1_mass, slot_1_survived_ms, slot_1_tiebreak_key, slot_2_mass, slot_2_survived_ms, slot_2_tiebreak_key));
    assert(ordered(slot_2_mass, slot_2_survived_ms, slot_2_tiebreak_key, slot_3_mass, slot_3_survived_ms, slot_3_tiebreak_key));
    if (player_count > 3) {
        assert(ordered(slot_3_mass, slot_3_survived_ms, slot_3_tiebreak_key, slot_4_mass, slot_4_survived_ms, slot_4_tiebreak_key));
    }
    if (player_count > 4) {
        assert(ordered(slot_4_mass, slot_4_survived_ms, slot_4_tiebreak_key, slot_5_mass, slot_5_survived_ms, slot_5_tiebreak_key));
    }
    if (player_count > 5) {
        assert(ordered(slot_5_mass, slot_5_survived_ms, slot_5_tiebreak_key, slot_6_mass, slot_6_survived_ms, slot_6_tiebreak_key));
    }
    if (player_count > 6) {
        assert(ordered(slot_6_mass, slot_6_survived_ms, slot_6_tiebreak_key, slot_7_mass, slot_7_survived_ms, slot_7_tiebreak_key));
    }
    if (player_count > 7) {
        assert(ordered(slot_7_mass, slot_7_survived_ms, slot_7_tiebreak_key, slot_8_mass, slot_8_survived_ms, slot_8_tiebreak_key));
    }
    if (player_count > 8) {
        assert(ordered(slot_8_mass, slot_8_survived_ms, slot_8_tiebreak_key, slot_9_mass, slot_9_survived_ms, slot_9_tiebreak_key));
    }
    if (player_count > 9) {
        assert(ordered(slot_9_mass, slot_9_survived_ms, slot_9_tiebreak_key, slot_10_mass, slot_10_survived_ms, slot_10_tiebreak_key));
    }
    if (player_count > 10) {
        assert(ordered(slot_10_mass, slot_10_survived_ms, slot_10_tiebreak_key, slot_11_mass, slot_11_survived_ms, slot_11_tiebreak_key));
    }
    if (player_count > 11) {
        assert(ordered(slot_11_mass, slot_11_survived_ms, slot_11_tiebreak_key, slot_12_mass, slot_12_survived_ms, slot_12_tiebreak_key));
    }

    let expected_elimination_commitment = pedersen_hash([
        match_id as Field,
        player_count as Field,
        hash_slot(slot_1_mass, slot_1_survived_ms, slot_1_tiebreak_key, slot_1_alive, slot_1_death_type),
        hash_slot(slot_2_mass, slot_2_survived_ms, slot_2_tiebreak_key, slot_2_alive, slot_2_death_type),
        hash_slot(slot_3_mass, slot_3_survived_ms, slot_3_tiebreak_key, slot_3_alive, slot_3_death_type),
        hash_slot(slot_4_mass, slot_4_survived_ms, slot_4_tiebreak_key, slot_4_alive, slot_4_death_type),
        hash_slot(slot_5_mass, slot_5_survived_ms, slot_5_tiebreak_key, slot_5_alive, slot_5_death_type),
        hash_slot(slot_6_mass, slot_6_survived_ms, slot_6_tiebreak_key, slot_6_alive, slot_6_death_type),
        hash_slot(slot_7_mass, slot_7_survived_ms, slot_7_tiebreak_key, slot_7_alive, slot_7_death_type),
        hash_slot(slot_8_mass, slot_8_survived_ms, slot_8_tiebreak_key, slot_8_alive, slot_8_death_type),
        hash_slot(slot_9_mass, slot_9_survived_ms, slot_9_tiebreak_key, slot_9_alive, slot_9_death_type),
        hash_slot(slot_10_mass, slot_10_survived_ms, slot_10_tiebreak_key, slot_10_alive, slot_10_death_type),
        hash_slot(slot_11_mass, slot_11_survived_ms, slot_11_tiebreak_key, slot_11_alive, slot_11_death_type),
        hash_slot(slot_12_mass, slot_12_survived_ms, slot_12_tiebreak_key, slot_12_alive, slot_12_death_type),
    ]);
    assert(elimination_commitment == expected_elimination_commitment);
}

#[test]
fn test_valid_three_player_elimination() {
    let duration_ms = 60_000;
    let initial_safe_radius = 1_180;
    let final_safe_radius = 320;
    let collision_radius = 14;

    let elimination_commitment = pedersen_hash([
        7 as Field,
        3 as Field,
        hash_slot(21, 60_000, 10, 1, 0),
        hash_slot(17, 55_000, 20, 0, 2),
        hash_slot(12, 42_000, 30, 0, 1),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
    ]);
    let config_commitment = pedersen_hash([
        duration_ms as Field,
        initial_safe_radius as Field,
        final_safe_radius as Field,
        collision_radius as Field,
    ]);

    main(
        7,
        3,
        elimination_commitment,
        config_commitment,
        duration_ms,
        initial_safe_radius,
        final_safe_radius,
        collision_radius,
        21,
        60_000,
        10,
        1,
        0,
        17,
        55_000,
        20,
        0,
        2,
        12,
        42_000,
        30,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    );
}

#[test]
fn test_valid_six_player_elimination() {
    let duration_ms = 180_000;
    let initial_safe_radius = 2_250;
    let final_safe_radius = 620;
    let collision_radius = 14;

    let elimination_commitment = pedersen_hash([
        11 as Field,
        6 as Field,
        hash_slot(41, 175_000, 11, 1, 0),
        hash_slot(39, 171_500, 12, 0, 2),
        hash_slot(33, 165_000, 13, 0, 1),
        hash_slot(28, 144_000, 14, 0, 2),
        hash_slot(18, 90_000, 15, 0, 1),
        hash_slot(12, 51_000, 16, 0, 2),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
        hash_slot(0, 0, 0, 0, 0),
    ]);
    let config_commitment = pedersen_hash([
        duration_ms as Field,
        initial_safe_radius as Field,
        final_safe_radius as Field,
        collision_radius as Field,
    ]);

    main(
        11,
        6,
        elimination_commitment,
        config_commitment,
        duration_ms,
        initial_safe_radius,
        final_safe_radius,
        collision_radius,
        41,
        175_000,
        11,
        1,
        0,
        39,
        171_500,
        12,
        0,
        2,
        33,
        165_000,
        13,
        0,
        1,
        28,
        144_000,
        14,
        0,
        2,
        18,
        90_000,
        15,
        0,
        1,
        12,
        51_000,
        16,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    );
}
