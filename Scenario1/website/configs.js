/*Client Webpage Configuration
You will need to have created a Cognito Identity Pool and enabled
SAML support in that pool with an IdP created in the AWS IAM console
using your ADFS metadata document before populating these configurations*/
var configs = {
    'region' : 'us-east-1',
    'identityPool': 'us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
    'adfsUrl': 'https://localhost/adfs/ls/IdpInitiatedSignOn.aspx',
    'samlIdpArn': 'arn:aws:iam::ACCOUNTNUMBER:saml-provider/ADFS',
    'roleSelectedArn' : 'arn:aws:iam::ACCOUNTNUMBER:role/ADFS-Dev',
    'relayingPartyId': 'urn:amazon:webservices' //Should not need to change if you followed the ADFS setup blog
}