const Token = artifacts.require("Token");
channelStore = {};
txStore = {};

//address1=accounts[0]
//address2=accounts[1]
contract('Token', (accounts)=> {
    it('1st account should have 1000000 tokens', async ()=>{
        const tokenInstance = await Token.deployed();
        const balance = await tokenInstance.getBalance.call(accounts[0]);
        assert.equal(balance.valueOf(), 1000000, "10000 wasn't in the first account");
    });
    
    it('Signature should be verified', async ()=>{
        const tokenInstance = await Token.deployed();
        const acc = accounts[0];
        const data = "Stuff";
        const hash = toHex("Stuff");
        const sig = await web3.eth.sign('0x'+hash, acc);
        const dataEdited = "\x19Ethereum Signed Message:\n"+data.length+data;
        const dataSha = web3.utils.sha3(dataEdited);
        const verify = await tokenInstance.sigVerify.call(dataSha, sig, acc);

        assert.equal(verify, true, "Signature should be verified for address");
    });

    it('Address 2 balance should increase by 50 when buys token', async ()=>{
        const tokenInstance = await Token.deployed();
        let _value = web3.utils.toWei('50','wei');
        let status = await tokenInstance.buyToken(50, {from: accounts[1], value: _value});
        const balance = await tokenInstance.getBalance.call(accounts[1]);
        assert.equal(balance.valueOf(), 50, "50 Should be in address 2");
    });

    it('Channel should be created with pending status', async ()=>{
        const tokenInstance = await Token.deployed();
        let channelId="001";
        channel = await proposeCreateBlockchainChannel(channelId,accounts[0], accounts[1],tokenInstance);
        assert.equal(channel.status,"Pending","Channel should be created with status pending ");
        
    });

    it('Channel should be created on chain', async ()=>{
        const tokenInstance = await Token.deployed();
        let channelId="001";
        status = await acceptCreateBlockchainChannel(channelId, accounts[1],tokenInstance);
        const channelMembers = await tokenInstance.getChannel.call(web3.utils.asciiToHex(channelId));
        console.log(channelStore[channelId]);
        assert.equal(channelMembers['0'], accounts[0], "Channel should be created on chain");
        assert.equal(channelMembers['1'], accounts[1], "Channel should be created on chain");
        assert.equal(channelStore[channelId].status, "Active", "Channel should be active");
    });

    it('Transfer should be created with pending status then accept transfer', async ()=>{
        const tokenInstance = await Token.deployed();
        let channelId="001";
        _balance1 = channelStore[channelId].balance1;
        _balance2 = channelStore[channelId].balance2;
        txHash = await proposeTransfer(channelId, accounts[0],50);
        assert.equal(txStore[txHash].status, "Pending", "Transaction should be created locally");
        status = await acceptTransfer(txHash, channelId, accounts[1], tokenInstance);
        _balance1AfterTransfer = channelStore[channelId].balance1;
        _balance2AfterTransfer = channelStore[channelId].balance2;
        console.log(channelStore[channelId]);
        assert.equal(_balance1AfterTransfer, _balance1-50,"Balance of address1 should be less by 50");
        assert.equal(_balance2AfterTransfer, _balance2+50,"Balance of address2 should be more by 50");
        assert.equal(txStore[txHash].status, "Confirmed", "Transaction completed");

    });

    it('Propose channel update and update on chain', async ()=>{
        const tokenInstance = await Token.deployed();
        let channelId="001";
        const resultProposal = await proposeUpdateChannel(channelId, accounts[0]);
        if(resultProposal){
            const resultupdate = await acceptUpdateChannel(channelId,accounts[1],tokenInstance);
        }
        
        const balance = await tokenInstance.getBalance.call(accounts[1]);
        console.log(balance);
        assert.equal(balance.valueOf(), 100, "100 Should be in address 2");
    });

    it('Propose channel close and update on chain', async ()=>{
        const tokenInstance = await Token.deployed();
        let channelId="001";
        const resultProposal = await proposeCloseChannel(channelId, accounts[0]);
        assert.equal(channelStore[channelId].status, "Closing", "Channel is closing");
        if(resultProposal){
            const resultupdate = await acceptCloseChannel(channelId,accounts[1],tokenInstance);
        }
        
        assert.equal(channelStore[channelId].status, "Closed", "Channel is closed");
    })

});

function toHex(str) {
    var hex = ''
    for(var i=0;i<str.length;i++) {
     hex += ''+str.charCodeAt(i).toString(16)
    }
    return hex
}



async function proposeCreateBlockchainChannel(channelId, address1, address2, tokenInstance){
    _balance1 = await tokenInstance.getBalance.call(address1).valueOf();
    const data = channelId+address1+address2;
    const hash = toHex(data);
    const sig = await web3.eth.sign('0x'+hash, address1);
    channelStore[channelId]={
        channelId: channelId,
        address1 : address1,
        address2 : address2,
        balance1 : +_balance1,
        balance2 : 0,
        signature1 : sig,
        signature2 : "",
        status: "Pending",
        seqNum: 0
    };
    return channelStore[channelId]
}

