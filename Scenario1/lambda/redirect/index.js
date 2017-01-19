/*
Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/asl/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. 
See the License for the specific language governing permissions and limitations under the License. 
*/

console.log('Loading SAML Redirect');

const logLevels = {error: 4, warn: 3, info: 2, verbose: 1, debug: 0};

// get the current log level from the current environment if set, else set to info
const currLogLevel = process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : 'info';

// print the log statement, only if the requested log level is greater than the current log level
function log(logLevel, statement) {
    if(logLevels[logLevel] >= logLevels[currLogLevel] ) {
        console.log(statement);
    }
}

exports.handler = function(event, context, callback) {
    log('debug', event.formparams);
    log('debug', JSON.stringify(decodeURI(event.formparams)));
    var redirectURL = process.env.REDIRECT_URL;
    callback(null, {
    location :  redirectURL + '?SAMLResponse=' + event.formparams.replace('SAMLResponse=','')
    });
};