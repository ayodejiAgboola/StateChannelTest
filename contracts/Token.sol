pragma solidity >=0.4.22 <0.8.0;

contract Token{

    enum Status {Active, Inactive}
    mapping (bytes32 => Channel) channels;
    struct Channel{
        bytes32 channelId;
        address address1;
        address address2;
        uint balance1;
        uint balance2;
        Status status;
    }

    mapping (address=>uint256) balances;
    address payable owner;
    event BuyToken(address buyer, uint amount);
    event TransferToken(address payer, address payee, uint amount);
    //seed to start token 10000
    constructor() public {
        owner=tx.origin;
        balances[owner]=1000000;
    }

    function createChannel(bytes32 _channelId, bytes32 fingerprint, address _address1, address _address2, bytes memory signature1, bytes memory signature2) public returns(bool){
        require(channels[_channelId].channelId!=_channelId,"Channel Exists");
        require(sigVerify(fingerprint, signature1, _address1),"Invalid signature for address1");
        require(sigVerify(fingerprint, signature2, _address2),"Invalid signature for address2");
        Channel memory newChannel = Channel(_channelId, _address1, _address2, balances[_address1], balances[_address2], Status.Active);
        channels[_channelId] = newChannel;
        return true;
    }
    
    function closeChannel(bytes32 _channelId, bytes32 fingerprint, bytes memory signature1, bytes memory signature2, uint balance1, uint balance2) public{
        Channel memory channel = channels[_channelId];
        address _address1 = channel.address1;
        address _address2 = channel.address2;
        require(sigVerify(fingerprint, signature1, _address1),"Invalid signature for address1");
        require(sigVerify(fingerprint, signature2, _address2),"Invalid signature for address2");
        balances[_address1]=balance1;
        balances[_address2]=balance2;
        channel.status = Status.Inactive;
        channel.balance1 = balance1;
        channel.balance2 = balance2;
        channels[_channelId]=channel;
    }

    function updateChannelAndBalances(bytes32 _channelId, bytes32 fingerprint, bytes memory signature1, bytes memory signature2, uint balance1, uint balance2) public returns(bool){
        Channel memory channel = channels[_channelId];
        address _address1 = channel.address1;
        address _address2 = channel.address2;
        require(sigVerify(fingerprint, signature1, _address1),"Invalid signature for address1");
        require(sigVerify(fingerprint, signature2, _address2),"Invalid signature for address2");
        balances[_address1]=balance1;
        balances[_address2]=balance2;
        channel.balance1 = balance1;
        channel.balance2 = balance2;
        channels[_channelId]=channel;

        return true;
    }
    //assume 1 token = 1 wei
    function buyToken(uint amount) public payable returns (bool){
        require(msg.value==amount, "You can only buy 1 Token for 1 wei");
        balances[msg.sender]+=amount;
        balances[owner]-=amount;
        owner.transfer(msg.value);
        emit BuyToken(msg.sender,amount);
        return true;
    }

    function transfer(address payee, uint amount) public{
        require(balances[msg.sender]>amount,"Insufficient Balance");
        balances[msg.sender]-=amount;
        balances[payee]+=amount;
        emit TransferToken(msg.sender, payee, amount);
    }

    function sigVerify(bytes32 hash, bytes memory sig, address signer) public view returns (bool){
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        require(sig.length==65,"Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := mload(add(sig, 65))
        }
        if (v < 27)
          v += 27;

        address sigAddress = ecrecover(hash, v, r, s);
        return sigAddress == signer;
    }

    function getBalance(address addr) public view returns(uint) {
		return balances[addr];
	}

    function getChannel(bytes32 channelId) public view returns(address, address){
        return (channels[channelId].address1, channels[channelId].address2);
    }
}