async function acceptCreateBlockchainChannel(channelId, address2, tokenInstance){
    let channel = channelStore[channelId];
    if(channel.address2===address2){
        const data = channel.channelId+channel.address1+channel.address2;
        const dataEdited = "\x19Ethereum Signed Message:\n"+data.length+data;
        const dataSha = web3.utils.sha3(dataEdited);
        _balance2 = await tokenInstance.getBalance.call(address2).valueOf();
        const hash = toHex(data);
        const sig = await web3.eth.sign('0x'+hash, address2);
        channel.balance2 = +_balance2;
        channel.signature2 = sig;
        channel.status = "Active";
        channelStore[channelId]=channel;
        console.log(channel)
        const isDone = await tokenInstance.createChannel(web3.utils.asciiToHex(channelId), dataSha, channel.address1, channel.address2, channel.signature1, channel.signature2);
        return isDone; 
    }else{
        throw "Counterparty Address mismatch"
    }
           
}

async function proposeTransfer(channelId, address1, amount){
    let channel = channelStore[channelId];
    channel.seqNum+=1;
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    let txHash = web3.utils.sha3(txdata);
    const hash = toHex(txdata);
    const sig = await web3.eth.sign('0x'+hash, address1);
    if(channel.address1==address1){
        _balance1 = channel.balance1;
        address2 = channel.address2;
        channel.signature1 = sig;
    }else if(channel.address1==address2){
        _balance1 = channel.balance2;
        address2 = channel.address1;
        channel.signature2 = sig;
    }
    if(_balance1-amount<0){
        throw 'Insufficient funds';
    }
    
    txStore[txHash]={
        txHash: txHash,
        channelId: channelId,
        debit: address1,
        credit: address2,
        amount: +amount,
        debitedSig: sig,
        creditedSig: "",
        status: "Pending"
    }
    channelStore[channelId]=channel;
    return txHash;
}

async function acceptTransfer(txHash, channelId, address2, tokenInstance){
    let channel = channelStore[channelId];
    let tx = txStore[txHash];
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    const txdataEdited = "\x19Ethereum Signed Message:\n"+txdata.length+txdata;
    const txdataSha = web3.utils.sha3(txdataEdited);
    const verify = await tokenInstance.sigVerify.call(txdataSha, tx.debitedSig, tx.debit);
    if(verify){
        const hash = toHex(txdata);
        const sig = await web3.eth.sign('0x'+hash, address2);
        
        if(channel.address1===address2){
            channel.balance1+=tx.amount;
            channel.balance2-=+tx.amount;
            tx.creditedSig = sig;
            channel.signature1 = sig;
            tx.status = "Confirmed";
            txStore[txHash]=tx;
            channelStore[channelId]=channel;
        }else if(channel.address2===address2){
            channel.balance2+=+tx.amount;
            channel.balance1-=tx.amount;
            tx.creditedSig = sig;
            channel.signature2 = sig;
            tx.status = "Confirmed";
            txStore[txHash]=tx;
            channelStore[channelId]=channel;
        }else{
            throw "Counterparty Address mismatch"
        }
    
    }else{
        throw "Invalid Counterparty signature"
    }
    return true;
}

async function proposeCloseChannel(channelId, address1){
    let channel = channelStore[channelId];
    channel.seqNum+=1;
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    const hash = toHex(txdata);
    const sig = await web3.eth.sign('0x'+hash, address1);
    if(channel.address1===address1){
        channel.signature1 = sig;
    }else if(channel.address2===address1){
        channel.signature2 = sig;
    }else{
        throw "Address mismatch"
    }
    channel.status="Closing"
    channelStore[channelId]=channel;
    return true;
}

async function acceptCloseChannel(channelId, address2, tokenInstance){
    let channel = channelStore[channelId];
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    const dataEdited = "\x19Ethereum Signed Message:\n"+txdata.length+txdata;
    const dataSha = web3.utils.sha3(dataEdited);
    const hash = toHex(txdata);
    const sig = await web3.eth.sign('0x'+hash, address2);
    if(channel.address2 === address2){
        channel.signature2 = sig;
    }else if(channel.address1===address2){
        channel.signature1 = sig;
    }

    const isDone = await tokenInstance.closeChannel(web3.utils.asciiToHex(channelId), dataSha, channel.signature1, channel.signature2, channel.balance1, channel.balance2);
    channel.status="Closed"
    channelStore[channelId]=channel;
    return isDone;
    
}

async function proposeUpdateChannel(channelId, address1){
    let channel = channelStore[channelId];
    channel.seqNum+=1;
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    const hash = toHex(txdata);
    const sig = await web3.eth.sign('0x'+hash, address1);
    if(channel.address1===address1){
        channel.signature1 = sig;
    }else if(channel.address2===address1){
        channel.signature2 = sig;
    }else{
        throw "Address mismatch"
    }
    channelStore[channelId]=channel;
    return true;
}

async function acceptUpdateChannel(channelId, address2, tokenInstance){
    let channel = channelStore[channelId];
    let txdata = channel.seqNum+channelId+channel.address1+channel.address2;
    const dataEdited = "\x19Ethereum Signed Message:\n"+txdata.length+txdata;
    const dataSha = web3.utils.sha3(dataEdited);
    const hash = toHex(txdata);
    const sig = await web3.eth.sign('0x'+hash, address2);
    if(channel.address2 === address2){
        channel.signature2 = sig;
    }else if(channel.address1===address2){
        channel.signature1 = sig;
    }

    const isDone = await tokenInstance.updateChannelAndBalances(web3.utils.asciiToHex(channelId), dataSha, channel.signature1, channel.signature2, channel.balance1, channel.balance2);

    return isDone;
}

