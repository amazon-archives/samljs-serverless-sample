NOTE: If cloning to an EC2 server with Amazon Linux you can run through all the steps. If running locally you will need to skip ‘npm install’ in step #4 below and run that separately on EC2 to compile the libxml binaries. After that you will update the Lambda function outlined in the instructions at the end of the below steps.

1. open ./templates/saml2-api-template.yaml
	- Search and replace YOURACCOUNTID->AWS Account Number
	- Search and replace AWS_REGION -> region code (lowercase, e.g. us-east-1)
	- save to saml2-api.yaml

2. Upload templates/saml2-api.yaml to an s3 deployment bucket in the same region
$cd ./templates
$aws s3 cp saml2-api.yaml s3://YOUR_DEPLOYMENT_BUCKET/saml2-api.yaml

3. Build and upload generateKey.zip to s3 deployment bucket from ./lambda/GenerateKey
$cd ../lambda/GenerateKey
$zip -r generateKey.zip .
$aws s3 cp generateKey.zip s3://YOUR_DEPLOYMENT_BUCKET/generateKey.zip

4. upload saml.zip to s3 deployment bucket from ./lambda/ProcessSAML
***IF RUNNING THROUGH THESE STEPS ON AMAZON LINUX EC2 SERVER RUN THE NPM INSTALL COMMAND OTHERWISE DO NOT RUN NPM INSTALL ON YOUR WORKSTATION DO IT LATER. SEE INSTRUCTIONS AT THE END FOR RUNNING ON EC2 WITH AWS CLI UPDATE-LAMBDA-FUNCTION COMMAND***
$cd ../ProcessSAML
$npm install
$zip -r saml.zip .
$aws s3 cp saml.zip s3://YOUR_DEPLOYMENT_BUCKET/saml.zip

5. upload custom_auth.zip to s3 deployment bucket from ./lambda/CustomAuth
$cd ../CustomAuth
$npm install
$zip -r custom_auth.zip .
$aws s3 cp custom_auth.zip s3://YOUR_DEPLOYMENT_BUCKET/custom_auth.zip

6. open templates/saml2-stack-sam.yaml
	- Search and replace YOUR_S3_BUCKET -> name of s3 deployment bucket from steps above (YOUR_DEPLOYMENT_BUCKET)
	- save

7. Run the following command to create change set AFTER updating the following:
	- Replace NEW_BUCKET_NAME with unique bucket name, in lower case, that your static website will be hosted
	- Replace IDP_ARN with the Arn for the ADFS Identity Provider you created in the AWS IAM console
	- Replace KMS_KEY_ID with the Id for the KMS Key that you created in the IAM Console. This is the unique identifier at the end of the ARN for the KMS Key in the console.

$cd ../../templates
$aws cloudformation create-change-set --stack-name samlscenario2 --change-set-name initial --template-body file://saml2-stack-sam.yaml --parameters ParameterKey=AdfsArn,ParameterValue=IDP_ARN ParameterKey=saml2Key,ParameterValue=KMS_KEY_ID ParameterKey=WebsiteBucketName,ParameterValue=NEW_BUCKET_NAME ParameterKey=IdHash,ParameterValue=us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --change-set-type CREATE

8. After the above command completes run the following command:
$aws cloudformation execute-change-set --stack-name samlscenario2 --change-set-name initial

9. After the CloudFormation Stack is successfully built (Status: CREATE_COMPLETE) create a new KMS data encryption key and store in DynamoDB: 
$aws lambda invoke --function-name GenerateKey_awslabs_samldemo generateKey.out

10. Download the minified version of the AWS JavaScript SDK for the browser to the ./website folder. You can find this file (aws-sdk.min.js) from https://aws.amazon.com/sdk-for-browser/.

11. After the CloudFormation stack finishes (Status: CREATE_COMPLETE) go to the website folder and copy up the index, error, config and SDK files for the website to the newly created static website S3 bucket (Called WebsiteBucket in the CloudFormation output) - NOTE: You will first need to edit the configs.js file:
- AWS Region and Cognito Identity Pool ID
- Your ADFS IDP URL (can use localhost if testing on the server)
- Relaying Party ID. If using the sample blog this shouldn’t change.
$cd ../website
$aws s3 cp --recursive . s3://WebsiteBucket 


12.  Generate a JavaScript SDK from API Gateway for your website to use. You can do this from the API Gateway console on the ‘dev’ stage or using the CLI with the below command. The REST_API_ID below needs to be replaced and can be found in RestApiId output of stack in CloudFormation console:

$aws apigateway get-sdk --rest-api-id REST_API_ID --stage-name dev --sdk-type javascript samlApi.zip

13. Unzip the SDK and copy to the S3 bucket hosting your Serverless website
$unzip samlApi.zip
$cd ./apiGateway-js-sdk
$aws s3 cp --recursive . s3://WebsiteBucket

14. In the ADFS console open the Relaying Party Trust and click the Endpoints tab. Update the POST Binding URL with the ApiUrl is the API Gateway stage Invocation URL that can be found in the CloudFormation output or the API Gateway console for the dev stage. The format should be https://xxxxx-region.amazonaws.com/dev/saml.

15. Go to the IAM console, click Roles and open ADFS-Production. Attach the policy that looks like samlscenario2-MockInvokePolicy-XXXX where “XXXX” is a dynamically generated string.

16. Ensure that the Trust Policy for the ADFS-Production Role matches the below (YOURACCOUNTID is your AWS Account Number).

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOURACCOUNTID:saml-provider/ADFS"
      },
      "Action": "sts:AssumeRoleWithSAML"
    }
  ]
}

17. Navigate to the website URL for the static S3 website and test the functionality from a browser that has access to your ADFS IdP. The website URL is listed as WebsiteURL in the CloudFormation output.

***EXTRA STEPS IF NOT RUNNING THE ABOVE ON AMAZON LINUX EC2 SERVER***
Locate the SSH keys for your EC2 instance running Amazon Linux and use SCP to copy the ProcessSAML code and NPM package.json definition to the server (replace PATH_TO_SSH_KEYS/key.pem and EC2 DNS as appropriate):

$cd ../../lambda/ProcessSAML
$scp -i ~/..PATH_TO_SSH_KEYS/key.pem ./ProcessSAML.js ec2-user@ec2-XX-XXX-XXX-X.compute-X.amazonaws.com:/home/ec2-user/ProcessSAML.js
$scp -i ~/..PATH_TO_SSH_KEYS/key.pem ./package.json ec2-user@ec2-XX-XXX-XXX-X.compute-X.amazonaws.com:/home/ec2-user/package.json

Now SSH to the server, build the package, zip the contents and update the Lambda function in your AWS account:
$ssh -i ~/..PATH_TO_SSH_KEYS/key.pem ec2-user@ec2-XX-XXX-XXX-X.compute-X.amazonaws.com
$npm install
$zip -r saml.zip .
$aws lambda update-function-code --function-name ProcessSAML_awslabs_samldemo --zip-file fileb://saml.zip






