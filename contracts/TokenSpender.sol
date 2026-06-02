// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IERC20TransferFrom {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TokenSpender {
    address public immutable token;

    event SpentToken(address indexed token, address indexed from, address indexed to, uint256 amount);

    constructor(address token_) {
        token = token_;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(IERC20TransferFrom(token).transferFrom(from, to, amount), "TRANSFER_FROM_FAILED");
        emit SpentToken(token, from, to, amount);
    }
}
