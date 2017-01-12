var AWS = require("aws-sdk");
var kms = new AWS.KMS();
var dynamodb = new AWS.DynamoDB();

const logLevels = {error: 4, warn: 3, info: 2, verbose: 1, debug: 0};

// get the current log level from the current environment if set, else set to info
const currLogLevel = process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : 'info';

// print the log statement, only if the requested log level is greater than the current log level
function log(logLevel, statement) {
    if(logLevels[logLevel] >= logLevels[currLogLevel] ) {
        console.log(statement);
    }
}

function encrypt(context){
        var generateDataKeyParams = {
        KeyId: process.env.KMS_KEY_ID,       //Customer Master Key alias
        EncryptionContext: {
            samlprovider: process.env.ENC_CONTEXT,                    //Extra encryption context
        },
        KeySpec: 'AES_256'
    };
    
    kms.generateDataKey(generateDataKeyParams, function(err, data) {
        if (err) console.log(err, err.stack); 
        else {
            var ctBlob = data.CiphertextBlob;
            log('debug', 'CiphertextBlob from KMS: ' + ctBlob);
            var ctBlobB64 = new Buffer(ctBlob).toString('base64');
            log('debug', 'CipherTextBlob as Base64: ' + ctBlobB64);
            storeCiphertextKey(ctBlobB64, context);
        }
    });
}

function storeCiphertextKey(ctKey, callback){
    
    var randHash = process.env.RAND_HASH;
    
    var params = {
        Item :{
            identityhash : {
                S : randHash
            },
            ciphertextKey : {
                S: ctKey
            }
        },
        TableName: process.env.SESSION_DDB_TABLE
    };
    
    dynamodb.putItem(params, function(err, data) {
      if (err) {
          log('error', err +'\n' + err.stack);
          callback(err, null);
          
      } else{
          log('debug', data);
          callback(null, ctKey);
      }
    });
}

exports.handler = (event, context, callback) => {
    encrypt(callback);
};
