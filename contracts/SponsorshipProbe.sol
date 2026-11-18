// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Used to test Paid by MetaMask on a sponsored network.
/// `burn` writes one fresh storage slot per iteration.
contract SponsorshipProbe {
    mapping(uint256 => uint256) public slots;
    uint256 private nextSlot;

    function burn(uint256 iterations) external {
        uint256 start = nextSlot;
        uint256 end = start + iterations;
        for (uint256 i = start; i < end; i++) {
            slots[i] = i + 1;
        }
        nextSlot = end;
    }
}
