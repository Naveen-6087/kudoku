fn main(
    match_id: pub u64,
    total_pool: pub u128,
    platform_fee: pub u128,
    first_bps: pub u16,
    second_bps: pub u16,
    third_bps: pub u16,
    first: pub u128,
    second: pub u128,
    third: pub u128,
) {
    let prize_pool = total_pool - platform_fee;

    assert(match_id == match_id);
    assert(first_bps as u32 + second_bps as u32 + third_bps as u32 == 10_000);
    assert(first + second + third == prize_pool);
    assert(first * 10_000 == prize_pool * first_bps as u128);
    assert(second * 10_000 == prize_pool * second_bps as u128);
    assert(third * 10_000 == prize_pool * third_bps as u128);
}

#[test]
fn test_valid_split() {
    main(11, 1000, 0, 6500, 2500, 1000, 650, 250, 100);
}
