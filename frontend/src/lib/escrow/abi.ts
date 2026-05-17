export const escrowAbi = [
  {
    type: "event",
    name: "MatchCreated",
    inputs: [
      { indexed: true, name: "matchId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "stakeWei", type: "uint96" },
      { indexed: false, name: "maxPlayers", type: "uint8" },
      { indexed: false, name: "isPrivate", type: "bool" },
      { indexed: false, name: "roomCodeHash", type: "bytes32" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MatchReady",
    inputs: [
      { indexed: true, name: "matchId", type: "uint256" },
      { indexed: false, name: "readyAt", type: "uint64" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MatchStarted",
    inputs: [
      { indexed: true, name: "matchId", type: "uint256" },
      { indexed: true, name: "starter", type: "address" }
    ],
    anonymous: false
  },
  {
    type: "function",
    name: "createMatch",
    stateMutability: "payable",
    inputs: [
      { name: "maxPlayers", type: "uint8" },
      { name: "platformFeeBps", type: "uint16" },
      { name: "isPrivate", type: "bool" },
      { name: "roomCodeHash", type: "bytes32" }
    ],
    outputs: [{ name: "matchId", type: "uint256" }]
  },
  {
    type: "function",
    name: "joinMatch",
    stateMutability: "payable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "joinPrivateMatch",
    stateMutability: "payable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "providedRoomCodeHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "startMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "getMatch",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [
      {
        name: "view_",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "stakeWei", type: "uint96" },
          { name: "maxPlayers", type: "uint8" },
          { name: "platformFeeBps", type: "uint16" },
          { name: "status", type: "uint8" },
           { name: "resultHash", type: "bytes32" },
           { name: "isPrivate", type: "bool" },
           { name: "roomCodeHash", type: "bytes32" },
           { name: "readyAt", type: "uint64" },
           { name: "startedAt", type: "uint64" },
           { name: "players", type: "address[]" }
         ]
       }
    ]
  },
  {
    type: "function",
    name: "matchExists",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "getPublicOpenMatches",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }]
  },
  {
    type: "function",
    name: "getMatchesByCreator",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }]
  },
  {
    type: "function",
    name: "getMatchesByPlayer",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }]
  },
  {
    type: "function",
    name: "findPrivateMatchByRoomCodeHash",
    stateMutability: "view",
    inputs: [{ name: "roomCodeHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "verifyRankingProof",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "verifySettlementProof",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "hashVerifiedResult",
    stateMutability: "pure",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "winners", type: "address[3]" },
      { name: "winnerBps", type: "uint16[3]" },
      { name: "rankingPublicInputs", type: "bytes32[]" },
      { name: "settlementPublicInputs", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "settleMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
      { name: "winners", type: "address[3]" },
      { name: "winnerBps", type: "uint16[3]" },
      { name: "rankingProof", type: "bytes" },
      { name: "rankingPublicInputs", type: "bytes32[]" },
      { name: "settlementProof", type: "bytes" },
      { name: "settlementPublicInputs", type: "bytes32[]" }
    ],
    outputs: []
  }
] as const;
