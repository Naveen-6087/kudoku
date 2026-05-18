// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { KudokuEscrow } from "../src/KudokuEscrow.sol";
import { IUltraVerifier } from "../src/interfaces/IUltraVerifier.sol";

contract PlayerAccount {
    receive() external payable {}

    function join(KudokuEscrow escrow, uint256 matchId, uint256 stakeWei) external {
        escrow.joinMatch{ value: stakeWei }(matchId);
    }

    function joinPrivate(KudokuEscrow escrow, uint256 matchId, uint256 stakeWei, bytes32 roomCodeHash) external {
        escrow.joinPrivateMatch{ value: stakeWei }(matchId, roomCodeHash);
    }

    function start(KudokuEscrow escrow, uint256 matchId) external {
        escrow.startMatch(matchId);
    }
}

contract MockVerifier is IUltraVerifier {
    bool private immutable result;

    constructor(bool _result) {
        result = _result;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return result;
    }
}

interface Vm {
    function warp(uint256) external;
}

contract KudokuEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    receive() external payable {}

    function testCreatePublicMatchStoresLobbyState() public {
        KudokuEscrow escrow = createEscrow(true, true);
        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, false, bytes32(0));

        KudokuEscrow.MatchView memory view_ = escrow.getMatch(matchId);
        require(view_.creator == address(this), "creator mismatch");
        require(view_.stakeWei == 1 ether, "stake mismatch");
        require(view_.maxPlayers == 3, "max players mismatch");
        require(view_.status == KudokuEscrow.MatchStatus.Lobby, "status mismatch");
        require(!view_.isPrivate, "visibility mismatch");
        require(view_.players.length == 1, "creator not joined");
    }

    function testRejectInvalidPlayerCount() public {
        KudokuEscrow escrow = createEscrow(true, true);
        bool reverted;
        try escrow.createMatch{ value: 1 ether }(2, 300, false, bytes32(0)) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "expected invalid config revert");

        try escrow.createMatch{ value: 1 ether }(8, 300, false, bytes32(0)) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "expected unsupported size revert");
    }

    function testPrivateJoinRequiresHashAndBecomesReady() public {
        KudokuEscrow escrow = createEscrow(true, true);
        PlayerAccount alice = new PlayerAccount();
        PlayerAccount bob = new PlayerAccount();
        bytes32 roomCodeHash = keccak256(abi.encodePacked("secret-room"));

        payable(address(alice)).transfer(1 ether);
        payable(address(bob)).transfer(1 ether);

        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, true, roomCodeHash);
        require(escrow.findPrivateMatchByRoomCodeHash(roomCodeHash) == matchId, "code lookup mismatch");
        alice.joinPrivate(escrow, matchId, 1 ether, roomCodeHash);

        bool reverted;
        try bob.joinPrivate(escrow, matchId, 1 ether, bytes32(uint256(1))) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "expected invalid room hash revert");

        bob.joinPrivate(escrow, matchId, 1 ether, roomCodeHash);

        KudokuEscrow.MatchView memory view_ = escrow.getMatch(matchId);
        require(view_.status == KudokuEscrow.MatchStatus.Ready, "match not ready");
        require(view_.readyAt != 0, "missing ready timestamp");
        require(view_.players.length == 3, "missing players");
        require(view_.isPrivate, "private flag missing");
        require(view_.roomCodeHash == roomCodeHash, "room hash mismatch");
    }

    function testPrivateLookupClearsOnceStarted() public {
        KudokuEscrow escrow = createEscrow(true, true);
        PlayerAccount alice = new PlayerAccount();
        PlayerAccount bob = new PlayerAccount();
        bytes32 roomCodeHash = keccak256(abi.encodePacked("secret-room"));

        payable(address(alice)).transfer(1 ether);
        payable(address(bob)).transfer(1 ether);

        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, true, roomCodeHash);
        alice.joinPrivate(escrow, matchId, 1 ether, roomCodeHash);
        bob.joinPrivate(escrow, matchId, 1 ether, roomCodeHash);
        vm.warp(block.timestamp + escrow.READY_COUNTDOWN_SECONDS());
        escrow.startMatch(matchId);

        require(escrow.findPrivateMatchByRoomCodeHash(roomCodeHash) == 0, "lookup not cleared");
    }

    function testJoinedPlayerCanStartAfterCountdown() public {
        KudokuEscrow escrow = createEscrow(true, true);
        PlayerAccount alice = new PlayerAccount();
        PlayerAccount bob = new PlayerAccount();

        payable(address(alice)).transfer(1 ether);
        payable(address(bob)).transfer(1 ether);

        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, false, bytes32(0));
        alice.join(escrow, matchId, 1 ether);
        bob.join(escrow, matchId, 1 ether);

        vm.warp(block.timestamp + escrow.READY_COUNTDOWN_SECONDS());
        alice.start(escrow, matchId);

        KudokuEscrow.MatchView memory view_ = escrow.getMatch(matchId);
        require(view_.status == KudokuEscrow.MatchStatus.InProgress, "match did not start");
    }

    function testCancelRefundsJoinedPlayers() public {
        KudokuEscrow escrow = createEscrow(true, true);
        PlayerAccount alice = new PlayerAccount();

        payable(address(alice)).transfer(1 ether);

        uint256 aliceBefore = address(alice).balance;

        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, false, bytes32(0));
        alice.join(escrow, matchId, 1 ether);
        escrow.cancelMatch(matchId);

        KudokuEscrow.MatchView memory view_ = escrow.getMatch(matchId);
        require(view_.status == KudokuEscrow.MatchStatus.Cancelled, "match not cancelled");
        require(address(alice).balance == aliceBefore, "alice not refunded");
        require(address(escrow).balance == 0, "escrow still holds funds");
    }

    function testStartThenSettleDistributesFeeAndPrizePool() public {
        PlayerAccount feeRecipient = new PlayerAccount();
        PlayerAccount alice = new PlayerAccount();
        PlayerAccount bob = new PlayerAccount();

        payable(address(alice)).transfer(1 ether);
        payable(address(bob)).transfer(1 ether);

        KudokuEscrow escrow = createEscrowWithFeeRecipient(address(feeRecipient), true, true);
        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, false, bytes32(0));
        alice.join(escrow, matchId, 1 ether);
        bob.join(escrow, matchId, 1 ether);
        vm.warp(block.timestamp + escrow.READY_COUNTDOWN_SECONDS());
        escrow.startMatch(matchId);

        uint256 creatorBefore = address(this).balance;
        uint256 aliceBefore = address(alice).balance;
        uint256 bobBefore = address(bob).balance;
        uint256 feeBefore = address(feeRecipient).balance;

        address[3] memory winners = [address(this), address(alice), address(bob)];
        uint16[3] memory splits = [uint16(6500), uint16(2500), uint16(1000)];
        bytes32[] memory rankingInputs = buildRankingInputs(matchId, 3);
        bytes32[] memory settlementInputs = buildSettlementInputs(matchId, 3 ether, 300, splits);

        bytes32 resultHash = escrow.hashVerifiedResult(matchId, winners, splits, rankingInputs, settlementInputs);
        escrow.settleMatch(matchId, resultHash, winners, splits, hex"01", rankingInputs, hex"02", settlementInputs);
        assertSettlementBalances(feeRecipient, alice, bob, feeBefore, aliceBefore, bobBefore, creatorBefore, 3 ether, 300);
    }

    function testRejectsSettlementWhenVerifierFails() public {
        KudokuEscrow escrow = createEscrow(true, false);
        PlayerAccount alice = new PlayerAccount();
        PlayerAccount bob = new PlayerAccount();

        payable(address(alice)).transfer(1 ether);
        payable(address(bob)).transfer(1 ether);

        uint256 matchId = escrow.createMatch{ value: 1 ether }(3, 300, false, bytes32(0));
        alice.join(escrow, matchId, 1 ether);
        bob.join(escrow, matchId, 1 ether);
        vm.warp(block.timestamp + escrow.READY_COUNTDOWN_SECONDS());
        escrow.startMatch(matchId);

        address[3] memory winners = [address(this), address(alice), address(bob)];
        uint16[3] memory splits = [uint16(6500), uint16(2500), uint16(1000)];
        bytes32[] memory rankingInputs = buildRankingInputs(matchId, 3);
        bytes32[] memory settlementInputs = buildSettlementInputs(matchId, 3 ether, 300, splits);

        bool reverted;
        try escrow.settleMatch(
            matchId,
            escrow.hashVerifiedResult(matchId, winners, splits, rankingInputs, settlementInputs),
            winners,
            splits,
            hex"01",
            rankingInputs,
            hex"02",
            settlementInputs
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }

        require(reverted, "expected settlement proof revert");
    }

    function createEscrow(bool rankingVerifierResult, bool settlementVerifierResult) private returns (KudokuEscrow) {
        return createEscrowWithFeeRecipient(address(this), rankingVerifierResult, settlementVerifierResult);
    }

    function createEscrowWithFeeRecipient(
        address feeRecipient,
        bool rankingVerifierResult,
        bool settlementVerifierResult
    ) private returns (KudokuEscrow) {
        MockVerifier rankingVerifier = new MockVerifier(rankingVerifierResult);
        MockVerifier settlementVerifier = new MockVerifier(settlementVerifierResult);
        return new KudokuEscrow(address(feeRecipient), address(rankingVerifier), address(settlementVerifier));
    }

    function buildRankingInputs(uint256 matchId, uint256 playerCount) private pure returns (bytes32[] memory rankingInputs) {
        rankingInputs = new bytes32[](11);
        rankingInputs[0] = bytes32(matchId);
        rankingInputs[1] = bytes32(playerCount);
        rankingInputs[2] = bytes32(uint256(50));
        rankingInputs[3] = bytes32(uint256(12_000));
        rankingInputs[4] = bytes32(uint256(1));
        rankingInputs[5] = bytes32(uint256(30));
        rankingInputs[6] = bytes32(uint256(9_000));
        rankingInputs[7] = bytes32(uint256(2));
        rankingInputs[8] = bytes32(uint256(10));
        rankingInputs[9] = bytes32(uint256(6_000));
        rankingInputs[10] = bytes32(uint256(3));
    }

    function buildSettlementInputs(
        uint256 matchId,
        uint256 pool,
        uint16 platformFeeBps,
        uint16[3] memory splits
    ) private pure returns (bytes32[] memory settlementInputs) {
        uint256 fee = (pool * platformFeeBps) / 10_000;
        uint256 prizePool = pool - fee;
        uint256 first = (prizePool * splits[0]) / 10_000;
        uint256 second = (prizePool * splits[1]) / 10_000;
        uint256 third = prizePool - first - second;

        settlementInputs = new bytes32[](9);
        settlementInputs[0] = bytes32(matchId);
        settlementInputs[1] = bytes32(pool);
        settlementInputs[2] = bytes32(fee);
        settlementInputs[3] = bytes32(uint256(splits[0]));
        settlementInputs[4] = bytes32(uint256(splits[1]));
        settlementInputs[5] = bytes32(uint256(splits[2]));
        settlementInputs[6] = bytes32(first);
        settlementInputs[7] = bytes32(second);
        settlementInputs[8] = bytes32(third);
    }

    function assertSettlementBalances(
        PlayerAccount feeRecipient,
        PlayerAccount alice,
        PlayerAccount bob,
        uint256 feeBefore,
        uint256 aliceBefore,
        uint256 bobBefore,
        uint256 creatorBefore,
        uint256 pool,
        uint16 platformFeeBps
    ) private view {
        uint256 fee = (pool * platformFeeBps) / 10_000;
        uint256 prizePool = pool - fee;

        require(address(feeRecipient).balance == feeBefore + fee, "fee recipient mismatch");
        require(address(this).balance == creatorBefore + ((prizePool * 6500) / 10_000), "creator payout mismatch");
        require(address(alice).balance == aliceBefore + ((prizePool * 2500) / 10_000), "alice payout mismatch");
        require(address(bob).balance == bobBefore + ((prizePool * 1000) / 10_000), "bob payout mismatch");
    }
}
