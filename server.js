var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var Wallet = require('ethereumjs-wallet');
var connect = require('connect');
var sassMiddleware = require('node-sass-middleware');
var app = express();
var Web3 = require('web3');
var multiSigContract = require('./MultiSig.json');
var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/walletDatabase";
var userInfo;
var contractInstance;
var accountCreated;

// rpc start
// geth --rpcapi eth,web3,personal --rpc
// mongo walletDatabase --eval "db.dropDatabase()"
if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  // set the provider you want from Web3.providers
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
}

var getUserFromPrivateKey = function(privateKey, callback) {
  if (privateKey.substring(0,2) == '0x') {
    privateKey = privateKey.slice(2);
  }
  var privateKey = new Buffer(privateKey, 'hex');
  try {
    var wallet = Wallet.fromPrivateKey(privateKey);
    privateKey = wallet.getPrivateKeyString(privateKey);
    user = {privateKey: privateKey, address: wallet.getAddressString()};
    // var user = web3.eth.accounts.privateKeyToAccount(privateKey);
    callback(user);
  }
  catch (e) {
    callback(false);
  }
}

// web3 version 1.0.0 -beta
// var deployContract = function(user) {
//   try {

//     var myContract = new web3.eth.Contract(multiSigContract[0].abi, {
//       from: user.address, 
//       data: multiSigContract[0].unlinked_binary,
//       gas: '1000000',
//       gasPrice: '200'
//     });
//     var instance = myContract.deploy();
//     var contractInfo = instance.send();
//     return contractInfo;
//   }
//   catch (e) {
//     console.log("e:", e);
//     return false;
//   }
// }

// var unlockAccount = function(user) {
//   web3.personal.unlockAccount(user.address, user.)
// }

var deployContract = function(user, callback) {
  let abi = multiSigContract[0].abi;
  let bytecode = multiSigContract[0].unlinked_binary;
  let gasEstimate = web3.eth.estimateGas({data: bytecode});
  let newContract = web3.eth.contract(abi);

  newContract.new({
    from: user.address, 
    data: bytecode, 
    gas: gasEstimate
  }, function(err, retContract) {
    // Callback fires twice
    if(!err) {
      if (!retContract.transactionHash && !retContract.address) {
        callback(false);
      }
      if(retContract.address) {
        callback(retContract);
      }
    }
    else {
      // could not unlocked signer account
      console.log(err);
    }
  })
}

var createUser = function(user, callback) {
  deployContract(user, function(newContract) {
    if (newContract) {
      MongoClient.connect(url, function(err, db) {
        var obj = {userAddress: user.address, contractAddress: newContract.address, setTrustees: false};
        db.collection("users").insertOne(obj);
        db.close();
        callback(newContract);
      })
    } else {
      callback(false);
    }
  });
}


var login = function(user, callback) {
  return MongoClient.connect(url, function(err, db) {
    var query = {userAddress: user.address};
    db.collection("users").findOne(query).then(function(result) {
      if (result) {
        var getContract = 
        web3.eth.contract(multiSigContract[0].abi).at(result.contractAddress);
        console.log("logged in");
        callback(getContract, false);
      } else {
        createUser(user, function(newContract) {
          if (newContract) {
            console.log("account created");
            accountCreated = true;
            callback(newContract);
          } else {
            callback(false);
          }
        })
        return 0
      }
    })
  });
}

var getBalance = function(contract) {
  let balance = web3.eth.getBalance(contract.address);
  return (balance);
}

var setTrustees = function(trusteeOne, trusteeTwo) {

}
app.use(function(req, res, next) {
  console.log('Logging...');
  next();
});

//Sass Middleware
app.use(sassMiddleware({
  src: '/stylesheets',
  force: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for bodyParser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

// View Engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.get('/', function(req, res) {
  res.render('index');
});

// Login
app.post('/', function(req, res) {
  contractInstance = null;
  userInfo = null;
  accountCreated = false;
  getUserFromPrivateKey(req.body.privateKey, function(user) {
    if (user) {
      login(user, function(getContract) {
        if (getContract) {
          contractInstance = getContract;
          userInfo = user;
          res.redirect('/login');
        } else {
          res.render('index', {error: 2});
        }
      })
    } else {
      console.log("wrong key");
      res.render('index', {error: 1});
    }
  });
})

app.get('/setTrustees', function(req, res) {
  if (!contractInstance || !userInfo) {
    res.redirect('/');
  }
  res.render('setTrustees', {accountCreated: accountCreated});
});

// app.post('/setTrustees', function(req, res) {

// });

app.get('/login', function(req, res) {
  if (!contractInstance || !userInfo) {
    res.redirect('/');
  }
  else {
    let contractBalance = getBalance(contractInstance);
    let accountBalance = getBalance(userInfo);
    if (accountCreated) {
      res.redirect('setTrustees');
    } else {
      accountBalance = 'user logged in';
    }
    return res.render('login', {
      address: userInfo.address, 
      accountBalance: accountBalance, 
      contractBalance: contractBalance
    });
  }
});

app.post('/login', function(req, res) {

});
  //     console.log("Logged in!");
  //   } else {
  //     createUser(user);
  //     console.log("Account Created!");
  //   }
  //   res.render('index');
  // } else {
  //   res.render('index', {error: 1});
  // }    
//   }
// }

app.listen(3000, function() {
  console.log('Server started on port 3000');
})