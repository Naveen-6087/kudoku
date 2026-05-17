fn main(total_pool: pub u64, platform_fee: pub u64, first: pub u64, second: pub u64, third: pub u64) {
    let prize_pool = total_pool - platform_fee;

    assert(first + second + third == prize_pool);
    assert(first * 100 == prize_pool * 65);
    assert(second * 100 == prize_pool * 25);
    assert(third * 100 == prize_pool * 10);
}

#[test]
fn test_valid_split() {
    main(1000, 0, 650, 250, 100);
}
