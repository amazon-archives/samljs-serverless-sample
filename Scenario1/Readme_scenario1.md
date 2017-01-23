# Scenario 1

Overview
-

Installation
-

1. Open `./templates/saml1-api-template.yaml`
- Search and replace **YOURACCOUNTID** with your AWS Account Number
- Search and replace **AWS_REGION** with the region code (**ensure this is lowercase**, e.g. us-east-1)
- Save the file as **saml1-api.yaml**

2. Upload **templates/saml1-api.yaml** to an s3 deployment bucket in the same region
```
$cd ./templates
$aws s3 cp saml1-api.yaml s3://YOUR_DEPLOYMENT_BUCKET/saml1-api.yaml
```
3. Build and upload **redirect.zip** to s3 deployment bucket from **./lambda/redirect**
```
$cd ../lambda/redirect
$zip -r redirect.zip .
$aws s3 cp redirect.zip s3://YOUR_DEPLOYMENT_BUCKET/redirect.zip
```
4. Open **templates/saml1-stack-sam.yaml**
- Search and replace **YOUR_S3_BUCKET** with the name of s3 deployment bucket from steps above (**YOUR_DEPLOYMENT_BUCKET**)
- Save the file

5. Run the following command to create change set (note: replace **NEW_BUCKET_NAME** in AWS cli command below with a unique bucket name, in lower case, that your static website will be hosted)
```
$cd ../../templates
$aws cloudformation create-change-set --stack-name samlscenario1 --change-set-name initial --template-body file://saml1-stack-sam.yaml --parameters ParameterKey=WebsiteBucketName,ParameterValue=NEW_BUCKET_NAME --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --change-set-type CREATE
```
6. After the above command completes run the following command:
```
$aws cloudformation execute-change-set --stack-name samlscenario1 --change-set-name initial
```
7. Download the minified version of the AWS JavaScript SDK for the browser to the **./website** folder. You can find this minified SDK **aws-sdk.min.js** from https://aws.amazon.com/sdk-for-browser/.

8. After the CloudFormation stack finishes (**Status: CREATE_COMPLETE**) go to the website folder and copy up the **index, error, config and SDK** files for the website to the newly created static website S3 bucket (Called **WebsiteBucket** in the CloudFormation output) - NOTE: You will first need to **edit the configs.js** file:
 - AWS Region and Cognito Identity Pool ID
 - Your ADFS IDP URL (can use localhost if testing on the server)
 - ADFS Identity Provider ARN that you created in the IAM Console during Federation
 - The role to select & Relaying Party ID. If using the sample blog these shouldn’t change.
```
$cd ../website
$aws s3 cp --recursive . s3://WebsiteBucket
```
9.  Generate a JavaScript SDK from API Gateway for your website to use. You can do this from the API Gateway console on the ‘dev’ stage or using the CLI with the below command. The **REST_API_ID** below needs to be replaced and can be found in **RestApiId** output of stack in CloudFormation console:
```
$aws apigateway get-sdk --rest-api-id REST_API_ID --stage-name dev --sdk-type javascript samlApi.zip
```
10. Unzip the SDK and copy to the S3 bucket hosting your Serverless website:
```
$unzip samlApi.zip
$cd ./apiGateway-js-sdk
$aws s3 cp --recursive . s3://WebsiteBucket
```
11. In the **ADFS console** open the Relaying Party Trust and click the **Endpoints** tab. Update the POST Binding URL with the **ApiUrl**, the API Gateway stage Invocation URL that can be found in the CloudFormation output or the API Gateway console for the dev stage. The format should be https://xxxxx-region.amazonaws.com/dev/saml.

12. Go to the IAM console, click Roles and open **ADFS-Dev**. Attach the policy that looks like **samlscenario1-MockInvokePolicy-XXXX** where “XXXX” is a dynamically generated string.

13. Ensure that the **Trust Policy** for the ADFS-Dev Role matches the below (**YOURCOGNITOPOOLID** is your Cognito Identity Pool ID).
```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "YOURCOGNITOPOOLID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
```
14. Navigate to the website URL for the static S3 website and test the functionality from a browser that has access to your ADFS IdP. The website URL is listed as **WebsiteURL** in the CloudFormation output.

