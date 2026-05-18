use std::hash::pedersen_hash;

fn main(
    match_id: pub u64,
    player_count: pub u32,
    initial_food_count: pub u32,
    seed_commitment: pub Field,
    food_commitment: pub Field,
    revealed_seed: Field,
) {
    let expected_seed_commitment =
        pedersen_hash([revealed_seed, match_id as Field, player_count as Field]);
    let expected_food_commitment =
        pedersen_hash([revealed_seed, initial_food_count as Field, match_id as Field]);

    assert(seed_commitment == expected_seed_commitment);
    assert(food_commitment == expected_food_commitment);
}

#[test]
fn test_valid_rng_commitment() {
    let revealed_seed = 12345;
    let seed_commitment = pedersen_hash([revealed_seed, 42 as Field, 3 as Field]);
    let food_commitment = pedersen_hash([revealed_seed, 120 as Field, 42 as Field]);
    main(42, 3, 120, seed_commitment, food_commitment, revealed_seed);
}
