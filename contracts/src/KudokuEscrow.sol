// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IUltraVerifier } from "./interfaces/IUltraVerifier.sol";

contract KudokuEscrow {
    error InvalidConfig();
    error InvalidStake();
    error MatchFull();
    error MatchNotFound();
    error MatchAlreadyStarted();
    error MatchNotReady();
    error MatchNotFull();
    error MatchEnded();
    error AlreadyJoined();
    error NotPlayer();
    error NotCreator();
    error InvalidPayouts();
    error TransferFailed();
    error InvalidVerifierAddress();
    error InvalidPublicInputs();
    error InvalidProof();
    error InvalidResultHash();
    error InvalidRoomCode();
    error CountdownPending();

    enum MatchStatus {
        Lobby,
        Ready,
        InProgress,
        Settled,
        Cancelled
    }

    struct MatchView {
        address creator;
        uint96 stakeWei;
        uint8 maxPlayers;
        uint16 platformFeeBps;
        MatchStatus status;
        bytes32 resultHash;
        bool isPrivate;
        bytes32 roomCodeHash;
        uint64 readyAt;
        uint64 startedAt;
        address[] players;
    }

    struct MatchData {
        address creator;
        uint96 stakeWei;
        uint8 maxPlayers;
        uint16 platformFeeBps;
        MatchStatus status;
        bytes32 resultHash;
        bool isPrivate;
        bytes32 roomCodeHash;
        uint64 readyAt;
        uint64 startedAt;
        bool exists;
        address[] players;
        mapping(address => bool) joined;
    }

    struct SettlementValues {
        uint256 pool;
        uint256 fee;
        uint256[3] payouts;
    }

    uint256 public nextMatchId = 1;
    uint64 public constant READY_COUNTDOWN_SECONDS = 5;
    address public immutable FEE_RECIPIENT;
    IUltraVerifier public immutable RANKING_VERIFIER;
    IUltraVerifier public immutable SETTLEMENT_VERIFIER;

    mapping(uint256 => MatchData) private matches;
    uint256[] private activeMatchIds;
    mapping(address => uint256[]) private matchesByCreator;
    mapping(address => uint256[]) private matchesByPlayer;
    mapping(bytes32 => uint256) private activePrivateMatchByCodeHash;

    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        uint96 stakeWei,
        uint8 maxPlayers,
        bool isPrivate,
        bytes32 roomCodeHash
    );
    event PlayerJoined(uint256 indexed matchId, address indexed player);
    event MatchReady(uint256 indexed matchId, uint64 readyAt);
    event MatchStarted(uint256 indexed matchId, address indexed starter);
    event MatchSettled(uint256 indexed matchId, bytes32 resultHash);
    event MatchCancelled(uint256 indexed matchId);
    event MatchProofsVerified(
        uint256 indexed matchId,
        bytes32 indexed resultHash,
        bytes32 rankingInputsHash,
        bytes32 settlementInputsHash
    );

    constructor(address _feeRecipient, address _rankingVerifier, address _settlementVerifier) {
        if (_feeRecipient == address(0)) revert InvalidConfig();
        if (_rankingVerifier == address(0) || _settlementVerifier == address(0)) {
            revert InvalidVerifierAddress();
        }
        FEE_RECIPIENT = _feeRecipient;
        RANKING_VERIFIER = IUltraVerifier(_rankingVerifier);
        SETTLEMENT_VERIFIER = IUltraVerifier(_settlementVerifier);
    }

    function createMatch(
        uint8 maxPlayers,
        uint16 platformFeeBps,
        bool isPrivate,
        bytes32 roomCodeHash
    ) external payable returns (uint256 matchId) {
        if (!_isSupportedPlayerCount(maxPlayers) || platformFeeBps > 500) revert InvalidConfig();
        if (msg.value == 0 || msg.value > type(uint96).max) revert InvalidStake();
        if (isPrivate && roomCodeHash == bytes32(0)) revert InvalidRoomCode();
        if (!isPrivate && roomCodeHash != bytes32(0)) revert InvalidRoomCode();

        matchId = nextMatchId++;
        MatchData storage matchData = matches[matchId];
        matchData.creator = msg.sender;
        matchData.stakeWei = uint96(msg.value);
        matchData.maxPlayers = maxPlayers;
        matchData.platformFeeBps = platformFeeBps;
        matchData.status = MatchStatus.Lobby;
        matchData.isPrivate = isPrivate;
        matchData.roomCodeHash = roomCodeHash;
        matchData.exists = true;
        matchData.players.push(msg.sender);
        matchData.joined[msg.sender] = true;

        activeMatchIds.push(matchId);
        matchesByCreator[msg.sender].push(matchId);
        matchesByPlayer[msg.sender].push(matchId);
        if (isPrivate) {
            activePrivateMatchByCodeHash[roomCodeHash] = matchId;
        }

        emit MatchCreated(matchId, msg.sender, uint96(msg.value), maxPlayers, isPrivate, roomCodeHash);
        emit PlayerJoined(matchId, msg.sender);
    }

    function joinMatch(uint256 matchId) external payable {
        _joinMatch(matchId, bytes32(0), false);
    }

    function joinPrivateMatch(uint256 matchId, bytes32 providedRoomCodeHash) external payable {
        _joinMatch(matchId, providedRoomCodeHash, true);
    }

    function startMatch(uint256 matchId) external {
        MatchData storage matchData = _requireMatch(matchId);
        if (!matchData.joined[msg.sender]) revert NotPlayer();
        if (matchData.status != MatchStatus.Ready) revert MatchNotReady();
        if (matchData.players.length != matchData.maxPlayers) revert MatchNotFull();
        if (block.timestamp < uint256(matchData.readyAt) + READY_COUNTDOWN_SECONDS) revert CountdownPending();

        matchData.status = MatchStatus.InProgress;
        matchData.startedAt = uint64(block.timestamp);
        if (matchData.isPrivate) {
            delete activePrivateMatchByCodeHash[matchData.roomCodeHash];
        }

        emit MatchStarted(matchId, msg.sender);
    }

    function cancelMatch(uint256 matchId) external {
        MatchData storage matchData = _requireMatch(matchId);
        if (msg.sender != matchData.creator) revert NotCreator();
        if (matchData.status != MatchStatus.Lobby && matchData.status != MatchStatus.Ready) revert MatchAlreadyStarted();

        matchData.status = MatchStatus.Cancelled;
        address[] memory players = matchData.players;
        uint256 stake = matchData.stakeWei;
        if (matchData.isPrivate) {
            delete activePrivateMatchByCodeHash[matchData.roomCodeHash];
        }

        _removeFromActiveMatches(matchId);
        emit MatchCancelled(matchId);

        for (uint256 i = 0; i < players.length; i++) {
            _send(players[i], stake);
        }
    }

    function settleMatch(
        uint256 matchId,
        bytes32 resultHash,
        address[3] calldata winners,
        uint16[3] calldata winnerBps,
        bytes calldata rankingProof,
        bytes32[] calldata rankingPublicInputs,
        bytes calldata settlementProof,
        bytes32[] calldata settlementPublicInputs
    ) external {
        MatchData storage matchData = _requireMatch(matchId);
        if (matchData.status != MatchStatus.InProgress) revert MatchNotReady();
        if (resultHash == bytes32(0)) revert InvalidConfig();
        if (winnerBps[0] + winnerBps[1] + winnerBps[2] != 10_000) revert InvalidPayouts();

        _validateWinners(matchData, winners);

        SettlementValues memory settlementValues =
            _deriveSettlementValues(matchData.stakeWei, matchData.players.length, matchData.platformFeeBps, winnerBps);

        _validateProofBundle(
            matchId,
            matchData.players.length,
            settlementValues,
            winnerBps,
            rankingProof,
            rankingPublicInputs,
            settlementProof,
            settlementPublicInputs
        );

        bytes32 expectedResultHash =
            hashVerifiedResult(matchId, winners, winnerBps, rankingPublicInputs, settlementPublicInputs);
        if (expectedResultHash != resultHash) revert InvalidResultHash();

        matchData.status = MatchStatus.Settled;
        matchData.resultHash = resultHash;
        if (matchData.isPrivate) {
            delete activePrivateMatchByCodeHash[matchData.roomCodeHash];
        }
        _removeFromActiveMatches(matchId);

        emit MatchSettled(matchId, resultHash);
        emit MatchProofsVerified(
            matchId,
            resultHash,
            keccak256(abi.encode(rankingPublicInputs)),
            keccak256(abi.encode(settlementPublicInputs))
        );

        if (settlementValues.fee > 0) _send(FEE_RECIPIENT, settlementValues.fee);
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && settlementValues.payouts[i] > 0) {
                _send(winners[i], settlementValues.payouts[i]);
            }
        }
    }

    function verifyRankingProof(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != 11) revert InvalidPublicInputs();
        return _verifyProof(RANKING_VERIFIER, proof, publicInputs);
    }

    function verifySettlementProof(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != 9) revert InvalidPublicInputs();
        return _verifyProof(SETTLEMENT_VERIFIER, proof, publicInputs);
    }

    function hashVerifiedResult(
        uint256 matchId,
        address[3] calldata winners,
        uint16[3] calldata winnerBps,
        bytes32[] calldata rankingPublicInputs,
        bytes32[] calldata settlementPublicInputs
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(matchId, winners, winnerBps, rankingPublicInputs, settlementPublicInputs));
    }

    function matchExists(uint256 matchId) external view returns (bool) {
        return matches[matchId].exists;
    }

    function getPublicOpenMatches() external view returns (uint256[] memory) {
        uint256[] memory temp = new uint256[](activeMatchIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < activeMatchIds.length; i++) {
            uint256 matchId = activeMatchIds[i];
            MatchData storage matchData = matches[matchId];
            if (matchData.exists && !matchData.isPrivate && matchData.status == MatchStatus.Lobby) {
                temp[count] = matchId;
                count++;
            }
        }

        return _shrinkArray(temp, count);
    }

    function getMatchesByCreator(address creator) external view returns (uint256[] memory) {
        return matchesByCreator[creator];
    }

    function getMatchesByPlayer(address player) external view returns (uint256[] memory) {
        return matchesByPlayer[player];
    }

    function findPrivateMatchByRoomCodeHash(bytes32 roomCodeHash) external view returns (uint256) {
        return activePrivateMatchByCodeHash[roomCodeHash];
    }

    function getMatch(uint256 matchId) external view returns (MatchView memory view_) {
        MatchData storage matchData = _requireMatch(matchId);
        view_ = MatchView({
            creator: matchData.creator,
            stakeWei: matchData.stakeWei,
            maxPlayers: matchData.maxPlayers,
            platformFeeBps: matchData.platformFeeBps,
            status: matchData.status,
            resultHash: matchData.resultHash,
            isPrivate: matchData.isPrivate,
            roomCodeHash: matchData.roomCodeHash,
            readyAt: matchData.readyAt,
            startedAt: matchData.startedAt,
            players: matchData.players
        });
    }

    function _joinMatch(uint256 matchId, bytes32 providedRoomCodeHash, bool joiningPrivate) private {
        MatchData storage matchData = _requireMatch(matchId);
        if (matchData.status != MatchStatus.Lobby) revert MatchAlreadyStarted();
        if (msg.value != matchData.stakeWei) revert InvalidStake();
        if (matchData.joined[msg.sender]) revert AlreadyJoined();
        if (matchData.players.length >= matchData.maxPlayers) revert MatchFull();

        if (matchData.isPrivate) {
            if (!joiningPrivate || providedRoomCodeHash != matchData.roomCodeHash) revert InvalidRoomCode();
        } else if (joiningPrivate || providedRoomCodeHash != bytes32(0)) {
            revert InvalidRoomCode();
        }

        matchData.players.push(msg.sender);
        matchData.joined[msg.sender] = true;
        matchesByPlayer[msg.sender].push(matchId);

        emit PlayerJoined(matchId, msg.sender);

        if (matchData.players.length == matchData.maxPlayers) {
            matchData.status = MatchStatus.Ready;
            matchData.readyAt = uint64(block.timestamp);
            emit MatchReady(matchId, matchData.readyAt);
        }
    }

    function _isSupportedPlayerCount(uint8 maxPlayers) private pure returns (bool) {
        return maxPlayers == 3 || maxPlayers == 4 || maxPlayers == 6 || maxPlayers == 12;
    }

    function _requireMatch(uint256 matchId) private view returns (MatchData storage matchData) {
        matchData = matches[matchId];
        if (!matchData.exists) revert MatchNotFound();
    }

    function _removeFromActiveMatches(uint256 matchId) private {
        for (uint256 i = 0; i < activeMatchIds.length; i++) {
            if (activeMatchIds[i] == matchId) {
                activeMatchIds[i] = activeMatchIds[activeMatchIds.length - 1];
                activeMatchIds.pop();
                break;
            }
        }
    }

    function _shrinkArray(uint256[] memory source, uint256 count) private pure returns (uint256[] memory result) {
        result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = source[i];
        }
    }

    function _send(address to, uint256 value) private {
        (bool ok, ) = to.call{ value: value }("");
        if (!ok) revert TransferFailed();
    }

    function _verifyProof(
        IUltraVerifier verifier,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) private view returns (bool) {
        try verifier.verify(proof, publicInputs) returns (bool valid) {
            return valid;
        } catch {
            return false;
        }
    }

    function _validateRankingInputs(uint256 matchId, uint256 playerCount, bytes32[] calldata rankingPublicInputs)
        private
        pure
    {
        if (rankingPublicInputs.length != 11) revert InvalidPublicInputs();
        if (uint256(rankingPublicInputs[0]) != matchId || uint256(rankingPublicInputs[1]) != playerCount) {
            revert InvalidPublicInputs();
        }
    }

    function _validateSettlementInputs(
        uint256 matchId,
        uint256 totalPool,
        uint256 platformFee,
        uint16[3] calldata winnerBps,
        uint256[3] memory payouts,
        bytes32[] calldata settlementPublicInputs
    ) private pure {
        if (settlementPublicInputs.length != 9) revert InvalidPublicInputs();
        if (
            uint256(settlementPublicInputs[0]) != matchId ||
            uint256(settlementPublicInputs[1]) != totalPool ||
            uint256(settlementPublicInputs[2]) != platformFee ||
            uint256(settlementPublicInputs[3]) != winnerBps[0] ||
            uint256(settlementPublicInputs[4]) != winnerBps[1] ||
            uint256(settlementPublicInputs[5]) != winnerBps[2] ||
            uint256(settlementPublicInputs[6]) != payouts[0] ||
            uint256(settlementPublicInputs[7]) != payouts[1] ||
            uint256(settlementPublicInputs[8]) != payouts[2]
        ) {
            revert InvalidPublicInputs();
        }
    }

    function _validateWinners(MatchData storage matchData, address[3] calldata winners) private view {
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && !matchData.joined[winners[i]]) revert NotPlayer();
        }
    }

    function _validateProofBundle(
        uint256 matchId,
        uint256 playerCount,
        SettlementValues memory settlementValues,
        uint16[3] calldata winnerBps,
        bytes calldata rankingProof,
        bytes32[] calldata rankingPublicInputs,
        bytes calldata settlementProof,
        bytes32[] calldata settlementPublicInputs
    ) private view {
        _validateRankingInputs(matchId, playerCount, rankingPublicInputs);
        _validateSettlementInputs(
            matchId, settlementValues.pool, settlementValues.fee, winnerBps, settlementValues.payouts, settlementPublicInputs
        );

        if (!_verifyProof(RANKING_VERIFIER, rankingProof, rankingPublicInputs)) revert InvalidProof();
        if (!_verifyProof(SETTLEMENT_VERIFIER, settlementProof, settlementPublicInputs)) revert InvalidProof();
    }

    function _deriveSettlementValues(
        uint96 stakeWei,
        uint256 playerCount,
        uint16 platformFeeBps,
        uint16[3] calldata winnerBps
    ) private pure returns (SettlementValues memory values) {
        values.pool = uint256(stakeWei) * playerCount;
        values.fee = (values.pool * platformFeeBps) / 10_000;
        values.payouts = _derivePayouts(values.pool - values.fee, winnerBps);
    }

    function _derivePayouts(uint256 prizePool, uint16[3] calldata winnerBps) private pure returns (uint256[3] memory) {
        uint256[3] memory payouts;
        payouts[0] = (prizePool * winnerBps[0]) / 10_000;
        payouts[1] = (prizePool * winnerBps[1]) / 10_000;
        payouts[2] = prizePool - payouts[0] - payouts[1];
        return payouts;
    }
}
