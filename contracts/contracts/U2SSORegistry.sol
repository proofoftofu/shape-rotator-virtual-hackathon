// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract U2SSORegistry {
    struct IdentityRecord {
        uint256 id;
        uint256 id33;
        uint256 commitment;
        bool active;
        address owner;
        uint64 registeredAt;
    }

    address private immutable _owner;
    IdentityRecord[] private _idList;

    event IdentityRegistered(
        uint256 indexed index,
        uint256 indexed id,
        uint256 indexed id33,
        address owner
    );

    event IdentityRevoked(uint256 indexed index, address revokedBy);

    error IndexOutOfBounds(uint256 index);
    error IdentityAlreadyRegistered(uint256 id, uint256 id33);
    error NotIdentityOwner(uint256 index, address caller);

    constructor() {
        _owner = msg.sender;
    }

    function addID(uint256 id, uint256 id33, uint256 commitment) external returns (uint256) {
        if (getIDIndex(id, id33) >= 0) {
            revert IdentityAlreadyRegistered(id, id33);
        }

        uint256 newIndex = _idList.length;
        _idList.push(
            IdentityRecord({
                id: id,
                id33: id33,
                commitment: commitment,
                active: true,
                owner: msg.sender,
                registeredAt: uint64(block.timestamp)
            })
        );

        emit IdentityRegistered(newIndex, id, id33, msg.sender);

        return newIndex;
    }

    function revokeID(uint256 index) external {
        if (index >= _idList.length) {
            revert IndexOutOfBounds(index);
        }

        IdentityRecord storage identity = _idList[index];

        if (msg.sender != identity.owner && msg.sender != _owner) {
            revert NotIdentityOwner(index, msg.sender);
        }

        identity.active = false;

        emit IdentityRevoked(index, msg.sender);
    }

    function getIDs(uint256 index) external view returns (uint256, uint256) {
        if (index >= _idList.length) {
            revert IndexOutOfBounds(index);
        }

        IdentityRecord storage identity = _idList[index];
        return (identity.id, identity.id33);
    }

    function getState(uint256 index) external view returns (bool) {
        if (index >= _idList.length) {
            revert IndexOutOfBounds(index);
        }

        return _idList[index].active;
    }

    function getIDSize() external view returns (uint256) {
        return _idList.length;
    }

    function getIDIndex(uint256 id, uint256 id33) public view returns (int256) {
        for (uint256 i = 0; i < _idList.length; i++) {
            IdentityRecord storage identity = _idList[i];
            if (identity.id == id && identity.id33 == id33) {
                return int256(i);
            }
        }

        return -1;
    }

    function getActiveIDs() external view returns (uint256[] memory ids, uint256[] memory id33s) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < _idList.length; i++) {
            if (_idList[i].active) {
                activeCount += 1;
            }
        }

        ids = new uint256[](activeCount);
        id33s = new uint256[](activeCount);

        uint256 cursor = 0;
        for (uint256 i = 0; i < _idList.length; i++) {
            IdentityRecord storage identity = _idList[i];
            if (identity.active) {
                ids[cursor] = identity.id;
                id33s[cursor] = identity.id33;
                cursor += 1;
            }
        }
    }

    function getIdentity(uint256 index)
        external
        view
        returns (
            uint256 id,
            uint256 id33,
            uint256 commitment,
            bool active,
            address recordOwner,
            uint64 registeredAt
        )
    {
        if (index >= _idList.length) {
            revert IndexOutOfBounds(index);
        }

        IdentityRecord storage identity = _idList[index];
        return (
            identity.id,
            identity.id33,
            identity.commitment,
            identity.active,
            identity.owner,
            identity.registeredAt
        );
    }

    function owner() external view returns (address) {
        return _owner;
    }
}
