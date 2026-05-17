fn main(first_mass: pub u64, second_mass: pub u64, third_mass: pub u64) {
    assert(first_mass >= second_mass);
    assert(second_mass >= third_mass);
}

#[test]
fn test_valid_ranking() {
    main(100, 75, 20);
}
