/*
Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/asl/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. 
See the License for the specific language governing permissions and limitations under the License. 
*/

var AWS = require('aws-sdk');
var cognitoidentity = new AWS.CognitoIdentity();
var dynamodb = new AWS.DynamoDB();
var dynamoDocClient = new AWS.DynamoDB.DocumentClient();
var kms = new AWS.KMS();
var libxmljs = require('libxmljs');
var nJwt = require('njwt');
var sts = new AWS.STS();

const logLevels = {error: 4, warn: 3, info: 2, verbose: 1, debug: 0};

// get the current log level from the current environment if set, else set to info
const currLogLevel = process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : 'debug';

// print the log statement, only if the requested log level is greater than the current log level
function log(logLevel, statement) {
    if(logLevels[logLevel] >= logLevels[currLogLevel] ) {
        console.log(statement);
    }
}

/*Set below values for your AWS account and */
const selectedRole = 'Prod';                                                                     //Assumed role will match this text
const usersTableDDB = process.env.USER_DDB_TABLE;                                                               //User table for access post auth 
const sessionTableDDB = process.env.SESSION_DDB_TABLE;                                                             //DynamoDB table for temporary credential storage during session setup
const redirectURL = process.env.REDIRECT_URL;        //Client application page that will use credentials to redirect after auth

/*Setup plainTextKey from KMS for JWT signing outside handler*/
var plainTextKey;
var initAttempted = false;

function init(callback, resolve) {
    var params = {
        Key: {
            identityhash: {
                S: process.env.ID_HASH
            }
        },
        TableName: sessionTableDDB
    }
    dynamodb.getItem(params, function (err, data) {
        if (err) {
            log('debug',err);
            callback(err);
        } else {
            log('debug',data.Item.ciphertextKey['S']);
            decrypt(data.Item.ciphertextKey['S'], function (data) {
                plainTextKey = data;                                    //Do not log
                initAttempted = true;
                resolve();
            });
        }
    });
}

function decrypt(cipherTextKey, callback){
    var decryptParams = {
        CiphertextBlob: new Buffer(cipherTextKey, 'base64'),
        EncryptionContext: {
            samlprovider: process.env.ENC_CONTEXT,                    //Extra encryption context
        }
    }
    
    kms.decrypt(decryptParams, function(err,data){
        if(err) log('debug',err);
        else {
            plainTextKey = new Buffer(data.Plaintext).toString('base64');
            callback(plainTextKey);
        }
    });
}

/*Main Lambda function logic below*/

function getCredentials(samlResponse, relayState, userId, role, context){
    var CognitoID = relayState.split('##')[0];
    var clientRandomCode = relayState.split('##')[1];

    var params = {
        PrincipalArn: process.env.PRINCIPAL_ARN,
        RoleArn: role,
        SAMLAssertion: samlResponse
    };
    log('debug',params);
    sts.assumeRoleWithSAML(params, function (err, data) {
        if (err) log('debug',err, err.stack);
        else {
            writeToDDB(CognitoID, data, userId, clientRandomCode, context);
        }
    });
}

function createJWT(identityId, username, clientRandomCode){

    var key = plainTextKey;        //Key pulled from KMS when Lambda starts

    var claims = {
        id: identityId,
        username: username,
        code: clientRandomCode
    }

    var jwt = nJwt.create(claims,key);
    jwt.setExpiration(new Date().getTime() + (30000));      //30 second expiration

    return jwt.compact();
}

function writeToDDB(identityHash, credentials, userId, clientRandomCode, context){

    var users = {};
    users.CognitoID = identityHash;
    users.name = userId;
    users.lastauth = new Date().getTime();
    dynamoDocClient.put({
        TableName: usersTableDDB,
        Item: users
    }, function(err,data){
        if(err) {
            log('debug', err);
            context.fail(err);
        }   else{
            log('debug','Users table updated with ' + users);
            writeSessionToDDB(identityHash, credentials, userId, clientRandomCode, context);
        }
    });
}

function writeSessionToDDB(identityHash, credentials, userId, clientRandomCode, context) {
    var sessions = {};
    sessions.identityhash = identityHash;
    sessions.credentials = credentials;
    sessions.code = clientRandomCode;

    dynamoDocClient.put({
        TableName: sessionTableDDB,
        Item: sessions
    }, function(err, data) {
        if (err) {
            log('debug',err)
            context.fail(err);
        } else {
            log('debug','Credentials written to DDB. Redirecting client');
            var JWT = createJWT(identityHash, userId, clientRandomCode);
            log('debug',JWT);
            context.succeed({
                location : redirectURL + '?jwt=' + JWT
            });
        }
    });

}

function mainHandler(event, context, callback) {
    if(plainTextKey == null) {
        callback('Handler Init failed. Aborting', null);
        return;
    }

    log('debug','Running index.js');
    log('debug',event.formparams);

    var arr = event.formparams.split("&RelayState=");
    var samlResponse = unescape(arr[0].replace('SAMLResponse=',''));
    var relayState = unescape(arr[1]);
    
    log('debug','SAMLResponse:');
    log('debug',samlResponse);
    log('debug','RelayState:');
    log('debug',relayState);

    var samlResponseDecoded = new Buffer(samlResponse, 'base64').toString("ascii");

    var xmlDoc = libxmljs.parseXmlString(samlResponseDecoded);
    var roleNode = xmlDoc.get('/samlp:Response/saml:Assertion/saml:AttributeStatement/saml:Attribute[@Name="https://aws.amazon.com/SAML/Attributes/Role"]', {
        'samlp':'urn:oasis:names:tc:SAML:2.0:protocol',
        'saml' : 'urn:oasis:names:tc:SAML:2.0:assertion'
        });

    var roleToAssume;

    var children = roleNode.childNodes();
    for (var i=0;i<children.length; i++){
        log('debug',children[i].text().split(',')[1]);
        if (children[i].text().split(',')[1].indexOf(selectedRole) !== -1){
            roleToAssume = children[i].text().split(',')[1];
        }
    }
    log('debug','Role selection is ' + roleToAssume);

    var nameIdNode = xmlDoc.get('/samlp:Response/saml:Assertion/saml:Subject/saml:NameID', {
        'samlp':'urn:oasis:names:tc:SAML:2.0:protocol',
        'saml' : 'urn:oasis:names:tc:SAML:2.0:assertion'
    });

    var userId = nameIdNode.text();
    log('debug','User is: ' + userId);
    
    getCredentials(samlResponse, relayState, userId, roleToAssume, context);

}

exports.handler = (event, context, callback) => {
    if (initAttempted){
        mainHandler(event,context, callback);
    }else {
        init(callback, function(){
            mainHandler(event,context, callback);
        });
    }
};

